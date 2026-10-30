import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/video-log.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
class Element{
  constructor(){this.dataset={};this.attributes={};this.events=new Map();this.value='';this.hidden=false;this.disabled=false;this.textContent='';}
  setAttribute(key,value){this.attributes[key]=String(value);}
  removeAttribute(key){delete this.attributes[key];}
  addEventListener(key,callback){this.events.set(key,callback);}
  emit(key,event={}){this.events.get(key)?.(event);}
  pause(){}
  load(){}
  async play(){}
}
function track(kind){return{kind,readyState:'live',enabled:true,stopped:false,stop(){this.stopped=true;this.readyState='ended';},clone(){return track(kind);},addEventListener(){},getSettings(){return{};}};}
function media(){const tracks=[track('video'),track('audio')];return{tracks,getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==='audio'),getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),addTrack(t){tracks.push(t);}};}
function fixture({background='room',permission,profile,unsupported=false}={}){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  node('media-diary-dialog').open=true;node('video-log-background').value=background;
  node('video-log-canvas').getContext=()=>({});
  const captured=[],recorders=[],workers=[],requests=[],locks=[],intervals=new Map();let timer=0,clock=0,engine;
  node('video-log-canvas').captureStream=()=>{const stream=media();stream.tracks.splice(1);captured.push(stream);return stream;};
  class Recorder{
    static isTypeSupported(){return !unsupported;}
    constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';this.starts=0;recorders.push(this);}
    start(){this.state='recording';this.starts++;}
    stop(){assert.equal(this.state,'recording');this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['video'],{type:this.mimeType})});this.onstop?.();});}
  }
  class BackgroundWorker{
    constructor(){workers.push(this);}
    postMessage(){}
    terminate(){this.terminated=true;}
    emit(data){this.onmessage?.({data});}
  }
  const document={hidden:false,getElementById:node,querySelectorAll:()=>[],addEventListener(){}};
  const incoming=media(),storage=new Map();
  const window={MediaRecorder:Recorder,Worker:BackgroundWorker,OffscreenCanvas:class{},createImageBitmap(){},addEventListener(){},missionDiary:{register(_mode,value){engine=value;},lock(_mode,value){locks.push(value);},open(){}},missionSpeech:{stop(){},reset(){},start(){}},missionAppearance:{stop(){},start(){},setIdentity(){}}};
  class ClipURL extends URL{static createObjectURL(){return 'blob:recorded-clip';}static revokeObjectURL(){}}
  vm.runInNewContext(source,{document,window,Image:class{},Worker:BackgroundWorker,MediaRecorder:Recorder,Blob,URL:ClipURL,URLSearchParams,location:{search:''},Intl,Date,performance:{now:()=>clock},navigator:{mediaDevices:{getUserMedia(options){requests.push(options);return permission?.promise||Promise.resolve(incoming);}}},fetch:()=>profile?.promise||Promise.resolve({ok:true,json:async()=>({researcherId:'local-test',name:'Тестовый участник'})}),localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout:()=>++timer,clearTimeout(){},setInterval:callback=>{intervals.set(++timer,callback);return timer;},clearInterval:id=>intervals.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  engine.enter();
  return{node,incoming,captured,recorders,workers,requests,locks,engine,start:async()=>{node('video-log-camera').emit('click');await settle();},advance(ms){clock+=ms;for(const callback of [...intervals.values()])callback();}};
}

test('Камера сразу начинает запись с клонированной дорожкой голоса',async()=>{
  const f=fixture();await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');assert.equal(f.recorders[0].stream.getAudioTracks().length,1);assert.notEqual(f.recorders[0].stream.getAudioTracks()[0],f.incoming.getAudioTracks()[0]);assert.equal(f.node('video-log-camera').textContent,'Остановить запись');assert.equal(f.node('video-log-background').disabled,true);assert.equal(f.locks.at(-1),true);
});
test('Обработка оформления запускает запись по первому готовому кадру ровно один раз',async()=>{
  const f=fixture({background:'lab'});await f.start();assert.equal(f.recorders.length,0);
  const worker=f.workers[0];worker.emit({type:'ready'});assert.equal(f.recorders.length,0);
  worker.emit({type:'frame',bitmap:{close(){}}});worker.emit({type:'frame',bitmap:{close(){}}});assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].starts,1);
});
test('Отмена до разрешения камеры останавливает запоздавший поток без записи',async()=>{
  const permission=deferred(),f=fixture({permission});await f.start();f.node('video-log-camera').emit('click');permission.resolve(f.incoming);await settle();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.node('video-log-camera').attributes['aria-pressed'],'false');
});
test('Отмена ожидания профиля не открывает камеру после ответа сервера',async()=>{
  const profile=deferred(),f=fixture({profile});await f.start();f.node('video-log-camera').emit('click');profile.resolve({ok:true,json:async()=>({name:'Тестовый участник'})});await settle();assert.equal(f.requests.length,0);assert.equal(f.recorders.length,0);
});
test('Та же кнопка останавливает запись и оставляет готовый файл для просмотра',async()=>{
  const f=fixture();await f.start();f.node('video-log-camera').emit('click');await settle();assert.equal(f.recorders[0].state,'inactive');assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.ok(f.captured[0].getTracks().every(t=>t.stopped));assert.equal(f.node('video-log-download').hidden,false);assert.equal(f.node('video-log-review').hidden,false);assert.equal(f.node('video-log-camera').textContent,'Новая запись');assert.equal(f.locks.at(-1),false);
});
test('Закрытие окна во время подготовки не позволяет позднему кадру начать запись',async()=>{
  const f=fixture({background:'lab'});await f.start();const worker=f.workers[0];f.node('media-diary-dialog').open=false;f.engine.leave();const bitmap={closed:false,close(){this.closed=true;}};worker.emit({type:'frame',bitmap});assert.equal(f.recorders.length,0);assert.equal(bitmap.closed,true);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('После ошибки оформления выбор обычной камеры начинает запись',async()=>{
  const f=fixture({background:'lab'});await f.start();f.workers[0].emit({type:'error'});assert.equal(f.recorders.length,0);f.node('video-log-background').value='room';f.node('video-log-background').emit('change');assert.equal(f.recorders.length,1);
});
test('Лимит двух минут завершает автоматическую запись с доступным файлом',async()=>{
  const f=fixture();await f.start();f.advance(120000);await settle();assert.equal(f.recorders[0].state,'inactive');assert.equal(f.node('video-log-download').hidden,false);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('Отсутствие подходящего кодека дает ошибку вместо ложного состояния записи',async()=>{
  const f=fixture({unsupported:true});await f.start();assert.equal(f.recorders.length,0);assert.equal(f.node('video-log-camera').dataset.recording,'false');assert.equal(f.node('video-log-notice').dataset.error,'true');
});

const voiceSource=await readFile(new URL('../public/voice.js',import.meta.url),'utf8');
function voiceFixture({permission,resume,unsupported=false}={}){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const label=new Element();node('voice-mic').querySelector=()=>label;
  node('voice-stage').getBoundingClientRect=()=>({width:400,height:180});node('voice-canvas').getContext=()=>({setTransform(){}});
  for(const id of ['voice-level-fill'])node(id).style={};node('media-diary-dialog').open=true;node('voice-recording-result').hidden=true;
  const incoming=media();incoming.tracks.splice(0,1);
  const recorders=[],engines=[],timers=new Map(),locks=[],windowEvents=new Map();let timer=0,engine;
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
  const window={AudioContext:AudioEngine,MediaRecorder:Recorder,devicePixelRatio:1,addEventListener:(name,handler)=>windowEvents.set(name,handler),missionDiary:{register(_mode,value){engine=value;},lock(_mode,value){locks.push(value);},open(){}},missionSpeech:{stop(){},start(){}}};
  vm.runInNewContext(voiceSource,{window,document,MediaRecorder:Recorder,Blob,URL:ClipURL,URLSearchParams,Date,location:{search:''},matchMedia:()=>({matches:false}),localStorage:{getItem(){return null;},setItem(){}},performance:{now:()=>1000},navigator:{mediaDevices:{getUserMedia:()=>permission?.promise||Promise.resolve(incoming)}},setTimeout:callback=>{timers.set(++timer,callback);return timer;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){}}});
  engine.enter();
  return{node,label,incoming,recorders,engines,locks,engine,start:async()=>{node('voice-mic').emit('click');await settle();},expire(){for(const callback of [...timers.values()])callback();}};
}

test('Аудио сразу записывает микрофон и блокирует переключение режима',async()=>{
  const f=voiceFixture();await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');assert.equal(f.recorders[0].stream.getVideoTracks().length,0);assert.equal(f.node('voice-mic').dataset.recording,'true');assert.equal(f.node('voice-source').textContent,'ЗАПИСЬ АУДИО');assert.equal(f.locks.at(-1),true);
});
test('Повторное нажатие Аудио завершает запись и дает прослушивание и скачивание',async()=>{
  const f=voiceFixture();await f.start();f.node('voice-mic').emit('click');assert.equal(f.node('voice-mic').disabled,true);await settle();assert.equal(f.node('voice-recording-result').hidden,false);assert.equal(f.node('voice-review').src,'blob:audio-clip');assert.equal(f.node('voice-download').href,'blob:audio-clip');assert.match(f.node('voice-download').download,/\.webm$/);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.engines[0].state,'closed');assert.equal(f.locks.at(-1),false);assert.equal(f.node('voice-mic').disabled,false);
});
test('Отмена разрешения микрофона не создает позднюю аудиозапись',async()=>{
  const permission=deferred(),f=voiceFixture({permission});await f.start();f.node('voice-mic').emit('click');permission.resolve(f.incoming);await settle();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('Закрытие окна до возобновления аудиоконтекста отменяет запись',async()=>{
  const resume=deferred(),f=voiceFixture({resume});await f.start();f.node('media-diary-dialog').open=false;f.engine.leave();resume.resolve();await settle();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.engines[0].state,'closed');
});
test('Отсутствие аудиокодека закрывает микрофон и показывает ошибку',async()=>{
  const f=voiceFixture({unsupported:true});await f.start();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.node('voice-notice').dataset.error,'true');assert.equal(f.node('voice-mic').dataset.recording,'false');
});
test('Лимит аудиозаписи завершает ролик и освобождает микрофон',async()=>{
  const f=voiceFixture();await f.start();f.expire();await settle();assert.equal(f.recorders[0].state,'inactive');assert.equal(f.node('voice-recording-result').hidden,false);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
