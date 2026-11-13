import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/stories.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const crew=[
  {id:'jessica-meir',name:'Jessica Meir',photo:'/jessica.jpg'},
  {id:'jack-hathaway',name:'Jack Hathaway',photo:'/jack.jpg'},
  {id:'christina-koch',name:'Christina Koch',photo:'/christina.jpg'}
];
const archived=(profile,id)=>({id,profile,title:id,image:'/'+id+'.jpg',credit:'NASA',source:'https://images.nasa.gov/'+id,createdAt:'2026-01-01T00:00:00Z'});
const archive=[archived(crew[0].id,'jessica-1'),archived(crew[0].id,'jessica-2'),archived(crew[1].id,'jack-1'),archived(crew[2].id,'christina-1'),archived(crew[2].id,'christina-2')];
const personal=(id,kind='photo')=>({id,kind,url:'/'+id+(kind==='video'?'.mp4':'.jpg'),poster:'/poster.jpg',author:'Alex Morgan',caption:id,createdAt:'2026-01-01T00:00:00Z',duration:2});

class Node{
  constructor(tag,document){this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.attributes={};this.dataset={};this.style={};this.events={};this._text='';this.hidden=false;this.disabled=false;this.value='';this.open=false;this.currentTime=0;this.duration=2;this.paused=true;}
  set id(value){this.attributes.id=value;this.document.ids.set(value,this);}
  get id(){return this.attributes.id||'';}
  set className(value){this.attributes.class=value;}
  get className(){return this.attributes.class||'';}
  get classList(){return {add:value=>{if(!this.className.split(/\s+/).includes(value))this.className=(this.className+' '+value).trim();},contains:value=>this.className.split(/\s+/).includes(value)};}
  get firstChild(){return this.children[0];}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  set innerHTML(html){
    this.children=[];const stack=[this];
    for(const match of html.matchAll(/<\/?([a-z0-9-]+)([^>]*)>/gi)){
      const [token,tag,attrs]=match;if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
      const child=this.document.createElement(tag);
      for(const part of attrs.matchAll(/([a-z0-9-]+)(?:="([^"]*)")?/gi))child.setAttribute(part[1],part[2]??'');
      stack.at(-1).append(child);if(!['input','img','br','hr','meta','link'].includes(tag))stack.push(child);
    }
  }
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this._text='';this.append(...nodes);}
  before(node){if(this.parent){const i=this.parent.children.indexOf(this);node.parent=this.parent;this.parent.children.splice(i,0,node);}}
  after(node){if(this.parent){const i=this.parent.children.indexOf(this);node.parent=this.parent;this.parent.children.splice(i+1,0,node);}}
  setAttribute(name,value){if(name==='id')this.id=String(value);else this.attributes[name]=String(value);if(name==='hidden')this.hidden=true;}
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];if(name==='src')this.src='';}
  matches(selector){if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);const attr=selector.match(/^\[([^=]+)="([^"]*)"\]$/);return attr?this.getAttribute(attr[1])===attr[2]:this.tagName.toLowerCase()===selector;}
  querySelectorAll(selector){return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
  dispatchEvent(event){event.target||=this;event.preventDefault||=()=>{};for(const handler of this.events[event.type]||[])handler(event);}
  click(){if(!this.disabled)this.dispatchEvent({type:'click'});}
  showModal(){this.open=true;}
  close(){if(!this.open)return;this.open=false;this.dispatchEvent({type:'close'});}
  pause(){this.paused=true;}
  play(){this.paused=false;return Promise.resolve();}
  load(){}
  scrollIntoView(){}
}
async function fixture({mine=[],items=archive}={}){
  let now=0,frameId=0;const frames=new Map();
  const document={ids:new Map(),hidden:false,events:{},createElement(tag){return new Node(tag,this);},getElementById(id){return this.ids.get(id);},querySelector(selector){return this.body.querySelector(selector);},addEventListener(type,handler){(this.events[type]||=[]).push(handler);}};
  document.body=document.createElement('body');const rail=document.createElement('aside'),nav=document.createElement('nav');nav.className='mission-nav';rail.append(nav);document.body.append(rail);
  const window={missionDesign:{rail},missionProfileName:{name:'Alex Morgan',load:async()=>({name:'Alex Morgan',researcherId:'test'})},missionStoryTags:{mount:()=>({reset(){},flush(){}}),generate:()=>[],suggest:async()=>[]},missionStoryHealth:{render(){},snapshot:()=>({})},events:{},addEventListener(type,handler){(this.events[type]||=[]).push(handler);},dispatchEvent(){}};
  const scope={window,document,crew,Intl,Date,Map,Event,performance:{now:()=>now},requestAnimationFrame:handler=>{frames.set(++frameId,handler);return frameId;},cancelAnimationFrame:id=>frames.delete(id),fetch:async path=>({ok:true,json:async()=>path==='/api/stories'?{stories:mine}:{items}}),setTimeout,clearTimeout,setInterval,clearInterval};
  vm.runInNewContext(source,scope);await settle();
  const viewer=document.getElementById('story-viewer'),row=document.querySelector('.stories-row'),media=viewer.querySelector('.story-view-media'),progress=viewer.querySelector('.story-progress');
  const current=()=>media.children[0];
  const ready=()=>{const node=current();if(node?.tagName==='VIDEO')node.onloadeddata?.();else node?.onload?.();};
  function advance(ms){for(let remaining=ms;remaining>0;){const step=Math.min(100,remaining);now+=step;remaining-=step;const pending=[...frames.values()];frames.clear();for(const handler of pending)handler(now);}}
  return {document,viewer,row,media,progress,frames,current,ready,advance,open:index=>row.children[index].children[0].click(),next:()=>viewer.querySelector('.next').click(),prev:()=>viewer.querySelector('.prev').click(),key:key=>viewer.dispatchEvent({type:'keydown',key}),pause:()=>document.getElementById('story-pause').click(),close:()=>document.getElementById('story-close').click(),title:()=>document.getElementById('story-view-title').textContent,author:()=>document.getElementById('story-view-author').textContent};
}

test('The selected profile opens at its first story, moving forward reaches the next person',async()=>{
  const f=await fixture();f.open(2);assert.equal(f.author(),'Jack Hathaway');assert.equal(f.title(),'jack-1');f.next();assert.equal(f.author(),'Christina Koch');assert.equal(f.title(),'christina-1');assert.equal(f.viewer.open,true);
});

test('Without personal stories, the feed cycles through three profiles and returns to the first',async()=>{
  const f=await fixture();f.open(1);const titles=[];for(let i=0;i<6;i++){titles.push(f.title());f.next();}
  assert.deepEqual(titles,['jessica-1','jessica-2','jack-1','christina-1','christina-2','jessica-1']);assert.equal(f.viewer.open,true);assert.equal(f.viewer.querySelector('.next').getAttribute('aria-label'),'Next story');
});

test('Moving back from the feed start opens the previous profile’s final story',async()=>{
  const f=await fixture();f.open(1);f.prev();assert.equal(f.title(),'christina-2');f.prev();assert.equal(f.title(),'christina-1');f.key('ArrowLeft');assert.equal(f.title(),'jack-1');f.key('ArrowRight');assert.equal(f.title(),'christina-1');
});

test('Personal stories join the forward and backward cycle without gaps',async()=>{
  const f=await fixture({mine:[personal('mine-1'),personal('mine-2')]});f.open(0);assert.equal(f.current().src,'/mine-1.jpg');f.next();assert.equal(f.current().src,'/mine-2.jpg');f.next();assert.equal(f.title(),'jessica-1');f.prev();assert.equal(f.current().src,'/mine-2.jpg');f.prev();f.prev();assert.equal(f.title(),'christina-2');f.next();assert.equal(f.current().src,'/mine-1.jpg');assert.equal(f.author(),'Astronaut');assert.equal(f.row.children[0].children[0].title,'My story');
});

test('Progress stays within the current author and resets for the next one',async()=>{
  const f=await fixture();f.open(1);assert.equal(f.progress.children.length,2);f.next();assert.equal(f.progress.children[0].firstChild.style.width,'100%');f.next();assert.equal(f.title(),'jack-1');assert.equal(f.progress.children.length,1);assert.notEqual(f.progress.children[0].firstChild.style.width,'100%');f.next();assert.equal(f.progress.children.length,2);
});

test('Automatic photo progression crosses profile boundaries, pausing and closing stop playback',async()=>{
  const f=await fixture();f.open(1);f.next();f.ready();f.pause();f.advance(8000);assert.equal(f.title(),'jessica-2');f.pause();f.advance(7000);assert.equal(f.title(),'jack-1');f.ready();f.close();assert.equal(f.frames.size,0);f.advance(8000);assert.equal(f.viewer.open,false);assert.equal(f.media.children.length,0);
});

test('Video ending advances once, late events from old videos do not change the current story',async()=>{
  const f=await fixture({mine:[personal('mine-video','video')]});f.open(0);f.ready();const video=f.current();video.currentTime=video.duration;f.advance(100);video.onended();assert.equal(f.title(),'jessica-1');video.onended();assert.equal(f.title(),'jessica-1');f.prev();const anotherVideo=f.current();f.next();anotherVideo.onended();assert.equal(f.title(),'jessica-1');
});

test('Empty profiles missingare skipped, a single story remains available cyclically',async()=>{
  const f=await fixture({items:[archive[2]]});assert.equal(f.row.children[1].children[0].disabled,true);f.open(2);f.next();assert.equal(f.title(),'jack-1');f.prev();assert.equal(f.title(),'jack-1');assert.equal(f.viewer.open,true);
});
