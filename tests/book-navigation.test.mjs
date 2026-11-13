import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const core=await readFile(new URL('../public/book-core.js',import.meta.url),'utf8'),source=await readFile(new URL('../public/book.js',import.meta.url),'utf8');
const archiveSource=await readFile(new URL('../public/archive-content.js',import.meta.url),'utf8'),preload=JSON.parse(await readFile(new URL('../public/data/archive-preload.json',import.meta.url),'utf8'));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const entry=(id,content='Entry text '+id)=>({id,content,createdAt:'2026-11-0'+id+'T12:00:00Z',attachments:[]});
class Node{
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.attributes={};this.dataset={};this.style={setProperty(key,value){this[key]=value;}};this.events={};this._text='';this.hidden=false;this.disabled=false;this._value='';this.open=false;this.captured=new Set();}
  set id(value){this.attributes.id=value;this.doc.ids.set(value,this);}get id(){return this.attributes.id||'';}
  set className(value){this.attributes.class=value;}get className(){return this.attributes.class||'';}
  get classList(){return {add:(...values)=>{this.className=[...new Set([...this.className.split(/\s+/),...values])].join(' ').trim();},contains:value=>this.className.split(/\s+/).includes(value)};}
  set value(value){this._value=value;}get value(){return this._value||this.tagName==='SELECT'&&this.children.find(node=>node.tagName==='OPTION')?.value||'';}
  get firstChild(){return this.children[0];}
  get clientWidth(){return this.id==='book-stage'||this.id==='book-spread'?this.doc.width:parseFloat(this.style.width)||this.parent?.clientWidth||this.doc.width;}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  set innerHTML(html){this.children=[];const stack=[this];for(const match of html.matchAll(/<\/?([a-z0-9-]+)([^>]*)>/gi)){const [token,tag,attrs]=match;if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}const node=this.doc.createElement(tag);for(const attr of attrs.matchAll(/([a-z0-9-]+)(?:="([^"]*)")?/gi))node.setAttribute(attr[1],attr[2]??'');stack.at(-1).append(node);if(!['input','img','br','hr','meta','link'].includes(tag))stack.push(node);}}
  append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
  prepend(node){node.remove();node.parent=this;this.children.unshift(node);}
  replaceChildren(...nodes){this.children.forEach(node=>node.parent=null);this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}}
  before(node){if(this.parent){node.remove();node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this),0,node);}}
  setAttribute(key,value){if(key==='id')this.id=String(value);else this.attributes[key]=String(value);if(key==='hidden')this.hidden=true;if(key==='value')this.value=String(value);}
  getAttribute(key){return this.attributes[key]??null;}
  matches(selector){if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));const pseudo=selector.match(/^(.*):(first|last)-child$/);if(pseudo)return this.matches(pseudo[1])&&this.parent?.children.at(pseudo[2]==='first'?0:-1)===this;if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);const attr=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return attr?attr[2]===undefined?this.attributes[attr[1]]!==undefined:this.getAttribute(attr[1])===attr[2]:this.tagName.toLowerCase()===selector;}
  querySelectorAll(selector){return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
  emit(type,event={}){event.target||=this;event.preventDefault||=()=>{event.prevented=true;};for(const handler of this.events[type]||[])handler(event);return event;}
  click(){if(!this.disabled)this.emit('click');}
  focus(){this.focused=true;}showModal(){this.open=true;}close(){if(this.open){this.open=false;this.emit('close');}}
  pause(){this.paused=true;}
  setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);this.emit('lostpointercapture',{pointerId:id});}
  cloneNode(deep){const node=this.doc.createElement(this.tagName);node.className=this.className;node._text=this._text;node.dataset={...this.dataset};node.attributes={...this.attributes};if(deep)node.append(...this.children.map(child=>child.cloneNode(true)));return node;}
  getBoundingClientRect(){
    const width=this.clientWidth;let height=50;
    if(this.classList.contains('book-page')){const body=this.querySelector('.book-page-text')?.textContent||'',columns=Math.max(1,Math.floor((width-42)/7)),lines=body.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/columns)),0);height=160+lines*22.4+this.querySelectorAll('.book-media').length*210;}
    return {left:0,top:0,width,height,right:width,bottom:height};
  }
}
async function fixture({entries=[entry('1'),entry('2'),entry('3')],width=390,older=[],withArchive=false}={}){
  let now=0,id=0,selection=false;const timers=new Map(),requests=[],observers=[],favoriteIds=[],identities=[];
  const doc={width,ids:new Map(),createElement(tag){return new Node(tag,this);},getElementById(key){return this.ids.get(key);},querySelector(selector){return this.body.querySelector(selector);},querySelectorAll(selector){return this.body.querySelectorAll(selector);}};
  doc.body=doc.createElement('body');const column=doc.createElement('main');column.className='main-column';doc.body.append(column);
  const window={innerHeight:900,location:{href:'https://mission.test/'},getComputedStyle:()=>({paddingLeft:'2px',paddingRight:'2px'}),getSelection:()=>({isCollapsed:!selection,anchorNode:doc.getElementById('book-spread'),focusNode:doc.getElementById('book-spread')}),events:{},addEventListener(type,handler){this.events[type]=handler;},missionDesign:{navigate(){}},scrollTo(){}};
  if(withArchive){window.missionAppearance={setIdentity:value=>identities.push(value)};window.missionCheckin={current:()=>({score:75,label:'Good'})};window.missionFavorites={button:item=>{favoriteIds.push(item.id);return doc.createElement('button');},badge:()=>doc.createElement('span')};}
  const state={workspace:'crew',view:'journal'},scope={window,document:doc,state,personalProfileId:'personal',crew:[],Intl,Date,URL,URLSearchParams,location:{search:''},performance:{now:()=>now},fetch:async()=>({ok:true,json:async()=>preload}),setTimeout:(handler,delay)=>{timers.set(++id,{handler,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),ResizeObserver:class{constructor(handler){observers.push(handler);}observe(){}},journalApi:async path=>{requests.push(path);if(path==='/api/me')return {storageScope:'a'.repeat(64)};if(path==='/api/actiwatch')return {latest:null};return {entries:path.includes('?cursor=')?older:entries,hasMore:!path.includes('?cursor=')&&older.length>0,cursor:'old',total:entries.length+older.length};}};
  vm.runInNewContext(core,scope);if(withArchive)vm.runInNewContext(archiveSource,scope);vm.runInNewContext(source,scope);await settle();
  const node=key=>doc.getElementById(key),spread=node('book-spread');
  function pointer(type,x,y,{target=spread,pointerType='touch',pointerId=1,...rest}={}){return spread.emit(type,{clientX:x,clientY:y,pointerType,pointerId,isPrimary:true,button:0,target,...rest});}
  return {node,spread,doc,window,entries,requests,favoriteIds,identities,open:()=>node('book-cover').click(),text:()=>spread.querySelectorAll('.book-page').filter(page=>page.getAttribute('aria-hidden')!=='true').map(page=>page.querySelector('.book-page-text')?.textContent||'').join('\n'),pointer,tap(x,target){pointer('pointerdown',x,40,{target});pointer('pointerup',x,40,{target});},swipe(dx,dy=0){pointer('pointerdown',width/2,100);pointer('pointermove',width/2+dx,100+dy);pointer('pointerup',width/2+dx,100+dy);},select:value=>selection=value,visible(value){state.view=value?'journal':'health';window.missionBook.render();},resize(value){doc.width=value;observers.forEach(handler=>handler());},advance(ms){now+=ms;for(const [key,value]of [...timers])if(value.at<=now){timers.delete(key);value.handler();}}};
}

test('Left and right page halves turn archive pages without bottom buttons',async()=>{
  const f=await fixture();f.open();assert.equal(f.text(),'Entry text 1');f.tap(350);assert.equal(f.text(),'Entry text 2');f.tap(25);assert.equal(f.text(),'Entry text 1');assert.equal(f.node('book-prev').parent.hidden,true);assert.equal(f.node('book-close-cover').parent.hidden,true);assert.equal(f.node('book-refresh').parent.hidden,true);assert.equal(f.node('book-position').parent.id,'mission-book');
});
test('A short horizontal swipe captures the pointer and turns the page, vertical movement preserves scrolling',async()=>{
  const f=await fixture();f.open();f.pointer('pointerdown',200,100);assert.equal(f.spread.hasPointerCapture(1),true);f.pointer('pointerup',160,101);assert.equal(f.text(),'Entry text 2');assert.equal(f.spread.hasPointerCapture(1),false);f.swipe(40,1);assert.equal(f.text(),'Entry text 1');f.swipe(-90,150);assert.equal(f.text(),'Entry text 1');assert.equal(f.spread.hasPointerCapture(1),false);
});
test('Links, buttons, text selection and long presses do not turn pages',async()=>{
  const f=await fixture();f.open();for(const tag of ['a','button','video','audio','input']){const node=f.doc.createElement(tag);f.spread.append(node);f.tap(350,node);assert.equal(f.text(),'Entry text 1');node.remove();}
  f.select(true);f.tap(350);assert.equal(f.text(),'Entry text 1');f.select(false);f.pointer('pointerdown',350,50,{pointerType:'mouse'});f.select(true);f.pointer('pointerup',350,50,{pointerType:'mouse'});assert.equal(f.text(),'Entry text 1');f.select(false);f.pointer('pointerdown',350,50);f.advance(600);f.pointer('pointerup',350,50);assert.equal(f.text(),'Entry text 1');
});
test('Pointer cancellation and a second finger do not turn pages, keyboard arrows remain available',async()=>{
  const f=await fixture();f.open();f.pointer('pointerdown',300,50);f.pointer('pointercancel',200,50);f.pointer('pointerup',200,50);assert.equal(f.text(),'Entry text 1');f.pointer('pointerdown',300,50);f.pointer('pointerup',250,50,{pointerId:2});assert.equal(f.text(),'Entry text 1');f.pointer('pointercancel',300,50);f.spread.emit('keydown',{key:'ArrowRight'});assert.equal(f.text(),'Entry text 2');f.spread.emit('keydown',{key:'ArrowLeft'});assert.equal(f.text(),'Entry text 1');
});
test('Pagination accounts for width and multiline text, the original entry remains unchanged',async()=>{
  const content=Array.from({length:95},(_,i)=>'Line '+i+' - observation.').join('\n'),original=entry('1',content),f=await fixture({entries:[original],width:350});f.open();assert.equal(f.entries[0].content,content);assert.ok(f.text().length<content.length);assert.ok(f.spread.querySelector('.book-page').getBoundingClientRect().height<=650);
  const first=f.text();f.tap(320);assert.notEqual(f.text(),first);f.resize(1000);assert.equal(f.spread.dataset.pages,2);assert.equal(f.entries[0].content,content);assert.ok(!f.spread.querySelector('.book-page-text').textContent.includes('\uFFFD'));
});
test('Turning back loads earlier entries without an extra button or losing current text',async()=>{
  const f=await fixture({entries:[entry('2'),entry('3')],older:[entry('1')]});f.open();assert.equal(f.text(),'Entry text 2');f.tap(20);await settle();assert.ok(f.requests.some(path=>path.includes('?cursor=')));assert.equal(f.text(),'Entry text 1');f.tap(350);assert.equal(f.text(),'Entry text 2');
});

test('Wide screens do not increase page capacity beyond the maximum spread width',async()=>{
  const content=Array.from({length:90},(_,i)=>'Observation '+i+': '+('a long line of text '.repeat(4))).join('\n');
  const normal=await fixture({entries:[entry('1',content)],width:1104}),wide=await fixture({entries:[entry('1',content)],width:1700});normal.open();wide.open();
  assert.equal(normal.spread.dataset.pages,2);assert.equal(wide.spread.dataset.pages,2);assert.equal(wide.text(),normal.text());
});

test('An empty personal archive includes preloaded video and audio, current results do not present them as personal measurements',async()=>{
  const f=await fixture({entries:[],withArchive:true});f.open();assert.ok(f.text().trim().length>0);assert.ok(f.spread.querySelector('video'));assert.equal(f.identities[0].name,'Cdr. Sara Khan');
  const kinds=new Set(),contents=[],positions=new Set();for(let i=0;i<100;i++){const position=f.node('book-position').textContent;if(positions.has(position))break;positions.add(position);contents.push(f.text());for(const media of f.spread.querySelectorAll('audio,video'))kinds.add(media.tagName);f.tap(350);}
  assert.deepEqual([...kinds].sort(),['AUDIO','VIDEO']);assert.ok(positions.size>=2);assert.ok(contents.some(text=>text.includes('No comparison')));assert.ok(contents.some(text=>text.includes('No personal recording saved yet')));assert.ok(!contents.join('\n').includes('"acoustic"'));assert.equal(f.favoriteIds.length,0);assert.match(f.node('book-position').textContent,/entries: 0/);
});

test('The player appears only in the first entry section, stops during page turns and when leaving the archive',async()=>{
  const value={...entry('1','Original text'),observation:{kind:'video',duration:12,mediaUrl:'/api/media-analysis/12345678-1234-1234-1234-123456789abc/media',transcript:'My speech. '.repeat(150),analysis:'Personal analysis',features:{acoustic:{level:-25,quiet:.1,clipping:0,seconds:12}},status:'analyzed'}},f=await fixture({entries:[value],withArchive:true});f.open();
  const first=f.spread.querySelector('video');first.paused=false;f.tap(350);assert.equal(first.paused,true);let found=false;
  for(let i=0;i<100;i++){const media=f.spread.querySelector('video');if(media?.src?.startsWith('/api/')){found=true;assert.ok(f.spread.querySelector('.book-page').children.indexOf(media)<f.spread.querySelector('.book-page').children.findIndex(node=>node.classList.contains('book-page-text')));media.paused=false;f.visible(false);assert.equal(media.paused,true);break;}const position=f.node('book-position').textContent;f.tap(350);if(position===f.node('book-position').textContent)break;}
  assert.equal(found,true);assert.ok(f.favoriteIds.every(id=>id==='1'));assert.equal(value.content,'Original text');const second=await fixture({entries:[],withArchive:true});second.open();const active=second.spread.querySelector('video');active.paused=false;second.window.events.pagehide();assert.equal(active.paused,true);
});
