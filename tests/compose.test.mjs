import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url);
const source=(await Promise.all(['speech','compose','index'].map(name=>readFile(new URL('worker/'+name+'.js',root),'utf8')))).join('\n').replace('export default','globalThis.app =');

function fixture(){
  const calls=[],logs=[];let dbAccess=0,reply=' хочу лучше понять свое самочувствие.',handler=null;
  const env={LLM_API_KEY:'test-key',LLM_BASE_URL:'https://model.test/v1',LLM_MODEL:'test-model',DB:{prepare(){dbAccess++;throw new Error('Обращение к базе запрещено');}},PHOTOS:{get(){throw new Error('Чтение файлов запрещено');},put(){throw new Error('Запись файлов запрещена');}}};
  const scope={URL,Request,Response,Uint8Array,TextEncoder,TextDecoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{error(...values){logs.push(values);},warn(...values){logs.push(values);}},fetch:async(url,options)=>{
    const call={url,options,body:JSON.parse(options.body)};calls.push(call);
    return handler?handler(call):Response.json({choices:[{message:{content:reply}}]});
  }};
  vm.runInNewContext(source,scope);
  const run=async({owner='owner-a',method='POST',body={prefix:'Сегодня я'},raw,headers:extra={},environment={}}={})=>{
    const headers={'content-type':'application/json',...extra};if(owner)headers['oai-authenticated-user-id']=owner;
    const response=await scope.app.fetch(new Request('https://mission.test/api/compose',{method,headers,...(['GET','HEAD'].includes(method)?{}:{body:raw??JSON.stringify(body)})}),{...env,...environment},{waitUntil(){throw new Error('Фоновая запись запрещена');}});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  return {calls,logs,run,env,scope,dbAccess:()=>dbAccess,reply(value){reply=value;},handler(value){handler=value;}};
}

test('Автодополнение требует входа до чтения тела и обращения к модели',async()=>{
  const f=fixture(),result=await f.run({owner:null,raw:'{'});
  assert.equal(result.status,401);assert.equal(result.body.error,'sign_in_required');assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
});

test('Подмена происхождения и межсайтовый запрос не передают черновик провайдеру',async()=>{
  const f=fixture();
  for(const headers of [{origin:'https://other.test'},{'sec-fetch-site':'cross-site'}]){const result=await f.run({headers});assert.equal(result.status,403);assert.equal(result.body.error,'forbidden');}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
  assert.equal((await f.run({headers:{origin:'https://mission.test'}})).status,200);
});

test('Маршрут поддерживает только POST с настоящим JSON типом содержимого',async()=>{
  const f=fixture();
  for(const method of ['GET','PUT','DELETE']){const result=await f.run({method});assert.equal(result.status,405);assert.equal(result.body.error,'method_not_allowed');}
  for(const type of ['text/plain','application/jsonp','application/json-other'])assert.equal((await f.run({headers:{'content-type':type}})).status,400);
  assert.equal(f.calls.length,0);
  assert.equal((await f.run({headers:{'content-type':'application/json; charset=utf-8'}})).status,200);
});

test('Пустой и короткий префикс возвращают пустое продолжение без модели или базы',async()=>{
  const f=fixture();
  for(const prefix of ['', ' ', 'я', 'мы', '  ab  ']){const result=await f.run({body:{prefix},environment:{AIR_GAP:'1'}});assert.equal(result.status,200);assert.deepEqual(result.body,{completion:''});}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
  assert.equal((await f.run({body:{prefix:'abc'}})).status,200);assert.equal(f.calls.length,1);
});

test('Неверный JSON и тип префикса отклоняются с устойчивым кодом',async()=>{
  const f=fixture();
  for(const options of [{raw:'{'},{body:null},{body:[]},{body:{}},{body:{prefix:123}},{raw:new Uint8Array([0xff,0xff])}]){const result=await f.run(options);assert.equal(result.status,400);assert.equal(result.body.error,'invalid_input');}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
});

test('Предел префикса равен 6000 символам и не сокращается молча',async()=>{
  const f=fixture();
  assert.equal((await f.run({body:{prefix:'a'.repeat(6000)}})).status,200);assert.equal(f.calls[0].body.messages[1].content.length,6000);assert.equal((await f.run({body:{prefix:'я'.repeat(6000)}})).status,200);
  const result=await f.run({body:{prefix:'a'.repeat(6001)}});assert.equal(result.status,400);assert.equal(result.body.error,'invalid_input');assert.equal(f.calls.length,2);
});

test('Предел тела проверяется по реальным байтам независимо от заголовка длины',async()=>{
  const f=fixture();
  for(const options of [{headers:{'content-length':'20001'}},{body:{prefix:'я'.repeat(6000),extra:'x'.repeat(10000)}},{body:{prefix:'я'.repeat(6000),extra:'x'.repeat(10000)},headers:{'content-length':'1'}},{raw:' '.repeat(20001)}]){const result=await f.run(options);assert.equal(result.status,413);assert.equal(result.body.error,'payload_too_large');}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
});

test('Провайдер получает только префикс и инструкцию продолжать текст автора',async()=>{
  const f=fixture(),prefix='Сегодня я чувствую';
  const result=await f.run({body:{prefix,history:['Закрытая история'],profile:'jessica-meir',ownerId:'owner-b'}});
  assert.equal(result.status,200);assert.equal(f.dbAccess(),0);assert.equal(f.calls.length,1);
  const {body,options}=f.calls[0];assert.equal(body.messages.length,2);assert.equal(body.messages[1].content,prefix);assert.equal(body.messages[1].role,'user');
  assert.ok(body.messages[0].content.includes('от лица самого автора'));assert.ok(body.messages[0].content.includes('Не отвечай на сообщение'));assert.ok(body.messages[0].content.includes('Не повторяй префикс'));
  assert.ok(!JSON.stringify(body).includes('Закрытая история'));assert.ok(!JSON.stringify(body).includes('jessica-meir'));assert.ok(!JSON.stringify(body).includes('owner-b'));
  assert.equal(body.store,false);assert.equal(body.max_completion_tokens,256);assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,'Bearer test-key');
  assert.equal(result.headers.get('cache-control'),'private, no-store');
});

test('Одновременные запросы разных владельцев не разделяют контекст черновика',async()=>{
  const f=fixture();await Promise.all([f.run({body:{prefix:'Первый личный текст'}}),f.run({owner:'owner-b',body:{prefix:'Второй личный текст'}})]);
  assert.equal(f.calls.length,2);assert.deepEqual(f.calls.map(call=>call.body.messages[1].content).sort(),['Первый личный текст','Второй личный текст'].sort());assert.ok(f.calls.every(call=>call.body.messages.length===2));assert.equal(f.dbAccess(),0);
});

test('Эхо полного префикса удаляется включая кавычки и отличие регистра',async()=>{
  const f=fixture(),prefix='Сегодня я';
  for(const answer of ['Сегодня я хочу отдохнуть.','  Сегодня я хочу отдохнуть.','сегодня я хочу отдохнуть.','"Сегодня я хочу отдохнуть."','«Сегодня я хочу отдохнуть.»']){f.reply(answer);const result=await f.run({body:{prefix}});assert.equal(result.status,200);assert.equal(result.body.completion,' хочу отдохнуть.');assert.ok(!result.body.completion.includes(prefix));}
  f.reply('Сегодня я');assert.equal((await f.run({body:{prefix}})).body.completion,'');
});

test('Пробел для стыковки и продолжение незаконченного слова сохраняются',async()=>{
  const f=fixture();f.reply(' хочу спать.');assert.equal((await f.run({body:{prefix:'Сегодня я'}})).body.completion,' хочу спать.');
  f.reply('el better today.');assert.equal((await f.run({body:{prefix:'I fe'}})).body.completion,'el better today.');
  f.reply('Сегодня я хочу спать.');assert.equal((await f.run({body:{prefix:'Сегодня я '}})).body.completion,'хочу спать.');
});

test('Продолжение ограничено 20 словами и очищено от управляющих символов',async()=>{
  const f=fixture();f.reply(' '+Array.from({length:30},(_,i)=>'слово'+i).join('\n')+'\u0000');
  const result=await f.run();assert.equal(result.status,200);assert.equal(result.body.completion.trim().split(/\s+/).length,20);assert.ok(!/[\n\r\t\u0000]/.test(result.body.completion));assert.ok(result.body.completion.startsWith(' '));
  f.reply(' еще\tтеплее \u2014 и спокойнее.');assert.equal((await f.run()).body.completion,' еще теплее - и спокойнее.');
});

test('Длинное слово ограничивается 300 символами без повреждения Unicode',async()=>{
  const f=fixture();f.reply('🙂'.repeat(500));const result=await f.run();assert.equal(Array.from(result.body.completion).length,300);assert.ok(!result.body.completion.includes('\ufffd'));
});

test('Без настроенной модели возвращается ошибка доступности без фиктивного текста',async()=>{
  const f=fixture();for(const environment of [{LLM_API_KEY:''},{LLM_MODEL:''},{LLM_BASE_URL:''}]){const result=await f.run({environment});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});}
  assert.equal(f.calls.length,0);
});

test('AIR GAP запрещает внешнюю модель даже с рабочими параметрами',async()=>{
  const f=fixture();const result=await f.run({environment:{AIR_GAP:'1'}});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
  assert.equal((await f.run({environment:{AIR_GAP:'1',LLM_BASE_URL:'https://user:secret@localhost/v1'}})).status,503);assert.equal(f.calls.length,0);
});

test('AIR GAP допускает настроенную локальную модель без облачного запасного маршрута',async()=>{
  const f=fixture();
  for(const base of ['http://127.0.0.1:8090/v1','http://localhost:8090/v1','http://10.0.0.5/v1','http://models.internal/v1']){const result=await f.run({environment:{AIR_GAP:'1',LLM_BASE_URL:base,LLM_API_KEY:''}});assert.equal(result.status,200);assert.equal(f.calls.at(-1).url,base+'/chat/completions');assert.equal(f.calls.at(-1).options.headers.authorization,undefined);assert.equal(f.calls.at(-1).options.redirect,'manual');}
  assert.equal(f.calls.length,4);
});

test('Перенаправление локальной модели наружу не выполняется и возвращает ошибку',async()=>{
  const f=fixture();f.handler(()=>new Response(null,{status:307,headers:{location:'https://other.test/model'}}));
  const result=await f.run({environment:{AIR_GAP:'1',LLM_BASE_URL:'http://localhost:8090/v1'}});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.redirect,'manual');
});

test('Сбой сети и ошибочный ответ провайдера дают один запрос и устойчивую ошибку',async()=>{
  const f=fixture();
  for(const handler of [()=>{throw new Error('Сетевой сбой');},()=>new Response('unavailable',{status:503}),()=>new Response('{',{status:200}),()=>Response.json({choices:[]}),()=>Response.json({choices:[{message:{content:'   '}}]})]){
    f.handler(handler);const before=f.calls.length,result=await f.run();assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});assert.equal(f.calls.length,before+1);
  }
  assert.equal(f.dbAccess(),0);
});

test('Разбор массивного ответа модели сохраняет только текстовые части',async()=>{
  const f=fixture();f.handler(()=>Response.json({choices:[{message:{content:[{type:'text',text:' хочу'},{type:'text',text:' отдохнуть.'}]}}]}));
  assert.equal((await f.run()).body.completion,' хочу отдохнуть.');
});

test('Обычный helper сохраняет прежние лимит повтор и поведение перенаправлений',async()=>{
  const f=fixture();let attempt=0;f.handler(()=>++attempt===1?new Response('unavailable',{status:503}):Response.json({choices:[{message:{content:'Обычный ответ'}}]}));
  const answer=await f.scope.completeLanguageMessages(f.env,[{role:'user',content:'Обычный чат'}]);assert.equal(answer.text,'Обычный ответ');assert.equal(f.calls.length,2);assert.ok(f.calls.every(call=>call.body.max_completion_tokens===1536));assert.ok(f.calls.every(call=>!Object.hasOwn(call.options,'redirect')));
});
