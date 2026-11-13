import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url),homeSource=await readFile(new URL('public/home.js',root),'utf8'),uiSource=await readFile(new URL('public/health-context.js',root),'utf8'),coreSource=await readFile(new URL('public/health-rules-core.js',root),'utf8'),personalSource=await readFile(new URL('public/personal-space.js',root),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value)),now=Date.parse('2026-11-14T10:00:00Z'),importId='a7337ee1-9cf8-42cf-b0d5-75d90258835c';
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.className='';this.parentElement=null;this.hidden=false;this.disabled=false;this.open=false;this._text='';this.htmlWrites=0;this.classList={add:(...values)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...values])].join(' ');},toggle:(value,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));if(on===undefined? !names.has(value):on)names.add(value);else names.delete(value);this.className=[...names].join(' ');}};}
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
  const body=new Node('body'),main=new Node(),heading=new Node(),friend=new Node(),metrics=new Node(),button=new Node('button'),chat=new Node();main.append(heading,metrics,chat);body.append(main);let report=null,selected=null,watch=null;
  const document={body,createElement:tag=>new Node(tag),querySelector:selector=>({'.mission-heading':heading,'.mission-rail>.profile':friend})[selector]||null,querySelectorAll:()=>[],getElementById:id=>({metrics,'mission-home-button':button,'nasagpt-sidebar':chat})[id]||null};
  const scope=events({document,Date:Clock,Intl,Event,console,state:{workspace:'crew',view:'health',visiting:false,crew:0},crew:[{name:'Another astronaut',metrics:{hr:199}}]});scope.window=scope;scope.missionCheckin={widget:()=>new Node(),current:()=>report,selection:()=>selected};scope.missionActiwatch={current:()=>watch};scope.missionGauge={markup:({value})=>'<span>'+value+'</span>'};scope.missionChatComposer={stopWithin(){}};
  vm.runInNewContext(homeSource,scope);
  return {scope,document,home:main.children.find(node=>node.id==='mission-home'),api:scope.missionHome,report(value,at=now){report=value;selected=value?{...value,at}:null;},watch(value){watch=value;}};
}
function demoSnapshot(){const read=(value,unit)=>({value,unit,source:'demo',observedAt:null});return {profileId:'personal',capturedAt:new Clock().toISOString(),actiwatchImportId:null,readings:{heart_rate:read(72,'bpm'),spo2:read(98,'%'),body_temperature:null,bp_systolic:read(118,'mmHg'),bp_diastolic:read(76,'mmHg'),respiratory_rate:read(14,'/min'),fatigue_index:null,stress_index:null,skin_temperature:read(36.7,'C'),wellbeing:null,recovery:read(86,'/100'),sleep_hours:read(7+40/60,'h'),hrv:read(46,'ms'),steps:read(6240,'steps'),activity:read(66218,'counts'),light:read(187.3,'lx')}};}
function uiFixture(initialHandler=async()=>({item:null})){
  const home=new Node('section'),checkin=new Node('section');checkin.className='home-checkin';home.append(checkin);let current=demoSnapshot(),handler=initialHandler;
  const calls=[],timers=new Map(),document={getElementById:id=>id==='mission-home'?home:null,createElement:tag=>new Node(tag)};let timerId=0;
  const scope=events({document,Date:Clock,Intl,Event,AbortController,crypto:webcrypto,console,setTimeout(callback,delay){timers.set(++timerId,{callback,delay});return timerId;},clearTimeout:id=>timers.delete(id),journalApi:async(path,options={})=>{const call={path,...options,body:options.body?JSON.parse(options.body):undefined};calls.push(call);return handler(call);}});scope.window=scope;scope.missionHome={snapshot:()=>clone(current)};scope.missionProfileName={identity:{storageScope:'owner-a'},load:async()=>scope.missionProfileName.identity};
  vm.runInNewContext(coreSource,scope);vm.runInNewContext(uiSource,scope);
  const panel=home.querySelector('.health-analysis'),get=className=>panel.querySelector('.'+className);
  function analysis(payload,{agentAvailable=true,status='ATTENTION',summary='Review the synthetic observation.',alerts=['Synthetic flag'],pending=false}={}){const snapshot=scope.MissionHealthRules.normalize(payload.snapshot),rules=scope.MissionHealthRules.evaluate(snapshot);return {id:payload.id,snapshot,rules,result:{status,summary,alerts,agentAvailable,agentStatus:agentAvailable?status:null},createdAt:new Clock().toISOString(),pending};}
  return {scope,home,panel,get,calls,timers,api:scope.missionHealth,analysis,setSnapshot(value){current=clone(value);},handler(value){handler=value;},setOwner(value){scope.missionProfileName.identity=value?{storageScope:value}:null;scope.dispatchEvent(new Event('mission-profile-change'));}};
}

test('Dashboard snapshots use the personal numeric model, never DOM text or synthetic chart values',()=>{
  const f=homeFixture();f.scope.state.visiting=true;f.scope.state.crew=0;
  f.home.querySelector=()=>{throw new Error('Snapshot must not read the DOM');};f.document.querySelector=()=>{throw new Error('Snapshot must not read the DOM');};
  const snapshot=clone(f.api.snapshot());assert.equal(snapshot.profileId,'personal');assert.equal(snapshot.readings.heart_rate.value,72);assert.equal(snapshot.readings.bp_systolic.value,118);assert.equal(snapshot.readings.bp_diastolic.value,76);assert.equal(snapshot.readings.skin_temperature.value,36.7);assert.equal(snapshot.readings.body_temperature,null);assert.equal(snapshot.readings.fatigue_index,null);assert.equal(snapshot.readings.stress_index,null);assert.equal(snapshot.readings.wellbeing,null);
  for(const reading of Object.values(snapshot.readings).filter(Boolean)){assert.equal(typeof reading.value,'number');assert.equal(reading.source,'demo');assert.equal(reading.observedAt,null);}
  assert.equal(snapshot.capturedAt,new Clock().toISOString());snapshot.readings.heart_rate.value=200;assert.equal(f.api.snapshot().readings.heart_rate.value,72);
});

test('Actual wellbeing retains its original timestamp and never substitutes the displayed demo score',()=>{
  const f=homeFixture();assert.equal(f.api.snapshot().readings.wellbeing,null);f.report({score:8,wellbeingScale:100},now-600000);
  assert.deepEqual(clone(f.api.snapshot().readings.wellbeing),{value:8,unit:'/100',source:'manual',observedAt:new Clock(now-600000).toISOString()});
  for(const [report,at]of [[{score:80,wellbeingScale:100},now-13*3600000],[{score:80,wellbeingScale:100},now+1000],[{score:8,wellbeingScale:10},now],[{score:NaN,wellbeingScale:100},now]]){f.report(report,at);assert.equal(f.api.snapshot().readings.wellbeing,null);}
});
test('Numeric card text remains compatible with trend parsing for steps and movement',()=>{
  const f=homeFixture();assert.equal(f.home.querySelector('[data-home-metric=steps]').querySelector('strong').textContent,'6240steps');assert.equal(f.home.querySelector('[data-home-metric=activity]').querySelector('strong').textContent,'66218counts');
});

test('Watch imports send only an ID for authoritative server resolution while demo summaries stay demo',()=>{
  const f=homeFixture();f.watch({source:'demo',simulation:true,summary:{latest24h:{sleepSeconds:21600,activityCounts:12345,meanLightLux:44}}});let snapshot=f.api.snapshot();assert.equal(snapshot.readings.sleep_hours.value,6);assert.equal(snapshot.readings.activity.value,12345);assert.equal(snapshot.readings.light.source,'demo');assert.equal(snapshot.readings.light.observedAt,null);
  f.watch({id:importId,source:'actiwatch',summary:{latest24h:{sleepSeconds:28800,activityCounts:99999,meanLightLux:1000}}});snapshot=f.api.snapshot();assert.equal(snapshot.actiwatchImportId,importId);for(const key of ['sleep_hours','activity','light'])assert.equal(snapshot.readings[key],null);assert.equal(snapshot.readings.steps.value,6240);
});

test('The initial UI is Example and Incomplete, makes only a GET and never starts automatic AI analysis',async()=>{
  const f=uiFixture();await flush();assert.equal(f.get('health-analysis-status').textContent,'Incomplete');assert.equal(f.get('health-analysis-scope').textContent,'Example');assert.match(f.get('health-analysis-summary').textContent,/Skin temperature is kept separate/);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,undefined);assert.equal(f.calls[0].path,'/api/health-analysis');assert.equal(f.api.snapshot().readings.body_temperature,null);
  f.scope.dispatchEvent(new Event('mission-wellbeing-change'));await flush();assert.equal(f.calls.length,1);assert.match(f.get('health-analysis-meta').textContent,/no AI request/);
});

test('Analyze uses one immutable snapshot and disables duplicate clicks while busy',async()=>{
  const f=uiFixture();await flush();let resolve;f.handler(()=>new Promise(done=>{resolve=done;}));const work=f.api.analyze();assert.equal(f.get('health-analysis-button').disabled,true);await f.api.analyze();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  const sent=f.calls.at(-1).body;assert.match(sent.id,/^[a-f0-9-]{36}$/);assert.equal(sent.snapshot.profileId,'personal');resolve(f.analysis(sent,{status:null}));await work;assert.equal(f.get('health-analysis-button').disabled,false);assert.equal(f.get('health-analysis-status').textContent,'Incomplete');assert.match(f.get('health-analysis-meta').textContent,/AI \+ rules/);
});

test('Network failure preserves the UUID and original readings for manual retry without fabricated AI output',async()=>{
  const f=uiFixture();await flush();f.handler(()=>{throw new Error('offline');});await f.api.analyze();const first=clone(f.calls.at(-1).body);assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');assert.match(f.get('health-analysis-notice').textContent,/Retry keeps the same readings/);assert.ok(!f.get('health-analysis-meta').textContent.includes('AI + rules'));
  const changed=demoSnapshot();changed.readings.heart_rate.value=140;f.setSnapshot(changed);f.scope.dispatchEvent(new Event('mission-wellbeing-change'));f.handler(call=>f.analysis(call.body,{status:'ATTENTION'}));await f.api.analyze();assert.deepEqual(f.calls.at(-1).body,first);assert.equal(f.calls.filter(call=>call.method==='POST').length,2);
});

test('A pending lease remains in progress until explicit retry, without an automatic second POST',async()=>{
  const f=uiFixture();await flush();f.handler(call=>f.analysis(call.body,{pending:true,agentAvailable:false,status:null}));await f.api.analyze();const first=clone(f.calls.at(-1).body);assert.equal(f.get('health-analysis-meta').textContent,'Analysis in progress');assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');await flush();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  f.handler(call=>f.analysis(call.body,{status:null}));await f.api.analyze();assert.deepEqual(f.calls.at(-1).body,first);assert.match(f.get('health-analysis-meta').textContent,/AI \+ rules/);
});
test('A stalled analysis times out, releases the button and preserves its retry payload',async()=>{
  const f=uiFixture();await flush();f.handler(call=>new Promise((_resolve,reject)=>call.signal.addEventListener('abort',()=>reject(new Error('timeout')))));const work=f.api.analyze(),first=clone(f.calls.at(-1).body),timer=[...f.timers.values()].find(value=>value.delay===75000);assert.ok(timer);timer.callback();await work;assert.equal(f.get('health-analysis-button').disabled,false);assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');assert.equal(f.timers.size,0);f.handler(call=>f.analysis(call.body,{status:null}));await f.api.analyze();assert.deepEqual(f.calls.at(-1).body,first);
});

test('An unavailable agent shows deterministic rules and preserves the saved snapshot for retry',async()=>{
  const f=uiFixture();await flush();const value=demoSnapshot();value.readings.heart_rate.value=140;f.setSnapshot(value);f.handler(call=>{const item=f.analysis(call.body,{agentAvailable:false,status:'NORMAL',summary:'Rules are available; the AI service is unavailable.'});item.rules.status='CRITICAL';return item;});await f.api.analyze();assert.equal(f.get('health-analysis-status').textContent,'CRITICAL');assert.match(f.get('health-analysis-meta').textContent,/Rules only \/ AI unavailable/);assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');assert.ok(!f.get('health-analysis-meta').textContent.includes('AI + rules'));
});

test('Incomplete core measurements cannot display NORMAL even if an upstream result claims it',async()=>{
  const f=uiFixture();await flush();f.handler(call=>f.analysis(call.body,{status:'NORMAL'}));await f.api.analyze();assert.equal(f.get('health-analysis-status').textContent,'Incomplete');
});

test('Older account GET responses cannot replace the new account result',async()=>{
  let resolveOld,resolveNew;const f=uiFixture(()=>new Promise(done=>{resolveOld=done;}));f.handler(()=>new Promise(done=>{resolveNew=done;}));f.setOwner('owner-b');
  const payload={id:importId,snapshot:demoSnapshot()};resolveNew({item:f.analysis(payload,{summary:'New account analysis',status:null})});await flush();resolveOld({item:f.analysis(payload,{summary:'Old account private analysis',status:null})});await flush();assert.equal(f.get('health-analysis-summary').textContent,'New account analysis');assert.ok(!f.panel.textContent.includes('Old account private analysis'));
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
  const f=uiFixture();await flush();const current=demoSnapshot();current.actiwatchImportId=importId;for(const key of ['sleep_hours','activity','light'])current.readings[key]=null;f.setSnapshot(current);
  const canonical=clone(current);canonical.readings.sleep_hours={value:8,unit:'h',source:'import',observedAt:new Clock(now-3600000).toISOString()};canonical.readings.activity={value:12345,unit:'counts',source:'import',observedAt:new Clock(now-3600000).toISOString()};canonical.readings.light={value:150,unit:'lx',source:'import',observedAt:new Clock(now-3600000).toISOString()};
  f.handler(()=>({item:f.analysis({id:importId,snapshot:canonical},{agentAvailable:false,status:null})}));await f.api.refresh();assert.equal(f.get('health-analysis-new').hidden,true);assert.ok(!f.get('health-analysis-notice').textContent.includes('Readings changed'));assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');
});

test('A saved pending lease can be retried after loading without creating a new ID',async()=>{
  const f=uiFixture();await flush();const payload={id:importId,snapshot:demoSnapshot()};f.handler(()=>({item:f.analysis(payload,{pending:true,agentAvailable:false,status:null})}));await f.api.refresh();assert.equal(f.get('health-analysis-meta').textContent,'Analysis in progress');assert.equal(f.get('health-analysis-button').textContent,'Retry analysis');
  f.handler(call=>f.analysis(call.body,{status:null}));await f.api.analyze();assert.equal(f.calls.at(-1).body.id,importId);
});

function chatFixture(){
  const calls=[];let current=demoSnapshot(),handler=call=>({message:{id:call.body.id,content:call.body.content,attachments:[],createdAt:new Clock().toISOString()},reply:null});
  const scope=events({document:{getElementById:()=>null,createElement:tag=>new Node(tag),querySelectorAll:()=>[]},Date:Clock,Intl,Event,crypto:webcrypto,personalProfileId:'personal',localStorage:{getItem:()=>null,setItem(){}},loadJournal(){},journalApi:async(path,options={})=>{const call={path,body:options.body?JSON.parse(options.body):undefined};calls.push(call);return handler(call);}});scope.window=scope;scope.missionHealth={snapshot:()=>clone(current)};scope.missionActivity={record(){},refresh(){}};
  const setup=personalSource.slice(0,personalSource.indexOf('  const checkin=create('));vm.runInNewContext(setup+'window.test={store,send,retryChat,choose};})();',scope);
  return {api:scope.test,calls,setSnapshot:value=>{current=clone(value);},handler:value=>{handler=value;}};
}

test('Chat captures its snapshot and attachments once and retains both after a network failure',async()=>{
  const f=chatFixture(),draft=f.api.store('chat');draft.draft='Analyze these readings';draft.files=[{id:importId}];f.handler(()=>{throw new Error('offline');});await f.api.send('chat');const first=clone(f.calls[0].body);assert.equal(first.healthSnapshot.profileId,'personal');assert.deepEqual(first.attachments,[importId]);
  const changed=demoSnapshot();changed.readings.heart_rate.value=140;f.setSnapshot(changed);draft.files=[];f.handler(call=>({message:{id:call.body.id,content:call.body.content},reply:null}));await f.api.send('chat');assert.deepEqual(f.calls[1].body,first);assert.equal(draft.pending,null);
});

test('Crew chat and diary saves do not attach the personal dashboard, saved-message retry leaves its server snapshot intact',async()=>{
  for(const kind of ['team','diary']){const f=chatFixture();f.api.store(kind).draft='A message';await f.api.send(kind);assert.equal(Object.hasOwn(f.calls[0].body,'healthSnapshot'),false);}
  const f=chatFixture();await f.api.retryChat({id:importId,content:'Previously saved request',attachments:[],wellbeing:{score:80,wellbeingScale:100}});assert.equal(Object.hasOwn(f.calls[0].body,'healthSnapshot'),false);
});
