(() => {
  const states=new Map(),queue=[];let processing=false;
  for(const kind of ['audio','video']){
    const host=document.querySelector(kind==='audio'?'#voice-dialog':'#video-log-dialog .log-capture'),root=document.createElement('section');root.className='media-analysis-result';root.hidden=true;host.append(root);states.set(kind,{kind,root,jobs:[]});
  }
  function updateQueue(){for(const [index,item]of queue.entries())item.status.textContent='В очереди анализа / '+(index+1);}
  async function pump(){
    if(processing)return;processing=true;
    try{while(queue.length){const job=queue.shift();job.phase='processing';updateQueue();await send(job);job.resolve?.();job.resolve=null;}}
    finally{processing=false;}
  }
  function enqueue(job){
    if(job.phase==='waiting'||job.phase==='processing')return job.completion;
    job.phase='waiting';job.retry.hidden=true;job.completion=new Promise(resolve=>{job.resolve=resolve;});queue.push(job);updateQueue();void pump();return job.completion;
  }
  async function frames(blob,duration){
    const input=document.createElement('video'),url=URL.createObjectURL(blob);input.muted=true;input.playsInline=true;input.preload='auto';
    const wait=event=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clean();reject(new Error('media_frames_missing'));},15000);function clean(){clearTimeout(timer);input.removeEventListener(event,done);input.removeEventListener('error',fail);}function done(){clean();resolve();}function fail(){clean();reject(new Error('media_frames_missing'));}input.addEventListener(event,done,{once:true});input.addEventListener('error',fail,{once:true});});
    try{
      const loaded=wait('loadeddata');input.src=url;input.load();await loaded;
      const length=Number.isFinite(input.duration)?Math.min(duration,input.duration):duration,canvas=document.createElement('canvas'),scale=Math.min(1,640/input.videoWidth);canvas.width=Math.round(input.videoWidth*scale);canvas.height=Math.round(input.videoHeight*scale);const context=canvas.getContext('2d'),result=[];
      if(!canvas.width||!canvas.height)throw new Error('media_frames_missing');
      for(const fraction of [.05,.5,.95]){const at=Math.max(.001,Math.min(length-.02,length*fraction));if(Math.abs(input.currentTime-at)>.01){const sought=wait('seeked');input.currentTime=at;await sought;}context.drawImage(input,0,0,canvas.width,canvas.height);const frame=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!frame)throw new Error('media_frames_missing');result.push(frame);}
      return result;
    }finally{input.pause();input.removeAttribute('src');input.load();URL.revokeObjectURL(url);}
  }
  async function submit(kind,blob,duration,ageInput=null){
    const state=states.get(kind),root=document.createElement('article'),heading=document.createElement('header'),status=document.createElement('p'),answer=document.createElement('div'),retry=document.createElement('button');root.className='media-analysis-job';
    const createdAt=new Date().toISOString();heading.textContent=(kind==='audio'?'Аудио':'Видео')+' / '+new Date(createdAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});status.setAttribute('role','status');answer.className='media-analysis-answer';retry.type='button';retry.textContent='Повторить анализ';retry.hidden=true;root.append(heading,status,answer,retry);state.root.append(root);state.root.hidden=false;
    // Речь и самооценка относятся к остановленной записи, независимо от следующих записей.
    const transcriptTask=Promise.resolve(window.missionSpeech?.finish?.(kind==='audio'?'voice':'video')).catch(()=>'');
    const job={kind,root,status,answer,retry,phase:'new',payload:{id:crypto.randomUUID(),kind,blob,duration,createdAt,frames:null,features:undefined,ageInput,transcript:'',transcriptTask,report:window.missionCheckin?.current()||null}};state.jobs.push(job);retry.addEventListener('click',()=>void enqueue(job));return enqueue(job);
  }
  async function send(job){
    try{
      const item=job.payload;job.status.textContent='Подготавливаю запись для анализа...';
      if(item.kind==='video'&&!item.frames)item.frames=await frames(item.blob,item.duration);
      if(item.features===undefined)item.features=await window.missionVoiceAnalysis?.analyze(item.kind,item.blob,item.frames||[],item.ageInput);
      if(!item.transcript)item.transcript=await item.transcriptTask||'';
      window.missionVoiceAnalysis?.transcript(item.kind,item.transcript);
      const form=new FormData();if(item.features)form.set('features',JSON.stringify(item.features));for(const key of ['id','kind','duration','transcript','createdAt'])form.set(key,String(item[key]));form.set('file',item.blob,'recording.'+(item.blob.type.includes('mp4')?'mp4':'webm'));for(const frame of item.frames||[])form.append('frame',frame,'frame.jpg');
      if(item.report)form.set('wellbeing',JSON.stringify(item.report));
      job.status.textContent='NasaGPT анализирует запись...';
      const response=await fetch('/api/media-analysis',{method:'POST',body:form,signal:AbortSignal.timeout(150000)}),result=await response.json();
      if(!response.ok||result.status!=='analyzed')throw Object.assign(new Error(result.error||'media_analysis_unavailable'),{saved:result.saved});
      job.phase='complete';job.status.textContent='Анализ сохранен в архиве';job.answer.textContent=result.analysis;window.missionVoiceAnalysis?.transcript(item.kind,result.transcript||item.transcript);job.payload=null;
      void window.missionBook?.refresh();void window.missionActivity?.refresh();
    }catch(error){job.phase='failed';job.status.textContent=error.saved?'Запись сохранена. Анализ пока недоступен.':'Не удалось отправить запись на анализ.';job.retry.hidden=false;}
  }
  function meter(prefix){
    const value=document.getElementById(prefix+'-level'),fill=document.getElementById(prefix+'-level-fill'),name=document.getElementById(prefix+'-input-name');let engine,input,analyser,samples,frame=0,last=0,generation=0;
    function reset(){value.textContent='-';fill.style.width='0%';name.textContent='Не выбран';}
    function stop(){generation++;cancelAnimationFrame(frame);frame=0;try{input?.disconnect();analyser?.disconnect();}catch{}if(engine&&engine.state!=='closed')void engine.close().catch(()=>{});engine=input=analyser=samples=null;reset();}
    function prepare(){stop();const Engine=window.AudioContext||window.webkitAudioContext;if(!Engine)return;try{engine=new Engine();void engine.resume().catch(()=>{});}catch{engine=null;}}
    function attach(stream){if(!engine)return;try{input=engine.createMediaStreamSource(stream);analyser=engine.createAnalyser();analyser.fftSize=2048;samples=new Float32Array(analyser.fftSize);input.connect(analyser);name.textContent='Микрофон';const current=generation;function tick(time){if(current!==generation)return;frame=requestAnimationFrame(tick);if(time-last<100)return;last=time;if(engine.state!=='running'){reset();return;}analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length),db=Math.max(-90,20*Math.log10(Math.max(rms,.000001)));value.textContent=Math.round(db)+' dBFS';fill.style.width=Math.min(100,Math.max(0,(db+65)/65*100))+'%';}frame=requestAnimationFrame(tick);}catch{reset();}}
    return{prepare,attach,stop};
  }
  window.missionMedia={submit,busy:kind=>states.get(kind)?.jobs.some(job=>job.phase==='waiting'||job.phase==='processing')||false,meter};
})();
