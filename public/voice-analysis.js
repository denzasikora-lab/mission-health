(() => {
  const tones={neutral:'Neutral',happy:'Happy',sad:'Sad',angry:'Irritated',tense:'Tense'},panels=new Map();
  function element(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  for(const kind of ['audio','video']){
    const host=kind==='audio'?document.querySelector('#voice-dialog'):null,root=element('section','voice-analysis-panel');root.dataset.voiceAnalysis=kind;
    const heading=element('header'),title=element('h3','','Audio recording analysis'),status=element('span','voice-analysis-state','Recording has not been made yet');status.setAttribute('role','status');heading.append(title,status);
    const metrics=element('div','voice-analysis-metrics');for(const [key,label]of [['level','Average level'],['pauses','Quiet intervals'],['clipping','Clipping'],['tone','Voice tone']]){const item=element('div');item.dataset.voiceFeature=key;const number=element('strong','',key==='tone'?'Voice analysis required':'Recording required');item.append(element('span','',label),number);metrics.append(item);}
    const speech=element('details','voice-analysis-speech'),summary=element('summary','','Recognized speech / Whisper'),transcript=element('p','','Speech appears after recording.');speech.append(summary,transcript);
    const model=element('p','voice-analysis-model','EmbeddingGemma 2 / audio'+(kind==='video'?' and frames':'')),hint=element('small','voice-analysis-hint','Tone: similarity to voice descriptions, not a diagnosis.'),details=element('details','voice-analysis-method');details.innerHTML='<summary>Analysis models</summary><p>EmbeddingGemma 2 embeds the original audio and compares it with intonation descriptions. Similarity is not emotion probability. Whisper transcribes speech. NasaGPT uses these observations for analysis. AudioFM is not connected yet: published weights or an API are required.</p><a href="https://huggingface.co/onnx-community/embeddinggemma-2-ONNX" target="_blank" rel="noopener">https://huggingface.co/onnx-community/embeddinggemma-2-ONNX</a>';
    root.append(heading,metrics,model,hint,speech,details);host?.append(root);panels.set(kind,{root,status,metrics,model,hint,summary,transcript,latest:null,started:false,analyzing:false});
    markSource(panels.get(kind),'missing');
  }
  function markSource(panel,source){panel.root.dataset.resultSource=source;for(const card of panel.metrics.children)card.dataset.resultSource=source;}
  function value(kind,key,text,percent=null){const node=panels.get(kind).root.querySelector('[data-voice-feature='+key+'] strong');if(percent!==null)node.innerHTML=window.missionGauge.markup({value:percent,label:key==='pauses'?'Quiet intervals':'Clipping',unit:'%',reverse:true,digits:1});else node.textContent=text;}
  async function decode(blob){
    const Engine=window.AudioContext||window.webkitAudioContext;if(!Engine)throw new Error('decode_unavailable');const engine=new Engine();
    try{const buffer=await engine.decodeAudioData(await blob.arrayBuffer()),count=Math.min(buffer.length,Math.ceil(buffer.sampleRate*125)),mono=new Float32Array(count);for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<count;i++)mono[i]+=data[i]/buffer.numberOfChannels;}
      const length=Math.floor(count*16000/buffer.sampleRate),offline=new OfflineAudioContext(1,length,16000),source=offline.createBufferSource(),input=offline.createBuffer(1,count,buffer.sampleRate);input.copyToChannel(mono,0);source.buffer=input;source.connect(offline.destination);source.start();return new Float32Array((await offline.startRendering()).getChannelData(0));
    }finally{await engine.close();}
  }
  function acoustic(audio){let energy=0,clipped=0,quiet=0,blocks=0;for(let at=0;at<audio.length;at+=320){let power=0,n=Math.min(320,audio.length-at);for(let i=at;i<at+n;i++){const x=audio[i];power+=x*x;if(Math.abs(x)>=.99)clipped++;}energy+=power;blocks++;if(Math.sqrt(power/n)<.01)quiet++;}return{level:Math.max(-120,20*Math.log10(Math.max(1e-6,Math.sqrt(energy/audio.length)))),quiet:quiet/blocks,clipping:clipped/audio.length,seconds:audio.length/16000};}
  async function embedding(kind,audio,frames,ageFrames=[],skin=null){
    const panel=panels.get(kind),worker=new Worker('/media-embedding-worker.js?v=20261114-face1',{type:'module'}),id=crypto.randomUUID();
    try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('model_timeout')),240000);worker.onerror=()=>{clearTimeout(timeout);reject(new Error('model_unavailable'));};worker.onmessage=event=>{const message=event.data;if(message.id!==id)return;if(message.type==='progress'){panel.model.textContent='EmbeddingGemma 2 / downloading '+Math.round(message.loaded/1048576)+' MB'+(message.total?' from '+Math.round(message.total/1048576):'');}else if(message.type==='encoding'){panel.model.textContent='EmbeddingGemma 2 / sound '+message.part+' of '+message.parts;}else if(message.type==='age_encoding'){panel.model.textContent='EmbeddingGemma 2 / comparing face frames with age descriptions';}else if(message.type==='skin_encoding'){panel.model.textContent='EmbeddingGemma 2 / skin region vectorization';}else if(message.type==='result'){clearTimeout(timeout);resolve(message.result);}else if(message.type==='error'){clearTimeout(timeout);reject(new Error(message.reason));}};worker.postMessage({id,audio,frames,ageFrames,skin});});}finally{worker.terminate();}
  }
  function recordedAt(value){const time=Date.parse(value);return Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(time)):'latest saved recording';}
  function show(kind,item,source='current'){
    const panel=panels.get(kind),features=item?.features,a=features?.acoustic,top=features?.model&&features.tone?.find(value=>tones[value.label]&&Number.isFinite(value.similarity));
    const measured=a&&['level','quiet','clipping','seconds'].every(key=>Number.isFinite(a[key]))&&a.level>=-120&&a.level<=1&&a.quiet>=0&&a.quiet<=1&&a.clipping>=0&&a.clipping<=1&&a.seconds>0;
    if(!measured&&!top)return false;
    panel.latest=item;markSource(panel,source);panel.root.dataset.recordedAt=item.createdAt||'';panel.summary.textContent='Recognized speech / Whisper';panel.hint.textContent='Tone: similarity to voice descriptions, not a diagnosis.';
    value(kind,'level',measured?Math.round(a.level)+' dBFS':'Audio not decoded');
    value(kind,'pauses',measured?'':'No measurement',measured?a.quiet*100:null);
    value(kind,'clipping',measured?'':'No measurement',measured?a.clipping*100:null);
    value(kind,'tone',top?tones[top.label]+' / '+top.similarity.toFixed(2):'No model result');
    panel.status.textContent='Latest recording / '+recordedAt(item.createdAt);
    panel.model.textContent=top?'EmbeddingGemma 2 / voice tone calculated':'Acoustic measurements / voice tone not calculated';
    if(item.transcript!==undefined)panel.transcript.textContent=item.transcript||'No intelligible speech detected.';
    return true;
  }
  function restore(kind,item){
    const panel=panels.get(kind);if(!panel||panel.analyzing||panel.latest&&Date.parse(panel.latest.createdAt)>=Date.parse(item?.createdAt))return false;
    return show(kind,item,'saved');
  }
  function unavailable(kind,message){
    const panel=panels.get(kind);
    if(panel.latest){markSource(panel,'saved');panel.status.textContent=message+' / showing recording from '+recordedAt(panel.latest.createdAt);return;}
    markSource(panel,'missing');panel.status.textContent=message;
    for(const key of ['level','pauses','clipping'])value(kind,key,'No measurement');value(kind,'tone','No model result');
  }
  async function analyze(kind,blob,frames=[],ageInput=null,createdAt=new Date().toISOString()){
    if(kind==='video')window.missionApparentAge?.begin();
    const panel=panels.get(kind);panel.started=true;panel.analyzing=true;markSource(panel,panel.latest?'saved':'pending');panel.status.textContent=panel.latest?'New recording is being analyzed / showing recording from '+recordedAt(panel.latest.createdAt):'Analyzing signal';if(!panel.latest)panel.transcript.textContent='Speech recognition...';let audio=null,metrics=null;
    try{
      try{audio=await decode(blob);metrics=acoustic(audio);show(kind,{createdAt,features:{acoustic:metrics}});value(kind,'tone','Voice analysis...');panel.status.textContent='Signal measured / '+recordedAt(createdAt);}catch{unavailable(kind,'New recording audio was not decoded');panel.model.textContent='Audio embedding unavailable';if(!frames.length)return null;}
      if(metrics&&metrics.level<-60){show(kind,{createdAt,features:{acoustic:metrics}});panel.status.textContent='Recording too quiet / '+recordedAt(createdAt);panel.model.textContent='EmbeddingGemma 2 / not enough audio';if(!frames.length)return{acoustic:metrics};audio=null;}
      try{
        const result=await embedding(kind,audio,frames,ageInput?.frames||[],kind==='video'?ageInput?.skin:null);
        if(kind==='video'&&result.faceVector&&ageInput?.cameraKey){
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ageInput.cameraKey)),cameraKey=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
          const descriptor=MissionFaceSessionCore.descriptor(ageInput.faceSamples,cameraKey),face=descriptor&&MissionFaceSessionCore.validate({...descriptor,vector:result.faceVector});if(face)result.face=face;
        }
        delete result.faceVector;
        if(kind==='video')result.apparentAge=window.missionApparentAge?.finish(result.apparentAge||MissionApparentAgeCore.unavailable(),ageInput)||result.apparentAge;
        const features={acoustic:metrics,...result};if(!show(kind,{createdAt,features}))unavailable(kind,'No audio measurements in the new recording');
        if(kind==='video'&&result.skin)window.missionSkinSpots?.encoded(result.skin);return features;
      }catch{
        if(metrics)show(kind,{createdAt,features:{acoustic:metrics}});else unavailable(kind,'Neural analysis unavailable for the new recording');
        panel.model.textContent='EmbeddingGemma 2 failed to load / voice tone not calculated';
        if(kind==='video')window.missionApparentAge?.finish(MissionApparentAgeCore.unavailable('model_unavailable'),ageInput);
        const skin=kind==='video'?MissionSkinSpotsCore.validate(ageInput?.skin?.report):null;if(skin)window.missionSkinSpots?.encoded(skin);return metrics||skin?.status==='compared'?{acoustic:metrics,...(skin?{skin}:{})}:null;
      }
    }finally{panel.analyzing=false;}
  }
  function transcript(kind,text){const panel=panels.get(kind);panel.transcript.textContent=text||'No intelligible speech detected.';}
  window.missionVoiceAnalysis={analyze,transcript,restore};
})();
