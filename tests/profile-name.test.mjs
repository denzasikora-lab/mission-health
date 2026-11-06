import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/profile-name.js',import.meta.url),'utf8');
const scopeA='a'.repeat(64),scopeB='b'.repeat(64),prefix='mission-profile-name:';
const person=(storageScope=scopeA,name='Егор Федосов')=>({storageScope,name,researcherId:'123 456 789'});
const copy=value=>JSON.parse(JSON.stringify(value));
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(storage=new Map()){
  const requests=[],events=[],listeners=new Map();
  const window={addEventListener(type,handler){listeners.set(type,handler);},dispatchEvent(event){events.push(event.type);}};
  const sandbox={window,Event,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
  vm.runInNewContext(source,sandbox);
  function respond(index,value,status=200){requests[index].resolve(Response.json(value,{status}));}
  async function boot(value=person()){const pending=window.missionProfileName.load();respond(0,value);await pending;return window.missionProfileName;}
  return {api:window.missionProfileName,requests,events,storage,listeners,respond,boot};
}

test('Профиль загружается один раз, имя нормализуется и кешируется по полному идентификатору владельца',async()=>{
  const storage=new Map([[prefix+scopeA,'Устаревшее имя'],['mission-health-log-123 456 789-name','Чужой старый кеш']]),f=fixture(storage);
  await f.boot(person(scopeA,'  \u0415гор   Ф\u0451досов \u2014 МКС  '));
  assert.equal(f.api.name,'Егор Федосов - МКС');assert.equal(f.api.identity.storageScope,scopeA);
  assert.equal(storage.get(prefix+scopeA),'Егор Федосов - МКС');assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/me');assert.equal(f.requests[0].options.cache,'no-store');
  assert.deepEqual(f.events,['mission-profile-change']);await f.api.load();assert.equal(f.requests.length,1);
});

test('Последовательные сохранения не отправляются параллельно и последнее имя становится основным',async()=>{
  const f=fixture();await f.boot();const first=f.api.set('Первое имя'),last=f.api.set('  Последнее   имя  ');await settle();
  assert.equal(f.requests.length,2);assert.equal(f.requests[1].options.method,'PUT');assert.equal(f.requests[1].options.headers['x-mission-profile-scope'],scopeA);assert.deepEqual(JSON.parse(f.requests[1].options.body),{name:'Первое имя'});
  f.respond(1,person(scopeA,'Первое имя'));await first;await settle();assert.equal(f.requests.length,3);assert.deepEqual(JSON.parse(f.requests[2].options.body),{name:'Последнее имя'});
  f.respond(2,person(scopeA,'Последнее имя'));await last;assert.equal(f.api.name,'Последнее имя');assert.equal(f.storage.get(prefix+scopeA),'Последнее имя');
});

test('Ошибка сохранения не меняет последнее принятое имя, кеш и события',async()=>{
  const f=fixture();await f.boot();const before=copy(f.api.identity),pending=f.api.set('Не сохранено');await settle();f.respond(1,{error:'unavailable'},503);
  await assert.rejects(pending,/profile_unavailable/);assert.deepEqual(copy(f.api.identity),before);assert.equal(f.storage.get(prefix+scopeA),before.name);assert.deepEqual(f.events,['mission-profile-change']);
});

test('Неверные имена и управляющие символы отклоняются без PUT',async()=>{
  const f=fixture();await f.boot();
  for(const value of ['', '   ', null, undefined, 42, {}, 'a'.repeat(101), 'Имя\nФамилия', 'Имя\tФамилия', 'Имя\u0000', 'Имя\u007f'])await assert.rejects(f.api.set(value),/invalid_name/);
  assert.equal(f.requests.length,1);assert.equal(f.api.name,'Егор Федосов');
});

test('Новая загрузка владельца изолирована от запоздалого предыдущего ответа',async()=>{
  const f=fixture(),first=f.api.load(),second=f.api.load(true);assert.equal(f.requests.length,2);
  f.respond(1,person(scopeB,'Другой владелец'));await second;f.respond(0,person(scopeA,'Первый владелец'));await first;
  assert.equal(f.api.identity.storageScope,scopeB);assert.equal(f.api.name,'Другой владелец');assert.equal(f.storage.has(prefix+scopeA),false);assert.equal(f.storage.get(prefix+scopeB),'Другой владелец');assert.deepEqual(f.events,['mission-profile-change']);
});

test('Поздний PUT прежнего владельца не заменяет новый профиль и его кеш',async()=>{
  const f=fixture();await f.boot();const save=f.api.set('Имя прежнего владельца');await settle();const switched=f.api.load(true);f.respond(2,person(scopeB,'Новый владелец'));await switched;f.respond(1,person(scopeA,'Имя прежнего владельца'));
  await assert.rejects(save,/profile_changed/);assert.equal(f.api.name,'Новый владелец');assert.equal(f.storage.get(prefix+scopeA),'Егор Федосов');assert.equal(f.storage.get(prefix+scopeB),'Новый владелец');
});

test('Очередь старого владельца не отправляет следующий PUT после смены аккаунта',async()=>{
  const f=fixture();await f.boot();const first=f.api.set('Первое имя'),last=f.api.set('Следующее имя');const firstRejected=assert.rejects(first,/profile_changed/),lastRejected=assert.rejects(last,/profile_changed/);await settle();
  const switched=f.api.load(true);f.respond(2,person(scopeB,'Новый владелец'));await switched;f.respond(1,person(scopeA,'Первое имя'));await firstRejected;await lastRejected;
  assert.equal(f.requests.filter(item=>item.options.method==='PUT').length,1);assert.equal(f.api.name,'Новый владелец');
});

test('Сохранение во время обновления дожидается подтверждения текущего владельца',async()=>{
  const f=fixture();await f.boot();const refresh=f.api.load(true),save=f.api.set('Новое имя');await settle();assert.equal(f.requests.length,2);
  f.respond(1,person(scopeB,'Другой владелец'));await refresh;await settle();assert.equal(f.requests.length,3);assert.equal(f.requests[2].options.headers['x-mission-profile-scope'],scopeB);
  f.respond(2,person(scopeB,'Новое имя'));await save;assert.equal(f.api.identity.storageScope,scopeB);assert.equal(f.api.name,'Новое имя');
});

test('Событие хранения обновляет только полный идентификатор активного владельца',async()=>{
  const f=fixture();await f.boot();const storage=f.listeners.get('storage');storage({key:prefix+scopeB});storage({key:'mission-health-log-123 456 789-name'});assert.equal(f.requests.length,1);
  storage({key:prefix+scopeA});assert.equal(f.requests.length,2);f.respond(1,person(scopeA,'Имя из другого окна'));await settle();assert.equal(f.api.name,'Имя из другого окна');
  assert.ok([...f.storage.keys()].every(key=>/^mission-profile-name:[a-f0-9]{64}$/.test(key)));
});

test('Некорректный идентификатор владельца из ответа не становится профилем',async()=>{
  const f=fixture(),pending=f.api.load();f.respond(0,person('123 456 789','Неверный профиль'));await assert.rejects(pending,/profile_unavailable/);
  assert.equal(f.api.identity,null);assert.equal(f.api.name,'');assert.equal(f.storage.size,0);assert.deepEqual(f.events,[]);
});

test('Запоздалый GET не заменяет имя после успешного сохранения',async()=>{
  const f=fixture();await f.boot();const save=f.api.set('Сохраненное имя');await settle();const refresh=f.api.load(true);f.respond(1,person(scopeA,'Сохраненное имя'));await save;f.respond(2,person());await refresh;
  assert.equal(f.api.name,'Сохраненное имя');assert.equal(f.storage.get(prefix+scopeA),'Сохраненное имя');
});

test('Неудачная последняя правка сохраняет предыдущее успешно записанное имя очереди',async()=>{
  const f=fixture();await f.boot();const first=f.api.set('Успешное имя'),last=f.api.set('Неудачное имя'),lastRejected=assert.rejects(last,/profile_unavailable/);await settle();f.respond(1,person(scopeA,'Успешное имя'));await first;await settle();f.respond(2,{error:'unavailable'},503);await lastRejected;
  assert.equal(f.api.name,'Успешное имя');assert.equal(f.storage.get(prefix+scopeA),'Успешное имя');
});
