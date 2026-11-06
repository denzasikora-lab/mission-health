import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/home-trends.js',import.meta.url),'utf8');
class Node{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.style={};this.hidden=false;this.textContent='';this.className='';this.parent=null;}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  after(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,node);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(key,value){this.attributes[key]=String(value);if(key==='class')this.className=String(value);}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  emit(type,event={}){for(const callback of this.events[type]||[])callback({type,target:this,...event});}
  matches(selector){if(selector==='[data-home-metric]')return Boolean(this.dataset.homeMetric);if(selector==='[data-trend-period]')return Boolean(this.dataset.trendPeriod);if(selector[0]==='.')return this.className.split(' ').includes(selector.slice(1));return this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
  getClientRects(){return this.hidden||this.parent&&!this.parent.getClientRects().length?[]:[{}];}
}
function fixture(){
  let now=120000,id=0;
  const timers=new Map(),observers=[],body=new Node('body'),home=new Node('section'),bodyPanel=new Node('section');
  home.id='mission-home';bodyPanel.className='home-body-panel';body.append(home);home.append(bodyPanel);
  const cards=new Map();
  for(const [key,raw,kind]of [['hr','72','demo'],['spo2','98','demo'],['wellbeing','80','self_report'],['activity','66218','imported']]){
    const card=new Node('article'),number=new Node('strong');card.dataset={homeMetric:key,source:kind};number.textContent=raw;card.append(number);bodyPanel.append(card);cards.set(key,card);
  }
  const document={body,hidden:false,createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag),getElementById:key=>key==='mission-home'?home:body.querySelectorAll('section').find(node=>node.id===key),events:{},addEventListener(type,callback){(this.events[type]||=[]).push(callback);}};
  const window={events:{},addEventListener(type,callback){(this.events[type]||=[]).push(callback);}};
  const setTimeout=(callback,delay)=>{timers.set(++id,{callback,at:now+delay});return id;},clearTimeout=key=>timers.delete(key);
  class FakeDate extends Date{static now(){return now;}}
  class Observer{constructor(callback){this.callback=callback;this.observations=[];observers.push(this);}observe(target,options){this.observations.push({target,options});}disconnect(){this.observations=[];}}
  const sandbox={window,document,Date:FakeDate,Intl,MutationObserver:Observer,setTimeout,clearTimeout,requestAnimationFrame:callback=>setTimeout(callback,16),cancelAnimationFrame:clearTimeout};
  // Доступ к рассчитанным точкам нужен для проверки общего участка двух соседних окон.
  vm.runInNewContext(source.replace('window.missionHomeTrends={refresh}', 'window.missionHomeTrends={refresh,demoSeries}'),sandbox);
  const panel=home.querySelector('.home-trends'),controls=panel.querySelector('.home-trend-periods'),svg=panel.querySelector('svg');
  function advance(milliseconds){const end=now+milliseconds;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();}now=end;}
  function mutate(target,attribute){for(const observer of observers){if(observer.observations.some(item=>item.target===target&&(!attribute||item.options.attributeFilter?.includes(attribute))))observer.callback([]);}}
  function emit(target,type,event={}){for(const callback of target.events[type]||[])callback({type,...event});}
  const period=value=>controls.emit('click',{target:controls.children.find(node=>node.dataset.trendPeriod===value)});
  const select=key=>cards.get(key).emit('click');
  const path=()=>svg.querySelector('.home-trend-line')?.attributes.d||null;
  return {window,document,home,cards,panel,svg,timers,period,select,path,advance,mutate,emit,api:window.missionHomeTrends};
}

test('Минутный график меняется по времени, а общий участок соседних окон сохраняется',()=>{
  const f=fixture();f.period('1m');
  const first=f.path(),points=Array.from(f.api.demoSeries('hr',72,'1m').points);
  f.advance(999);assert.equal(f.path(),first);f.advance(1);assert.notEqual(f.path(),first);
  const moved=Array.from(f.api.demoSeries('hr',72,'1m').points);
  assert.equal(moved.length,61);assert.deepEqual(moved.slice(0,-1),points.slice(1));
  const current=f.path();f.api.refresh();assert.equal(f.path(),current);assert.equal(f.timers.size,1);
  assert.match(f.panel.querySelector('.home-trend-source').textContent,/Демо.*1 с/);
});

test('Другие периоды остаются статичными и не запускают секундный таймер',()=>{
  const f=fixture(),initial=f.path();f.advance(10000);assert.equal(f.path(),initial);assert.equal(f.timers.size,0);
  f.period('1m');f.advance(1000);f.period('1h');const hourly=f.path();assert.equal(f.timers.size,0);
  f.advance(10000);f.api.refresh();assert.equal(f.path(),hourly);
});

test('Скрытие страницы останавливает обновления, возврат продолжает временную шкалу',()=>{
  const f=fixture();f.period('1m');const initial=f.path();
  f.document.hidden=true;f.emit(f.document,'visibilitychange');assert.equal(f.timers.size,0);
  f.advance(10000);assert.equal(f.path(),initial);
  f.document.hidden=false;f.emit(f.document,'visibilitychange');f.advance(16);assert.notEqual(f.path(),initial);assert.equal(f.timers.size,1);
});

test('Уход из раздела здоровья отменяет таймер и ожидающее обновление',()=>{
  const f=fixture();f.period('1m');const initial=f.path();
  f.mutate(f.cards.get('hr').querySelector('strong'));assert.equal(f.timers.size,2);
  f.home.hidden=true;f.mutate(f.home,'hidden');assert.equal(f.timers.size,0);
  f.advance(5000);assert.equal(f.path(),initial);
  f.home.hidden=false;f.mutate(f.home,'hidden');f.advance(16);assert.notEqual(f.path(),initial);assert.equal(f.timers.size,1);
});

test('Самооценка и импортированные показатели не получают выдуманную минутную историю',()=>{
  const f=fixture();f.period('1m');
  for(const key of ['wellbeing','activity']){
    f.select(key);assert.equal(f.path(),null);assert.equal(f.timers.size,0);assert.equal(f.panel.dataset.trendMetric,key);
    assert.match(f.panel.querySelector('.home-trend-empty').textContent,/Нет потока измерений/);
    const raw=f.cards.get(key).querySelector('strong').textContent;
    f.advance(6000);assert.equal(f.cards.get(key).querySelector('strong').textContent,raw);assert.equal(f.path(),null);
  }
  f.cards.get('activity').querySelector('strong').textContent='67200';f.mutate(f.cards.get('activity').querySelector('strong'));f.advance(16);
  assert.equal(f.path(),null);assert.equal(f.panel.querySelector('.home-trend-reading').textContent,'67200');assert.equal(f.timers.size,0);
});

test('Переключение метрики сохраняет выбор и оставляет только один таймер',()=>{
  const f=fixture();f.period('1m');const pulse=f.path();f.select('spo2');assert.equal(f.panel.dataset.trendMetric,'spo2');assert.notEqual(f.path(),pulse);assert.equal(f.timers.size,1);
  const oxygen=f.path();f.advance(1000);assert.notEqual(f.path(),oxygen);assert.equal(f.panel.dataset.trendMetric,'spo2');assert.equal(f.timers.size,1);
  f.select('hr');assert.equal(f.panel.dataset.trendMetric,'hr');assert.notEqual(f.path(),pulse);assert.equal(f.timers.size,1);
});

test('Смена источника с демонстрационного на настоящий прекращает синтетический поток',()=>{
  const f=fixture();f.period('1m');const card=f.cards.get('hr');card.dataset.source='imported';f.mutate(card,'data-source');f.advance(16);
  assert.equal(f.path(),null);assert.equal(f.timers.size,0);f.advance(5000);assert.equal(f.path(),null);
});

test('Уход со страницы отменяет таймер, восстановление из кеша возобновляет его',()=>{
  const f=fixture();f.period('1m');const initial=f.path();f.emit(f.window,'pagehide',{persisted:true});assert.equal(f.timers.size,0);
  f.advance(4000);assert.equal(f.path(),initial);f.emit(f.window,'pageshow');f.advance(16);assert.notEqual(f.path(),initial);assert.equal(f.timers.size,1);
});
