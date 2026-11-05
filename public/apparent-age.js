(() => {
  const core=MissionApparentAgeCore,root=document.createElement('section');root.className='apparent-age-panel';root.setAttribute('aria-label','Видимый возраст');
  root.innerHTML='<header><h3>Видимый возраст</h3><span>EmbeddingGemma 2 / эксперимент</span></header><div class="apparent-age-readout"><strong id="apparent-age-value">-</strong><p id="apparent-age-state" role="status">После видеозаписи / нужны два качественных кадра лица</p></div><div class="apparent-age-reference"><span id="apparent-age-reference">Эталон не выбран</span><button type="button" id="apparent-age-set-reference" disabled>Сделать эталоном</button></div><p class="apparent-age-note">Диапазон по внешности. Свет, мимика и недосып могут менять сходство.</p><details><summary>Как получен диапазон</summary><p>Эмбеддер сравнивает крупные кадры одного лица с двумя наборами описаний возрастных групп. Согласие по соседним группам дает диапазон; при разбросе оценка не выводится. Это экспериментальная классификация, точность в годах не установлена. Сходство не является вероятностью, биологическим возрастом или подтверждением старения. Причину изменения, в том числе усталость, по этой оценке определить нельзя.</p><p>Для эталона используй запись после отдыха. Сравнение требует той же камеры, близкого масштаба и освещения. Эталон хранится в браузере отдельно для личного профиля и камеры, без фотографий.</p><a href="https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2" target="_blank" rel="noopener">https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2</a><br><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3738045/" target="_blank" rel="noopener">https://pmc.ncbi.nlm.nih.gov/articles/PMC3738045/</a></details>';
  document.querySelector('#video-log-dialog .diary-visual-analysis').append(root);
  const value=root.querySelector('#apparent-age-value'),state=root.querySelector('#apparent-age-state'),referenceLabel=root.querySelector('#apparent-age-reference'),button=root.querySelector('button');
  const memory=new Map(),volatile=new Set(),results=new Map(),ownerScopes=new Map();let latest,currentScope='',displayed,ownerIdentity='';
  const label=range=>range.max===null?range.min+' лет и старше':range.min+'-'+range.max+' лет';
  const key=input=>input?.context?.scope?'mission-apparent-age-v1:'+input.context.scope:null;
  function reference(input){const id=key(input);if(!id)return null;try{const item=memory.get(id)||JSON.parse(localStorage.getItem(id)||'null');return item?.method===core.method&&core.rangeValid(item.range)&&Number.isFinite(item.conditions?.light)&&item.conditions.distance>0&&Number.isFinite(Date.parse(item.at))?item:null;}catch{return memory.get(id)||null;}}
  const resultKey=scope=>'mission-apparent-age-result-v1:'+scope;
  function scopeOwner(scope){try{if(!scope.startsWith('mission-appearance-v2:'))return '';const parts=JSON.parse(scope.slice('mission-appearance-v2:'.length));return Array.isArray(parts)&&parts.length===3&&parts.every(value=>typeof value==='string')?JSON.stringify(parts.slice(0,2)):'';}catch{return '';}}
  function setIdentity(input){
    ownerIdentity=input?.storageScope&&input.name?JSON.stringify([input.storageScope,input.name]):'';setScope('');if(!ownerIdentity)return;
    try{const scope=ownerScopes.get(ownerIdentity)||localStorage.getItem('mission-apparent-age-owner-v1:'+ownerIdentity);if(scopeOwner(scope)===ownerIdentity&&savedResult(scope))setScope(scope);}catch{}
  }
  function savedResult(scope){if(!scope)return null;try{const item=results.get(scope)||JSON.parse(localStorage.getItem(resultKey(scope))||'null'),report=core.validate(item?.report);return report?.status==='estimated'&&Number.isFinite(Date.parse(item.at))&&Number.isFinite(item.conditions?.light)&&Number.isFinite(item.conditions?.distance)&&item.conditions.distance>0?{report,conditions:item.conditions,at:item.at}:null;}catch{return results.get(scope)||null;}}
  function stamp(at){return new Date(at).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'});}
  function setScope(scope){
    const next=typeof scope==='string'?scope:'';if(next===currentScope)return;currentScope=next;latest=null;displayed=savedResult(next);button.disabled=true;
    root.setAttribute('data-result-source',displayed?'saved':'missing');value.textContent=displayed?'≈ '+label(displayed.report.range):'Нужна запись';state.textContent=displayed?'Последний анализ / '+stamp(displayed.at):'Запиши видео с двумя качественными кадрами лица';
    const saved=reference({context:{scope:next}});referenceLabel.textContent=saved?'Эталон: '+label(saved.range)+' / '+new Date(saved.at).toLocaleDateString('ru-RU'):'Эталон не выбран';
  }
  function begin(){latest=null;root.setAttribute('data-result-source',displayed?'saved':'pending');if(!displayed){referenceLabel.textContent='Эталон будет проверен после записи';value.textContent='Обработка';}state.textContent=(displayed?'Последний анализ / '+stamp(displayed.at)+'. Новая запись: ':'')+'проверка кадров и эмбеддера';button.disabled=true;}
  function finish(report,input){
    const scope=input?.context?.scope||'';if(ownerIdentity&&scopeOwner(scope)!==ownerIdentity)return core.unavailable('model_unavailable');if(scope!==currentScope)setScope(scope);
    const result=core.validate(report)||core.unavailable('model_unavailable'),saved=reference(input);
    result.comparison=core.compare(result,saved,input?.conditions);
    if(saved)result.reference={range:{...saved.range},at:saved.at};
    value.textContent=result.range?'≈ '+label(result.range):displayed?'≈ '+label(displayed.report.range):'Не определен';
    referenceLabel.textContent=saved?'Эталон: '+label(saved.range)+' / '+new Date(saved.at).toLocaleDateString('ru-RU')+(volatile.has(key(input))?' / только этот сеанс':''):'Эталон не выбран';
    const statuses={higher:'Видимый диапазон выше эталона / повтори после отдыха',lower:'Видимый диапазон ниже эталона',overlap:'Диапазон пересекается с эталоном',conditions_changed:'Сравнение приостановлено / повтори свет и масштаб',no_reference:'Диапазон по сходству / '+result.samples+' кадра лица'};
    const message=result.status==='estimated'?statuses[result.comparison]:result.reason==='need_frames'?'Недостаточно качественных кадров / сделай паузу и смотри прямо':result.reason==='unstable'?'Описания и кадры дают разные группы / повтори запись':'Эмбеддер недоступен / оценка не получена';
    if(result.status==='estimated'&&scope){displayed={report:result,conditions:{...input.conditions},at:new Date().toISOString()};results.set(scope,displayed);const owner=scopeOwner(scope);if(owner)ownerScopes.set(owner,scope);try{localStorage.setItem(resultKey(scope),JSON.stringify(displayed));if(owner)localStorage.setItem('mission-apparent-age-owner-v1:'+owner,scope);}catch{}}
    root.setAttribute('data-result-source',result.status==='estimated'?'current':displayed?'saved':'missing');state.textContent=result.status!=='estimated'&&displayed?'Последний анализ / '+stamp(displayed.at)+'. Новая запись: '+message:message;
    latest=result.status==='estimated'&&key(input)?{report:result,input}:null;button.disabled=!latest;
    return result;
  }
  button.addEventListener('click',()=>{
    if(!latest)return;const {report,input}=latest,id=key(input),saved={method:core.method,range:{...report.range},conditions:{...input.conditions},at:new Date().toISOString()};memory.set(id,saved);
    try{localStorage.setItem(id,JSON.stringify(saved));volatile.delete(id);}catch{volatile.add(id);}
    finish(report,input);
  });
  value.textContent='Нужна запись';root.setAttribute('data-result-source','missing');
  window.missionApparentAge={begin,finish,setScope,setIdentity};
})();
