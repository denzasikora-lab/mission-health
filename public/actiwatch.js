(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const panel=make('section','actiwatch-panel panel glass');panel.id='actiwatch-panel';
  panel.innerHTML='<header><div class="actiwatch-brand"><svg viewBox="0 0 32 40" aria-hidden="true"><rect x="10" y="1" width="12" height="38" rx="4"/><rect x="3" y="10" width="26" height="20" rx="7"/><path d="m8 21 4-4 4 7 3-5h5"/></svg><div><h2>Actiwatch <span>Actiware CSV</span></h2><p>Сон · Движение · Свет</p></div></div><button type="button" data-actiwatch-open>Загрузить данные</button></header><p class="actiwatch-state" role="status">Загружаю источники...</p><div class="actiwatch-details" hidden><div class="actiwatch-values"></div><div class="actiwatch-chart"></div><p class="actiwatch-quality"></p></div>';
  document.querySelector('.home-body-panel').after(panel);
  const dialog=make('dialog','actiwatch-dialog');dialog.id='actiwatch-dialog';dialog.setAttribute('aria-labelledby','actiwatch-title');
  dialog.innerHTML='<header><div><span>ИСТОЧНИК / ACTIWATCH</span><h2 id="actiwatch-title">Добавить данные часов</h2></div><button type="button" data-actiwatch-close aria-label="Закрыть импорт Actiwatch">✕</button></header><p>Выбери CSV из Actiware с записями по эпохам. Предпросмотр появится перед загрузкой.</p><label class="actiwatch-file">Выгрузка Actiware<input id="actiwatch-file" type="file" accept=".csv,text/csv"></label><div class="actiwatch-options"><label>Формат даты<select id="actiwatch-date"><option value="">Из ISO Timestamp</option><option value="MDY">Месяц / день / год</option><option value="DMY">День / месяц / год</option><option value="YMD">Год / месяц / день</option></select></label><label>Часовой пояс файла<select id="actiwatch-zone"><option value="">Из ISO Timestamp</option></select></label><label>Длительность эпохи<select id="actiwatch-epoch"><option value="">Из файла</option><option value="15">15 секунд</option><option value="30">30 секунд</option><option value="60">60 секунд</option><option value="120">120 секунд</option></select></label></div><p id="actiwatch-preview-status" role="status">Файл пока не выбран.</p><div id="actiwatch-preview" class="actiwatch-preview" hidden></div><button type="button" id="actiwatch-save" disabled>Использовать данные</button><details><summary>Как выгрузить файл</summary><p>В Actiware выбери экспорт CSV: Full header и Epoch-by-epoch list. Нужны Activity и Date + Time либо ISO Timestamp. Дополнительно: White Light / Photopic Light, Sleep/Wake Score, Off-Wrist Status и текстовый Interval Status.</p><p>Для отдельных Date и Time укажи формат даты и постоянное смещение UTC, использованное в файле. RGB-каналы здесь не импортируются.</p><p>Часы считываются через оборудование Actiwatch и Actiware. Этот импорт не является прямым беспроводным подключением.</p><a href="https://www.philips.com/c-dam/b2bhc/master/sites/actigraphy/solutions/Actiware/actiware-user-guide.pdf" target="_blank" rel="noopener">Руководство Philips Actiware ↗</a></details>';
  document.body.append(dialog);
  const get=id=>document.getElementById(id),status=panel.querySelector('.actiwatch-state'),details=panel.querySelector('.actiwatch-details'),previewStatus=get('actiwatch-preview-status'),save=get('actiwatch-save');
  let latest=null,recording=null,draft=null,raw='',filename='',busy=false,loadVersion=0,importId=null;
  const fmt=value=>value===null?'-':new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(value);
  const duration=seconds=>{if(seconds===null)return '-';const minutes=Math.round(seconds/60);return Math.floor(minutes/60)+' ч '+minutes%60+' мин';};
  const date=value=>new Intl.DateTimeFormat('ru',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(value))+' UTC';
  for(let offset=-720;offset<=840;offset+=15){const option=make('option','', 'UTC'+(offset>=0?'+':'-')+String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')+':'+String(Math.abs(offset)%60).padStart(2,'0'));option.value=offset;get('actiwatch-zone').append(option);}
  function values(host,summary){
    host.replaceChildren();const w=summary.latest24h;
    for(const [name,value,note]of [['Сон',duration(w.sleepSeconds),w.sleepSeconds===null?'Нет пригодных меток':'По меткам Actiware'],['Активность',fmt(w.activityCounts),'counts / не шаги'],['Белый свет',fmt(w.meanLightLux)+(w.meanLightLux===null?'':' лк'),'Среднее пригодных эпох'],['Покрытие',duration(w.coveredSeconds),'В окне последних 24 ч']]){const cell=make('div');cell.append(make('span','',name),make('strong','',value),make('small','',note));host.append(cell);}
  }
  function charts(host,data,summary){
    host.replaceChildren();const w=summary.latest24h,start=Date.parse(w.start),end=Date.parse(w.end),bins=Array.from({length:144},()=>({activity:null,sleep:0,wake:0,unknown:0,off:0}));
    for(const row of data.rows){const time=Date.parse(row.timestamp);if(time+data.epochSeconds*1000<=start||time>=end)continue;const index=Math.max(0,Math.min(143,Math.floor((time-start)/(end-start)*144))),bin=bins[index];if(row.offWrist===true||row.excluded){bin.off++;continue;}if(row.activity!==null)bin.activity=bin.activity===null?row.activity:Math.max(bin.activity,row.activity);if(row.activity===null||row.sleepState==='unknown')bin.unknown++;else bin[row.sleepState]++;}
    const title=make('p','actiwatch-chart-label','Движение / максимум counts за эпоху в каждом 10-минутном столбике');host.append(title);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 110');svg.setAttribute('role','img');svg.setAttribute('aria-label','Активность и метки сна Actiwatch за последние 24 часа записи');
    const max=Math.max(1,...bins.map(b=>b.activity||0));
    bins.forEach((bin,index)=>{if(bin.activity!==null){const bar=document.createElementNS(ns,'rect'),height=Math.max(1,bin.activity/max*68);bar.setAttribute('x',index*5);bar.setAttribute('y',72-height);bar.setAttribute('width','3');bar.setAttribute('height',height);bar.setAttribute('class','watch-activity-bar');svg.append(bar);}const stripe=document.createElementNS(ns,'rect');stripe.setAttribute('x',index*5);stripe.setAttribute('y','87');stripe.setAttribute('width','4');stripe.setAttribute('height','9');stripe.setAttribute('class',bin.sleep||bin.wake?(bin.sleep>=bin.wake?'watch-sleep':'watch-wake'):'watch-unknown');const label=document.createElementNS(ns,'title');label.textContent=date(new Date(start+index*(end-start)/144).toISOString())+' / пик активности '+fmt(bin.activity);stripe.append(label);svg.append(stripe);});host.append(svg);
    const legend=make('p','actiwatch-legend');legend.innerHTML='<span class="watch-sleep-key">Сон</span><span class="watch-wake-key">Бодрствование</span><span>Нет пригодной разметки / пропуск</span>';host.append(legend);
  }
  function render(){
    details.hidden=!latest;
    if(!latest){status.textContent='Файл не загружен. Добавь выгрузку Actiware.';return;}
    const s=latest.summary,w=s.latest24h;status.textContent='Из файла / '+latest.filename+' · окно 24 ч до '+date(w.end);
    values(panel.querySelector('.actiwatch-values'),s);if(recording)charts(panel.querySelector('.actiwatch-chart'),recording,s);
    panel.querySelector('.actiwatch-quality').textContent='За всю запись: снятые часы '+duration(s.offWristSeconds)+' / исключенные эпохи '+duration(s.excludedSeconds)+'. Пропуски не заполняются.';
    const sleep=document.querySelector('[data-home-metric=sleep]');sleep.querySelector('strong').textContent=duration(w.sleepSeconds);sleep.querySelector('small').textContent='Actiwatch / до '+date(w.end)+' / разметка '+duration(w.sleepScoredSeconds);
    document.querySelector('.home-body-panel>header small').textContent='Actiwatch / данные из файла';
  }
  async function load(){
    const version=++loadVersion;
    try{const data=await journalApi('/api/actiwatch');if(version!==loadVersion)return;const changed=latest?.id!==data.latest?.id;latest=data.latest;if(changed)recording=null;render();if(latest&&!recording){const result=await journalApi('/api/actiwatch/'+latest.id);if(version!==loadVersion)return;recording=result.recording;render();}}
    catch{if(version===loadVersion)status.textContent='Не удалось загрузить Actiwatch. Нажми «Загрузить данные», чтобы повторить.';}
  }
  function parse(){
    draft=null;save.disabled=true;get('actiwatch-preview').hidden=true;if(!raw){previewStatus.textContent='Файл пока не выбран.';return;}
    try{const options={};if(get('actiwatch-date').value)options.dateOrder=get('actiwatch-date').value;if(get('actiwatch-zone').value!=='')options.utcOffsetMinutes=Number(get('actiwatch-zone').value);if(get('actiwatch-epoch').value)options.epochSeconds=Number(get('actiwatch-epoch').value);draft=globalThis.MissionActiwatch.parseCSV(raw,options);const summary=globalThis.MissionActiwatch.summarize(draft);values(get('actiwatch-preview'),summary);get('actiwatch-preview').hidden=false;previewStatus.textContent=draft.rows.length+' эпох / '+date(summary.start)+' - '+date(summary.end)+(draft.warnings.length?'\n'+draft.warnings.join(' '):'');save.disabled=busy;importId=null;}
    catch(error){previewStatus.textContent=error.message;}
  }
  panel.querySelector('[data-actiwatch-open]').addEventListener('click',()=>{dialog.showModal();if(!latest)void load();});dialog.querySelector('[data-actiwatch-close]').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  get('actiwatch-file').addEventListener('change',async event=>{if(busy)return;const file=event.target.files[0];raw='';draft=null;filename='';save.disabled=true;get('actiwatch-preview').hidden=true;if(!file){parse();return;}if(file.size>5000000){previewStatus.textContent='Файл должен быть не больше 5 МБ.';return;}try{const bytes=new Uint8Array(await file.arrayBuffer()),encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':'utf-8';raw=new TextDecoder(encoding,{fatal:true}).decode(bytes);filename=file.name;parse();}catch{previewStatus.textContent='Файл не прочитан. Нужен CSV в UTF-8 или UTF-16LE.';save.disabled=true;}});
  for(const id of ['actiwatch-date','actiwatch-zone','actiwatch-epoch'])get(id).addEventListener('change',parse);
  save.addEventListener('click',async()=>{
    if(!draft||busy)return;busy=true;save.disabled=true;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=true);importId||=crypto.randomUUID();previewStatus.textContent='Сохраняю данные Actiwatch...';
    try{const result=await journalApi('/api/actiwatch',{method:'POST',body:JSON.stringify({id:importId,filename,recording:draft})});previewStatus.textContent=result.duplicate?'Этот файл уже добавлен.':'Данные добавлены. Сводка сохранена в личном дневнике.';await load();void window.missionBook?.refresh();void window.missionConversations?.refreshDiary();void window.missionActivity?.refresh();draft=null;raw='';get('actiwatch-file').value='';dialog.close();}
    catch{previewStatus.textContent='Не удалось сохранить. Файл остается здесь, можно повторить.';}
    finally{busy=false;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=false);save.disabled=!draft;}
  });
  window.missionActiwatch={refresh:load};void load();
})();
