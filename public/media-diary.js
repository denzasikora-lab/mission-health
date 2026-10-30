(() => {
  const dialog=document.getElementById('media-diary-dialog');
  const panels={audio:document.getElementById('voice-dialog'),video:document.getElementById('video-log-dialog')};
  const engines=new Map(),recordings=new Set();
  const backgroundChoice=document.getElementById('video-log-background')?.closest('label');
  if(backgroundChoice){backgroundChoice.classList.add('diary-background-choice');panels.video.querySelector('.log-controls').prepend(backgroundChoice);}
  const voiceViews=panels.audio.querySelector('.voice-view-control'),voiceActions=panels.audio.querySelector('.voice-actions');
  if(voiceViews&&voiceActions){
    const choice=document.createElement('select');choice.id='voice-style';choice.className='diary-voice-choice';choice.setAttribute('aria-label','Вид голосовой волны');choice.title='Вид голосовой волны';
    for(const button of voiceViews.querySelectorAll('[data-voice-style]')){const option=document.createElement('option');option.value=button.dataset.voiceStyle;option.textContent={silo:'Silo',particles:'Частицы',wave:'Волна'}[option.value]||button.textContent;option.title=button.textContent;option.selected=button.getAttribute('aria-pressed')==='true';choice.append(option);}
    voiceViews.remove();voiceActions.append(choice);
  }
  const compactLabels={'Включить камеру':'Камера','Выключить камеру':'Выключить','Новая запись':'Еще запись','Начать запись':'Запись','Остановить запись':'Стоп','Подготовка записи':'Обработка','Включить микрофон':'Микрофон','Выключить микрофон':'Выключить','Отменить подключение':'Отмена','Посмотреть демо':'Демо','Остановить демо':'Стоп демо'};
  for(const id of ['video-log-camera','voice-mic']){
    const button=document.getElementById(id);if(!button)continue;
    button.classList.add('diary-compact-button');
    const syncLabel=()=>{const label=button.textContent.trim();button.title=label;button.setAttribute('aria-label',label);button.dataset.compactLabel=id==='voice-mic'?'Аудио':compactLabels[label]||label;};
    syncLabel();new MutationObserver(syncLabel).observe(button,{childList:true,subtree:true,characterData:true});
  }
  function render(){
    dialog.dataset.mode='combined';
    for(const panel of Object.values(panels))panel.hidden=false;
    dialog.querySelector('[data-diary-video-analysis]').hidden=false;
  }
  function open(mode='video'){
    if(!panels[mode])return;
    render();
    if(!dialog.open){
      recordings.clear();dialog.dataset.recording='false';dialog.showModal();
      void window.missionActivity?.record('media_open',{mode});
      for(const engine of engines.values()){engine.prepare?.();engine.enter();}
    }
    // Переход к аудио не прерывает уже работающую камеру.
    if(mode==='audio')panels.audio.scrollIntoView({behavior:'smooth',block:'start'});
    else dialog.scrollTop=0;
  }
  function register(mode,engine){engines.set(mode,engine);if(dialog.open){engine.prepare?.();engine.enter();}}
  function lock(mode,value){
    if(value)recordings.add(mode);else recordings.delete(mode);
    dialog.dataset.recording=String(recordings.size>0);
  }
  dialog.addEventListener('close',()=>{
    for(const engine of engines.values())engine.leave();
    recordings.clear();dialog.dataset.recording='false';render();
  });
  document.getElementById('diary-close').addEventListener('click',()=>dialog.close());
  document.querySelectorAll('[data-open-media-diary]').forEach(button=>button.addEventListener('click',()=>open('video')));
  window.missionDiary={open,register,lock};render();
})();
