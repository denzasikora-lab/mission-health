import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/story-health.js',import.meta.url),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.style={};this.dataset={};this.attributes={};this.textContent='';}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key]||null;}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  emit(type,extra={}){const event={target:this,button:0,pointerId:7,clientX:0,clientY:0,composedPath:()=>[this],preventDefault(){},stopPropagation(){},...extra};for(const callback of this.events[type]||[])callback(event);}
  getBoundingClientRect(){return this.bounds||{width:parseFloat(this.style.width)||96,height:parseFloat(this.style.height)||56};}
  setPointerCapture(){}
  releasePointerCapture(){}
}
function fixture(){
  const calls=[],window={missionKonstaChip:{mount:(node,options)=>{node.chip=options;calls.push(options);},unmount:node=>{node.chip=null;}},missionHome:{snapshot:()=>({profileId:'personal',readings:{heart_rate:{value:74,source:'manual',observedAt:'2026-11-14T10:00:00Z'},spo2:{value:97,source:'import',observedAt:'2026-11-14T10:00:00Z'}}})},missionCheckin:{current:()=>({score:77,wellbeingScale:100})}},document={createElement:tag=>new Node(tag)};
  vm.runInNewContext(source,{window,document,Intl,Date,Map,File,Blob});const palette=new Node(),stage=new Node();stage.bounds={width:400,height:400};let changes=0;const editor=window.missionStoryHealth.mount(palette,stage,()=>{changes++;});
  return {api:window.missionStoryHealth,window,document,palette,stage,editor,calls,get changes(){return changes;},layer:()=>stage.children[0],widget:()=>stage.children[0].children[0]};
}
test('The widget palette prefills personal readings and labels missing-reading examples as samples',()=>{
  const f=fixture(),snapshot=f.api.snapshot();assert.equal(snapshot.readings.hr.value,74);assert.equal(snapshot.readings.hr.source,'manual');assert.equal(snapshot.readings.spo2.value,97);assert.equal(snapshot.readings.spo2.source,'import');assert.equal(snapshot.readings.wellbeing.value,77);assert.equal(snapshot.readings.temp.value,36.8);assert.equal(snapshot.readings.temp.source,'demo');assert.equal(f.palette.children[1].children.length,8);assert.equal(f.editor.value().widgets.length,0);
});
test('Tapping a metric adds one fixed mini widget, and its Konsta delete action removes only that widget',()=>{
  const f=fixture();f.palette.children[1].children[0].chip.onClick();f.editor.add('hr');assert.equal(f.editor.value().widgets.length,1);assert.equal(f.widget().chip.label,'Pulse');assert.equal(f.widget().chip.value,'74');assert.equal(f.widget().chip.source,'Manual');f.editor.add('spo2');assert.equal(f.editor.value().widgets.length,2);f.widget().chip.onDelete();assert.deepEqual(clone(f.editor.value().widgets.map(item=>item.key)),['spo2']);assert.equal(Object.hasOwn(f.editor.value().readings,'hr'),false);
});
test('Dragging uses pointer capture, keeps the 96 by 56 size and clamps widgets inside the actual photo',()=>{
  const f=fixture();f.editor.setMedia({width:400,height:200});f.editor.add('hr');const node=f.widget();node.emit('pointerdown',{clientX:10,clientY:20});node.emit('pointermove',{clientX:2000,clientY:3000});node.emit('pointerup',{clientX:2000,clientY:3000});const item=f.editor.value().widgets[0];assert.equal(item.x,1);assert.equal(item.y,1);assert.equal(f.layer().style.top,'100px');assert.equal(node.style.left,'304px');assert.equal(node.style.top,'144px');assert.deepEqual(node.getBoundingClientRect(),{width:96,height:56});
});
test('Keyboard movement, deletion, disabled publishing and resetting preserve the selected data correctly',()=>{
  const f=fixture();f.editor.add('wellbeing');const node=f.widget(),before=f.editor.value().widgets[0].x;node.emit('keydown',{key:'ArrowRight'});assert.ok(f.editor.value().widgets[0].x>before);f.editor.setDisabled(true);f.editor.add('hr');node.emit('keydown',{key:'Delete'});assert.equal(f.editor.value().widgets.length,1);f.editor.setDisabled(false);node.emit('keydown',{key:'Delete'});assert.equal(f.editor.value().widgets.length,0);f.editor.add('hr');const saved=f.editor.value();f.editor.reset();assert.equal(f.editor.value().widgets.length,0);assert.equal(saved.readings.hr.value,74);assert.equal(saved.widgets.length,1);
});
test('Published stories restore the saved positions without remove controls and photo export includes their values',async()=>{
  const f=fixture();f.editor.add('hr');const health=f.editor.value(),stage=new Node();stage.bounds={width:400,height:200};const view=f.api.show(stage,health,{width:800,height:400});assert.equal(stage.children[0].children[0].chip.onDelete,undefined);assert.equal(health.widgets[0].x,.08);
  const text=[],context={drawImage(){},save(){},translate(){},scale(){},beginPath(){},roundRect(){},fill(){},stroke(){},fillText:value=>text.push(value),restore(){}};f.document.createElement=()=>({getContext:()=>context,toBlob:callback=>callback(new Blob(['synthetic-jpeg'],{type:'image/jpeg'}))});
  const file=await f.api.photoFile({naturalWidth:800,naturalHeight:400,getBoundingClientRect:()=>({width:400,height:200})},health);assert.equal(file.name,'mission-health-story.jpg');assert.equal(file.type,'image/jpeg');assert.ok(text.includes('74 bpm'));assert.ok(text.includes('Pulse'));view.destroy();assert.equal(stage.children.length,0);
});
test('Only the selected readings are included in the story payload and they remain stable after later changes',()=>{
  const f=fixture();f.editor.add('spo2');const payload=f.editor.value();f.window.missionHome.snapshot=()=>({readings:{spo2:{value:89,source:'manual'}}});assert.deepEqual(Object.keys(payload.readings),['spo2']);assert.equal(payload.readings.spo2.value,97);assert.equal(payload.wellbeing,null);assert.equal(f.editor.value().readings.spo2.value,97);
});
test('A visited crew profile cannot supply the author personal readings',()=>{
  const f=fixture();f.window.missionHome.snapshot=()=>({profileId:'jessica-meir',readings:{heart_rate:{value:190,source:'manual'}}});const health=f.api.snapshot();assert.equal(health.readings.hr.value,72);assert.equal(health.readings.hr.source,'demo');assert.equal(health.profileId,'personal');
});
