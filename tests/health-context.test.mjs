import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url),homeSource=await readFile(new URL('public/home.js',root),'utf8'),uiSource=await readFile(new URL('public/health-context.js',root),'utf8'),coreSource=await readFile(new URL('public/health-rules-core.js',root),'utf8'),personalSource=await readFile(new URL('public/personal-space.js',root),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value)),now=Date.parse('2026-11-14T10:00:00Z'),importId='a7337ee1-9cf8-42cf-b0d5-75d90258835c';
const trendSource=await readFile(new URL('public/home-trends.js',root),'utf8');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.style={};this.events={};this.className='';this.parentElement=null;this.hidden=false;this.disabled=false;this.open=false;this._text='';this.htmlWrites=0;this.classList={add:(...values)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...values])].join(' ');},toggle:(value,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));if(on===undefined? !names.has(value):on)names.add(value);else names.delete(value);this.className=[...names].join(' ');}};}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  set innerHTML(value){this.htmlWrites++;this._html=value;this.children=[];if(value.includes('home-body-panel')){const panel=new Node('section'),header=new Node('header'),vitals=new Node('div'),checkin=new Node('section');panel.className='home-body-panel panel glass';vitals.className='home-vitals';checkin.className='home-checkin';panel.append(header,vitals);this.append(panel,checkin);}}
  get innerHTML(){return this._html||'';}
  append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
  remove(){if(this.parentElement){const siblings=this.parentElement.children,index=siblings.indexOf(this);if(index>=0)siblings.splice(index,1);this.parentElement=null;}}
  before(...nodes){const parent=this.parentElement;if(!parent)return;for(const node of nodes){node.remove();node.parentElement=parent;parent.children.splice(parent.children.indexOf(this),0,node);}}
  after(...nodes){const parent=this.parentElement;if(!parent)return;let index=parent.children.indexOf(this)+1;for(const node of nodes){node.remove();node.parentElement=parent;parent.children.splice(index++,0,node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  emit(type,event={}){for(const callback of this.events[type]||[])callback({type,target:this,...event});}
  matches(selector){if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));const metric=selector.match(/^\[data-home-metric=([^\]]+)\]$/);if(metric)return this.dataset.homeMetric===metric[1];return this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
  querySelector(selector){if(selector.startsWith(':scope > '))return this.children.find(node=>node.matches(selector.slice(9)))||null;const pieces=selector.split(' > ');if(pieces.length===2)return this.querySelector(pieces[0])?.children.find(node=>node.matches(pieces[1]))||null;return this.querySelectorAll(selector)[0]||null;}
}
function events(target={}){const handlers={};target.addEventListener=(type,callback)=>(handlers[type]||=[]).push(callback);target.dispatchEvent=event=>{for(const callback of handlers[event.type]||[])callback(event);};return target;}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function homeFixture(){
  const body=new Node('body'),main=new Node(),heading=new Node(),friend=new Node(),metrics=new Node(),button=new Node('button'),chat=new Node();main.append(heading,metrics,chat);body.append(main);let report=null,selected=null,watch=null,stored=null;
  const document={body,createElement:tag=>new Node(tag),querySelector:selector=>({'.mission-heading':heading,'.mission-rail>.profile':friend})[selector]||null,querySelectorAll:()=>[],getElementById:id=>({metrics,'mission-home-button':button,'nasagpt-sidebar':chat})[id]||null};
  const scope=events({document,Date:Clock,Intl,Event,console,state:{workspace:'crew',view:'health',visiting:false,crew:0},crew:[{name:'Another astronaut',metrics:{hr:199}}]});scope.window=scope;scope.missionCheckin={widget:()=>new Node(),current:()=>report,selection:()=>selected};scope.missionReadings={current:()=>stored,records:()=>[]};scope.missionActiwatch={current:()=>watch};scope.missionGauge={markup:({value})=>'<span>'+value+'</span>'};scope.missionChatComposer={stopWithin(){}};
  vm.runInNewContext(homeSource,scope);
  return {scope,document,home:main.children.find(node=>node.id==='mission-home'),api:scope.missionHome,report(value,at=now){report=value;selected=value?{...value,at}:null;},watch(value){watch=value;},readings(value){stored=clone(value);scope.dispatchEvent(new Event('mission-readings-change'));}};
}
function demoSnapshot(){const read=(value,unit)=>({value,unit,source:'demo',observedAt:null});return {profileId:'personal',capturedAt:new Clock().toISOString(),actiwatchImportId:null,readings:{heart_rate:read(72,'bpm'),spo2:read(98,'%'),body_temperature:null,bp_systolic:read(118,'mmHg'),bp_diastolic:read(76,'mmHg'),respiratory_rate:read(14,'/min'),fatigue_index:null,stress_index:null,skin_temperature:read(36.7,'C'),wellbeing:null,recovery:read(86,'/100'),sleep_hours:read(7+40/60,'h'),hrv:read(46,'ms'),steps:read(6240,'steps'),activity:read(66218,'counts'),light:read(187.3,'lx')}};}
function manualSnapshot(){const value=demoSnapshot();for(const reading of Object.values(value.readings).filter(Boolean)){reading.source='manual';reading.observedAt=new Clock().toISOString();}return value;}
function uiFixture(initialHandler=async()=>({item:null}),clock=Clock){
  const home=new Node('section'),checkin=new Node('section');checkin.className='home-checkin';home.append(checkin);let current=manualSnapshot(),handler=initialHandler;
  const calls=[],timers=new Map(),document=events({getElementById:id=>id==='mission-home'?home:null,createElement:tag=>new Node(tag)});let timerId=0;
  const scope=events({document,Date:clock,Intl,Event,AbortController,crypto:webcrypto,console,setTimeout(callback,delay){timers.set(++timerId,{callback,delay});return timerId;},clearTimeout:id=>timers.delete(id),journalApi:async(path,options={})=>{const call={path,...options,body:options.body?JSON.parse(options.body):undefined};calls.push(call);return handler(call);}});scope.window=scope;scope.missionHome={snapshot:()=>clone(current)};scope.missionProfileName={identity:{storageScope:'owner-a'},load:async()=>scope.missionProfileName.identity};
  vm.runInNewContext(coreSource,scope);vm.runInNewContext(uiSource,scope);
  const panel=home.querySelector('.health-analysis'),get=className=>panel.querySelector('.'+className);
  function analysis(payload,{agentAvailable=true,status='ATTENTION',summary='Review the synthetic observation.',alerts=['Synthetic flag'],pending=false}={}){const snapshot=scope.MissionHealthRules.normalize(payload.snapshot),rules=scope.MissionHealthRules.evaluate(snapshot);return {id:payload.id,snapshot,rules,result:{status,summary,alerts,agentAvailable,agentStatus:agentAvailable?status:null},createdAt:new Clock().toISOString(),pending};}
  return {scope,document,home,panel,get,calls,timers,api:scope.missionHealth,analysis,setSnapshot(value){current=clone(value);},handler(value){handler=value;},setOwner(value){scope.missionProfileName.identity=value?{storageScope:value}:null;scope.dispatchEvent(new Event('mission-profile-change'));}};
}

test('Missing personal values stay empty and actual snapshots never parse the DOM or crew examples',()=>{
  const f=homeFixture();assert.ok(Object.values(f.api.snapshot().readings).every(value=>value===null));assert.equal(f.home.querySelector('[data-home-metric=wellbeing]').dataset.source,'missing');
  const actual=manualSnapshot();for(const reading of Object.values(actual.readings).filter(Boolean)){reading.source='manual';reading.observedAt=new Clock(now-600000).toISOString();}f.readings(actual);f.scope.state.visiting=true;f.scope.state.crew=0;
  f.home.querySelector=()=>{throw new Error('Snapshot must not read the DOM');};f.document.querySelector=()=>{throw new Error('Snapshot must not read the DOM');};
  const snapshot=clone(f.api.snapshot());assert.equal(snapshot.profileId,'personal');assert.equal(snapshot.readings.heart_rate.value,72);assert.equal(snapshot.readings.bp_systolic.value,118);assert.equal(snapshot.readings.bp_diastolic.value,76);assert.equal(snapshot.readings.skin_temperature.value,36.7);assert.equal(snapshot.readings.body_temperature,null);assert.equal(snapshot.readings.fatigue_index,null);assert.equal(snapshot.readings.stress_index,null);assert.equal(snapshot.readings.wellbeing,null);
  for(const reading of Object.values(snapshot.readings).filter(Boolean)){assert.equal(reading.source,'manual');assert.equal(reading.observedAt,new Clock(now-600000).toISOString());}snapshot.readings.heart_rate.value=200;assert.equal(f.api.snapshot().readings.heart_rate.value,72);
});

test('Actual wellbeing retains its original timestamp and never substitutes the displayed demo score',()=>{
  const f=homeFixture();assert.equal(f.api.snapshot().readings.wellbeing,null);f.report({score:8,wellbeingScale:100},now-600000);
  assert.deepEqual(clone(f.api.snapshot().readings.wellbeing),{value:8,unit:'/100',source:'manual',observedAt:new Clock(now-600000).toISOString()});
  for(const [report,at]of [[{score:80,wellbeingScale:100},now-13*3600000],[{score:80,wellbeingScale:100},now+1000],[{score:8,wellbeingScale:10},now],[{score:NaN,wellbeingScale:100},now]]){f.report(report,at);assert.equal(f.api.snapshot().readings.wellbeing,null);}
});
test('Reading updates change card values without rerunning layout or moving the check-in',()=>{
  const f=homeFixture(),checkin=f.home.querySelector('.home-checkin'),parent=checkin.parentElement;
  f.document.querySelector=()=>{throw new Error('A value update must not rerun layout');};f.document.querySelectorAll=()=>{throw new Error('A value update must not rerun navigation');};
  f.report({score:77,wellbeingScale:100});f.scope.dispatchEvent(new Event('mission-wellbeing-change'));assert.equal(f.home.querySelector('[data-home-metric=wellbeing]').dataset.readingValue,'77');
  f.readings(manualSnapshot());f.scope.dispatchEvent(new Event('mission-actiwatch-change'));assert.equal(f.home.querySelector('.home-checkin'),checkin);assert.equal(checkin.parentElement,parent);
});
test('Numeric card text and data attributes reflect actual stored steps and movement',()=>{
  const f=homeFixture();assert.equal(f.home.querySelector('[data-home-metric=steps]').querySelector('strong').textContent,'-');const actual=manualSnapshot();for(const reading of Object.values(actual.readings).filter(Boolean)){reading.source='manual';reading.observedAt=new Clock().toISOString();}f.readings(actual);
  assert.equal(f.home.querySelector('[data-home-metric=steps]').querySelector('strong').textContent,'6240steps');assert.equal(f.home.querySelector('[data-home-metric=activity]').dataset.readingValue,'66218');assert.equal(f.api.snapshot().readings.steps.value,6240);
});

test('Card source labels cannot replace the unit inside a nested percentage gauge',()=>{
  const f=homeFixture(),card=f.home.querySelector('[data-home-metric=spo2]'),unit=new Node('small');unit.textContent='%';card.querySelector('strong').append(unit);f.api.setSource('spo2','Generated sample');assert.equal(unit.textContent,'%');assert.equal(card.querySelector(':scope > small').textContent,'Generated sample');f.api.setSource('spo2','Instrument','https://example.com/instrument');assert.equal(unit.textContent,'%');assert.equal(card.querySelector(':scope > small').children[0].textContent,'Instrument');
});

test('Only actual watch imports are displayed and their ID resolves authoritative analysis values',()=>{
  const f=homeFixture();f.watch({source:'demo',simulation:true,summary:{latest24h:{sleepSeconds:21600,activityCounts:12345,meanLightLux:44}}});let snapshot=f.api.snapshot();for(const key of ['sleep_hours','activity','light'])assert.equal(snapshot.readings[key],null);
  f.watch({id:importId,source:'actiwatch',summary:{end:new Clock(now-60000).toISOString(),latest24h:{sleepSeconds:28800,activityCounts:99999,meanLightLux:1000}}});snapshot=f.api.snapshot();assert.equal(snapshot.actiwatchImportId,importId);for(const key of ['sleep_hours','activity','light'])assert.equal(snapshot.readings[key],null);assert.equal(snapshot.readings.steps,null);const model=f.api.model();assert.equal(model.readings.sleep_hours.value,8);assert.equal(model.readings.activity.value,99999);assert.equal(model.readings.activity.source,'import');assert.equal(model.readings.activity.observedAt,new Clock(now-60000).toISOString());
});

test('Explicit sample generation fills every card with valid fictional values without changing saved readings',()=>{
  const f=homeFixture(),actual=manualSnapshot();f.readings(actual);f.report({score:83,wellbeingScale:100});f.watch({id:importId,source:'actiwatch',summary:{end:new Clock().toISOString(),latest24h:{sleepSeconds:28800,activityCounts:99999,meanLightLux:1000}}});
  const original=clone(f.api.snapshot());f.scope.journalApi=async path=>{assert.equal(path,'/api/preflight');return {saved:true};};vm.runInNewContext(coreSource,f.scope);
  for(const random of [0,.5,1]){
    f.scope.Math=Object.create(Math);f.scope.Math.random=()=>random;f.home.querySelector('.home-example-button').emit('click');const value=clone(f.api.snapshot()),normalized=f.scope.MissionHealthRules.normalize(value);
    assert.equal(Object.keys(normalized.readings).length,16);assert.equal(value.actiwatchImportId,null);assert.equal(f.api.sampleActive(),true);assert.equal(f.scope.MissionHealthRules.evaluate(value).isDemo,true);
    for(const reading of Object.values(value.readings)){assert.ok(Number.isFinite(reading.value));assert.equal(reading.source,'demo');assert.equal(reading.observedAt,null);}
    assert.ok(value.readings.bp_systolic.value>value.readings.bp_diastolic.value);assert.ok(value.readings.skin_temperature.value<value.readings.body_temperature.value);assert.ok(value.readings.spo2.value>=95);assert.ok(value.readings.sleep_hours.value<=9);
    assert.equal(f.home.querySelectorAll('.home-vital').filter(card=>card.dataset.source==='demo').length,15);assert.deepEqual(clone(f.scope.missionReadings.current()),actual);
  }
  const sample=clone(f.api.snapshot());sample.readings.heart_rate.value=999;assert.notEqual(f.api.snapshot().readings.heart_rate.value,999);f.home.querySelector('.home-sample-clear').emit('click');assert.equal(f.api.sampleActive(),false);assert.deepEqual(clone(f.api.snapshot()),original);assert.equal(f.home.querySelector('.home-sample-clear').hidden,true);
});

test('Cards, analysis snapshots and sample chart endpoints use one time-dependent model without changing its anchor',()=>{
  const f=homeFixture(),original=manualSnapshot(),trendScope={document:{getElementById:()=>null},Date:Clock};vm.runInNewContext(trendSource,trendScope);f.scope.MissionHomeTrendData=trendScope.MissionHomeTrendData;f.readings(original);f.home.querySelector('.home-example-button').emit('click');const base=clone(f.api.sampleBase()),at=now+37000;
  class LaterClock extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}}
  f.scope.Date=LaterClock;f.api.renderValues();const snapshot=clone(f.api.snapshot());assert.equal(snapshot.capturedAt,new LaterClock().toISOString());
  for(const [key,config]of Object.entries(trendScope.MissionHomeTrendData.metrics)){const value=snapshot.readings[config.reading].value;assert.equal(f.home.querySelector('[data-home-metric='+key+']').dataset.readingValue,String(value));for(const period of trendScope.MissionHomeTrendData.periods)assert.equal(trendScope.MissionHomeTrendData.sampleHistory(key,base,period,at).at(-1).value,value);}
  assert.deepEqual(clone(f.api.sampleBase()),base);f.api.sampleBase().readings.heart_rate.value=999;assert.deepEqual(clone(f.api.sampleBase()),base);assert.ok(Object.values(snapshot.readings).every(value=>value.source==='demo'&&value.observedAt===null));f.home.querySelector('.home-sample-clear').emit('click');assert.equal(f.api.sampleBase(),null);assert.deepEqual(clone(f.api.snapshot()).readings,original.readings);
});

test('Repeated generation changes the sample while unchanged polling and layout updates preserve it',()=>{
  const f=homeFixture(),actual=manualSnapshot();f.scope.missionProfileName={identity:{storageScope:'owner-a'}};f.readings(actual);f.scope.Math=Object.create(Math);f.scope.Math.random=()=>0;f.home.querySelector('.home-example-button').emit('click');const first=clone(f.api.snapshot());
  f.scope.Math.random=()=>1;f.home.querySelector('.home-example-button').emit('click');const second=clone(f.api.snapshot());assert.notDeepEqual(second.readings,first.readings);
  f.readings(actual);for(const type of ['mission-wellbeing-change','mission-actiwatch-change','mission-profile-change'])f.scope.dispatchEvent(new Event(type));assert.deepEqual(clone(f.api.snapshot()),second);assert.equal(f.api.sampleActive(),true);
  actual.readings.heart_rate.value=101;f.readings(actual);assert.equal(f.api.sampleActive(),false);assert.equal(f.api.snapshot().readings.heart_rate.value,101);
  f.home.querySelector('.home-example-button').emit('click');f.scope.missionProfileName.identity={storageScope:'owner-b'};assert.equal(f.api.sampleActive(),false);f.scope.dispatchEvent(new Event('mission-profile-change'));assert.equal(f.home.querySelector('.home-sample-clear').hidden,true);
});
test('An initial profile connection keeps an already generated sample without moving the check-in',()=>{
  const f=homeFixture(),checkin=f.home.querySelector('.home-checkin');f.home.querySelector('.home-example-button').emit('click');const original=clone(f.api.sampleBase());f.scope.missionProfileName={identity:{storageScope:'owner-a'}};f.scope.dispatchEvent(new Event('mission-profile-change'));assert.equal(f.api.sampleActive(),true);assert.deepEqual(clone(f.api.sampleBase()),original);assert.equal(f.home.querySelector('.home-checkin'),checkin);
});

test('A check-in preserves the generated layout and actual watch imports restore measured values',()=>{
  const f=homeFixture();f.home.querySelector('.home-example-button').emit('click');f.report({score:81,wellbeingScale:100});const before=clone(f.api.snapshot());f.scope.dispatchEvent(new Event('mission-wellbeing-change'));assert.equal(f.api.sampleActive(),true);assert.deepEqual(clone(f.api.snapshot()),before);f.home.querySelector('.home-sample-clear').emit('click');assert.equal(f.api.snapshot().readings.wellbeing.value,81);assert.equal(f.api.snapshot().readings.wellbeing.source,'manual');
  f.home.querySelector('.home-example-button').emit('click');f.watch({id:importId,source:'actiwatch',summary:{end:new Clock().toISOString(),latest24h:{sleepSeconds:28800,activityCounts:99999,meanLightLux:1000}}});f.scope.dispatchEvent(new Event('mission-actiwatch-change'));assert.equal(f.api.sampleActive(),false);assert.equal(f.api.snapshot().actiwatchImportId,importId);assert.equal(f.api.model().readings.activity.value,99999);
});

test('The initial UI shows provided readings and Incomplete, makes only a GET and never starts automatic AI analysis',async()=>{
  const f=uiFixture();await flush();assert.equal(f.get('health-analysis-status').textContent,'Incomplete');assert.equal(f.get('health-analysis-scope').textContent,'Provided readings');assert.match(f.get('health-analysis-summary').textContent,/Review available readings/);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,undefined);assert.equal(f.calls[0].path,'/api/health-analysis');assert.equal(f.api.snapshot().readings.body_temperature,null);
  for(const type of ['mission-wellbeing-change','mission-readings-change','mission-actiwatch-change'])f.scope.dispatchEvent(new Event(type));await flush();assert.equal(f.calls.length,1);assert.match(f.get('health-analysis-meta').textContent,/no AI request/);
});

test('Analyze uses one immutable snapshot and disables duplicate clicks while busy',async()=>{
  const f=uiFixture();await flush();let resolve;f.handler(()=>new Promise(done=>{resolve=done;}));const work=f.api.analyze();assert.equal(f.get('health-analysis-button').disabled,true);await f.api.analyze();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  const sent=f.calls.at(-1).body;assert.match(sent.id,/^[a-f0-9-]{36}$/);assert.equal(sent.snapshot.profileId,'personal');resolve(f.analysis(sent,{status:null}));await work;assert.equal(f.get('health-analysis-button').disabled,false);assert.equal(f.get('health-analysis-status').textContent,'Incomplete');assert.match(f.get('health-analysis-meta').textContent,/AI \+ rules/);
});

test('Network failure preserves the UUID and original readings for manual retry without fabricated AI output',async()=>{
  const f=uiFixture();await flush();f.handler(()=>{throw new Error('offline');});await f.api.analyze();const first=clone(f.calls.at(-1).body);assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');assert.match(f.get('health-analysis-notice').textContent,/Retry keeps the same readings/);assert.ok(!f.get('health-analysis-meta').textContent.includes('AI + rules'));
  const changed=manualSnapshot();changed.readings.heart_rate.value=140;f.setSnapshot(changed);f.scope.dispatchEvent(new Event('mission-wellbeing-change'));f.handler(call=>f.analysis(call.body,{status:'ATTENTION'}));await f.api.analyze();assert.deepEqual(f.calls.at(-1).body,first);assert.equal(f.calls.filter(call=>call.method==='POST').length,2);
});

test('A pending lease remains in progress until explicit retry, without an automatic second POST',async()=>{
  const f=uiFixture();await flush();f.handler(call=>f.analysis(call.body,{pending:true,agentAvailable:false,status:null}));await f.api.analyze();const first=clone(f.calls.at(-1).body);assert.equal(f.get('health-analysis-meta').textContent,'Analysis in progress');assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');await flush();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  f.handler(call=>f.analysis(call.body,{status:null}));await f.api.analyze();assert.deepEqual(f.calls.at(-1).body,first);assert.match(f.get('health-analysis-meta').textContent,/AI \+ rules/);
});
test('A stalled analysis times out, releases the button and preserves its retry payload',async()=>{
  const f=uiFixture();await flush();f.handler(call=>new Promise((_resolve,reject)=>call.signal.addEventListener('abort',()=>reject(new Error('timeout')))));const work=f.api.analyze(),first=clone(f.calls.at(-1).body),timer=[...f.timers.values()].find(value=>value.delay===75000);assert.ok(timer);timer.callback();await work;assert.equal(f.get('health-analysis-button').disabled,false);assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');assert.ok([...f.timers.values()].every(timer=>timer.delay!==75000));f.handler(call=>f.analysis(call.body,{status:null}));await f.api.analyze();assert.deepEqual(f.calls.at(-1).body,first);
});

test('An unavailable agent shows deterministic rules and preserves the saved snapshot for retry',async()=>{
  const f=uiFixture();await flush();const value=manualSnapshot();value.readings.heart_rate.value=140;f.setSnapshot(value);f.handler(call=>{const item=f.analysis(call.body,{agentAvailable:false,status:'NORMAL',summary:'Rules are available; the AI service is unavailable.'});item.rules.status='CRITICAL';return item;});await f.api.analyze();assert.equal(f.get('health-analysis-status').textContent,'CRITICAL');assert.match(f.get('health-analysis-meta').textContent,/Rules only \/ AI unavailable/);assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');assert.ok(!f.get('health-analysis-meta').textContent.includes('AI + rules'));
});
test('Quota and concurrency refusals explain the actual cause and retry the original snapshot',async()=>{
  for(const [code,text]of [['ai_daily_limit','Daily AI request limit reached'],['ai_concurrency_limit','processing another request']]){
    const f=uiFixture();await flush();f.handler(call=>{const item=f.analysis(call.body,{agentAvailable:false});item.result.agentError=code;return item;});await f.api.analyze();const sent=clone(f.calls.at(-1).body);assert.ok(f.get('health-analysis-notice').textContent.includes(text));assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');f.handler(call=>f.analysis(call.body));await f.api.analyze();assert.deepEqual(f.calls.at(-1).body,sent);assert.ok(!f.get('health-analysis-notice').textContent.includes(text));
  }
});

test('Incomplete core measurements cannot display NORMAL even if an upstream result claims it',async()=>{
  const f=uiFixture();await flush();f.handler(call=>f.analysis(call.body,{status:'NORMAL'}));await f.api.analyze();assert.equal(f.get('health-analysis-status').textContent,'Incomplete');
});

test('Older account GET responses cannot replace the new account result',async()=>{
  let resolveOld,resolveNew;const f=uiFixture(()=>new Promise(done=>{resolveOld=done;}));f.handler(()=>new Promise(done=>{resolveNew=done;}));f.setOwner('owner-b');
  const payload={id:importId,snapshot:manualSnapshot()};resolveNew({item:f.analysis(payload,{summary:'New account analysis',status:null})});await flush();resolveOld({item:f.analysis(payload,{summary:'Old account private analysis',status:null})});await flush();assert.equal(f.get('health-analysis-summary').textContent,'New account analysis');assert.ok(!f.panel.textContent.includes('Old account private analysis'));
});

test('Switching accounts discards an old pending result and clears its retry state',async()=>{
  const f=uiFixture();await flush();let resolve;f.handler(()=>new Promise(done=>{resolve=done;}));const work=f.api.analyze(),old=f.calls.at(-1).body;
  f.handler(async()=>({item:null}));f.setOwner('owner-b');await flush();resolve(f.analysis(old,{summary:'Old account private result',status:'CRITICAL'}));await work;assert.ok(!f.panel.textContent.includes('Old account private result'));assert.equal(f.get('health-analysis-button').textContent,'Analyze');assert.equal(f.get('health-analysis-button').disabled,false);
  f.setOwner(null);assert.equal(f.get('health-analysis-button').disabled,true);assert.match(f.get('health-analysis-notice').textContent,/Sign in/);
});

test('A failed saved-result request shows only local rules and no invented AI assessment',async()=>{
  const f=uiFixture(()=>{throw new Error('offline');});await flush();assert.equal(f.get('health-analysis-status').textContent,'Incomplete');assert.match(f.get('health-analysis-notice').textContent,/could not be loaded/);assert.match(f.get('health-analysis-meta').textContent,/no AI request/);assert.equal(f.get('health-analysis-button').textContent,'Analyze');
});

test('Full summaries and alerts remain safely accessible inside a collapsed details block',async()=>{
  const f=uiFixture();await flush();const text='<img src=x onerror=alert(1)> '+('Long explanation. '.repeat(80)),alerts=Array.from({length:16},(_,i)=>'Flag '+i);
  f.handler(call=>f.analysis(call.body,{summary:text,alerts,status:null}));await f.api.analyze();const details=f.get('health-analysis-disclosure');assert.equal(details.open,false);assert.equal(details.querySelector('summary').textContent,'Analysis details');assert.equal(f.get('health-analysis-full-summary').textContent,text);assert.equal(f.get('health-analysis-alerts').children.length,16);assert.equal(f.get('health-analysis-alerts').parentElement,details);assert.equal(f.get('health-analysis-details').parentElement,details);assert.equal(f.panel.querySelectorAll('img').length,0);assert.equal(f.get('health-analysis-full-summary').htmlWrites,0);
  const css=await readFile(new URL('public/health-context.css',root),'utf8');assert.match(css,/-webkit-line-clamp:3/);assert.match(css,/font:600 14px/);assert.match(css,/flex-wrap:wrap/);assert.match(css,/var\(--field/);assert.match(css,/data-theme=light/);
});

test('Canonical imported readings do not falsely mark the same import as changed',async()=>{
  const f=uiFixture();await flush();const current=manualSnapshot();current.actiwatchImportId=importId;for(const key of ['sleep_hours','activity','light'])current.readings[key]=null;f.setSnapshot(current);
  const canonical=clone(current);canonical.readings.sleep_hours={value:8,unit:'h',source:'import',observedAt:new Clock(now-3600000).toISOString()};canonical.readings.activity={value:12345,unit:'counts',source:'import',observedAt:new Clock(now-3600000).toISOString()};canonical.readings.light={value:150,unit:'lx',source:'import',observedAt:new Clock(now-3600000).toISOString()};
  f.handler(()=>({item:f.analysis({id:importId,snapshot:canonical},{agentAvailable:false,status:null})}));await f.api.refresh();assert.equal(f.get('health-analysis-new').hidden,true);assert.ok(!f.get('health-analysis-notice').textContent.includes('Readings changed'));assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');
});

test('A saved pending lease can be retried after loading without creating a new ID',async()=>{
  const f=uiFixture();await flush();const payload={id:importId,snapshot:manualSnapshot()};f.handler(()=>({item:f.analysis(payload,{pending:true,agentAvailable:false,status:null})}));await f.api.refresh();assert.equal(f.get('health-analysis-meta').textContent,'Analysis in progress');assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');
  f.handler(call=>f.analysis(call.body,{status:null}));await f.api.analyze();assert.equal(f.calls.at(-1).body.id,importId);
});

function chatFixture(initialOwner='owner-a'){
  const calls=[];let current=demoSnapshot(),handler=call=>call.body?({message:{id:call.body.id,content:call.body.content,attachments:[],createdAt:new Clock().toISOString()},reply:null}):({messages:[],hasMore:false,cursor:null});
  const storage=new Map(),scope=events({document:{getElementById:()=>null,createElement:tag=>new Node(tag),querySelectorAll:()=>[]},Date:Clock,Intl,Event,crypto:webcrypto,personalProfileId:'personal',localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},loadJournal(){},journalApi:async(path,options={})=>{const call={path,method:options.method||'GET',body:options.body?JSON.parse(options.body):undefined};calls.push(call);return handler(call);}});scope.window=scope;scope.missionProfileName={identity:initialOwner?{storageScope:initialOwner}:null};scope.missionChatComposer={refresh(){},contextChanged(){}};scope.missionHealth={snapshot:()=>clone(current)};scope.missionActivity={record(){},refresh(){}};
  const setup=personalSource.slice(0,personalSource.indexOf('  const checkin=create('));vm.runInNewContext(setup+'window.test={store,send,retryChat,clearChat,choose,currentReport,selection,prepare,profileChanged,load,favorites,favoriteItems:()=>favoriteItems,addView:value=>views.push(value)};})();',scope);
  return {scope,storage,api:scope.test,calls,addView(kind='chat'){const view={kind,host:new Node(),list:new Node(),form:new Node(),input:new Node('textarea'),send:new Node('button'),status:new Node('p'),more:new Node('button'),refresh:new Node('button')};scope.test.addView(view);return view;},setOwner(value){scope.missionProfileName.identity=value?{storageScope:value}:null;scope.test.profileChanged();},setSnapshot:value=>{current=clone(value);},handler:value=>{handler=value;}};
}

test('Chat captures its snapshot and attachments once and retains both after a network failure',async()=>{
  const f=chatFixture(),draft=f.api.store('chat');draft.draft='Analyze these readings';draft.files=[{id:importId}];f.handler(()=>{throw new Error('offline');});await f.api.send('chat');const first=clone(f.calls[0].body);assert.equal(first.healthSnapshot.profileId,'personal');assert.deepEqual(first.attachments,[importId]);
  const changed=demoSnapshot();changed.readings.heart_rate.value=140;f.setSnapshot(changed);draft.files=[];f.handler(call=>({message:{id:call.body.id,content:call.body.content},reply:null}));await f.api.send('chat');assert.deepEqual(f.calls[1].body,first);assert.equal(draft.pending,null);
});
test('Clearing chat discards only its messages and draft, preserving the other conversation caches',async()=>{
  const f=chatFixture(),chat=f.api.store('chat'),team=f.api.store('team'),diary=f.api.store('diary');chat.messages=[{id:importId,content:'Old private message'}];chat.draft='Old draft';chat.files=[{id:importId}];team.draft='Crew draft';diary.draft='Diary draft';
  f.handler(call=>call.method==='DELETE'?{cleared:true,generation:1}:{messages:[],generation:1,hasMore:false});await f.api.clearChat();
  assert.deepEqual(clone(chat.messages),[]);assert.equal(chat.draft,'');assert.deepEqual(clone(chat.files),[]);assert.equal(chat.generation,1);assert.equal(team.draft,'Crew draft');assert.equal(diary.draft,'Diary draft');assert.equal(f.calls[0].method,'DELETE');
});
test('A slow send completion and a slow history load cannot restore a cleared client chat',async()=>{
  const f=chatFixture(),chat=f.api.store('chat');let finish;f.handler(call=>call.method==='DELETE'?{cleared:true,generation:1}:new Promise(resolve=>{finish=resolve;}));chat.draft='A delayed question';const sending=f.api.send('chat');await f.api.clearChat();finish({message:{id:importId,content:'Old delayed response'},reply:null});await sending;assert.equal(chat.messages.length,0);assert.equal(chat.draft,'');
  const loading=f.api.load('chat');await f.api.clearChat();finish({messages:[{id:importId,content:'Old history'}],generation:1,hasMore:false});await loading;assert.equal(chat.messages.length,0);
});
test('Failed clearing preserves all visible chat data and leaves retry available',async()=>{
  const f=chatFixture(),chat=f.api.store('chat');chat.messages=[{id:importId,content:'Keep this'}];chat.draft='Keep draft';f.handler(()=>{throw Error('offline');});await f.api.clearChat();assert.equal(chat.messages[0].content,'Keep this');assert.equal(chat.draft,'Keep draft');assert.equal(chat.clearing,false);assert.match(chat.notice,/Could not clear/);
});

test('Crew chat and diary saves do not attach the personal dashboard, saved-message retry leaves its server snapshot intact',async()=>{
  for(const kind of ['team','diary']){const f=chatFixture();f.api.store(kind).draft='A message';await f.api.send(kind);assert.equal(Object.hasOwn(f.calls[0].body,'healthSnapshot'),false);}
  const f=chatFixture();await f.api.retryChat({id:importId,content:'Previously saved request',attachments:[],wellbeing:{score:80,wellbeingScale:100}});assert.equal(Object.hasOwn(f.calls[0].body,'healthSnapshot'),false);
});


test('A newer saved wellbeing reading wins over an older slider report and a later selection replaces it',()=>{
  const f=homeFixture(),value=demoSnapshot();for(const key of Object.keys(value.readings))value.readings[key]=null;value.readings.wellbeing={value:93,unit:'/100',source:'manual',observedAt:new Clock(now-30000).toISOString()};f.readings(value);f.report({score:60,wellbeingScale:100},now-60000);assert.equal(f.api.model().readings.wellbeing.value,93);assert.equal(f.api.snapshot().readings.wellbeing.value,93);f.report({score:77,wellbeingScale:100},now);assert.equal(f.api.model().readings.wellbeing.value,77);assert.equal(f.api.model().readings.wellbeing.observedAt,new Clock().toISOString());
});
test('A diastolic-only record keeps its actual source time and unit without inventing systolic pressure',()=>{
  const f=homeFixture(),value=demoSnapshot();for(const key of Object.keys(value.readings))value.readings[key]=null;value.readings.bp_diastolic={value:76,unit:'mmHg',source:'manual',observedAt:new Clock(now-60000).toISOString()};f.scope.missionReadings.provenance=()=>({bp_diastolic:{sourceName:'Diastolic source'}});f.readings(value);const card=f.home.querySelector('[data-home-metric=pressure]');assert.equal(card.querySelector('strong').textContent,'-/76mmHg');assert.match(card.querySelector('small').textContent,/Diastolic source/);assert.equal(card.dataset.source,'manual');assert.equal(card.dataset.observedAt,value.readings.bp_diastolic.observedAt);assert.equal(f.api.snapshot().readings.bp_systolic,null);
});


test('A saved NORMAL analysis expires at the actual observation deadline without another AI call',async()=>{
  let time=now;class DynamicClock extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const f=uiFixture(undefined,DynamicClock);await flush();const snapshot={profileId:'personal',capturedAt:new Clock().toISOString(),actiwatchImportId:null,readings:{heart_rate:{value:72,unit:'bpm',source:'manual',observedAt:new Clock().toISOString()},spo2:{value:98,unit:'%',source:'manual',observedAt:new Clock().toISOString()},body_temperature:{value:36.8,unit:'C',source:'manual',observedAt:new Clock().toISOString()}}};f.setSnapshot(snapshot);f.handler(call=>f.analysis(call.body,{status:'NORMAL',summary:'Original saved assessment'}));await f.api.analyze();assert.equal(f.get('health-analysis-status').textContent,'NORMAL');const calls=f.calls.length,timer=[...f.timers.values()].find(value=>value.delay===900001);assert.ok(timer);time=now+900001;timer.callback();assert.equal(f.get('health-analysis-status').textContent,'Incomplete');assert.match(f.get('health-analysis-notice').textContent,/observations have expired/);assert.match(f.get('health-analysis-summary').textContent,/Saved analysis: Original saved assessment/);assert.match(f.get('health-analysis-meta').textContent,/Saved analysis \/ current rules only/);assert.equal(f.calls.length,calls);
});
test('Returning to a visible page recomputes stale local rules after suspended timers',async()=>{
  let time=now;class DynamicClock extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const f=uiFixture(undefined,DynamicClock);await flush();const snapshot={profileId:'personal',capturedAt:new Clock().toISOString(),readings:{heart_rate:{value:72,unit:'bpm',source:'manual',observedAt:new Clock().toISOString()},spo2:{value:98,unit:'%',source:'manual',observedAt:new Clock().toISOString()},body_temperature:{value:36.8,unit:'C',source:'manual',observedAt:new Clock().toISOString()}}};f.setSnapshot(snapshot);f.scope.dispatchEvent(new Event('mission-readings-change'));assert.equal(f.get('health-analysis-status').textContent,'NORMAL');f.scope.dispatchEvent(new Event('pagehide'));assert.equal(f.timers.size,0);time=now+901000;f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.get('health-analysis-status').textContent,'Incomplete');assert.doesNotMatch(f.get('health-analysis-details').textContent,/Older readings|Missing:/);assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});
test('Changing owners clears score, pending chat and drafts before the new owner sends anything',async()=>{
  const f=chatFixture();f.api.choose(67);const old=f.api.store('chat');old.draft='Private owner A text';old.files=[{id:importId}];old.pending={id:importId,content:old.draft,wellbeing:{score:67,wellbeingScale:100}};f.scope.missionProfileName.identity={storageScope:'owner-b'};assert.equal(f.api.currentReport(),null);await f.api.send('chat');assert.equal(f.calls.length,0);f.api.profileChanged();const next=f.api.store('chat');assert.notEqual(next,old);assert.equal(next.draft,'');assert.equal(next.pending,null);assert.deepEqual(clone(next.files),[]);assert.equal(f.api.currentReport(),null);f.api.choose(22);next.draft='Owner B text';await f.api.send('chat');assert.deepEqual(clone(f.calls.at(-1).body.wellbeing),{score:22,wellbeingScale:100});assert.notEqual(f.calls.at(-1).body.id,importId);assert.equal(f.storage.has('mission-checkin:owner-a:personal'),true);assert.equal(f.storage.has('mission-checkin:owner-b:personal'),true);f.setOwner('owner-a');assert.deepEqual(clone(f.api.currentReport()),{score:67,wellbeingScale:100});
});
test('An old owner send cannot restore messages or reset the new owner draft after rebinding',async()=>{
  const f=chatFixture();f.api.choose(67);f.api.store('chat').draft='Owner A private request';let finish;f.handler(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.api.send('chat'),oldCall=f.calls.at(-1);f.setOwner('owner-b');f.api.store('chat').draft='New owner unsent text';finish({message:{id:oldCall.body.id,content:'Owner A private response'},reply:null});await pending;assert.equal(f.api.store('chat').messages.length,0);assert.equal(f.api.store('chat').draft,'New owner unsent text');assert.equal(f.api.currentReport(),null);
});
test('Old history and favorites responses are discarded after an owner switch',async()=>{
  const f=chatFixture();let finishHistory,finishFavorites;f.handler(call=>new Promise(resolve=>{if(call.path==='/api/chat')finishHistory=resolve;else finishFavorites=resolve;}));const history=f.api.load('chat'),favorites=f.api.favorites();f.setOwner('owner-b');finishHistory({messages:[{id:importId,content:'Private old owner history'}],hasMore:false,cursor:null});finishFavorites({items:[{id:importId,content:'Private old favorite'}],hasMore:false,cursor:null});await Promise.all([history,favorites]);assert.equal(f.api.store('chat').messages.length,0);assert.equal(f.api.favoriteItems().length,0);
});
test('A late identity response cannot rebind a newly selected account or migrate its old score',async()=>{
  const f=chatFixture();f.api.choose(67);let finish;f.scope.missionProfileName.identity=null;f.scope.missionProfileName.load=()=>new Promise(resolve=>{finish=resolve;});const loading=f.api.prepare();await flush();f.setOwner('owner-b');finish({storageScope:'owner-a'});await loading;assert.equal(f.api.currentReport(),null);f.api.choose(25);assert.deepEqual(clone(f.api.currentReport()),{score:25,wellbeingScale:100});assert.equal(JSON.parse(f.storage.get('mission-checkin:owner-a:personal')).score,67);assert.equal(JSON.parse(f.storage.get('mission-checkin:owner-b:personal')).score,25);
});


test('Expired saved results cannot hide newer current critical readings',async()=>{
  let time=now;class DynamicClock extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const f=uiFixture(undefined,DynamicClock);await flush();const snapshot={profileId:'personal',capturedAt:new Clock().toISOString(),actiwatchImportId:null,readings:{heart_rate:{value:72,unit:'bpm',source:'manual',observedAt:new Clock().toISOString()},spo2:{value:98,unit:'%',source:'manual',observedAt:new Clock().toISOString()},body_temperature:{value:36.8,unit:'C',source:'manual',observedAt:new Clock().toISOString()}}};f.setSnapshot(snapshot);f.handler(call=>f.analysis(call.body,{status:'NORMAL',summary:'Original historical assessment'}));await f.api.analyze();time=now+901000;const current=clone(snapshot);current.capturedAt=new DynamicClock().toISOString();current.readings.heart_rate={value:140,unit:'bpm',source:'manual',observedAt:new DynamicClock().toISOString()};f.setSnapshot(current);f.scope.dispatchEvent(new Event('mission-readings-change'));assert.equal(f.get('health-analysis-status').textContent,'CRITICAL');assert.match(f.get('health-analysis-summary').textContent,/Saved analysis/);assert.match(f.get('health-analysis-details').textContent,/Rule flags: Pulse/);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});
test('Legacy example analyses stay in history and cannot become the current personal result or retry payload',async()=>{
  const f=uiFixture();await flush();const historical=f.analysis({id:importId,snapshot:demoSnapshot()},{agentAvailable:false,status:'ATTENTION',summary:'Old example assessment'});f.handler(()=>({item:historical}));await f.api.refresh();assert.equal(f.get('health-analysis-scope').textContent,'Provided readings');assert.equal(f.get('health-analysis-button').textContent,'Analyze');assert.equal(f.get('health-analysis-new').hidden,true);assert.ok(!f.panel.textContent.includes('Old example assessment'));f.handler(call=>f.analysis(call.body,{agentAvailable:false,status:null}));await f.api.analyze();const sent=f.calls.at(-1).body;assert.notEqual(sent.id,importId);assert.ok(Object.values(sent.snapshot.readings).filter(Boolean).every(reading=>reading.source==='manual'));
});

test('An explicitly generated sample can be analyzed with its fictional provenance intact',async()=>{
  const home=homeFixture();home.home.querySelector('.home-example-button').emit('click');const f=uiFixture();await flush();f.scope.missionHome.sampleActive=()=>true;f.setSnapshot(home.api.snapshot());f.scope.dispatchEvent(new Event('mission-sample-change'));assert.equal(f.get('health-analysis-scope').textContent,'Example');assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
  f.handler(call=>f.analysis(call.body,{status:'NORMAL',summary:'Generated sample result'}));await f.api.analyze();const sent=f.calls.at(-1).body;assert.equal(Object.keys(sent.snapshot.readings).length,16);assert.ok(Object.values(sent.snapshot.readings).every(reading=>reading.source==='demo'&&reading.observedAt===null));assert.equal(f.get('health-analysis-summary').textContent,'Generated sample result');assert.equal(f.get('health-analysis-scope').textContent,'Example');assert.equal(f.get('health-analysis-button').textContent,'Analyze');assert.match(f.get('health-analysis-meta').textContent,/AI \+ rules/);
});

test('Unrequested legacy samples cannot be analyzed or loaded over an active generated sample',async()=>{
  const f=uiFixture();await flush();f.setSnapshot(demoSnapshot());await f.api.analyze();assert.equal(f.calls.filter(call=>call.method==='POST').length,0);assert.match(f.get('health-analysis-notice').textContent,/Could not prepare/);
  f.scope.missionHome.sampleActive=()=>true;f.scope.dispatchEvent(new Event('mission-sample-change'));const legacy=f.analysis({id:importId,snapshot:demoSnapshot()},{summary:'Unrelated legacy result'});f.handler(()=>({item:legacy}));await f.api.refresh();assert.ok(!f.panel.textContent.includes('Unrelated legacy result'));assert.equal(f.get('health-analysis-button').textContent,'Analyze');
});

test('Clearing or replacing a sample discards its pending analysis and cannot resurrect it on completion',async()=>{
  for(const replacement of [manualSnapshot(),demoSnapshot()]){
    const f=uiFixture();await flush();f.scope.missionHome.sampleActive=()=>true;f.setSnapshot(demoSnapshot());f.scope.dispatchEvent(new Event('mission-sample-change'));let finish;f.handler(()=>new Promise(resolve=>{finish=resolve;}));const work=f.api.analyze(),old=f.calls.at(-1);f.setSnapshot(replacement);f.scope.missionHome.sampleActive=()=>replacement.readings.heart_rate.source==='demo';f.scope.dispatchEvent(new Event('mission-sample-change'));assert.equal(old.signal.aborted,true);assert.equal(f.get('health-analysis-button').disabled,false);assert.equal(f.get('health-analysis-button').textContent,'Analyze');finish(f.analysis(old.body,{summary:'Discarded sample result'}));await work;assert.ok(!f.panel.textContent.includes('Discarded sample result'));assert.equal(f.get('health-analysis-new').hidden,true);
  }
});


test('Send while unbound gives visible connection feedback and keeps the draft without any request',async()=>{
  const f=chatFixture(null),view=f.addView(),draft=f.api.store('chat');draft.draft='hi';view.input.value='hi';await f.api.send('chat');assert.equal(f.calls.length,0);assert.equal(draft.draft,'hi');assert.equal(draft.pending,null);assert.equal(draft.busy,false);assert.equal(view.input.value,'hi');assert.equal(view.input.disabled,false);assert.match(view.status.textContent,/Connection unavailable/);assert.match(view.status.textContent,/Retry beside your name/);assert.match(view.status.textContent,/not sent/);assert.equal(f.storage.size,0);
});
test('First confirmed identity restores only unsent text and requires another explicit Send',async()=>{
  const f=chatFixture(null),view=f.addView(),initial=f.api.store('chat');initial.draft='hi from the offline draft';initial.files=[{id:importId}];initial.pending={id:importId,content:initial.draft};initial.messages=[{id:importId,role:'assistant',createdAt:new Clock().toISOString(),content:'Unbound history must not migrate'}];await f.api.send('chat');assert.equal(f.calls.length,0);f.setOwner('owner-a');await flush();const recovered=f.api.store('chat');assert.notEqual(recovered,initial);assert.equal(recovered.draft,'hi from the offline draft');assert.deepEqual(clone(recovered.files),[]);assert.equal(recovered.pending,null);assert.deepEqual(clone(recovered.messages),[]);assert.equal(recovered.recoveredDraft,true);assert.equal(view.input.value,recovered.draft);assert.match(view.status.textContent,/draft was not sent/);assert.equal(f.calls.filter(call=>call.body).length,0);await f.api.send('chat');const writes=f.calls.filter(call=>call.body);assert.equal(writes.length,1);assert.equal(writes[0].body.content,'hi from the offline draft');assert.notEqual(writes[0].body.id,importId);assert.deepEqual(writes[0].body.attachments,[]);assert.equal(recovered.draft,'');assert.equal(recovered.recoveredDraft,false);
});
test('Real owner switches clear drafts even after an intermediate unbound state',async()=>{
  const f=chatFixture(),view=f.addView();f.api.store('chat').draft='Private owner A draft';f.setOwner(null);f.api.store('chat').draft='Unbound text after leaving owner A';view.input.value='Unbound text after leaving owner A';await f.api.send('chat');assert.match(view.status.textContent,/Connection unavailable/);f.setOwner('owner-b');await flush();assert.equal(f.api.store('chat').draft,'');assert.equal(f.api.store('chat').pending,null);assert.equal(view.input.value,'');assert.equal(f.api.store('chat').recoveredDraft,false);assert.equal(f.calls.filter(call=>call.body).length,0);
});
test('An identity mismatch cannot send or copy the previous owner draft while awaiting rebinding',async()=>{
  const f=chatFixture(),view=f.addView(),old=f.api.store('chat');old.draft='Owner A private draft';f.scope.missionProfileName.identity={storageScope:'owner-b'};const next=f.api.store('chat');next.draft='New owner unconfirmed draft';await f.api.send('chat');assert.equal(f.calls.length,0);assert.equal(old.draft,'Owner A private draft');assert.equal(next.draft,'New owner unconfirmed draft');assert.match(view.status.textContent,/Connection unavailable/);f.api.profileChanged();await flush();assert.equal(f.api.store('chat').draft,'');assert.equal(view.input.value,'');
});
test('Retrying an old chat answer without identity gives connection feedback instead of silently returning',async()=>{
  const f=chatFixture(null),view=f.addView();await f.api.retryChat({id:importId,content:'Saved request'});assert.equal(f.calls.length,0);assert.match(view.status.textContent,/Connection unavailable/);assert.match(view.status.textContent,/Retry beside your name/);
});

test('A personal check-in leaves every unchanged sensor card and its content attached',()=>{
  const f=homeFixture();f.readings(manualSnapshot());const sensor=f.home.querySelector('[data-home-metric=hr]'),number=sensor.querySelector('strong'),unit=number.children[0];
  f.report({score:77,wellbeingScale:100});f.scope.dispatchEvent(new Event('mission-wellbeing-change'));assert.equal(sensor.querySelector('strong'),number);assert.equal(number.children[0],unit);
});
test('Load readings refreshes real stores without generating replacement values',async()=>{
  const f=homeFixture(),original=manualSnapshot();f.readings(original);const calls=[];f.scope.missionReadings.refresh=async()=>calls.push('readings');f.scope.missionActiwatch.refresh=async()=>calls.push('watch');
  f.home.querySelector('.home-sample-button').emit('click');await flush();assert.deepEqual(calls,['readings','watch']);assert.equal(f.api.sampleActive(),false);assert.deepEqual(clone(f.api.snapshot()).readings,original.readings);assert.equal(f.home.querySelector('.home-sample-button').disabled,false);
});

test('MARS is mounted below readings and excludes late media from a previous owner',async()=>{
  const f=homeFixture(),footer=new Node(),originalQuery=f.document.querySelector,originalId=f.document.getElementById,pending=[];f.document.getElementById=id=>id==='mission-home'?f.home:originalId(id);f.document.querySelector=selector=>selector==='.site-footer'?footer:originalQuery(selector);
  f.scope.missionProfileName={identity:{storageScope:'owner-a'}};f.scope.AbortSignal=AbortSignal;f.scope.journalApi=()=>new Promise(resolve=>pending.push(resolve));f.readings(manualSnapshot());
  vm.runInNewContext(await readFile(new URL('public/mars-core.js',root),'utf8'),f.scope);vm.runInNewContext(await readFile(new URL('public/mars.js',root),'utf8'),f.scope);
  assert.equal(f.home.querySelector('.mars-definition-link').href,'#mars-definition');assert.ok(f.home.querySelector('.mars-individual').textContent.startsWith('Individual Score: '));assert.ok(f.scope.missionMARS.current().coverage>0);
  f.scope.missionProfileName.identity.storageScope='owner-b';f.scope.dispatchEvent(new Event('mission-profile-change'));pending[0]({items:[{kind:'audio',createdAt:new Clock().toISOString(),features:{acoustic:{seconds:5,level:-24,quiet:.2,clipping:0}}}]});await flush();assert.equal(f.scope.missionMARS.current().mediaCount,0);pending[1]({items:[]});await flush();assert.equal(f.scope.missionMARS.current().mediaCount,0);
  const report=f.home.querySelector('.mars-report');report.open=true;report.emit('toggle');assert.equal(report.querySelector('.mars-groups').children.length,5);assert.ok(footer.children.some(node=>node.id==='mars-definition'));
});
