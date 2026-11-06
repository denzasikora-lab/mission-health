(() => {
  const tones={neutral:'Нейтральная',happy:'Радостная',sad:'Грустная',angry:'Раздраженная',tense:'Напряженная'};
  const reasons={need_frames:'Недостаточно кадров',need_camera:'Нужна запись камеры',model_unavailable:'Модель недоступна',unstable:'Кадры дали неустойчивый результат',conditions_changed:'Условия съемки изменились',no_reference:'Эталон не выбран',need_closeup:'Нужен крупный резкий кадр',not_enough_detail:'Недостаточно деталей',collecting:'Сбор эталона',compared:'Сравнение выполнено',estimated:'Диапазон определен',uncertain:'Результат неустойчив',unavailable:'Нет результата',pending:'Ожидается анализ',measured:'Показатели сигнала измерены',analyzed:'Анализ выполнен'};
  const visualTitles=['Контур лица','Симметрия контура','Зона под глазами','Оттенок щек','Высота лица','Линия челюсти','Нижняя часть лица','Раскрытие глаз','Симметрия глаз','Ширина губ','Разница тона щек','Тон под глазами','Видимый возраст','Новые участки кожи','Изменения пигментации'];
  const number=(value,digits=1)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(value);
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const plain=value=>String(value||'').replaceAll('\u0451','\u0435').replaceAll('\u0401','\u0415').replace(/[\u2013\u2014]/g,'-').trim();
  const reason=value=>reasons[value]||'Недостаточно данных';
  const stamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'Время не сохранено';
  const range=value=>value&&finite(value.min)&&(value.max===null||finite(value.max))?(value.max===null?number(value.min,0)+' лет и старше':number(value.min,0)+'-'+number(value.max,0)+' лет'):'';
  function acoustic(value){return value&&['level','quiet','clipping','seconds'].every(key=>finite(value[key]))&&value.level>=-120&&value.level<=1&&value.quiet>=0&&value.quiet<=1&&value.clipping>=0&&value.clipping<=1&&value.seconds>0?value:null;}
  function signalLines(features){
    const value=acoustic(features?.acoustic);return value?['Средний уровень: '+number(value.level)+' dBFS','Тихие участки: '+number(value.quiet*100)+'%','Перегрузка: '+number(value.clipping*100,2)+'%','Измерено звука: '+number(value.seconds)+' с']:['Акустические измерения не получены'];
  }
  function toneLines(features){
    const ranked=Array.isArray(features?.tone)?features.tone.filter(item=>tones[item?.label]&&finite(item.similarity)&&Math.abs(item.similarity)<=1.01).sort((a,b)=>b.similarity-a.similarity):[];
    return ranked.length?ranked.map(item=>tones[item.label]+' / сходство с описанием '+number(item.similarity,2)).concat('Сходство не является вероятностью эмоции.'):['Нет результата модели'];
  }
  function ageLines(value){
    if(value?.status!=='estimated'||!range(value.range))return [reason(value?.reason||value?.status)];
    const result=['Видимый диапазон: '+range(value.range)];
    if(value.reference?.range)result.push('Эталон: '+range(value.reference.range));
    const comparison={higher:'Диапазон выше эталона',lower:'Диапазон ниже эталона',overlap:'Диапазон пересекается с эталоном',conditions_changed:'Свет или ракурс изменились, сравнение приостановлено',no_reference:'Эталон не выбран'};
    if(comparison[value.comparison])result.push(comparison[value.comparison]);
    result.push('Экспериментальное сходство внешности, не биологический возраст.');return result;
  }
  function skinLines(value){
    if(value?.status!=='compared')return [reason(value?.reason||value?.status)];
    const lines=['Новые участки: '+(finite(value.newCount)?number(value.newCount,0):'Нет данных'),'Изменились: '+(finite(value.changedCount)?number(value.changedCount,0):'Нет данных')];
    const regions={forehead:'Лоб','left-cheek':'Левая область кадра / щека','right-cheek':'Правая область кадра / щека'};
    for(const item of (Array.isArray(value.items)?value.items:[]).slice(0,12)){
      const metrics=[];if(finite(item.diameterPixels))metrics.push('диаметр '+number(item.diameterPixels)+' px');if(finite(item.areaPixels))metrics.push('площадь '+number(item.areaPixels)+' px²');if(finite(item.areaChangePercent))metrics.push('изменение площади '+(item.areaChangePercent>0?'+':'')+number(item.areaChangePercent)+'%');if(finite(item.deltaE))metrics.push('изменение цвета '+number(item.deltaE)+' ΔE');
      if(metrics.length)lines.push((regions[item.region]||'Участок кожи')+': '+metrics.join(' / '));
    }
    lines.push('Локальное сравнение изображения лба и щек. Кандидаты не определяются как родинки или заболевания.');return lines;
  }
  function dataText(value){
    if(Array.isArray(value)&&value.every(item=>tones[item?.label]))return toneLines({tone:value}).join('\n');
    if(value?.range||['estimated','uncertain'].includes(value?.status))return ageLines(value).join('\n');
    if(value?.coverage||value?.newCount!==undefined)return skinLines(value).join('\n');
    if(value?.acoustic)return signalLines(value).join('\n');
    return 'Технические признаки сохранены с записью.';
  }
  function jsonAt(text,start){
    const first=text[start];if(first!=='{'&&first!=='[')return null;let quoted=false,escaped=false,depth=0;
    for(let at=start;at<text.length;at++){
      const char=text[at];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"'){quoted=true;continue;}if(char==='{'||char==='[')depth++;else if(char==='}'||char===']'){depth--;if(depth===0)try{return {value:JSON.parse(text.slice(start,at+1)),end:at+1};}catch{return null;}}
    }return null;
  }
  function readableText(value){
    const text=plain(value);let result='',at=0;
    while(at<text.length){const char=text[at],parsed=(char==='{'||char==='[')&&jsonAt(text,at);if(parsed){result+=dataText(parsed.value);at=parsed.end;}else{result+=char;at++;}}
    return result;
  }
  function legacy(entry){
    const text=String(entry?.content||'');if(!/^(Видео|Аудио)(наблюдение|запись)/.test(text))return null;
    const kind=text.startsWith('Видео')?'video':'audio',features={};
    for(const [key,label] of [['tone','EmbeddingGemma 2:'],['apparentAge','Видимый возраст / экспериментальное сходство:'],['skin','Сравнение кожи / наблюдения клиентского обработчика:']]){const index=text.indexOf(label);if(index<0)continue;const at=text.slice(index+label.length).search(/[\[{]/);if(at>=0){const parsed=jsonAt(text,index+label.length+at);if(parsed)features[key]=parsed.value;}}
    const level=text.match(/средний уровень (-?[\d.]+) dBFS/),quiet=text.match(/тихие окна ниже -40 dBFS ([\d.]+)%/),clipping=text.match(/отсчеты с перегрузкой ([\d.]+)%/),duration=text.match(/\/\s*([\d.]+) с(?:\n|$)/);
    if(level&&quiet&&clipping&&duration)features.acoustic={level:Number(level[1]),quiet:Number(quiet[1])/100,clipping:Number(clipping[1])/100,seconds:Number(duration[1])};
    const transcript=text.match(/Распознанная речь: ([\s\S]*?)(?=\n(?:Самооценка самочувствия|Признаки исходного звука|Звук не декодирован|EmbeddingGemma 2|Видимый возраст|Сравнение кожи)|$)/)?.[1]||'';
    return {kind,duration:duration?Number(duration[1]):null,transcript,features,mediaUrl:null,analysis:'',status:Object.keys(features).length?'measured':'pending'};
  }
  function observation(entry){const value=entry?.observation||legacy(entry);return value&&['audio','video'].includes(value.kind)?value:null;}
  function media(value){
    const url=value?.mediaUrl;if(!['audio','video'].includes(value?.kind)||typeof url!=='string'||!/^\/(?:api\/media-analysis\/[a-f0-9-]{36}\/media|assets\/archive\/[A-Za-z0-9._-]+\.(?:mp4|mp3|wav|webm|ogg))$/i.test(url))return null;
    return {kind:value.kind,url};
  }
  function observationText(value,{compact=false}={}){
    const blocks=['Акустические показатели\n'+signalLines(value.features).join('\n')];
    if(!compact)blocks.push('Окраска голоса\n'+toneLines(value.features).join('\n'));
    blocks.push('Распознанная речь\n'+(readableText(value.transcript)||'Разборчивая речь не обнаружена.'));
    blocks.push((compact?'Разбор записи':'Анализ записи')+'\n'+(readableText(value.analysis)||reason(value.status)));
    if(value.kind==='video'&&!compact){blocks.push('Видимый возраст\n'+ageLines(value.features?.apparentAge).join('\n'));blocks.push('Пятна и пигментация\n'+skinLines(value.features?.skin).join('\n'));}
    return blocks.join('\n\n');
  }
  function latest(entries){const result={};for(const entry of [...entries].filter(item=>!item.archiveSample&&!item.archiveCurrent).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))){const value=observation(entry);if(value&&!result[value.kind])result[value.kind]={entry,value};}return result;}
  function missing(value){return !value||/^(?:-|Нет |Нужн|Недостаточно|Не определен)/.test(value);}
  function captureVisual(document,entries=[]){
    const saved=latest(entries).video?.value?.features||{},nodes=Array.from(document.querySelectorAll('#appearance-metrics .appearance-metric'));
    return visualTitles.map(title=>{
      const candidate=nodes.find(item=>plain(item.querySelector('.appearance-metric-title')?.textContent)===title),node=candidate?.dataset?.resultSource==='sample'||candidate?.dataset?.source==='sample'||candidate?.closest?.('[data-result-source="sample"],[data-source="sample"]')?null:candidate,result={title,value:plain(node?.querySelector('strong')?.textContent)||'Нет сравнения',status:plain(node?.querySelector('.appearance-metric-status')?.textContent||node?.querySelector('small')?.textContent)||'Нет сравнения',source:node?.dataset?.resultSource||'missing'};
      if(missing(result.value)&&title==='Видимый возраст'&&saved.apparentAge?.status==='estimated'&&range(saved.apparentAge.range)){result.value=range(saved.apparentAge.range);result.status='Последний сохраненный анализ';result.source='saved';}
      if(missing(result.value)&&saved.skin?.status==='compared'&&['Новые участки кожи','Изменения пигментации'].includes(title)){const count=title==='Новые участки кожи'?saved.skin.newCount:saved.skin.changedCount;if(finite(count)){result.value=number(count,0);result.status='Последнее сравнение с эталоном';result.source='saved';}}
      return result;
    });
  }
  function currentEntry(entries,{visual=[],wellbeing=null,wearable=null,now=new Date().toISOString()}={}){
    const recent=latest(entries),blocks=[];
    blocks.push('Самооценка\n'+(wellbeing&&Number.isInteger(wellbeing.score)&&wellbeing.score>=1&&wellbeing.score<=100?wellbeing.score+'/100'+(wellbeing.label?' / '+plain(wellbeing.label):'')+(wellbeing.recordedAt?' / '+stamp(wellbeing.recordedAt):''):'Оценка еще не выбрана'));
    for(const [kind,title] of [['audio','Последнее аудио'],['video','Последнее видео']]){const item=recent[kind];blocks.push(title+'\n'+(item?stamp(item.entry.createdAt)+'\n'+observationText(item.value):'Личная запись еще не сохранена'));}
    blocks.push('Визуальные признаки\n'+(visual.length?visual:visualTitles.map(title=>({title,value:'Нет сравнения',status:'Нужна запись и личный эталон'}))).map(item=>{const value=plain(item.value)||'Нет сравнения',status=plain(item.status);return plain(item.title)+': '+value+(status&&status!==value?' / '+status:'');}).join('\n'));
    const imported=wearable?.latest,summary=imported?.summary?.latest24h;if(summary&&wearable.source!=='demo'){const values=[];if(finite(summary.sleepSeconds))values.push('Сон: '+number(summary.sleepSeconds/3600)+' ч');if(finite(summary.activityCounts))values.push('Движение: '+number(summary.activityCounts,0)+' отсчетов');if(finite(summary.meanLightLux))values.push('Средняя освещенность: '+number(summary.meanLightLux)+' лк');if(values.length)blocks.push('Actiwatch / личный импорт\n'+values.join('\n'));}
    return {id:'archive-current-results',title:'Текущие результаты',content:'Текущие результаты\n\n'+blocks.join('\n\n'),createdAt:now,archiveCurrent:true};
  }
  function presentation(entry){
    const value=observation(entry),sample=entry.archiveSample===true,current=entry.archiveCurrent===true;
    if(!value)return {content:readableText(entry.content),title:entry.title||'',media:null,structured:current,source:current?'current':'personal'};
    const title=plain(entry.title)||(value.kind==='video'?'Видеонаблюдение':'Аудионаблюдение'),duration=finite(value.duration)&&value.duration>0?' / '+number(value.duration)+' с':'',player=media(value);if(sample&&player?.kind==='video')player.poster='/assets/stories/iss075e0003980.jpg';
    const blocks=[title+duration];if(sample)blocks.push('Предзагруженная запись / технический образец');blocks.push(observationText(value,{compact:sample}));
    if(!player)blocks.push('Медиафайл недоступен / результаты записи сохранены.');
    if(sample&&plain(entry.content))blocks.push('Источники\n'+readableText(entry.content));
    return {title:title+duration,content:blocks.join('\n\n'),media:player,structured:true,source:sample?'sample':'personal'};
  }
  const headings=new Set(['Акустические показатели','Окраска голоса','Распознанная речь','Анализ записи','Разбор записи','Видимый возраст','Пятна и пигментация','Самооценка','Последнее аудио','Последнее видео','Визуальные признаки','Источники','Actiwatch / личный импорт']);
  function splitTrailingHeading(text){const match=text.match(/(?:^|\n)([^\n]+)\s*$/);return match&&headings.has(match[1].trim())?{body:text.slice(0,match.index).trimEnd(),heading:match[1].trim()}:null;}
  function renderText(root,text,create){
    for(const paragraph of text.split(/\n\s*\n/)){const [first,...rest]=paragraph.split('\n');if(headings.has(first)){const body=rest.join('\n');if(!body.trim())continue;const section=create('section','book-observation-section');section.append(create('h4','',first),create('p','',body));root.append(section);}else root.append(create('p','',paragraph));}
  }
  window.missionArchiveContent={presentation,observation,latest,currentEntry,captureVisual,readableText,renderText,splitTrailingHeading,visualTitles};
})();
