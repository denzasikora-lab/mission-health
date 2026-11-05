(() => {
  const core=MissionApparentAgeCore,root=document.createElement('section');root.className='apparent-age-panel';root.setAttribute('aria-label','Видимый возраст');
  root.innerHTML='<header><h3>Видимый возраст</h3><span>EmbeddingGemma 2 / эксперимент</span></header><div class="apparent-age-readout"><strong id="apparent-age-value">-</strong><p id="apparent-age-state" role="status">После видеозаписи / нужны два качественных кадра лица</p></div><div class="apparent-age-reference"><span id="apparent-age-reference">Эталон не выбран</span><button type="button" id="apparent-age-set-reference" disabled>Сделать эталоном</button></div><p class="apparent-age-note">Диапазон по внешности. Свет, мимика и недосып могут менять сходство.</p><details><summary>Как получен диапазон</summary><p>Эмбеддер сравнивает крупные кадры одного лица с двумя наборами описаний возрастных групп. Согласие по соседним группам дает диапазон; при разбросе оценка не выводится. Это экспериментальная классификация, точность в годах не установлена. Сходство не является вероятностью, биологическим возрастом или подтверждением старения. Причину изменения, в том числе усталость, по этой оценке определить нельзя.</p><p>Для эталона используй запись после отдыха. Сравнение требует той же камеры, близкого масштаба и освещения. Эталон хранится в браузере отдельно для личного профиля и камеры, без фотографий.</p><a href="https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2" target="_blank" rel="noopener">https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2</a><br><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3738045/" target="_blank" rel="noopener">https://pmc.ncbi.nlm.nih.gov/articles/PMC3738045/</a></details>';
  document.querySelector('#video-log-dialog .log-capture').append(root);
  const value=root.querySelector('#apparent-age-value'),state=root.querySelector('#apparent-age-state'),referenceLabel=root.querySelector('#apparent-age-reference'),button=root.querySelector('button');
  const memory=new Map(),volatile=new Set();let latest;
  const label=range=>range.max===null?range.min+' лет и старше':range.min+'-'+range.max+' лет';
  const key=input=>input?.context?.scope?'mission-apparent-age-v1:'+input.context.scope:null;
  function reference(input){const id=key(input);if(!id)return null;try{const item=memory.get(id)||JSON.parse(localStorage.getItem(id)||'null');return item?.method===core.method&&core.rangeValid(item.range)&&Number.isFinite(item.conditions?.light)&&item.conditions.distance>0&&Number.isFinite(Date.parse(item.at))?item:null;}catch{return memory.get(id)||null;}}
  function begin(){latest=null;referenceLabel.textContent='Эталон будет проверен после записи';value.textContent='-';state.textContent='Ожидание эмбеддера / проверка кадров лица';button.disabled=true;}
  function finish(report,input){
    const result=core.validate(report)||core.unavailable('model_unavailable'),saved=reference(input);
    result.comparison=core.compare(result,saved,input?.conditions);
    if(saved)result.reference={range:{...saved.range},at:saved.at};
    value.textContent=result.range?'≈ '+label(result.range):'Не определен';
    referenceLabel.textContent=saved?'Эталон: '+label(saved.range)+' / '+new Date(saved.at).toLocaleDateString('ru-RU')+(volatile.has(key(input))?' / только этот сеанс':''):'Эталон не выбран';
    const statuses={higher:'Видимый диапазон выше эталона / повтори после отдыха',lower:'Видимый диапазон ниже эталона',overlap:'Диапазон пересекается с эталоном',conditions_changed:'Сравнение приостановлено / повтори свет и масштаб',no_reference:'Диапазон по сходству / '+result.samples+' кадра лица'};
    state.textContent=result.status==='estimated'?statuses[result.comparison]:result.reason==='need_frames'?'Недостаточно качественных кадров / сделай паузу и смотри прямо':result.reason==='unstable'?'Описания и кадры дают разные группы / повтори запись':'Эмбеддер недоступен / оценка не получена';
    latest=result.status==='estimated'&&key(input)?{report:result,input}:null;button.disabled=!latest;
    return result;
  }
  button.addEventListener('click',()=>{
    if(!latest)return;const {report,input}=latest,id=key(input),saved={method:core.method,range:{...report.range},conditions:{...input.conditions},at:new Date().toISOString()};memory.set(id,saved);
    try{localStorage.setItem(id,JSON.stringify(saved));volatile.delete(id);}catch{volatile.add(id);}
    finish(report,input);
  });
  window.missionApparentAge={begin,finish};
})();
