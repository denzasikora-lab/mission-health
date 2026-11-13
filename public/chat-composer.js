(() => {
  const views=new Set(),voices=new Map();
  const icons={clip:'<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/>'};
  function button(label,icon){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);b.title=label;b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg>';return b;}
  function resize(view){const input=view.input;input.style.height='auto';input.style.height=Math.min(Math.max(input.scrollHeight,60),200)+'px';}
  function releaseDraft(voice){if(voice.store.voiceToken===voice){voice.store.dictating=false;voice.store.voiceToken=null;}}
  function stop(view,discard=false){const voice=voices.get(view);if(!voice)return;if(discard||!voice.recorder)voice.cancelled=true;clearTimeout(voice.timer);if(voice.recorder?.state==='recording')voice.recorder.stop();voice.stream?.getTracks().forEach(track=>track.stop());if(discard||voice.cancelled){releaseDraft(voice);if(discard)voice.store.notice='';voices.delete(view);refresh(view);}}
  function refresh(view){
    if(!view.chatTools)return;
    const enabled=['chat','team'].includes(view.kind),s=enabled?view.chatAdapter.store(view.kind):null;
    view.chatTools.hidden=!enabled;view.chatFiles.hidden=!enabled;view.chatFiles.replaceChildren();
    view.chatClip.disabled=Boolean(s?.busy||s?.files?.length>=4);view.chatMic.disabled=Boolean(s?.busy||voices.get(view)?.processing);
    const voice=voices.get(view),label=voice&&!voice.processing?'Stop voice input':'Voice input';view.chatMic.setAttribute('aria-label',label);view.chatMic.title=label;view.chatMic.setAttribute('aria-pressed',String(Boolean(voice&&!voice.processing)));
    for(const file of s?.files||[]){
      const item=document.createElement('div');item.className='chat-pending-file';const name=document.createElement('span');name.textContent=file.name+(file.error?' / upload error':file.id?'':' / uploading...');
      const remove=button('Remove file '+file.name,'<path d="m6 6 12 12M18 6 6 18"/>');remove.disabled=s.busy;remove.addEventListener('click',()=>{s.files=s.files.filter(value=>value!==file);s.pending=null;view.chatAdapter.render();});item.append(name,remove);view.chatFiles.append(item);
    }
    resize(view);
  }
  async function upload(view,files){
    const kind=view.kind,s=view.chatAdapter.store(kind);if(!['chat','team'].includes(kind)||s.busy)return;
    for(const file of files){
      if(s.files.length>=4){s.notice='You can attach up to four files to a message.';break;}
      if(!file.size||file.size>20000000){s.notice='File size must be from 1 byte to 20 MB.';continue;}
      const item={name:file.name,bytes:file.size};s.files.push(item);s.pending=null;view.chatAdapter.render();
      try{const form=new FormData();form.set('room',kind==='team'?'team':'private');form.set('file',file);const response=await fetch('/api/chat-files',{method:'POST',body:form});const result=await response.json();if(!response.ok||!result.file?.id)throw new Error();Object.assign(item,result.file);}
      catch{item.error=true;s.notice='Could not attach the file. Remove it and select it again.';}
      view.chatAdapter.render();
    }
  }
  async function microphone(view){
    if(voices.has(view)){stop(view);return;}
    const kind=view.kind,s=view.chatAdapter.store(kind);if(s.busy)return;
    s.dictating=true;const voice={cancelled:false,processing:false,chunks:[],store:s};s.voiceToken=voice;voices.set(view,voice);s.notice='Connecting microphone...';view.chatAdapter.render();
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
        voice.processing=true;s.notice='Recognizing speech...';view.chatAdapter.render();
        try{
          const blob=new Blob(voice.chunks,{type:voice.recorder.mimeType});if(!blob.size)throw new Error();
          const form=new FormData();form.set('mode',voice.mode);form.set('file',blob,voice.recorder.mimeType.includes('mp4')?'voice.m4a':'voice.webm');
          const response=await fetch('/api/transcriptions',{method:'POST',body:form}),result=await response.json();if(!response.ok||!result.text?.trim())throw new Error();if(voice.cancelled)return;
          s.draft=(s.draft.trimEnd()+(s.draft.trim()?' ':'')+result.text.trim()).slice(0,6000);s.pending=null;s.notice='';
        }catch{if(!voice.cancelled)s.notice='Could not recognize speech. Message text preserved.';}
        finally{releaseDraft(voice);if(voices.get(view)===voice)voices.delete(view);view.chatAdapter.render();}
      });
      voice.recorder.start();voice.timer=setTimeout(()=>stop(view),90000);s.notice='Speak. Press the microphone again, to insert text.';
    }catch(error){releaseDraft(voice);voice.stream?.getTracks().forEach(track=>track.stop());if(!voice.cancelled)s.notice=error.message==='not_configured'?'Speech recognition is not configured.':'Could not enable the microphone. Check browser permission.';if(voices.get(view)===voice)voices.delete(view);}
    view.chatAdapter.render();
  }
  function attach(view,adapter){
    view.chatAdapter=adapter;views.add(view);
    const tools=document.createElement('div');tools.className='chat-composer-tools';view.chatTools=tools;
    view.chatClip=button('Attach file',icons.clip);view.chatMic=button('Voice input',icons.mic);
    const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.hidden=true;picker.setAttribute('aria-label','Message files');
    view.chatFiles=document.createElement('div');view.chatFiles.className='chat-pending-files';view.input.before(view.chatFiles,picker);
    tools.append(view.chatClip,view.chatMic);view.form.querySelector('footer').prepend(tools);
    view.chatClip.addEventListener('click',()=>picker.click());picker.addEventListener('change',()=>{const files=[...picker.files];picker.value='';void upload(view,files);});
    view.chatMic.addEventListener('click',()=>void microphone(view));
    view.input.addEventListener('input',()=>resize(view));refresh(view);
  }
  function contextChanged(view){stop(view,true);refresh(view);}
  window.addEventListener('pagehide',()=>{for(const view of views)stop(view,true);});
  window.missionChatComposer={attach,refresh,contextChanged,stopWithin:root=>{for(const view of views)if(root.contains(view.host))stop(view,true);}};
})();
