import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../public/video-log.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
class Element{
  constructor(){this.dataset={};this.attributes={};this.children=[];this.style={};this.events=new Map();this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.classList={add(){}};}
  append(...children){this.children.push(...children);}
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
function fixture({background='room',permission,profile,unsupported=false,analysisBusy=false,bitmapFailure=false,ageMetadata=null}={}){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  node('media-diary-dialog').open=true;node('video-log-background').value=background;
  const drawing=[],bitmaps=[],timeouts=new Map();let animation;
  const context=new Proxy({drawImage:(...args)=>drawing.push(args),createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{})});
  node('video-log-canvas').getContext=()=>context;
  Object.assign(node('video-log-canvas'),{width:1280,height:720});
  Object.assign(node('video-log-input'),{readyState:2,videoWidth:1280,videoHeight:720});
  const captured=[],recorders=[],workers=[],requests=[],locks=[],submissions=[],intervals=new Map();let timer=0,clock=0,engine;
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
  const window={MediaStream:CloneStream,missionMedia:{busy:()=>analysisBusy,meter:()=>({prepare(){},attach(){},stop(){}}),submit:(...args)=>submissions.push(args)},MediaRecorder:Recorder,Worker:BackgroundWorker,OffscreenCanvas:class{},createImageBitmap(){},addEventListener(){},missionDiary:{register(_mode,value){engine=value;},lock(_mode,value){locks.push(value);},open(){}},missionSpeech:{stop(){},reset(){},start(){}},missionAppearance:{stop(){},start(){},setIdentity(){},ageContext(){return{session:1};},ageSnapshot(){return ageMetadata;}}};
  class ClipURL extends URL{static createObjectURL(){return 'blob:recorded-clip';}static revokeObjectURL(){}}
  vm.runInNewContext(source,{document,window,createImageBitmap:async input=>{bitmaps.push(input);if(bitmapFailure)throw new Error('unsupported_video_bitmap');return{close(){}};},Image:class{},MediaStream:CloneStream,Worker:BackgroundWorker,MediaRecorder:Recorder,Blob,URL:ClipURL,URLSearchParams,location:{search:''},Intl,Date,performance:{now:()=>clock},navigator:{mediaDevices:{getUserMedia(options){requests.push(options);return permission?.promise||Promise.resolve(incoming);}}},fetch:()=>profile?.promise||Promise.resolve({ok:true,json:async()=>({researcherId:'local-test',name:'Тестовый участник'})}),localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout:(callback,delay)=>{timeouts.set(++timer,{callback,at:clock+delay});return timer;},clearTimeout:id=>timeouts.delete(id),setInterval:callback=>{intervals.set(++timer,callback);return timer;},clearInterval:id=>intervals.delete(id),requestAnimationFrame:callback=>{animation=callback;return 1;},cancelAnimationFrame(){}});
  engine.enter();
  return{node,incoming,captured,recorders,workers,requests,locks,submissions,engine,bitmaps,drawing,start:async()=>{node('video-log-camera').emit('click');await settle();},draw(time=100){animation(time);},advance(ms){clock+=ms;for(const callback of [...intervals.values()])callback();for(const [id,t] of [...timeouts])if(t.at<=clock){timeouts.delete(id);t.callback();}}};
}

test('Камера сразу начинает запись с клонированной дорожкой голоса',async()=>{
  const f=fixture();await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');assert.equal(f.recorders[0].stream.getAudioTracks().length,1);assert.notEqual(f.recorders[0].stream.getAudioTracks()[0],f.incoming.getAudioTracks()[0]);assert.equal(f.node('video-log-camera').textContent,'Остановить запись');assert.equal(f.node('video-log-background').disabled,true);assert.equal(f.locks.at(-1),true);
});
test('Камера видна и записывается до готовности оформления без повторного запуска',async()=>{
  const f=fixture({background:'lab'});await f.start();assert.equal(f.recorders.length,1);assert.equal(f.node('video-log-screen').dataset.preview,'camera');
  const worker=f.workers[0];worker.emit({type:'ready'});assert.equal(f.node('video-log-screen').dataset.preview,'camera');
  worker.emit({type:'frame',bitmap:{close(){}}});worker.emit({type:'frame',bitmap:{close(){}}});assert.equal(f.node('video-log-screen').dataset.preview,'background');assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].starts,1);
});
test('Отмена до разрешения камеры останавливает запоздавший поток без записи',async()=>{
  const permission=deferred(),f=fixture({permission});await f.start();f.node('video-log-camera').emit('click');permission.resolve(f.incoming);await settle();assert.equal(f.recorders.length,0);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.node('video-log-camera').attributes['aria-pressed'],'false');
});
test('Отмена ожидания профиля не открывает камеру после ответа сервера',async()=>{
  const profile=deferred(),f=fixture({profile});await f.start();f.node('video-log-camera').emit('click');profile.resolve({ok:true,json:async()=>({name:'Тестовый участник'})});await settle();assert.equal(f.requests.length,0);assert.equal(f.recorders.length,0);
});
test('Та же кнопка останавливает запись и передает ее на анализ',async()=>{
  const f=fixture();await f.start();f.node('video-log-camera').emit('click');await settle();assert.equal(f.recorders[0].state,'inactive');assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.ok(f.captured[0].getTracks().every(t=>t.stopped));assert.equal(f.submissions.length,1);assert.equal(f.submissions[0][0],'video');assert.ok(f.submissions[0][1] instanceof Blob);assert.equal(f.node('video-log-camera').textContent,'Включить камеру');assert.equal(f.locks.at(-1),false);
});
test('Закрытие окна во время подготовки не позволяет позднему кадру начать запись',async()=>{
  const f=fixture({background:'lab'});await f.start();const worker=f.workers[0];f.node('media-diary-dialog').open=false;f.engine.leave();const bitmap={closed:false,close(){this.closed=true;}};worker.emit({type:'frame',bitmap});await settle();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'inactive');assert.equal(f.node('video-log-screen').dataset.preview,'idle');assert.equal(bitmap.closed,true);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('Ошибка оформления оставляет камеру видимой и не прерывает запись',async()=>{
  const f=fixture({background:'lab'});await f.start();f.workers[0].emit({type:'error'});assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');assert.ok(f.incoming.getTracks().every(t=>!t.stopped));assert.equal(f.submissions.length,0);assert.match(f.node('video-log-notice').textContent,/Запись продолжается/);
});
test('Зависшая загрузка оформления сохраняет живое видео и запись',async()=>{
  const f=fixture({background:'lab'});await f.start();f.advance(45000);assert.equal(f.workers[0].terminated,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');
});
test('Пустая маска не прячет человека и следующий корректный кадр возвращает фон',async()=>{
  const f=fixture({background:'lab'});await f.start();const worker=f.workers[0];worker.emit({type:'frame',bitmap:{close(){}}});const empty={closed:false,close(){this.closed=true;}};worker.emit({type:'frame',hasPerson:false,bitmap:empty});assert.equal(empty.closed,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');worker.emit({type:'frame',hasPerson:true,bitmap:{close(){}}});assert.equal(f.node('video-log-screen').dataset.preview,'background');assert.equal(f.recorders.length,1);
});
test('Кадр для обработчика создается из промежуточного canvas вместо video',async()=>{
  const f=fixture({background:'lab'});await f.start();f.workers[0].emit({type:'ready'});f.draw();await settle();assert.equal(f.bitmaps.length,1);assert.notEqual(f.bitmaps[0],f.node('video-log-input'));assert.equal(f.bitmaps[0].width,640);assert.equal(f.workers[0].messages.at(-1).type,'frame');
});
test('Ошибка преобразования кадра не выключает камеру и запись',async()=>{
  const f=fixture({background:'lab',bitmapFailure:true});await f.start();f.workers[0].emit({type:'ready'});f.draw();await settle();assert.equal(f.workers[0].terminated,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');
});
test('Зависший кадр освобождает обработчик и возвращает исходную камеру',async()=>{
  const f=fixture({background:'lab'});await f.start();f.workers[0].emit({type:'ready'});f.workers[0].emit({type:'frame',bitmap:{close(){}}});f.draw();await settle();f.advance(5000);assert.equal(f.workers[0].terminated,true);assert.equal(f.node('video-log-screen').dataset.preview,'camera');assert.equal(f.recorders[0].state,'recording');
});
test('Видеозапись передает свой снимок кадров возраста вместе с исходным роликом',async()=>{const metadata={context:{scope:'owner/camera',session:1},frames:[{id:1},{id:2}],conditions:{light:50,distance:.3}},f=fixture({ageMetadata:metadata});await f.start();f.node('video-log-camera').emit('click');await settle();assert.equal(f.submissions[0][3],metadata);});
test('Лимит двух минут отправляет автоматическую запись на анализ',async()=>{
  const f=fixture();await f.start();f.advance(120000);await settle();assert.equal(f.recorders[0].state,'inactive');assert.equal(f.submissions.length,1);assert.equal(f.submissions[0][2],120);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});
test('Отсутствие подходящего кодека дает ошибку вместо ложного состояния записи',async()=>{
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
  const window={missionMedia:{busy:()=>analysisBusy,submit:(...args)=>submissions.push(args)},AudioContext:AudioEngine,MediaRecorder:Recorder,devicePixelRatio:1,addEventListener:(name,handler)=>windowEvents.set(name,handler),missionDiary:{register(_mode,value){engine=value;},lock(_mode,value){locks.push(value);},open(){}},missionSpeech:{stop(){},start(){}}};
  vm.runInNewContext(voiceSource,{window,document,MediaRecorder:Recorder,Blob,URL:ClipURL,URLSearchParams,Date,location:{search:''},matchMedia:()=>({matches:false}),localStorage:{getItem(){return null;},setItem(){}},performance:{now:()=>1000},navigator:{mediaDevices:{getUserMedia:()=>permission?.promise||Promise.resolve(incoming)}},setTimeout:callback=>{timers.set(++timer,callback);return timer;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{observe(){}}});
  engine.enter();
  return{node,label,incoming,recorders,engines,locks,submissions,engine,start:async()=>{node('voice-mic').emit('click');await settle();},expire(){for(const callback of [...timers.values()])callback();}};
}

test('Аудио сразу записывает микрофон и отмечает активную запись',async()=>{
  const f=voiceFixture();await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');assert.equal(f.recorders[0].stream.getVideoTracks().length,0);assert.equal(f.node('voice-mic').dataset.recording,'true');assert.equal(f.node('voice-source').textContent,'ЗАПИСЬ АУДИО');assert.equal(f.locks.at(-1),true);
});
test('Повторное нажатие Аудио передает запись в анализ без плеера',async()=>{
  const f=voiceFixture();await f.start();f.node('voice-mic').emit('click');assert.equal(f.node('voice-mic').disabled,true);await settle();assert.equal(f.submissions.length,1);assert.equal(f.submissions[0][0],'audio');assert.ok(f.submissions[0][1] instanceof Blob);assert.ok(f.incoming.getTracks().every(t=>t.stopped));assert.equal(f.engines[0].state,'closed');assert.equal(f.locks.at(-1),false);assert.equal(f.node('voice-mic').disabled,false);
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
  const f=voiceFixture();await f.start();f.expire();await settle();assert.equal(f.recorders[0].state,'inactive');assert.equal(f.submissions.length,1);assert.ok(f.incoming.getTracks().every(t=>t.stopped));
});

const analysisSource=await readFile(new URL('../public/media-analysis.js',import.meta.url),'utf8');
function analysisFixture({failFirst=false,analysis,request}={}){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},calls=[],locks=[],frames=new Map();let index=0,ids=0;const engines=[];
  class AudioEngine{constructor(){this.state='running';engines.push(this);}resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}createMediaStreamSource(){return{connect(){},disconnect(){}};}createAnalyser(){return{fftSize:2048,disconnect(){},getFloatTimeDomainData(samples){samples.fill(.1);}};}}
  const window={missionVoiceAnalysis:analysis?{analyze:analysis,transcript(){}}:undefined,AudioContext:AudioEngine,missionDiary:{lock:(...args)=>locks.push(args)},missionSpeech:{finish:async()=>'Распознанная речь'},missionCheckin:{current:()=>({score:74,wellbeingScale:100})}};
  vm.runInNewContext(analysisSource,{window,document:{getElementById:node,querySelector:node,createElement:()=>new Element()},crypto:{randomUUID:()=>ids++?'ad511184-9b59-4529-9ffa-'+String(ids).padStart(12,'0'):identifierForClient},FormData,Blob,AbortSignal,URL,performance,Float32Array,setTimeout,clearTimeout,requestAnimationFrame:callback=>{frames.set(++index,callback);return index;},cancelAnimationFrame:id=>frames.delete(id),fetch:async(_url,options)=>{calls.push(options.body);if(request)return request(options.body);return failFirst&&calls.length===1?Response.json({saved:true,status:'pending'},{status:503}):Response.json({status:'analyzed',analysis:'Ответ модели'});}});
  return{api:window.missionMedia,node,calls,locks,frames,engines,window};
}
const identifierForClient='ad511184-9b59-4529-9ffa-69cfe258c81e';
test('Готовая аудиозапись автоматически отправляется с речью и самооценкой',async()=>{const f=analysisFixture();await f.api.submit('audio',new Blob(['audio']),2);assert.equal(f.calls.length,1);assert.equal(f.calls[0].get('kind'),'audio');assert.equal(f.calls[0].get('transcript'),'Распознанная речь');assert.equal(JSON.parse(f.calls[0].get('wellbeing')).score,74);assert.equal(f.api.busy('audio'),false);});
test('Ошибка анализа сохраняет повтор с тем же идентификатором',async()=>{const f=analysisFixture({failFirst:true});await f.api.submit('audio',new Blob(['audio']),2);const root=f.node('#voice-dialog').children[0].children[0];assert.match(root.children[1].textContent,/Запись сохранена/);assert.equal(root.children[3].hidden,false);root.children[3].emit('click');await settle();assert.equal(f.calls.length,2);assert.equal(f.calls[0].get('id'),f.calls[1].get('id'));assert.equal(root.children[2].textContent,'Ответ модели');});
test('Индикатор видео вычисляет уровень из сигнала и сбрасывается после отключения',()=>{const f=analysisFixture(),meter=f.api.meter('video-log');meter.prepare();meter.attach(media());[...f.frames.values()][0](200);assert.equal(f.node('video-log-level').textContent,'-20 dBFS');assert.ok(parseFloat(f.node('video-log-level-fill').style.width)>0);meter.stop();assert.equal(f.node('video-log-level').textContent,'-');assert.equal(f.node('video-log-level-fill').style.width,'0%');assert.equal(f.engines[0].state,'closed');});


test('Незавершенный анализ не блокирует новую аудио и видеозапись',async()=>{
  for(const create of [fixture,voiceFixture]){const f=create({analysisBusy:true}),key=create===fixture?'video-log-camera':'voice-mic';assert.equal(f.node(key).disabled,false);await f.start();assert.equal(f.recorders.length,1);assert.equal(f.recorders[0].state,'recording');}
});
test('Долгая загрузка модели оставляет кнопки доступными и сохраняет следующие записи в очереди',async()=>{
  const wait=deferred(),seen=[],f=analysisFixture({analysis:async(_kind,blob)=>{seen.push(await blob.text());if(seen.length===1)await wait.promise;return null;}});
  const first=f.api.submit('audio',new Blob(['первая']),2);await settle();const second=f.api.submit('audio',new Blob(['вторая']),3);await settle();
  assert.equal(f.api.busy('audio'),true);assert.equal(f.node('voice-mic').disabled,false);assert.equal(f.node('video-log-camera').disabled,false);assert.equal(f.locks.length,0);assert.deepEqual(seen,['первая']);
  assert.match(f.node('#voice-dialog').children[0].children[1].children[1].textContent,/В очереди/);
  wait.resolve();await Promise.all([first,second]);assert.deepEqual(seen,['первая','вторая']);assert.equal(f.calls.length,2);assert.notEqual(f.calls[0].get('id'),f.calls[1].get('id'));assert.equal(await f.calls[0].get('file').text(),'первая');assert.equal(await f.calls[1].get('file').text(),'вторая');assert.equal(f.api.busy('audio'),false);
});
test('Завершение старого запроса не меняет состояние кнопки новой активной записи',async()=>{
  const wait=deferred(),f=analysisFixture({request:async()=>{await wait.promise;return Response.json({status:'analyzed',analysis:'Готово'});}}),pending=f.api.submit('audio',new Blob(['звук']),2);await settle();f.node('voice-mic').disabled=true;wait.resolve();await pending;assert.equal(f.node('voice-mic').disabled,true);assert.equal(f.locks.length,0);
});
const diarySource=await readFile(new URL('../public/media-diary.js',import.meta.url),'utf8');
function diaryFixture(){
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const dialog=node('media-diary-dialog');dialog.open=false;dialog.querySelectorAll=()=>[];dialog.querySelector=()=>node('analysis-caption');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.emit('close');};
  node('video-log-background').closest=()=>null;node('voice-dialog').querySelector=()=>null;
  let api;const sandbox={window:{missionActivity:{record(){}},},document:{getElementById:node,querySelectorAll:()=>[]},MutationObserver:class{observe(){}}};vm.runInNewContext(diarySource,sandbox);api=sandbox.window.missionDiary;return{api,node,dialog};
}
test('Дневник одновременно показывает Видео и Аудио без переключателя',()=>{
  const f=diaryFixture(),starts=[],stops=[];for(const kind of ['audio','video'])f.api.register(kind,{enter(){starts.push(kind);},leave(){stops.push(kind);}});
  f.api.open();assert.equal(f.dialog.dataset.mode,'combined');assert.equal(f.node('video-log-dialog').hidden,false);assert.equal(f.node('voice-dialog').hidden,false);assert.deepEqual(starts,['audio','video']);
  f.api.lock('video',true);f.api.open('audio');assert.equal(f.node('voice-dialog').scrolled,true);assert.deepEqual(starts,['audio','video']);assert.deepEqual(stops,[]);assert.equal(f.dialog.dataset.recording,'true');
});
test('Остановка одного формата сохраняет состояние записи другого',()=>{
  const f=diaryFixture();f.api.open();f.api.lock('video',true);f.api.lock('audio',true);f.api.lock('audio',false);assert.equal(f.dialog.dataset.recording,'true');f.api.lock('video',false);assert.equal(f.dialog.dataset.recording,'false');
});
test('Закрытие общего дневника освобождает оба формата записи',()=>{
  const f=diaryFixture(),stops=[];for(const kind of ['audio','video'])f.api.register(kind,{enter(){},leave(){stops.push(kind);}});f.api.open('audio');f.api.lock('video',true);f.api.lock('audio',true);f.dialog.close();assert.deepEqual(stops,['audio','video']);assert.equal(f.dialog.dataset.recording,'false');assert.equal(f.dialog.open,false);
});

test('Новая запись не подменяет расшифровку старой записи',async()=>{const speech=await readFile(new URL('../public/speech.js',import.meta.url),'utf8'),part=speech.slice(speech.indexOf('  async function finish('),speech.indexOf('  window.missionSpeech=')),state={version:1,processing:true,queue:[],transcript:'Старый голос'},context={states:new Map([['voice',state]]),stop(){},Date,setTimeout(callback){state.version++;state.processing=false;state.transcript='Новый голос';callback();}};vm.runInNewContext(part+'globalThis.finish=finish;',context);assert.equal(await context.finish('voice'),'');});
