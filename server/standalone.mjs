import http from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFile,stat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {openStorage} from './storage.mjs';
import {createSessions} from './session.mjs';
const nativeFetch=globalThis.fetch.bind(globalThis),requestContext=new AsyncLocalStorage();
const defaults={bodyBytes:26000000,requests:4,aiSessionDaily:20,aiGlobalDaily:100,aiConcurrent:2,sessionDaily:200};
class HttpError extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}
function count(value,fallback,name,maximum=100000000){const result=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(result)||result<0||result>maximum)throw new Error('Invalid limit: '+name);return result;}
function publicAddress(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('PUBLIC_ORIGIN must be an exact HTTPS origin');return url.origin;}
function endpoint(value,suffix=''){try{const url=new URL(String(value||'').replace(/\/$/,'')+suffix);return url.origin+url.pathname;}catch{return null;}}
function aiEndpoints(settings){
  const values=[endpoint(settings.AZURE_AGENT_ENDPOINT),endpoint(settings.LLM_BASE_URL,'/chat/completions'),endpoint(settings.SPEECH_API_URL),endpoint(settings.LOCAL_SPEECH_URL)];
  const utility=endpoint(settings.LLM_BASE_URL);if(utility&&new URL(utility).hostname==='api.proxyapi.ru')values.push('https://api.proxyapi.ru/v1/audio/transcriptions');
  values.push(endpoint(settings.MEMORY_URL,'/answer'));
  values.push(endpoint(settings.TRAINING_URL,'/jobs'));return new Set(values.filter(Boolean));
}
async function guardedFetch(input,options){
  const context=requestContext.getStore();if(!context)return nativeFetch(input,options);
  if(!context.endpoints.has(endpoint(input instanceof Request?input.url:input)))return context.transport(input,options);
  return context.policy.upstream(context,input,options);
}
async function quotaPolicy(DB,limits,now){
  await DB.prepare('CREATE TABLE IF NOT EXISTS standalone_usage (day TEXT NOT NULL, scope TEXT NOT NULL, requests INTEGER NOT NULL CHECK(requests>=0), cap INTEGER NOT NULL CHECK(cap>=0), PRIMARY KEY(day,scope), CONSTRAINT standalone_usage_cap CHECK(requests<=cap))').bind().run();
  let active=0;
  async function reserve(entries){
    const day=new Date(now()).toISOString().slice(0,10);
    const statements=entries.map(([scope,cap])=>DB.prepare('INSERT INTO standalone_usage (day,scope,requests,cap) VALUES (?,?,1,?) ON CONFLICT(day,scope) DO UPDATE SET requests=requests+1,cap=excluded.cap').bind(day,scope,cap));
    try{await DB.batch(statements);}catch(error){if(String(error.message).includes('standalone_usage_cap'))throw new HttpError('ai_daily_limit',429);throw error;}
  }
  return {
    async session(){try{await reserve([['sessions',limits.sessionDaily]]);}catch(error){if(error.code==='ai_daily_limit')throw new HttpError('session_daily_limit',429);throw error;}},
    async upstream(context,input,options){
      if(active>=limits.aiConcurrent){context.blocked='concurrent';throw new HttpError('ai_concurrency_limit',429);}
      active++;
      try{
        try{await reserve([['ai:global',limits.aiGlobalDaily],['ai:'+context.owner,limits.aiSessionDaily]]);}catch(error){if(error.code==='ai_daily_limit')context.blocked='daily';throw error;}
        const response=await context.transport(input,options);
        if(!response.body)return response;
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>1048576){await reader.cancel();throw new HttpError('upstream_response_too_large',503);}chunks.push(item.value);}}finally{reader.releaseLock();}
        const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
        return new Response(Buffer.concat(chunks,size),{status:response.status,statusText:response.statusText,headers});
      }finally{active--;}
    }
  };
}
function headersFor(request,owner){
  const headers=new Headers();
  for(const [name,value]of Object.entries(request.headers)){
    if(value===undefined||name.startsWith('oai-')||name.startsWith('x-forwarded-')||name.startsWith('proxy-')||['forwarded','x-real-ip','host','cookie','authorization','api-key','x-api-key','connection','keep-alive','transfer-encoding','upgrade','te','trailer'].includes(name))continue;
    headers.set(name,Array.isArray(value)?value.join(', '):value);
  }
  headers.set('oai-authenticated-user-id',owner);return headers;
}
async function bodyBytes(request,limit){
  if(Number(request.headers['content-length']||0)>limit)throw new HttpError('payload_too_large',413);
  return new Promise((resolveBody,reject)=>{
    const chunks=[];let length=0;
    const clean=()=>{request.off('data',data);request.off('end',end);request.off('error',error);request.off('aborted',aborted);};
    const error=reason=>{clean();reject(reason);},aborted=()=>error(new HttpError('request_aborted',400));
    function data(chunk){length+=chunk.length;if(length>limit){request.pause();error(new HttpError('payload_too_large',413));}else chunks.push(chunk);}
    function end(){clean();resolveBody(Buffer.concat(chunks,length));}
    request.on('data',data);request.once('end',end);request.once('error',error);request.once('aborted',aborted);
  });
}
function json(response,status,body,extra={}){
  if(response.destroyed||response.headersSent)return;
  response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff',...extra});response.end(JSON.stringify(body));
}
async function writeResponse(response,result,method,blocked){
  response.statusCode=result.status;
  for(const [name,value]of result.headers)if(!['set-cookie','connection','transfer-encoding','keep-alive'].includes(name))response.setHeader(name,value);
  response.setHeader('cache-control','private, no-store');response.setHeader('cdn-cache-control','no-store');response.setHeader('x-content-type-options','nosniff');
  if(blocked)response.setHeader('x-mission-ai-limit',blocked);
  if(method==='HEAD'||!result.body){await result.body?.cancel();response.end();return;}
  await pipeline(Readable.fromWeb(result.body),response);
}
export async function createServer({worker,storage,publicOrigin,sessionSecret,settings={},limits:input={},now=Date.now,upstreamFetch=nativeFetch}){
  if(!worker||typeof worker.fetch!=='function'||!storage?.DB||!storage?.PHOTOS)throw new Error('Worker and storage are required');
  if(Object.hasOwn(settings,'LOCAL_PREVIEW'))throw new Error('LOCAL_PREVIEW is forbidden in standalone mode');
  const origin=publicAddress(publicOrigin),host=new URL(origin).host,sessions=createSessions({secret:sessionSecret,now});
  const limits=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,count(input[key],value,key)]));
  if(limits.bodyBytes<1||limits.requests<1)throw new Error('Request capacity must be positive');
  const policy=await quotaPolicy(storage.DB,limits,now),endpoints=aiEndpoints(settings),background=new Set();let requests=0,draining=false;
  const environment={...settings,DB:storage.DB,PHOTOS:storage.PHOTOS};globalThis.fetch=guardedFetch;
  function waitUntil(value){const promise=Promise.resolve(value).catch(error=>console.warn('Background task unavailable:',error?.name||'Error')).finally(()=>background.delete(promise));background.add(promise);}
  const server=http.createServer({maxHeaderSize:16384},(request,response)=>{
    void (async()=>{
      if(request.url==='/_health'&&request.method==='GET'){json(response,draining?503:200,{ready:!draining});return;}
      if(draining)throw new HttpError('server_draining',503);
      if(requests>=limits.requests)throw new HttpError('request_capacity',429);
      requests++;
      try{
        if(typeof request.url!=='string'||!request.url.startsWith('/')||request.url.startsWith('//')||request.url.includes('\\'))throw new HttpError('invalid_path',400);
        const url=new URL(origin+request.url);
        if(request.headers.host!==host)throw new HttpError('invalid_host',403);
        if(request.headers.origin!==undefined&&request.headers.origin!==origin||request.headers['sec-fetch-site']==='cross-site')throw new HttpError('forbidden_origin',403);
        if(!['GET','HEAD'].includes(request.method)&&request.headers.origin!==origin)throw new HttpError('origin_required',403);
        if(!url.pathname.startsWith('/api/'))throw new HttpError('not_found',404);
        let owner=sessions.verify(request.headers.cookie||'');
        if(url.pathname==='/api/session'){
          if(request.method!=='GET')throw new HttpError('method_not_allowed',405);
          if(!owner){await policy.session();const issued=sessions.issue();owner=issued.owner;response.setHeader('set-cookie',issued.cookie);}
          json(response,200,{ready:true});return;
        }
        if(!owner)throw new HttpError('sign_in_required',401);
        const bytes=['GET','HEAD'].includes(request.method)?undefined:await bodyBytes(request,limits.bodyBytes);
        const context={owner,endpoints,policy,transport:upstreamFetch,blocked:null};
        const result=await requestContext.run(context,()=>worker.fetch(new Request(url,{method:request.method,headers:headersFor(request,owner),...(bytes===undefined?{}:{body:bytes})}),environment,{waitUntil}));
        if(!(result instanceof Response))throw new Error('Invalid Worker response');
        await writeResponse(response,result,request.method,context.blocked);
      }finally{requests--;}
    })().catch(error=>{
      if(!error.status)console.error('API request unavailable:',error?.name||'Error');
      const oversized=error.status===413;json(response,error.status||503,{error:error.code||'service_unavailable'},oversized?{connection:'close'}:{});
      if(oversized)response.once('finish',()=>request.destroy());
    });
  });
  server.headersTimeout=15000;server.requestTimeout=180000;server.keepAliveTimeout=5000;
  let ticking=false;const taskClock=typeof worker.scheduled==='function'?setInterval(()=>{if(draining||ticking)return;ticking=true;waitUntil(Promise.resolve().then(()=>worker.scheduled({},environment)).finally(()=>{ticking=false;}));},1000):null;taskClock?.unref();
  server.shutdown=async()=>{draining=true;if(taskClock)clearInterval(taskClock);await new Promise((resolveClose,reject)=>server.close(error=>error?reject(error):resolveClose()));await Promise.allSettled([...background]);await storage.close();};
  return server;
}
function outsideRelease(path,name){
  if(!isAbsolute(path||''))throw new Error(name+' must be an absolute private path');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),value=resolve(path);
  if(value===root||value.startsWith(root+sep))throw new Error(name+' must be outside the release directory');return value;
}
export async function startFromEnv(env=process.env){
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('Node.js 24 or newer is required');
  if(Object.hasOwn(env,'LOCAL_PREVIEW'))throw new Error('LOCAL_PREVIEW is forbidden in standalone mode');
  const dataDir=outsideRelease(env.DATA_DIR,'DATA_DIR'),secretFile=outsideRelease(env.SESSION_SECRET_FILE,'SESSION_SECRET_FILE');
  if((await stat(secretFile)).mode&0o077)throw new Error('Session secret file must be private');
  const secret=(await readFile(secretFile,'utf8')).trim(),migrationsDir=resolve(env.MIGRATIONS_DIR||new URL('../drizzle/',import.meta.url).pathname),modulePath=resolve(env.WORKER_MODULE||new URL('../dist/backend/worker.mjs',import.meta.url).pathname);
  const maxStorageBytes=count(env.MAX_OBJECT_STORAGE_BYTES,1024**3,'MAX_OBJECT_STORAGE_BYTES',1024**4);
  const worker=(await import(pathToFileURL(modulePath).href)).default,storage=await openStorage({dataDir,migrationsDir,maxStorageBytes});
  try{
    const settings=Object.fromEntries(Object.entries(env).filter(([name])=>/^(?:LLM_|AZURE_|MEMORY_|SPEECH_|LOCAL_SPEECH_|TRAINING_|AIR_GAP$)/.test(name)));
    const server=await createServer({worker,storage,publicOrigin:env.PUBLIC_ORIGIN,sessionSecret:secret,settings,limits:{bodyBytes:env.MAX_BODY_BYTES,requests:env.MAX_REQUESTS,aiSessionDaily:env.AI_SESSION_DAILY_LIMIT,aiGlobalDaily:env.AI_GLOBAL_DAILY_LIMIT,aiConcurrent:env.AI_MAX_CONCURRENT,sessionDaily:env.SESSION_DAILY_LIMIT}});
    const host=env.API_HOST||'127.0.0.1',port=count(env.API_PORT,8092,'API_PORT');if(!['127.0.0.1','::1'].includes(host)||port<1||port>65535)throw new Error('API must bind to a loopback address and valid port');
    await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(port,host,resolveListen);});return server;
  }catch(error){await storage.close();throw error;}
}
const entryPath=process.argv[1]?await realpath(resolve(process.argv[1])).catch(()=>null):null;
if(entryPath&&entryPath===await realpath(fileURLToPath(import.meta.url))){
  const server=await startFromEnv();console.log('Mission Health API is ready on loopback');
  let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{if(stopping)return;stopping=true;void server.shutdown().then(()=>process.exit(0),()=>process.exit(1));});
}
