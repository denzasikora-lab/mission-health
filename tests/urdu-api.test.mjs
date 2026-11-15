import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url);
const source=(await Promise.all([
  'public/health-rules-core.js','worker/activity.js','worker/scheduler.js','worker/personal.js',
  'worker/photos.js','worker/stories.js','worker/speech.js','worker/training.js','worker/book.js',
  'worker/health-analysis.js','worker/media-analysis.js','worker/index.js'
].map(path=>readFile(new URL(path,root),'utf8')))).join('\n').replace('export default','globalThis.app =');
const migrations=await Promise.all((await readdir(new URL('drizzle/',root))).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(new URL('drizzle/'+name,root),'utf8')));
const urdu='یہ ایک محفوظ مشاہدہ ہے۔';
const greeting='سلام، میری طبیعت کیسی ہے؟';

function fixture(t){
  const sql=new DatabaseSync(':memory:');for(const migration of migrations)sql.exec(migration);t.after(()=>sql.close());
  const objects=new Map(),outgoing=[],intentCalls=[];let answer=urdu;
  const DB={prepare(query){const statement=sql.prepare(query);return {bind(...values){return {first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>statement.run(...values)};}};}};
  const PHOTOS={put:async(key,bytes,options)=>objects.set(key,{bytes,body:bytes,customMetadata:options.customMetadata,httpMetadata:options.httpMetadata}),get:async key=>objects.get(key)||null,delete:async key=>objects.delete(key)};
  const scope={URL,Request,Response,FormData,Blob,Uint8Array,TextEncoder,TextDecoder,DataView,AbortSignal,crypto:webcrypto,atob,btoa,console:{warn(){},error(){}},fetch:async(url,options)=>{
    const body=JSON.parse(options.body);if(body.messages?.[0]?.content?.startsWith('Mission Health scheduler intent.')){intentCalls.push({url,body});return Response.json({choices:[{message:{content:JSON.stringify({isScheduler:false,tasks:[]})}}]});}outgoing.push({url,body});
    const text=body.messages?JSON.stringify(JSON.parse(body.messages[1].content).map(()=>'An earlier diary entry.')):answer;
    return Response.json(body.input?{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}:{choices:[{message:{content:text}}]});
  }};
  vm.runInNewContext(source,scope);
  const env={DB,PHOTOS,LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-test-key',LLM_API_KEY:'synthetic-utility-key',LLM_BASE_URL:'https://utility.test/v1',LLM_MODEL:'test-utility'};
  async function run(path,{method='GET',body,language,owner='owner-a'}={}){
    const headers={};if(!(body instanceof FormData))headers['content-type']='application/json';if(owner)headers['oai-authenticated-user-id']=owner;if(language!==undefined)headers['x-mission-language']=language;
    const response=await scope.app.fetch(new Request('https://mission.test'+path,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)}),env,{waitUntil(){}});
    return {status:response.status,body:await response.json()};
  }
  function mediaForm(id=webcrypto.randomUUID()){
    const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('RIFF'));bytes.set(new TextEncoder().encode('WAVE'),8);
    const form=new FormData();form.set('id',id);form.set('kind','audio');form.set('duration','5');form.set('transcript',greeting);form.set('file',new Blob([bytes],{type:'audio/wav'}),'recording.wav');return form;
  }
  return {sql,outgoing,intentCalls,run,mediaForm,setAnswer:value=>{answer=value;},language:language=>scope.responseLanguage(new Request('https://mission.test',{headers:language===undefined?{}:{'x-mission-language':language}})),display:body=>scope.englishDisplay(body,env,'owner-a')};
}

test('Response language accepts supported headers and defaults to English',t=>{
  const f=fixture(t);assert.equal(f.language('ur'),'ur');assert.equal(f.language('es'),'es');for(const value of [undefined,'en','ru','fr','UR','ur-PK','ur;en'])assert.equal(f.language(value),'en');
});

test('Urdu chat uses an Urdu instruction and retains Urdu text in responses and storage',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),saved=await f.run('/api/chat',{method:'POST',language:'ur',body:{id,content:greeting,attachments:[]}});
  assert.equal(saved.status,201);assert.equal(saved.body.message.content,greeting);assert.equal(saved.body.reply.content,urdu);assert.match(f.outgoing[0].body.input[0].content,/briefly in Urdu/);assert.equal(f.outgoing[0].body.input.findLast(item=>item.role==='user').content,greeting);assert.equal(f.outgoing.length,1);
  assert.equal(f.intentCalls.length,1);assert.match(f.intentCalls[0].body.messages[0].content,/Titles must be in Urdu/);assert.equal(JSON.parse(f.intentCalls[0].body.messages[1].content).message,greeting);assert.equal(saved.body.tasks.length,0);
  assert.equal(f.sql.prepare('SELECT content FROM general_chat_messages WHERE reply_to=?').get(id).content,urdu);
  const history=await f.run('/api/chat',{language:'ur'});assert.equal(history.body.messages.find(item=>item.id===id).content,greeting);assert.equal(history.body.messages.find(item=>item.replyTo===id).content,urdu);assert.equal(f.outgoing.length,1);
});

test('English remains the chat default and unsupported Russian headers cannot select another language',async t=>{
  const f=fixture(t);f.setAnswer('Hello. How are you feeling?');
  for(const language of [undefined,'en','ru']){
    const saved=await f.run('/api/chat',{method:'POST',language,body:{id:webcrypto.randomUUID(),content:'Hello',attachments:[]}});assert.equal(saved.status,201);assert.equal(saved.body.reply.content,'Hello. How are you feeling?');assert.match(f.outgoing.at(-1).body.input[0].content,/briefly in English/);
  }
});

test('Urdu diary entries and replies preserve their saved language while Russian input is rejected',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),saved=await f.run('/api/astronauts/personal/messages',{method:'POST',language:'ur',body:{id,content:greeting,language:'ur',mode:'ask',attachments:[]}});
  assert.equal(saved.status,201);assert.equal(saved.body.message.language,'ur');assert.equal(saved.body.reply.language,'ur');assert.equal(saved.body.reply.content,urdu);assert.match(f.outgoing[0].body.input[0].content,/Always answer in Urdu/);
  const original=f.sql.prepare('SELECT content,language FROM journal_messages WHERE id=?').get(id);assert.equal(original.content,greeting);assert.equal(original.language,'ur');
  const history=await f.run('/api/astronauts/personal/messages',{language:'en'});assert.equal(history.body.messages.find(item=>item.id===id).content,greeting);assert.equal(history.body.messages.find(item=>item.replyTo===id).content,urdu);
  const rejected=await f.run('/api/astronauts/personal/messages',{method:'POST',language:'ru',body:{id:webcrypto.randomUUID(),content:'Unsupported language',language:'ru',mode:'diary',attachments:[]}});assert.equal(rejected.status,400);assert.equal(f.outgoing.length,1);
  const english=await f.run('/api/astronauts/personal/messages',{method:'POST',body:{id:webcrypto.randomUUID(),content:'An English diary entry.',language:'en',mode:'diary',attachments:[]}});assert.equal(english.status,201);assert.equal(english.body.message.language,'en');
});

test('Urdu health analysis localizes prose while JSON status keys and measurements stay canonical',async t=>{
  const f=fixture(t),capturedAt=new Date().toISOString(),reading=(value,unit)=>({value,unit,source:'manual',observedAt:capturedAt});f.setAnswer(JSON.stringify({status:'NORMAL',summary:urdu,alerts:[]}));
  const saved=await f.run('/api/health-analysis',{method:'POST',language:'ur',body:{id:webcrypto.randomUUID(),snapshot:{profileId:'personal',capturedAt,readings:{heart_rate:reading(72,'bpm'),spo2:reading(98,'%'),body_temperature:reading(36.8,'C')}}}});
  assert.equal(saved.status,201);assert.equal(saved.body.result.status,'NORMAL');assert.ok(saved.body.result.summary.includes(urdu));assert.equal(saved.body.snapshot.readings.body_temperature.unit,'C');assert.match(f.outgoing[0].body.input[0].content,/two or three Urdu sentences/);assert.match(f.outgoing[0].body.input[0].content,/JSON keys, status values/);const payload=JSON.parse(f.outgoing[0].body.input[1].content);assert.equal(payload.latest.heart_rate,72);assert.equal(payload.rule_result.status,'NORMAL');assert.equal(f.outgoing.length,1);
});

test('Urdu media analysis stores the initial request language and leaves saved answers unchanged on retry',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),saved=await f.run('/api/media-analysis',{method:'POST',language:'ur',body:f.mediaForm(id)});
  assert.equal(saved.status,200);assert.equal(saved.body.analysis,urdu);assert.match(f.outgoing[0].body.input[0].content,/Answer in Urdu without/);assert.equal(f.outgoing[0].body.input[1].content[0].text.includes(greeting),true);
  const rows=f.sql.prepare('SELECT language,role,content FROM journal_messages WHERE id=? OR reply_to=? ORDER BY role').all(id,id);assert.equal(rows.length,2);assert.ok(rows.every(row=>row.language==='ur'));assert.equal(rows.find(row=>row.role==='assistant').content,urdu);
  const duplicate=await f.run('/api/media-analysis',{method:'POST',language:'en',body:f.mediaForm(id)});assert.equal(duplicate.body.duplicate,true);assert.equal(duplicate.body.analysis,urdu);assert.equal(f.outgoing.length,1);assert.ok(f.sql.prepare('SELECT language FROM journal_messages WHERE id=? OR reply_to=?').all(id,id).every(row=>row.language==='ur'));
});

test('Urdu display values bypass translation and historical Cyrillic still displays in English without rewriting storage',async t=>{
  const f=fixture(t),plain={content:urdu,caption:greeting,language:'ur',score:80};assert.equal(await f.display(plain),plain);assert.equal(f.outgoing.length,0);
  const original=String.fromCodePoint(0x041F,0x0440,0x0438,0x0432,0x0435,0x0442),id=webcrypto.randomUUID();
  f.sql.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status) VALUES (?,?,?,?,?,?,?,?)').run(id,'owner-a','personal','note',original,'ru','2026-11-01T10:00:00.000Z','pending');
  const history=await f.run('/api/astronauts/personal/messages',{language:'ur'});assert.equal(history.body.messages.find(item=>item.id===id).content,'An earlier diary entry.');assert.equal(f.sql.prepare('SELECT content,language FROM journal_messages WHERE id=?').get(id).content,original);assert.equal(f.sql.prepare('SELECT language FROM journal_messages WHERE id=?').get(id).language,'ru');assert.equal(f.outgoing.length,1);assert.match(f.outgoing[0].body.messages[0].content,/Cyrillic prose/);assert.match(f.outgoing[0].body.messages[0].content,/preserve any Urdu text verbatim/);
});


test('Archive answers use the selected Urdu language without rewriting the referenced entry',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID();
  const entry=await f.run('/api/astronauts/personal/messages',{method:'POST',language:'ur',body:{id,content:greeting,language:'ur',mode:'diary',attachments:[]}});assert.equal(entry.status,201);
  const answer=await f.run('/api/astronauts/personal/book-answer',{method:'POST',language:'ur',body:{query:'What did I write?',ids:[id]}});assert.equal(answer.status,200);assert.equal(answer.body.answer,urdu);assert.match(f.outgoing[0].body.input[0].content,/Always answer in Urdu/);assert.equal(f.sql.prepare('SELECT content FROM journal_messages WHERE id=?').get(id).content,greeting);
});


test('Spanish NasaGPT and scheduler requests retain selected language through storage and archive retrieval',async t=>{
  const f=fixture(t),reply='He revisado tu historial.',id=webcrypto.randomUUID();f.setAnswer(reply);
  const saved=await f.run('/api/chat',{method:'POST',language:'es',body:{id,content:'Hola, revisa mi historial.',attachments:[]}});
  assert.equal(saved.status,201);assert.equal(saved.body.reply.content,reply);assert.match(f.outgoing[0].body.input[0].content,/briefly in Spanish/);assert.match(f.intentCalls[0].body.messages[0].content,/Titles must be in Spanish/);assert.equal(f.sql.prepare('select language from general_chat_messages where id=?').get(id).language,'es');
  const history=await f.run('/api/chat',{language:'es'});assert.equal(history.body.messages.find(item=>item.replyTo===id).content,reply);
});

test('Spanish recording analysis preserves the saved language when retried from another locale',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),reply='Grabación analizada.';f.setAnswer(reply);
  const saved=await f.run('/api/media-analysis',{method:'POST',language:'es',body:f.mediaForm(id)});
  assert.equal(saved.status,200);assert.equal(saved.body.analysis,reply);assert.match(f.outgoing[0].body.input[0].content,/Answer in Spanish without/);
  const retry=await f.run('/api/media-analysis',{method:'POST',language:'en',body:f.mediaForm(id)});assert.equal(retry.body.analysis,reply);assert.equal(f.outgoing.length,1);assert.ok(f.sql.prepare('select language from journal_messages where id=? or reply_to=?').all(id,id).every(row=>row.language==='es'));
});
