const astronautIds=new Set(['jessica-meir','jack-hathaway','christina-koch']);
const languages=new Set(['en','zh','ar','es']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
const fail=(code,status)=>{throw Object.assign(new Error(code),{code,status})};
function database(env){if(!env.DB)fail('storage_unavailable',503);return env.DB}
function owner(request,env){const value=request.headers.get('oai-authenticated-user-id');if(value)return value;if(env.LOCAL_PREVIEW==='1')return 'local-preview';fail('sign_in_required',401)}
function memoryConfigured(env){return Boolean(env.MEMORY_URL&&(env.MEMORY_API_KEY||env.LOCAL_PREVIEW==='1'))}
async function memoryRequest(env,path,body){
  if(!memoryConfigured(env))fail('memory_unavailable',503);
  const response=await fetch(env.MEMORY_URL.replace(/\/$/,'')+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','authorization':'Bearer '+(env.MEMORY_API_KEY||'')},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});
  if(!response.ok)fail('memory_unavailable',503);
  return response.json();
}
async function capabilities(env){
  if(!memoryConfigured(env))return {memory:false,assistant:false};
  try{const health=await memoryRequest(env,'/health');return {memory:health.semantic===true,assistant:health.generation===true}}catch{return {memory:false,assistant:false}}
}
function serialize(row){return {id:row.id,role:row.role,content:row.content,language:row.language,createdAt:row.created_at,vectorStatus:row.vector_status,references:JSON.parse(row.references_json||'[]')}}
async function history(env,user,astronaut,before){
  const db=database(env),query=before?'SELECT * FROM journal_messages WHERE owner_id=? AND astronaut_id=? AND created_at<? ORDER BY created_at DESC,id DESC LIMIT 61':'SELECT * FROM journal_messages WHERE owner_id=? AND astronaut_id=? ORDER BY created_at DESC,id DESC LIMIT 61';
  const {results}=await db.prepare(query).bind(...[user,astronaut,...(before?[before]:[])]).all();
  return {messages:results.slice(0,60).reverse().map(serialize),hasMore:results.length>60};
}
async function indexEntry(env,row){
  if(!memoryConfigured(env)||row.role==='assistant')return false;
  try{
    await memoryRequest(env,'/upsert',{id:row.id,ownerId:row.owner_id,astronautId:row.astronaut_id,text:row.content,language:row.language,createdAt:row.created_at});
    await database(env).prepare('UPDATE journal_messages SET vector_status=? WHERE id=? AND owner_id=? AND astronaut_id=?').bind('indexed',row.id,row.owner_id,row.astronaut_id).run();return true;
  }catch(error){console.warn('Индексация дневника отложена:',error.code||error.name);return false}
}
async function syncPending(env,user,astronaut){
  if(!memoryConfigured(env))return;
  const {results}=await database(env).prepare("SELECT * FROM journal_messages WHERE owner_id=? AND astronaut_id=? AND vector_status='pending' AND role!='assistant' ORDER BY created_at LIMIT 20").bind(user,astronaut).all();
  for(const row of results)if(!await indexEntry(env,row))break;
}
async function retrieve(env,user,astronaut,query){
  const result=await memoryRequest(env,'/search',{ownerId:user,astronautId:astronaut,query});
  const matches=[];
  for(const item of (result.matches||[]).slice(0,6)){
    const row=await database(env).prepare('SELECT * FROM journal_messages WHERE id=? AND owner_id=? AND astronaut_id=?').bind(item.id,user,astronaut).first();
    if(row)matches.push({...serialize(row),score:item.score});
  }
  return matches;
}
async function addMessage(request,env,user,astronaut){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('invalid_input',400);
  const raw=await request.text();if(raw.length>15000)fail('invalid_input',400);
  let input;try{input=JSON.parse(raw)}catch{fail('invalid_input',400)}
  if(!input||typeof input.id!=='string'||! /^[a-f0-9-]{36}$/i.test(input.id)||typeof input.content!=='string'||!input.content.trim()||input.content.length>6000||!languages.has(input.language)||!['diary','ask'].includes(input.mode))fail('invalid_input',400);
  const db=database(env),existing=await db.prepare('SELECT * FROM journal_messages WHERE id=?').bind(input.id).first();
  if(existing){
    if(existing.owner_id!==user||existing.astronaut_id!==astronaut||existing.content!==input.content.trim())fail('id_conflict',409);
    const reply=await db.prepare('SELECT * FROM journal_messages WHERE reply_to=? AND owner_id=? AND astronaut_id=?').bind(input.id,user,astronaut).first();
    return json({message:serialize(existing),reply:reply?serialize(reply):null});
  }
  const features=await capabilities(env);if(input.mode==='ask'&&!features.assistant)fail('assistant_unavailable',503);
  const row={id:input.id,owner_id:user,astronaut_id:astronaut,role:input.mode==='diary'?'note':'user',content:input.content.trim(),language:input.language,created_at:new Date().toISOString(),vector_status:'pending',references_json:'[]'};
  await db.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,references_json) VALUES (?,?,?,?,?,?,?,?,?)').bind(row.id,user,astronaut,row.role,row.content,row.language,row.created_at,'pending','[]').run();
  let reply=null,replyError=null;
  if(input.mode==='ask'){
    try{
      await syncPending(env,user,astronaut);
      const references=await retrieve(env,user,astronaut,row.content);
      const recent=await history(env,user,astronaut);
      const answer=await memoryRequest(env,'/answer',{ownerId:user,astronautId:astronaut,query:row.content,language:row.language,references:references.filter(x=>x.id!==row.id),history:recent.messages.slice(-12)});
      if(typeof answer.text!=='string'||!answer.text.trim())fail('assistant_unavailable',503);
      const entry={id:crypto.randomUUID(),role:'assistant',content:answer.text.slice(0,16000),language:row.language,created_at:new Date().toISOString(),vector_status:'not_applicable',references_json:JSON.stringify(references.filter(x=>x.id!==row.id).map(x=>({id:x.id,createdAt:x.createdAt,content:x.content.slice(0,160)})))};
      await db.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,reply_to,references_json) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(entry.id,user,astronaut,entry.role,entry.content,entry.language,entry.created_at,entry.vector_status,row.id,entry.references_json).run();reply=serialize(entry);
    }catch(error){console.warn('Ответ помощника недоступен:',error.code||error.name);replyError='assistant_unavailable'}
  }
  if(await indexEntry(env,row))row.vector_status='indexed';
  return json({message:serialize(row),reply,replyError},201);
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')){
      const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
      if(!asset||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
      const binary=atob(asset.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':asset.type,'cache-control':url.pathname==='/'?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff'}});
    }
    try{
      const user=owner(request,env);
      if(request.method!=='GET'&&((request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'))fail('forbidden',403);
      if(url.pathname==='/api/status'&&request.method==='GET')return json(await capabilities(env));
      const match=url.pathname.match(/^\/api\/astronauts\/([^/]+)\/(messages|search)$/);if(!match||!astronautIds.has(match[1]))fail('not_found',404);
      const astronaut=match[1];
      if(match[2]==='messages'&&request.method==='GET'){
        const before=url.searchParams.get('before');if(before&&! /^\d{4}-\d{2}-\d{2}T/.test(before))fail('invalid_input',400);
        const result=await history(env,user,astronaut,before);ctx.waitUntil(syncPending(env,user,astronaut));return json({...result,capabilities:await capabilities(env)});
      }
      if(match[2]==='messages'&&request.method==='POST')return await addMessage(request,env,user,astronaut);
      if(match[2]==='search'&&request.method==='GET'){
        const query=url.searchParams.get('q')?.trim();if(!query||query.length>1000)fail('invalid_input',400);
        await syncPending(env,user,astronaut);return json({matches:await retrieve(env,user,astronaut,query)});
      }
      fail('method_not_allowed',405);
    }catch(error){
      if(!error.code)console.error('Ошибка сервера дневника:',error.name);
      return json({error:error.code||'storage_unavailable'},error.status||503);
    }
  }
};
