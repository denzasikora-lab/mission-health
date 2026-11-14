import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdtemp,writeFile,rm,mkdir,copyFile,symlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createServer,startFromEnv} from '../server/standalone.mjs';
import {openStorage} from '../server/storage.mjs';
import {createSessions} from '../server/session.mjs';

const root=new URL('../',import.meta.url),publicOrigin='https://frontend.test',secret='synthetic-session-secret-with-at-least-32-bytes';
const bundleDirectory=await mkdtemp(join(tmpdir(),'mission-worker-test-'));
after(()=>rm(bundleDirectory,{recursive:true,force:true}));
const modules=['public/story-tags-core.js','worker/story-tags.js','public/skin-spots-core.js','public/apparent-age-core.js','public/appearance-core.js','public/face-session-core.js','public/actiwatch-core.js','worker/actiwatch.js','worker/activity.js','worker/scheduler.js','public/health-rules-core.js','worker/health-analysis.js','worker/personal.js','worker/photos.js','worker/stories.js','worker/local-reply.js','worker/speech.js','worker/training.js','worker/book.js','worker/compose.js','worker/media-analysis.js','worker/index.js'];
await writeFile(join(bundleDirectory,'worker.mjs'),'const assets={};\n'+(await Promise.all(modules.map(path=>readFile(new URL(path,root),'utf8')))).join('\n'));
const actualWorker=(await import(pathToFileURL(join(bundleDirectory,'worker.mjs')))).default;
async function fixture(t,options={}){
  const directory=await mkdtemp(join(tmpdir(),'mission-api-test-'));let server,storage,port;
  const calls=[],settings=options.settings||{AIR_GAP:'1'},transport=options.upstreamFetch||(async(input,init)=>{calls.push({url:String(input),init});throw new Error('Unexpected network request');});
  async function start(){storage=await openStorage({dataDir:join(directory,'data'),migrationsDir:fileURLToPath(new URL('drizzle/',root)),...options.storageLimits});server=await createServer({worker:options.worker||actualWorker,storage,publicOrigin,sessionSecret:secret,settings,limits:options.limits,upstreamFetch:transport,now:options.now});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;}
  try{await start();}catch(error){await storage?.close();await rm(directory,{recursive:true,force:true});throw error;}
  t.after(async()=>{if(server.listening)await server.shutdown();await rm(directory,{recursive:true,force:true});});
  async function run(path,{method='GET',cookie,headers={},body,chunks}={}){
    const data=body===undefined?null:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body)),outgoing={host:new URL(publicOrigin).host,...(cookie?{cookie}:{}),...(data&&!Buffer.isBuffer(body)?{'content-type':'application/json'}:{}),...headers};
    if(data&&!chunks)outgoing['content-length']=data.length;
    return new Promise((resolveResult,reject)=>{const request=http.request({hostname:'127.0.0.1',port,path,method,headers:outgoing},response=>{const values=[];response.on('data',value=>values.push(value));response.once('end',()=>{const bytes=Buffer.concat(values);resolveResult({status:response.statusCode,headers:response.headers,bytes,body:response.headers['content-type']?.includes('application/json')&&bytes.length?JSON.parse(bytes):null});});});request.once('error',reject);if(chunks)for(const chunk of chunks)request.write(chunk);else if(data)request.write(data);request.end();});
  }
  async function mint(){const result=await run('/api/session');assert.equal(result.status,200);assert.ok(result.headers['set-cookie']?.[0]);return result.headers['set-cookie'][0].split(';')[0];}
  const owner=cookie=>createSessions({secret,now:options.now}).verify(cookie);
  return {run,mint,owner,calls,get storage(){return storage;},async restart(){await server.shutdown();await start();},directory};
}
const origin={origin:publicOrigin};
function health(){const reading=(value,unit)=>({value,unit,source:'demo',observedAt:null});return {id:randomUUID(),snapshot:{profileId:'personal',capturedAt:new Date().toISOString(),readings:{heart_rate:reading(112,'bpm'),spo2:reading(94,'%'),body_temperature:reading(38.1,'C')}}};}
const azure={LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.invalid/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-key'};
const completed=()=>Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({status:'ATTENTION',alerts:['Synthetic observation'],summary:'Synthetic readings require review.'})}]}]});

test('Only session bootstrap creates a signed guest identity and incoming owner headers cannot select another visitor',async t=>{
  const f=await fixture(t);assert.deepEqual((await f.run('/_health')).body,{ready:true});const denied=await f.run('/api/me',{headers:{'oai-authenticated-user-id':'forged-owner'}});assert.equal(denied.status,401);assert.equal(denied.headers['set-cookie'],undefined);
  const a=await f.mint(),b=await f.mint();assert.notEqual(a,b);const meA=(await f.run('/api/me',{cookie:a})).body,meB=(await f.run('/api/me',{cookie:b})).body;assert.notEqual(meA.storageScope,meB.storageScope);
  const spoof=await f.run('/api/me',{cookie:a,headers:{'oai-authenticated-user-id':f.owner(b),'oai-other-id':f.owner(b),'x-forwarded-host':'attacker.test','forwarded':'host=attacker.test;proto=http'}});assert.equal(spoof.body.storageScope,meA.storageScope);
  assert.equal((await f.run('/api/me',{cookie:a+'damaged'})).status,401);assert.equal((await f.run('/api/session',{cookie:a})).headers['set-cookie'],undefined);assert.equal(f.calls.length,0);
});
test('Fixed public origins permit rewritten frontend writes while host and cross-site spoofs are rejected',async t=>{
  const f=await fixture(t),cookie=await f.mint(),body={id:randomUUID(),content:'Synthetic integration note',attachments:[]};
  for(const headers of [{},{origin:'https://attacker.test'},{origin:'null'},{...origin,host:'attacker.test','x-forwarded-host':'frontend.test'},{...origin,'sec-fetch-site':'cross-site'}])assert.equal((await f.run('/api/chat',{method:'POST',cookie,headers,body})).status,403);
  const result=await f.run('/api/chat',{method:'POST',cookie,headers:{...origin,'x-forwarded-host':'ignored.invalid'},body});assert.equal(result.status,201);assert.equal(result.body.reply,null);assert.equal(result.body.replyError,'assistant_unavailable');assert.match(result.headers['cache-control'],/no-store/);assert.equal(result.headers['access-control-allow-origin'],undefined);
});
test('Worker requests use only verified identity and fixed URL while dropping cookies and forwarding credentials',async t=>{
  const worker={async fetch(request,env){return Response.json({url:request.url,owner:request.headers.get('oai-authenticated-user-id'),cookie:request.headers.get('cookie'),authorization:request.headers.get('authorization'),forwarded:request.headers.get('forwarded'),other:request.headers.get('oai-other-id'),host:request.headers.get('x-forwarded-host'),language:request.headers.get('x-mission-language'),localPreview:env.LOCAL_PREVIEW??null});}},f=await fixture(t,{worker}),cookie=await f.mint();
  const result=await f.run('/api/check?q=kept',{cookie,headers:{'oai-authenticated-user-id':'attacker','oai-other-id':'other','authorization':'Bearer client-value','forwarded':'host=attacker.test','x-forwarded-host':'attacker.test','x-mission-language':'ur'}});assert.equal(result.status,200);assert.deepEqual(result.body,{url:publicOrigin+'/api/check?q=kept',owner:f.owner(cookie),cookie:null,authorization:null,forwarded:null,other:null,host:null,language:'ur',localPreview:null});
});
test('Actual diary, tasks and health analyses remain private and survive a server restart under the same cookie',async t=>{
  const f=await fixture(t),a=await f.mint(),b=await f.mint(),noteId=randomUUID(),taskId=randomUUID(),analysis=health();
  assert.equal((await f.run('/api/astronauts/personal/messages',{method:'POST',cookie:a,headers:origin,body:{id:noteId,content:'Synthetic private diary note',language:'en',mode:'diary',attachments:[]}})).status,201);
  assert.equal((await f.run('/api/tasks',{method:'POST',cookie:a,headers:origin,body:{id:taskId,title:'Synthetic task',dueDate:'2030-01-01',timeZone:'UTC'}})).status,201);
  const saved=await f.run('/api/health-analysis',{method:'POST',cookie:a,headers:origin,body:analysis});assert.equal(saved.status,201);assert.equal(saved.body.result.agentAvailable,false);assert.equal(saved.body.result.status,'ATTENTION');
  assert.equal((await f.run('/api/health-analysis/'+analysis.id,{cookie:b})).status,404);assert.equal((await f.run('/api/tasks',{cookie:b})).body.tasks.length,0);assert.equal((await f.run('/api/astronauts/personal/messages',{cookie:b})).body.messages.length,0);
  const before=(await f.run('/api/me',{cookie:a})).body.storageScope;await f.restart();assert.equal((await f.run('/api/me',{cookie:a})).body.storageScope,before);assert.equal((await f.run('/api/tasks',{cookie:a})).body.tasks[0].id,taskId);assert.equal((await f.run('/api/health-analysis/'+analysis.id,{cookie:a})).body.item.id,analysis.id);
  assert.equal((await f.run('/api/tasks/'+taskId,{method:'PATCH',cookie:a,headers:origin,body:{title:'Edited synthetic task'}})).status,200);assert.equal((await f.run('/api/tasks/'+taskId,{method:'DELETE',cookie:a,headers:origin})).status,200);assert.equal((await f.run('/api/tasks',{cookie:a})).body.tasks.length,0);assert.equal(f.calls.length,0);
});
test('The exported API delivers due reminders without a browser request and does not duplicate them after restart',async t=>{
  assert.equal(typeof actualWorker.scheduled,'function');const f=await fixture(t),cookie=await f.mint(),owner=f.owner(cookie),id=randomUUID(),at=new Date(),due=new Date(at.valueOf()+200).toISOString();
  await f.storage.DB.prepare("INSERT INTO personal_tasks (id,owner_id,source_message_id,ordinal,title,due_date,due_at,time_zone,status,created_at,updated_at) VALUES (?,?,?,0,'Background timer verification',?,?,'UTC','planned',?,?)").bind(id,owner,'manual:'+id,due.slice(0,10),due,at.toISOString(),at.toISOString()).run();
  assert.equal((await f.storage.DB.prepare('SELECT COUNT(*) n FROM general_chat_messages').first()).n,0);await new Promise(resolve=>setTimeout(resolve,2200));
  const message=await f.storage.DB.prepare('SELECT * FROM general_chat_messages WHERE owner_id=?').bind(owner).first();assert.match(message.content,/Reminder: Background timer verification/);assert.ok(Date.parse(message.created_at)>=Date.parse(due));assert.equal((await f.storage.DB.prepare('SELECT COUNT(*) n FROM task_deliveries').first()).n,1);assert.equal(f.calls.length,0);
  await f.restart();await new Promise(resolve=>setTimeout(resolve,1100));assert.equal((await f.storage.DB.prepare('SELECT COUNT(*) n FROM general_chat_messages WHERE owner_id=?').bind(owner).first()).n,1);assert.equal(f.calls.length,0);
});
test('Private multipart files and saved recordings retain byte ranges without exposing another guest data',async t=>{
  const f=await fixture(t),a=await f.mint(),b=await f.mint();
  async function multipart(path,form){const encoded=new Request('https://frontend.test',{method:'POST',body:form});return f.run(path,{method:'POST',cookie:a,headers:{...origin,'content-type':encoded.headers.get('content-type')},body:Buffer.from(await encoded.arrayBuffer())});}
  const data=Buffer.from('Synthetic attachment bytes'),file=new FormData();file.set('room','private');file.set('file',new Blob([data]),'synthetic.txt');const upload=await multipart('/api/chat-files',file);assert.equal(upload.status,201);assert.deepEqual((await f.run(upload.body.file.url,{cookie:a})).bytes,data);assert.equal((await f.run(upload.body.file.url,{cookie:b})).status,404);
  const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('RIFF'));bytes.set(new TextEncoder().encode('WAVE'),8);const id=randomUUID(),recording=new FormData();recording.set('id',id);recording.set('kind','audio');recording.set('duration','5');recording.set('transcript','Synthetic recording');recording.set('file',new Blob([bytes]),'synthetic.wav');
  const saved=await multipart('/api/media-analysis',recording);assert.equal(saved.status,503);assert.equal(saved.body.saved,true);const path='/api/media-analysis/'+id+'/media';const range=await f.run(path,{cookie:a,headers:{range:'bytes=8-11'}});assert.equal(range.status,206);assert.equal(range.bytes.toString(),'WAVE');assert.equal(range.headers['content-range'],'bytes 8-11/64');assert.equal((await f.run(path,{cookie:b})).status,404);assert.equal((await f.run(path,{cookie:a,method:'HEAD'})).headers['content-length'],'64');
  await f.restart();assert.deepEqual((await f.run(path,{cookie:a})).bytes,Buffer.from(bytes));assert.equal(f.calls.length,0);
});
test('Declared and chunked oversized bodies are rejected before Worker writes',async t=>{
  const f=await fixture(t,{limits:{bodyBytes:128}}),cookie=await f.mint(),body={id:randomUUID(),content:'x'.repeat(300),attachments:[]};
  assert.equal((await f.run('/api/chat',{method:'POST',cookie,headers:origin,body})).status,413);
  const chunked=await f.run('/api/chat',{method:'POST',cookie,headers:{...origin,'content-type':'application/json'},chunks:[Buffer.from(JSON.stringify(body).slice(0,70)),Buffer.from(JSON.stringify(body).slice(70))]});assert.equal(chunked.status,413);assert.equal((await f.run('/api/chat',{cookie})).body.messages.length,0);assert.equal(f.calls.length,0);
});
test('Aggregate object capacity returns a bounded error before adding another uploaded file',async t=>{
  const f=await fixture(t,{storageLimits:{maxStorageBytes:70}}),cookie=await f.mint();
  async function upload(size){const form=new FormData();form.set('room','private');form.set('file',new Blob([new Uint8Array(size)]),'synthetic.bin');const encoded=new Request(publicOrigin,{method:'POST',body:form});return f.run('/api/chat-files',{method:'POST',cookie,headers:{...origin,'content-type':encoded.headers.get('content-type')},body:Buffer.from(await encoded.arrayBuffer())});}
  const first=await upload(50);assert.equal(first.status,201);const denied=await upload(30);assert.equal(denied.status,507);assert.deepEqual(denied.body,{error:'object_storage_limit'});assert.equal((await f.run(first.body.file.url,{cookie})).bytes.length,50);assert.equal((await f.storage.DB.prepare('SELECT COUNT(*) AS n FROM chat_files').first()).n,1);await f.restart();assert.equal((await upload(30)).status,507);
});
test('Persistent upstream quotas block excess AI calls across cookies and restarts while preserving rule-only results',async t=>{
  let calls=0;const f=await fixture(t,{settings:azure,limits:{aiSessionDaily:1,aiGlobalDaily:2},upstreamFetch:async()=>{calls++;return completed();}}),a=await f.mint(),b=await f.mint(),c=await f.mint();
  const analyze=cookie=>f.run('/api/health-analysis',{method:'POST',cookie,headers:origin,body:health()});
  assert.equal((await analyze(a)).body.result.agentAvailable,true);const blockedA=await analyze(a);assert.equal(blockedA.status,201);assert.equal(blockedA.body.result.agentAvailable,false);assert.equal(blockedA.headers['x-mission-ai-limit'],'daily');
  assert.equal((await analyze(b)).body.result.agentAvailable,true);const blockedC=await analyze(c);assert.equal(blockedC.body.result.agentAvailable,false);assert.equal(blockedC.headers['x-mission-ai-limit'],'daily');assert.equal(calls,2);await f.restart();assert.equal((await analyze(c)).body.result.agentAvailable,false);assert.equal(calls,2);
  const usage=await f.storage.DB.prepare("SELECT requests FROM standalone_usage WHERE scope='ai:global'").first();assert.equal(usage.requests,2);
});
test('Utility translation invoked by reads consumes the same persistent global quota',async t=>{
  let calls=0;const f=await fixture(t,{settings:{...azure,LLM_BASE_URL:'https://utility.invalid/v1',LLM_API_KEY:'synthetic-key',LLM_MODEL:'synthetic-model'},limits:{aiSessionDaily:1,aiGlobalDaily:1},upstreamFetch:async(_url,init)=>{calls++;const values=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({choices:[{message:{content:JSON.stringify(values.map(()=> 'Translated synthetic note'))}}]});}}),cookie=await f.mint(),owner=f.owner(cookie);
  async function note(code){const id=randomUUID();await f.storage.DB.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status) VALUES (?,?,?,?,?,?,?,?)').bind(id,owner,'personal','note',String.fromCodePoint(code),'en',new Date().toISOString(),'pending').run();return id;}
  await note(0x416);assert.equal((await f.run('/api/astronauts/personal/messages',{cookie})).body.messages[0].content,'Translated synthetic note');const id=await note(0x417);const result=await f.run('/api/astronauts/personal/messages',{cookie});assert.equal(result.status,200);assert.equal(result.headers['x-mission-ai-limit'],'daily');assert.match(result.body.messages.find(item=>item.id===id).content,/translation is temporarily unavailable/);assert.equal(calls,1);assert.equal((await f.storage.DB.prepare('SELECT content FROM journal_messages WHERE id=?').bind(id).first()).content,String.fromCodePoint(0x417));
});
test('Session recreation has its own persistent global cap while valid sessions remain usable',async t=>{
  const f=await fixture(t,{limits:{sessionDaily:1}}),cookie=await f.mint();const denied=await f.run('/api/session');assert.equal(denied.status,429);assert.equal(denied.body.error,'session_daily_limit');assert.equal(denied.headers['set-cookie'],undefined);assert.equal((await f.run('/api/session',{cookie})).status,200);await f.restart();assert.equal((await f.run('/api/session')).status,429);assert.equal((await f.run('/api/me',{cookie})).status,200);
});
test('AI concurrency limits preserve the unavailable result without dispatching a second provider call',async t=>{
  let release,started,calls=0;const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{started=resolve;}),f=await fixture(t,{settings:azure,limits:{aiConcurrent:1},upstreamFetch:async()=>{calls++;started();await gate;return completed();}}),a=await f.mint(),b=await f.mint();
  const pending=f.run('/api/health-analysis',{method:'POST',cookie:a,headers:origin,body:health()});await began;
  try{const blocked=await f.run('/api/health-analysis',{method:'POST',cookie:b,headers:origin,body:health()});assert.equal(blocked.status,201);assert.equal(blocked.body.result.agentAvailable,false);assert.equal(blocked.headers['x-mission-ai-limit'],'concurrent');assert.equal(calls,1);}finally{release();}
  assert.equal((await pending).body.result.agentAvailable,true);
});
test('Provider concurrency remains reserved until the response body finishes',async t=>{
  let release,started,calls=0;const began=new Promise(resolve=>{started=resolve;}),f=await fixture(t,{settings:azure,limits:{aiConcurrent:1},upstreamFetch:async()=>{calls++;return new Response(new ReadableStream({start(controller){release=()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({status:'ATTENTION',alerts:[],summary:'Synthetic result.'})}]}]})));controller.close();};started();}}),{headers:{'content-type':'application/json'}});}}),a=await f.mint(),b=await f.mint();
  const pending=f.run('/api/health-analysis',{method:'POST',cookie:a,headers:origin,body:health()});await began;
  try{const blocked=await f.run('/api/health-analysis',{method:'POST',cookie:b,headers:origin,body:health()});assert.equal(blocked.headers['x-mission-ai-limit'],'concurrent');assert.equal(blocked.body.result.agentAvailable,false);assert.equal(calls,1);}finally{release();}assert.equal((await pending).body.result.agentAvailable,true);
});
test('Memory indexing and retrieval do not consume generation quota',async t=>{
  let memory=0;const f=await fixture(t,{settings:{AIR_GAP:'1',MEMORY_URL:'http://127.0.0.1:8091',MEMORY_API_KEY:'synthetic-memory-key'},limits:{aiSessionDaily:0,aiGlobalDaily:0},upstreamFetch:async url=>{memory++;if(String(url).endsWith('/health'))return Response.json({semantic:true,generation:false});return Response.json({indexed:true,matches:[]});}}),cookie=await f.mint();
  const note=await f.run('/api/astronauts/personal/messages',{method:'POST',cookie,headers:origin,body:{id:randomUUID(),content:'Synthetic memory note',mode:'diary',language:'en',attachments:[]}});assert.equal(note.status,201);assert.equal(note.body.message.vectorStatus,'indexed');assert.ok(memory>=2);assert.equal((await f.storage.DB.prepare("SELECT requests FROM standalone_usage WHERE scope='ai:global'").first()),null);
});
test('The legacy speech fallback cannot bypass AI quota through a different utility base protocol',async t=>{
  let calls=0;const f=await fixture(t,{settings:{LLM_BASE_URL:'http://api.proxyapi.ru/openai/v1',LLM_API_KEY:'synthetic-key',LLM_MODEL:'synthetic-model'},limits:{aiSessionDaily:0,aiGlobalDaily:0},upstreamFetch:async()=>{calls++;return Response.json({text:'Unexpected transcription'});}}),cookie=await f.mint();
  const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('RIFF'));bytes.set(new TextEncoder().encode('WAVE'),8);const form=new FormData();form.set('mode','api');form.set('file',new Blob([bytes]),'synthetic.wav');const encoded=new Request(publicOrigin,{method:'POST',body:form});const result=await f.run('/api/transcriptions',{method:'POST',cookie,headers:{...origin,'content-type':encoded.headers.get('content-type')},body:Buffer.from(await encoded.arrayBuffer())});assert.equal(result.status,503);assert.equal(result.headers['x-mission-ai-limit'],'daily');assert.equal(calls,0);assert.equal(result.body.text,undefined);
});
test('Standalone startup rejects local-preview identity and private paths inside the release',async()=>{
  await assert.rejects(startFromEnv({LOCAL_PREVIEW:'1'}),/LOCAL_PREVIEW/);await assert.rejects(startFromEnv({DATA_DIR:fileURLToPath(new URL('runtime/',root)),SESSION_SECRET_FILE:'/not-read'}),/outside the release/);
});
test('The actual CLI starts through a current-release symlink and shuts down gracefully on SIGTERM',{timeout:15000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'mission-cli-test-')),release=join(directory,'releases','synthetic'),current=join(directory,'current'),runtime=join(directory,'runtime');
  let child,exited;
  t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}await rm(directory,{recursive:true,force:true});});
  for(const path of [join(release,'server'),join(release,'dist','backend'),join(release,'drizzle'),runtime])await mkdir(path,{recursive:true,mode:0o700});
  for(const name of ['standalone.mjs','storage.mjs','session.mjs'])await copyFile(new URL('server/'+name,root),join(release,'server',name));
  await writeFile(join(release,'dist','backend','worker.mjs'),'export default {async fetch(request){return Response.json({owner:request.headers.get("oai-authenticated-user-id")});}};\n');
  await writeFile(join(release,'drizzle','0000_cli.sql'),'CREATE TABLE cli_probe (id TEXT PRIMARY KEY);\n');
  const secretFile=join(runtime,'session-secret');await writeFile(secretFile,secret,{mode:0o600});await symlink(release,current,'dir');
  const reservation=http.createServer();await new Promise((resolveListen,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolveListen);});const port=reservation.address().port;await new Promise(resolveClose=>reservation.close(resolveClose));
  let output='',errors='';
  child=spawn(process.execPath,[join(current,'server','standalone.mjs')],{cwd:current,env:{PUBLIC_ORIGIN:publicOrigin,SESSION_SECRET_FILE:secretFile,DATA_DIR:join(runtime,'data'),MIGRATIONS_DIR:join(current,'drizzle'),WORKER_MODULE:join(current,'dist','backend','worker.mjs'),API_HOST:'127.0.0.1',API_PORT:String(port),AIR_GAP:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',value=>{output=(output+value).slice(-8192);});child.stderr.on('data',value=>{errors=(errors+value).slice(-8192);});
  exited=new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolveExit({code,signal}));});
  async function request(path,cookie){return new Promise((resolveResult,reject)=>{const call=http.get({hostname:'127.0.0.1',port,path,headers:{host:new URL(publicOrigin).host,...(cookie?{cookie}:{})},timeout:500},response=>{const data=[];response.on('data',value=>data.push(value));response.once('end',()=>resolveResult({status:response.statusCode,headers:response.headers,body:JSON.parse(Buffer.concat(data))}));});call.once('error',reject);call.once('timeout',()=>call.destroy(new Error('CLI probe timed out')));});}
  async function readiness(){
    const deadline=Date.now()+8000;
    while(Date.now()<deadline){if(child.exitCode!==null||child.signalCode!==null)throw new Error('CLI exited before readiness: '+output+' '+errors);try{const response=await request('/_health');if(response.status===200&&response.body.ready)return;}catch(error){if(!['ECONNREFUSED','ECONNRESET'].includes(error.code))throw error;}await new Promise(resolveWait=>setTimeout(resolveWait,25));}
    throw new Error('CLI never became ready: '+output+' '+errors);
  }
  await readiness();assert.match(output,/Mission Health API is ready on loopback/);
  const session=await request('/api/session');assert.equal(session.status,200);const cookie=session.headers['set-cookie'][0].split(';')[0];const api=await request('/api/probe',cookie);assert.equal(api.status,200);assert.match(api.body.owner,/^guest:/);
  child.kill('SIGTERM');let timer;
  try{assert.deepEqual(await Promise.race([exited,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('CLI did not stop gracefully: '+errors)),3000);})]),{code:0,signal:null});}finally{clearTimeout(timer);}
  const reopened=await openStorage({dataDir:join(runtime,'data'),migrationsDir:join(release,'drizzle')});try{assert.equal((await reopened.DB.prepare('SELECT COUNT(*) AS n FROM cli_probe').first()).n,0);}finally{await reopened.close();}
});
