(() => {
  const dialog=document.getElementById('media-diary-dialog');
  const panels={audio:document.getElementById('voice-dialog'),video:document.getElementById('video-log-dialog')};
  const buttons=[...dialog.querySelectorAll('[data-diary-mode]')],engines=new Map();
  let current='audio',locked=false;
  function render(){
    dialog.dataset.mode=current;
    for(const [mode,panel]of Object.entries(panels))panel.hidden=mode!==current;
    for(const button of buttons){const selected=button.dataset.diaryMode===current;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;button.disabled=locked&&!selected;}
    dialog.querySelector('[data-diary-video-analysis]').hidden=current!=='video';
  }
  function open(mode='audio'){
    if(!panels[mode]||dialog.open&&locked&&mode!==current)return;
    if(dialog.open&&mode===current)return;
    if(dialog.open)engines.get(current)?.leave();
    current=mode;locked=false;render();
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
      event.preventDefault();const next=event.key==='Home'?'audio':event.key==='End'?'video':current==='audio'?'video':'audio';
      open(next);buttons.find(node=>node.dataset.diaryMode===next).focus();
    });
  }
  document.querySelectorAll('[data-open-media-diary]').forEach(button=>button.addEventListener('click',()=>open('audio')));
  window.missionDiary={open,register,lock};render();
})();
