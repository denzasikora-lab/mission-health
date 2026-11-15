(() => {
  const host=document.getElementById('diary-demo-control'),video=document.getElementById('video-log-demo');
  const source=document.getElementById('diary-demo-source'),camera=document.getElementById('video-log-camera');
  const background=document.getElementById('video-log-background'),notice=document.getElementById('video-log-notice');
  let playing=false,generation=0;
  const labels={en:['Demo','Play 2-second NASA demo','Could not play the NASA demo. Try again.'],
    es:['Demo','Reproducir demo de NASA de 2 segundos','No se pudo reproducir la demo de NASA. Inténtalo de nuevo.'],
    ur:['ڈیمو','NASA کا دو سیکنڈ کا ڈیمو چلائیں','NASA ڈیمو نہیں چل سکا. دوبارہ کوشش کریں.']};
  const copy=()=>labels[document.documentElement.lang]||labels.en;
  const cameraBusy=()=>camera.disabled||['requesting','live','recording','finishing'].includes(camera.dataset.phase);
  function render(){window.missionKonstaDiaryDemo?.mount(host,{label:copy()[0],title:copy()[1],disabled:cameraBusy(),playing,onClick:play});}
  function stop(){generation++;video.pause();video.hidden=true;source.hidden=true;playing=false;render();}
  async function play(){
    if(cameraBusy())return;
    const attempt=++generation;
    background.value='lab';background.dispatchEvent(new Event('change',{bubbles:true}));
    if(!video.getAttribute('src'))video.src='/assets/diary-demo/nasa-dominick-lab-2s.mp4';
    video.currentTime=0;video.hidden=false;source.hidden=false;playing=true;render();
    try{await video.play();if(attempt!==generation&&video.hidden)video.pause();}
    catch{if(attempt===generation){stop();notice.textContent=copy()[2];notice.dataset.error='true';}}
  }
  video.addEventListener('ended',()=>{playing=false;render();});
  video.addEventListener('error',()=>{if(!video.hidden){stop();notice.textContent=copy()[2];notice.dataset.error='true';}});
  camera.addEventListener('click',stop);
  background.addEventListener('change',()=>{if(background.value!=='lab')stop();});
  window.addEventListener('mission-diary-close',stop);
  window.addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('mission-diary-demo-ready',render);
  window.addEventListener('mission-language-change',render);
  new MutationObserver(render).observe(camera,{attributes:true,attributeFilter:['disabled','data-phase']});
  render();
})();
