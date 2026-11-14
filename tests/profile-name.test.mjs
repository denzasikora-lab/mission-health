import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/profile-name.js',import.meta.url),'utf8');
const scopeA='a'.repeat(64),scopeB='b'.repeat(64),prefix='mission-profile-name:';
const person=(storageScope=scopeA,name='Egor Fedosov')=>({storageScope,name,researcherId:'123 456 789'});
const copy=value=>JSON.parse(JSON.stringify(value));
const settle=()=>new Promise(resolve=>setImmediate(resolve));

class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.parentElement=null;this.className='';this.value='';this.text='';this.disabled=false;this.style={};this.attributes={};this.events={};this.classList={add:name=>{this.className+=' '+name;}};}
  set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text+this.children.map(item=>item.textContent).join('');}
  get lastElementChild(){return this.children.at(-1)||null;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  insertBefore(node,target){node.parentElement=this;const index=this.children.indexOf(target);this.children.splice(index<0?this.children.length:index,0,node);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  emit(type){for(const callback of this.events[type]||[])callback({type,target:this,preventDefault(){}});}
  querySelector(selector){for(const item of this.children){if(selector.startsWith('.')?item.className.split(' ').includes(selector.slice(1)):item.tagName===selector)return item;const child=item.querySelector(selector);if(child)return child;}return null;}
}
function mounted(storage=new Map()){
  let timerId=0;const timers=new Map(),heading=new Element('header');heading.append(new Element('div'),new Element('button'));
  const f=fixture(storage,{document:{createElement:tag=>new Element(tag)},setTimeout(callback,delay){timers.set(++timerId,{callback,delay});return timerId;},clearTimeout:id=>timers.delete(id)});f.api.attach(heading);const form=heading.querySelector('.profile-name-form'),[input,action,status]=form.children;
  return {...f,heading,form,input,action,status,timers,fire(delay){for(const [id,timer]of [...timers])if(timer.delay===delay){timers.delete(id);timer.callback();}}};
}

function fixture(storage=new Map(),options={}){
  const requests=[],events=[],listeners=new Map();
  const window={addEventListener(type,handler){listeners.set(type,handler);},dispatchEvent(event){events.push(event.type);}};
  const sandbox={window,Event,AbortController,setTimeout:options.setTimeout||setTimeout,clearTimeout:options.clearTimeout||clearTimeout,...(options.document?{document:options.document}:{}),localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
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


test('The mounted field displays an editable default and preserves offline typing without inventing identity or saving',async()=>{
  const f=mounted();assert.equal(f.input.value,'Cdr. Sara Khan');assert.equal(f.input.disabled,false);assert.equal(f.api.identity,null);assert.equal(f.action.textContent,'Retry');assert.equal(f.action.disabled,true);f.input.value='Offline draft';f.input.emit('input');f.respond(0,{error:'unavailable'},503);await settle();assert.equal(f.input.value,'Offline draft');assert.equal(f.input.disabled,false);assert.equal(f.action.disabled,false);assert.match(f.status.textContent,/not saved/);f.input.value='Revised offline draft';f.input.emit('input');f.input.emit('change');f.form.emit('submit');await settle();assert.equal(f.requests.length,2);assert.ok(f.requests.every(item=>item.options.method!=='PUT'));assert.equal(f.api.identity,null);assert.equal(f.storage.size,0);assert.deepEqual(f.events,[]);f.respond(1,{error:'unavailable'},503);await settle();
});
test('Initial recovery keeps the draft but requires explicit Save after identity is confirmed',async()=>{
  const f=mounted();f.input.value='Amira Noor';f.input.emit('input');f.respond(0,{error:'unavailable'},503);await settle();f.action.emit('click');assert.equal(f.requests.length,2);f.respond(1,person(scopeA,'Cdr. Sara Khan'));await settle();assert.equal(f.input.value,'Amira Noor');assert.equal(f.input.disabled,false);assert.equal(f.action.textContent,'Save');assert.match(f.status.textContent,/Review the name and press Save/);assert.doesNotMatch(f.status.textContent,/Could not load/);assert.equal(f.storage.get(prefix+scopeA),'Cdr. Sara Khan');assert.equal(f.requests.length,2);f.input.emit('change');await settle();assert.equal(f.requests.length,2);f.action.emit('click');await settle();assert.equal(f.requests.length,3);assert.equal(f.requests[2].options.headers['x-mission-profile-scope'],scopeA);assert.deepEqual(JSON.parse(f.requests[2].options.body),{name:'Amira Noor'});f.respond(2,person(scopeA,'Amira Noor'));await settle();assert.equal(f.status.textContent,'Saved');assert.equal(f.api.name,'Amira Noor');
});
test('A recovered unchanged field clears the load error and shows the server default',async()=>{
  const f=mounted();f.respond(0,{error:'unavailable'},503);await settle();assert.match(f.status.textContent,/Could not load/);f.action.emit('click');f.respond(1,person(scopeA,'Cdr. Sara Khan'));await settle();assert.equal(f.input.value,'Cdr. Sara Khan');assert.equal(f.input.disabled,false);assert.equal(f.action.textContent,'Save');assert.equal(f.status.textContent,'');
});
test('A confirmed owner switch discards the previous owner draft and pending autosave timer',async()=>{
  const f=mounted();await f.boot(person(scopeA,'Owner A'));f.input.value='Owner A unsaved draft';f.input.emit('input');assert.ok([...f.timers.values()].some(timer=>timer.delay===700));const refresh=f.api.load(true);f.respond(1,person(scopeB,'Owner B'));await refresh;assert.equal(f.input.value,'Owner B');assert.equal(f.storage.get(prefix+scopeA),'Owner A');assert.equal(f.storage.get(prefix+scopeB),'Owner B');f.fire(700);f.input.emit('change');await settle();assert.equal(f.requests.filter(item=>item.options.method==='PUT').length,0);assert.match(f.status.textContent,/previous draft was not saved/);
});
test('A bounded load timeout leaves typing and Retry available and ignores its late response',async()=>{
  const f=mounted(),pending=f.api.load();f.input.value='Waiting draft';f.input.emit('input');assert.ok([...f.timers.values()].some(timer=>timer.delay===15000));f.fire(15000);await assert.rejects(pending,/profile_timeout/);await settle();assert.equal(f.requests[0].options.signal.aborted,true);assert.equal(f.input.disabled,false);assert.equal(f.action.disabled,false);assert.equal(f.action.textContent,'Retry');assert.equal(f.api.identity,null);f.respond(0,person(scopeA,'Late owner'));await settle();assert.equal(f.api.identity,null);assert.equal(f.storage.size,0);f.action.emit('click');f.respond(1,person(scopeB,'Confirmed owner'));await settle();assert.equal(f.api.identity.storageScope,scopeB);assert.equal(f.input.value,'Waiting draft');assert.match(f.status.textContent,/press Save/);assert.equal(f.requests.filter(item=>item.options.method==='PUT').length,0);
});
test('The request timeout also bounds a stalled JSON body',async()=>{
  const f=mounted(),pending=f.api.load();f.requests[0].resolve({ok:true,json:()=>new Promise(()=>{})});await settle();f.fire(15000);await assert.rejects(pending,/profile_timeout/);await settle();assert.equal(f.action.disabled,false);assert.equal(f.input.value,'Cdr. Sara Khan');assert.equal(f.api.identity,null);
});
test('Mounted save failure keeps the editable draft and prior owner cache for an explicit retry',async()=>{
  const f=mounted();await f.boot(person(scopeA,'Original'));f.input.value='Updated';f.input.emit('input');f.action.emit('click');await settle();assert.equal(f.requests[1].options.method,'PUT');f.respond(1,{error:'unavailable'},503);await settle();assert.equal(f.input.value,'Updated');assert.equal(f.input.disabled,false);assert.match(f.status.textContent,/Could not save/);assert.equal(f.storage.get(prefix+scopeA),'Original');assert.equal(f.action.textContent,'Save');f.action.emit('click');await settle();assert.equal(f.requests[2].options.headers['x-mission-profile-scope'],scopeA);f.respond(2,person(scopeA,'Updated'));await settle();assert.equal(f.status.textContent,'Saved');assert.equal(f.storage.get(prefix+scopeA),'Updated');
});
