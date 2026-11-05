(() => {
  const root=document.getElementById('appearance-panel'),core=MissionAppearanceCore;
  const status=document.getElementById('appearance-status'),hint=document.getElementById('appearance-hint'),referenceLabel=document.getElementById('appearance-reference');
  const progress=document.getElementById('appearance-progress'),preview=document.getElementById('appearance-preview'),ctx=preview.getContext('2d');
  const resetButton=document.getElementById('appearance-reset'),cards=new Map();
  const labels={green:'Близко к эталону',amber:'Перепроверить кадр',red:'Устойчивое отличие',neutral:'Нет сравнения'};
  let epoch=0,engine,ready=false,busy=false,active=false,frame=0,lastSent=0,timer,frameTimer,video,identity,scope='',cameraKey='',reference,collecting=false;
  let samples=[],recent=[],streaks={},lastValid=0,lastMeasurement=0,storageOk=true;
  const storagePrefix='mission-appearance-v2:';
  const frameInput=document.createElement('canvas'),frameContext=frameInput.getContext('2d');
  let ageFrames=[],ageSession=0;
  function mark(text,state='idle'){if(status.textContent!==text)status.textContent=text;root.dataset.state=state;}
  function neutral(reason){for(const [key,card] of cards){card.node.dataset.level='neutral';card.value.textContent='-';card.label.textContent=reason||labels.neutral;card.node.setAttribute('aria-label',core.metrics.find(metric=>metric.key===key).title+': '+card.label.textContent);card.bar.style.setProperty('--signal',0);}streaks={};}
  for(const metric of core.metrics){
    const node=document.createElement('article');node.className='appearance-metric';node.dataset.level='neutral';
    const title=document.createElement('span');title.textContent=metric.title;title.className='appearance-metric-title';
    const value=document.createElement('strong');value.textContent='-';
    const bar=document.createElement('div');bar.className='appearance-scale';bar.setAttribute('aria-hidden','true');bar.append(document.createElement('i'));
    const label=document.createElement('small');label.textContent=labels.neutral;
    node.append(title,value,bar,label);node.title=metric.description;node.setAttribute('aria-label',metric.title+': '+labels.neutral);
    document.getElementById('appearance-metrics').append(node);cards.set(metric.key,{node,value,bar,label});
  }
  function key(){return storagePrefix+JSON.stringify([identity.storageScope,identity.name,cameraKey]);}
  function load(){
    reference=null;storageOk=true;
    try{const saved=JSON.parse(localStorage.getItem(scope)||'null');if(saved?.cameraKey===cameraKey&&core.referenceValid(saved))reference=saved;else if(saved)hint.textContent='Другая камера или формат кадра. Создай новый эталон.';}
    catch{storageOk=false;}
    collecting=!reference;referenceLabel.textContent=reference?'Эталон / '+new Date(reference.at).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'Эталон / 24 кадра';
    if(!storageOk)hint.textContent='Эталон доступен только до закрытия страницы: память браузера недоступна.';
  }
  function save(value){
    reference=value;
    try{localStorage.setItem(scope,JSON.stringify(value));storageOk=true;}
    catch{storageOk=false;hint.textContent='Память браузера заполнена. Эталон действует только в этом сеансе.';}
  }
  function renderProgress(){const n=Math.min(samples.length,24);progress.style.setProperty('--capture',n/24);progress.textContent=collecting?n+'/24':'LIVE';progress.setAttribute('aria-label',collecting?'Эталон: '+n+' из 24 кадров':'Сравнение с эталоном');}
  function resetCapture(){samples=[];recent=[];streaks={};lastValid=0;collecting=true;neutral('Сбор эталона');renderProgress();referenceLabel.textContent='Эталон / 24 кадра';hint.textContent='Лицо прямо, ровный свет.';}
  function setIdentity(value){
    const next=value?.storageScope&&value.name?.trim()?{storageScope:value.storageScope,name:value.name.trim()}:null;
    if(next&&identity?.storageScope===next.storageScope&&identity?.name===next.name)return;
    const wasActive=active||Boolean(video?.srcObject),input=video,device=cameraKey;stop();identity=next;scope=next?key():'';reference=null;ageFrames=[];ageSession++;
    if(wasActive&&next)start(input,{key:device});
  }
  function start(input,device={}){
    stop();ageFrames=[];ageSession++;video=input;device||={};cameraKey=device.key||JSON.stringify([device.deviceId||'',input.videoWidth,input.videoHeight]);
    if(!identity){mark('Нужно имя профиля');hint.textContent='Не удалось прочитать профиль. Обнови страницу.';return;}
    if(!window.Worker||!window.OffscreenCanvas||!window.createImageBitmap){mark('Анализ недоступен');hint.textContent='Браузер не поддерживает обработчик кадров.';return;}
    active=true;scope=key();load();window.missionSkinSpots?.setScope(scope);
    samples=[];recent=[];streaks={};lastSent=lastMeasurement=0;neutral('Загрузка');renderProgress();resetButton.disabled=true;
    if(!reference&&storageOk)hint.textContent='Лицо прямо, ровный свет.';
    else if(reference)hint.textContent='Тот же свет и ракурс. Сравнение идет на паузах речи.';
    mark('Загрузка модели','loading');
    const attempt=epoch;
    try{engine=new Worker('/appearance-worker.js?v=20261105-spots1');}catch{stop();mark('Анализ недоступен');hint.textContent='Не удалось создать обработчик камеры.';return;}const worker=engine;
    const failed=()=>{if(attempt!==epoch)return;stop();mark('Не удалось запустить анализ');hint.textContent='Проверь загрузку модели и повторно включи камеру. Запись видео доступна.';};
    timer=setTimeout(failed,45000);
    worker.onerror=failed;
    worker.onmessage=({data})=>{
      if(attempt!==epoch||worker!==engine)return;
      if(data.type==='ready'){clearTimeout(timer);ready=true;resetButton.disabled=false;mark('Наведи камеру на лицо','scanning');frame=requestAnimationFrame(tick);}
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
      frameTimer=setTimeout(()=>{if(attempt!==epoch)return;stop();mark('Анализ приостановлен');hint.textContent='Обработчик не отвечает. Повторно включи камеру.';},10000);
      worker.postMessage({type:'frame',bitmap,timestamp:time},[bitmap]);
    }catch{if(attempt===epoch){busy=false;clearTimeout(frameTimer);neutral('Кадр недоступен');}}
  }
  function tick(time){
    if(!active||document.hidden)return;
    frame=requestAnimationFrame(tick);
    if(ready&&!busy&&video.readyState>=2&&time-lastSent>=333)void send(time);
    if(lastMeasurement&&time-lastMeasurement>1800){neutral('Ожидание кадра');mark('Обновление кадра','scanning');}
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
    if(!sample.valid){samples=[];recent=[];lastValid=0;neutral('Кадр не подходит');mark('Подготовка кадра','scanning');hint.textContent=sample.reason;renderProgress();return;}
    if(collecting){
      // Эталон собирается только из непрерывной серии сопоставимых кадров.
      if(lastValid&&time-lastValid>1000)samples=[];
      const first=samples[0];
      if(first&&(Math.abs(sample.distance/first.distance-1)>.05||Math.hypot(sample.center.x-first.center.x,sample.center.y-first.center.y)>20||Math.abs(sample.light.l-first.light.l)>4))samples=[];
      samples.push(sample);lastValid=time;renderProgress();mark('Сбор личного эталона','scanning');hint.textContent='Держи положение и свет / '+samples.length+' из 24 кадров';
      if(samples.length>=24){
        const next={...core.summarize(samples),at:new Date().toISOString(),cameraKey};save(next);collecting=false;samples=[];recent=[];renderProgress();
        referenceLabel.textContent=(storageOk?'Эталон сохранен / ':'Эталон сеанса / ')+new Date(next.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      }
      return;
    }
    recent.push(sample);if(recent.length>5)recent.shift();
    const compared=core.comparison(core.smooth(recent),reference);
    if(!compared.valid){recent=[];neutral('Повтори условия');mark('Нужно сопоставить кадры','scanning');hint.textContent=compared.reason;return;}
    if(recent.length<5){neutral('Стабилизация');mark('Стабилизация измерения','scanning');return;}
    mark('Сравнение с эталоном','live');progress.textContent='LIVE';
    hint.textContent=!compared.colorOk?'Свет или баланс белого изменился: цветовые шкалы приостановлены.':storageOk?'Локальное сравнение / исходный кадр без эффектов':'Эталон только в этом сеансе / память браузера недоступна';
    for(const metric of core.metrics){
      const v=compared.values[metric.key],card=cards.get(metric.key);
      if(!v.valid){card.node.dataset.level='neutral';card.value.textContent='-';card.label.textContent='Повтори освещение';card.node.setAttribute('aria-label',metric.title+': '+card.label.textContent);card.bar.style.setProperty('--signal',0);streaks[metric.key]=null;continue;}
      if(v.z>=3)streaks[metric.key]??=time;else streaks[metric.key]=null;
      const state=core.level(v.z,streaks[metric.key]===null?0:time-streaks[metric.key]);
      card.node.dataset.level=state;card.value.textContent=(v.delta>0?'+':'')+v.delta.toLocaleString('ru-RU',{maximumFractionDigits:1,minimumFractionDigits:1})+' '+metric.unit;
      card.label.textContent=labels[state];card.node.setAttribute('aria-label',metric.title+': '+card.value.textContent+', '+labels[state]);card.bar.style.setProperty('--signal',Math.min(v.z/4,1));
    }
  }
  function stop(){
    epoch++;active=false;ready=busy=false;window.missionSkinSpots?.pause();clearTimeout(timer);clearTimeout(frameTimer);cancelAnimationFrame(frame);frame=0;
    engine?.terminate();engine=null;samples=[];recent=[];streaks={};lastValid=0;resetButton.disabled=true;
    neutral('Камера выключена');mark('Ожидание камеры');progress.textContent='-';progress.style.setProperty('--capture',0);ctx.clearRect(0,0,preview.width,preview.height);
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
