(() => {
  const dialog=document.getElementById('media-diary-dialog');
  const panels={audio:document.getElementById('voice-dialog'),video:document.getElementById('video-log-dialog')};
  const engines=new Map(),recordings=new Set();
  let active=false;
  document.querySelector('.main-column').append(dialog);
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
    const visible=state.workspace==='crew'&&state.view==='diary';
    dialog.hidden=!visible;dialog.dataset.active=String(visible);document.body.dataset.diary=String(visible);
    dialog.dataset.mode='combined';
    for(const panel of Object.values(panels))panel.hidden=false;
    dialog.querySelector('[data-diary-video-analysis]').hidden=false;
    if(visible===active)return;
    active=visible;
    recordings.clear();dialog.dataset.recording='false';
    if(active){
      for(const engine of engines.values()){engine.prepare?.();engine.enter();}
      void window.missionActivity?.record('media_open',{mode:'video'});
      window.dispatchEvent(new Event('mission-diary-open'));
    }else{
      for(const engine of engines.values())engine.leave();
      window.dispatchEvent(new Event('mission-diary-close'));
    }
  }
  function open(mode='video'){
    if(!panels[mode])return;
    if(!active)window.missionDesign.navigate('diary');
    else render();
    // Переход к аудио не прерывает уже работающую камеру.
    if(mode==='audio')panels.audio.scrollIntoView({behavior:'smooth',block:'start'});
    else window.scrollTo({top:0,behavior:'auto'});
  }
  function close(){if(active)window.missionDesign.navigate('overview');}
  function register(mode,engine){engines.set(mode,engine);if(active){engine.prepare?.();engine.enter();}}
  function lock(mode,value){
    if(value)recordings.add(mode);else recordings.delete(mode);
    dialog.dataset.recording=String(recordings.size>0);
  }
  document.querySelectorAll('[data-open-media-diary]').forEach(button=>button.addEventListener('click',()=>open('video')));
  window.missionDiary={open,close,render,register,lock,get active(){return active;}};render();
})();
