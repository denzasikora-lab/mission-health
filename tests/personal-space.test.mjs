import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url);
const source=(await Promise.all(['activity','scheduler','personal','photos','stories','speech','training','book','index'].map(name=>readFile(new URL('worker/'+name+'.js',root),'utf8')))).join('\n').replace('export default','globalThis.app =');
const migrations=await Promise.all((await readdir(new URL('drizzle/',root))).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(new URL('drizzle/'+name,root),'utf8')));
const hostedMemoryMigration=await readFile(new URL('drizzle/0015_hosted_memory_reindex.sql',root),'utf8');
const model='embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:text:256:v1';
function fixture(options={}){
  const sql=new DatabaseSync(':memory:');for(const migration of options.beforeHundred?migrations.slice(0,10):migrations)sql.exec(migration);
  const objects=new Map(),PHOTOS={put:async(key,bytes)=>{objects.set(key,bytes);},get:async key=>objects.has(key)?{body:objects.get(key)}:null,delete:async key=>objects.delete(key)};
  const out=[],intentCalls=[],DB={prepare(query){
    const statement=sql.prepare(query);
    return {bind(...values){return {first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>statement.run(...values)};}};
  }};
  let status=200,answer='Test response based on supplied context.',intentStatus=200,intentAnswer=JSON.stringify({isScheduler:false,tasks:[]});
  const scope={URL,Request,Response,FormData,Blob,Uint8Array,TextEncoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{warn(){},error(){}},fetch:async(url,options)=>{const body=JSON.parse(options.body);if(body.messages?.[0]?.content?.startsWith('Mission Health scheduler intent.')){intentCalls.push({url,body});return intentStatus===200?Response.json({choices:[{message:{content:intentAnswer}}]}):new Response('unavailable',{status:intentStatus});}out.push({url,body});if(String(url).startsWith('http://trainer.internal/'))return Response.json({id:body.id});return status===200?Response.json(body.input?{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:answer}]}]}:{choices:[{message:{content:answer}}]}):new Response('unavailable',{status});}};
  vm.runInNewContext(source,scope);
  const env={DB,PHOTOS,LLM_API_KEY:'test-key',LLM_BASE_URL:'https://model.test/v1',LLM_MODEL:'test-model'};
  const run=async(path,{owner='owner-a',method='GET',body,environment={},origin,name,email,nameEncoding,expectedScope}={})=>{
    const headers=body instanceof FormData?{}:{'content-type':'application/json'};if(name)headers['oai-authenticated-user-full-name']=name;if(email)headers['oai-authenticated-user-email']=email;if(nameEncoding)headers['oai-authenticated-user-full-name-encoding']=nameEncoding;if(owner)headers['oai-authenticated-user-id']=owner;if(origin)headers.origin=origin;if(expectedScope!==undefined)headers['x-mission-profile-scope']=expectedScope;
    const response=await scope.app.fetch(new Request('https://mission.test'+path,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)}),{...env,...environment},{waitUntil(){}});
    return {status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text()};
  };
  const note=async(score=70,profile='jessica-meir',owner='owner-a',content='Fatigue decreased after exercise.')=>run('/api/astronauts/'+profile+'/messages',{owner,method:'POST',body:{id:webcrypto.randomUUID(),content,language:'en',mode:'diary',attachments:[],wellbeing:score===null?null:{score,wellbeingScale:100}}});
  return {sql,out,intentCalls,intentProvider:(code,value)=>{intentStatus=code;intentAnswer=value;},objects,run,note,migrateHundred:()=>{for(const migration of migrations.slice(10).filter(value=>value!==hostedMemoryMigration))sql.exec(migration);},validateHealth:scope.validatedStoryHealth,provider:(code,text)=>{status=code;if(text)answer=text;}};
}
test('Azure chat saves readable health output with the same owner and reply identity',async()=>{
  const f=fixture(),environment={LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-key'},id=webcrypto.randomUUID();
  f.provider(200,JSON.stringify({status:'ATTENTION',alerts:['Synthetic heart-rate flag'],summary:'Review the synthetic sample.'}));
  const result=await f.run('/api/chat',{method:'POST',environment,body:{id,content:'Synthetic sample',attachments:[]}});assert.equal(result.status,201);assert.equal(result.body.reply.content,'Review the synthetic sample.\n\nStatus: ATTENTION\nAlerts:\n- Synthetic heart-rate flag');assert.equal(result.body.reply.replyTo,id);assert.equal(f.out.length,1);assert.equal(f.out[0].body.input[0].role,'system');assert.ok(f.out[0].body.input[0].content.includes('ordinary conversation'));assert.equal(f.sql.prepare('SELECT owner_id FROM general_chat_messages WHERE reply_to=?').get(id).owner_id,'owner-a');
  const retry=await f.run('/api/chat',{method:'POST',environment,body:{id,content:'Synthetic sample',attachments:[]}});assert.equal(retry.body.reply.id,result.body.reply.id);assert.equal(f.out.length,1);assert.equal((await f.run('/api/chat',{owner:'owner-b',environment})).body.messages.length,0);f.sql.close();
});
test('A saved minute reminder receives a factual confirmation even when the language provider is unavailable',async()=>{
  const f=fixture(),body={id:webcrypto.randomUUID(),content:'Remind me in 1 minute to test temperature.',timeZone:'Europe/Istanbul'};f.provider(503,'I cannot create reminders.');f.intentProvider(200,JSON.stringify({isScheduler:true,tasks:[{title:'Test temperature',delayMinutes:1}]}));
  const result=await f.run('/api/chat',{method:'POST',body});assert.equal(result.status,201);assert.equal(result.body.tasks.length,1);assert.equal(result.body.tasks[0].title,'Test temperature');assert.equal(Date.parse(result.body.tasks[0].dueAt)-Date.parse(result.body.message.createdAt),60000);assert.match(result.body.reply.content,/Reminder saved: Test temperature/);assert.doesNotMatch(result.body.reply.content,/cannot|can.t create|\*\*/i);assert.equal(result.body.replyError,null);assert.equal(f.out.length,0);
  const retry=await f.run('/api/chat',{method:'POST',body});assert.equal(retry.body.reply.id,result.body.reply.id);assert.equal(retry.body.tasks[0].id,result.body.tasks[0].id);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM personal_tasks').get().n,1);assert.equal((await f.run('/api/chat',{owner:'owner-b'})).body.messages.length,0);f.sql.close();
});

test('ProxyAPI mini detects a natural scheduler request and freezes its result across retries',async()=>{
  const f=fixture(),body={id:webcrypto.randomUUID(),content:'Please make sure I take my temperature a minute from now.',timeZone:'Europe/Istanbul'},environment={LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-agent-key',LLM_BASE_URL:'https://api.proxyapi.ru/v1',LLM_MODEL:'openai/gpt-5-mini'};
  f.intentProvider(200,JSON.stringify({isScheduler:true,tasks:[{title:'Take my temperature',delayMinutes:1}]}));const result=await f.run('/api/chat',{method:'POST',body,environment});assert.equal(result.body.tasks.length,1);assert.equal(result.body.tasks[0].title,'Take my temperature');assert.equal(Date.parse(result.body.tasks[0].dueAt)-Date.parse(result.body.message.createdAt),60000);assert.match(result.body.reply.content,/Reminder saved/);assert.equal(f.out.length,0);assert.equal(f.intentCalls.length,1);assert.equal(f.intentCalls[0].url,'https://api.proxyapi.ru/v1/chat/completions');assert.equal(f.intentCalls[0].body.model,'openai/gpt-5-mini');assert.equal(JSON.parse(f.intentCalls[0].body.messages[1].content).timeZone,'Europe/Istanbul');
  f.intentProvider(200,JSON.stringify({isScheduler:true,tasks:[{title:'Changed output',delayMinutes:99}]}));const retry=await f.run('/api/chat',{method:'POST',body,environment});assert.equal(retry.body.tasks[0].id,result.body.tasks[0].id);assert.equal(retry.body.tasks[0].dueAt,result.body.tasks[0].dueAt);assert.equal(f.intentCalls.length,1);f.sql.close();
});
test('Negative intent does not schedule quoted text and invalid output falls back only to literal supported requests',async()=>{
  const f=fixture();const quote=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'The manual says "Remind me in 1 minute to test temperature".'}});assert.equal(quote.body.tasks.length,0);assert.equal(f.out.length,1);assert.equal(f.intentCalls.length,1);
  f.intentProvider(200,JSON.stringify({isScheduler:true,tasks:[{title:'Untrusted output',dueDate:'2026-02-30',url:'https://example.test'}]}));const result=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Remind me in 1 minute to test temperature.',timeZone:'UTC'}});assert.equal(result.body.tasks[0].title,'Test temperature');assert.match(result.body.reply.content,/Reminder saved/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM personal_tasks').get().n,1);f.sql.close();
});

test('New visitors receive the Sara Khan demo persona without account name or email',async()=>{
  const f=fixture();
  for(const headers of [{},{name:'crown-bobby'},{email:'crown-bobby@example.test'},{name:'%D0%95%D0%B3%D0%BE%D1%80',nameEncoding:'percent-encoded-utf-8',email:'private@example.test'}]){
    const result=await f.run('/api/me',headers);assert.equal(result.status,200);assert.equal(result.body.name,'Cdr. Sara Khan');assert.match(result.body.storageScope,/^[a-f0-9]{64}$/);assert.match(result.body.researcherId,/^\d{3} \d{3} \d{3}$/);
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_profiles').get().n,0);
});
test('Demo persona metadata preserves account identity and does not create a Sara crew profile',async()=>{
  const f=fixture(),first=(await f.run('/api/me')).body,other=(await f.run('/api/me',{owner:'owner-b'})).body;
  for(const identity of [first,other]){
    assert.equal(identity.name,'Cdr. Sara Khan');assert.equal(identity.astronautId,'AST-014');assert.equal(identity.station,'Orion Station');assert.equal(identity.expedition,'Expedition 7');assert.equal(identity.isDemo,true);
    assert.match(identity.researcherId,/^\d{3} \d{3} \d{3}$/);assert.notEqual(identity.researcherId,identity.astronautId);
  }
  assert.notEqual(first.storageScope,other.storageScope);assert.notEqual(first.researcherId,other.researcherId);
  const renamed=(await f.run('/api/me',{method:'PUT',body:{name:'Custom user'}})).body;
  assert.equal(renamed.name,'Custom user');assert.equal(renamed.storageScope,first.storageScope);assert.equal(renamed.researcherId,first.researcherId);assert.equal(renamed.astronautId,'AST-014');
  assert.equal((await f.run('/api/me',{owner:'owner-b'})).body.name,'Cdr. Sara Khan');
  const saved=await f.note(null,'personal','owner-a','Personal demo observation.');assert.equal(saved.status,201);
  assert.equal((await f.run('/api/astronauts/personal/book')).body.total,1);assert.equal((await f.run('/api/astronauts/personal/book',{owner:'owner-b'})).body.total,0);
  for(const profile of ['jessica-meir','jack-hathaway','christina-koch'])assert.equal((await f.run('/api/astronauts/'+profile+'/book')).status,200);
  for(const resource of ['messages','book','book-index','photos'])assert.equal((await f.run('/api/astronauts/sara-khan/'+resource)).status,404);
});
test('First name NasaGPT stored separately, normalized and repeated writes are idempotent',async()=>{
  const f=fixture(),initial=await f.run('/api/me',{name:'Account Name'});assert.equal(initial.body.name,'Cdr. Sara Khan');
  const saved=await f.run('/api/me',{method:'PUT',name:'Account Name',body:{name:'  Egor   Fedosov  '}});assert.equal(saved.status,200);assert.equal(saved.body.name,'Egor Fedosov');assert.equal(saved.body.storageScope,initial.body.storageScope);assert.equal(saved.body.researcherId,initial.body.researcherId);
  assert.equal((await f.run('/api/me',{name:'Old Account Name'})).body.name,'Egor Fedosov');
  f.sql.prepare('UPDATE personal_profiles SET updated_at=? WHERE owner_id=?').run('2000-01-01T00:00:00.000Z','owner-a');
  assert.equal((await f.run('/api/me',{method:'PUT',body:{name:'Egor Fedosov'}})).status,200);assert.equal(f.sql.prepare('SELECT updated_at FROM personal_profiles WHERE owner_id=?').get('owner-a').updated_at,'2000-01-01T00:00:00.000Z');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_profiles').get().n,1);
  const normalized=await f.run('/api/me',{method:'PUT',body:{name:'Theodore eE \u2013 \u2014'}});assert.equal(normalized.body.name,'Theodore eE - -');assert.equal(f.out.length,0);
});
test('Name changes are account-isolated and protected by authentication and origin',async()=>{
  const f=fixture();await f.run('/api/me',{method:'PUT',body:{name:'First user'}});assert.equal((await f.run('/api/me',{owner:'owner-b',name:'Second User'})).body.name,'Cdr. Sara Khan');
  await f.run('/api/me',{owner:'owner-b',method:'PUT',body:{name:'Second user'}});assert.equal((await f.run('/api/me')).body.name,'First user');assert.equal((await f.run('/api/me',{owner:'owner-b'})).body.name,'Second user');
  for(const method of ['GET','PUT'])assert.equal((await f.run('/api/me',{owner:null,method,...(method==='PUT'?{body:{name:'Spoofing'}}:{})})).status,401);
  assert.equal((await f.run('/api/me',{method:'PUT',origin:'https://other.test',body:{name:'Spoofing'}})).status,403);assert.equal((await f.run('/api/me',{method:'PUT',body:{name:'Spoofing',owner_id:'owner-b'}})).status,400);assert.equal((await f.run('/api/me')).body.name,'First user');
});
test('An old tab from another account cannot save an old name after authentication changes',async()=>{
  const f=fixture(),first=(await f.run('/api/me')).body,second=(await f.run('/api/me',{owner:'owner-b',name:'Second Account'})).body;
  assert.equal((await f.run('/api/me',{method:'PUT',expectedScope:first.storageScope,body:{name:'First account name'}})).status,200);
  const stale=await f.run('/api/me',{owner:'owner-b',method:'PUT',expectedScope:first.storageScope,body:{name:'Old draft'}});assert.equal(stale.status,409);assert.equal(stale.body.error,'profile_changed');assert.equal((await f.run('/api/me',{owner:'owner-b',name:'Second Account'})).body.name,'Cdr. Sara Khan');
  assert.equal((await f.run('/api/me',{method:'PUT',expectedScope:second.storageScope,body:{name:'Spoofing'}})).status,409);assert.equal((await f.run('/api/me')).body.name,'First account name');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_profiles').get().n,1);
});
test('Empty, long, control-containing and invalid names do not change the profile',async()=>{
  const f=fixture();await f.run('/api/me',{method:'PUT',body:{name:'Saved name'}});
  for(const name of ['', '   ', 'a'.repeat(101), 'A\nB', 'A\tB', '\u0000Name', 'Name\u007f', 4, null, {}, []])assert.equal((await f.run('/api/me',{method:'PUT',body:{name}})).status,400,String(name));
  for(const body of [{},[],null,'Name',{name:'Name',extra:true}])assert.equal((await f.run('/api/me',{method:'PUT',body})).status,400);
  assert.equal((await f.run('/api/me')).body.name,'Saved name');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_profiles').get().n,1);
});
test('First name NasaGPT does not change group-chat authors or rewrite history',async()=>{
  const f=fixture(),id=webcrypto.randomUUID(),other=webcrypto.randomUUID(),body={id,content:'Original author text'};
  const insert=f.sql.prepare('INSERT INTO team_chat_messages (id,owner_id,author_name,content,attachments_json,created_at) VALUES (?,?,?,?,?,?)');
  insert.run(id,'owner-a','Original Author',body.content,'[]','2026-11-05T10:00:00Z');insert.run(other,'owner-b','Jessica Meir','Astronaut message','[]','2026-11-05T10:01:00Z');
  await f.run('/api/me',{method:'PUT',body:{name:'New name NasaGPT'}});await f.run('/api/me',{owner:'owner-b',method:'PUT',body:{name:'Another name NasaGPT'}});
  const visible=(await f.run('/api/team-chat')).body.messages;assert.equal(visible.find(item=>item.id===id).authorName,'Cdr. Sara Khan');assert.equal(visible.find(item=>item.id===other).authorName,'Jessica Meir');
  const foreign=(await f.run('/api/team-chat',{owner:'owner-b'})).body.messages;assert.equal(foreign.find(item=>item.id===id).authorName,'Original Author');assert.equal(foreign.find(item=>item.id===other).authorName,'Cdr. Sara Khan');
  const original=f.sql.prepare('SELECT author_name,content FROM team_chat_messages WHERE id=?').get(id);assert.equal(original.author_name,'Original Author');assert.equal(original.content,body.content);
  const retry=await f.run('/api/team-chat',{method:'POST',body});assert.equal(retry.status,200);assert.equal(retry.body.message.authorName,'Cdr. Sara Khan');
  const fresh=await f.run('/api/team-chat',{method:'POST',name:'Stale Header Name',body:{id:webcrypto.randomUUID(),content:'New message'}});assert.equal(fresh.body.message.authorName,'Cdr. Sara Khan');assert.equal(f.sql.prepare('SELECT author_name FROM team_chat_messages WHERE id=?').get(fresh.body.message.id).author_name,'Cdr. Sara Khan');assert.equal(f.out.length,0);
});
test('Personal stories use Sara Khan, name NasaGPT does not change captions or saved authors',async()=>{
  const f=fixture(),id=webcrypto.randomUUID(),other=webcrypto.randomUUID(),insert=f.sql.prepare('INSERT INTO personal_stories (id,owner_id,author_name,caption,media_kind,object_key,mime,bytes,width,height,digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(id,'owner-a','Original Author','Original caption Original Author','photo','old-story','image/jpeg',128,32,32,'old-digest','2026-11-05T10:00:00Z');insert.run(other,'owner-b','Other Author','Another caption','photo','other-story','image/jpeg',128,32,32,'other-digest','2026-11-05T10:00:00Z');
  await f.run('/api/me',{method:'PUT',body:{name:'New name NasaGPT'}});const story=(await f.run('/api/stories')).body.stories[0];assert.equal(story.author,'Cdr. Sara Khan');assert.equal(story.caption,'Original caption Original Author');
  const stored=f.sql.prepare('SELECT author_name,caption FROM personal_stories WHERE id=?').get(id);assert.equal(stored.author_name,'Original Author');assert.equal(stored.caption,story.caption);const foreign=(await f.run('/api/stories',{owner:'owner-b'})).body.stories;assert.equal(foreign.length,1);assert.equal(foreign[0].author,'Cdr. Sara Khan');assert.equal(foreign[0].caption,'Another caption');assert.equal(foreign[0].id,other);assert.equal(f.sql.prepare('SELECT author_name FROM personal_stories WHERE id=?').get(other).author_name,'Other Author');
  const form=new FormData(),bytes=new Uint8Array(128);bytes.set([255,216,255]);for(const [key,value]of Object.entries({id:webcrypto.randomUUID(),author:'Spoofed author caption',caption:'New caption',kind:'photo',width:32,height:32}))form.set(key,String(value));form.set('file',new Blob([bytes],{type:'image/jpeg'}),'story.jpg');
  const fresh=await f.run('/api/stories',{method:'POST',body:form});assert.equal(fresh.status,201);assert.equal(fresh.body.story.author,'Cdr. Sara Khan');assert.equal(f.sql.prepare('SELECT author_name FROM personal_stories WHERE id=?').get(fresh.body.story.id).author_name,'Cdr. Sara Khan');
  const retry=await f.run('/api/stories',{method:'POST',body:form});assert.equal(retry.status,200);assert.equal(retry.body.story.author,'Cdr. Sara Khan');assert.equal((await f.run('/api/me')).body.name,'New name NasaGPT');
});
test('Self-reports are saved with the note, returned in the book with server label and timestamp',async()=>{const f=fixture(),saved=await f.note();assert.equal(saved.status,201);const report=saved.body.message.wellbeing;assert.equal(report.score,70);assert.equal(report.wellbeingScale,100);assert.equal(report.label,'Good');assert.equal(report.source,'self_report');assert.ok(Number.isFinite(Date.parse(report.recordedAt)));const book=await f.run('/api/astronauts/jessica-meir/book');assert.deepEqual(book.body.entries[0].wellbeing,report);assert.equal(f.out.length,0);});
test('Out-of-range and fractional scores are not saved, missing scores are not invented',async()=>{const f=fixture();for(const score of [0,101,3.5,'80',null]){if(score===null){const saved=await f.note(null);assert.equal(saved.status,201);assert.equal(saved.body.message.wellbeing,undefined);}else assert.equal((await f.note(score)).status,400);}assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,1);});
test('Retrying does not change the original self-report or duplicate the entry',async()=>{const f=fixture(),first=await f.note(30),id=first.body.message.id;const retry=await f.run('/api/astronauts/jessica-meir/messages',{method:'POST',body:{id,content:first.body.message.content,language:'en',mode:'diary',attachments:[],wellbeing:{score:90,wellbeingScale:100}}});assert.equal(retry.status,200);assert.equal(retry.body.message.wellbeing.score,30);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,1);});
test('Group chat uses a separate table and is excluded from book and vector indexing',async()=>{const f=fixture(),id=webcrypto.randomUUID(),reply=await f.run('/api/chat',{method:'POST',body:{id,content:'Hello',wellbeing:{score:80,wellbeingScale:100}}});assert.equal(reply.status,201);assert.equal(reply.body.message.wellbeing.score,80);assert.ok(reply.body.reply);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,0);assert.equal((await f.run('/api/astronauts/jessica-meir/book')).body.total,0);assert.equal((await f.run('/api/astronauts/jessica-meir/book-index')).body.entries.length,0);assert.equal(f.out.length,1);assert.equal(f.out[0].body.store,false);});
test('Another owner cannot read group-chat history or reuse ID another message',async()=>{const f=fixture(),id=webcrypto.randomUUID();await f.run('/api/chat',{method:'POST',body:{id,content:'Personal conversation'}});assert.deepEqual((await f.run('/api/chat',{owner:'owner-b'})).body.messages,[]);assert.equal((await f.run('/api/chat',{owner:'owner-b',method:'POST',body:{id,content:'Personal conversation'}})).status,409);});
test('Model failure preserves the message, retry creates one response without duplicates',async()=>{const f=fixture(),id=webcrypto.randomUUID();f.provider(503);const first=await f.run('/api/chat',{method:'POST',body:{id,content:'How should I organize my day?'}});assert.equal(first.status,201);assert.equal(first.body.reply,null);assert.equal(first.body.message.pending,true);assert.equal((await f.run('/api/chat')).body.messages.length,1);f.provider(200);const second=await f.run('/api/chat',{method:'POST',body:{id,content:'How should I organize my day?'}});assert.ok(second.body.reply);await f.run('/api/chat',{method:'POST',body:{id,content:'How should I organize my day?'}});assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM general_chat_messages').get().n,2);});
test('Air gap preserves shared chat and prohibits external model calls',async()=>{const f=fixture(),saved=await f.run('/api/chat',{method:'POST',environment:{AIR_GAP:'1'},body:{id:webcrypto.randomUUID(),content:'My note'}});assert.equal(saved.status,201);assert.equal(saved.body.replyError,'assistant_unavailable');assert.equal(f.out.length,0);});
test('Shared chat context excludes private diary notes',async()=>{const f=fixture();await f.note(50,'jessica-meir','owner-a','Private entry for vector diary.');await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Hello'}});assert.ok(!JSON.stringify(f.out[0]).includes('Private entry'));});
test('Favorites use canonical text and score from the original entry',async()=>{const f=fixture(),saved=await f.note(),entry=saved.body.message;const favorite=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'diary',sourceId:entry.id,profile:'jessica-meir',content:'Spoofed text',wellbeing:{score:1}}});assert.equal(favorite.status,200);assert.equal(favorite.body.item.content,entry.content);assert.equal(favorite.body.item.wellbeing.score,70);const again=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'diary',sourceId:entry.id,profile:'jessica-meir'}});assert.equal(again.body.item.id,favorite.body.item.id);assert.equal((await f.run('/api/favorites')).body.items.length,1);});
test('Favorites are protected from another owner, wrong profiles and spoofed sources',async()=>{const f=fixture(),entry=(await f.note()).body.message;for(const options of [{owner:'owner-b',profile:'jessica-meir'},{owner:'owner-a',profile:'jack-hathaway'}])assert.equal((await f.run('/api/favorites',{owner:options.owner,method:'PUT',body:{sourceType:'diary',sourceId:entry.id,profile:options.profile}})).status,404);assert.deepEqual((await f.run('/api/favorites',{owner:'owner-b'})).body.items,[]);});
test('A shared-chat answer can be bookmarked and unbookmarked without deleting it',async()=>{const f=fixture(),chat=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Hello'}}),reply=chat.body.reply;const saved=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'chat',sourceId:reply.id}});assert.equal(saved.body.item.content,reply.content);await f.run('/api/favorites/'+saved.body.item.id,{method:'DELETE',owner:'owner-b'});assert.equal((await f.run('/api/favorites')).body.items.length,1);await f.run('/api/favorites/'+saved.body.item.id,{method:'DELETE'});assert.equal((await f.run('/api/favorites')).body.items.length,0);assert.equal((await f.run('/api/chat')).body.messages.length,2);});
test('The diary index includes self-reports, ordinary chat cannot be indexed',async()=>{const f=fixture();const note=await f.note(20);const index=await f.run('/api/astronauts/jessica-meir/book-index');assert.equal(index.body.entries.length,1);assert.ok(index.body.entries[0].content.includes('20/100'));assert.ok(index.body.entries[0].content.includes('Very poor'));assert.equal(index.body.entries[0].id,note.body.message.id);});
test('RAG-answers receive selected records from their owner and profile only',async()=>{const f=fixture(),first=(await f.note(70)).body.message,second=(await f.note(80,'jack-hathaway')).body.message;const good=await f.run('/api/astronauts/jessica-meir/book-answer',{method:'POST',body:{query:'How was my wellbeing?',ids:[first.id]}});assert.equal(good.status,200);assert.equal(good.body.references[0].id,first.id);assert.ok(JSON.stringify(f.out[0]).includes('70/100'));const n=f.out.length;for(const [owner,id] of [['owner-b',first.id],['owner-a',second.id]])assert.equal((await f.run('/api/astronauts/jessica-meir/book-answer',{owner,method:'POST',body:{query:'What was recorded?',ids:[id]}})).status,404);assert.equal(f.out.length,n);});
test('Authentication and origin protection apply to chat, favorites and RAG',async()=>{const f=fixture();for(const path of ['/api/chat','/api/favorites','/api/astronauts/jessica-meir/book-answer']){assert.equal((await f.run(path,{owner:null})).status,401);assert.equal((await f.run(path,{method:'POST',origin:'https://other.test',body:{}})).status,403);}assert.equal(f.out.length,0);});
test('Shared-chat pagination preserves messages with identical timestamps',async()=>{const f=fixture();for(let i=0;i<45;i++)f.sql.prepare('INSERT INTO general_chat_messages (id,owner_id,role,content,created_at) VALUES (?,?,?,?,?)').run('00000000-0000-0000-0000-'+String(i).padStart(12,'0'),'owner-a','user','Test '+i,'2026-10-29T00:00:00Z');const first=await f.run('/api/chat'),second=await f.run('/api/chat?cursor='+encodeURIComponent(first.body.cursor));assert.equal(first.body.messages.length,40);assert.equal(second.body.messages.length,5);assert.equal(new Set([...first.body.messages,...second.body.messages].map(row=>row.id)).size,45);});

test('NasaGPT receives conversational instructions, a greeting and model answer without a diary template',async()=>{const f=fixture();f.provider(200,'Hi! How are you doing today?');const reply=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'hi'}});assert.equal(reply.body.reply.content,'Hi! How are you doing today?');const messages=f.out[0].body.messages;assert.ok(messages[0].content.includes('You are NasaGPT'));assert.ok(messages[0].content.includes('This is an ordinary conversation'));assert.equal(messages.at(-1).content,'hi');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,0);});

test('Personal profiles are isolated from friends’ archives and other owners',async()=>{const f=fixture(),own=await f.note(80,'personal');await f.note(20,'jessica-meir');const book=await f.run('/api/astronauts/personal/book');assert.equal(book.status,200);assert.equal(book.body.entries.length,1);assert.equal(book.body.entries[0].id,own.body.message.id);assert.equal((await f.run('/api/astronauts/personal/book',{owner:'owner-b'})).body.total,0);assert.equal((await f.run('/api/astronauts/jessica-meir/book')).body.total,1);const saved=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'diary',sourceId:own.body.message.id,profile:'personal'}});assert.equal(saved.status,200);});
test('A new personal story includes self-report and rejects a friend’s readings',()=>{const f=fixture(),health=f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt:new Date().toISOString(),wellbeing:{score:80,wellbeingScale:100},metrics:{hr:112,spo2:94,temp:38.1,fatigue:8}}));assert.equal(health.wellbeing.score,80);assert.equal(health.metrics.hr,null);assert.equal(health.metrics.spo2,null);assert.equal(health.metrics.temp,null);assert.equal(health.metrics.fatigue,null);assert.throws(()=>f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'jessica-meir',capturedAt:new Date().toISOString(),wellbeing:{score:80,wellbeingScale:100}})));});

test('The activity feed records actual saves once and is owner-isolated',async()=>{const f=fixture(),saved=await f.note(80,'personal');const first=await f.run('/api/activity');assert.equal(first.status,200);assert.equal(first.body.events.length,1);assert.equal(first.body.events[0].kind,'diary_saved');assert.ok(first.body.events[0].summary.includes(saved.body.message.content));await f.run('/api/astronauts/personal/messages',{method:'POST',body:{id:saved.body.message.id,content:saved.body.message.content,language:'en',mode:'diary',attachments:[]}});assert.equal((await f.run('/api/activity')).body.events.length,1);assert.equal((await f.run('/api/activity',{owner:'owner-b'})).body.events.length,0);});
test('The feed accepts confirmed interface actions, but not invented publications',async()=>{const f=fixture(),id=webcrypto.randomUUID();for(let i=0;i<2;i++)assert.equal((await f.run('/api/activity',{method:'POST',body:{id,kind:'navigation',target:'overview'}})).status,201);assert.equal((await f.run('/api/activity')).body.events.length,1);for(const body of [{kind:'story_published'},{kind:'navigation',target:'constructor'},{kind:'draft',area:'chat',length:-1}])assert.equal((await f.run('/api/activity',{method:'POST',body:{id:webcrypto.randomUUID(),...body}})).status,400);assert.equal((await f.run('/api/activity',{owner:null})).status,401);assert.equal((await f.run('/api/activity',{method:'POST',origin:'https://other.test',body:{id,kind:'training_review'}})).status,403);});

function storedNote(f,{id=webcrypto.randomUUID(),owner='owner-a',profile='personal',role='note',content='Original entry - score 8/10.',report={score:8,label:'Good',source:'self_report',recordedAt:'2026-10-07T10:00:00.000Z'},date='2026-10-07T10:00:01.000Z'}={}){
  const raw=report===null?null:typeof report==='string'?report:JSON.stringify(report);
  f.sql.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,wellbeing_json) VALUES (?,?,?,?,?,?,?,?,?)').run(id,owner,profile,role,content,'en',date,'indexed',raw);
  return {id,owner,profile,raw,content,date};
}

test('The new scale accepts endpoints 1 and 100 without multiplying an explicitly supplied scale',async()=>{
  const f=fixture();
  for(const [score,label]of [[1,'Very poor'],[20,'Very poor'],[21,'Below usual'],[40,'Below usual'],[41,'Okay'],[60,'Okay'],[61,'Good'],[80,'Good'],[81,'Excellent'],[100,'Excellent']]){
    const saved=await f.note(score,'personal');
    assert.equal(saved.status,201);assert.equal(saved.body.message.wellbeing.score,score);assert.equal(saved.body.message.wellbeing.wellbeingScale,100);assert.equal(saved.body.message.wellbeing.label,label);
    const raw=JSON.parse(f.sql.prepare('SELECT wellbeing_json FROM journal_messages WHERE id=?').get(saved.body.message.id).wellbeing_json);
    assert.equal(raw.score,score);assert.equal(raw.wellbeingScale,100);
  }
});

test('Scale endpoints and types are validated before saving a new self-report',async()=>{
  const f=fixture();
  for(const report of [{score:0,wellbeingScale:100},{score:101,wellbeingScale:100},{score:1.5,wellbeingScale:100},{score:'80',wellbeingScale:100},{score:80,wellbeingScale:'100'},{score:80,wellbeingScale:null},{score:8,wellbeingScale:5},{score:11},{score:11,wellbeingScale:10},[]]){
    const result=await f.run('/api/astronauts/personal/messages',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Range check',language:'en',mode:'diary',wellbeing:report}});
    assert.equal(result.status,400);assert.equal(result.body.error,'invalid_wellbeing');
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,0);
});

test('Legacy clients using scale 10 receive a normalized score and save the new format',async()=>{
  const f=fixture();
  for(const wellbeing of [{score:8},{score:8,wellbeingScale:10}]){
    const result=await f.run('/api/astronauts/personal/messages',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Legacy client compatibility',language:'en',mode:'diary',wellbeing}});
    assert.equal(result.status,201);assert.equal(result.body.message.wellbeing.score,80);assert.equal(result.body.message.wellbeing.wellbeingScale,100);
  }
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM journal_messages WHERE json_extract(wellbeing_json,'$.score')=80 AND json_extract(wellbeing_json,'$.wellbeingScale')=100").get().n,2);
});

test('Migration invalidates only old vectors without rewriting text, scores, or activity',async()=>{
  const f=fixture({beforeHundred:true});
  const legacy=storedNote(f),friend=storedNote(f,{profile:'jessica-meir',report:{score:3,source:'self_report'}}),current=storedNote(f,{report:{score:8,wellbeingScale:100,source:'self_report'}}),other=storedNote(f,{owner:'owner-b',report:{score:99,wellbeingScale:100,source:'self_report'}}),missing=storedNote(f,{report:null}),malformed=storedNote(f,{report:'{'}),assistant=storedNote(f,{role:'assistant'});
  const notes=[legacy,friend,current,other,missing,malformed,assistant];
  for(const note of notes)f.sql.prepare('INSERT INTO journal_text_vectors (message_id,owner_id,astronaut_id,model,vectors_json,indexed_at) VALUES (?,?,?,?,?,?)').run(note.id,note.owner,note.profile,model,'[]','2026-10-08T00:00:00Z');
  f.sql.prepare('INSERT INTO activity_events (id,owner_id,kind,summary,created_at) VALUES (?,?,?,?,?)').run('old-wellbeing','owner-a','wellbeing','Selected wellbeing / 8 from 10','2026-10-07T10:00:00Z');
  const original=notes.map(note=>({...f.sql.prepare('SELECT id,owner_id,astronaut_id,role,content,created_at,wellbeing_json FROM journal_messages WHERE id=?').get(note.id)}));
  f.migrateHundred();
  assert.deepEqual(notes.map(note=>({...f.sql.prepare('SELECT id,owner_id,astronaut_id,role,content,created_at,wellbeing_json FROM journal_messages WHERE id=?').get(note.id)})),original);
  for(const note of [legacy,friend]){assert.equal(f.sql.prepare('SELECT vector_status FROM journal_messages WHERE id=?').get(note.id).vector_status,'pending');assert.equal(f.sql.prepare('SELECT * FROM journal_text_vectors WHERE message_id=?').get(note.id),undefined);}
  for(const note of [current,other,missing,malformed,assistant]){assert.equal(f.sql.prepare('SELECT vector_status FROM journal_messages WHERE id=?').get(note.id).vector_status,'indexed');assert.ok(f.sql.prepare('SELECT * FROM journal_text_vectors WHERE message_id=?').get(note.id));}
  assert.equal(f.sql.prepare('SELECT summary FROM activity_events').get().summary,'Selected wellbeing / 8 from 10');
  const pending=await f.run('/api/astronauts/personal/book-index');
  assert.deepEqual(pending.body.entries.map(row=>row.id),[legacy.id]);assert.ok(pending.body.entries[0].content.includes('80/100'));assert.ok(pending.body.entries[0].content.includes('Original entry - score 8/10.'));
});

test('Moving hosted vector storage queues existing entries without changing their contents or browser vectors',()=>{
  const f=fixture(),notes=[storedNote(f),storedNote(f,{owner:'owner-b'}),storedNote(f,{role:'assistant'})];
  for(const note of notes)f.sql.prepare('INSERT INTO journal_text_vectors (message_id,owner_id,astronaut_id,model,vectors_json,indexed_at) VALUES (?,?,?,?,?,?)').run(note.id,note.owner,note.profile,model,'[]','2026-11-13T00:00:00Z');
  const before=f.sql.prepare('SELECT id,owner_id,astronaut_id,role,content,created_at,wellbeing_json FROM journal_messages ORDER BY id').all();
  f.sql.exec(hostedMemoryMigration);
  assert.deepEqual(f.sql.prepare('SELECT id,owner_id,astronaut_id,role,content,created_at,wellbeing_json FROM journal_messages ORDER BY id').all(),before);
  for(const note of notes){assert.equal(f.sql.prepare('SELECT vector_status FROM journal_messages WHERE id=?').get(note.id).vector_status,before.find(row=>row.id===note.id).role==='assistant'?'indexed':'pending');assert.ok(f.sql.prepare('SELECT * FROM journal_text_vectors WHERE message_id=?').get(note.id));}
});

test('Old JSON snapshots are normalized in responses without changing originals or owner boundaries',async()=>{
  const f=fixture({beforeHundred:true}),note=storedNote(f),raw=note.raw,chatId=webcrypto.randomUUID(),favoriteId=webcrypto.randomUUID(),storyId=webcrypto.randomUUID();
  f.sql.prepare('INSERT INTO general_chat_messages (id,owner_id,role,content,created_at,wellbeing_json) VALUES (?,?,?,?,?,?)').run(chatId,'owner-a','user','Old message 8/10.',note.date,raw);
  f.sql.prepare('INSERT INTO personal_favorites (id,owner_id,source_type,source_id,profile_id,content,source_created_at,created_at,wellbeing_json) VALUES (?,?,?,?,?,?,?,?,?)').run(favoriteId,'owner-a','diary',note.id,'personal',note.content,note.date,note.date,raw);
  const health=JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt:'2026-10-07T10:00:00Z',wellbeing:JSON.parse(raw),metrics:{hr:null,spo2:null,temp:null,fatigue:null}});
  f.sql.prepare('INSERT INTO personal_stories (id,owner_id,author_name,caption,health_json,media_kind,object_key,mime,bytes,width,height,digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(storyId,'owner-a','Egor Fedosov','Archive caption',health,'photo','test-story','image/jpeg',128,32,32,'test-digest',note.date);
  f.migrateHundred();
  const book=(await f.run('/api/astronauts/personal/book')).body.entries[0],chat=(await f.run('/api/chat')).body.messages[0],favorite=(await f.run('/api/favorites')).body.items[0],story=(await f.run('/api/stories')).body.stories[0];
  for(const report of [book.wellbeing,chat.wellbeing,favorite.wellbeing,story.health.wellbeing]){assert.equal(report.score,80);assert.equal(report.wellbeingScale,100);assert.equal(report.recordedAt,'2026-10-07T10:00:00.000Z');}
  assert.equal(book.content,note.content);assert.equal(chat.content,'Old message 8/10.');assert.equal(story.health.capturedAt,'2026-10-07T10:00:00Z');
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM journal_messages').get().wellbeing_json,raw);
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM general_chat_messages').get().wellbeing_json,raw);
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM personal_favorites').get().wellbeing_json,raw);
  assert.equal(f.sql.prepare('SELECT health_json FROM personal_stories').get().health_json,health);
  assert.equal((await f.run('/api/astronauts/personal/book',{owner:'owner-b'})).body.total,0);assert.equal((await f.run('/api/chat',{owner:'owner-b'})).body.messages.length,0);assert.equal((await f.run('/api/favorites',{owner:'owner-b'})).body.items.length,0);assert.equal((await f.run('/api/stories',{owner:'owner-b'})).body.stories.length,0);
});

test('New personal snapshots use scale 100 while old demonstration fatigue retains scale 10',()=>{
  const f=fixture(),capturedAt=new Date().toISOString();
  for(const score of [1,100]){const value=f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt,wellbeing:{score,wellbeingScale:100}}));assert.equal(value.wellbeing.score,score);assert.equal(value.wellbeing.wellbeingScale,100);assert.equal(value.metrics.fatigue,null);}
  const legacy=f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt,wellbeing:{score:8}}));assert.equal(legacy.wellbeing.score,80);
  const demo=f.validateHealth(JSON.stringify({version:1,source:'demo_dashboard',profileId:'jessica-meir',capturedAt,metrics:{hr:72,spo2:98,temp:36.6,fatigue:8}}));assert.equal(demo.metrics.fatigue,8);assert.equal(demo.wellbeing,undefined);
  assert.throws(()=>f.validateHealth(JSON.stringify({...demo,metrics:{...demo.metrics,fatigue:80}})));
});

test('Historical events keep their original scale while new ones receive 100',async()=>{
  const f=fixture();f.sql.prepare('INSERT INTO activity_events (id,owner_id,kind,summary,created_at) VALUES (?,?,?,?,?)').run('old-event','owner-a','wellbeing','Selected wellbeing / 8 from 10','2026-10-07T10:00:00Z');
  for(const score of [1,100])assert.equal((await f.run('/api/activity',{method:'POST',body:{id:webcrypto.randomUUID(),kind:'wellbeing',score,wellbeingScale:100}})).status,201);
  const events=(await f.run('/api/activity')).body.events;
  assert.ok(events.some(row=>row.summary==='Selected wellbeing / 8 from 10'));assert.ok(events.some(row=>row.summary==='Selected wellbeing / 1 from 100'));assert.ok(events.some(row=>row.summary==='Selected wellbeing / 100 from 100'));
  assert.equal((await f.run('/api/activity',{method:'POST',body:{id:webcrypto.randomUUID(),kind:'wellbeing',score:101,wellbeingScale:100}})).status,400);
});

test('Context NasaGPT normalizes the old score to 100 and keeps conversation text unchanged',async()=>{
  const f=fixture(),id=webcrypto.randomUUID(),raw=JSON.stringify({score:8,label:'Good',source:'self_report',recordedAt:'2026-10-07T10:00:00Z'});
  f.sql.prepare('INSERT INTO general_chat_messages (id,owner_id,role,content,created_at,wellbeing_json) VALUES (?,?,?,?,?,?)').run(id,'owner-a','user','Written by me 8/10.','2026-10-07T10:00:00Z',raw);
  const answer=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Hello',wellbeing:{score:1,wellbeingScale:100}}});assert.equal(answer.status,201);
  const messages=f.out[0].body.messages;assert.ok(messages[0].content.includes('scale 1-100'));assert.ok(messages.some(row=>row.content==='Written by me 8/10.\nSelf-reported wellbeing: 80/100.'));assert.ok(messages.at(-1).content.includes('1/100.'));
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM general_chat_messages WHERE id=?').get(id).wellbeing_json,raw);
});

test('Training receives normalized self-reports without changing originals',async()=>{
  const f=fixture(),original=[];
  for(let i=0;i<20;i++)original.push(storedNote(f,{content:'Recording '+i+' '+('Detailed personal diary description of wellbeing and sleep. '.repeat(2))}));
  storedNote(f,{owner:'owner-b',content:'Another owner - private data. '.repeat(4)});storedNote(f,{profile:'jessica-meir',content:'Another profile - private data. '.repeat(4)});
  const result=await f.run('/api/astronauts/personal/training',{method:'POST',environment:{TRAINING_URL:'http://trainer.internal'},body:{id:webcrypto.randomUUID(),confirm:true}});
  assert.equal(result.status,202);assert.equal(f.out.length,1);const payload=f.out[0].body;assert.equal(payload.entries.length,20);assert.equal(payload.profile,'personal');assert.equal(payload.ownerId,'owner-a');assert.ok(payload.entries.every(entry=>entry.includes('80/100 / Good')));assert.ok(payload.entries.every(entry=>!entry.includes('private data')));
  for(const note of original){const row=f.sql.prepare('SELECT content,wellbeing_json FROM journal_messages WHERE id=?').get(note.id);assert.equal(row.content,note.content);assert.equal(row.wellbeing_json,note.raw);}
});


test('Crew chat is visible to site participants, does not call models or copy private data',async()=>{
  const f=fixture();await f.note(30,'personal','owner-a','Personal entry');await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Personal NasaGPT'}});const calls=f.out.length;
  const saved=await f.run('/api/team-chat',{method:'POST',name:'Egor',body:{id:webcrypto.randomUUID(),content:'Let’s discuss the project',wellbeing:{score:10},authorName:'Spoofing'}});
  assert.equal(saved.status,201);assert.equal(saved.body.message.authorName,'Cdr. Sara Khan');assert.equal(saved.body.message.isOwn,true);assert.equal(saved.body.message.wellbeing,undefined);
  const team=await f.run('/api/team-chat',{owner:'owner-b'});assert.equal(team.body.messages.length,1);assert.equal(team.body.messages[0].isOwn,false);assert.equal(team.body.messages[0].content,'Let’s discuss the project');assert.equal(team.body.messages[0].ownerId,undefined);assert.equal(f.out.length,calls);
  assert.equal((await f.run('/api/chat',{owner:'owner-b'})).body.messages.length,0);
});
test('Retrying a crew message does not duplicate it, another owner’s ID and text changes are rejected',async()=>{
  const f=fixture(),body={id:webcrypto.randomUUID(),content:'Let’s check the build'};assert.equal((await f.run('/api/team-chat',{method:'POST',body})).status,201);assert.equal((await f.run('/api/team-chat',{method:'POST',body})).status,200);
  assert.equal((await f.run('/api/team-chat',{owner:'owner-b',method:'POST',body})).status,409);assert.equal((await f.run('/api/team-chat',{method:'POST',body:{...body,content:'Different text'}})).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM team_chat_messages').get().n,1);
});
test('Authentication and origin protection apply to crew chat and files',async()=>{
  const f=fixture();for(const path of ['/api/team-chat','/api/chat-files']){assert.equal((await f.run(path,{owner:null})).status,401);assert.equal((await f.run(path,{method:'POST',origin:'https://other.test',body:{}})).status,403);}
});
test('Crew pagination preserves equal timestamps without revealing the internal ID owner',async()=>{
  const f=fixture();for(let i=0;i<45;i++)f.sql.prepare('INSERT INTO team_chat_messages (id,owner_id,author_name,content,created_at) VALUES (?,?,?,?,?)').run('00000000-0000-0000-0000-'+String(i).padStart(12,'0'),'owner-a','Egor','Message '+i,'2026-11-05T00:00:00Z');
  const first=await f.run('/api/team-chat'),next=await f.run('/api/team-chat?cursor='+encodeURIComponent(first.body.cursor));assert.equal(first.body.messages.length,40);assert.equal(next.body.messages.length,5);assert.equal(new Set([...first.body.messages,...next.body.messages].map(row=>row.id)).size,45);
});
async function uploadChatFile(f,room='private',owner='owner-a'){
  const body=new FormData();body.set('room',room);body.set('file',new Blob(['Test file'],{type:'text/plain'}),'check.txt');return f.run('/api/chat-files',{method:'POST',owner,body});
}
test('A personal file is owner-only and attaches to that owner’s message NasaGPT',async()=>{
  const f=fixture(),uploaded=await uploadChatFile(f);assert.equal(uploaded.status,201);const file=uploaded.body.file;
  assert.equal((await f.run(file.url,{owner:'owner-b'})).status,404);const saved=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Document',attachments:[file.id]}});assert.equal(saved.body.message.attachments[0].name,'check.txt');assert.equal((await f.run('/api/chat')).body.messages[0].attachments[0].id,file.id);
  assert.equal((await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Scope spoofing',attachments:[file.id]}})).status,404);
  const downloaded=await f.run(file.url);assert.equal(downloaded.body,'Test file');assert.equal(downloaded.headers.get('content-type'),'application/octet-stream');assert.ok(downloaded.headers.get('content-disposition').startsWith('attachment;'));
});
test('A crew file becomes readable to others only after explicit sharing in group chat',async()=>{
  const f=fixture(),file=(await uploadChatFile(f,'team')).body.file;assert.equal((await f.run(file.url,{owner:'owner-b'})).status,404);
  assert.equal((await f.run('/api/team-chat',{owner:'owner-b',method:'POST',body:{id:webcrypto.randomUUID(),content:'Another file',attachments:[file.id]}})).status,404);
  const saved=await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'',attachments:[file.id]}});assert.equal(saved.status,201);assert.equal((await f.run(file.url,{owner:'owner-b'})).status,200);assert.equal((await f.run('/api/team-chat',{owner:'owner-b'})).body.messages[0].attachments[0].id,file.id);assert.equal(f.out.length,0);
});
test('Empty messages, duplicate attachments and unknown files are not saved',async()=>{
  const f=fixture(),file=(await uploadChatFile(f,'team')).body.file;
  for(const body of [{content:''},{content:'Text',attachments:[file.id,file.id]},{content:'Text',attachments:['not ID']},{content:'Text',attachments:Array.from({length:5},()=>webcrypto.randomUUID())}])assert.equal((await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),...body}})).status,400);
  assert.equal((await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Text',attachments:[webcrypto.randomUUID()]}})).status,404);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM team_chat_messages').get().n,0);
});
test('Metadata write failure removes only the newly uploaded object',async()=>{
  const f=fixture();f.sql.exec('DROP TABLE chat_files');const result=await uploadChatFile(f);assert.equal(result.status,503);assert.equal(f.objects.size,0);
});
