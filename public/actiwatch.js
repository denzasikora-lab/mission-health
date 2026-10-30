(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  function demoRecording(){
    const start=Date.parse('2026-10-28T12:00:00.000Z');
    // Детерминированный пример хранится только в памяти интерфейса, отдельно от черновика импорта.
    const rows=Array.from({length:1440},(_,minute)=>{
      const asleep=minute>=620&&minute<1080,exercise=minute>=250&&minute<290||minute>=1160&&minute<1180;
      return {timestamp:new Date(start+minute*60000).toISOString(),activity:asleep?(minute%71===0?6:0):18+(minute*19%83)+(exercise?140:0),lightLux:asleep?0.5:minute<360?240+(minute*11%360):minute<620?35+(minute*3%40):180+(minute*7%220),sleepState:asleep?'sleep':'wake',offWrist:false,excluded:false};
    });
    return {version:1,sourceFormat:'actiware-csv',epochSeconds:60,rows,warnings:[]};
  }
  const demoData=demoRecording(),demoState=Object.freeze({source:'demo',simulation:true,summary:globalThis.MissionActiwatch.summarize(demoData)});
  const home=document.getElementById('mission-home'),bodyPanel=home.querySelector('.home-body-panel');
  const dialog=make('dialog','actiwatch-dialog');dialog.id='actiwatch-dialog';dialog.setAttribute('aria-labelledby','actiwatch-title');
  dialog.innerHTML='<header><div><span>ИСТОЧНИК / ACTIWATCH</span><h2 id="actiwatch-title">Добавить данные часов</h2></div><button type="button" data-actiwatch-close aria-label="Закрыть импорт Actiwatch">✕</button></header><p>Выбери CSV из Actiware с записями по эпохам. Предпросмотр появится перед загрузкой.</p><label class="actiwatch-file">Выгрузка Actiware<input id="actiwatch-file" type="file" accept=".csv,text/csv"></label><div class="actiwatch-options"><label>Формат даты<select id="actiwatch-date"><option value="">Из ISO Timestamp</option><option value="MDY">Месяц / день / год</option><option value="DMY">День / месяц / год</option><option value="YMD">Год / месяц / день</option></select></label><label>Часовой пояс файла<select id="actiwatch-zone"><option value="">Из ISO Timestamp</option></select></label><label>Длительность эпохи<select id="actiwatch-epoch"><option value="">Из файла</option><option value="15">15 секунд</option><option value="30">30 секунд</option><option value="60">60 секунд</option><option value="120">120 секунд</option></select></label></div><p id="actiwatch-preview-status" role="status">Файл пока не выбран.</p><div id="actiwatch-preview" class="actiwatch-preview" hidden></div><button type="button" id="actiwatch-save" disabled>Использовать данные</button><details><summary>Как выгрузить файл</summary><p>В Actiware выбери экспорт CSV: Full header и Epoch-by-epoch list. Нужны Activity и Date + Time либо ISO Timestamp. Дополнительно: White Light / Photopic Light, Sleep/Wake Score, Off-Wrist Status и текстовый Interval Status.</p><p>Для отдельных Date и Time укажи формат даты и постоянное смещение UTC, использованное в файле. RGB-каналы здесь не импортируются.</p><p>Часы считываются через оборудование Actiwatch и Actiware. Этот импорт не является прямым беспроводным подключением.</p><a href="https://www.philips.com/c-dam/b2bhc/master/sites/actigraphy/solutions/Actiware/actiware-user-guide.pdf" target="_blank" rel="noopener">Руководство Philips Actiware ↗</a></details>';
  document.body.append(dialog);
  const get=id=>document.getElementById(id),previewStatus=get('actiwatch-preview-status'),save=get('actiwatch-save');
  let latest=null,recording=null,draft=null,raw='',filename='',busy=false,loadVersion=0,importId=null;
  const fmt=value=>value===null?'-':new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(value);
  const duration=seconds=>{if(seconds===null)return '-';const minutes=Math.round(seconds/60);return Math.floor(minutes/60)+' ч '+minutes%60+' мин';};
  const date=value=>new Intl.DateTimeFormat('ru',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(value))+' UTC';
  for(let offset=-720;offset<=840;offset+=15){const option=make('option','', 'UTC'+(offset>=0?'+':'-')+String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')+':'+String(Math.abs(offset)%60).padStart(2,'0'));option.value=offset;get('actiwatch-zone').append(option);}
  function values(host,summary,simulation=false){
    host.replaceChildren();const w=summary.latest24h;
    for(const [name,value,note]of [['Сон',duration(w.sleepSeconds),simulation?'Симуляция сна':w.sleepSeconds===null?'Нет пригодных меток':'По меткам Actiware'],['Активность',fmt(w.activityCounts),'counts / не шаги'],['Белый свет',fmt(w.meanLightLux)+(w.meanLightLux===null?'':' лк'),simulation?'Симуляция освещенности':'Среднее пригодных эпох'],['Покрытие',duration(w.coveredSeconds),'В окне последних 24 ч']]){const cell=make('div');cell.append(make('span','',name),make('strong','',value),make('small','',note));host.append(cell);}
  }
  function metric(key,value,unit,note){
    const card=bodyPanel.querySelector('[data-home-metric='+key+']');if(!card)return;
    card.dataset.source=latest?'actiwatch':'demo';card.dataset.device='actiwatch';
    const number=card.querySelector('strong');number.textContent=value;if(unit)number.append(make('span','home-vital-unit',unit));
    window.missionHome.setSource(key,note,latest?null:'https://www.nasa.gov/wp-content/uploads/2023/11/roi-iss-facilities-june2023.pdf');
    card.title=latest?'Actiwatch / '+latest.filename+' / до '+date(latest.summary.end):'Actiwatch / симуляция, не измерение пользователя';
  }
  function render(){
    const summary=latest?.summary||demoState.summary,w=summary.latest24h,source=latest?'Actiwatch / Actiware CSV':'Actiwatch Plus';
    const minutes=w.sleepSeconds===null?null:Math.round(w.sleepSeconds/60);
    metric('sleep',minutes===null?'-':String(Math.floor(minutes/60)),minutes===null?'':'ч '+minutes%60+' мин',source+(minutes===null?' / нет меток':''));
    metric('activity',fmt(w.activityCounts),w.activityCounts===null?'':'counts',source+' / акселерометр');
    metric('light',fmt(w.meanLightLux),w.meanLightLux===null?'':'лк',source+' / белый свет');
    bodyPanel.dataset.actiwatchSource=latest?'actiwatch':'demo';
    const label=bodyPanel.querySelector('header small');if(label)label.textContent=latest?'Actiwatch CSV + симуляция':'Симуляция';
  }
  async function load(){
    const version=++loadVersion;
    try{const data=await journalApi('/api/actiwatch');if(version!==loadVersion)return;let loaded=null;if(data.latest){if(latest?.id===data.latest.id&&recording)loaded=recording;else{const result=await journalApi('/api/actiwatch/'+data.latest.id);if(version!==loadVersion)return;loaded=result.recording;}}latest=data.latest||null;recording=loaded;render();}
    catch{if(version===loadVersion){latest=null;recording=null;render();}}
  }
  function parse(){
    draft=null;save.disabled=true;get('actiwatch-preview').hidden=true;if(!raw){previewStatus.textContent='Файл пока не выбран.';return;}
    try{const options={};if(get('actiwatch-date').value)options.dateOrder=get('actiwatch-date').value;if(get('actiwatch-zone').value!=='')options.utcOffsetMinutes=Number(get('actiwatch-zone').value);if(get('actiwatch-epoch').value)options.epochSeconds=Number(get('actiwatch-epoch').value);draft=globalThis.MissionActiwatch.parseCSV(raw,options);const summary=globalThis.MissionActiwatch.summarize(draft);values(get('actiwatch-preview'),summary);get('actiwatch-preview').hidden=false;previewStatus.textContent=draft.rows.length+' эпох / '+date(summary.start)+' - '+date(summary.end)+(draft.warnings.length?'\n'+draft.warnings.join(' '):'');save.disabled=busy;importId=null;}
    catch(error){previewStatus.textContent=error.message;}
  }
  function openImport(){if(!dialog.open)dialog.showModal();if(!latest)void load();}
  dialog.querySelector('[data-actiwatch-close]').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  get('actiwatch-file').addEventListener('change',async event=>{if(busy)return;const file=event.target.files[0];raw='';draft=null;filename='';save.disabled=true;get('actiwatch-preview').hidden=true;if(!file){parse();return;}if(file.size>5000000){previewStatus.textContent='Файл должен быть не больше 5 МБ.';return;}try{const bytes=new Uint8Array(await file.arrayBuffer()),encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':'utf-8';raw=new TextDecoder(encoding,{fatal:true}).decode(bytes);filename=file.name;parse();}catch{previewStatus.textContent='Файл не прочитан. Нужен CSV в UTF-8 или UTF-16LE.';save.disabled=true;}});
  for(const id of ['actiwatch-date','actiwatch-zone','actiwatch-epoch'])get(id).addEventListener('change',parse);
  save.addEventListener('click',async()=>{
    if(!draft||busy)return;busy=true;save.disabled=true;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=true);importId||=crypto.randomUUID();previewStatus.textContent='Сохраняю данные Actiwatch...';
    try{const result=await journalApi('/api/actiwatch',{method:'POST',body:JSON.stringify({id:importId,filename,recording:draft})});previewStatus.textContent=result.duplicate?'Этот файл уже добавлен.':'Данные добавлены. Сводка сохранена в личном дневнике.';await load();void window.missionBook?.refresh();void window.missionConversations?.refreshDiary();void window.missionActivity?.refresh();draft=null;raw='';get('actiwatch-file').value='';dialog.close();}
    catch{previewStatus.textContent='Не удалось сохранить. Файл остается здесь, можно повторить.';}
    finally{busy=false;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=false);save.disabled=!draft;}
  });
  window.missionActiwatch={refresh:load,current:()=>latest?{...latest,source:'actiwatch'}:demoState,demoState,openImport};render();void load();
})();
