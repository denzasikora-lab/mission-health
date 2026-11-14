import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const source=await readFile(new URL('../public/actiwatch.js',import.meta.url),'utf8'),coreSource=await readFile(new URL('../public/actiwatch-core.js',import.meta.url),'utf8');
const now=Date.parse('2026-11-14T10:00:00Z'),id='a7337ee1-9cf8-42cf-b0d5-75d90258835c',secondId='bbbbbbbb-9cf8-42cf-b0d5-75d90258835c',clone=value=>JSON.parse(JSON.stringify(value));
const metadata=(key=id)=>({id:key,filename:'real-watch.csv',createdAt:new Date(now).toISOString()});
const recording=()=>({version:1,sourceFormat:'actiware-csv',epochSeconds:60,warnings:[],rows:[{timestamp:'2026-11-14T09:58:00Z',activity:10,lightLux:20,sleepState:'sleep',offWrist:false,excluded:false},{timestamp:'2026-11-14T09:59:00Z',activity:20,lightLux:40,sleepState:'wake',offWrist:false,excluded:false}]});
const csv='Epoch Length (seconds),60\nTimestamp,Activity,White Light (lux),Sleep/Wake Score,Off-Wrist Status\n2026-11-14T09:58:00Z,10,20,0,0\n2026-11-14T09:59:00Z,20,40,1,0\n';
const file=(name='watch.csv',read=async()=>new TextEncoder().encode(csv).buffer)=>({name,size:csv.length,arrayBuffer:read});
const flush=async()=>{for(let index=0;index<20;index++)await Promise.resolve();};
class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.style={};this.hidden=false;this.disabled=false;this.open=false;this.value='';this._text='';this.className='';this.parent=null;this.files=[];}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  set innerHTML(value){this.children=[];for(const match of value.matchAll(/<(input|select|div|p|button)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Node(match[1]);node.id=match[2];node.hidden=match[0].includes('hidden');node.disabled=match[0].includes('disabled');this.append(node);}const close=new Node('button');close.dataset.actiwatchClose='';this.append(close);}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  emit(type,event={}){return Promise.all((this.events[type]||[]).map(callback=>callback({type,target:this,...event})));}
  matches(selector){if(selector.includes(','))return selector.split(',').some(value=>this.matches(value));if(selector==='[data-actiwatch-close]')return Object.hasOwn(this.dataset,'actiwatchClose');if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));return selector===this.tagName;}
  querySelectorAll(selector){return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function fixture(initial=async()=>({latest:null}),owner='owner-a'){
  let handler=initial,homeRenders=0;const events={},calls=[],timers=new Map();let timerId=0;
  const body=new Node('body'),home=new Node('section'),panel=new Node('section');home.id='mission-home';panel.className='home-body-panel';body.append(home);home.append(panel);
  const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean),document={body,getElementById:id=>find(body,id)||null,createElement:tag=>new Node(tag)};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const scope={document,Date:Clock,Intl,Event,AbortController,TextDecoder,crypto:webcrypto,setTimeout(callback,delay){timers.set(++timerId,{callback,delay});return timerId;},clearTimeout:key=>timers.delete(key),addEventListener(type,callback){(events[type]||=[]).push(callback);},dispatchEvent(event){for(const callback of events[event.type]||[])callback(event);},journalApi:async(path,options={})=>{const call={path,...options,body:options.body?JSON.parse(options.body):null};calls.push(call);return handler(call);}};scope.window=scope;scope.missionHome={renderValues(){homeRenders++;}};scope.missionProfileName={identity:owner?{storageScope:owner}:null};
  vm.runInNewContext(coreSource,scope);vm.runInNewContext(source,scope);
  return {scope,calls,timers,panel,api:scope.missionActiwatch,get:id=>document.getElementById(id),renders:()=>homeRenders,eventCount:type=>(events[type]||[]).length,handler:value=>{handler=value;},owner:value=>{scope.missionProfileName.identity=value?{storageScope:value}:null;scope.dispatchEvent(new Event('mission-profile-change'));},emit:(type,event={})=>{for(const callback of events[type]||[])callback({type,...event});},status:()=>body.querySelector('.actiwatch-source-note').textContent};
}
const actual=call=>call.path==='/api/actiwatch'?{latest:metadata()}:{import:metadata(),recording:recording()};

test('Missing watch input stays missing and initial load never uploads or manufactures epochs',async()=>{
  const f=fixture();assert.equal(f.api.current(),null);assert.equal(f.api.recording(),null);assert.deepEqual(clone(f.api.series()),[]);await flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,undefined);assert.equal(f.panel.dataset.actiwatchSource,'missing');assert.match(f.status(),/No watch data imported/);assert.equal(f.timers.size,0);
  f.handler(()=>{throw new Error('offline');});await f.api.refresh();assert.equal(f.api.current(),null);assert.equal(f.api.status().refreshFailed,true);assert.match(f.status(),/No watch measurements/);
});
test('Actual list and detail responses expose immutable real epochs and a locally verified summary',async()=>{
  const f=fixture(actual);await flush();assert.equal(f.api.current().id,id);assert.equal(f.api.current().source,'actiwatch');assert.equal(f.api.current().summary.end,new Date(now).toISOString());assert.equal(f.api.current().summary.latest24h.activityCounts,30);assert.equal(f.api.current().summary.latest24h.sleepSeconds,60);assert.equal(f.api.current().summary.latest24h.meanLightLux,30);assert.equal(f.api.series().length,2);assert.equal(f.api.recording().rows[0].activity,10);assert.equal(Object.isFrozen(f.api.recording().rows),true);assert.equal(Object.isFrozen(f.api.current().summary),true);assert.ok(f.renders()>=2);assert.equal(f.eventCount('mission-actiwatch-change'),0);assert.match(f.status(),/real-watch.csv.*Recorded.*UTC/);assert.equal(f.panel.dataset.actiwatchSource,'actiwatch');assert.equal(f.timers.size,0);
});
test('Refresh failure preserves only the actual saved import and its original observation date',async()=>{
  const f=fixture(actual);await flush();const original=clone(f.api.current()),epochs=f.api.recording();let changes=0;f.scope.addEventListener('mission-actiwatch-change',()=>{changes++;});f.handler(()=>{throw new Error('offline');});await f.api.refresh();assert.deepEqual(clone(f.api.current()),original);assert.equal(f.api.recording(),epochs);assert.equal(f.api.status().observedAt,new Date(now).toISOString());assert.match(f.status(),/Refresh failed; last saved import shown/);assert.equal(changes,1);
  f.handler(()=>({latest:null}));await f.api.refresh();assert.equal(f.api.current(),null);assert.equal(f.api.recording(),null);assert.equal(f.api.status().refreshFailed,false);assert.equal(f.panel.dataset.actiwatchSource,'missing');
});
test('Corrupt new details cannot replace the last validated import',async()=>{
  const f=fixture(actual);await flush();f.handler(call=>call.path==='/api/actiwatch'?{latest:metadata(secondId)}:{import:metadata(secondId),recording:{...recording(),epochSeconds:0}});await f.api.refresh();assert.equal(f.api.current().id,id);assert.equal(f.api.status().refreshFailed,true);assert.equal(f.api.recording().epochSeconds,60);
});
test('A stale prior owner detail cannot populate a new owners current data',async()=>{
  let resolveDetail;const f=fixture(call=>call.path==='/api/actiwatch'?{latest:metadata()}:new Promise(resolve=>{resolveDetail=resolve;}));await flush();const pending=f.calls.at(-1);assert.match(pending.path,/api\/actiwatch\//);f.handler(()=>({latest:null}));f.owner('owner-b');await flush();assert.equal(pending.signal.aborted,true);resolveDetail({import:metadata(),recording:recording()});await flush();assert.equal(f.api.current(),null);assert.equal(f.api.recording(),null);assert.equal(f.panel.dataset.actiwatchSource,'missing');
});
test('A newer refresh wins even if an aborted older response completes later',async()=>{
  const f=fixture();await flush();let resolveOld;f.handler(()=>new Promise(resolve=>{resolveOld=resolve;}));const old=f.api.refresh();await flush();f.handler(actual);await f.api.refresh();assert.equal(f.api.current().id,id);resolveOld({latest:null});await old;assert.equal(f.api.current().id,id);assert.equal(f.api.status().refreshFailed,false);
});
test('Lost authentication and identity changes clear actual saved data rather than show another owners import',async()=>{
  const f=fixture(actual);await flush();f.handler(()=>{throw new Error('sign_in_required');});await f.api.refresh();assert.equal(f.api.current(),null);assert.equal(f.api.recording(),null);f.handler(actual);await f.api.refresh();assert.ok(f.api.current());f.owner(null);assert.equal(f.api.current(),null);assert.equal(f.api.recording(),null);assert.equal(f.get('actiwatch-save').disabled,true);assert.equal(f.timers.size,0);
});
test('A file read completing after an owner switch cannot enable another owners import',async()=>{
  const f=fixture();await flush();let resolveRead;f.get('actiwatch-file').files=[file('old.csv',()=>new Promise(resolve=>{resolveRead=resolve;}))];const selected=f.get('actiwatch-file').emit('change');f.owner('owner-b');await flush();resolveRead(new TextEncoder().encode(csv).buffer);await selected;assert.equal(f.get('actiwatch-save').disabled,true);assert.equal(f.get('actiwatch-preview').hidden,true);assert.equal(f.get('actiwatch-preview-status').textContent,'No file selected yet.');
});
test('A later selected CSV wins if the earlier file read finishes last',async()=>{
  const f=fixture();await flush();let resolveRead;f.get('actiwatch-file').files=[file('old.csv',()=>new Promise(resolve=>{resolveRead=resolve;}))];const old=f.get('actiwatch-file').emit('change');f.get('actiwatch-file').files=[file('new.csv')];await f.get('actiwatch-file').emit('change');resolveRead(new TextEncoder().encode('invalid').buffer);await old;assert.equal(f.get('actiwatch-save').disabled,false);assert.match(f.get('actiwatch-preview-status').textContent,/2 epochs/);
});
test('Saving actual CSV updates the shared current model and emits a change without any demo fallback',async()=>{
  let saved=null;const f=fixture(call=>{if(call.method==='POST'){saved={...metadata(call.body.id),filename:call.body.filename};return {import:saved};}return call.path==='/api/actiwatch'?{latest:saved}:{import:saved,recording:recording()};});await flush();f.get('actiwatch-file').files=[file()];await f.get('actiwatch-file').emit('change');assert.equal(f.get('actiwatch-save').disabled,false);f.api.openImport();let changes=0;f.scope.addEventListener('mission-actiwatch-change',()=>{changes++;});await f.get('actiwatch-save').emit('click');assert.equal(f.api.current().filename,'watch.csv');assert.equal(f.api.current().summary.latest24h.activityCounts,30);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.get('actiwatch-dialog').open,false);assert.equal(f.get('actiwatch-save').disabled,true);assert.ok(changes>=1);assert.ok(f.renders()>=3);assert.equal(f.timers.size,0);
});
test('Page suspension aborts unfinished imports and restores retry controls without accepting their late result',async()=>{
  const f=fixture();await flush();f.get('actiwatch-file').files=[file()];await f.get('actiwatch-file').emit('change');let resolveSave;f.handler(()=>new Promise(resolve=>{resolveSave=resolve;}));const save=f.get('actiwatch-save').emit('click');await flush();const pending=f.calls.at(-1);assert.equal(f.get('actiwatch-file').disabled,true);f.emit('pagehide');assert.equal(pending.signal.aborted,true);assert.equal(f.get('actiwatch-file').disabled,false);assert.equal(f.get('actiwatch-save').disabled,false);resolveSave({import:metadata(pending.body.id)});await save;assert.equal(f.api.current(),null);f.handler(()=>({latest:null}));f.emit('pageshow');await flush();assert.equal(f.api.current(),null);assert.equal(f.timers.size,0);
});
