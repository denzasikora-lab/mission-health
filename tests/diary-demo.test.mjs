import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../public/diary-demo.js',import.meta.url),'utf8');
function fixture(){
  const elements=new Map(),events=new Map(),changes=[];let options,plays=0,pauses=0,pending;
  const element=id=>{
    if(!elements.has(id)){
      const handlers=new Map();
      elements.set(id,{dataset:{phase:'idle'},hidden:true,disabled:false,value:'orbit',currentTime:1.5,
        getAttribute(name){return this[name]??null;},addEventListener(type,handler){handlers.set(type,handler);},
        dispatchEvent(event){changes.push([id,event.type]);handlers.get(event.type)?.(event);},
        play(){plays++;return pending||Promise.resolve();},pause(){pauses++;},
        emit(type){handlers.get(type)?.({type});}});
    }
    return elements.get(id);
  };
  const document={hidden:false,documentElement:{lang:'en'},getElementById:element,addEventListener:(type,handler)=>events.set(type,handler)};
  const window={missionKonstaDiaryDemo:{mount(_host,value){options=value;}},addEventListener:(type,handler)=>events.set(type,handler),scrollTo(){throw new Error('Demo must not move the page');}};
  vm.runInNewContext(script,{document,window,Event,MutationObserver:class{observe(){}},fetch(){throw new Error('Preview must not upload or analyze NASA footage as personal data');}});
  return{element,events,changes,document,get options(){return options;},get plays(){return plays;},get pauses(){return pauses;},pending(value){pending=value;}};
}

test('Demo toggles the NASA loop in the existing block with Laboratory selected',async()=>{
  const f=fixture(),clip=f.element('video-log-demo');
  await f.options.onClick();
  assert.equal(f.element('video-log-background').value,'lab');assert.equal(clip.currentTime,0);
  assert.equal(clip.src,'/assets/diary-demo/nasa-dominick-lab-2s.mp4');assert.equal(clip.hidden,false);
  assert.equal(f.element('diary-demo-source').hidden,false);assert.equal(f.plays,1);assert.equal(f.options.playing,true);
  await f.options.onClick();assert.equal(f.options.playing,false);assert.equal(clip.hidden,true);assert.equal(f.element('diary-demo-source').hidden,true);
  clip.currentTime=1;await f.options.onClick();assert.equal(clip.currentTime,0);assert.equal(f.plays,2);assert.equal(clip.hidden,false);
});
test('Camera use and leaving the diary stop and hide the preview',async()=>{
  const f=fixture();await f.options.onClick();f.element('video-log-camera').emit('click');
  assert.equal(f.element('video-log-demo').hidden,true);assert.equal(f.element('diary-demo-source').hidden,true);
  await f.options.onClick();f.events.get('mission-diary-close')();assert.equal(f.element('video-log-demo').hidden,true);
  await f.options.onClick();f.document.hidden=true;f.events.get('visibilitychange')();assert.equal(f.element('video-log-demo').hidden,true);assert.equal(f.options.playing,false);
});
test('Demo never interrupts an active or pending camera session',async()=>{
  const f=fixture();
  for(const phase of ['requesting','live','recording','finishing']){f.element('video-log-camera').dataset.phase=phase;await f.options.onClick();}
  assert.equal(f.plays,0);assert.equal(f.changes.length,0);
});
test('A late play result cannot pause a newer preview',async()=>{
  const f=fixture();let resolve;f.pending(new Promise(done=>{resolve=done;}));const first=f.options.onClick();
  await f.options.onClick();f.pending(null);await f.options.onClick();const pauses=f.pauses;resolve();await first;
  assert.equal(f.pauses,pauses);assert.equal(f.element('video-log-demo').hidden,false);
});
test('A playback failure restores the original block and shows a retryable notice',async()=>{
  const f=fixture();f.pending(Promise.reject(new Error('decode_failed')));await f.options.onClick();
  assert.equal(f.element('video-log-demo').hidden,true);assert.equal(f.element('diary-demo-source').hidden,true);
  assert.equal(f.element('video-log-notice').dataset.error,'true');assert.match(f.element('video-log-notice').textContent,/Try again/);
});
test('The embedded public NASA clip keeps its source, exact excerpt and silent inline playback',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const metadata=JSON.parse(await readFile(new URL('../public/assets/diary-demo/source.json',import.meta.url),'utf8'));
  assert.equal(metadata.sourceUrl,'https://www.youtube.com/shorts/FKsghZt8bLs');assert.equal(metadata.sourceStartSeconds,5);
  assert.equal(metadata.sourceEndSeconds,7);assert.equal(metadata.durationSeconds,2);assert.equal(metadata.frameCount,48);
  assert.match(html,/id="video-log-demo"[^>]*playsinline muted loop preload="none"[^>]*hidden/);
  assert.match(html,/href="https:\/\/www.youtube.com\/shorts\/FKsghZt8bLs"/);
});
