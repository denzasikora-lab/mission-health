import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/compose.js',import.meta.url),'utf8');
class Node{
  constructor(){this.children=[];this.events={};this.attributes={};this.dataset={};this.style={};this.hidden=false;this.textContent='';this.value='';this.maxLength=6000;this.selectionStart=0;this.selectionEnd=0;this.isConnected=true;this.clientWidth=300;this.clientHeight=60;this.scrollTop=0;this.scrollLeft=0;}
  append(...nodes){for(const node of nodes){if(node.parent)node.parent.children=node.parent.children.filter(item=>item!==node);node.parent=this;this.children.push(node);}}
  before(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this),0,node);}
  addEventListener(type,callback,capture){(this.events[type]||=[]).push({callback,capture:capture===true});}
  dispatchEvent(event){for(const item of [...this.events[event.type]||[]].sort((a,b)=>Number(b.capture)-Number(a.capture)))item.callback(event);return !event.defaultPrevented;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key]||null;}
  querySelector(selector){return selector==='footer'?this.footer:null;}
  closest(selector){return selector==='form.personal-composer'?this.form:selector==='[hidden]'&&this.form.hidden?this.form:null;}
  getClientRects(){return this.visible===false?[]:[{}];}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
}
function fixture(){
  let now=0,timerId=0;
  const timers=new Map(),calls=[],observers=[],documentEvents={},windowEvents={},input=new Node(),form=new Node(),footer=new Node();
  input.form=form;input.dataset.activityArea='chat';form.footer=footer;form.append(input,footer);
  const document={hidden:false,activeElement:input,documentElement:new Node(),querySelectorAll:()=>[input],createElement:()=>new Node(),addEventListener:(type,callback)=>{documentEvents[type]=callback;}};
  const window={addEventListener:(type,callback)=>{windowEvents[type]=callback;}};
  const clock={setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)};
  class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}}
  const sandbox={window,document,Event,TextEncoder,AbortController,MutationObserver:Observer,ResizeObserver:class{observe(){}},...clock,getComputedStyle:()=>({fontFamily:'Arial',fontSize:'13px',lineHeight:'21px',paddingTop:'3px',paddingRight:'4px',paddingBottom:'3px',paddingLeft:'4px',boxSizing:'border-box',overflowWrap:'break-word'}),journalApi:(path,options)=>new Promise((resolve,reject)=>calls.push({path,body:JSON.parse(options.body),signal:options.signal,resolve,reject}))};
  vm.runInNewContext(source,sandbox);
  const state=window.missionCompose.attach(input);
  function advance(milliseconds){const end=now+milliseconds;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();}now=end;}
  function type(value){input.value=value;input.setSelectionRange(value.length,value.length);input.dispatchEvent(new Event('input'));}
  function key(key,extra={}){const event={type:'keydown',key,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};input.dispatchEvent(event);return event;}
  return {input,form,state,calls,advance,type,key,document,window,documentEvents,windowEvents,mutate:()=>observers[0].callback([])};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};

test('Пустое поле и ввод короче трех символов не вызывают генерацию',()=>{
  const f=fixture();f.advance(2000);assert.equal(f.calls.length,0);f.type('  а ');f.advance(2000);assert.equal(f.calls.length,0);assert.equal(f.state.layer.hidden,true);assert.equal(f.state.hint.hidden,true);
});
test('Быстрый набор делает один запрос после 700 мс паузы',()=>{
  const f=fixture();f.type('При');f.advance(500);f.type('Привет');f.advance(699);assert.equal(f.calls.length,0);f.advance(1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/compose');assert.deepEqual(f.calls[0].body,{prefix:'Привет'});
});
test('Устаревший ответ не появляется после изменения текста, запрос отменяется',async()=>{
  const f=fixture();f.type('Привет');f.advance(700);f.type('Сегодня');assert.equal(f.calls[0].signal.aborted,true);f.advance(700);assert.equal(f.calls.length,2);
  f.calls[0].resolve({completion:' старое продолжение'});await settle();assert.equal(f.state.layer.hidden,true);
  f.calls[1].resolve({completion:' хорошая погода'});await settle();assert.equal(f.state.prefixNode.textContent,'Сегодня');assert.equal(f.state.suffixNode.textContent,' хорошая погода');assert.equal(f.state.layer.hidden,false);
});
test('Tab принимает только показанное продолжение и вызывает обычный input без отправки',async()=>{
  const f=fixture();let draft='',submits=0;f.input.addEventListener('input',()=>{draft=f.input.value;});f.form.addEventListener('submit',()=>submits++);
  f.type('Сегодня');f.advance(700);f.calls[0].resolve({completion:' чувствую себя хорошо'});await settle();
  assert.equal(f.state.hint.hidden,false);const event=f.key('Tab');assert.equal(event.defaultPrevented,true);assert.equal(f.input.value,'Сегодня чувствую себя хорошо');assert.equal(draft,f.input.value);assert.equal(f.input.selectionStart,f.input.value.length);assert.equal(submits,0);assert.equal(f.state.hint.hidden,true);
});
test('Tab без подсказки и Shift+Tab сохраняют обычное поведение',async()=>{
  const f=fixture();assert.equal(f.key('Tab').defaultPrevented,false);f.type('Сегодня');f.advance(700);f.calls[0].resolve({completion:' хорошая погода'});await settle();assert.equal(f.key('Tab',{shiftKey:true}).defaultPrevented,false);assert.equal(f.input.value,'Сегодня');
});
test('Enter не принимает продолжение и не мешает существующему обработчику отправки',async()=>{
  const f=fixture();let sent='';f.input.addEventListener('keydown',event=>{if(event.key==='Enter')sent=f.input.value;});f.type('Сегодня');f.advance(700);f.calls[0].resolve({completion:' хорошая погода'});await settle();
  assert.equal(f.key('Enter').defaultPrevented,false);assert.equal(sent,'Сегодня');assert.equal(f.state.layer.hidden,true);
});
test('Escape скрывает подсказку и отменяет текущий запрос',async()=>{
  const f=fixture();f.type('Сегодня');f.advance(700);assert.equal(f.key('Escape').defaultPrevented,true);assert.equal(f.calls[0].signal.aborted,true);f.calls[0].resolve({completion:' хорошая погода'});await settle();assert.equal(f.state.layer.hidden,true);f.input.dispatchEvent(new Event('focus'));f.advance(1000);assert.equal(f.calls.length,1);
});
test('Составной ввод IME не вызывает запросов и не перехватывает Tab',async()=>{
  const f=fixture();f.input.dispatchEvent(new Event('compositionstart'));f.type('Сегодня');f.advance(1000);assert.equal(f.calls.length,0);assert.equal(f.key('Tab',{isComposing:true}).defaultPrevented,false);
  f.input.dispatchEvent(new Event('compositionend'));f.advance(700);assert.equal(f.calls.length,1);f.calls[0].resolve({completion:' хорошая погода'});await settle();assert.equal(f.state.layer.hidden,false);
});
test('Каретка внутри текста, выделение и скрытое или занятое поле не генерируют подсказок',()=>{
  for(const change of [f=>f.input.setSelectionRange(1,1),f=>f.input.setSelectionRange(0,f.input.value.length),f=>{f.input.disabled=true;},f=>{f.form.hidden=true;},f=>{f.input.visible=false;},f=>{f.input.dataset.activityArea='diary';}]){
    const f=fixture();f.type('Сегодня');change(f);f.advance(700);assert.equal(f.calls.length,0);
  }
});
test('Ошибка сервиса оставляет текст редактируемым и не блокирует следующий запрос',async()=>{
  const f=fixture();f.type('Сегодня');f.advance(700);f.calls[0].reject(new Error('assistant_unavailable'));await settle();assert.equal(f.input.value,'Сегодня');assert.equal(Boolean(f.input.disabled),false);assert.equal(f.state.layer.hidden,true);
  f.type('Сегодня я');f.advance(700);assert.equal(f.calls.length,2);f.calls[1].resolve({completion:' отдыхаю'});await settle();assert.equal(f.state.suffixNode.textContent,' отдыхаю');
});
test('Переносы, пробелы, шрифт и прокрутка передаются визуальному слою без изменения ввода',async()=>{
  const f=fixture();f.type('Сегодня\n  я');f.advance(700);f.calls[0].resolve({completion:' отдыхаю'});await settle();assert.equal(f.state.prefixNode.textContent,'Сегодня\n  я');assert.equal(f.state.layer.style.fontSize,'13px');assert.equal(f.state.layer.style.paddingLeft,'4px');assert.equal(f.state.layer.style.width,'300px');
  f.input.scrollTop=17;f.input.scrollLeft=3;f.input.dispatchEvent(new Event('scroll'));assert.equal(f.state.layer.scrollTop,17);assert.equal(f.state.layer.scrollLeft,3);
});
test('Подсказка отбрасывается после потери фокуса или переключения контекста',async()=>{
  const f=fixture();f.type('Сегодня');f.advance(700);f.document.activeElement=null;f.input.dispatchEvent(new Event('blur'));f.calls[0].resolve({completion:' хорошая погода'});await settle();assert.equal(f.state.layer.hidden,true);
  f.document.activeElement=f.input;f.type('Сегодня я');f.advance(700);f.input.dataset.activityArea='diary';f.mutate();assert.equal(f.calls[1].signal.aborted,true);f.calls[1].resolve({completion:' отдыхаю'});await settle();assert.equal(f.state.layer.hidden,true);
});
test('Длинный кириллический черновик передается целиком, принятие не превышает maxlength',async()=>{
  const long=fixture();long.type('я'.repeat(4100));long.advance(700);assert.equal(long.calls.length,1);assert.equal(long.calls[0].body.prefix.length,4100);
  const f=fixture();f.input.maxLength=12;f.type('Сегодня');f.advance(700);f.calls[0].resolve({completion:' хорошая погода'});await settle();f.key('Tab');assert.equal(f.input.value,'Сегодня хоро');assert.equal(f.input.value.length,12);
});
