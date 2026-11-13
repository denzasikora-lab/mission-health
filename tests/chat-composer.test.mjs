import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/chat-composer.js',import.meta.url),'utf8');
class Node{
  constructor(){this.children=[];this.events={};this.attributes={};this.style={};this.dataset={};this.scrollHeight=80;this.files=[];this.value='';}
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  before(...nodes){this.beforeNodes=nodes;}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(type,fn){(this.events[type]||=[]).push(fn);}
  fire(type){for(const fn of this.events[type]||[])fn({});}
  click(){this.fire('click');}
  focus(){this.focused=true;}
  querySelector(selector){return selector==='footer'?this.footer:null;}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({permission,configuration}={}){
  const stores=new Map(),calls=[],recorders=[],tracks=[{stopped:false,stop(){this.stopped=true;}}];let microphoneCalls=0;
  const view={kind:'chat',input:new Node(),form:new Node(),host:new Node()};view.form.footer=new Node();
  const store=kind=>{if(!stores.has(kind))stores.set(kind,{draft:'',files:[],notice:'',busy:false});return stores.get(kind);};
  const window={MediaRecorder:true,addEventListener(){}};
  class Recorder{
    constructor(){this.events={};this.state='inactive';this.mimeType='audio/webm';recorders.push(this);}
    static isTypeSupported(){return true;}
    addEventListener(type,fn){this.events[type]=fn;}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.events.dataavailable({data:new Blob(['audio'])});void this.events.stop();}
  }
  const sandbox={window,document:{createElement:()=>new Node()},navigator:{mediaDevices:{getUserMedia:()=>{microphoneCalls++;return permission||Promise.resolve({getTracks:()=>tracks});}}},MediaRecorder:Recorder,Blob,FormData,setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>{
    calls.push({url,options});if(url.endsWith('/config'))return configuration||{ok:true,json:async()=>({api:true,local:false})};
    if(url==='/api/transcriptions')return {ok:true,json:async()=>({text:'recognized text'})};
    if(url==='/api/chat-files')return {ok:true,json:async()=>({file:{id:'file-id',name:'check.txt',bytes:4}})};
    throw new Error(url);
  }};
  vm.runInNewContext(source,sandbox);
  const adapter={store,render(){window.missionChatComposer.refresh(view);}};window.missionChatComposer.attach(view,adapter);
  return {view,store,calls,recorders,tracks,api:window.missionChatComposer,microphoneCalls:()=>microphoneCalls};
}
test('Conversations retain attachments and microphone without an expand button',()=>{
  const f=fixture();assert.equal(f.view.chatTools.children.length,2);assert.equal(f.view.chatTools.children[0].attributes['aria-label'],'Attach file');assert.equal(f.view.chatTools.children[1].attributes['aria-label'],'Voice input');assert.equal(f.view.input.style.height,'80px');assert.equal(f.calls.length,0);
});
test('Cancellation before configuration returns does not request microphone permission',async()=>{
  let resolve;const configuration=new Promise(r=>{resolve=r;});const f=fixture({configuration});f.view.chatMic.click();f.api.contextChanged(f.view);resolve({ok:true,json:async()=>({api:true})});await settle();assert.equal(f.microphoneCalls(),0);assert.equal(f.store('chat').dictating,false);
});
test('Late microphone access after switching tabs immediately releases tracks',async()=>{
  let resolve;const permission=new Promise(r=>{resolve=r;});const f=fixture({permission});f.view.chatMic.click();await settle();f.api.contextChanged(f.view);f.view.kind='team';resolve({getTracks:()=>f.tracks});await settle();assert.equal(f.tracks[0].stopped,true);assert.equal(f.recorders.length,0);assert.equal(f.calls.filter(c=>c.url==='/api/transcriptions').length,0);assert.equal(f.store('chat').dictating,false);
});
test('Voice input adds transcribed speech to the draft without sending a message',async()=>{
  const f=fixture();f.store('chat').draft='Start';f.view.chatMic.click();await settle();assert.equal(f.recorders[0].state,'recording');assert.equal(f.store('chat').dictating,true);f.view.chatMic.click();await settle();assert.equal(f.store('chat').draft,'Start recognized text');assert.equal(f.store('chat').dictating,false);assert.equal(f.tracks[0].stopped,true);assert.equal(f.calls.filter(c=>c.url==='/api/transcriptions').length,1);assert.equal(f.calls.some(c=>c.url==='/api/chat'||c.url==='/api/team-chat'),false);
});
test('Switching tabs cancels recording without sending audio or modifying another draft',async()=>{
  const f=fixture();f.view.chatMic.click();await settle();f.api.contextChanged(f.view);f.view.kind='team';f.store('team').draft='To crew';await settle();assert.equal(f.tracks[0].stopped,true);assert.equal(f.calls.some(c=>c.url==='/api/transcriptions'),false);assert.equal(f.store('team').draft,'To crew');assert.equal(f.store('chat').dictating,false);
});
test('A selected file enters the original crew draft after switching tabs',async()=>{
  const f=fixture();f.view.kind='team';f.api.refresh(f.view);const picker=f.view.input.beforeNodes[1];picker.files=[Object.assign(new Blob(['test']),{name:'check.txt'})];picker.fire('change');f.view.kind='chat';await settle();assert.equal(f.store('team').files[0].id,'file-id');assert.equal(f.store('chat').files.length,0);assert.equal(f.calls[0].options.body.get('room'),'team');
});
