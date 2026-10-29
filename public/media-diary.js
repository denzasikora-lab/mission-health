(() => {
  const dialog=document.getElementById('media-diary-dialog');
  const panels={audio:document.getElementById('voice-dialog'),video:document.getElementById('video-log-dialog')};
  const buttons=[...dialog.querySelectorAll('[data-diary-mode]')],engines=new Map();
  const backgroundChoice=document.getElementById('video-log-background')?.closest('label');
  if(backgroundChoice){backgroundChoice.classList.add('diary-background-choice');panels.video.querySelector('.log-controls').prepend(backgroundChoice);}
  const voiceViews=panels.audio.querySelector('.voice-view-control'),voiceActions=panels.audio.querySelector('.voice-actions');
  if(voiceViews&&voiceActions){
    const choice=document.createElement('select');choice.id='voice-style';choice.className='diary-voice-choice';choice.setAttribute('aria-label','Вид голосовой волны');choice.title='Вид голосовой волны';
    for(const button of voiceViews.querySelectorAll('[data-voice-style]')){const option=document.createElement('option');option.value=button.dataset.voiceStyle;option.textContent={silo:'Silo',particles:'Частицы',wave:'Волна'}[option.value]||button.textContent;option.title=button.textContent;option.selected=button.getAttribute('aria-pressed')==='true';choice.append(option);}
    voiceViews.remove();voiceActions.append(choice);
  }
  const compactLabels={'Включить камеру':'Камера','Выключить камеру':'Выключить','Новая запись':'Еще запись','Начать запись':'Запись','Остановить запись':'Стоп','Подготовка записи':'Обработка','Включить микрофон':'Микрофон','Выключить микрофон':'Выключить','Отменить подключение':'Отмена','Посмотреть демо':'Демо','Остановить демо':'Стоп демо'};
  for(const id of ['video-log-camera','video-log-record','voice-mic','voice-demo']){
    const button=document.getElementById(id);if(!button)continue;
    button.classList.add('diary-compact-button');
    const syncLabel=()=>{const label=button.textContent.trim();button.title=label;button.setAttribute('aria-label',label);button.dataset.compactLabel=compactLabels[label]||label;};
    syncLabel();new MutationObserver(syncLabel).observe(button,{childList:true,subtree:true,characterData:true});
  }
  let current='video',locked=false;
  function render(){
    dialog.dataset.mode=current;
    for(const [mode,panel]of Object.entries(panels))panel.hidden=mode!==current;
    for(const button of buttons){const selected=button.dataset.diaryMode===current;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;button.disabled=locked&&!selected;}
    dialog.querySelector('[data-diary-video-analysis]').hidden=current!=='video';
  }
  function open(mode='video'){
    if(!panels[mode]||dialog.open&&locked&&mode!==current)return;
    if(dialog.open&&mode===current)return;
    if(dialog.open)engines.get(current)?.leave();
    current=mode;locked=false;render();void window.missionActivity?.record('media_open',{mode});
    if(!dialog.open)dialog.showModal();
    for(const engine of engines.values())engine.prepare?.();
    engines.get(current)?.enter();
  }
  function register(mode,engine){engines.set(mode,engine);if(dialog.open){engine.prepare?.();if(current===mode)engine.enter();}}
  function lock(mode,value){if(current===mode){locked=value;render();}}
  dialog.addEventListener('close',()=>{engines.get(current)?.leave();locked=false;render();});
  document.getElementById('diary-close').addEventListener('click',()=>dialog.close());
  for(const button of buttons){
    button.addEventListener('click',()=>open(button.dataset.diaryMode));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||locked)return;
      event.preventDefault();const next=event.key==='Home'?'video':event.key==='End'?'audio':current==='audio'?'video':'audio';
      open(next);buttons.find(node=>node.dataset.diaryMode===next).focus();
    });
  }
  document.querySelectorAll('[data-open-media-diary]').forEach(button=>button.addEventListener('click',()=>open('video')));
  window.missionDiary={open,register,lock};render();
})();
