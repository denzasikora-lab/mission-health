(() => {
  const states=new Map();let config={api:false,local:false,airGap:false},mode='api';
  try{if(localStorage.getItem('mission-health-speech-mode')==='local')mode='local';}catch{}
  const labels={speech_air_gap:'Cloud отключен в режиме air gap.',speech_local_not_connected:'On prem / локальная модель еще не подключена. Звук не отправляется в облако.',speech_api_not_configured:'Cloud / распознавание не настроено на сервере.',speech_upstream_error:'Сервис распознавания временно недоступен.',speech_local_unavailable:'Локальный адаптер не ответил. В облако звук не отправляется.',speech_too_large:'Фрагмент звука превышает допустимый размер.',speech_invalid_audio:'Формат звука не поддерживается.'};
  function available(){return mode==='local'?config.local:config.api&&!config.airGap;}
  function idle(){return mode==='local'&&!config.local?labels.speech_local_not_connected:mode==='api'&&!config.api?labels.speech_api_not_configured:'Текст появится автоматически, когда ты начнешь говорить.';}
  function panel(id,anchor){
    const box=document.createElement('section');box.className='speech-panel';box.id='speech-'+id;
    box.innerHTML='<header><h3>Текст из голоса <i aria-hidden="true"></i></h3><div class="speech-mode" role="group" aria-label="Обработка речи"><span class="speech-mode-highlight" aria-hidden="true"></span><button type="button" data-mode="api" aria-pressed="true">Cloud</button><button type="button" data-mode="local" aria-pressed="false">On prem</button></div></header><p class="speech-privacy"></p><label class="speech-text-label"><span class="sr-only">Текст распознавания</span><textarea rows="3" maxlength="40000" aria-label="Текст распознавания" placeholder="Говори / текст появится здесь"></textarea></label><div class="speech-bottom"><p class="speech-status" role="status"></p><div class="speech-actions"><button type="button" class="speech-chat" hidden>Вставить в чат</button><a class="speech-download" hidden>Скачать текст</a></div></div>';
    anchor.after(box);
    const state={id,box,status:box.querySelector('.speech-status'),textarea:box.querySelector('textarea'),version:0,queue:[],tracks:[],active:false,captureVersion:0};states.set(id,state);
    box.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>chooseMode(button.dataset.mode)));
    box.querySelector('.speech-chat').addEventListener('click',()=>{const value=state.textarea.value.trim();if(!value)return;document.getElementById(id==='voice'?'voice-dialog':'video-log-dialog').close();window.missionDesign?.navigate('diary');const input=document.getElementById('journal-input');input.value=value.slice(0,6000);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();});
    state.textarea.addEventListener('input',()=>updateText(state));state.status.textContent=idle();render(state);return state;
  }
  function updateText(state){
    const has=Boolean(state.textarea.value.trim());state.box.querySelector('.speech-chat').hidden=!has;const link=state.box.querySelector('.speech-download');
    if(state.textUrl)URL.revokeObjectURL(state.textUrl);state.textUrl=has?URL.createObjectURL(new Blob([state.textarea.value],{type:'text/plain;charset=utf-8'})):null;link.hidden=!has;
    if(has){link.href=state.textUrl;link.download='mission-health-transcript.txt';}
  }
  function render(state){
    state.box.dataset.mode=mode;state.box.dataset.listening=String(state.active&&available());
    state.box.querySelectorAll('[data-mode]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.mode===mode));button.disabled=button.dataset.mode==='api'&&config.airGap;});
    state.box.querySelector('.speech-privacy').textContent=mode==='local'?'On prem / только локальный адаптер. Без отправки звука в облако.':'Cloud / звук автоматически отправляется в Whisper через ProxyAPI. Видео остается на устройстве.';
  }
  function cancelRequests(state){state.version++;state.controller?.abort();state.controller=null;state.processing=false;state.queue=[];clearTimeout(state.retryTimer);state.segmenter?.clear();}
  function chooseMode(value){
    if(value===mode||value==='api'&&config.airGap)return;mode=value;
    try{localStorage.setItem('mission-health-speech-mode',mode);}catch{}
    for(const state of states.values()){cancelRequests(state);state.status.textContent=available()&&state.active?'Слушаю / распознавание включено для новой речи.':idle();render(state);}
  }
  function reset(id){
    const state=states.get(id);if(!state)return;
    release(state,false);cancelRequests(state);state.textarea.value='';state.error=null;updateText(state);state.status.textContent=idle();render(state);
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
    if(!input.getAudioTracks().length||!AudioContext){state.status.textContent='Распознавание звука недоступно в этом браузере.';return;}
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
      state.status.textContent=available()?'Слушаю / текст появляется фрагментами во время речи.':idle();render(state);
    }catch{if(version===state.captureVersion){release(state,false);state.status.textContent='Не удалось включить распознавание. Переподключи микрофон.';render(state);}}
  }
  function stop(id){const state=states.get(id);if(!state||!state.active&&!state.context)return;release(state,true);if(!state.processing&&!state.queue.length)state.status.textContent=state.error|| (state.textarea.value.trim()?'Текст готов. Можно исправить, скачать или сохранить в дневник.':idle());render(state);}
  function enqueue(state,blob){
    if(!available())return;
    state.queue.push({blob,mode,attempt:0});void drain(state);
  }
  async function drain(state){
    if(state.processing||!state.queue.length)return;
    const version=state.version,chosen=mode,item=state.queue[0];if(item.mode!==chosen){state.queue.shift();void drain(state);return;}
    const controller=new AbortController();state.controller=controller;state.processing=true;state.status.textContent='Распознаю речь'+(state.queue.length>1?' / '+state.queue.length+' фрагм.':'...');
    let retry=false;
    try{
      const form=new FormData();form.set('mode',chosen);form.set('file',item.blob,'voice.wav');
      const response=await fetch('/api/transcriptions',{method:'POST',body:form,signal:controller.signal});const result=await response.json();
      if(version!==state.version||chosen!==mode)return;if(!response.ok)throw new Error(result.error||'speech_upstream_error');
      if(result.text?.trim()){state.textarea.value=(state.textarea.value.trim()+' '+result.text.trim()).trim().slice(0,40000);updateText(state);}
      state.queue.shift();state.error=null;
    }catch(error){
      if(version!==state.version||error.name==='AbortError')return;
      if(item.attempt++<2){retry=true;state.status.textContent='Сервис занят / повторяю фрагмент...';}
      else{state.queue.shift();state.error=(labels[error.message]||'Распознавание недоступно.')+' Не все фрагменты распознаны.';}
    }finally{
      if(state.controller===controller){state.processing=false;state.controller=null;
        if(retry)state.retryTimer=setTimeout(()=>void drain(state),1500);
        else if(state.queue.length)void drain(state);
        else state.status.textContent=state.error||(state.active?'Слушаю / текст обновляется автоматически.':state.textarea.value.trim()?'Текст готов. Можно исправить, скачать или сохранить в дневник.':idle());
      }
    }
  }
  panel('voice',document.getElementById('voice-notice'));panel('video',document.querySelector('.log-earth'));
  window.missionSpeech={start,stop,reset};
  fetch('/api/transcriptions/config',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject()).then(value=>{config=value;if(config.airGap){mode='local';for(const state of states.values())cancelRequests(state);}for(const state of states.values()){render(state);state.status.textContent=state.active&&available()?'Слушаю / текст появляется автоматически.':idle();}}).catch(()=>{for(const state of states.values())state.status.textContent='Не удалось загрузить настройки распознавания.';});
  window.addEventListener('pagehide',()=>{for(const state of states.values())reset(state.id);});
})();
