(() => {
  const root=document.getElementById('appearance-panel'),core=MissionAppearanceCore;
  const status=document.getElementById('appearance-status'),hint=document.getElementById('appearance-hint'),referenceLabel=document.getElementById('appearance-reference');
  const progress=document.getElementById('appearance-progress'),preview=document.getElementById('appearance-preview'),ctx=preview.getContext('2d');
  const resetButton=document.getElementById('appearance-reset'),cards=new Map();
  resetButton.disabled=true;
  const sampleVisual=window.missionAnalysisSamples?.visual;let sampleAllowed=true;
  const labels={green:'Close to baseline',amber:'Recheck frame',red:'Persistent difference',neutral:'No comparison'};
  let epoch=0,engine,ready=false,busy=false,active=false,frame=0,lastSent=0,timer,frameTimer,video,identity,scope='',cameraKey='',reference,collecting=false;
  let samples=[],recent=[],streaks={},lastValid=0,lastMeasurement=0,storageOk=true;
  const storagePrefix='mission-appearance-v2:';
  const resultPrefix='mission-appearance-result-v1:',resultMemory=new Map();let lastResult=null,lastStored=0,resultStorageOk=true;
  const frameInput=document.createElement('canvas'),frameContext=frameInput.getContext('2d');
  let ageFrames=[],ageSession=0;
  function mark(text,state='idle'){if(status.textContent!==text)status.textContent=text;root.dataset.state=state;}
  function resultKey(){return identity?resultPrefix+JSON.stringify([identity.storageScope,identity.name]):'';}
  function resultValid(item,exactCamera=false){return item?.version===1&&typeof item.cameraKey==='string'&&item.cameraKey&&(!exactCamera||item.cameraKey===cameraKey)&&Number.isFinite(Date.parse(item.at))&&Number.isFinite(Date.parse(item.referenceAt))&&core.metrics.some(metric=>item.values?.[metric.key])&&core.metrics.every(metric=>!item.values?.[metric.key]||Number.isFinite(item.values[metric.key].delta)&&Number.isFinite(item.values[metric.key].z)&&item.values[metric.key].z>=0&&Number.isFinite(Date.parse(item.values[metric.key].at))&&['green','amber','red'].includes(item.values[metric.key].level));}
  function restoreResult(exactCamera=false){
    lastResult=null;const id=resultKey();if(!id)return;
    try{const item=resultMemory.get(id)||JSON.parse(localStorage.getItem(id)||'null');if(resultValid(item,exactCamera)&&(!reference||item.referenceAt===reference.at))lastResult=item;}catch{}
    if(lastResult||exactCamera||!identity)window.missionApparentAge?.setScope(lastResult?storagePrefix+JSON.stringify([identity.storageScope,identity.name,lastResult.cameraKey]):scope);
  }
  function persistResult(){const id=resultKey();if(!id||!lastResult)return;resultMemory.set(id,lastResult);try{localStorage.setItem(id,JSON.stringify(lastResult));lastStored=Date.now();resultStorageOk=true;}catch{resultStorageOk=false;}}
  function displayValue(card,metric,item){card.value.textContent=(item.delta>0?'+':'')+item.delta.toLocaleString('en-GB',{maximumFractionDigits:1,minimumFractionDigits:1})+' '+metric.unit;card.bar.style.setProperty('--signal',Math.min(item.z/4,1));}
  function neutral(reason){
    for(const metric of core.metrics){
      const card=cards.get(metric.key),saved=lastResult?.values[metric.key],sample=!saved&&sampleAllowed&&Number.isFinite(sampleVisual?.deltas[metric.key]);card.node.dataset.level='neutral';card.node.dataset.resultSource=saved?'saved':sample?'sample':'missing';
      if(saved)displayValue(card,metric,saved);else if(sample)displayValue(card,metric,{delta:sampleVisual.deltas[metric.key],z:0});else{card.value.textContent='No comparison';card.bar.style.setProperty('--signal',0);}
      card.label.textContent=sample?'Reference sample / not a personal measurement':(saved?'Latest / ':'')+(reason||labels.neutral);card.node.setAttribute('aria-label',metric.title+': '+(sample?card.value.textContent+'. Reference sample, not a user measurement':(saved?card.value.textContent+'. Latest result from '+new Date(saved.at).toLocaleString('en-GB')+'. ':'')+(reason||labels.neutral)));
    }
    streaks={};
  }
  function sampleSummary(){
    if(!sampleVisual||!sampleAllowed||lastResult)return;
    mark('Reference sample');hint.textContent='Illustrative image changes / no personal data measured.';referenceLabel.textContent='Reference sample / no personal baseline';progress.textContent='Sample';resetButton.disabled=true;
  }
  for(const metric of core.metrics){
    const node=document.createElement('article');node.className='appearance-metric';node.dataset.level='neutral';node.dataset.resultSource='missing';
    const title=document.createElement('span');title.textContent=metric.title;title.className='appearance-metric-title';
    const value=document.createElement('strong');value.textContent='No recording';
    const bar=document.createElement('div');bar.className='appearance-scale';bar.setAttribute('aria-hidden','true');bar.append(document.createElement('i'));
    const label=document.createElement('small');label.textContent='Enable the camera and collect a baseline';
    node.append(title,value,bar,label);node.title=metric.description;node.setAttribute('aria-label',metric.title+': '+labels.neutral);
    cards.set(metric.key,{node,value,bar,label});
  }
  document.getElementById('appearance-metrics').prepend(...Array.from(cards.values(),card=>card.node));
  neutral();mark('Waiting for camera');sampleSummary();
  function key(){return storagePrefix+JSON.stringify([identity.storageScope,identity.name,cameraKey]);}
  function load(){
    reference=null;storageOk=true;
    try{const saved=JSON.parse(localStorage.getItem(scope)||'null');if(saved?.cameraKey===cameraKey&&core.referenceValid(saved))reference=saved;else if(saved)hint.textContent='Different camera or frame format. Create a new baseline.';}
    catch{storageOk=false;}
    collecting=!reference;referenceLabel.textContent=reference?'Baseline / '+new Date(reference.at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'Baseline / 24 frames';
    if(!storageOk)hint.textContent='The baseline is available until this page closes: browser storage unavailable.';
  }
  function save(value){
    reference=value;
    try{localStorage.setItem(scope,JSON.stringify(value));storageOk=true;}
    catch{storageOk=false;hint.textContent='Browser storage is full. The baseline is valid for this session only.';}
  }
  function renderProgress(){const n=Math.min(samples.length,24);progress.style.setProperty('--capture',n/24);progress.textContent=collecting?n+'/24':'LIVE';progress.setAttribute('aria-label',collecting?'Baseline: '+n+' from 24 frames':'Baseline comparison');}
  function resetCapture(){samples=[];recent=[];streaks={};lastValid=0;collecting=true;neutral('Collecting baseline');renderProgress();referenceLabel.textContent='Baseline / 24 frames';hint.textContent='Face straight ahead, even lighting.';}
  function setIdentity(value){
    const next=value?.storageScope&&value.name?.trim()?{storageScope:value.storageScope,name:value.name.trim()}:null;
    if(next&&identity?.storageScope===next.storageScope&&identity?.name===next.name)return;
    const wasActive=active||Boolean(video?.srcObject),input=video,device=cameraKey;stop();identity=next;sampleAllowed=true;scope=next?key():'';reference=null;ageFrames=[];ageSession++;window.missionApparentAge?.setIdentity(next);restoreResult();neutral('Camera is off');
    if(lastResult){mark('Latest comparison / '+new Date(lastResult.at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}),'recorded');hint.textContent='Latest result. Enable the camera for a new comparison.';referenceLabel.textContent='Baseline / '+new Date(lastResult.referenceAt).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'});}
    else{mark('Waiting for camera');hint.textContent='Enable the camera and collect your personal comparison baseline.';referenceLabel.textContent='Baseline / 24 frames';sampleSummary();}
    if(wasActive&&next)start(input,{key:device});
  }
  function start(input,device={}){
    sampleAllowed=false;stop();ageFrames=[];ageSession++;video=input;device||={};cameraKey=device.key||JSON.stringify([device.deviceId||'',input.videoWidth,input.videoHeight]);
    if(!identity){mark('Profile name required');hint.textContent='Could not read the profile. Refresh the page.';return;}
    if(!window.Worker||!window.OffscreenCanvas||!window.createImageBitmap){mark('Analysis unavailable');hint.textContent='This browser does not support the frame processor.';return;}
    active=true;scope=key();load();restoreResult(true);window.missionApparentAge?.setScope(scope);window.missionSkinSpots?.setScope(scope);
    samples=[];recent=[];streaks={};lastSent=lastMeasurement=0;neutral('Loading');renderProgress();resetButton.disabled=true;
    if(!reference&&storageOk)hint.textContent='Face straight ahead, even lighting.';
    else if(reference)hint.textContent='Same lighting and angle. Comparison runs during speech pauses.';
    mark('Loading model','loading');
    const attempt=epoch;
    try{engine=new Worker('/appearance-worker.js?v=20261105-spots1');}catch{stop();mark('Analysis unavailable');hint.textContent='Could not create the camera processor.';return;}const worker=engine;
    const failed=()=>{if(attempt!==epoch)return;stop();mark('Could not start analysis');hint.textContent='Check model loading and restart the camera. Recording video is available.';};
    timer=setTimeout(failed,45000);
    worker.onerror=failed;
    worker.onmessage=({data})=>{
      if(attempt!==epoch||worker!==engine)return;
      if(data.type==='ready'){clearTimeout(timer);ready=true;resetButton.disabled=false;mark('Point the camera at your face','scanning');frame=requestAnimationFrame(tick);}
      else if(data.type==='measurement'){
        busy=false;clearTimeout(frameTimer);lastMeasurement=performance.now();
        try{
          if(data.measurement.valid&&data.ageFrame){ageFrames.push({blob:data.ageFrame,time:data.timestamp,light:data.measurement.light.l,distance:data.measurement.distance});if(ageFrames.length>3)ageFrames.shift();}
          consume(data.measurement,data.timestamp);if(data.skinSnapshot)window.missionSkinSpots?.observe(data.skinSnapshot,data.timestamp);
        }catch{failed();}
      }else if(data.type==='error')failed();
    };
    worker.postMessage({type:'init'});
  }
  async function send(time){
    const attempt=epoch,worker=engine;busy=true;lastSent=time;
    try{
      const ratio=Math.min(1,960/video.videoWidth);frameInput.width=Math.round(video.videoWidth*ratio);frameInput.height=Math.round(video.videoHeight*ratio);
      frameContext.drawImage(video,0,0,frameInput.width,frameInput.height);
      const bitmap=await createImageBitmap(frameInput);
      if(attempt!==epoch||worker!==engine||!active){bitmap.close();return;}
      frameTimer=setTimeout(()=>{if(attempt!==epoch)return;stop();mark('Analysis paused');hint.textContent='Processor is not responding. Restart the camera.';},10000);
      worker.postMessage({type:'frame',bitmap,timestamp:time},[bitmap]);
    }catch{if(attempt===epoch){busy=false;clearTimeout(frameTimer);neutral('Frame unavailable');}}
  }
  function tick(time){
    if(!active||document.hidden)return;
    frame=requestAnimationFrame(tick);
    if(ready&&!busy&&video.readyState>=2&&time-lastSent>=333)void send(time);
    if(lastMeasurement&&time-lastMeasurement>1800){neutral('Waiting for frame');mark('Updating frame','scanning');}
  }
  function draw(sample){
    if(!video?.videoWidth)return;
    const scale=Math.min(preview.width/video.videoWidth,preview.height/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale,x=(preview.width-w)/2,y=(preview.height-h)/2;
    ctx.clearRect(0,0,preview.width,preview.height);ctx.drawImage(video,x,y,w,h);
    if(!sample.valid)return;
    ctx.fillStyle='#8dffc6';ctx.strokeStyle='#8dffc655';ctx.lineWidth=1;
    for(const p of sample.points){ctx.beginPath();ctx.arc(x+p.x*w,y+p.y*h,1.6,0,Math.PI*2);ctx.fill();}
    for(const p of sample.regions){ctx.beginPath();ctx.ellipse(x+p.x*w,y+p.y*h,8,4,0,0,Math.PI*2);ctx.stroke();}
  }
  function consume(sample,time){
    draw(sample);
    if(!sample.valid){samples=[];recent=[];lastValid=0;neutral('Unsuitable frame');mark('Preparing frame','scanning');hint.textContent=sample.reason;renderProgress();return;}
    if(collecting){
      // A baseline requires a continuous series of comparable frames.
      if(lastValid&&time-lastValid>1000)samples=[];
      const first=samples[0];
      if(first&&(Math.abs(sample.distance/first.distance-1)>.05||Math.hypot(sample.center.x-first.center.x,sample.center.y-first.center.y)>20||Math.abs(sample.light.l-first.light.l)>4))samples=[];
      samples.push(sample);lastValid=time;renderProgress();mark('Collecting personal baseline','scanning');hint.textContent='Keep position and lighting steady / '+samples.length+' from 24 frames';
      if(samples.length>=24){
        const next={...core.summarize(samples),at:new Date().toISOString(),cameraKey};save(next);collecting=false;samples=[];recent=[];renderProgress();
        referenceLabel.textContent=(storageOk?'Baseline saved / ':'Session baseline / ')+new Date(next.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      }
      return;
    }
    recent.push(sample);if(recent.length>5)recent.shift();
    const compared=core.comparison(core.smooth(recent),reference);
    if(!compared.valid){recent=[];neutral('Match the conditions');mark('Frames need alignment','scanning');hint.textContent=compared.reason;return;}
    if(recent.length<5){neutral('Stabilizing');mark('Stabilizing measurement','scanning');return;}
    mark('Baseline comparison','live');progress.textContent='LIVE';
    hint.textContent=!compared.colorOk?'Lighting or white balance changed: color scales paused.':storageOk?'Local comparison / original frame without effects':'Baseline for this session only / browser storage unavailable';
    for(const metric of core.metrics){
      const v=compared.values[metric.key],card=cards.get(metric.key);
      if(!v.valid){const saved=lastResult?.values[metric.key];card.node.dataset.level='neutral';card.node.dataset.resultSource=saved?'saved':'missing';if(saved)displayValue(card,metric,saved);else{card.value.textContent='More light needed';card.bar.style.setProperty('--signal',0);}card.label.textContent=(saved?'Latest / ':'')+'Match the lighting';card.node.setAttribute('aria-label',metric.title+': '+card.label.textContent);streaks[metric.key]=null;continue;}
      if(v.z>=3)streaks[metric.key]??=time;else streaks[metric.key]=null;
      const state=core.level(v.z,streaks[metric.key]===null?0:time-streaks[metric.key]);
      card.node.dataset.level=state;card.node.dataset.resultSource='live';card.value.textContent=(v.delta>0?'+':'')+v.delta.toLocaleString('en-GB',{maximumFractionDigits:1,minimumFractionDigits:1})+' '+metric.unit;
      card.label.textContent=labels[state];card.node.setAttribute('aria-label',metric.title+': '+card.value.textContent+', '+labels[state]);card.bar.style.setProperty('--signal',Math.min(v.z/4,1));
      if(!lastResult||lastResult.cameraKey!==cameraKey||lastResult.referenceAt!==reference.at)lastResult={version:1,cameraKey,referenceAt:reference.at,at:new Date().toISOString(),values:{}};
      lastResult.values[metric.key]={delta:v.delta,z:v.z,level:state,at:new Date().toISOString()};lastResult.at=new Date().toISOString();
    }
    if(Date.now()-lastStored>=2000)persistResult();
  }
  function stop(){
    epoch++;active=false;ready=busy=false;window.missionSkinSpots?.pause();clearTimeout(timer);clearTimeout(frameTimer);cancelAnimationFrame(frame);frame=0;
    engine?.terminate();engine=null;samples=[];recent=[];streaks={};lastValid=0;resetButton.disabled=true;
    persistResult();neutral('Camera is off');mark(lastResult?'Latest comparison / '+new Date(lastResult.at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'Waiting for camera',lastResult?'recorded':'idle');progress.textContent=lastResult?resultStorageOk?'Saved':'Session':'No frame';progress.style.setProperty('--capture',0);ctx.clearRect(0,0,preview.width,preview.height);sampleSummary();
  }
  resetButton.addEventListener('click',()=>{if(active&&ready)resetCapture();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  function ageContext(){return identity?{scope,session:ageSession,since:performance.now()}:null;}
  function ageSnapshot(context){
    if(!context||context.scope!==scope||context.session!==ageSession)return null;
    const selected=ageFrames.filter(item=>item.time>=context.since);
    const valid=selected.length>0&&selected.every(item=>Math.abs(item.light-selected[0].light)<=8&&Math.abs(item.distance/selected[0].distance-1)<=.2);
    return{skin:window.missionSkinSpots?.snapshot(context),context:{...context},frames:valid?selected.map(item=>item.blob):[],conditions:valid?{light:selected.reduce((s,v)=>s+v.light,0)/selected.length,distance:selected.reduce((s,v)=>s+v.distance,0)/selected.length}:null};
  }
  window.missionAppearance={start,stop,setIdentity,ageContext,ageSnapshot};
})();
