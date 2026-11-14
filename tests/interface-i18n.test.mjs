import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/interface-i18n.js',import.meta.url),'utf8');
function fixture(initial='en'){
  const nodes=[],observers=[],frames=[],events=new Map();let writes=0,passes=0;
  const notify=record=>{for(const observer of observers)if(observer.active&&observer.options[record.type]!==false&&(record.type!=='attributes'||observer.options.attributes&&(!observer.options.attributeFilter||observer.options.attributeFilter.includes(record.attributeName))))observer.records.push(record);};
  class Node{
    constructor(selectors=[],text=''){this.selectors=selectors;this.nodeType=1;this.parentElement=null;this.children=[];this._text=text;this.attributes=new Map();this.value='';nodes.push(this);}
    matches(selector){return selector.split(',').some(part=>this.selectors.includes(part.trim()));}
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
    querySelector(selector){return nodes.find(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent===this)return node.matches(selector);return false;})||null;}
    append(node){node.parentElement=this;this.children.push(node);notify({type:'childList',target:this,addedNodes:[node]});}
    get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
    set textContent(value){writes++;for(const child of this.children)child.parentElement=null;this.children=[];this._text=String(value);notify({type:'childList',target:this,addedNodes:[]});}
    getAttribute(key){return this.attributes.get(key)??null;}
    setAttribute(key,value){writes++;this.attributes.set(key,String(value));notify({type:'attributes',target:this,attributeName:key});}
  }
  class Observer{
    constructor(callback){this.callback=callback;this.records=[];observers.push(this);}
    observe(_node,options){this.active=true;this.options=options;}
    disconnect(){this.active=false;this.records=[];}
  }
  const body=new Node(),html={lang:initial},document={body,documentElement:html,querySelectorAll:selector=>nodes.filter(node=>node.matches(selector))};
  const scope={document,MutationObserver:Observer,requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},console};scope.window=scope;
  scope.addEventListener=(type,callback)=>{const list=events.get(type)||[];list.push(callback);events.set(type,list);};
  const add=(selectors,text='',attributes={})=>{const node=new Node(Array.isArray(selectors)?selectors:[selectors],text);for(const [key,value]of Object.entries(attributes))node.attributes.set(key,value);node.parentElement=body;body.children.push(node);return node;};
  function flush(){
    let count=0;
    while(observers.some(observer=>observer.records.length)||frames.length){
      if(++count>20)throw new Error('Observer did not settle');
      for(const observer of observers){const records=observer.records.splice(0);if(records.length&&observer.active)observer.callback(records);}
      const batch=frames.splice(0);for(const callback of batch){passes++;callback();}
    }
  }
  const start=()=>{vm.runInNewContext(source,scope);flush();};
  const language=value=>{html.lang=value;for(const callback of events.get('mission-language-change')||[])callback();flush();};
  return {add,start,language,flush,scope,notify,body,get writes(){return writes;},get passes(){return passes;}};
}

test('Owned navigation and chat labels switch English to Urdu and restore the exact English labels',()=>{
  const f=fixture(),home=f.add('[data-mission-nav] > span','Home'),research=f.add('[data-mission-nav] > span','Research'),tab=f.add('[data-sidebar-tab]','Group chat'),caption=f.add('.personal-conversation-heading .personal-section-caption','Let’s talk'),send=f.add('.personal-composer button[type="submit"]','Send');
  f.start();assert.equal(home.textContent,'Home');f.language('ur');
  assert.equal(home.textContent,'مرکزی صفحہ');assert.equal(research.textContent,'تحقیق');assert.equal(tab.textContent,'گروپ چیٹ');assert.equal(caption.textContent,'آئیے بات کریں');assert.equal(send.textContent,'بھیجیں');
  f.language('en');assert.equal(home.textContent,'Home');assert.equal(research.textContent,'Research');assert.equal(tab.textContent,'Group chat');assert.equal(caption.textContent,'Let’s talk');assert.equal(send.textContent,'Send');
});

test('Messages, names, input values, numeric measurements and model analyses are never translated',()=>{
  const f=fixture(),message=f.add('.personal-message p','Send'),name=f.add('.personal-message header span','Home'),nameInput=f.add('.profile-name-form input'),analysis=f.add('.health-analysis-summary','Example'),full=f.add('.health-analysis-full-summary','Incomplete'),metric=f.add('.home-vital > strong','80 / 100'),unit=f.add('.home-vital-unit','bpm'),status=f.add('.health-analysis-status','CRITICAL'),unknown=f.add('.personal-composer button[type="submit"]','Custom action');nameInput.value='Hassan Ali';
  f.start();f.language('ur');assert.deepEqual([message.textContent,name.textContent,nameInput.value,analysis.textContent,full.textContent,metric.textContent,unit.textContent,status.textContent,unknown.textContent],['Send','Home','Hassan Ali','Example','Incomplete','80 / 100','bpm','CRITICAL','Custom action']);
  f.language('en');assert.equal(nameInput.value,'Hassan Ali');assert.equal(analysis.textContent,'Example');
});

test('Sample generation controls and source labels switch language without changing numeric readings',()=>{
  const f=fixture(),fill=f.add('.home-sample-button','LOAD READINGS',{title:'Load saved readings and imported device data'}),clear=f.add('.home-sample-clear','×',{'aria-label':'Clear generated sample',title:'Clear generated sample'}),note=f.add('.home-vital > small','Generated sample'),number=f.add('.home-vital > strong','98');f.start();f.language('ur');assert.equal(fill.textContent,'پیمائشیں لوڈ کریں');assert.equal(fill.getAttribute('title'),'محفوظ پیمائشیں اور آلے کا درآمد شدہ ڈیٹا لوڈ کریں');assert.equal(clear.textContent,'×');assert.equal(clear.getAttribute('aria-label'),'بنایا ہوا نمونہ ہٹائیں');assert.equal(note.textContent,'بنایا ہوا نمونہ');assert.equal(number.textContent,'98');f.language('en');assert.equal(fill.textContent,'LOAD READINGS');assert.equal(fill.getAttribute('title'),'Load saved readings and imported device data');assert.equal(clear.getAttribute('title'),'Clear generated sample');assert.equal(note.textContent,'Generated sample');
});

test('Async send, microphone and health retry labels are localized without mutation loops',()=>{
  const f=fixture('ur'),send=f.add('.personal-composer button[type="submit"]','Send'),mic=f.add('.chat-composer-tools button','',{'aria-label':'Voice input',title:'Voice input'}),health=f.add('.health-analysis-button','Analyze');f.start();
  assert.equal(mic.getAttribute('aria-label'),'آواز سے لکھیں');send.textContent='Waiting for an answer...';health.textContent='Retry analysis';mic.setAttribute('aria-label','Stop voice input');mic.setAttribute('title','Stop voice input');f.flush();
  assert.equal(send.textContent,'جواب کا انتظار ہے...');assert.equal(health.textContent,'دوبارہ تجزیہ کریں');assert.equal(mic.getAttribute('aria-label'),'آواز سے لکھنا بند کریں');assert.equal(mic.getAttribute('title'),'آواز سے لکھنا بند کریں');
  const writes=f.writes,passes=f.passes;f.flush();f.scope.missionInterfaceI18n.refresh();f.flush();assert.equal(f.writes,writes);assert.equal(f.passes,passes);
  f.language('en');assert.equal(send.textContent,'Waiting for an answer...');assert.equal(health.textContent,'Retry analysis');assert.equal(mic.getAttribute('aria-label'),'Stop voice input');
});

test('New owned controls are translated while unrelated content mutations schedule no work',()=>{
  const f=fixture('ur'),message=f.add('.personal-message p','Existing text');f.start();const passes=f.passes;message.textContent='Home';f.flush();assert.equal(f.passes,passes);
  const tab=f.add('[data-personal-tab]','Favorites');f.notify({type:'childList',target:f.body,addedNodes:[tab]});f.flush();assert.equal(tab.textContent,'پسندیدہ');assert.equal(f.passes,passes+1);
  f.language('en');assert.equal(tab.textContent,'Favorites');
});

test('Capture button display and accessible labels keep their changing state and child elements',()=>{
  const f=fixture('ur'),camera=f.add('#video-log-camera','Enable camera',{'aria-label':'Enable camera',title:'Enable camera','data-compact-label':'Camera'}),voice=f.add('#voice-mic','',{'data-compact-label':'Audio'}),span=f.add('#voice-mic > span','Start audio recording');span.parentElement=voice;voice.children.push(span);f.start();
  assert.equal(camera.textContent,'کیمرہ چلائیں');assert.equal(camera.getAttribute('data-compact-label'),'کیمرہ');assert.equal(span.textContent,'آڈیو ریکارڈنگ شروع کریں');assert.equal(voice.children[0],span);
  camera.textContent='Stop recording';camera.setAttribute('aria-label','Stop recording');camera.setAttribute('title','Stop recording');camera.setAttribute('data-compact-label','Stop');span.textContent='Stop audio recording';f.flush();assert.equal(camera.textContent,'ریکارڈنگ بند کریں');assert.equal(span.textContent,'آڈیو ریکارڈنگ بند کریں');
  f.language('en');assert.equal(camera.textContent,'Stop recording');assert.equal(camera.getAttribute('aria-label'),'Stop recording');assert.equal(camera.getAttribute('data-compact-label'),'Stop');assert.equal(span.textContent,'Stop audio recording');assert.equal(voice.children[0],span);
});

test('The existing recording label observer can synchronize Urdu labels without replacing compact captions or looping',()=>{
  const f=fixture(),camera=f.add('#video-log-camera','Enable camera',{'aria-label':'Enable camera',title:'Enable camera','data-compact-label':'Camera'}),voice=f.add('#voice-mic','',{'data-compact-label':'Audio'}),span=f.add('#voice-mic > span','Start audio recording');span.parentElement=voice;voice.children.push(span);
  const observer=new f.scope.MutationObserver(()=>{camera.setAttribute('aria-label',camera.textContent);camera.setAttribute('title',camera.textContent);camera.setAttribute('data-compact-label',{'Enable camera':'Camera','Stop recording':'Stop'}[camera.textContent]||camera.textContent);});observer.observe(camera,{childList:true,characterData:true,attributes:false});
  f.start();f.language('ur');assert.equal(camera.getAttribute('data-compact-label'),'کیمرہ');const passes=f.passes;f.flush();assert.equal(f.passes,passes);
  camera.textContent='Stop recording';f.flush();assert.equal(camera.textContent,'ریکارڈنگ بند کریں');assert.equal(camera.getAttribute('data-compact-label'),'بند کریں');f.language('en');assert.equal(camera.textContent,'Stop recording');assert.equal(camera.getAttribute('data-compact-label'),'Stop');
});

test('English restoration retains surrounding whitespace in owned labels',()=>{
  const f=fixture(),send=f.add('.personal-composer button[type="submit"]',' Send ');f.start();assert.equal(send.textContent,' Send ');f.language('ur');assert.equal(send.textContent,' بھیجیں ');f.language('en');assert.equal(send.textContent,' Send ');
});

test('Check-in labels preserve timestamps and never alter the chosen score',()=>{
  const f=fixture(),time=f.add('.wellbeing-time','Your score / 10:05'),readout=f.add('.wellbeing-readout > span','Good'),range=f.add('.wellbeing-range-shell input','',{'aria-label':'Your wellbeing from 1 to 100'});range.value='78';f.start();f.language('ur');
  assert.equal(time.textContent,'آپ کا اسکور / 10:05');assert.equal(readout.textContent,'اچھا');assert.equal(range.value,'78');
  time.textContent='Your score / 10:06';f.flush();assert.equal(time.textContent,'آپ کا اسکور / 10:06');f.language('en');assert.equal(time.textContent,'Your score / 10:06');assert.equal(readout.textContent,'Good');assert.equal(range.value,'78');
});

test('Urdu styles keep four chat tabs, wrap owned labels and isolate numeric values without remote fonts',async()=>{
  const css=await readFile(new URL('../public/interface-i18n.css',import.meta.url),'utf8');assert.match(css,/html\[lang=ur\]/);assert.match(css,/Noto Nastaliq Urdu/);assert.match(css,/\.personal-tabs\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);assert.match(css,/direction:ltr;unicode-bidi:isolate/);assert.match(css,/white-space:normal/);assert.doesNotMatch(css,/@import|https?:|font-face|flex-direction:column/);
});
