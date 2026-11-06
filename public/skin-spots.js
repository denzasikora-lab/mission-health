(() => {
  const core=MissionSkinSpotsCore,root=document.createElement('div');root.className='skin-spots-methods';
  root.innerHTML='<p id="skin-spots-status" role="status">Включи камеру. Для мелких участков нужен крупный и резкий кадр.</p><button type="button" id="skin-spots-reset" disabled>Новый эталон кожи</button><div id="skin-spots-items" class="skin-spots-items"></div><small id="skin-spots-reference">Лоб и две щеки / эталон пока не собран</small><small id="skin-spots-search">Сопоставление с прошлыми записями появится после анализа видео.</small><div class="skin-spots-explanation"><p>Сравниваются три небольших участка лба и щек, выровненных по точкам лица. Новый кандидат должен повторяться в трех сопоставимых кадрах. Камера не определяет, является ли участок родинкой, веснушкой, раздражением или артефактом. Остальная кожа не проверяется.</p><p>Размер показан в пикселях исходного кадра. Эквивалентный диаметр - диаметр круга той же площади. Изменение площади нормировано по масштабу лица. Цвет сравнивается в CIELAB; изменение света, ракурса и баланса белого приостанавливает сравнение. Без линейки и цветовой калибровки миллиметры и абсолютный цвет не измеряются. Порог изменения площади 20% или цвета 6 ΔE - техническое правило прототипа, не медицинская норма.</p><p>Эмбеддер получает крупные изображения выбранных участков для поиска похожих прошлых записей. Векторное сходство не определяет размер, новизну или опасность пятна. Нулевой счетчик не подтверждает отсутствие изменений кожи.</p><p>Новое или меняющееся пятно стоит показать дерматологу.</p><a href="https://www.aad.org/public/diseases/skin-cancer/find/at-risk/abcdes" target="_blank" rel="noopener">Рекомендации AAD</a></div>';
  const grid=document.querySelector('#appearance-metrics'),cards=[];
  for(const [key,title] of [['new','Новые участки кожи'],['changed','Изменения пигментации']]){
    const card=document.createElement('article');card.className='appearance-metric appearance-metric-extra';card.setAttribute('data-visual-extra','skin-'+key);card.setAttribute('data-level','neutral');
    card.innerHTML='<span class="appearance-metric-title">'+title+'</span><strong id="skin-spots-'+key+'">-</strong><p class="appearance-metric-status">Нет сравнения</p>';grid.append(card);
    cards.push({node:card,value:card.querySelector('#skin-spots-'+key),status:card.querySelector('.appearance-metric-status')});
  }
  document.querySelector('#appearance-extra-methods').append(root);
  const status=root.querySelector('#skin-spots-status'),referenceLabel=root.querySelector('#skin-spots-reference'),search=root.querySelector('#skin-spots-search'),list=root.querySelector('#skin-spots-items'),reset=root.querySelector('#skin-spots-reset');
  const names={'forehead':'Лоб','left-cheek':'Левая область кадра / щека','right-cheek':'Правая область кадра / щека'},reasons={need_camera:'Включи камеру для сравнения.',need_frames:'Нужен полный резкий кадр лица.',need_closeup:'Приблизь лицо: для отдельных пятен не хватает пикселей.',not_enough_detail:'Участки не удалось надежно выделить. Повтори крупный кадр и освещение.',no_reference:'Нужен эталон кожи.',unstable:'Ожидание трех устойчивых кадров.',conditions_changed:'Повтори свет, расстояние и ракурс эталона.',collecting:'Сбор эталона кожи'};
  let scope='',reference=null,samples=[],lastTime=0,latestTime=0,latest=null,report=core.unavailable('need_camera'),storageOk=true;
  const sampleVisual=window.missionAnalysisSamples?.visual;let sampleAllowed=true;
  const key=()=> 'mission-skin-spots-v1:'+scope,fmt=n=>new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(n),hex=c=>'#'+['r','g','b'].map(k=>c[k].toString(16).padStart(2,'0')).join('');
  function render(){
    list.replaceChildren();const compared=report.status==='compared',sample=sampleAllowed&&Boolean(sampleVisual)&&!compared;
    root.setAttribute('data-result-source',sample?'sample':compared?'current':'missing');
    for(const [index,card] of cards.entries()){card.value.textContent=compared?(index===0?report.newCount:report.changedCount):sample?(index===0?sampleVisual.skin.newCount:sampleVisual.skin.changedCount):'-';card.node.setAttribute('data-result-source',compared?'current':sample?'sample':'missing');card.status.textContent=sample?'Контрольный пример':compared?'Сравнение с эталоном':'Нет сравнения';}
    status.textContent=sample?'Контрольный пример / нулевые счетчики иллюстрируют интерфейс, кожа пользователя не измерялась':compared?'Сравнены доступные участки / кандидаты требуют проверки':reasons[report.reason]||reasons.need_frames;
    referenceLabel.textContent=sample?'Контрольный пример / личного эталона нет':reference?'Эталон '+new Date(reference.at).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})+(storageOk?' / на этом устройстве':' / только этот сеанс'):'Лоб и две щеки / эталон '+samples.length+' из 5 кадров';
    if(sample){reset.disabled=true;search.textContent='Контрольный пример не сохраняется в личный архив.';}
    for(const item of report.items){
      const node=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p'),colors=document.createElement('div');node.className='skin-spot-item';title.textContent=(item.change==='new'?'Новый контрастный участок':item.change==='changed'?'Участок изменился':'Участок сопоставлен')+' / '+names[item.region];
      detail.textContent='Экв. диаметр ≈ '+fmt(item.diameterPixels)+' px · площадь '+fmt(item.areaPixels)+' px²'+(item.baseline?' · площадь '+(item.areaChangePercent>0?'+':'')+fmt(item.areaChangePercent)+'% · цвет '+fmt(item.deltaE)+' ΔE':' · в эталоне не выделен');
      colors.className='skin-spot-colors';for(const [label,color]of [['Эталон',item.baseline?.color],['Сейчас',item.color]])if(color){const chip=document.createElement('span'),swatch=document.createElement('i');swatch.style.background=hex(color);swatch.setAttribute('aria-hidden','true');chip.append(swatch,document.createTextNode(label+' '+hex(color)));colors.append(chip);}
      node.append(title,detail,colors);list.append(node);
    }
  }
  function setScope(value){
    sampleAllowed=false;scope=value;reset.disabled=true;samples=[];lastTime=latestTime=0;latest=null;reference=null;storageOk=true;report=core.unavailable('need_camera');search.textContent='Сопоставление с прошлыми записями появится после анализа видео.';
    try{const stored=JSON.parse(localStorage.getItem(key())||'null');if(core.referenceValid(stored))reference=stored;}catch{storageOk=false;}render();
  }
  function observe(value,time){
    if(!scope)return;
    sampleAllowed=false;
    if(!value?.valid){samples=[];latest=null;report=core.unavailable(value?.reason||'need_frames');reset.disabled=true;render();return;}
    if(lastTime&&time-lastTime>2200)samples=[];lastTime=time;latestTime=time;latest=value;samples.push(value);if(samples.length>5)samples.shift();reset.disabled=samples.length<5||!core.stable(samples);
    if(!reference){
      reference=core.reference(samples);
      if(reference){try{localStorage.setItem(key(),JSON.stringify(reference));}catch{storageOk=false;}}
      else{report=core.unavailable('collecting',samples.length);render();return;}
    }
    report=core.compare(samples.slice(-3),reference);render();
  }
  function pause(){samples=[];lastTime=latestTime=0;latest=null;reset.disabled=true;report=core.unavailable('need_camera');render();}
  reset.addEventListener('click',()=>{if(reset.disabled)return;reference=null;samples=[];report=core.unavailable('collecting');reset.disabled=true;search.textContent='Собирается новый эталон кожи.';render();});
  function snapshot(context){
    if(!scope||!context||context.scope!==scope||!latest||latestTime<context.since||performance.now()-latestTime>2200)return{report:core.unavailable('need_frames'),crops:[]};
    const clean=core.validate(report);if(clean?.status!=='compared')return{report:clean||core.unavailable('need_frames'),crops:[]};
    const crops=[];
    for(const item of clean.items){
      const patch=latest.patches.find(p=>p.region===item.region),spot=patch?.spots.filter(p=>Math.hypot(p.x-item.x,p.y-item.y)<.04).sort((a,b)=>Math.hypot(a.x-item.x,a.y-item.y)-Math.hypot(b.x-item.x,b.y-item.y))[0];if(!spot)continue;
      try{
        const source=document.createElement('canvas');source.width=core.width;source.height=core.height;const ctx=source.getContext('2d'),image=ctx.createImageData(core.width,core.height);image.data.set(patch.pixels);ctx.putImageData(image,0,0);
        const box=spot.box,pad=12,x=Math.max(0,box.x-pad),y=Math.max(0,box.y-pad),w=Math.min(core.width-x,box.width+2*pad),h=Math.min(core.height-y,box.height+2*pad),crop=document.createElement('canvas');crop.width=w;crop.height=h;crop.getContext('2d').drawImage(source,x,y,w,h,0,0,w,h);
        const raw=atob(crop.toDataURL('image/png').split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));crops.push({id:item.id,blob:new Blob([bytes],{type:'image/png'})});
      }catch{}
    }
    return {report:clean,crops};
  }
  function pending(value){const clean=core.validate(value);if(clean?.status==='compared'&&clean.trackingKey===reference?.trackingKey&&!latest){sampleAllowed=false;report=clean;render();search.textContent='Размер и цвет измерены / ожидается векторизация записи.';}}
  function encoded(value){const clean=core.validate(value);if(!clean||clean.status==='compared'&&clean.trackingKey!==reference?.trackingKey)return;sampleAllowed=false;if(!latest){report=clean;render();}const count=clean.items.filter(v=>v.vector).length;search.textContent=count?'Для '+count+' участков построены векторы / идет поиск прошлых записей.':'Векторы участков не получены / сравнение пикселей сохранено.';}
  function matches(value,trackingKey){if(trackingKey!==reference?.trackingKey||!Array.isArray(value)||value.length>4)return;search.textContent=value.length?'Найдены похожие участки в '+new Set(value.map(v=>v.recordId)).size+' прошлых записях. Сходство помогает сопоставлению, не подтверждает тип пятна.':'Сопоставимых прошлых векторов пока нет.';}
  window.missionSkinSpots={setScope,observe,pause,snapshot,pending,encoded,matches};render();
})();
