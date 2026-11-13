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
    const choice=document.createElement('select');choice.id='voice-style';choice.className='diary-voice-choice';choice.setAttribute('aria-label','Voice waveform style');choice.title='Voice waveform style';
    for(const button of voiceViews.querySelectorAll('[data-voice-style]')){const option=document.createElement('option');option.value=button.dataset.voiceStyle;option.textContent={silo:'Silo',particles:'Particles',wave:'Wave'}[option.value]||button.textContent;option.title=button.textContent;option.selected=button.getAttribute('aria-pressed')==='true';choice.append(option);}
    voiceViews.remove();voiceActions.append(choice);
  }
  const audioStage=panels.audio.querySelector('.voice-stage');
  if(audioStage&&voiceActions){
    const capture=document.createElement('div');capture.className='diary-audio-capture';audioStage.before(capture);
    for(const node of [audioStage,panels.audio.querySelector('.voice-readings'),voiceActions,document.getElementById('voice-notice')])if(node)capture.append(node);
  }
  const compactLabels={'Enable camera':'Camera','Disable camera':'Disable','New recording':'Record again','Start recording':'Recording','Stop recording':'Stop','Preparing recording':'Processing','Enable microphone':'Microphone','Disable microphone':'Disable','Cancel connection':'Cancel','View demo':'Demo','Stop demo':'Stop demo'};
  for(const id of ['video-log-camera','voice-mic']){
    const button=document.getElementById(id);if(!button)continue;
    button.classList.add('diary-compact-button');
    const syncLabel=()=>{const label=button.textContent.trim();button.title=label;button.setAttribute('aria-label',label);button.dataset.compactLabel=id==='voice-mic'?'Audio':compactLabels[label]||label;};
    syncLabel();new MutationObserver(syncLabel).observe(button,{childList:true,subtree:true,characterData:true});
  }
  function alignHeading(){
    const heading=panels.video.querySelector('.diary-category-heading'),nav=document.querySelector('.mission-rail>.stories-section'),frame=document.querySelector('.mission-frame');
    if(!active||!heading?.getBoundingClientRect||!nav||!frame)return;
    if(getComputedStyle(frame).display!=='grid'){heading.style.minHeight='';return;}
    const height=nav.getBoundingClientRect().bottom-heading.getBoundingClientRect().top;
    heading.style.minHeight=Math.max(0,height)+'px';
  }
  if(window.ResizeObserver){const observer=new window.ResizeObserver(alignHeading);for(const node of [document.querySelector('.mission-rail'),document.querySelector('.mission-rail>.stories-section'),document.querySelector('.shell')])if(node)observer.observe(node);}
  function render(){
    const visible=state.workspace==='crew'&&state.view==='diary';
    dialog.hidden=!visible;dialog.dataset.active=String(visible);document.body.dataset.diary=String(visible);
    dialog.dataset.mode='combined';
    for(const panel of Object.values(panels))panel.hidden=false;
    if(visible===active){alignHeading();return;}
    active=visible;alignHeading();
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
    // Switching to audio does not interrupt an active camera.
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
