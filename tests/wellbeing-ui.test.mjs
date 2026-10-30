import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const source=await readFile(new URL('../public/personal-space.js',import.meta.url),'utf8');
const storySource=await readFile(new URL('../public/story-health.js',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
class Node{
  constructor(){this.children=[];this.dataset={};this.attributes={};this.properties={};this.selectors=new Map();this.events={};this.value='';this.classList={add:()=>{}};this.style={setProperty:(key,value)=>{this.properties[key]=value;}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  querySelector(selector){if(!this.selectors.has(selector))this.selectors.set(selector,new Node());return this.selectors.get(selector);}
  addEventListener(type,callback){this.events[type]=callback;}
  click(){this.events.click?.();}
  focus(){this.focused=true;}
}
function fixture(storage=new Map()){
  const calls=[],events=[],activity=[];
  const document={getElementById:()=>null,createElement:()=>new Node(),querySelectorAll:()=>[]};
  const window={dispatchEvent:event=>events.push(event.type),missionActivity:{record:(kind,details)=>activity.push({kind,...details}),refresh:()=>{}}};
  const sandbox={window,document,personalProfileId:'personal',Map,Set,Date,Intl,Event,crypto:webcrypto,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},loadJournal:()=>{},journalApi:async(path,options)=>{const body=options?.body?JSON.parse(options.body):undefined;calls.push({path,body});if(!body)return path==='/api/favorites'?{items:[],hasMore:false,cursor:null}:{messages:[],hasMore:false,cursor:null};return {message:{id:body.id,content:body.content,wellbeing:body.wellbeing},reply:null};}};
  // Инициализацию панелей отделяем от настоящих функций хранения, отправки и отображения.
  const setup=source.slice(0,source.indexOf('  const checkin=create('));
  vm.runInNewContext(setup+'window.test={choose,restoreScore,selection,currentReport,badge,canonicalReport,label,hue,store,send,retryChat,panel,setKind,setIdentity:value=>identity=value,addWidget:value=>sliders.push(value)};})();',sandbox);
  window.test.setIdentity({storageScope:'owner'});
  return {api:window.test,window,document,storage,calls,events,activity};
}
const key='mission-checkin:owner:personal';

test('Старая оценка 8/10 становится 80/100 и мигрирует только один раз',()=>{
  const storage=new Map([[key,JSON.stringify({score:8,at:Date.now()})]]),first=fixture(storage);first.api.restoreScore();
  assert.deepEqual(clone(first.api.currentReport()),{score:80,wellbeingScale:100});
  assert.equal(JSON.parse(storage.get(key)).wellbeingScale,100);
  const second=fixture(storage);second.api.restoreScore();assert.equal(second.api.currentReport().score,80);
});
test('Новая низкая оценка 8/100 остается 8/100 после перезагрузки',()=>{
  const first=fixture();first.api.choose(8);const second=fixture(first.storage);second.api.restoreScore();
  assert.deepEqual(clone(second.api.currentReport()),{score:8,wellbeingScale:100});
  assert.equal(second.api.label(second.api.currentReport().score),'Очень плохо');
});
test('Просроченная оценка и неизвестная шкала не загружаются',()=>{
  for(const saved of [{score:8,at:Date.now()-13*3600000},{score:8,wellbeingScale:5,at:Date.now()},{score:101,wellbeingScale:100,at:Date.now()},{score:8,wellbeingScale:100,at:'не дата'}]){
    const f=fixture(new Map([[key,JSON.stringify(saved)]]));f.api.restoreScore();assert.equal(f.api.currentReport(),null);
  }
});
test('Границы 1 и 100 доступны, дробные и выходящие за шкалу значения не выбираются',()=>{
  const f=fixture();f.api.choose(1);assert.equal(f.api.currentReport().score,1);f.api.choose(100);assert.equal(f.api.currentReport().score,100);
  for(const invalid of [0,101,1.5,'80',NaN])f.api.choose(invalid);
  assert.equal(f.api.currentReport().score,100);assert.equal(f.api.hue(1),0);assert.equal(f.api.hue(100),150);
  assert.deepEqual(clone(f.activity),[{kind:'wellbeing',score:1,wellbeingScale:100},{kind:'wellbeing',score:100,wellbeingScale:100}]);
});
test('Ползунок показывает актуальную оценку, цвет и доступную подпись из 100',()=>{
  const f=fixture(),widget={root:new Node(),input:new Node(),value:new Node(),label:new Node(),mouth:new Node(),time:new Node(),reset:new Node()};f.api.addWidget(widget);f.api.choose(76);
  assert.equal(widget.input.value,76);assert.equal(widget.value.textContent,'76 / 100');assert.equal(widget.label.textContent,'Хорошо');assert.equal(widget.input.attributes['aria-valuetext'],'76 из 100 / Хорошо');assert.equal(widget.root.properties['--mood-hue'],f.api.hue(76));assert.equal(widget.reset.hidden,false);
  f.api.choose(77);assert.notEqual(widget.mouth.attributes.d,'M7 14 Q12 20 17 14');assert.equal(widget.value.textContent,'77 / 100');
});
test('Старый бейдж сохраняет шкалу10, новый бейдж использует шкалу100',()=>{
  const f=fixture(),old=f.api.badge({score:8,label:'Хорошо'}),current=f.api.badge({score:80,label:'Хорошо',wellbeingScale:100});
  assert.equal(old.textContent,'8 / 10 · Хорошо');assert.equal(current.textContent,'80 / 100 · Хорошо');assert.equal(old.properties['--mood-hue'],current.properties['--mood-hue']);
});
test('Отправка в дневник и чат передает явную шкалу100',async()=>{
  for(const kind of ['diary','chat']){
    const f=fixture();f.api.choose(84);f.api.store(kind).draft='Запись для проверки';await f.api.send(kind);
    assert.deepEqual(clone(f.calls[0].body.wellbeing),{score:84,wellbeingScale:100});assert.equal(f.calls[0].path,kind==='chat'?'/api/chat':'/api/astronauts/personal/messages');
  }
});
test('Повтор запроса старого сообщения сохраняет его смысл 8/10 как80/100',async()=>{
  const f=fixture();await f.api.retryChat({id:'message',content:'Привет',wellbeing:{score:8}});
  assert.deepEqual(clone(f.calls[0].body.wellbeing),{score:80,wellbeingScale:100});
});
test('Сториз сохраняет новую шкалу, а архивная подпись8/10 не переписывается',()=>{
  const f=fixture();f.api.choose(82);f.window.missionCheckin={current:f.api.currentReport};vm.runInNewContext(storySource,{window:f.window,document:f.document,Intl,Date});
  const snapshot=f.window.missionStoryHealth.snapshot();assert.deepEqual(clone(snapshot.wellbeing),{score:82,wellbeingScale:100});
  for(const [wellbeing,expected]of [[{score:8},'Самочувствие: 8 / 10 · самооценка'],[{score:82,wellbeingScale:100},'Самочувствие: 82 / 100 · самооценка']]){
    const host=new Node();f.window.missionStoryHealth.render(host,{...snapshot,wellbeing});assert.ok(host.children.some(child=>child.textContent===expected));
  }
});
test('В окне записи доступны NasaGPT, Избранное и Запланировано, клавиатура переключает вкладки',()=>{
  const calls=[],compact=new Node(),sandbox={modalKind:'chat',compact,modalView:{},setKind:(_view,kind)=>calls.push(kind),create:(_tag,_class,text)=>{const node=new Node();node.textContent=text;return node;}};
  const start=source.indexOf("  const tabs=create('div','personal-tabs')"),end=source.indexOf('  checkin.append(tabs);',start);
  assert.ok(start>=0&&end>start);vm.runInNewContext(source.slice(start,end)+'globalThis.actualTabs=tabs;',sandbox);
  const tabs=sandbox.actualTabs;assert.deepEqual(Array.from(tabs.children,node=>node.textContent),['NasaGPT','Избранное','Запланировано']);
  assert.equal(tabs.children[0].attributes['aria-selected'],'true');assert.equal(sandbox.modalKind,'chat');
  tabs.children[0].events.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(sandbox.modalKind,'scheduler');assert.equal(tabs.children[2].focused,true);assert.equal(compact.attributes['aria-labelledby'],'media-personal-tab-scheduler');
  tabs.children[1].events.keydown({key:'Home',preventDefault(){}});assert.equal(sandbox.modalKind,'chat');assert.deepEqual(calls,['scheduler','chat']);
});
test('Избранное открывается внутри чата и возвращает несохраненный текст без перехода к книге',async()=>{
  const f=fixture(),host=new Node(),changes=[];f.api.store('chat').draft='Текст останется в чате';
  const view=f.api.panel(host,'chat',{favoriteShortcut:true,onKindChange:kind=>changes.push(kind)}),shortcut=host.querySelector('[data-personal-favorites]');
  assert.equal(shortcut.hidden,false);assert.equal(shortcut.textContent,'Избранное');shortcut.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(view.kind,'favorites');assert.equal(shortcut.textContent,'Назад в чат');assert.equal(view.form.hidden,true);
  shortcut.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(view.kind,'chat');assert.equal(view.input.value,'Текст останется в чате');assert.equal(view.form.hidden,false);
  assert.deepEqual(changes,['chat','favorites','chat']);assert.ok(f.calls.every(call=>!call.path.includes('/book')));
});
