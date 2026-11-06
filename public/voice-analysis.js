(() => {
  const tones={neutral:'Нейтральная',happy:'Радостная',sad:'Грустная',angry:'Раздраженная',tense:'Напряженная'},panels=new Map();
  function element(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  for(const kind of ['audio','video']){
    const host=document.querySelector('#voice-dialog'),root=element('section','voice-analysis-panel');root.dataset.voiceAnalysis=kind;
    const heading=element('header'),title=element('h3','',kind==='audio'?'Анализ аудиозаписи':'Звук видеозаписи'),status=element('span','voice-analysis-state','Запись еще не сделана');status.setAttribute('role','status');heading.append(title,status);
    const metrics=element('div','voice-analysis-metrics');for(const [key,label]of [['level','Средний уровень'],['pauses','Тихие участки'],['clipping','Перегрузка'],['tone','Окраска голоса']]){const item=element('div');item.dataset.voiceFeature=key;const number=element('strong','',key==='tone'?'Нужен анализ голоса':'Нужна запись');item.append(element('span','',label),number);metrics.append(item);}
    const speech=element('details','voice-analysis-speech'),summary=element('summary','','Распознанная речь / Whisper'),transcript=element('p','','Речь появится после записи.');speech.append(summary,transcript);
    const model=element('p','voice-analysis-model','EmbeddingGemma 2 / аудио'+(kind==='video'?' и кадры':'')),hint=element('small','voice-analysis-hint','Окраска: сходство с описаниями голоса, не диагноз.'),details=element('details','voice-analysis-method');details.innerHTML='<summary>Модели анализа</summary><p>EmbeddingGemma 2 строит вектор исходного звука и сравнивает его с описаниями интонации. Число сходства не является вероятностью эмоции. Whisper распознает речь. NasaGPT использует эти наблюдения для анализа. AudioFM пока не подключен: нужны опубликованные веса или API.</p><a href="https://huggingface.co/onnx-community/embeddinggemma-2-ONNX" target="_blank" rel="noopener">https://huggingface.co/onnx-community/embeddinggemma-2-ONNX</a>';
    root.append(heading,metrics,model,hint,speech,details);host.append(root);panels.set(kind,{root,status,metrics,model,hint,summary,transcript,latest:null,sample:null,started:false,analyzing:false});
    markSource(panels.get(kind),'missing');
  }
  function markSource(panel,source){panel.root.dataset.resultSource=source;for(const card of panel.metrics.children)card.dataset.resultSource=source;}
  function value(kind,key,text,percent=null){const node=panels.get(kind).root.querySelector('[data-voice-feature='+key+'] strong');if(percent!==null)node.innerHTML=window.missionGauge.markup({value:percent,label:key==='pauses'?'Тихие участки':'Перегрузка',unit:'%',reverse:true,digits:1});else node.textContent=text;}
  function showSample(kind,item){
    const panel=panels.get(kind);if(!panel||panel.latest||panel.analyzing||panel.started)return;
    const a=item.acoustic;panel.sample=item;markSource(panel,'sample');panel.root.dataset.recordedAt='';
    value(kind,'level',a.level.toLocaleString('ru-RU',{maximumFractionDigits:1})+' dBFS');value(kind,'pauses','',a.quiet*100);value(kind,'clipping','',a.clipping*100);value(kind,'tone','Синтезированная речь / Milena');
    panel.status.textContent='Контрольный пример / '+String(item.mediaUrl||'техническая запись').split('/').at(-1);panel.model.textContent='Акустика контрольного файла / '+item.source;panel.hint.textContent='Измерен синтезированный образец, не голос пользователя. Окраска и эмоции не определялись.';panel.summary.textContent='Текст контрольного образца';panel.transcript.textContent=item.transcript;
  }
  function clearSample(kind){
    const panel=panels.get(kind);if(!panel.sample)return;panel.sample=null;for(const key of ['level','pauses','clipping'])value(kind,key,'Обработка');value(kind,'tone','Анализ голоса...');panel.summary.textContent='Распознанная речь / Whisper';panel.hint.textContent='Окраска: сходство с описаниями голоса, не диагноз.';panel.transcript.textContent='Распознавание речи...';
  }
  async function decode(blob){
    const Engine=window.AudioContext||window.webkitAudioContext;if(!Engine)throw new Error('decode_unavailable');const engine=new Engine();
    try{const buffer=await engine.decodeAudioData(await blob.arrayBuffer()),count=Math.min(buffer.length,Math.ceil(buffer.sampleRate*125)),mono=new Float32Array(count);for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<count;i++)mono[i]+=data[i]/buffer.numberOfChannels;}
      const length=Math.floor(count*16000/buffer.sampleRate),offline=new OfflineAudioContext(1,length,16000),source=offline.createBufferSource(),input=offline.createBuffer(1,count,buffer.sampleRate);input.copyToChannel(mono,0);source.buffer=input;source.connect(offline.destination);source.start();return new Float32Array((await offline.startRendering()).getChannelData(0));
    }finally{await engine.close();}
  }
  function acoustic(audio){let energy=0,clipped=0,quiet=0,blocks=0;for(let at=0;at<audio.length;at+=320){let power=0,n=Math.min(320,audio.length-at);for(let i=at;i<at+n;i++){const x=audio[i];power+=x*x;if(Math.abs(x)>=.99)clipped++;}energy+=power;blocks++;if(Math.sqrt(power/n)<.01)quiet++;}return{level:Math.max(-120,20*Math.log10(Math.max(1e-6,Math.sqrt(energy/audio.length)))),quiet:quiet/blocks,clipping:clipped/audio.length,seconds:audio.length/16000};}
  async function embedding(kind,audio,frames,ageFrames=[],skin=null){
    const panel=panels.get(kind),worker=new Worker('/media-embedding-worker.js?v=20261105-spots1',{type:'module'}),id=crypto.randomUUID();
    try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('model_timeout')),240000);worker.onerror=()=>{clearTimeout(timeout);reject(new Error('model_unavailable'));};worker.onmessage=event=>{const message=event.data;if(message.id!==id)return;if(message.type==='progress'){panel.model.textContent='EmbeddingGemma 2 / загрузка '+Math.round(message.loaded/1048576)+' МБ'+(message.total?' из '+Math.round(message.total/1048576):'');}else if(message.type==='encoding'){panel.model.textContent='EmbeddingGemma 2 / звук '+message.part+' из '+message.parts;}else if(message.type==='age_encoding'){panel.model.textContent='EmbeddingGemma 2 / сравниваю кадры лица с описаниями возраста';}else if(message.type==='skin_encoding'){panel.model.textContent='EmbeddingGemma 2 / векторизация участков кожи';}else if(message.type==='result'){clearTimeout(timeout);resolve(message.result);}else if(message.type==='error'){clearTimeout(timeout);reject(new Error(message.reason));}};worker.postMessage({id,audio,frames,ageFrames,skin});});}finally{worker.terminate();}
  }
  function recordedAt(value){const time=Date.parse(value);return Number.isFinite(time)?new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(time)):'последняя сохраненная запись';}
  function show(kind,item,source='current'){
    const panel=panels.get(kind),features=item?.features,a=features?.acoustic,top=features?.model&&features.tone?.find(value=>tones[value.label]&&Number.isFinite(value.similarity));
    const measured=a&&['level','quiet','clipping','seconds'].every(key=>Number.isFinite(a[key]))&&a.level>=-120&&a.level<=1&&a.quiet>=0&&a.quiet<=1&&a.clipping>=0&&a.clipping<=1&&a.seconds>0;
    if(!measured&&!top)return false;
    const sample=Boolean(panel.sample);panel.sample=null;panel.latest=item;markSource(panel,source);panel.root.dataset.recordedAt=item.createdAt||'';panel.summary.textContent='Распознанная речь / Whisper';panel.hint.textContent='Окраска: сходство с описаниями голоса, не диагноз.';
    value(kind,'level',measured?Math.round(a.level)+' dBFS':'Звук не декодирован');
    value(kind,'pauses',measured?'':'Нет измерения',measured?a.quiet*100:null);
    value(kind,'clipping',measured?'':'Нет измерения',measured?a.clipping*100:null);
    value(kind,'tone',top?tones[top.label]+' / '+top.similarity.toFixed(2):'Нет результата модели');
    panel.status.textContent='Последняя запись / '+recordedAt(item.createdAt);
    panel.model.textContent=top?'EmbeddingGemma 2 / окраска голоса рассчитана':'Акустические измерения / окраска голоса не рассчитана';
    if(item.transcript!==undefined)panel.transcript.textContent=item.transcript||'Разборчивая речь не обнаружена.';else if(sample)panel.transcript.textContent='Расшифровка не получена.';
    return true;
  }
  function restore(kind,item){
    const panel=panels.get(kind);if(!panel||panel.analyzing||panel.latest&&Date.parse(panel.latest.createdAt)>=Date.parse(item?.createdAt))return false;
    return show(kind,item,'saved');
  }
  function unavailable(kind,message){
    const panel=panels.get(kind);
    if(panel.latest){markSource(panel,'saved');panel.status.textContent=message+' / ниже запись от '+recordedAt(panel.latest.createdAt);return;}
    markSource(panel,'missing');panel.status.textContent=message;
    for(const key of ['level','pauses','clipping'])value(kind,key,'Нет измерения');value(kind,'tone','Нет результата модели');
  }
  async function analyze(kind,blob,frames=[],ageInput=null,createdAt=new Date().toISOString()){
    if(kind==='video')window.missionApparentAge?.begin();
    const panel=panels.get(kind);panel.started=true;clearSample(kind);panel.analyzing=true;markSource(panel,panel.latest?'saved':'pending');panel.status.textContent=panel.latest?'Новая запись анализируется / ниже запись от '+recordedAt(panel.latest.createdAt):'Анализирую сигнал';if(!panel.latest)panel.transcript.textContent='Распознавание речи...';let audio=null,metrics=null;
    try{
      try{audio=await decode(blob);metrics=acoustic(audio);show(kind,{createdAt,features:{acoustic:metrics}});value(kind,'tone','Анализ голоса...');panel.status.textContent='Сигнал измерен / '+recordedAt(createdAt);}catch{unavailable(kind,'Звук новой записи не декодирован');panel.model.textContent='Аудиоэмбеддинг недоступен';if(!frames.length)return null;}
      if(metrics&&metrics.level<-60){show(kind,{createdAt,features:{acoustic:metrics}});panel.status.textContent='Слишком тихая запись / '+recordedAt(createdAt);panel.model.textContent='EmbeddingGemma 2 / недостаточно звука';if(!frames.length)return{acoustic:metrics};audio=null;}
      try{
        const result=await embedding(kind,audio,frames,ageInput?.frames||[],kind==='video'?ageInput?.skin:null);
        if(kind==='video')result.apparentAge=window.missionApparentAge?.finish(result.apparentAge||MissionApparentAgeCore.unavailable(),ageInput)||result.apparentAge;
        const features={acoustic:metrics,...result};if(!show(kind,{createdAt,features}))unavailable(kind,'В новой записи нет звуковых измерений');
        if(kind==='video'&&result.skin)window.missionSkinSpots?.encoded(result.skin);return features;
      }catch{
        if(metrics)show(kind,{createdAt,features:{acoustic:metrics}});else unavailable(kind,'Нейроанализ новой записи недоступен');
        panel.model.textContent='EmbeddingGemma 2 не загрузилась / окраска голоса не рассчитана';
        if(kind==='video')window.missionApparentAge?.finish(MissionApparentAgeCore.unavailable('model_unavailable'),ageInput);
        const skin=kind==='video'?MissionSkinSpotsCore.validate(ageInput?.skin?.report):null;if(skin)window.missionSkinSpots?.encoded(skin);return metrics||skin?.status==='compared'?{acoustic:metrics,...(skin?{skin}:{})}:null;
      }
    }finally{panel.analyzing=false;}
  }
  function transcript(kind,text){const panel=panels.get(kind);if(panel.sample){clearSample(kind);markSource(panel,'missing');}panel.transcript.textContent=text||'Разборчивая речь не обнаружена.';}
  window.missionAnalysisSamples?.audio?.then(items=>{for(const item of items)showSample(item.kind,item);});
  window.missionVoiceAnalysis={analyze,transcript,restore};
})();
