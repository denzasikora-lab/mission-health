import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url),coreSource=await readFile(new URL('public/story-tags-core.js',root),'utf8');
const coreScope={};vm.runInNewContext(coreSource,coreScope);const core=coreScope.MissionStoryTagsCore;
const domain=['#Space','#NASA','#AstronautLife','#MissionHealth','#BugBusters'];
const plain=value=>JSON.parse(JSON.stringify(value));
test('Подпись про котенка дает английские темы без выдуманного спасения',()=>{
  const tags=plain(core.generate('как я поймал катенка'));assert.ok(tags.includes('#Kittens'));assert.ok(tags.includes('#AnimalEncounters'));assert.ok(!tags.includes('#CatRescue'));for(const tag of domain)assert.ok(tags.includes(tag));
});
test('Спасение, тренировка и исследование различаются по теме',()=>{
  assert.ok(core.generate('Спас котенка из подвала').includes('#CatRescue'));assert.ok(core.generate('После пробежки отдыхаю').includes('#Running'));assert.ok(core.generate('Отобрали образцы для эксперимента').includes('#SpaceResearch'));
});
test('Теги всегда английские, ограничены восемью и не копируют случайные слова',()=>{
  for(const caption of ['Как я поймал котенка','#Мурзик #Отдых','NASA crew experiment sleep workout research','وجدت قطة صغيرة','今日は猫に会いました','Смотрю на Землю из иллюминатора']){const tags=plain(core.generate(caption));assert.ok(tags.length<=8);assert.ok(tags.every(tag=>/^#[A-Za-z][A-Za-z0-9]{1,35}$/.test(tag)));assert.equal(new Set(tags.map(tag=>tag.toLowerCase())).size,tags.length);}
  assert.ok(!core.generate('Персональный дневник').includes('#SleepHealth'));assert.ok(!core.generate('ЗагадочныйМурзик').includes('#ЗагадочныйМурзик'));
});
test('Очистка подписи убирает все теги, числа и эмодзи не создают случайные темы',()=>{for(const caption of ['', '   ', '123456', '🚀✨'])assert.deepEqual(plain(core.generate(caption)),[]);});
test('Ответ модели проверяется, доменные теги и дубликаты не занимают тематические места',()=>{
  assert.deepEqual(plain(core.parse('{"tags":["#NASA","Kittens","kittens","#Кошка","Cat Care","Space","AnimalEncounters"]}')),['Kittens','CatCare','AnimalEncounters']);
  assert.deepEqual(plain(core.parse('```json\n{"tags":["OrbitalResearch"]}\n```')),['OrbitalResearch']);assert.deepEqual(plain(core.parse('не JSON')),[]);
  assert.deepEqual(plain(core.finalize(['NASA','Kittens','kittens'])),['#Kittens',...domain]);
});
const workerSource=coreSource+'\n'+(await Promise.all(['speech','story-tags','index'].map(name=>readFile(new URL('worker/'+name+'.js',root),'utf8')))).join('\n').replace('export default','globalThis.app =');
function fixture(){
  const calls=[];let reply='{"tags":["Kittens","AnimalEncounters"]}',status=200;
  const scope={URL,Request,Response,Uint8Array,TextEncoder,TextDecoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{error(){},warn(){}},fetch:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return status===200?Response.json({choices:[{message:{content:reply}}]}):new Response('unavailable',{status});}};
  vm.runInNewContext(workerSource,scope);
  const env={LLM_API_KEY:'test-key',LLM_BASE_URL:'https://model.test/v1',LLM_MODEL:'test-model',DB:{prepare(){throw new Error('Чтение личных записей запрещено');}}};
  const run=async({caption='как я поймал катенка',owner='owner-a',method='POST',headers:extra={},raw,body,environment={}}={})=>{const headers={'content-type':'application/json',...extra};if(owner)headers['oai-authenticated-user-id']=owner;const response=await scope.app.fetch(new Request('https://mission.test/api/story-tags',{method,headers,...(method==='GET'?{}:{body:raw??JSON.stringify(body??{caption})})}),{...env,...environment},{waitUntil(){}});return {status:response.status,body:await response.json()};};
  return {run,calls,reply:value=>{reply=value;},status:value=>{status=value;}};
}
test('Подбор требует входа и своего происхождения до обращения к модели',async()=>{const f=fixture();assert.equal((await f.run({owner:null})).status,401);assert.equal((await f.run({headers:{origin:'https://other.test'}})).status,403);assert.equal((await f.run({headers:{'sec-fetch-site':'cross-site'}})).status,403);assert.equal(f.calls.length,0);});
test('Провайдер получает только подпись и инструкцию английских тегов без личной истории',async()=>{
  const f=fixture(),result=await f.run({body:{caption:'как я поймал катенка',diary:'Закрытая запись',wellbeing:15}});assert.equal(result.status,200);assert.equal(result.body.source,'model');assert.deepEqual(result.body.tags,['#Kittens','#AnimalEncounters',...domain]);const request=f.calls[0].body;assert.equal(request.messages[1].content,'как я поймал катенка');assert.ok(request.messages[0].content.includes('строго на английском'));assert.ok(!JSON.stringify(request).includes('Закрытая запись'));assert.equal(request.store,false);assert.equal(request.max_completion_tokens,256);
});
test('Модель может подобрать новую тему вне словаря приложения',async()=>{
  const f=fixture();f.reply('{"tags":["Pottery","CreativePractice"]}');const result=await f.run({caption:'Сегодня учился лепить керамическую чашку'});assert.equal(result.body.source,'model');assert.ok(result.body.tags.includes('#Pottery'));assert.ok(result.body.tags.includes('#CreativePractice'));
});
test('Неверный ответ или сбой модели оставляет осмысленные английские предложения',async()=>{
  for(const response of ['не JSON','{"tags":["Кошка","NASA"]}']){const f=fixture();f.reply(response);const result=await f.run();assert.equal(result.body.source,'local');assert.ok(result.body.tags.includes('#Kittens'));assert.ok(result.body.tags.every(tag=>/^#[A-Za-z0-9]+$/.test(tag)));}
  const f=fixture();f.status(503);assert.equal((await f.run()).body.source,'local');assert.equal(f.calls.length,1);
});
test('Повтор использует кэш только своего владельца и модели',async()=>{const f=fixture();await f.run();await f.run();assert.equal(f.calls.length,1);await f.run({owner:'owner-b'});assert.equal(f.calls.length,2);await f.run({environment:{LLM_MODEL:'other-model'}});assert.equal(f.calls.length,3);});
test('Пустой текст, отсутствие сервиса и запрет облака не вызывают внешнюю модель',async()=>{
  const f=fixture();for(const caption of ['', '🚀', '123'])assert.deepEqual((await f.run({caption})).body.tags,[]);assert.equal((await f.run({environment:{AIR_GAP:'1'}})).body.source,'local');assert.equal((await f.run({environment:{LLM_API_KEY:''}})).body.source,'local');assert.equal(f.calls.length,0);
});
test('Неверные типы, длина, размер и методы отклоняются до генерации',async()=>{
  const f=fixture();for(const options of [{caption:123},{caption:'x'.repeat(301)},{raw:'{'},{body:[]},{headers:{'content-type':'application/jsonp'}}])assert.equal((await f.run(options)).status,400);
  assert.equal((await f.run({raw:' '.repeat(4097)})).status,413);assert.equal((await f.run({method:'GET'})).status,405);assert.equal(f.calls.length,0);assert.equal((await f.run({caption:'x'.repeat(300)})).status,200);
});
