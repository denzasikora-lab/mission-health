import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/profile-name.js',import.meta.url),'utf8');
const scopeA='a'.repeat(64),scopeB='b'.repeat(64),prefix='mission-profile-name:';
const person=(storageScope=scopeA,name='Egor Fedosov')=>({storageScope,name,researcherId:'123 456 789'});
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

test('The profile loads once, names are normalized and cached by full owner identifier',async()=>{
  const storage=new Map([[prefix+scopeA,'Stale name'],['mission-health-log-123 456 789-name','Another owner’s old cache']]),f=fixture(storage);
  await f.boot(person(scopeA,'  Egor   Fedosov \u2014 ISS  '));
  assert.equal(f.api.name,'Egor Fedosov - ISS');assert.equal(f.api.identity.storageScope,scopeA);
  assert.equal(storage.get(prefix+scopeA),'Egor Fedosov - ISS');assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/me');assert.equal(f.requests[0].options.cache,'no-store');
  assert.deepEqual(f.events,['mission-profile-change']);await f.api.load();assert.equal(f.requests.length,1);
});

test('Sequential saves do not run in parallel and the last name becomes current',async()=>{
  const f=fixture();await f.boot();const first=f.api.set('First name'),last=f.api.set('  Last   name  ');await settle();
  assert.equal(f.requests.length,2);assert.equal(f.requests[1].options.method,'PUT');assert.equal(f.requests[1].options.headers['x-mission-profile-scope'],scopeA);assert.deepEqual(JSON.parse(f.requests[1].options.body),{name:'First name'});
  f.respond(1,person(scopeA,'First name'));await first;await settle();assert.equal(f.requests.length,3);assert.deepEqual(JSON.parse(f.requests[2].options.body),{name:'Last name'});
  f.respond(2,person(scopeA,'Last name'));await last;assert.equal(f.api.name,'Last name');assert.equal(f.storage.get(prefix+scopeA),'Last name');
});

test('Save failure preserves the last accepted name, cache and events',async()=>{
  const f=fixture();await f.boot();const before=copy(f.api.identity),pending=f.api.set('Not saved');await settle();f.respond(1,{error:'unavailable'},503);
  await assert.rejects(pending,/profile_unavailable/);assert.deepEqual(copy(f.api.identity),before);assert.equal(f.storage.get(prefix+scopeA),before.name);assert.deepEqual(f.events,['mission-profile-change']);
});

test('Invalid names and control characters are rejected without PUT',async()=>{
  const f=fixture();await f.boot();
  for(const value of ['', '   ', null, undefined, 42, {}, 'a'.repeat(101), 'First name\nLast name', 'First name\tLast name', 'First name\u0000', 'First name\u007f'])await assert.rejects(f.api.set(value),/invalid_name/);
  assert.equal(f.requests.length,1);assert.equal(f.api.name,'Egor Fedosov');
});

test('New owner loading is isolated from late previous responses',async()=>{
  const f=fixture(),first=f.api.load(),second=f.api.load(true);assert.equal(f.requests.length,2);
  f.respond(1,person(scopeB,'Another owner'));await second;f.respond(0,person(scopeA,'First owner'));await first;
  assert.equal(f.api.identity.storageScope,scopeB);assert.equal(f.api.name,'Another owner');assert.equal(f.storage.has(prefix+scopeA),false);assert.equal(f.storage.get(prefix+scopeB),'Another owner');assert.deepEqual(f.events,['mission-profile-change']);
});

test('Late PUT from the previous owner does not replace the new profile or cache',async()=>{
  const f=fixture();await f.boot();const save=f.api.set('Previous owner’s name');await settle();const switched=f.api.load(true);f.respond(2,person(scopeB,'New owner'));await switched;f.respond(1,person(scopeA,'Previous owner’s name'));
  await assert.rejects(save,/profile_changed/);assert.equal(f.api.name,'New owner');assert.equal(f.storage.get(prefix+scopeA),'Egor Fedosov');assert.equal(f.storage.get(prefix+scopeB),'New owner');
});

test('The old owner’s queue does not send the next PUT after account switching',async()=>{
  const f=fixture();await f.boot();const first=f.api.set('First name'),last=f.api.set('Next name');const firstRejected=assert.rejects(first,/profile_changed/),lastRejected=assert.rejects(last,/profile_changed/);await settle();
  const switched=f.api.load(true);f.respond(2,person(scopeB,'New owner'));await switched;f.respond(1,person(scopeA,'First name'));await firstRejected;await lastRejected;
  assert.equal(f.requests.filter(item=>item.options.method==='PUT').length,1);assert.equal(f.api.name,'New owner');
});

test('Saving during refresh waits for current owner confirmation',async()=>{
  const f=fixture();await f.boot();const refresh=f.api.load(true),save=f.api.set('New name');await settle();assert.equal(f.requests.length,2);
  f.respond(1,person(scopeB,'Another owner'));await refresh;await settle();assert.equal(f.requests.length,3);assert.equal(f.requests[2].options.headers['x-mission-profile-scope'],scopeB);
  f.respond(2,person(scopeB,'New name'));await save;assert.equal(f.api.identity.storageScope,scopeB);assert.equal(f.api.name,'New name');
});

test('Storage events update only the active owner’s full identifier',async()=>{
  const f=fixture();await f.boot();const storage=f.listeners.get('storage');storage({key:prefix+scopeB});storage({key:'mission-health-log-123 456 789-name'});assert.equal(f.requests.length,1);
  storage({key:prefix+scopeA});assert.equal(f.requests.length,2);f.respond(1,person(scopeA,'Name from another window'));await settle();assert.equal(f.api.name,'Name from another window');
  assert.ok([...f.storage.keys()].every(key=>/^mission-profile-name:[a-f0-9]{64}$/.test(key)));
});

test('An invalid owner identifier in a response cannot become a profile',async()=>{
  const f=fixture(),pending=f.api.load();f.respond(0,person('123 456 789','Invalid profile'));await assert.rejects(pending,/profile_unavailable/);
  assert.equal(f.api.identity,null);assert.equal(f.api.name,'');assert.equal(f.storage.size,0);assert.deepEqual(f.events,[]);
});

test('Delayed GET does not replace the name after a successful save',async()=>{
  const f=fixture();await f.boot();const save=f.api.set('Saved name');await settle();const refresh=f.api.load(true);f.respond(1,person(scopeA,'Saved name'));await save;f.respond(2,person());await refresh;
  assert.equal(f.api.name,'Saved name');assert.equal(f.storage.get(prefix+scopeA),'Saved name');
});

test('A failed final edit preserves the previous successful queued name',async()=>{
  const f=fixture();await f.boot();const first=f.api.set('Successful name'),last=f.api.set('Failed name'),lastRejected=assert.rejects(last,/profile_unavailable/);await settle();f.respond(1,person(scopeA,'Successful name'));await first;await settle();f.respond(2,{error:'unavailable'},503);await lastRejected;
  assert.equal(f.api.name,'Successful name');assert.equal(f.storage.get(prefix+scopeA),'Successful name');
});
