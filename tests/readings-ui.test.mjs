import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url),coreSource=await readFile(new URL('public/health-rules-core.js',root),'utf8'),source=await readFile(new URL('public/readings.js',root),'utf8'),personalSource=await readFile(new URL('public/personal-space.js',root),'utf8');
const now=Date.parse('2026-11-14T10:00:00Z'),at='2026-11-14T09:59:00.000Z',clone=value=>JSON.parse(JSON.stringify(value));
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function events(target={}){const handlers={};target.addEventListener=(type,callback)=>(handlers[type]||=[]).push(callback);target.dispatchEvent=event=>{for(const callback of handlers[event.type]||[])callback(event);};return target;}
const flush=async()=>{for(let index=0;index<20;index++)await Promise.resolve();};
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.parentElement=null;this.dataset={};this.attributes={};this.events={};this.className='';this.value='';this.text='';this.hidden=false;this.disabled=false;}
  set textContent(value){this.text=String(value);this.children=[];}get textContent(){return this.text+this.children.map(item=>item.textContent).join('');}
  set innerHTML(value){throw new Error('Readings UI must use safe text, not HTML');}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  after(node){const parent=this.parentElement;node.parentElement=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  emit(type){for(const callback of this.events[type]||[])callback({type,target:this,preventDefault(){}});}
  matches(selector){return selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):selector.startsWith('[data-reading-field=')?this.dataset.readingField===selector.slice(20,-1):this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(item=>[...(item.matches(selector)?[item]:[]),...item.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function mounted(){const home=new Element('section'),panel=new Element('section');panel.className='home-body-panel';home.append(panel);const document={getElementById:id=>id==='mission-home'?home:null,createElement:tag=>new Element(tag)},f=fixture(null,document);return {...f,home,panel:home.querySelector('.readings-entry')};}
function fixture(handler=null,document={getElementById:()=>null}){
  const calls=[],eventsSeen=[];let run=handler;const scope=events({Date:Clock,Intl,Event,TextEncoder,AbortController,crypto:webcrypto,document,journalApi:async(path,options={})=>{const call={path,...options,body:options.body?JSON.parse(options.body):undefined};calls.push(call);return run?run(call):{snapshot:scope.MissionReadingsCore.empty(),records:[],truncated:false};}});scope.window=scope;scope.missionProfileName={identity:{storageScope:'owner-a'}};scope.addEventListener('mission-readings-change',()=>eventsSeen.push('changed'));vm.runInNewContext(coreSource,scope);vm.runInNewContext(source,scope);return {scope,api:scope.missionReadings,core:scope.MissionReadingsCore,calls,eventsSeen,handler:value=>{run=value;},owner(value){scope.missionProfileName.identity=value?{storageScope:value}:null;scope.dispatchEvent(new Event('mission-profile-change'));}};
}
function response(call,core){const record={...call.body,createdAt:new Clock().toISOString(),vectorStatus:'pending'};return {record,snapshot:record.snapshot,provenance:Object.fromEntries(Object.keys(record.snapshot.readings).filter(key=>record.snapshot.readings[key]).map(key=>[key,{recordId:record.id,sourceName:record.sourceName,createdAt:record.createdAt}])),duplicate:false};}

test('An empty account loads once without creating measurements or making AI calls',async()=>{
  const f=fixture();await flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/readings');assert.equal(f.calls[0].method,undefined);assert.ok(Object.values(f.api.current().readings).every(value=>value===null));assert.equal(f.api.records().length,0);assert.equal(f.api.state().loaded,true);
});
test('Manual numeric values preserve units and measurement time with no derived recovery or body temperature',()=>{
  const f=fixture(),snapshot=f.core.manual({heart_rate:72,spo2:98,skin_temperature:33.2,steps:0},at);assert.deepEqual(clone(snapshot.readings.heart_rate),{value:72,unit:'bpm',source:'manual',observedAt:at});assert.equal(snapshot.readings.steps.value,0);assert.equal(snapshot.readings.body_temperature,null);assert.equal(snapshot.readings.recovery,null);assert.equal(snapshot.readings.fatigue_index,null);
  for(const values of [{heart_rate:'72'},{heart_rate:0},{spo2:101},{steps:Infinity},{unknown:4},{}])assert.throws(()=>f.core.manual(values,at));
  for(const time of ['2026-11-14 09:00','2026-02-30T09:00:00Z','2026-11-14T10:06:00Z',null])assert.throws(()=>f.core.manual({heart_rate:72},time));
});
test('CSV import validates exact units, decimal numbers, timestamps and duplicate metrics before saving',async()=>{
  const f=fixture();await flush();const csv='metric,value,unit,observedAt\r\nheart_rate,72,bpm,2026-11-14T09:59:00Z\r\nbody_temperature,"36.8",C,2026-11-14T09:58:00Z\r\n';const result=f.core.importText(csv,'readings.csv','Device export entered by me');assert.equal(result.sourceName,'Device export entered by me');assert.equal(result.snapshot.readings.body_temperature.value,36.8);assert.equal(result.snapshot.readings.heart_rate.observedAt,at);assert.equal(f.calls.length,1);
  for(const invalid of [csv.replace('bpm','%'),csv.replace('heart_rate','unknown'),csv+'heart_rate,73,bpm,2026-11-14T09:59:00Z',csv.replace('72',''),csv.replace('72','NaN'),csv.replace('36.8','36,8'),csv.replace('09:59:00Z','09:59:00')])assert.throws(()=>f.core.importText(invalid,'test.csv'));
  assert.throws(()=>f.core.importText('x'.repeat(65537),'too-large.csv'));
});
test('JSON imports accept only factual manual snapshots and never trust imported identifiers or demo sources',()=>{
  const f=fixture(),snapshot=f.core.manual({respiratory_rate:14},at),raw=JSON.stringify({sourceName:'  Manual   export  ',snapshot});assert.equal(f.core.importText(raw,'export.json').snapshot.readings.respiratory_rate.value,14);assert.equal(f.core.importText(raw,'export.json').sourceName,'Manual export');
  for(const modify of [value=>{value.id=webcrypto.randomUUID();},value=>{value.snapshot.readings.respiratory_rate.source='demo';value.snapshot.readings.respiratory_rate.observedAt=null;},value=>{value.snapshot.actiwatchImportId=webcrypto.randomUUID();},value=>{value.snapshot.readings.respiratory_rate.unit='bpm';},value=>{value.sourceName='Invalid\nsource';}]){const value=JSON.parse(raw);modify(value);assert.throws(()=>f.core.importText(JSON.stringify(value),'export.json'));}
});
test('A successful save updates one shared numeric store and retains source provenance safely as text',async()=>{
  const f=fixture();await flush();f.handler(call=>response(call,f.core));const sourceName='<img src=x onerror=bad()>',payload={sourceName,snapshot:f.core.manual({heart_rate:88,hrv:47},at)};await f.api.save(payload);const writes=f.calls.filter(call=>call.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].path,'/api/readings');assert.equal(f.api.current().readings.heart_rate.value,88);assert.equal(f.api.provenance().heart_rate.sourceName,sourceName);assert.equal(f.api.records().length,1);assert.equal(f.api.records()[0].vectorStatus,'pending');const copy=f.api.current();copy.readings.heart_rate.value=200;assert.equal(f.api.current().readings.heart_rate.value,88);assert.equal(f.api.state().pending,null);
});
test('A failed save keeps the same UUID and original snapshot for retry without replacing saved measurements',async()=>{
  const f=fixture();await flush();f.handler(()=>{throw new Error('offline');});const payload={sourceName:'Manual entry',snapshot:f.core.manual({heart_rate:91},at)};await assert.rejects(f.api.save(payload));const first=clone(f.calls.at(-1).body);assert.equal(f.api.current().readings.heart_rate,null);assert.deepEqual(clone(f.api.state().pending),first);await assert.rejects(f.api.save({sourceName:'Changed',snapshot:f.core.manual({heart_rate:200},at)}),/readings_retry_pending/);f.handler(call=>response(call,f.core));await f.api.retry();assert.deepEqual(f.calls.at(-1).body,first);assert.equal(f.api.current().readings.heart_rate.value,91);assert.equal(f.api.state().pending,null);
});
test('Older account responses cannot restore another owner readings or pending payload',async()=>{
  const f=fixture();await flush();let resolve;f.handler(()=>new Promise(done=>{resolve=done;}));const loading=f.api.refresh();const value=f.core.manual({heart_rate:150},at);f.handler(()=>({snapshot:f.core.empty(),records:[]}));f.owner('owner-b');await flush();resolve({snapshot:value,records:[]});await loading;assert.equal(f.api.current().readings.heart_rate,null);assert.equal(f.api.records().length,0);
  let finish;f.handler(()=>new Promise(done=>{finish=done;}));const save=f.api.save({sourceName:'Owner B entry',snapshot:value});const sent=f.calls.at(-1);f.handler(()=>({snapshot:f.core.empty(),records:[]}));f.owner('owner-c');await flush();finish(response(sent,f.core));await assert.rejects(save,/profile_changed/);assert.equal(f.api.current().readings.heart_rate,null);assert.equal(f.api.state().pending,null);
});
test('Malformed refresh preserves the previous fully accepted numeric store and provenance',async()=>{
  const f=fixture();await flush();f.handler(call=>response(call,f.core));await f.api.save({sourceName:'Original',snapshot:f.core.manual({heart_rate:81},at)});f.handler(()=>({snapshot:f.core.manual({heart_rate:199},at),records:[],provenance:{heart_rate:{recordId:'not-valid',sourceName:'Bad',createdAt:at}}}));await f.api.refresh();assert.equal(f.api.current().readings.heart_rate.value,81);assert.equal(f.api.provenance().heart_rate.sourceName,'Original');assert.match(f.api.state().error,/Could not load/);
});

test('Wellbeing expires consistently after twelve hours, including a suspended-page timer',()=>{
  let time=now,expiredEvents=0,timerId=0;const timers=new Map();class DynamicClock extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const scope=events({Date:DynamicClock,Event,Intl,crypto:webcrypto,personalProfileId:'personal',document:{getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>({})},setTimeout:(callback,delay)=>{timers.set(++timerId,{callback,delay});return timerId;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},journalApi(){},loadJournal(){}});scope.window=scope;scope.missionProfileName={identity:{storageScope:'owner-a'}};scope.missionActivity={record(){}};scope.addEventListener('mission-wellbeing-change',()=>expiredEvents++);const setup=personalSource.slice(0,personalSource.indexOf('  const checkin=create('));vm.runInNewContext(setup+'window.test={choose,currentReport,selection,expireSelection};})();',scope);scope.test.choose(67);assert.equal(scope.test.currentReport().score,67);assert.equal(timers.size,1);time+=12*3600000;assert.equal(scope.test.currentReport(),null);assert.equal(scope.test.selection(),null);for(const {callback}of [...timers.values()])callback();assert.equal(scope.test.currentReport(),null);assert.equal(expiredEvents,2);
});


test('The mounted manual form saves entered values with an explicit source and does not fill blank fields',async()=>{
  const f=mounted();await flush();f.handler(call=>response(call,f.core));const form=f.panel.querySelector('form'),meta=form.querySelector('.readings-entry-meta'),inputs=form.querySelectorAll('input'),pulse=inputs.find(input=>input.dataset.readingField==='heart_rate');pulse.value='84';meta.children[0].children[0].value='<b>Reported instrument</b>';meta.children[1].children[0].value='2026-11-14T09:59';form.emit('submit');await flush();const sent=f.calls.find(call=>call.method==='POST');assert.equal(sent.body.snapshot.readings.heart_rate.value,84);assert.equal(sent.body.sourceName,'<b>Reported instrument</b>');assert.equal(sent.body.snapshot.readings.recovery,null);assert.equal(f.api.current().readings.heart_rate.value,84);assert.equal(f.panel.querySelector('.readings-status').textContent,'Saved readings loaded.');
});
test('File selection previews actual imported numbers and requires an explicit save action',async()=>{
  const f=mounted();await flush();f.handler(call=>response(call,f.core));const file=f.panel.querySelectorAll('input').find(item=>item.type==='file');file.files=[{name:'observation.csv',size:100,text:async()=> 'metric,value,unit,observedAt\nheart_rate,87,bpm,2026-11-14T09:59:00Z'}];file.emit('change');await flush();assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.match(f.panel.querySelector('.readings-import-preview').textContent,/Pulse: 87 bpm/);const save=f.panel.querySelectorAll('button').find(item=>item.textContent==='Save imported readings');assert.equal(save.disabled,false);save.emit('click');await flush();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.api.current().readings.heart_rate.value,87);
});
