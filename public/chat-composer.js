(() => {
  const views=new Set(),voices=new Map();
  const icons={clip:'<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/>',expand:'<path d="M8 3H3v5m0-5 6 6m7-6h5v5m0-5-6 6M3 16v5h5m-5 0 6-6m12 1v5h-5m5 0-6-6"/>'};
  function button(label,icon){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);b.title=label;b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg>';return b;}
  function resize(view){const input=view.input;input.style.height='auto';input.style.height=Math.min(Math.max(input.scrollHeight,view.form.dataset.expanded==='true'?160:60),view.form.dataset.expanded==='true'?400:200)+'px';}
  function releaseDraft(voice){if(voice.store.voiceToken===voice){voice.store.dictating=false;voice.store.voiceToken=null;}}
  function stop(view,discard=false){const voice=voices.get(view);if(!voice)return;if(discard||!voice.recorder)voice.cancelled=true;clearTimeout(voice.timer);if(voice.recorder?.state==='recording')voice.recorder.stop();voice.stream?.getTracks().forEach(track=>track.stop());if(discard||voice.cancelled){releaseDraft(voice);if(discard)voice.store.notice='';voices.delete(view);refresh(view);}}
  function refresh(view){
    if(!view.chatTools)return;
    const enabled=['chat','team'].includes(view.kind),s=enabled?view.chatAdapter.store(view.kind):null;
    view.chatTools.hidden=!enabled;view.chatFiles.hidden=!enabled;view.chatFiles.replaceChildren();
    view.chatClip.disabled=Boolean(s?.busy||s?.files?.length>=4);view.chatMic.disabled=Boolean(s?.busy||voices.get(view)?.processing);
    const voice=voices.get(view),label=voice&&!voice.processing?'Остановить голосовой ввод':'Голосовой ввод';view.chatMic.setAttribute('aria-label',label);view.chatMic.title=label;view.chatMic.setAttribute('aria-pressed',String(Boolean(voice&&!voice.processing)));
    for(const file of s?.files||[]){
      const item=document.createElement('div');item.className='chat-pending-file';const name=document.createElement('span');name.textContent=file.name+(file.error?' / ошибка загрузки':file.id?'':' / загрузка...');
      const remove=button('Убрать файл '+file.name,'<path d="m6 6 12 12M18 6 6 18"/>');remove.disabled=s.busy;remove.addEventListener('click',()=>{s.files=s.files.filter(value=>value!==file);s.pending=null;view.chatAdapter.render();});item.append(name,remove);view.chatFiles.append(item);
    }
    resize(view);
  }
  async function upload(view,files){
    const kind=view.kind,s=view.chatAdapter.store(kind);if(!['chat','team'].includes(kind)||s.busy)return;
    for(const file of files){
      if(s.files.length>=4){s.notice='К сообщению можно добавить до четырех файлов.';break;}
      if(!file.size||file.size>20000000){s.notice='Файл должен быть от 1 байта до 20 МБ.';continue;}
      const item={name:file.name,bytes:file.size};s.files.push(item);s.pending=null;view.chatAdapter.render();
      try{const form=new FormData();form.set('room',kind==='team'?'team':'private');form.set('file',file);const response=await fetch('/api/chat-files',{method:'POST',body:form});const result=await response.json();if(!response.ok||!result.file?.id)throw new Error();Object.assign(item,result.file);}
      catch{item.error=true;s.notice='Не удалось прикрепить файл. Убери его и выбери еще раз.';}
      view.chatAdapter.render();
    }
  }
  async function microphone(view){
    if(voices.has(view)){stop(view);return;}
    const kind=view.kind,s=view.chatAdapter.store(kind);if(s.busy)return;
    s.dictating=true;const voice={cancelled:false,processing:false,chunks:[],store:s};s.voiceToken=voice;voices.set(view,voice);s.notice='Подключаю микрофон...';view.chatAdapter.render();
    try{
      const response=await fetch('/api/transcriptions/config',{cache:'no-store'}),config=await response.json();voice.mode=config.airGap?'local':config.api?'api':'local';
      if(!response.ok||voice.mode==='local'&&!config.local)throw new Error('not_configured');
      if(voice.cancelled||view.kind!==kind)return;
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('unsupported');
      voice.stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(voice.cancelled||view.kind!==kind){voice.stream.getTracks().forEach(track=>track.stop());return;}
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(value=>MediaRecorder.isTypeSupported(value));
      voice.recorder=new MediaRecorder(voice.stream,mime?{mimeType:mime}:{});
      voice.recorder.addEventListener('dataavailable',event=>{if(event.data.size)voice.chunks.push(event.data);});
      voice.recorder.addEventListener('stop',async()=>{
        voice.stream.getTracks().forEach(track=>track.stop());clearTimeout(voice.timer);if(voice.cancelled)return;
        voice.processing=true;s.notice='Распознаю речь...';view.chatAdapter.render();
        try{
          const blob=new Blob(voice.chunks,{type:voice.recorder.mimeType});if(!blob.size)throw new Error();
          const form=new FormData();form.set('mode',voice.mode);form.set('file',blob,voice.recorder.mimeType.includes('mp4')?'voice.m4a':'voice.webm');
          const response=await fetch('/api/transcriptions',{method:'POST',body:form}),result=await response.json();if(!response.ok||!result.text?.trim())throw new Error();if(voice.cancelled)return;
          s.draft=(s.draft.trimEnd()+(s.draft.trim()?' ':'')+result.text.trim()).slice(0,6000);s.pending=null;s.notice='';
        }catch{if(!voice.cancelled)s.notice='Не удалось распознать речь. Текст сообщения сохранен.';}
        finally{releaseDraft(voice);if(voices.get(view)===voice)voices.delete(view);view.chatAdapter.render();}
      });
      voice.recorder.start();voice.timer=setTimeout(()=>stop(view),90000);s.notice='Говори. Нажми микрофон еще раз, чтобы вставить текст.';
    }catch(error){releaseDraft(voice);voice.stream?.getTracks().forEach(track=>track.stop());if(!voice.cancelled)s.notice=error.message==='not_configured'?'Распознавание речи не настроено.':'Не удалось включить микрофон. Проверь разрешение браузера.';if(voices.get(view)===voice)voices.delete(view);}
    view.chatAdapter.render();
  }
  function attach(view,adapter){
    view.chatAdapter=adapter;views.add(view);
    const tools=document.createElement('div');tools.className='chat-composer-tools';view.chatTools=tools;
    view.chatClip=button('Прикрепить файл',icons.clip);view.chatMic=button('Голосовой ввод',icons.mic);const expand=button('Развернуть поле сообщения',icons.expand);expand.setAttribute('aria-expanded','false');
    const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.hidden=true;picker.setAttribute('aria-label','Файлы сообщения');
    view.chatFiles=document.createElement('div');view.chatFiles.className='chat-pending-files';view.input.before(view.chatFiles,picker);
    tools.append(view.chatClip,view.chatMic,expand);view.form.querySelector('footer').prepend(tools);
    view.chatClip.addEventListener('click',()=>picker.click());picker.addEventListener('change',()=>{const files=[...picker.files];picker.value='';void upload(view,files);});
    view.chatMic.addEventListener('click',()=>void microphone(view));
    expand.addEventListener('click',()=>{const expanded=view.form.dataset.expanded!=='true';view.form.dataset.expanded=String(expanded);expand.setAttribute('aria-expanded',String(expanded));const label=expanded?'Свернуть поле сообщения':'Развернуть поле сообщения';expand.setAttribute('aria-label',label);expand.title=label;resize(view);view.input.focus();});
    view.input.addEventListener('input',()=>resize(view));refresh(view);
  }
  function contextChanged(view){stop(view,true);refresh(view);}
  window.addEventListener('pagehide',()=>{for(const view of views)stop(view,true);});
  window.missionChatComposer={attach,refresh,contextChanged,stopWithin:root=>{for(const view of views)if(root.contains(view.host))stop(view,true);}};
})();
