import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/video-log.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
class Element{
  constructor(){this.dataset={};this.attributes={};this.children=[];this.style={};this.events=new Map();this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.classList={add(){}};}
  append(...children){for(const child of children)if(child&&typeof child==='object')child.parentNode=this;this.children.push(...children);}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}}
  setAttribute(key,value){this.attributes[key]=String(value);}
  removeAttribute(key){delete this.attributes[key];}
  addEventListener(key,callback){this.events.set(key,callback);}
  emit(key,event={}){this.events.get(key)?.(event);}
  focus(){}
  scrollIntoView(){this.scrolled=true;}
  pause(){}
  load(){}
  async play(){}
}
function track(kind){return{kind,readyState:'live',enabled:true,stopped:false,stop(){this.stopped=true;this.readyState='ended';},clone(){return track(kind);},addEventListener(){},getSettings(){return{};}};}
function media(){const tracks=[track('video'),track('audio')];return{tracks,getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==='audio'),getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),addTrack(t){tracks.push(t);}};}
function fixture({background='room',permission,profile,profileFetch,unsupported=false,analysisBusy=false,bitmapFailure=false,ageMetadata=null}={}){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  node('media-diary-dialog').open=true;node('video-log-background').value=background;
  const drawing=[],bitmaps=[],timeouts=new Map();let animation;
  const context=new Proxy({drawImage:(...args)=>drawing.push(args),createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});
  node('video-log-canvas').getContext=()=>context;
  Object.assign(node('video-log-canvas'),{width:1280,height:720});
  Object.assign(node('video-log-input'),{readyState:2,videoWidth:1280,videoHeight:720});
  const captured=[],recorders=[],workers=[],requests=[],locks=[],submissions=[],intervals=new Map(),windowEvents=new Map(),profileRequests=[],appearanceIdentities=[],hud=[];let timer=0,clock=0,engine;
  node('video-log-canvas').captureStream=()=>{const stream=media();stream.tracks.splice(1);captured.push(stream);return stream;};
  class CloneStream{constructor(tracks){this.tracks=tracks;captured.push(this);}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}}
  class Recorder{
    static isTypeSupported(){return !unsupported;}
    constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';this.starts=0;recorders.push(this);}
    start(){this.state='recording';this.starts++;}
    stop(){assert.equal(this.state,'recording');this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['video'],{type:this.mimeType})});this.onstop?.();});}
  }
  class BackgroundWorker{
    constructor(){workers.push(this);}
    postMessage(data){(this.messages||=[]).push(data);}
    terminate(){this.terminated=true;}
    emit(data){this.onmessage?.({data});}
  }
  const document={hidden:false,getElementById:node,createElement:()=>({getContext:()=>context}),querySelectorAll:()=>[],addEventListener(){}};
  const incoming=media(),storage=new Map();
  const window={MediaStream:CloneStream,missionMedia:{busy:()=>analysisBusy,meter:()=>({prepare(){},attach(){},stop(){}}),submit:(...args)=>submissions.push(args)},MediaRecorder:Recorder,Worker:BackgroundWorker,OffscreenCanvas:class{},createImageBitmap(){},addEventListener:(name,handler)=>windowEvents.set(name,handler),missionDiary:{get active(){return node('media-diary-dialog').open;},register(_mode,value){engine=value;},lock(_mode,value){locks.push(value);},open(){}},missionSpeech:{stop(){},reset(){},start(){}},missionAppearance:{stop(){},start(){},setIdentity:value=>appearanceIdentities.push(value),ageContext(){return{session:1};},ageSnapshot(){return ageMetadata;}},missionHelmet:{backdrop(){},portrait(){},hud:(_context,value)=>hud.push(value)}};
  class ClipURL extends URL{static createObjectURL(){return 'blob:recorded-clip';}static revokeObjectURL(){}}
  vm.runInNewContext(source,{document,window,createImageBitmap:async input=>{bitmaps.push(input);if(bitmapFailure)throw new Error('unsupported_video_bitmap');return{close(){}};},Image:class{},MediaStream:CloneStream,Worker:BackgroundWorker,MediaRecorder:Recorder,Blob,URL:ClipURL,URLSearchParams,location:{search:''},Intl,Date,performance:{now:()=>clock},navigator:{mediaDevices:{getUserMedia(options){requests.push(options);return permission?.promise||Promise.resolve(incoming);}}},fetch:(...args)=>{profileRequests.push(args);return profileFetch?profileFetch(...args):profile?.promise||Promise.resolve({ok:true,json:async()=>({researcherId:'local-test',storageScope:'owner-a',name:'Test participant'})});},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout:(callback,delay)=>{timeouts.set(++timer,{callback,at:clock+delay});return timer;},clearTimeout:id=>timeouts.delete(id),setInterval:callback=>{intervals.set(++timer,callback);return timer;},clearInterval:id=>intervals.delete(id),requestAnimationFrame:callback=>{animation=callback;return 1;},cancelAnimationFrame(){}});
  engine.enter();
  return{node,incoming,captured,recorders,workers,requests,locks,submissions,engine,bitmaps,drawing,profileRequests,appearanceIdentities,hud,profileChanged(identity){window.missionProfileName={identity};windowEvents.get('mission-profile-change')?.();},start:async()=>{node('video-log-camera').emit('click');await settle();},draw(time=100){animation(time);},advance(ms){clock+=ms;for(const callback of [...intervals.values()])callback();for(const [id,t] of [...timeouts])if(t.at<=clock){timeouts.delete(id);t.callback();}}};
}

test('Renaming NasaGPT preserves the Sara demo diary, HUD and camera analysis scope',async()=>{
  const identity={researcherId:'local-test',storageScope:'a'.repeat(64),name:'crown-bobby'},f=fixture({background:'helmet',profileFetch:async()=>({ok:true,json:async()=>identity})});
  await f.start();f.draw();const updates=f.appearanceIdentities.length;
  assert.equal(f.node('video-log-first-name').value,'Sara');assert.equal(f.node('video-log-last-name').value,'Khan');
  assert.equal(f.node('video-log-title').textContent,'Diary');assert.equal(f.node('video-log-researcher').value,'Cdr. Sara Khan');assert.equal(f.hud.at(-1).name,'Cdr. Sara Khan');assert.equal(f.appearanceIdentities.at(-1).storageScope,identity.storageScope);assert.equal(f.appearanceIdentities.at(-1).name,'Cdr. Sara Khan');
  f.profileChanged({...identity,name:'Another name for NasaGPT'});await settle();f.draw(200);
  assert.equal(f.profileRequests.length,1);assert.equal(f.appearanceIdentities.length,updates);assert.equal(f.node('video-log-title').textContent,'Diary');assert.equal(f.hud.at(-1).name,'Cdr. Sara Khan');assert.equal(f.recorders[0].state,'recording');assert.ok(f.incoming.getTracks().every(item=>!item.stopped));
});
test('Account switching releases the camera and rejects late profiles from the previous owner',async()=>{
  const first={researcherId:'first',storageScope:'a'.repeat(64),name:'First'},second={researcherId:'second',storageScope:'b'.repeat(64),name:'Second'},latest={researcherId:'latest',storageScope:'c'.repeat(64),name:'Third'},pendingSecond=deferred(),pendingLatest=deferred();let calls=0;
  const f=fixture({profileFetch:()=>++calls===1?Promise.resolve({ok:true,json:async()=>first}):calls===2?pendingSecond.promise:pendingLatest.promise});
  await f.start();f.profileChanged(second);assert.equal(f.recorders[0].state,'inactive');assert.ok(f.incoming.getTracks().every(item=>item.stopped));assert.equal(f.appearanceIdentities.at(-1),null);await settle();
  f.profileChanged(latest);assert.equal(f.profileRequests.length,3);pendingLatest.resolve({ok:true,json:async()=>latest});await settle();
  assert.equal(f.appearanceIdentities.at(-1).storageScope,latest.storageScope);assert.equal(f.appearanceIdentities.at(-1).name,'Cdr. Sara Khan');const updates=f.appearanceIdentities.length;
  pendingSecond.resolve({ok:true,json:async()=>second});await settle();
  assert.equal(f.appearanceIdentities.length,updates);assert.equal(f.appearanceIdentities.at(-1).storageScope,latest.storageScope);assert.equal(f.node('video-log-title').textContent,'Diary');assert.equal(f.node('video-log-camera').attributes['aria-pressed'],'false');assert.equal(f.recorders.length,1);
});

test('The camera immediately starts recording with a cloned audio track',async()=>{
  const f=fixture();await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');assert.equal(f.recorders[0].stream.getAudioTracks().length,1);assert.notEqual(f.recorders[0].stream.getAudioTracks()[0],f.incoming.getAudioTracks()[0]);assert.equal(f.node('video-log-camera').textContent,'Stop recording');assert.equal(f.node('video-log-background').disabled,true);assert.equal(f.locks.at(-1),true);
});
test('The camera is visible and recording before appearance preparation without restarting',async()=>{
  const f=fixture({background:'lab'});await f.start();assert.equal(f.recorders.length,1);assert.equal(f.node('video-log-screen').dataset.preview,'camera');
  const worker=f.workers[0];worker.emit({type:'ready'});assert.equal(f.node('video-log-screen').dataset.preview,'camera');
  worker.emit({type:'frame',bitmap:{close(){}}});worker.emit({type:'frame',bitmap:{close(){}}});assert.equal(f.node('video-log-screen').dataset.preview,'background');assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].starts,1);
});
test('Cancellation before camera permission stops the late stream without recording',async()=>{
  const permission=deferred(),f=fixture({permission});await f.start();f.node('video-log-camera').emit('click');permission.resolve(f.incoming);await settle();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.node('video-log-camera').attributes['aria-pressed'],'false');
});
test('Cancelling profile loading does not open the camera after the server responds',async()=>{
  const profile=deferred(),f=fixture({profile});await f.start();f.node('video-log-camera').emit('click');profile.resolve({ok:true,json:async()=>({name:'Test participant'})});await settle();assert.equal(f.requests.length,0);assert.equal(f.recorders.length,0);
});
test('The same button stops recording and sends it for analysis',async()=>{
  const f=fixture();await f.start();f.node('video-log-camera').emit('click');await settle();assert.equal(f.recorders[0].state,'inactive');assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.ok(f.captured[0].getTracks().every(t=>t.stopped));assert.equal(f.submissions.length,1);assert.equal(f.submissions[0][0],'video');assert.ok(f.submissions[0][1] instanceof Blob);assert.equal(f.node('video-log-camera').textContent,'Enable camera');assert.equal(f.locks.at(-1),false);
});
test('Closing during preparation prevents late frames from starting recording',async()=>{
  const f=fixture({background:'lab'});await f.start();const worker=f.workers[0];f.node('media-diary-dialog').open=false;f.engine.leave();const bitmap={closed:false,close(){this.closed=true;}};worker.emit({type:'frame',bitmap});await settle();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'inactive');assert.equal(f.node('video-log-screen').dataset.preview,'idle');assert.equal(bitmap.closed,true);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('Appearance errors keep the camera visible without interrupting recording',async()=>{
  const f=fixture({background:'lab'});await f.start();f.workers[0].emit({type:'error'});assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');assert.ok(f.incoming.getTracks().every(t=>!t.stopped));assert.equal(f.submissions.length,0);assert.match(f.node('video-log-notice').textContent,/Recording continues/);
});
test('A stalled appearance load preserves live video and recording',async()=>{
  const f=fixture({background:'lab'});await f.start();f.advance(45000);assert.equal(f.workers[0].terminated,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');
});
test('An empty mask does not hide the person and the next valid frame restores the background',async()=>{
  const f=fixture({background:'lab'});await f.start();const worker=f.workers[0];worker.emit({type:'frame',bitmap:{close(){}}});const empty={closed:false,close(){this.closed=true;}};worker.emit({type:'frame',hasPerson:false,bitmap:empty});assert.equal(empty.closed,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');worker.emit({type:'frame',hasPerson:true,bitmap:{close(){}}});assert.equal(f.node('video-log-screen').dataset.preview,'background');assert.equal(f.recorders.length,1);
});
test('Processor frames are created from an intermediate canvas instead of video',async()=>{
  const f=fixture({background:'lab'});await f.start();f.workers[0].emit({type:'ready'});f.draw();await settle();assert.equal(f.bitmaps.length,1);assert.notEqual(f.bitmaps[0],f.node('video-log-input'));assert.equal(f.bitmaps[0].width,640);assert.equal(f.workers[0].messages.at(-1).type,'frame');
});
test('Frame conversion errors do not stop the camera or recording',async()=>{
  const f=fixture({background:'lab',bitmapFailure:true});await f.start();f.workers[0].emit({type:'ready'});f.draw();await settle();assert.equal(f.workers[0].terminated,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');
});
test('A stalled frame releases the processor and restores the original camera',async()=>{
  const f=fixture({background:'lab'});await f.start();f.workers[0].emit({type:'ready'});f.workers[0].emit({type:'frame',bitmap:{close(){}}});f.draw();await settle();f.advance(5000);assert.equal(f.workers[0].terminated,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');
});
test('Video sends its own age-frame snapshot with the original clip',async()=>{const metadata={context:{scope:'owner/camera',session:1},frames:[{id:1},{id:2}],conditions:{light:50,distance:.3}},f=fixture({ageMetadata:metadata});await f.start();f.node('video-log-camera').emit('click');await settle();assert.equal(f.submissions[0][3],metadata);});
test('The two-minute limit sends automatic recording for analysis',async()=>{
  const f=fixture();await f.start();f.advance(120000);await settle();assert.equal(f.recorders[0].state,'inactive');assert.equal(f.submissions.length,1);assert.equal(f.submissions[0][2],120);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('Missing suitable codecs produce an error instead of a false recording state',async()=>{
  const f=fixture({unsupported:true});await f.start();assert.equal(f.recorders.length,0);assert.equal(f.node('video-log-camera').dataset.recording,'false');assert.equal(f.node('video-log-notice').dataset.error,'true');
});

const voiceSource=await readFile(new URL('../public/voice.js',import.meta.url),'utf8');
function voiceFixture({permission,resume,unsupported=false,analysisBusy=false}={}){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const label=new Element();node('voice-mic').querySelector=()=>label;
  node('voice-stage').getBoundingClientRect=()=>({width:400,height:180});node('voice-canvas').getContext=()=>({setTransform(){}});
  for(const id of ['voice-level-fill'])node(id).style={};node('media-diary-dialog').open=true;node('voice-recording-result').hidden=true;
  const incoming=media();incoming.tracks.splice(0,1);
  const recorders=[],engines=[],submissions=[],timers=new Map(),locks=[],windowEvents=new Map();let timer=0,engine;
  class Recorder{
    static isTypeSupported(){return !unsupported;}
    constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';recorders.push(this);}
    start(){this.state='recording';}
    stop(){assert.equal(this.state,'recording');this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['voice'],{type:this.mimeType})});this.onstop?.();});}
  }
  class AudioEngine{
    constructor(){this.state='running';engines.push(this);}
    resume(){return resume?.promise||Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createAnalyser(){return{fftSize:2048,frequencyBinCount:1024,disconnect(){}};}
    createMediaStreamSource(){return{connect(){},disconnect(){}};}
  }
  class ClipURL extends URL{static createObjectURL(){return 'blob:audio-clip';}static revokeObjectURL(){}}
  const document={hidden:false,getElementById:node,querySelectorAll:()=>[],addEventListener(){}};
  const window={missionMedia:{busy:()=>analysisBusy,submit:(...args)=>submissions.push(args)},AudioContext:AudioEngine,MediaRecorder:Recorder,devicePixelRatio:1,addEventListener:(name,handler)=>windowEvents.set(name,handler),missionDiary:{get active(){return node('media-diary-dialog').open;},register(_mode,value){engine=value;},lock(_mode,value){locks.push(value);},open(){}},missionSpeech:{stop(){},start(){}}};
  vm.runInNewContext(voiceSource,{window,document,MediaRecorder:Recorder,Blob,URL:ClipURL,URLSearchParams,Date,location:{search:''},matchMedia:()=>({matches:false}),localStorage:{getItem(){return null;},setItem(){}},performance:{now:()=>1000},navigator:{mediaDevices:{getUserMedia:()=>permission?.promise||Promise.resolve(incoming)}},setTimeout:callback=>{timers.set(++timer,callback);return timer;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){}}});
  engine.enter();
  return{node,label,incoming,recorders,engines,locks,submissions,engine,start:async()=>{node('voice-mic').emit('click');await settle();},expire(){for(const callback of [...timers.values()])callback();}};
}

test('Audio immediately records the microphone and shows active recording',async()=>{
  const f=voiceFixture();await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');assert.equal(f.recorders[0].stream.getVideoTracks().length,0);assert.equal(f.node('voice-mic').dataset.recording,'true');assert.equal(f.node('voice-source').textContent,'RECORDING AUDIO');assert.equal(f.locks.at(-1),true);
});
test('Pressing Audio again sends the recording for analysis without a player',async()=>{
  const f=voiceFixture();await f.start();f.node('voice-mic').emit('click');assert.equal(f.node('voice-mic').disabled,true);await settle();assert.equal(f.submissions.length,1);assert.equal(f.submissions[0][0],'audio');assert.ok(f.submissions[0][1] instanceof Blob);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.engines[0].state,'closed');assert.equal(f.locks.at(-1),false);assert.equal(f.node('voice-mic').disabled,false);
});
test('Cancelling microphone permission creates no late recording',async()=>{
  const permission=deferred(),f=voiceFixture({permission});await f.start();f.node('voice-mic').emit('click');permission.resolve(f.incoming);await settle();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('Closing before audio context resumes cancels recording',async()=>{
  const resume=deferred(),f=voiceFixture({resume});await f.start();f.node('media-diary-dialog').open=false;f.engine.leave();resume.resolve();await settle();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.engines[0].state,'closed');
});
test('No audio codec closes the microphone and shows an error',async()=>{
  const f=voiceFixture({unsupported:true});await f.start();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.node('voice-notice').dataset.error,'true');assert.equal(f.node('voice-mic').dataset.recording,'false');
});
test('The audio limit finishes the recording and releases the microphone',async()=>{
  const f=voiceFixture();await f.start();f.expire();await settle();assert.equal(f.recorders[0].state,'inactive');assert.equal(f.submissions.length,1);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});

const analysisSource=await readFile(new URL('../public/media-analysis.js',import.meta.url),'utf8');
function analysisFixture({failFirst=false,analysis,request,saved=[]}={}){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},calls=[],locks=[],frames=new Map();let index=0,ids=0;const engines=[];
  class AudioEngine{constructor(){this.state='running';engines.push(this);}resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}createMediaStreamSource(){return{connect(){},disconnect(){}};}createAnalyser(){return{fftSize:2048,disconnect(){},getFloatTimeDomainData(samples){samples.fill(.1);}};}}
  const window={missionVoiceAnalysis:analysis?{analyze:analysis,transcript(){}}:undefined,AudioContext:AudioEngine,missionDiary:{lock:(...args)=>locks.push(args)},missionSpeech:{finish:async()=>'Recognized speech'},missionCheckin:{current:()=>({score:74,wellbeingScale:100})}};
  vm.runInNewContext(analysisSource,{window,document:{getElementById:node,querySelector:node,createElement:()=>new Element()},crypto:{randomUUID:()=>ids++?'ad511184-9b59-4529-9ffa-'+String(ids).padStart(12,'0'):identifierForClient},FormData,Blob,AbortSignal,URL,performance,Float32Array,setTimeout,clearTimeout,requestAnimationFrame:callback=>{frames.set(++index,callback);return index;},cancelAnimationFrame:id=>frames.delete(id),fetch:async(_url,options)=>{if(options.method!=='POST')return Response.json({items:saved});calls.push(options.body);if(request)return request(options.body);return failFirst&&calls.length===1?Response.json({saved:true,status:'pending'},{status:503}):Response.json({status:'analyzed',analysis:'Model response'});}});
  return{api:window.missionMedia,node,calls,locks,frames,engines,window};
}
const identifierForClient='ad511184-9b59-4529-9ffa-69cfe258c81e';
test('Completed audio is automatically sent with speech and wellbeing',async()=>{const f=analysisFixture();await f.api.submit('audio',new Blob(['audio']),2);assert.equal(f.calls.length,1);assert.equal(f.calls[0].get('kind'),'audio');assert.equal(f.calls[0].get('transcript'),'Recognized speech');assert.equal(JSON.parse(f.calls[0].get('wellbeing')).score,74);assert.equal(f.api.busy('audio'),false);});
test('Analysis failures preserve retry with the same identifier',async()=>{const f=analysisFixture({failFirst:true});await f.api.submit('audio',new Blob(['audio']),2);const root=f.node('#voice-dialog').children[0].children[0];assert.match(root.children[1].textContent,/Recording saved/);assert.equal(root.children[2].hidden,false);root.children[2].emit('click');await settle();assert.equal(f.calls.length,2);assert.equal(f.calls[0].get('id'),f.calls[1].get('id'));assert.equal(root.parentNode,null);assert.equal(f.node('#voice-dialog').children[0].children.length,0);assert.equal(f.node('#voice-dialog').children[0].hidden,true);});
test('The video indicator calculates signal level and resets after disconnecting',()=>{const f=analysisFixture(),meter=f.api.meter('video-log');meter.prepare();meter.attach(media());[...f.frames.values()][0](200);assert.equal(f.node('video-log-level').textContent,'-20 dBFS');assert.ok(parseFloat(f.node('video-log-level-fill').style.width)>0);meter.stop();assert.equal(f.node('video-log-level').textContent,'-');assert.equal(f.node('video-log-level-fill').style.width,'0%');assert.equal(f.engines[0].state,'closed');});


test('Pending analysis does not block new audio or video capture',async()=>{
  for(const create of [fixture,voiceFixture]){const f=create({analysisBusy:true}),key=create===fixture?'video-log-camera':'voice-mic';assert.equal(f.node(key).disabled,false);await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');}
});
test('Long model loading keeps controls available and queues subsequent recordings',async()=>{
  const wait=deferred(),seen=[],f=analysisFixture({analysis:async(_kind,blob)=>{seen.push(await blob.text());if(seen.length===1)await wait.promise;return null;}});
  const first=f.api.submit('audio',new Blob(['first']),2);await settle();const second=f.api.submit('audio',new Blob(['second']),3);await settle();
  assert.equal(f.api.busy('audio'),true);assert.equal(f.node('voice-mic').disabled,false);assert.equal(f.node('video-log-camera').disabled,false);assert.equal(f.locks.length,0);assert.deepEqual(seen,['first']);
  assert.match(f.node('#voice-dialog').children[0].children[1].children[1].textContent,/Queued/);
  wait.resolve();await Promise.all([first,second]);assert.deepEqual(seen,['first','second']);assert.equal(f.calls.length,2);assert.notEqual(f.calls[0].get('id'),f.calls[1].get('id'));assert.equal(await f.calls[0].get('file').text(),'first');assert.equal(await f.calls[1].get('file').text(),'second');assert.equal(f.api.busy('audio'),false);
});
test('Completing an old request does not change the new active recording button',async()=>{
  const wait=deferred(),f=analysisFixture({request:async()=>{await wait.promise;return Response.json({status:'analyzed',analysis:'Done'});}}),pending=f.api.submit('audio',new Blob(['sound']),2);await settle();f.node('voice-mic').disabled=true;wait.resolve();await pending;assert.equal(f.node('voice-mic').disabled,true);assert.equal(f.locks.length,0);
});
const diarySource=await readFile(new URL('../public/media-diary.js',import.meta.url),'utf8');
function diaryFixture(){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const dialog=node('media-diary-dialog'),state={workspace:'crew',view:'health'},events=[],navigation=[];
  dialog.hidden=true;dialog.querySelectorAll=()=>[];dialog.querySelector=()=>node('analysis-caption');dialog.showModal=()=>{throw new Error('No separate window should open');};
  node('video-log-background').closest=()=>null;node('voice-dialog').querySelector=()=>null;node('video-log-dialog').querySelector=()=>null;
  let api;const window={missionActivity:{record(){}},dispatchEvent:event=>events.push(event.type),scrollTo(){},missionDesign:{navigate(section){navigation.push(section);state.workspace='crew';state.view=section==='diary'?'diary':'health';api.render();}}};
  const document={body:{dataset:{}},getElementById:node,querySelector:selector=>selector==='.main-column'?node('main-column'):null,querySelectorAll:()=>[]};
  vm.runInNewContext(diarySource,{window,document,state,Event,MutationObserver:class{observe(){}}});api=window.missionDiary;return{api,node,dialog,state,events,navigation,document};
}
test('The diary shows Video and Audio together without a switcher',()=>{
  const f=diaryFixture(),starts=[],stops=[];for(const kind of ['audio','video'])f.api.register(kind,{enter(){starts.push(kind);},leave(){stops.push(kind);}});
  f.api.open();assert.equal(f.dialog.dataset.mode,'combined');assert.equal(f.node('video-log-dialog').hidden,false);assert.equal(f.node('voice-dialog').hidden,false);assert.deepEqual(starts,['audio','video']);
  f.api.lock('video',true);f.api.open('audio');assert.equal(f.node('voice-dialog').scrolled,true);assert.deepEqual(starts,['audio','video']);assert.deepEqual(stops,[]);assert.equal(f.dialog.dataset.recording,'true');
});
test('Stopping one format preserves the other format’s recording state',()=>{
  const f=diaryFixture();f.api.open();f.api.lock('video',true);f.api.lock('audio',true);f.api.lock('audio',false);assert.equal(f.dialog.dataset.recording,'true');f.api.lock('video',false);assert.equal(f.dialog.dataset.recording,'false');
});
test('Leaving the diary releases both capture formats',()=>{
  const f=diaryFixture(),stops=[];for(const kind of ['audio','video'])f.api.register(kind,{enter(){},leave(){stops.push(kind);}});f.api.open('audio');f.api.lock('video',true);f.api.lock('audio',true);f.api.close();assert.deepEqual(stops,['audio','video']);assert.equal(f.dialog.dataset.recording,'false');assert.equal(f.dialog.hidden,true);assert.equal(f.api.active,false);
});

test('The diary occupies the main page without a modal and highlights its section',()=>{
  const f=diaryFixture();assert.equal(f.dialog.hidden,true);assert.ok(f.node('main-column').children.includes(f.dialog));f.api.open();assert.equal(f.dialog.hidden,false);assert.equal(f.api.active,true);assert.equal(f.state.view,'diary');assert.equal(f.document.body.dataset.diary,'true');assert.deepEqual(f.navigation,['diary']);assert.deepEqual(f.events,['mission-diary-open']);
});
test('Opening research stops the engines once, returning reuses the existing panels',()=>{
  const f=diaryFixture(),starts=[],stops=[],video=f.node('video-log-dialog');for(const kind of ['audio','video'])f.api.register(kind,{enter(){starts.push(kind);},leave(){stops.push(kind);}});
  f.api.open();f.state.workspace='research';f.api.render();f.api.render();assert.equal(f.api.active,false);assert.equal(f.dialog.hidden,true);assert.deepEqual(stops,['audio','video']);assert.equal(f.document.body.dataset.diary,'false');f.api.open();assert.equal(f.node('video-log-dialog'),video);assert.deepEqual(starts,['audio','video','audio','video']);assert.deepEqual(f.events,['mission-diary-open','mission-diary-close','mission-diary-open']);
});
test('Showing the diary again does not reset recording or restart engines',()=>{
  const f=diaryFixture();let starts=0;f.api.register('video',{enter(){starts++;},leave(){}});f.api.open();f.api.lock('video',true);f.api.render();f.api.open('video');assert.equal(starts,1);assert.equal(f.dialog.dataset.recording,'true');
});

test('New recordings do not replace the old recording’s transcript',async()=>{const speech=await readFile(new URL('../public/speech.js',import.meta.url),'utf8'),part=speech.slice(speech.indexOf('  async function finish('),speech.indexOf('  window.missionSpeech=')),state={version:1,processing:true,queue:[],transcript:'Old voice'},context={states:new Map([['voice',state]]),stop(){},Date,setTimeout(callback){state.version++;state.processing=false;state.transcript='New voice';callback();}};vm.runInNewContext(part+'globalThis.finish=finish;',context);assert.equal(await context.finish('voice'),'');});


const voiceAnalysisSource=await readFile(new URL('../public/voice-analysis.js',import.meta.url),'utf8');
const analysisSamplesSource=await readFile(new URL('../public/analysis-samples.js',import.meta.url),'utf8'),audioControlManifest=JSON.parse(await readFile(new URL('../public/data/archive-preload.json',import.meta.url),'utf8'));
function audioSamples(manifest=audioControlManifest){const sandbox={window:{},fetch:async path=>{assert.equal(path,'/data/archive-preload.json');return{ok:true,json:async()=>manifest};}};vm.runInNewContext(analysisSamplesSource,sandbox);return sandbox.window.missionAnalysisSamples;}
function voiceAnalysisFixture({decode,samples}={}){
  class FeatureElement extends Element{
    constructor(tag){super();this.tag=tag;}
    querySelector(selector){const match=selector.match(/^\[data-voice-feature=(\w+)\] strong$/);if(!match)return null;const nodes=[...this.children];while(nodes.length){const item=nodes.shift();if(item.dataset.voiceFeature===match[1])return item.children.find(child=>child.tag==='strong');nodes.push(...item.children);}return null;}
  }
  const host=new FeatureElement('section'),window={missionGauge:{markup:({value})=>'gauge:'+value},missionAnalysisSamples:samples};
  if(decode)window.AudioContext=class{decodeAudioData(){return decode;}close(){return Promise.resolve();}};
  const workers=[];
  class FeatureWorker{constructor(){workers.push(this);}postMessage(data){this.id=data.id;}terminate(){this.terminated=true;}}
  class OfflineEngine{constructor(_channels,length){this.length=length;this.destination={};}createBufferSource(){return{connect(){},start(){}};}createBuffer(){return{copyToChannel(){}};}startRendering(){return Promise.resolve({getChannelData:()=>new Float32Array(this.length).fill(.1)});}}
  vm.runInNewContext(voiceAnalysisSource,{window,document:{querySelector:()=>host,createElement:tag=>new FeatureElement(tag)},Blob,Date,Intl,Float32Array,OfflineAudioContext:OfflineEngine,Worker:FeatureWorker,crypto:{randomUUID:()=>identifierForClient},setTimeout:()=>1,clearTimeout(){}});
  const panel=kind=>host.children.find(item=>item.dataset.voiceAnalysis===kind),feature=(kind,key)=>panel(kind).querySelector('[data-voice-feature='+key+'] strong');return{api:window.missionVoiceAnalysis,panel,feature,workers};
}
const savedVoice={kind:'audio',createdAt:'2026-11-05T08:10:00Z',features:{acoustic:{level:-25.4,quiet:.2,clipping:.001,seconds:5},model:'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768',tone:[{label:'neutral',similarity:.62}]},transcript:'Saved speech'};
test('Personal acoustic panels stay empty before recording and restore actual saved analysis',async()=>{
  const samples=audioSamples(),f=voiceAnalysisFixture({samples});await samples.audio;await settle();
  assert.equal(f.panel('video'),undefined);for(const kind of ['audio']){assert.equal(f.panel(kind).dataset.resultSource,'missing');assert.ok(f.panel(kind).children[1].children.every(card=>card.dataset.resultSource==='missing'));for(const key of ['level','pauses','clipping'])assert.equal(f.feature(kind,key).textContent,'Recording required');assert.equal(f.feature(kind,'tone').textContent,'Voice analysis required');}
  assert.equal(f.api.restore('audio',{...savedVoice,createdAt:'2025-01-01T00:00:00Z'}),true);assert.equal(f.panel('audio').dataset.resultSource,'saved');assert.equal(f.feature('audio','level').textContent,'-25 dBFS');assert.equal(f.feature('audio','tone').textContent,'Neutral / 0.62');
});
test('A late reference file does not replace a new recording or its decode failure',async()=>{
  const pendingSample=deferred(),pendingDecode=deferred(),f=voiceAnalysisFixture({samples:{audio:pendingSample.promise},decode:pendingDecode.promise}),analysis=f.api.analyze('audio',new Blob(['bad']),[],null,'2026-11-06T08:00:00Z');
  pendingSample.resolve(await audioSamples().audio);await settle();assert.equal(f.panel('audio').dataset.resultSource,'pending');assert.notEqual(f.feature('audio','tone').textContent,'Synthesized speech / Samantha');pendingDecode.resolve(null);await analysis;assert.equal(f.panel('audio').dataset.resultSource,'missing');assert.equal(f.feature('audio','level').textContent,'No measurement');
});
test('Without originals, cards name missing data explicitly rather than showing dashes',()=>{
  const f=voiceAnalysisFixture();assert.equal(f.panel('video'),undefined);for(const kind of ['audio']){for(const key of ['level','pauses','clipping'])assert.equal(f.feature(kind,key).textContent,'Recording required');assert.equal(f.feature(kind,'tone').textContent,'Voice analysis required');}
});
test('Saved acoustic results restore numbers, circular gauges and tone',()=>{
  const f=voiceAnalysisFixture();assert.equal(f.api.restore('audio',savedVoice),true);assert.equal(f.feature('audio','level').textContent,'-25 dBFS');assert.equal(f.feature('audio','pauses').innerHTML,'gauge:20');assert.equal(f.feature('audio','clipping').innerHTML,'gauge:0.1');assert.equal(f.feature('audio','tone').textContent,'Neutral / 0.62');assert.match(f.panel('audio').children[0].children[1].textContent,/Latest recording/);assert.equal(f.panel('audio').children[4].children[1].textContent,'Saved speech');
  assert.equal(f.api.restore('audio',{...savedVoice,createdAt:'2026-11-04T08:10:00Z',features:{acoustic:{level:-80,quiet:1,clipping:0,seconds:5}}}),false);assert.equal(f.feature('audio','level').textContent,'-25 dBFS');
});
test('Waiting and decode failure preserve the previous measurements with a timestamp',async()=>{
  const wait=deferred(),f=voiceAnalysisFixture({decode:wait.promise});f.api.restore('audio',savedVoice);const pending=f.api.analyze('audio',new Blob(['sound']),[],null,'2026-11-05T09:00:00Z');await settle();assert.equal(f.feature('audio','level').textContent,'-25 dBFS');assert.equal(f.api.restore('audio',{...savedVoice,createdAt:'2026-11-05T08:30:00Z'}),false);wait.resolve(null);await pending;assert.equal(f.feature('audio','level').textContent,'-25 dBFS');assert.match(f.panel('audio').children[0].children[1].textContent,/showing recording from/);
});
test('Opening latest results does not trigger transcription or upload again',async()=>{
  const item={...savedVoice,id:'audio-saved',status:'analyzed',analysis:'Saved response'},f=analysisFixture({saved:[item]}),restored=[];f.window.missionVoiceAnalysis={restore:(...args)=>restored.push(args)};await f.api.restore();assert.equal(f.calls.length,0);assert.equal(restored.length,1);assert.equal(restored[0][1].features.acoustic.level,-25.4);const root=f.node('#voice-dialog').children[0];assert.equal(root.hidden,true);assert.equal(root.children.length,0);await f.api.restore();assert.equal(root.children.length,0);assert.equal(f.calls.length,0);
});

test('Saved visual-only analysis creates no narrative block in the diary',async()=>{
  const item={kind:'video',id:'video-saved',createdAt:'2026-11-05T09:30:00Z',status:'analyzed',features:null,transcript:'',analysis:'Saved observation of the selected frames.'},f=analysisFixture({saved:[item]});
  f.window.missionVoiceAnalysis={restore:()=>false};await f.api.restore();const root=f.node('#video-log-dialog .diary-visual-analysis').children[0];
  assert.equal(root.hidden,true);assert.equal(root.children.length,0);assert.equal(f.calls.length,0);
  await f.api.restore();assert.equal(root.children.length,0);assert.equal(f.calls.length,0);
});


test('Acoustic values appear after decoding before the embedder responds',async()=>{
  const data=new Float32Array(16000).fill(.1),f=voiceAnalysisFixture({decode:Promise.resolve({length:data.length,sampleRate:16000,numberOfChannels:1,getChannelData:()=>data})});
  const pending=f.api.analyze('audio',new Blob(['sound']),[],null,'2026-11-05T09:30:00Z');await settle();
  assert.equal(f.workers.length,1);assert.equal(f.feature('audio','level').textContent,'-20 dBFS');assert.equal(f.feature('audio','pauses').innerHTML,'gauge:0');assert.equal(f.feature('audio','clipping').innerHTML,'gauge:0');assert.equal(f.feature('audio','tone').textContent,'Voice analysis...');assert.equal(f.panel('audio').dataset.recordedAt,'2026-11-05T09:30:00Z');
  f.workers[0].onmessage({data:{id:f.workers[0].id,type:'error',reason:'model_unavailable'}});await pending;assert.equal(f.feature('audio','level').textContent,'-20 dBFS');assert.equal(f.feature('audio','tone').textContent,'No model result');
});


test('Video sound is analyzed and preserved without adding a second audio panel',async()=>{
  const data=new Float32Array(16000).fill(.1),f=voiceAnalysisFixture({decode:Promise.resolve({length:data.length,sampleRate:16000,numberOfChannels:1,getChannelData:()=>data})});
  assert.equal(f.panel('video'),undefined);assert.equal(f.api.restore('video',{...savedVoice,kind:'video'}),true);assert.equal(f.panel('video'),undefined);
  const pending=f.api.analyze('video',new Blob(['sound']),[],null,'2026-11-06T09:30:00Z');await settle();assert.equal(f.workers.length,1);
  f.workers[0].onmessage({data:{id:f.workers[0].id,type:'result',result:{model:savedVoice.features.model,tone:[{label:'neutral',similarity:.62}]}}});
  const features=await pending;assert.equal(Math.round(features.acoustic.level),-20);assert.equal(features.tone[0].label,'neutral');assert.equal(f.panel('video'),undefined);assert.equal(f.workers[0].terminated,true);
  f.api.transcript('video','Actual video transcription');assert.equal(f.panel('video'),undefined);assert.equal(f.feature('audio','level').textContent,'Recording required');
});

test('Reference audio and video samples cannot populate recording analysis panels',async()=>{
  const samples={audio:Promise.resolve([{kind:'audio',acoustic:{level:-17,quiet:.3,clipping:0},transcript:'Reference text'},{kind:'video',acoustic:{level:-17,quiet:.3,clipping:0},transcript:'Reference video text'}])},f=voiceAnalysisFixture({samples});await samples.audio;await settle();
  assert.equal(f.panel('video'),undefined);assert.equal(f.panel('audio').dataset.resultSource,'missing');assert.equal(f.feature('audio','level').textContent,'Recording required');assert.equal(f.feature('audio','tone').textContent,'Voice analysis required');
});


test('A newly completed recording saves its analysis without rendering narrative text',async()=>{
  const f=analysisFixture();let archiveRefreshes=0;f.window.missionBook={refresh(){archiveRefreshes++;}};
  await f.api.submit('audio',new Blob(['audio']),2);
  const panel=f.node('#voice-dialog').children[0];assert.equal(panel.hidden,true);assert.equal(panel.children.length,0);assert.equal(f.calls.length,1);assert.equal(archiveRefreshes,1);assert.equal(f.api.busy('audio'),false);
});
