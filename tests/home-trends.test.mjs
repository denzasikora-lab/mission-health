import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/home-trends.js',import.meta.url),'utf8'),watchSource=await readFile(new URL('../public/actiwatch-core.js',import.meta.url),'utf8');
const initialNow=Date.parse('2026-11-14T10:00:00Z'),day=86400000,clone=value=>JSON.parse(JSON.stringify(value));
const reading=(value,at=initialNow,source='manual')=>({value,observedAt:new Date(at).toISOString(),source});
const record=(key,value,at=initialNow,name='Manual entry')=>({id:String(at),sourceName:name,createdAt:new Date(at).toISOString(),snapshot:{readings:{[key]:reading(value,at)}}});
const epoch=(at,{activity=3,lightLux=10,sleepState='sleep',offWrist=false,excluded=false}={})=>({timestamp:new Date(at).toISOString(),activity,lightLux,sleepState,offWrist,excluded});
const watchRecording=rows=>({version:1,sourceFormat:'actiware-csv',epochSeconds:60,rows,warnings:[]});
const flush=async()=>{for(let index=0;index<15;index++)await Promise.resolve();};
class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.style={};this.hidden=false;this._text='';this.className='';this.parent=null;}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  after(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,node);}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  setAttribute(key,value){this.attributes[key]=String(value);if(key==='class')this.className=String(value);}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  removeEventListener(type,callback){this.events[type]=(this.events[type]||[]).filter(value=>value!==callback);}
  emit(type,event={}){for(const callback of [...this.events[type]||[]])callback({type,target:this,...event});}
  matches(selector){if(selector.includes(','))return selector.split(',').some(value=>this.matches(value));if(selector==='[data-home-metric]')return Boolean(this.dataset.homeMetric);if(selector==='[data-trend-period]')return Boolean(this.dataset.trendPeriod);if(selector[0]==='.')return this.className.split(' ').includes(selector.slice(1));return this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
  getClientRects(){return this.hidden||this.parent&&!this.parent.getClientRects().length?[]:[{}];}
}
function fixture({records=[],readings={},watch=null,recording=null,report=null,reportAt=null,scope='owner-a'}={}){
  let now=initialNow,id=0,stored=records,model={readings},imported=watch,epochs=recording,currentReport=report,selectedReport=reportAt===null?null:{at:reportAt},manualPolls=0,watchPolls=0;
  const timers=new Map(),observers=[],body=new Node('body'),home=new Node('section'),bodyPanel=new Node('section');
  home.id='mission-home';bodyPanel.className='home-body-panel';body.append(home);home.append(bodyPanel);
  const cards=new Map();for(const key of ['hr','spo2','wellbeing','activity','sleep','light','temp','bodyTemp','hrv','respiration','pressure','recovery','fatigue','stress','steps']){const card=new Node('article'),number=new Node('strong');card.dataset={homeMetric:key,source:'demo',readingValue:'999',observedAt:null};number.textContent='999';card.append(number);bodyPanel.append(card);cards.set(key,card);}
  const document=new Node('document');Object.assign(document,{body,hidden:false,createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag),getElementById:key=>key==='mission-home'?home:null});
  const window=new Node('window');window.missionProfileName={identity:scope?{storageScope:scope}:null};window.missionHome={model:()=>model};window.missionReadings={records:()=>stored,refresh:async()=>{manualPolls++;}};window.missionActiwatch={current:()=>imported,recording:()=>epochs,refresh:async()=>{watchPolls++;}};window.missionCheckin={current:()=>currentReport,selection:()=>selectedReport};
  const setTimeout=(callback,delay)=>{timers.set(++id,{callback,at:now+delay});return id;},clearTimeout=key=>timers.delete(key);
  class FakeDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  class Observer{constructor(callback){this.callback=callback;this.observations=[];this.disconnected=false;observers.push(this);}observe(target,options){this.observations.push({target,options});}disconnect(){this.observations=[];this.disconnected=true;}}
  const sandbox={window,document,Date:FakeDate,Intl,MutationObserver:Observer,setTimeout,clearTimeout,requestAnimationFrame:callback=>setTimeout(callback,16),cancelAnimationFrame:clearTimeout};
  vm.runInNewContext(watchSource,sandbox);vm.runInNewContext(source,sandbox);
  const panel=home.querySelector('.home-trends'),controls=panel.querySelector('.home-trend-periods'),svg=panel.querySelector('svg');
  function advance(milliseconds){const end=now+milliseconds;let steps=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(steps++>1000)throw new Error('timer loop');now=next[1].at;timers.delete(next[0]);next[1].callback();}now=end;}
  function mutate(target,attribute){for(const observer of observers){if(observer.observations.some(item=>item.target===target&&(!attribute||item.options.attributeFilter?.includes(attribute))))observer.callback([]);}}
  const period=value=>controls.emit('click',{target:controls.children.find(node=>node.dataset.trendPeriod===value)}),select=key=>cards.get(key).emit('click'),path=()=>svg.querySelector('.home-trend-line')?.attributes.d||null;
  return {window,document,home,cards,panel,svg,timers,observers,period,select,path,advance,mutate,api:window.missionHomeTrends,core:sandbox.MissionHomeTrendData,watchCore:sandbox.MissionActiwatch,polls:()=>({manual:manualPolls,watch:watchPolls}),now:()=>now,setRecords:value=>{stored=value;},setReadings:value=>{model={readings:value};},setWatch:(value,data)=>{imported=value;epochs=data;},setReport:(value,at)=>{currentReport=value;selectedReport=at===null?null:{at};},owner:value=>{window.missionProfileName.identity=value?{storageScope:value}:null;window.emit('mission-profile-change');}};
}

test('Missing data never parses synthetic card text or invents chart points',()=>{
  const f=fixture();assert.equal(f.panel.dataset.observationCount,'0');assert.equal(f.path(),null);assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'Not measured');assert.match(f.panel.querySelector('.home-trend-empty').textContent,/No observations/);assert.equal(f.cards.get('hr').querySelector('.home-vital-trend').textContent,'No history');assert.equal(f.timers.size,0);
  f.setReadings({heart_rate:reading(72,initialNow,'demo')});f.api.refresh();assert.equal(f.panel.dataset.observationCount,'0');assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'Not measured');
});

test('Generated cards do not inherit actual history colors or deltas and cannot invent chart observations',()=>{
  const records=[record('heart_rate',60,initialNow-30000),record('heart_rate',70,initialNow-20000),record('heart_rate',80,initialNow-10000),record('heart_rate',90)],f=fixture({records,readings:{heart_rate:reading(90)}}),card=f.cards.get('hr'),indicator=card.querySelector('.home-vital-trend');assert.equal(card.dataset.trendDelta,'30');f.setReadings({heart_rate:{value:78,unit:'bpm',source:'demo',observedAt:null}});f.window.emit('mission-sample-change');f.advance(16);assert.equal(indicator.hidden,true);assert.equal(card.dataset.trendLevel,'neutral');assert.equal(card.dataset.trendDelta,undefined);assert.equal(card.dataset.trendZ,undefined);assert.equal(f.panel.dataset.observationCount,'4');assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'Not measured');f.setReadings({heart_rate:reading(90)});f.window.emit('mission-sample-change');f.advance(16);assert.equal(indicator.hidden,false);assert.equal(card.dataset.trendDelta,'30');assert.equal(f.panel.dataset.observationCount,'4');
});
test('One actual reading is a timestamped dot without an invented line',()=>{
  const f=fixture({readings:{heart_rate:reading(72,initialNow-30000)}});assert.equal(f.panel.dataset.observationCount,'1');assert.equal(f.path(),null);assert.ok(f.svg.querySelector('.home-trend-points'));assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'72 bpm');assert.match(f.svg.attributes['aria-label'],/2026-11-14T09:59:30.000Z/);assert.equal(f.cards.get('hr').querySelector('.home-vital-trend').textContent,'One observation');
});
test('Actual observation timestamps, inclusive period bounds and future exclusion determine the window',()=>{
  const f=fixture({records:[record('heart_rate',1,initialNow-60001),record('heart_rate',60,initialNow-60000),record('heart_rate',72,initialNow-15000),record('heart_rate',73,initialNow),record('heart_rate',199,initialNow+1)],readings:{heart_rate:reading(73)}});f.period('1m');assert.equal(f.panel.dataset.observationCount,'3');assert.ok(f.svg.querySelector('.home-trend-points'));assert.match(f.path(),/M600.00 .*L800.00 /);assert.equal(f.cards.get('hr').dataset.trendDelta,'13');
  f.period('1h');assert.equal(f.panel.dataset.observationCount,'4');assert.equal(f.timers.size,0);
});
test('Each metric uses its canonical reading rather than the neighboring card or DOM value',()=>{
  const f=fixture({readings:{body_temperature:reading(37.4),skin_temperature:reading(36.2),bp_systolic:reading(118),bp_diastolic:reading(76),fatigue_index:reading(24),stress_index:reading(31)}});for(const [key,label]of [['bodyTemp','37.4 °C'],['temp','36.2 °C'],['pressure','118 mmHg'],['fatigue','24 /100'],['stress','31 /100']]){f.select(key);assert.equal(f.panel.dataset.observationCount,'1');assert.equal(f.panel.querySelector('.home-trend-reading').textContent,label);}
});
test('Minute polling requests actual stores and never turns the current reading into new observations',async()=>{
  const at=initialNow-5000,f=fixture({readings:{heart_rate:reading(72,at)}});f.period('1m');await flush();assert.deepEqual(f.polls(),{manual:1,watch:1});const original=f.svg.attributes['aria-label'];f.advance(5016);await flush();assert.deepEqual(f.polls(),{manual:2,watch:2});assert.equal(f.panel.dataset.observationCount,'1');assert.equal(f.path(),null);assert.equal(f.svg.attributes['aria-label'],original);assert.equal(f.cards.get('hr').dataset.trendDelta,undefined);
  f.setRecords([record('heart_rate',72,at),record('heart_rate',75,f.now())]);f.setReadings({heart_rate:reading(75,f.now())});f.window.emit('mission-readings-change');f.advance(16);assert.equal(f.panel.dataset.observationCount,'2');assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'75 bpm');assert.match(f.path(),/L/);
});
test('The minute clock ages old observations out without fabricating a replacement',async()=>{
  const f=fixture({readings:{heart_rate:reading(72,initialNow-59000)}});f.period('1m');await flush();assert.equal(f.panel.dataset.observationCount,'1');f.advance(2000);await flush();assert.equal(f.panel.dataset.observationCount,'0');assert.match(f.panel.querySelector('.home-trend-empty').textContent,/last minute/);assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'72 bpm');
});
test('Hidden health view and document stop polling and chart timers',async()=>{
  const f=fixture();f.period('1m');await flush();const before=f.polls();f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.timers.size,0);f.advance(15000);await flush();assert.deepEqual(f.polls(),before);f.document.hidden=false;f.document.emit('visibilitychange');f.advance(16);await flush();assert.deepEqual(f.polls(),{manual:before.manual+1,watch:before.watch+1});
  f.home.hidden=true;f.mutate(f.home,'hidden');assert.equal(f.timers.size,0);const hidden=f.polls();f.advance(10000);await flush();assert.deepEqual(f.polls(),hidden);f.home.hidden=false;f.mutate(f.home,'hidden');f.advance(16);await flush();assert.ok(f.timers.size>0);assert.equal(f.panel.dataset.observationCount,'0');
});
test('Polling has no overlapping requests and completions cannot restart a hidden page',async()=>{
  const f=fixture();let resolve;f.window.missionReadings.refresh=()=>new Promise(done=>{resolve=done;});f.period('1m');await flush();f.advance(12000);await flush();assert.deepEqual(f.polls(),{manual:0,watch:1});f.document.hidden=true;f.document.emit('visibilitychange');resolve();await flush();assert.equal(f.timers.size,0);
});
test('Page cache suspension resumes and permanent teardown removes observers and listeners',async()=>{
  const f=fixture();f.period('1m');await flush();f.window.emit('pagehide',{persisted:true});assert.equal(f.timers.size,0);f.advance(4000);f.window.emit('pageshow');f.advance(16);await flush();assert.ok(f.timers.size>0);f.window.emit('pagehide',{persisted:false});assert.equal(f.timers.size,0);assert.ok(f.observers.every(observer=>observer.disconnected));assert.ok(Object.values(f.window.events).every(list=>list.length===0));assert.equal(f.document.events.visibilitychange.length,0);f.api.refresh();assert.equal(f.timers.size,0);
});
test('Owner changes clear transient self-reports and never reuse prior owner observations',()=>{
  const f=fixture({readings:{wellbeing:reading(80)},report:{score:80,wellbeingScale:100},reportAt:initialNow});f.select('wellbeing');assert.equal(f.panel.dataset.observationCount,'1');f.setReadings({});f.setRecords([]);f.setReport(null,null);f.owner('owner-b');f.advance(16);assert.equal(f.panel.dataset.observationCount,'0');f.owner(null);f.advance(16);assert.equal(f.panel.dataset.observationCount,'0');f.period('1m');assert.equal(f.timers.size,0);
});
test('Only observed self-reports are retained and duplicate refreshes keep one observation',()=>{
  const f=fixture({readings:{wellbeing:reading(80)},report:{score:80,wellbeingScale:100},reportAt:initialNow});f.select('wellbeing');f.api.refresh();assert.equal(f.panel.dataset.observationCount,'1');f.advance(5000);f.setReport({score:82,wellbeingScale:100},f.now());f.setReadings({wellbeing:reading(82,f.now())});f.api.refresh();assert.equal(f.panel.dataset.observationCount,'2');assert.equal(f.cards.get('wellbeing').dataset.trendDelta,'2');
});
test('Latest record wins duplicate timestamps and invalid times are rejected',()=>{
  const f=fixture(),at=initialNow-60000,points=f.core.history('hr',{records:[record('heart_rate',75,at),record('heart_rate',72,at)]},initialNow);assert.equal(points.length,1);assert.equal(points[0].value,75);assert.equal(f.core.observation(reading(70,initialNow+1),initialNow),null);assert.equal(f.core.observation({value:70,source:'manual',observedAt:null},initialNow),null);
});
test('Missing intervals and source changes split paths instead of connecting distant observations',()=>{
  const f=fixture(),point=(at,value,sourceKey='a')=>({at,value,sourceKey});const parts=f.core.segments([point(0,70),point(5000,71),point(30000,72),point(31000,null),point(32000,73),point(33000,74,'b'),point(34000,75,'b')],{ms:60000});assert.deepEqual(clone(parts.map(part=>part.map(value=>value.at))),[[0,5000],[30000],[32000],[33000,34000]]);
});
test('Actiwatch rolling points match actual summaries including partial boundary epochs',()=>{
  const f=fixture(),rows=[];for(let index=0;index<1500;index++)rows.push(epoch(initialNow-1500*70000+index*70000,{activity:index%7,lightLux:10+index%30,sleepState:index%3?'sleep':'wake',offWrist:index%13===0,excluded:index%17===0}));rows[20].activity=null;rows[21].lightLux=null;rows[21].sleepState='unknown';rows.at(-1).offWrist=false;rows.at(-1).excluded=false;
  const data=watchRecording(rows);data.epochSeconds=70;const series=f.core.watchSeries(data),summary=f.watchCore.summarize(data).latest24h;assert.equal(series.activity.at(-1).value,summary.activityCounts);assert.equal(series.sleep_hours.at(-1).value,summary.sleepSeconds/3600);assert.ok(Math.abs(series.light.at(-1).value-summary.meanLightLux)<1e-9);assert.equal(series.activity.at(-1).at,initialNow);assert.equal(series.activity.length,1500);
});
test('Invalid and absent epochs stay gaps while valid zero values are retained',()=>{
  const f=fixture(),data=watchRecording([epoch(initialNow-300000,{activity:0,lightLux:0,sleepState:'wake'}),epoch(initialNow-240000,{activity:null,lightLux:null,sleepState:'unknown'}),epoch(initialNow-120000,{activity:4,lightLux:8}),epoch(initialNow-60000,{offWrist:true})]),points=f.core.watchSeries(data);assert.equal(points.activity[0].value,0);assert.equal(points.sleep_hours[0].value,0);assert.equal(points.light[0].value,0);assert.equal(points.activity[1].value,null);assert.equal(points.light[1].value,null);assert.equal(points.activity[2].gapBefore,true);assert.equal(points.activity[3].value,null);assert.equal(f.core.segments(points.activity,{ms:day}).length,2);assert.deepEqual(clone(f.core.watchSeries({...data,epochSeconds:0})),{sleep_hours:[],activity:[],light:[]});
});
test('Watch series uses daily aggregates and never mixes a manual movement total',()=>{
  const data=watchRecording([epoch(initialNow-180000,{activity:10}),epoch(initialNow-120000,{activity:20}),epoch(initialNow-60000,{activity:30})]),watch={id:'watch-a',filename:'actual.csv'},f=fixture({records:[record('activity',999,initialNow-90000)],watch,recording:data,readings:{activity:reading(60,initialNow,'import')}});f.select('activity');assert.equal(f.panel.dataset.observationCount,'3');assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'60 counts');assert.equal(f.cards.get('activity').dataset.trendDelta,'50');assert.match(f.panel.querySelector('.home-trend-source').textContent,/Actiwatch epochs/);
  f.setWatch(null,null);f.setReadings({activity:reading(999,initialNow-90000)});f.api.refresh();assert.equal(f.panel.dataset.observationCount,'1');assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'999 counts');
});
test('The saved watch summary is an isolated observation after an invalid final epoch',()=>{
  const f=fixture(),data=watchRecording([epoch(initialNow-120000,{activity:10}),epoch(initialNow-60000,{activity:null,sleepState:'unknown'})]),points=f.core.history('activity',{watch:{id:'a',filename:'x.csv'},recording:data,current:reading(10,initialNow,'import')},initialNow);assert.equal(points.length,2);assert.equal(points.at(-1).value,10);assert.equal(points.at(-1).gapBefore,true);assert.equal(f.core.segments(points,{ms:day}).length,2);
});
test('Color requires at least three earlier actual observations from the same source',()=>{
  const f=fixture(),points=[70,70,70,80].map((value,at)=>({value,at,sourceKey:'a'}));assert.equal(f.core.statistics([]),null);assert.equal(f.core.statistics(points.slice(0,3)).level,'neutral');assert.equal(f.core.statistics(points).level,'red');assert.equal(f.core.statistics([...points.slice(0,3),{value:80,at:5,sourceKey:'b'}]).level,'neutral');
});
test('Downsampling retains actual endpoints and extremes without synthesizing observations',()=>{
  const f=fixture(),points=Array.from({length:10000},(_,index)=>({at:index*173,value:index%231,sourceKey:'actual'}));points[203].value=-123;points[9400].value=10000;const sampled=f.core.sample(points);assert.ok(sampled.length<=500);assert.equal(sampled[0],points[0]);assert.equal(sampled.at(-1),points.at(-1));assert.ok(sampled.includes(points[203]));assert.ok(sampled.includes(points[9400]));assert.ok(sampled.every(point=>points.includes(point)));assert.ok(sampled.every((point,index)=>index===0||sampled[index-1].at<point.at));
});
