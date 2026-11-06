import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url);
const source=(await Promise.all(['activity','scheduler','personal','photos','stories','speech','training','book','index'].map(name=>readFile(new URL('worker/'+name+'.js',root),'utf8')))).join('\n').replace('export default','globalThis.app =');
const migrations=await Promise.all((await readdir(new URL('drizzle/',root))).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(new URL('drizzle/'+name,root),'utf8')));
const model='embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:text:256:v1';
function fixture(options={}){
  const sql=new DatabaseSync(':memory:');for(const migration of options.beforeHundred?migrations.slice(0,10):migrations)sql.exec(migration);
  const objects=new Map(),PHOTOS={put:async(key,bytes)=>{objects.set(key,bytes);},get:async key=>objects.has(key)?{body:objects.get(key)}:null,delete:async key=>objects.delete(key)};
  const out=[],DB={prepare(query){
    const statement=sql.prepare(query);
    return {bind(...values){return {first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>statement.run(...values)};}};
  }};
  let status=200,answer='Тестовый ответ по переданному контексту.';
  const scope={URL,Request,Response,FormData,Blob,Uint8Array,TextEncoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{warn(){},error(){}},fetch:async(url,options)=>{out.push({url,body:JSON.parse(options.body)});if(String(url).startsWith('http://trainer.internal/'))return Response.json({id:JSON.parse(options.body).id});return status===200?Response.json({choices:[{message:{content:answer}}]}):new Response('unavailable',{status});}};
  vm.runInNewContext(source,scope);
  const env={DB,PHOTOS,LLM_API_KEY:'test-key',LLM_BASE_URL:'https://model.test/v1',LLM_MODEL:'test-model'};
  const run=async(path,{owner='owner-a',method='GET',body,environment={},origin,name,expectedScope}={})=>{
    const headers=body instanceof FormData?{}:{'content-type':'application/json'};if(name)headers['oai-authenticated-user-full-name']=name;if(owner)headers['oai-authenticated-user-id']=owner;if(origin)headers.origin=origin;if(expectedScope!==undefined)headers['x-mission-profile-scope']=expectedScope;
    const response=await scope.app.fetch(new Request('https://mission.test'+path,{method,headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)}),{...env,...environment},{waitUntil(){}});
    return {status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text()};
  };
  const note=async(score=70,profile='jessica-meir',owner='owner-a',content='После тренировки усталость стала меньше.')=>run('/api/astronauts/'+profile+'/messages',{owner,method:'POST',body:{id:webcrypto.randomUUID(),content,language:'ru',mode:'diary',attachments:[],wellbeing:score===null?null:{score,wellbeingScale:100}}});
  return {sql,out,objects,run,note,migrateHundred:()=>{for(const migration of migrations.slice(10))sql.exec(migration);},validateHealth:scope.validatedStoryHealth,provider:(code,text)=>{status=code;if(text)answer=text;}};
}
test('Полное имя сохраняется в профиле владельца, нормализуется и повторная запись идемпотентна',async()=>{
  const f=fixture(),initial=await f.run('/api/me',{name:'Account Name'});assert.equal(initial.body.name,'Account Name');
  const saved=await f.run('/api/me',{method:'PUT',name:'Account Name',body:{name:'  Egor   Fedosov  '}});assert.equal(saved.status,200);assert.equal(saved.body.name,'Egor Fedosov');assert.equal(saved.body.storageScope,initial.body.storageScope);assert.equal(saved.body.researcherId,initial.body.researcherId);
  assert.equal((await f.run('/api/me',{name:'Old Account Name'})).body.name,'Egor Fedosov');
  f.sql.prepare('UPDATE personal_profiles SET updated_at=? WHERE owner_id=?').run('2000-01-01T00:00:00.000Z','owner-a');
  assert.equal((await f.run('/api/me',{method:'PUT',body:{name:'Egor Fedosov'}})).status,200);assert.equal(f.sql.prepare('SELECT updated_at FROM personal_profiles WHERE owner_id=?').get('owner-a').updated_at,'2000-01-01T00:00:00.000Z');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_profiles').get().n,1);
  const normalized=await f.run('/api/me',{method:'PUT',body:{name:'Федор \u0451\u0401 \u2013 \u2014'}});assert.equal(normalized.body.name,'Федор еЕ - -');assert.equal(f.out.length,0);
});
test('Изменение имени изолировано по аккаунту и защищено входом и происхождением',async()=>{
  const f=fixture();await f.run('/api/me',{method:'PUT',body:{name:'Первый пользователь'}});assert.equal((await f.run('/api/me',{owner:'owner-b',name:'Second User'})).body.name,'Second User');
  await f.run('/api/me',{owner:'owner-b',method:'PUT',body:{name:'Второй пользователь'}});assert.equal((await f.run('/api/me')).body.name,'Первый пользователь');assert.equal((await f.run('/api/me',{owner:'owner-b'})).body.name,'Второй пользователь');
  for(const method of ['GET','PUT'])assert.equal((await f.run('/api/me',{owner:null,method,...(method==='PUT'?{body:{name:'Подмена'}}:{})})).status,401);
  assert.equal((await f.run('/api/me',{method:'PUT',origin:'https://other.test',body:{name:'Подмена'}})).status,403);assert.equal((await f.run('/api/me',{method:'PUT',body:{name:'Подмена',owner_id:'owner-b'}})).status,400);assert.equal((await f.run('/api/me')).body.name,'Первый пользователь');
});
test('Запоздалая вкладка другого аккаунта не сохраняет старое имя при смене авторизации',async()=>{
  const f=fixture(),first=(await f.run('/api/me')).body,second=(await f.run('/api/me',{owner:'owner-b',name:'Second Account'})).body;
  assert.equal((await f.run('/api/me',{method:'PUT',expectedScope:first.storageScope,body:{name:'Имя первого аккаунта'}})).status,200);
  const stale=await f.run('/api/me',{owner:'owner-b',method:'PUT',expectedScope:first.storageScope,body:{name:'Старый черновик'}});assert.equal(stale.status,409);assert.equal(stale.body.error,'profile_changed');assert.equal((await f.run('/api/me',{owner:'owner-b',name:'Second Account'})).body.name,'Second Account');
  assert.equal((await f.run('/api/me',{method:'PUT',expectedScope:second.storageScope,body:{name:'Подмена'}})).status,409);assert.equal((await f.run('/api/me')).body.name,'Имя первого аккаунта');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_profiles').get().n,1);
});
test('Пустые, длинные, управляющие и некорректные имена не изменяют профиль',async()=>{
  const f=fixture();await f.run('/api/me',{method:'PUT',body:{name:'Сохраненное имя'}});
  for(const name of ['', '   ', 'a'.repeat(101), 'A\nB', 'A\tB', '\u0000Name', 'Name\u007f', 4, null, {}, []])assert.equal((await f.run('/api/me',{method:'PUT',body:{name}})).status,400,String(name));
  for(const body of [{},[],null,'Name',{name:'Name',extra:true}])assert.equal((await f.run('/api/me',{method:'PUT',body})).status,400);
  assert.equal((await f.run('/api/me')).body.name,'Сохраненное имя');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_profiles').get().n,1);
});
test('Переименование обновляет подпись общего чата без переписывания исторического автора и сообщений',async()=>{
  const f=fixture(),id=webcrypto.randomUUID(),body={id,content:'Исходный текст автора'};await f.run('/api/team-chat',{method:'POST',name:'Original Author',body});
  await f.run('/api/team-chat',{owner:'owner-b',method:'POST',name:'Other Author',body:{id:webcrypto.randomUUID(),content:'Другой участник'}});
  await f.run('/api/me',{method:'PUT',body:{name:'Новое полное имя'}});
  const visible=(await f.run('/api/team-chat',{owner:'owner-b'})).body.messages;assert.equal(visible.find(item=>item.id===id).authorName,'Новое полное имя');assert.equal(visible.find(item=>item.id!==id).authorName,'Other Author');
  const original=f.sql.prepare('SELECT author_name,content FROM team_chat_messages WHERE id=?').get(id);assert.equal(original.author_name,'Original Author');assert.equal(original.content,body.content);
  const retry=await f.run('/api/team-chat',{method:'POST',body});assert.equal(retry.status,200);assert.equal(retry.body.message.authorName,'Новое полное имя');
  const fresh=await f.run('/api/team-chat',{method:'POST',name:'Stale Header Name',body:{id:webcrypto.randomUUID(),content:'Новое сообщение'}});assert.equal(fresh.body.message.authorName,'Новое полное имя');assert.equal(f.sql.prepare('SELECT author_name FROM team_chat_messages WHERE id=?').get(fresh.body.message.id).author_name,'Новое полное имя');assert.equal(f.out.length,0);
});
test('Свое имя в сториз обновляется без изменения подписи, исходного автора и чужой истории',async()=>{
  const f=fixture(),id=webcrypto.randomUUID(),other=webcrypto.randomUUID(),insert=f.sql.prepare('INSERT INTO personal_stories (id,owner_id,author_name,caption,media_kind,object_key,mime,bytes,width,height,digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(id,'owner-a','Original Author','Исходная подпись Original Author','photo','old-story','image/jpeg',128,32,32,'old-digest','2026-11-05T10:00:00Z');insert.run(other,'owner-b','Other Author','Чужая подпись','photo','other-story','image/jpeg',128,32,32,'other-digest','2026-11-05T10:00:00Z');
  await f.run('/api/me',{method:'PUT',body:{name:'Новое полное имя'}});const story=(await f.run('/api/stories')).body.stories[0];assert.equal(story.author,'Новое полное имя');assert.equal(story.caption,'Исходная подпись Original Author');
  const stored=f.sql.prepare('SELECT author_name,caption FROM personal_stories WHERE id=?').get(id);assert.equal(stored.author_name,'Original Author');assert.equal(stored.caption,story.caption);const foreign=(await f.run('/api/stories',{owner:'owner-b'})).body.stories;assert.equal(foreign.length,1);assert.equal(foreign[0].author,'Other Author');assert.equal(foreign[0].id,other);
  const form=new FormData(),bytes=new Uint8Array(128);bytes.set([255,216,255]);for(const [key,value]of Object.entries({id:webcrypto.randomUUID(),author:'Подмененная подпись автора',caption:'Новая подпись',kind:'photo',width:32,height:32}))form.set(key,String(value));form.set('file',new Blob([bytes],{type:'image/jpeg'}),'story.jpg');
  const fresh=await f.run('/api/stories',{method:'POST',body:form});assert.equal(fresh.status,201);assert.equal(fresh.body.story.author,'Новое полное имя');assert.equal(f.sql.prepare('SELECT author_name FROM personal_stories WHERE id=?').get(fresh.body.story.id).author_name,'Новое полное имя');
});
test('Самооценка сохраняется у заметки, возвращается в книге и имеет серверные подпись и время',async()=>{const f=fixture(),saved=await f.note();assert.equal(saved.status,201);const report=saved.body.message.wellbeing;assert.equal(report.score,70);assert.equal(report.wellbeingScale,100);assert.equal(report.label,'Хорошо');assert.equal(report.source,'self_report');assert.ok(Number.isFinite(Date.parse(report.recordedAt)));const book=await f.run('/api/astronauts/jessica-meir/book');assert.deepEqual(book.body.entries[0].wellbeing,report);assert.equal(f.out.length,0);});
test('Несуществующие и дробные оценки не сохраняются, отсутствие оценки не выдумывается',async()=>{const f=fixture();for(const score of [0,101,3.5,'80',null]){if(score===null){const saved=await f.note(null);assert.equal(saved.status,201);assert.equal(saved.body.message.wellbeing,undefined);}else assert.equal((await f.note(score)).status,400);}assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,1);});
test('Повтор отправки не меняет первоначальную самооценку и не дублирует запись',async()=>{const f=fixture(),first=await f.note(30),id=first.body.message.id;const retry=await f.run('/api/astronauts/jessica-meir/messages',{method:'POST',body:{id,content:first.body.message.content,language:'ru',mode:'diary',attachments:[],wellbeing:{score:90,wellbeingScale:100}}});assert.equal(retry.status,200);assert.equal(retry.body.message.wellbeing.score,30);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,1);});
test('Общий чат использует отдельную таблицу и не попадает в книгу или векторную индексацию',async()=>{const f=fixture(),id=webcrypto.randomUUID(),reply=await f.run('/api/chat',{method:'POST',body:{id,content:'Привет',wellbeing:{score:80,wellbeingScale:100}}});assert.equal(reply.status,201);assert.equal(reply.body.message.wellbeing.score,80);assert.ok(reply.body.reply);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,0);assert.equal((await f.run('/api/astronauts/jessica-meir/book')).body.total,0);assert.equal((await f.run('/api/astronauts/jessica-meir/book-index')).body.entries.length,0);assert.equal(f.out.length,1);assert.equal(f.out[0].body.store,false);});
test('Чужой владелец не читает историю общего чата и не использует ID чужого сообщения',async()=>{const f=fixture(),id=webcrypto.randomUUID();await f.run('/api/chat',{method:'POST',body:{id,content:'Личная беседа'}});assert.deepEqual((await f.run('/api/chat',{owner:'owner-b'})).body.messages,[]);assert.equal((await f.run('/api/chat',{owner:'owner-b',method:'POST',body:{id,content:'Личная беседа'}})).status,409);});
test('Отказ модели сохраняет сообщение, повтор создает один ответ без дубликатов',async()=>{const f=fixture(),id=webcrypto.randomUUID();f.provider(503);const first=await f.run('/api/chat',{method:'POST',body:{id,content:'Как организовать день?'}});assert.equal(first.status,201);assert.equal(first.body.reply,null);assert.equal(first.body.message.pending,true);assert.equal((await f.run('/api/chat')).body.messages.length,1);f.provider(200);const second=await f.run('/api/chat',{method:'POST',body:{id,content:'Как организовать день?'}});assert.ok(second.body.reply);await f.run('/api/chat',{method:'POST',body:{id,content:'Как организовать день?'}});assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM general_chat_messages').get().n,2);});
test('Air gap сохраняет общий чат и запрещает внешний вызов модели',async()=>{const f=fixture(),saved=await f.run('/api/chat',{method:'POST',environment:{AIR_GAP:'1'},body:{id:webcrypto.randomUUID(),content:'Моя заметка'}});assert.equal(saved.status,201);assert.equal(saved.body.replyError,'assistant_unavailable');assert.equal(f.out.length,0);});
test('Контекст общего чата не содержит личных заметок дневника',async()=>{const f=fixture();await f.note(50,'jessica-meir','owner-a','Закрытая запись для векторного дневника.');await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Привет'}});assert.ok(!JSON.stringify(f.out[0]).includes('Закрытая запись'));});
test('Избранное берет канонический текст и оценку из исходной записи',async()=>{const f=fixture(),saved=await f.note(),entry=saved.body.message;const favorite=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'diary',sourceId:entry.id,profile:'jessica-meir',content:'Подмененный текст',wellbeing:{score:1}}});assert.equal(favorite.status,200);assert.equal(favorite.body.item.content,entry.content);assert.equal(favorite.body.item.wellbeing.score,70);const again=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'diary',sourceId:entry.id,profile:'jessica-meir'}});assert.equal(again.body.item.id,favorite.body.item.id);assert.equal((await f.run('/api/favorites')).body.items.length,1);});
test('Избранное закрыто от другого владельца, неверного профиля и подмененного источника',async()=>{const f=fixture(),entry=(await f.note()).body.message;for(const options of [{owner:'owner-b',profile:'jessica-meir'},{owner:'owner-a',profile:'jack-hathaway'}])assert.equal((await f.run('/api/favorites',{owner:options.owner,method:'PUT',body:{sourceType:'diary',sourceId:entry.id,profile:options.profile}})).status,404);assert.deepEqual((await f.run('/api/favorites',{owner:'owner-b'})).body.items,[]);});
test('Можно сохранить ответ общего чата и убрать закладку без удаления исходного ответа',async()=>{const f=fixture(),chat=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Привет'}}),reply=chat.body.reply;const saved=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'chat',sourceId:reply.id}});assert.equal(saved.body.item.content,reply.content);await f.run('/api/favorites/'+saved.body.item.id,{method:'DELETE',owner:'owner-b'});assert.equal((await f.run('/api/favorites')).body.items.length,1);await f.run('/api/favorites/'+saved.body.item.id,{method:'DELETE'});assert.equal((await f.run('/api/favorites')).body.items.length,0);assert.equal((await f.run('/api/chat')).body.messages.length,2);});
test('Индекс дневника включает самооценку, обычный чат индексироваться не может',async()=>{const f=fixture();const note=await f.note(20);const index=await f.run('/api/astronauts/jessica-meir/book-index');assert.equal(index.body.entries.length,1);assert.ok(index.body.entries[0].content.includes('20/100'));assert.ok(index.body.entries[0].content.includes('Очень плохо'));assert.equal(index.body.entries[0].id,note.body.message.id);});
test('RAG-ответ получает только выбранные записи своего владельца и профиля',async()=>{const f=fixture(),first=(await f.note(70)).body.message,second=(await f.note(80,'jack-hathaway')).body.message;const good=await f.run('/api/astronauts/jessica-meir/book-answer',{method:'POST',body:{query:'Как было самочувствие?',ids:[first.id]}});assert.equal(good.status,200);assert.equal(good.body.references[0].id,first.id);assert.ok(JSON.stringify(f.out[0]).includes('70/100'));const n=f.out.length;for(const [owner,id] of [['owner-b',first.id],['owner-a',second.id]])assert.equal((await f.run('/api/astronauts/jessica-meir/book-answer',{owner,method:'POST',body:{query:'Что записано?',ids:[id]}})).status,404);assert.equal(f.out.length,n);});
test('Защита входа и происхождения действует для чата, избранного и RAG',async()=>{const f=fixture();for(const path of ['/api/chat','/api/favorites','/api/astronauts/jessica-meir/book-answer']){assert.equal((await f.run(path,{owner:null})).status,401);assert.equal((await f.run(path,{method:'POST',origin:'https://other.test',body:{}})).status,403);}assert.equal(f.out.length,0);});
test('Пагинация общего чата не теряет сообщения с одинаковым временем',async()=>{const f=fixture();for(let i=0;i<45;i++)f.sql.prepare('INSERT INTO general_chat_messages (id,owner_id,role,content,created_at) VALUES (?,?,?,?,?)').run('00000000-0000-0000-0000-'+String(i).padStart(12,'0'),'owner-a','user','Тест '+i,'2026-10-29T00:00:00Z');const first=await f.run('/api/chat'),second=await f.run('/api/chat?cursor='+encodeURIComponent(first.body.cursor));assert.equal(first.body.messages.length,40);assert.equal(second.body.messages.length,5);assert.equal(new Set([...first.body.messages,...second.body.messages].map(row=>row.id)).size,45);});

test('NasaGPT получает разговорную инструкцию, приветствие и ответ модели без шаблона дневника',async()=>{const f=fixture();f.provider(200,'Hi! How are you doing today?');const reply=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'hi'}});assert.equal(reply.body.reply.content,'Hi! How are you doing today?');const messages=f.out[0].body.messages;assert.ok(messages[0].content.includes('Ты NasaGPT'));assert.ok(messages[0].content.includes('Это обычный разговор'));assert.equal(messages.at(-1).content,'hi');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,0);});

test('Личный профиль изолирован от архивов друзей и другого владельца',async()=>{const f=fixture(),own=await f.note(80,'personal');await f.note(20,'jessica-meir');const book=await f.run('/api/astronauts/personal/book');assert.equal(book.status,200);assert.equal(book.body.entries.length,1);assert.equal(book.body.entries[0].id,own.body.message.id);assert.equal((await f.run('/api/astronauts/personal/book',{owner:'owner-b'})).body.total,0);assert.equal((await f.run('/api/astronauts/jessica-meir/book')).body.total,1);const saved=await f.run('/api/favorites',{method:'PUT',body:{sourceType:'diary',sourceId:own.body.message.id,profile:'personal'}});assert.equal(saved.status,200);});
test('Новая личная сториз содержит самооценку и не принимает показатели профиля друга',()=>{const f=fixture(),health=f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt:new Date().toISOString(),wellbeing:{score:80,wellbeingScale:100},metrics:{hr:112,spo2:94,temp:38.1,fatigue:8}}));assert.equal(health.wellbeing.score,80);assert.equal(health.metrics.hr,null);assert.equal(health.metrics.spo2,null);assert.equal(health.metrics.temp,null);assert.equal(health.metrics.fatigue,null);assert.throws(()=>f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'jessica-meir',capturedAt:new Date().toISOString(),wellbeing:{score:80,wellbeingScale:100}})));});

test('Лента хранит реальные сохранения один раз и изолирована по владельцу',async()=>{const f=fixture(),saved=await f.note(80,'personal');const first=await f.run('/api/activity');assert.equal(first.status,200);assert.equal(first.body.events.length,1);assert.equal(first.body.events[0].kind,'diary_saved');assert.ok(first.body.events[0].summary.includes(saved.body.message.content));await f.run('/api/astronauts/personal/messages',{method:'POST',body:{id:saved.body.message.id,content:saved.body.message.content,language:'ru',mode:'diary',attachments:[]}});assert.equal((await f.run('/api/activity')).body.events.length,1);assert.equal((await f.run('/api/activity',{owner:'owner-b'})).body.events.length,0);});
test('Лента принимает подтвержденные действия интерфейса, но не выдуманную публикацию',async()=>{const f=fixture(),id=webcrypto.randomUUID();for(let i=0;i<2;i++)assert.equal((await f.run('/api/activity',{method:'POST',body:{id,kind:'navigation',target:'overview'}})).status,201);assert.equal((await f.run('/api/activity')).body.events.length,1);for(const body of [{kind:'story_published'},{kind:'navigation',target:'constructor'},{kind:'draft',area:'chat',length:-1}])assert.equal((await f.run('/api/activity',{method:'POST',body:{id:webcrypto.randomUUID(),...body}})).status,400);assert.equal((await f.run('/api/activity',{owner:null})).status,401);assert.equal((await f.run('/api/activity',{method:'POST',origin:'https://other.test',body:{id,kind:'training_review'}})).status,403);});

function storedNote(f,{id=webcrypto.randomUUID(),owner='owner-a',profile='personal',role='note',content='Исходная запись - оценка 8/10.',report={score:8,label:'Хорошо',source:'self_report',recordedAt:'2026-10-07T10:00:00.000Z'},date='2026-10-07T10:00:01.000Z'}={}){
  const raw=report===null?null:typeof report==='string'?report:JSON.stringify(report);
  f.sql.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,wellbeing_json) VALUES (?,?,?,?,?,?,?,?,?)').run(id,owner,profile,role,content,'ru',date,'indexed',raw);
  return {id,owner,profile,raw,content,date};
}

test('Новая шкала принимает границы 1 и 100 без умножения явно заданного масштаба',async()=>{
  const f=fixture();
  for(const [score,label]of [[1,'Очень плохо'],[20,'Очень плохо'],[21,'Ниже обычного'],[40,'Ниже обычного'],[41,'Нормально'],[60,'Нормально'],[61,'Хорошо'],[80,'Хорошо'],[81,'Отлично'],[100,'Отлично']]){
    const saved=await f.note(score,'personal');
    assert.equal(saved.status,201);assert.equal(saved.body.message.wellbeing.score,score);assert.equal(saved.body.message.wellbeing.wellbeingScale,100);assert.equal(saved.body.message.wellbeing.label,label);
    const raw=JSON.parse(f.sql.prepare('SELECT wellbeing_json FROM journal_messages WHERE id=?').get(saved.body.message.id).wellbeing_json);
    assert.equal(raw.score,score);assert.equal(raw.wellbeingScale,100);
  }
});

test('Границы и тип масштаба проверяются до сохранения новой самооценки',async()=>{
  const f=fixture();
  for(const report of [{score:0,wellbeingScale:100},{score:101,wellbeingScale:100},{score:1.5,wellbeingScale:100},{score:'80',wellbeingScale:100},{score:80,wellbeingScale:'100'},{score:80,wellbeingScale:null},{score:8,wellbeingScale:5},{score:11},{score:11,wellbeingScale:10},[]]){
    const result=await f.run('/api/astronauts/personal/messages',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Проверка диапазона',language:'ru',mode:'diary',wellbeing:report}});
    assert.equal(result.status,400);assert.equal(result.body.error,'invalid_wellbeing');
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n,0);
});

test('Прежний клиент со шкалой 10 получает нормализованную оценку и сохраняет новый формат',async()=>{
  const f=fixture();
  for(const wellbeing of [{score:8},{score:8,wellbeingScale:10}]){
    const result=await f.run('/api/astronauts/personal/messages',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Совместимость старого клиента',language:'ru',mode:'diary',wellbeing}});
    assert.equal(result.status,201);assert.equal(result.body.message.wellbeing.score,80);assert.equal(result.body.message.wellbeing.wellbeingScale,100);
  }
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM journal_messages WHERE json_extract(wellbeing_json,'$.score')=80 AND json_extract(wellbeing_json,'$.wellbeingScale')=100").get().n,2);
});

test('Миграция инвалидирует только прежние векторы и не переписывает тексты оценки или события',async()=>{
  const f=fixture({beforeHundred:true});
  const legacy=storedNote(f),friend=storedNote(f,{profile:'jessica-meir',report:{score:3,source:'self_report'}}),current=storedNote(f,{report:{score:8,wellbeingScale:100,source:'self_report'}}),other=storedNote(f,{owner:'owner-b',report:{score:99,wellbeingScale:100,source:'self_report'}}),missing=storedNote(f,{report:null}),malformed=storedNote(f,{report:'{'}),assistant=storedNote(f,{role:'assistant'});
  const notes=[legacy,friend,current,other,missing,malformed,assistant];
  for(const note of notes)f.sql.prepare('INSERT INTO journal_text_vectors (message_id,owner_id,astronaut_id,model,vectors_json,indexed_at) VALUES (?,?,?,?,?,?)').run(note.id,note.owner,note.profile,model,'[]','2026-10-08T00:00:00Z');
  f.sql.prepare('INSERT INTO activity_events (id,owner_id,kind,summary,created_at) VALUES (?,?,?,?,?)').run('old-wellbeing','owner-a','wellbeing','Выбрал самочувствие / 8 из 10','2026-10-07T10:00:00Z');
  const original=notes.map(note=>({...f.sql.prepare('SELECT id,owner_id,astronaut_id,role,content,created_at,wellbeing_json FROM journal_messages WHERE id=?').get(note.id)}));
  f.migrateHundred();
  assert.deepEqual(notes.map(note=>({...f.sql.prepare('SELECT id,owner_id,astronaut_id,role,content,created_at,wellbeing_json FROM journal_messages WHERE id=?').get(note.id)})),original);
  for(const note of [legacy,friend]){assert.equal(f.sql.prepare('SELECT vector_status FROM journal_messages WHERE id=?').get(note.id).vector_status,'pending');assert.equal(f.sql.prepare('SELECT * FROM journal_text_vectors WHERE message_id=?').get(note.id),undefined);}
  for(const note of [current,other,missing,malformed,assistant]){assert.equal(f.sql.prepare('SELECT vector_status FROM journal_messages WHERE id=?').get(note.id).vector_status,'indexed');assert.ok(f.sql.prepare('SELECT * FROM journal_text_vectors WHERE message_id=?').get(note.id));}
  assert.equal(f.sql.prepare('SELECT summary FROM activity_events').get().summary,'Выбрал самочувствие / 8 из 10');
  const pending=await f.run('/api/astronauts/personal/book-index');
  assert.deepEqual(pending.body.entries.map(row=>row.id),[legacy.id]);assert.ok(pending.body.entries[0].content.includes('80/100'));assert.ok(pending.body.entries[0].content.includes('Исходная запись - оценка 8/10.'));
});

test('Старые JSON снимки нормализуются в ответах без изменения оригиналов и границ владельца',async()=>{
  const f=fixture({beforeHundred:true}),note=storedNote(f),raw=note.raw,chatId=webcrypto.randomUUID(),favoriteId=webcrypto.randomUUID(),storyId=webcrypto.randomUUID();
  f.sql.prepare('INSERT INTO general_chat_messages (id,owner_id,role,content,created_at,wellbeing_json) VALUES (?,?,?,?,?,?)').run(chatId,'owner-a','user','Старое сообщение 8/10.',note.date,raw);
  f.sql.prepare('INSERT INTO personal_favorites (id,owner_id,source_type,source_id,profile_id,content,source_created_at,created_at,wellbeing_json) VALUES (?,?,?,?,?,?,?,?,?)').run(favoriteId,'owner-a','diary',note.id,'personal',note.content,note.date,note.date,raw);
  const health=JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt:'2026-10-07T10:00:00Z',wellbeing:JSON.parse(raw),metrics:{hr:null,spo2:null,temp:null,fatigue:null}});
  f.sql.prepare('INSERT INTO personal_stories (id,owner_id,author_name,caption,health_json,media_kind,object_key,mime,bytes,width,height,digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(storyId,'owner-a','Egor Fedosov','Архивная подпись',health,'photo','test-story','image/jpeg',128,32,32,'test-digest',note.date);
  f.migrateHundred();
  const book=(await f.run('/api/astronauts/personal/book')).body.entries[0],chat=(await f.run('/api/chat')).body.messages[0],favorite=(await f.run('/api/favorites')).body.items[0],story=(await f.run('/api/stories')).body.stories[0];
  for(const report of [book.wellbeing,chat.wellbeing,favorite.wellbeing,story.health.wellbeing]){assert.equal(report.score,80);assert.equal(report.wellbeingScale,100);assert.equal(report.recordedAt,'2026-10-07T10:00:00.000Z');}
  assert.equal(book.content,note.content);assert.equal(chat.content,'Старое сообщение 8/10.');assert.equal(story.health.capturedAt,'2026-10-07T10:00:00Z');
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM journal_messages').get().wellbeing_json,raw);
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM general_chat_messages').get().wellbeing_json,raw);
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM personal_favorites').get().wellbeing_json,raw);
  assert.equal(f.sql.prepare('SELECT health_json FROM personal_stories').get().health_json,health);
  assert.equal((await f.run('/api/astronauts/personal/book',{owner:'owner-b'})).body.total,0);assert.equal((await f.run('/api/chat',{owner:'owner-b'})).body.messages.length,0);assert.equal((await f.run('/api/favorites',{owner:'owner-b'})).body.items.length,0);assert.equal((await f.run('/api/stories',{owner:'owner-b'})).body.stories.length,0);
});

test('Новые личные снимки используют шкалу 100 а прежняя демо усталость остается шкалой 10',()=>{
  const f=fixture(),capturedAt=new Date().toISOString();
  for(const score of [1,100]){const value=f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt,wellbeing:{score,wellbeingScale:100}}));assert.equal(value.wellbeing.score,score);assert.equal(value.wellbeing.wellbeingScale,100);assert.equal(value.metrics.fatigue,null);}
  const legacy=f.validateHealth(JSON.stringify({version:2,source:'self_report',profileId:'personal',capturedAt,wellbeing:{score:8}}));assert.equal(legacy.wellbeing.score,80);
  const demo=f.validateHealth(JSON.stringify({version:1,source:'demo_dashboard',profileId:'jessica-meir',capturedAt,metrics:{hr:72,spo2:98,temp:36.6,fatigue:8}}));assert.equal(demo.metrics.fatigue,8);assert.equal(demo.wellbeing,undefined);
  assert.throws(()=>f.validateHealth(JSON.stringify({...demo,metrics:{...demo.metrics,fatigue:80}})));
});

test('Исторические события сохраняют исходный масштаб а новые получают 100',async()=>{
  const f=fixture();f.sql.prepare('INSERT INTO activity_events (id,owner_id,kind,summary,created_at) VALUES (?,?,?,?,?)').run('old-event','owner-a','wellbeing','Выбрал самочувствие / 8 из 10','2026-10-07T10:00:00Z');
  for(const score of [1,100])assert.equal((await f.run('/api/activity',{method:'POST',body:{id:webcrypto.randomUUID(),kind:'wellbeing',score,wellbeingScale:100}})).status,201);
  const events=(await f.run('/api/activity')).body.events;
  assert.ok(events.some(row=>row.summary==='Выбрал самочувствие / 8 из 10'));assert.ok(events.some(row=>row.summary==='Выбрал самочувствие / 1 из 100'));assert.ok(events.some(row=>row.summary==='Выбрал самочувствие / 100 из 100'));
  assert.equal((await f.run('/api/activity',{method:'POST',body:{id:webcrypto.randomUUID(),kind:'wellbeing',score:101,wellbeingScale:100}})).status,400);
});

test('Контекст NasaGPT приводит прежнюю оценку к 100 и оставляет текст разговора исходным',async()=>{
  const f=fixture(),id=webcrypto.randomUUID(),raw=JSON.stringify({score:8,label:'Хорошо',source:'self_report',recordedAt:'2026-10-07T10:00:00Z'});
  f.sql.prepare('INSERT INTO general_chat_messages (id,owner_id,role,content,created_at,wellbeing_json) VALUES (?,?,?,?,?,?)').run(id,'owner-a','user','Сам написал 8/10.','2026-10-07T10:00:00Z',raw);
  const answer=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Привет',wellbeing:{score:1,wellbeingScale:100}}});assert.equal(answer.status,201);
  const messages=f.out[0].body.messages;assert.ok(messages[0].content.includes('шкале 1-100'));assert.ok(messages.some(row=>row.content==='Сам написал 8/10.\nСамооценка самочувствия: 80/100.'));assert.ok(messages.at(-1).content.includes('1/100.'));
  assert.equal(f.sql.prepare('SELECT wellbeing_json FROM general_chat_messages WHERE id=?').get(id).wellbeing_json,raw);
});

test('Обучение получает нормализованную самооценку личных записей без изменения исходников',async()=>{
  const f=fixture(),original=[];
  for(let i=0;i<20;i++)original.push(storedNote(f,{content:'Запись '+i+' '+('Подробное описание самочувствия и сна для личного дневника. '.repeat(2))}));
  storedNote(f,{owner:'owner-b',content:'Чужой владелец - закрытые данные. '.repeat(4)});storedNote(f,{profile:'jessica-meir',content:'Другой профиль - закрытые данные. '.repeat(4)});
  const result=await f.run('/api/astronauts/personal/training',{method:'POST',environment:{TRAINING_URL:'http://trainer.internal'},body:{id:webcrypto.randomUUID(),confirm:true}});
  assert.equal(result.status,202);assert.equal(f.out.length,1);const payload=f.out[0].body;assert.equal(payload.entries.length,20);assert.equal(payload.profile,'personal');assert.equal(payload.ownerId,'owner-a');assert.ok(payload.entries.every(entry=>entry.includes('80/100 / Хорошо')));assert.ok(payload.entries.every(entry=>!entry.includes('закрытые данные')));
  for(const note of original){const row=f.sql.prepare('SELECT content,wellbeing_json FROM journal_messages WHERE id=?').get(note.id);assert.equal(row.content,note.content);assert.equal(row.wellbeing_json,note.raw);}
});


test('Командный чат виден участникам сайта, не вызывает модель и не копирует личные данные',async()=>{
  const f=fixture();await f.note(30,'personal','owner-a','Личная запись');await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Личный NasaGPT'}});const calls=f.out.length;
  const saved=await f.run('/api/team-chat',{method:'POST',name:'Egor',body:{id:webcrypto.randomUUID(),content:'Обсудим проект',wellbeing:{score:10},authorName:'Подмена'}});
  assert.equal(saved.status,201);assert.equal(saved.body.message.authorName,'Egor');assert.equal(saved.body.message.isOwn,true);assert.equal(saved.body.message.wellbeing,undefined);
  const team=await f.run('/api/team-chat',{owner:'owner-b'});assert.equal(team.body.messages.length,1);assert.equal(team.body.messages[0].isOwn,false);assert.equal(team.body.messages[0].content,'Обсудим проект');assert.equal(team.body.messages[0].ownerId,undefined);assert.equal(f.out.length,calls);
  assert.equal((await f.run('/api/chat',{owner:'owner-b'})).body.messages.length,0);
});
test('Повтор командного сообщения не дублирует его, чужой ID и изменение текста отклоняются',async()=>{
  const f=fixture(),body={id:webcrypto.randomUUID(),content:'Проверим сборку'};assert.equal((await f.run('/api/team-chat',{method:'POST',body})).status,201);assert.equal((await f.run('/api/team-chat',{method:'POST',body})).status,200);
  assert.equal((await f.run('/api/team-chat',{owner:'owner-b',method:'POST',body})).status,409);assert.equal((await f.run('/api/team-chat',{method:'POST',body:{...body,content:'Другой текст'}})).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM team_chat_messages').get().n,1);
});
test('Защита входа и происхождения работает для командного чата и файлов',async()=>{
  const f=fixture();for(const path of ['/api/team-chat','/api/chat-files']){assert.equal((await f.run(path,{owner:null})).status,401);assert.equal((await f.run(path,{method:'POST',origin:'https://other.test',body:{}})).status,403);}
});
test('Командная пагинация сохраняет одинаковые отметки времени и не раскрывает внутренний ID владельца',async()=>{
  const f=fixture();for(let i=0;i<45;i++)f.sql.prepare('INSERT INTO team_chat_messages (id,owner_id,author_name,content,created_at) VALUES (?,?,?,?,?)').run('00000000-0000-0000-0000-'+String(i).padStart(12,'0'),'owner-a','Egor','Сообщение '+i,'2026-11-05T00:00:00Z');
  const first=await f.run('/api/team-chat'),next=await f.run('/api/team-chat?cursor='+encodeURIComponent(first.body.cursor));assert.equal(first.body.messages.length,40);assert.equal(next.body.messages.length,5);assert.equal(new Set([...first.body.messages,...next.body.messages].map(row=>row.id)).size,45);
});
async function uploadChatFile(f,room='private',owner='owner-a'){
  const body=new FormData();body.set('room',room);body.set('file',new Blob(['Проверочный файл'],{type:'text/plain'}),'check.txt');return f.run('/api/chat-files',{method:'POST',owner,body});
}
test('Личный файл доступен только владельцу и прикрепляется к его сообщению NasaGPT',async()=>{
  const f=fixture(),uploaded=await uploadChatFile(f);assert.equal(uploaded.status,201);const file=uploaded.body.file;
  assert.equal((await f.run(file.url,{owner:'owner-b'})).status,404);const saved=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Документ',attachments:[file.id]}});assert.equal(saved.body.message.attachments[0].name,'check.txt');assert.equal((await f.run('/api/chat')).body.messages[0].attachments[0].id,file.id);
  assert.equal((await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Подмена области',attachments:[file.id]}})).status,404);
  const downloaded=await f.run(file.url);assert.equal(downloaded.body,'Проверочный файл');assert.equal(downloaded.headers.get('content-type'),'application/octet-stream');assert.ok(downloaded.headers.get('content-disposition').startsWith('attachment;'));
});
test('Командный файл открывается другим участникам только после явной отправки в общий чат',async()=>{
  const f=fixture(),file=(await uploadChatFile(f,'team')).body.file;assert.equal((await f.run(file.url,{owner:'owner-b'})).status,404);
  assert.equal((await f.run('/api/team-chat',{owner:'owner-b',method:'POST',body:{id:webcrypto.randomUUID(),content:'Чужой файл',attachments:[file.id]}})).status,404);
  const saved=await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'',attachments:[file.id]}});assert.equal(saved.status,201);assert.equal((await f.run(file.url,{owner:'owner-b'})).status,200);assert.equal((await f.run('/api/team-chat',{owner:'owner-b'})).body.messages[0].attachments[0].id,file.id);assert.equal(f.out.length,0);
});
test('Пустые сообщения, дубликаты вложений и неизвестные файлы не сохраняются',async()=>{
  const f=fixture(),file=(await uploadChatFile(f,'team')).body.file;
  for(const body of [{content:''},{content:'Текст',attachments:[file.id,file.id]},{content:'Текст',attachments:['не ID']},{content:'Текст',attachments:Array.from({length:5},()=>webcrypto.randomUUID())}])assert.equal((await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),...body}})).status,400);
  assert.equal((await f.run('/api/team-chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Текст',attachments:[webcrypto.randomUUID()]}})).status,404);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM team_chat_messages').get().n,0);
});
test('Неудачная запись метаданных удаляет только что загруженный объект',async()=>{
  const f=fixture();f.sql.exec('DROP TABLE chat_files');const result=await uploadChatFile(f);assert.equal(result.status,503);assert.equal(f.objects.size,0);
});
