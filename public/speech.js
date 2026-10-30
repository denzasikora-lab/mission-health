(() => {
  const states=new Map();
  let config={api:false,local:false,airGap:false},mode='api';
  const labels={speech_air_gap:'Cloud отключен в режиме air gap.',speech_local_not_connected:'Локальная модель еще не подключена. Звук не отправляется в облако.',speech_api_not_configured:'Cloud / распознавание не настроено на сервере.',speech_upstream_error:'Сервис распознавания временно недоступен.',speech_local_unavailable:'Локальный адаптер не ответил. В облако звук не отправляется.',speech_too_large:'Фрагмент звука превышает допустимый размер.',speech_invalid_audio:'Формат звука не поддерживается.'};
  function available(){return mode==='local'?config.local:config.api&&!config.airGap;}
  function idle(){return mode==='local'&&!config.local?labels.speech_local_not_connected:mode==='api'&&!config.api?labels.speech_api_not_configured:mode==='local'?'Локальное распознавание / без отправки в облако.':'Whisper через ProxyAPI / в сервис передается только звук.';}
  function createState(id){const state={id,transcript:'',status:idle(),version:0,queue:[],tracks:[],active:false,captureVersion:0};states.set(id,state);render(state);}
  function render(state){
    const badge=document.querySelector('[data-speech-environment="'+state.id+'"]')||document.querySelector('[data-speech-environment="diary"]');if(!badge)return;
    const environmentLabel=mode==='local'||config.airGap?'On prem':'Cloud';
    badge.querySelector('span').textContent=environmentLabel;
    badge.querySelector('svg').innerHTML=environmentLabel==='On prem'?'<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>':'<path d="M7 18h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6-1.5A5 5 0 0 0 7 18Z"/>';
    badge.setAttribute('aria-label','Метка интерфейса: '+environmentLabel);
  }
  function cancelRequests(state){state.version++;state.controller?.abort();state.controller=null;state.processing=false;state.queue=[];clearTimeout(state.retryTimer);state.segmenter?.clear();}
  function reset(id){
    const state=states.get(id);if(!state)return;
    release(state,false);cancelRequests(state);state.transcript='';state.error=null;state.status=idle();render(state);
  }
  function release(state,flush){
    state.captureVersion++;state.active=false;if(state.processor?.port)state.processor.port.onmessage=null;
    state.source?.disconnect();state.processor?.disconnect();state.mute?.disconnect();
    state.context?.close().catch(()=>{});state.context=null;state.processor=null;state.source=null;state.mute=null;
    state.tracks.forEach(track=>track.stop());state.tracks=[];
    if(flush)state.segmenter?.flush();else state.segmenter?.clear();state.segmenter=null;
  }
  async function start(id,input){
    const state=states.get(id);if(!state)return;reset(id);
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!input.getAudioTracks().length||!AudioContext){state.status='Распознавание звука недоступно в этом браузере.';render(state);return;}
    const version=state.captureVersion;
    try{
      state.tracks=input.getAudioTracks().map(track=>track.clone());
      const context=new AudioContext();state.context=context;state.source=context.createMediaStreamSource(new MediaStream(state.tracks));state.mute=context.createGain();state.mute.gain.value=0;state.mute.connect(context.destination);
      state.segmenter=window.missionSpeechPcm.segmenter(context.sampleRate,blob=>enqueue(state,blob));
      const receive=block=>{if(state.active&&version===state.captureVersion&&available())state.segmenter?.push(block);};
      if(context.audioWorklet&&window.AudioWorkletNode){
        try{await context.audioWorklet.addModule('/speech-worklet.js?v=20261029-live1');if(version!==state.captureVersion){return;}state.processor=new AudioWorkletNode(context,'mission-speech-capture');state.processor.port.onmessage=event=>receive(event.data);}
        catch{if(version!==state.captureVersion)return;}
      }
      if(!state.processor){state.processor=context.createScriptProcessor(2048,1,1);state.processor.onaudioprocess=event=>receive(event.inputBuffer.getChannelData(0));}
      if(version!==state.captureVersion)return;
      state.active=true;state.source.connect(state.processor);state.processor.connect(state.mute);await context.resume();
      if(version!==state.captureVersion)return;
      state.status=available()?'Распознавание речи включено.':idle();render(state);
    }catch{if(version===state.captureVersion){release(state,false);state.status='Не удалось включить распознавание. Переподключи микрофон.';render(state);}}
  }
  function stop(id){const state=states.get(id);if(!state||!state.active&&!state.context)return;release(state,true);if(!state.processing&&!state.queue.length)state.status=state.error|| (state.transcript.trim()?'Распознавание завершено.':idle());render(state);}
  function enqueue(state,blob){
    if(!available())return;
    state.queue.push({blob,mode,attempt:0});void drain(state);
  }
  async function drain(state){
    if(state.processing||!state.queue.length)return;
    const version=state.version,chosen=mode,item=state.queue[0];if(item.mode!==chosen){state.queue.shift();void drain(state);return;}
    const controller=new AbortController();state.controller=controller;state.processing=true;state.status='Распознаю речь'+(state.queue.length>1?' / '+state.queue.length+' фрагм.':'...');render(state);
    let retry=false;
    try{
      const form=new FormData();form.set('mode',chosen);form.set('file',item.blob,'voice.wav');
      const response=await fetch('/api/transcriptions',{method:'POST',body:form,signal:controller.signal});const result=await response.json();
      if(version!==state.version||chosen!==mode)return;if(!response.ok)throw new Error(result.error||'speech_upstream_error');
      if(result.text?.trim()){state.transcript=(state.transcript.trim()+' '+result.text.trim()).trim().slice(0,40000);}
      state.queue.shift();state.error=null;
    }catch(error){
      if(version!==state.version||error.name==='AbortError')return;
      if(item.attempt++<2){retry=true;state.status='Сервис занят / повторяю фрагмент...';}
      else{state.queue.shift();state.error=(labels[error.message]||'Распознавание недоступно.')+' Не все фрагменты распознаны.';}
    }finally{
      if(state.controller===controller){state.processing=false;state.controller=null;
        if(retry)state.retryTimer=setTimeout(()=>void drain(state),1500);
        else if(state.queue.length)void drain(state);
        else state.status=state.error||(state.active?'Речь распознается автоматически.':state.transcript.trim()?'Распознавание завершено.':idle());
        render(state);
      }
    }
  }
  createState('voice');createState('video');
  async function finish(id){stop(id);const state=states.get(id),until=Date.now()+15000;while(state&&(state.processing||state.queue.length)&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));return state&&!state.processing&&!state.queue.length&&!state.error?state.transcript:'';}
  window.missionSpeech={start,stop,reset,finish,transcript:id=>states.get(id)?.transcript||''};
  fetch('/api/transcriptions/config',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject()).then(value=>{config=value;if(config.airGap){mode='local';for(const state of states.values())cancelRequests(state);}for(const state of states.values()){render(state);state.status=state.active&&available()?'Речь распознается автоматически.':idle();}}).catch(()=>{for(const state of states.values()){state.status='Не удалось загрузить настройки распознавания.';render(state);}});
  window.addEventListener('pagehide',()=>{for(const state of states.values())reset(state.id);});
})();
