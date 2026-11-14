(() => {
  const node=document.createElement('section');node.className='book-training';node.id='book-training';
  node.innerHTML='<div class="training-icon" aria-hidden="true">✧</div><div><span class="book-eyebrow">NEXT CHAPTER / LoRA</span><h3>Learn patterns across your observations</h3><p>Longitudinal behavior research: learn from readings, speech and diary observations. Save versioned LoRA weights for later evaluation.</p><span id="training-summary" role="status">Checking collected entries...</span></div><button type="button" id="training-review">Start fine-tuning ↗</button><div id="training-progress" hidden><progress id="training-meter" max="200" value="0"></progress><p id="training-job-status"></p><button type="button" id="training-cancel" hidden>Stop training</button></div>';
  const history=document.createElement('section');history.id='book-history-panel';history.className='book-history-panel panel glass';history.setAttribute('aria-label','Training and archive activity');history.append(node);
  document.getElementById('mission-book').append(history);
  const dialog=document.createElement('dialog');dialog.id='training-dialog';dialog.className='book-editor';dialog.lang='en';
  dialog.innerHTML='<header><h2>Preparation LoRA</h2><button type="button" id="training-close" aria-label="Close preparation LoRA">✕</button></header><p>Training uses chronologically ordered observations from the selected profile, with a minimum text length of 80 characters. Preliminary training can start with one eligible entry; a larger dataset is needed to assess quality.</p><dl><div><dt>Data</dt><dd id="training-data-count">-</dd></div><div><dt>Compute</dt><dd id="training-connection">-</dd></div><div><dt>Job</dt><dd>200 steps / LoRA / versioned adapter</dd></div></dl><p>Training runs on the project server. Each completed adapter is kept separately and the next run continues its weights. The objective is the next recorded observation. Forecast accuracy is not established. Weights target the named open model, not the hosted Azure agent.</p><label class="training-consent"><input id="training-consent" type="checkbox">Use my collected entries for server training</label><p id="training-start-status" role="status"></p><button type="button" id="training-start" disabled>Start training</button>';
  document.body.append(dialog);
  const get=id=>document.getElementById(id),labels={queued:'Queued',running:'Training',completed:'Adapter ready for review',failed:'Training failed',cancelled:'Training stopped',interrupted:'Process interrupted',unconfirmed:'Checking startup'};
  let profile=null,version=0,active=false,demo=false,info=null,timer=null,busy=false,pendingId=null,loadedAt=0;
  const running=()=>['queued','running','unconfirmed'].includes(info?.jobs?.[0]?.status);
  function draw(){
    if(!info)return;const job=info.jobs?.[0];
    get('training-summary').textContent=demo?'Samples are excluded from training.':info.examples+' / '+info.minimum+' entries required for the first run · '+(info.connected?'training worker ready':'training worker unavailable');
    get('training-data-count').textContent='Entries: '+info.examples+' / minimum '+info.minimum;
    get('training-connection').textContent=info.connected?'Worker ready / '+info.model:'Training worker is unavailable';
    get('training-start').disabled=busy||demo||!get('training-consent').checked||!info.connected||info.examples<info.minimum||running();
    get('training-progress').hidden=!job;get('training-cancel').hidden=!running();
    if(job){get('training-meter').value=job.progress?.step||0;get('training-job-status').textContent=(labels[job.status]||job.status)+' / '+(job.progress?.step||0)+' from 200 steps'+(Number.isFinite(job.progress?.loss)?' / loss '+job.progress.loss.toFixed(3):'')+' · '+job.examples+' entries';}
  }
  async function load(){
    if(!active||busy||!profile)return;const current=version;loadedAt=Date.now();
    try{const data=await journalApi('/api/astronauts/'+profile+'/training');if(current!==version)return;info=data;draw();if(running())void poll();}
    catch{if(current===version)get('training-summary').textContent='Could not check the worker. Press prepare, to retry.';}
  }
  function schedule(){clearTimeout(timer);if(active&&running())timer=setTimeout(()=>void poll(),8000)}
  async function poll(){
    if(!active||!running())return;const current=version,job=info.jobs[0];
    try{const result=await journalApi('/api/astronauts/'+profile+'/training/'+job.id);if(current!==version)return;info.jobs[0]=result.job;draw();}
    catch{if(current===version)get('training-job-status').textContent='Local worker connection lost. Showing the latest received progress.';}
    finally{if(current===version)schedule()}
  }
  window.missionTraining={render(value){
    const wasActive=active;active=value.visible;demo=value.demo;
    if(profile!==value.profile){version++;profile=value.profile;info=null;pendingId=null;loadedAt=0;clearTimeout(timer);dialog.close();get('training-consent').checked=false;}
    if(!active){clearTimeout(timer);return}if(!wasActive&&info){void load();return}if(!info&&Date.now()-loadedAt>3000)void load();else draw();
  },openPersonal(){
    window.missionTraining.render({visible:true,demo:false,profile:personalProfileId});dialog.showModal();get('training-start-status').textContent='';void load();void window.missionActivity?.record('training_review');
  }};
  get('training-review').addEventListener('click',()=>{dialog.showModal();get('training-start-status').textContent='';void load();void window.missionActivity?.record('training_review')});get('training-close').addEventListener('click',()=>dialog.close());get('training-consent').addEventListener('change',draw);
  get('training-start').addEventListener('click',async()=>{
    if(get('training-start').disabled)return;const current=version;busy=true;pendingId||=crypto.randomUUID();draw();get('training-start-status').textContent='Preparing the dataset and sending it to the local worker...';
    try{const result=await journalApi('/api/astronauts/'+profile+'/training',{method:'POST',body:JSON.stringify({id:pendingId,confirm:true})});if(current!==version)return;info.jobs=[result.job];void window.missionActivity?.refresh();pendingId=null;dialog.close();draw();schedule();}
    catch(error){if(current===version)get('training-start-status').textContent=error.message==='training_not_enough_data'?'Not enough eligible entries yet.':'Could not confirm startup. Check the local worker connection.';}
    finally{if(current===version){busy=false;draw();void load()}}
  });
  get('training-cancel').addEventListener('click',async()=>{
    if(!running())return;const current=version;
    try{const result=await journalApi('/api/astronauts/'+profile+'/training/'+info.jobs[0].id,{method:'DELETE'});if(current!==version)return;info.jobs[0]=result.job;draw();clearTimeout(timer)}catch{get('training-job-status').textContent='Could not confirm the stop request. Check the local worker.';}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(active)void load()});window.addEventListener('pagehide',()=>clearTimeout(timer));
  window.missionBook.render();
})();
