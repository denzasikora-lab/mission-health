import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const core=await readFile(new URL('../public/story-tags-core.js',import.meta.url),'utf8'),source=await readFile(new URL('../public/story-tags.js',import.meta.url),'utf8');
class Node{
  constructor(){this.children=[];this.attributes={};this.dataset={};this.style={};this.events={};this.queries={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;}
  append(...nodes){for(const node of nodes)node.parent=this;this.children.push(...nodes);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
  before(node){this.beforeNode=node;}
  after(node){this.afterNode=node;}
  replaceChildren(...nodes){this.children=[...nodes];}
  querySelector(selector){return this.queries[selector]||=new Node();}
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
  dispatchEvent(event){for(const fn of this.events[event.type]||[])fn(event);}
  getBoundingClientRect(){return {width:300,height:85,left:0,top:0};}
  focus(){this.focused=true;}
}
function fixture(){
  const input=new Node(),label=new Node(),dialog=new Node(),calls=[],observers=[],timers=new Map();let now=0,id=0;
  input.closest=selector=>selector==='label'?label:dialog;dialog.open=true;
  const window={};const scope={window,Event,AbortController,Date,matchMedia:()=>({matches:true}),setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},document:{createElement:()=>new Node(),addEventListener(){}},journalApi:(path,options)=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}))};
  vm.runInNewContext(core,scope);window.MissionStoryTagsCore=scope.MissionStoryTagsCore;vm.runInNewContext(source,scope);
  const mounted=window.missionStoryTags.mount(input),section=label.afterNode,list=section.querySelector('.story-tag-list'),clear=input.beforeNode.children[1];
  function advance(ms){const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}
  const type=value=>{input.value=value;input.dispatchEvent(new Event('input'));};
  return {input,clear,mounted,section,list,calls,advance,type,dialog,observers,tags:()=>list.children.map(node=>node.textContent)};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
test('The clear control appears beside text, clears the caption immediately, and tags, then restores focus',()=>{
  const f=fixture();assert.equal(f.clear.hidden,true);assert.equal(f.section.hidden,true);f.type('how I caught a kitten');f.advance(140);assert.ok(f.tags().includes('#Kittens'));assert.equal(f.section.hidden,false);assert.equal(f.clear.hidden,false);f.clear.dispatchEvent(new Event('click'));assert.equal(f.input.value,'');assert.deepEqual(f.tags(),[]);assert.equal(f.section.hidden,true);assert.equal(f.clear.hidden,true);assert.equal(f.input.focused,true);f.advance(1000);assert.equal(f.calls.length,0);
});
test('Fast typing selects tags once for the latest caption',()=>{
  const f=fixture();f.type('Kitten');f.advance(500);f.type('Kitten playing at home');f.advance(649);assert.equal(f.calls.length,0);f.advance(1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/story-tags');assert.equal(JSON.parse(f.calls[0].options.body).caption,'Kitten playing at home');
});
test('Old responses cannot restore tags after clearing the caption',async()=>{
  const f=fixture();f.type('Kitten at home');f.advance(650);f.clear.dispatchEvent(new Event('click'));assert.equal(f.calls[0].options.signal.aborted,true);f.calls[0].resolve({tags:['#Kittens','#NASA'],source:'model'});await settle();assert.deepEqual(f.tags(),[]);assert.equal(f.input.value,'');
});
test('Caption changes cancel previous selection and show only the new result',async()=>{
  const f=fixture();f.type('Kitten at home');f.advance(650);f.type('Crew workout');f.advance(650);f.calls[1].resolve({tags:['#CrewFitness','#Teamwork','#NASA'],source:'model'});await settle();f.calls[0].resolve({tags:['#Kittens','#NASA'],source:'model'});await settle();assert.ok(f.tags().includes('#CrewFitness'));assert.ok(!f.tags().includes('#Kittens'));assert.ok(f.tags().every(tag=>/^#[A-Za-z0-9]+$/.test(tag)));
});
test('Composition input does not send incomplete captions, closing cancels the request',()=>{
  const f=fixture();f.input.dispatchEvent(new Event('compositionstart'));f.type('Kitten');f.advance(1000);assert.equal(f.calls.length,0);f.input.dispatchEvent(new Event('compositionend'));f.advance(650);assert.equal(f.calls.length,1);f.dialog.dispatchEvent(new Event('close'));assert.equal(f.calls[0].options.signal.aborted,true);
});
test('The clear button does not modify captions during publication, reset removes it',()=>{
  const f=fixture();f.type('Text');f.input.disabled=true;f.observers[0]();assert.equal(f.clear.disabled,true);f.clear.dispatchEvent(new Event('click'));assert.equal(f.input.value,'Text');f.input.disabled=false;f.input.value='';f.mounted.reset();assert.equal(f.clear.hidden,true);assert.deepEqual(f.tags(),[]);
});
