import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const source=await readFile(new URL('../public/personal-space.js',import.meta.url),'utf8');
const gaugeSource=await readFile(new URL('../public/metric-gauge.js',import.meta.url),'utf8');
const storySource=await readFile(new URL('../public/story-health.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
class Node{
  constructor(){this.children=[];this.dataset={};this.attributes={};this.properties={};this.selectors=new Map();this.events={};this.value='';this.classes=new Set();this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),toggle:(name,force)=>{const on=force===undefined?!this.classes.has(name):Boolean(force);if(on)this.classes.add(name);else this.classes.delete(name);return on;}};this.style={setProperty:(key,value)=>{this.properties[key]=value;}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  querySelector(selector){if(!this.selectors.has(selector))this.selectors.set(selector,new Node());return this.selectors.get(selector);}
  addEventListener(type,callback){this.events[type]=callback;}
  click(){this.events.click?.();}
  focus(options){this.focused=true;this.focusOptions=options;}
  remove(){}
}
function fixture(storage=new Map()){
  const calls=[],events=[],activity=[];
  const document={getElementById:()=>null,createElement:()=>new Node(),querySelectorAll:()=>[]};
  const window={dispatchEvent:event=>events.push(event.type),missionActivity:{record:(kind,details)=>activity.push({kind,...details}),refresh:()=>{}}};
  const sandbox={window,document,personalProfileId:'personal',Map,Set,Date,Intl,Event,crypto:webcrypto,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},loadJournal:()=>{},journalApi:async(path,options)=>{const body=options?.body?JSON.parse(options.body):undefined;calls.push({path,body});if(!body)return path==='/api/favorites'?{items:[],hasMore:false,cursor:null}:{messages:[],hasMore:false,cursor:null};return {message:{id:body.id,content:body.content,wellbeing:body.wellbeing},reply:null};}};
  // Composer tools are tested separately from wellbeing storage.
  window.missionChatComposer={attach(){},refresh(){},contextChanged(){}};
  vm.runInNewContext(gaugeSource,sandbox);
  // Separate panel initialization from actual storage, sending and rendering functions.
  const setup=source.slice(0,source.indexOf('  const checkin=create('));
  vm.runInNewContext(setup+'window.test={choose,restoreScore,selection,currentReport,badge,canonicalReport,label,hue,store,send,retryChat,panel,setKind,slider,setIdentity:value=>identity=value,addWidget:value=>sliders.push(value)};})();',sandbox);
  window.test.setIdentity({storageScope:'owner'});
  return {api:window.test,window,document,storage,calls,events,activity};
}
const key='mission-checkin:owner:personal';

test('An old score of 8/10 becomes 80/100 and migrates once only',()=>{
  const storage=new Map([[key,JSON.stringify({score:8,at:Date.now()})]]),first=fixture(storage);first.api.restoreScore();
  assert.deepEqual(clone(first.api.currentReport()),{score:80,wellbeingScale:100});
  assert.equal(JSON.parse(storage.get(key)).wellbeingScale,100);
  const second=fixture(storage);second.api.restoreScore();assert.equal(second.api.currentReport().score,80);
});
test('A new low score of 8/100 remains 8/100 after reload',()=>{
  const first=fixture();first.api.choose(8);const second=fixture(first.storage);second.api.restoreScore();
  assert.deepEqual(clone(second.api.currentReport()),{score:8,wellbeingScale:100});
  assert.equal(second.api.label(second.api.currentReport().score),'Very poor');
});
test('Expired scores and unknown scales are not loaded',()=>{
  for(const saved of [{score:8,at:Date.now()-13*3600000},{score:8,wellbeingScale:5,at:Date.now()},{score:101,wellbeingScale:100,at:Date.now()},{score:8,wellbeingScale:100,at:'not a date'}]){
    const f=fixture(new Map([[key,JSON.stringify(saved)]]));f.api.restoreScore();assert.equal(f.api.currentReport(),null);
  }
});
test('Endpoints 1 and 100 are available, fractional and out-of-range values are not selected',()=>{
  const f=fixture();f.api.choose(1);assert.equal(f.api.currentReport().score,1);f.api.choose(100);assert.equal(f.api.currentReport().score,100);
  for(const invalid of [0,101,1.5,'80',NaN])f.api.choose(invalid);
  assert.equal(f.api.currentReport().score,100);assert.equal(f.api.hue(1),0);assert.equal(f.api.hue(100),150);
  assert.deepEqual(clone(f.activity),[{kind:'wellbeing',score:1,wellbeingScale:100},{kind:'wellbeing',score:100,wellbeingScale:100}]);
});
test('The slider shows the current score, color and accessible label out of 100',()=>{
  const f=fixture(),widget={root:new Node(),input:new Node(),value:new Node(),label:new Node(),mouth:new Node(),time:new Node(),reset:new Node()};f.api.addWidget(widget);f.api.choose(76);
  assert.equal(widget.input.value,76);assert.match(widget.value.innerHTML,/aria-valuenow="76"/);assert.match(widget.value.innerHTML,/stroke-dashoffset="24.000"/);assert.equal(widget.label.textContent,'Good');assert.equal(widget.input.attributes['aria-valuetext'],'76 from 100 / Good');assert.equal(widget.root.properties['--mood-hue'],f.api.hue(76));assert.equal(widget.reset.hidden,false);
  f.api.choose(77);assert.notEqual(widget.mouth.attributes.d,'M7 14 Q12 20 17 14');assert.match(widget.value.innerHTML,/aria-valuenow="77"/);
});
test('Dragging previews the score without saving, dispatching dashboard updates or sending activity until change',()=>{
  const f=fixture(),root=f.api.slider(),input=root.querySelector('input');input.events.pointerdown();assert.deepEqual(clone(input.focusOptions),{preventScroll:true});
  for(const score of [61,72,83]){input.value=String(score);input.events.input();assert.match(root.querySelector('strong').innerHTML,new RegExp('aria-valuenow="'+score+'"'));}
  assert.equal(input.focused,true);assert.equal(f.api.currentReport(),null);assert.equal(f.storage.size,0);assert.equal(f.events.length,0);assert.equal(f.activity.length,0);
  input.events.change();assert.equal(f.api.currentReport().score,83);assert.equal(JSON.parse(f.storage.get(key)).score,83);assert.deepEqual(f.events,['mission-wellbeing-change']);assert.equal(f.activity.length,1);
  input.events.blur();assert.equal(f.activity.length,1);assert.equal(f.events.length,1);
});
test('Cancelling a drag restores the saved score and an account change cannot commit an old preview',()=>{
  const f=fixture();f.api.choose(54);const root=f.api.slider(),input=root.querySelector('input');
  input.value='91';input.events.input();input.events.pointercancel();assert.equal(input.value,54);assert.equal(f.api.currentReport().score,54);assert.equal(f.activity.length,1);
  input.value='88';input.events.input();f.api.setIdentity({storageScope:'other-owner'});input.events.change();assert.equal(f.api.currentReport(),null);assert.equal(f.activity.length,1);
});
test('Old badges retain scale10, new badges use scale100',()=>{
  const f=fixture(),old=f.api.badge({score:8,label:'Good'}),current=f.api.badge({score:80,label:'Good',wellbeingScale:100});
  assert.match(old.innerHTML,/aria-valuemax="10" aria-valuenow="8"/);assert.match(current.innerHTML,/aria-valuemax="100" aria-valuenow="80"/);assert.match(old.innerHTML,/stroke-dashoffset="20.000"/);assert.match(current.innerHTML,/stroke-dashoffset="20.000"/);assert.equal(old.children[0].textContent,'Good');assert.equal(old.properties['--mood-hue'],current.properties['--mood-hue']);
});
test('Sending to diary and chat includes explicit scale100',async()=>{
  for(const kind of ['diary','chat']){
    const f=fixture();f.api.choose(84);f.api.store(kind).draft='Recording for verification';await f.api.send(kind);
    assert.deepEqual(clone(f.calls[0].body.wellbeing),{score:84,wellbeingScale:100});assert.equal(f.calls[0].path,kind==='chat'?'/api/chat':'/api/astronauts/personal/messages');
  }
});
test('Retrying an old message preserves the meaning of 8/10 as80/100',async()=>{
  const f=fixture();await f.api.retryChat({id:'message',content:'Hello',wellbeing:{score:8}});
  assert.deepEqual(clone(f.calls[0].body.wellbeing),{score:80,wellbeingScale:100});
});
test('Stories save the new scale, while archive captions8/10 are not rewritten',()=>{
  const f=fixture();f.api.choose(82);f.window.missionCheckin={current:f.api.currentReport};vm.runInNewContext(storySource,{window:f.window,document:f.document,Intl,Date});
  const snapshot=f.window.missionStoryHealth.snapshot();assert.deepEqual(clone(snapshot.wellbeing),{score:82,wellbeingScale:100});
  for(const [wellbeing,expected]of [[{score:8},'Wellbeing: 8 / 10 · self-report'],[{score:82,wellbeingScale:100},'Wellbeing: 82 / 100 · self-report']]){
    const host=new Node();f.window.missionStoryHealth.render(host,{...snapshot,version:2,source:'self_report',wellbeing});assert.ok(host.children.some(child=>child.textContent===expected));
  }
});
test('Four tabs are available in the capture view, keyboard navigation cycles through them',()=>{
  const calls=[],compact=new Node(),sandbox={modalKind:'chat',compact,modalView:{},setKind:(_view,kind)=>calls.push(kind),create:(_tag,_class,text)=>{const node=new Node();node.textContent=text;return node;}};
  const start=source.indexOf("  const tabs=create('div','personal-tabs')"),end=source.indexOf('  checkin.append(tabs);',start);
  assert.ok(start>=0&&end>start);vm.runInNewContext(source.slice(start,end)+'globalThis.actualTabs=tabs;',sandbox);
  const tabs=sandbox.actualTabs;assert.deepEqual(Array.from(tabs.children,node=>node.textContent),['NasaGPT','Favorites','Scheduled','Group chat']);
  assert.equal(tabs.children[0].attributes['aria-selected'],'true');assert.equal(sandbox.modalKind,'chat');
  tabs.children[0].events.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(sandbox.modalKind,'team');assert.equal(tabs.children[3].focused,true);assert.equal(compact.attributes['aria-labelledby'],'media-personal-tab-team');
  tabs.children[1].events.keydown({key:'Home',preventDefault(){}});assert.equal(sandbox.modalKind,'chat');assert.deepEqual(calls,['team','chat']);
});
test('Favorites open inside chat and restore unsaved text without opening the book',async()=>{
  const f=fixture(),host=new Node(),changes=[];f.api.store('chat').draft='Text stays in chat';
  const view=f.api.panel(host,'chat',{favoriteShortcut:true,onKindChange:kind=>changes.push(kind)}),shortcut=host.querySelector('[data-personal-favorites]');
  assert.equal(shortcut.hidden,false);assert.equal(shortcut.textContent,'Favorites');shortcut.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(view.kind,'favorites');assert.equal(shortcut.textContent,'Back to chat');assert.equal(view.form.hidden,true);
  shortcut.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(view.kind,'chat');assert.equal(view.input.value,'Text stays in chat');assert.equal(view.form.hidden,false);
  assert.deepEqual(changes,['chat','favorites','chat']);assert.ok(f.calls.every(call=>!call.path.includes('/book')));
});
