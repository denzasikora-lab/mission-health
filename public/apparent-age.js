(() => {
  const core=MissionApparentAgeCore,root=document.createElement('article'),methods=document.createElement('div');
  root.className='appearance-metric appearance-metric-extra';root.setAttribute('data-visual-extra','age');root.setAttribute('data-level','neutral');root.setAttribute('aria-label','Apparent age');
  root.innerHTML='<span class="appearance-metric-title">Apparent age</span><strong id="apparent-age-value">-</strong><p id="apparent-age-state" class="appearance-metric-status" role="status">After recording video / two high-quality face frames are required</p>';
  methods.className='apparent-age-methods';methods.innerHTML='<p class="apparent-age-note">EmbeddingGemma 2 / experiment</p><div class="apparent-age-reference"><span id="apparent-age-reference">No baseline selected</span><button type="button" id="apparent-age-set-reference" disabled>Set as baseline</button></div><p class="apparent-age-note">Appearance-based range. Lighting, expression and sleep loss can change similarity.</p><div class="apparent-age-explanation"><p>The embedder compares close-up frames of one face against two sets of age-group descriptions. Agreement between adjacent groups produces a range; no estimate is shown when groups disagree. This is experimental classification, accuracy in years has not been established. Similarity is not a probability, biological age or evidence of aging. The cause of a change, including fatigue, cannot be determined from this estimate.</p><p>Use a recording made after resting as the baseline. Comparison requires the same camera, similar scale and lighting. The baseline is stored in the browser separately for each personal profile and camera, without photographs.</p><a href="https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2" target="_blank" rel="noopener">https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2</a><br><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3738045/" target="_blank" rel="noopener">https://pmc.ncbi.nlm.nih.gov/articles/PMC3738045/</a></div>';
  document.querySelector('#appearance-metrics').append(root);document.querySelector('#appearance-extra-methods').append(methods);
  const value=root.querySelector('#apparent-age-value'),state=root.querySelector('#apparent-age-state'),referenceLabel=methods.querySelector('#apparent-age-reference'),button=methods.querySelector('#apparent-age-set-reference');
  const memory=new Map(),volatile=new Set(),results=new Map(),ownerScopes=new Map();let latest,currentScope='',displayed,ownerIdentity='';
  const sampleVisual=window.missionAnalysisSamples?.visual;let sampleAllowed=true;
  const label=range=>range.max===null?range.min+' years and older':range.min+'-'+range.max+' years';
  function showSample(){
    if(!sampleVisual||!sampleAllowed||displayed)return;
    root.setAttribute('data-result-source','sample');value.textContent='≈ '+label(sampleVisual.age);state.textContent='Reference sample / illustrative range, not a user estimate';referenceLabel.textContent='Reference sample / no personal baseline';button.disabled=true;
  }
  const key=input=>input?.context?.scope?'mission-apparent-age-v1:'+input.context.scope:null;
  function reference(input){const id=key(input);if(!id)return null;try{const item=memory.get(id)||JSON.parse(localStorage.getItem(id)||'null');return item?.method===core.method&&core.rangeValid(item.range)&&Number.isFinite(item.conditions?.light)&&item.conditions.distance>0&&Number.isFinite(Date.parse(item.at))?item:null;}catch{return memory.get(id)||null;}}
  const resultKey=scope=>'mission-apparent-age-result-v1:'+scope;
  function scopeOwner(scope){try{if(!scope.startsWith('mission-appearance-v2:'))return '';const parts=JSON.parse(scope.slice('mission-appearance-v2:'.length));return Array.isArray(parts)&&parts.length===3&&parts.every(value=>typeof value==='string')?JSON.stringify(parts.slice(0,2)):'';}catch{return '';}}
  function setIdentity(input){
    ownerIdentity=input?.storageScope&&input.name?JSON.stringify([input.storageScope,input.name]):'';sampleAllowed=true;setScope('');showSample();if(!ownerIdentity)return;
    try{const scope=ownerScopes.get(ownerIdentity)||localStorage.getItem('mission-apparent-age-owner-v1:'+ownerIdentity);if(scopeOwner(scope)===ownerIdentity&&savedResult(scope))setScope(scope);}catch{}
  }
  function savedResult(scope){if(!scope)return null;try{const item=results.get(scope)||JSON.parse(localStorage.getItem(resultKey(scope))||'null'),report=core.validate(item?.report);return report?.status==='estimated'&&Number.isFinite(Date.parse(item.at))&&Number.isFinite(item.conditions?.light)&&Number.isFinite(item.conditions?.distance)&&item.conditions.distance>0?{report,conditions:item.conditions,at:item.at}:null;}catch{return results.get(scope)||null;}}
  function stamp(at){return new Date(at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'});}
  function setScope(scope){
    const next=typeof scope==='string'?scope:'';if(next===currentScope)return;currentScope=next;latest=null;displayed=savedResult(next);button.disabled=true;
    root.setAttribute('data-result-source',displayed?'saved':'missing');value.textContent=displayed?'≈ '+label(displayed.report.range):'Recording required';state.textContent=displayed?'Latest analysis / '+stamp(displayed.at):'Record video with two high-quality face frames';
    const saved=reference({context:{scope:next}});referenceLabel.textContent=saved?'Baseline: '+label(saved.range)+' / '+new Date(saved.at).toLocaleDateString('en-GB'):'No baseline selected';
    showSample();
  }
  function begin(){sampleAllowed=false;latest=null;root.setAttribute('data-result-source',displayed?'saved':'pending');if(!displayed){referenceLabel.textContent='The baseline will be checked after recording';value.textContent='Processing';}state.textContent=(displayed?'Latest analysis / '+stamp(displayed.at)+'. New recording: ':'')+'checking frames and embedder';button.disabled=true;}
  function finish(report,input){
    const scope=input?.context?.scope||'';if(ownerIdentity&&scopeOwner(scope)!==ownerIdentity)return core.unavailable('model_unavailable');sampleAllowed=false;if(scope!==currentScope)setScope(scope);
    const result=core.validate(report)||core.unavailable('model_unavailable'),saved=reference(input);
    result.comparison=core.compare(result,saved,input?.conditions);
    if(saved)result.reference={range:{...saved.range},at:saved.at};
    value.textContent=result.range?'≈ '+label(result.range):displayed?'≈ '+label(displayed.report.range):'Undetermined';
    referenceLabel.textContent=saved?'Baseline: '+label(saved.range)+' / '+new Date(saved.at).toLocaleDateString('en-GB')+(volatile.has(key(input))?' / this session only':''):'No baseline selected';
    const statuses={higher:'Apparent range is above baseline / repeat after resting',lower:'Apparent range is below baseline',overlap:'Range overlaps the baseline',conditions_changed:'Comparison paused / match lighting and scale',no_reference:'Similarity-based range / '+result.samples+' face frames'};
    const message=result.status==='estimated'?statuses[result.comparison]:result.reason==='need_frames'?'Not enough high-quality frames / pause and look straight ahead':result.reason==='unstable'?'Descriptions and frames suggest different groups / record again':'Embedder unavailable / no estimate obtained';
    if(result.status==='estimated'&&scope){displayed={report:result,conditions:{...input.conditions},at:new Date().toISOString()};results.set(scope,displayed);const owner=scopeOwner(scope);if(owner)ownerScopes.set(owner,scope);try{localStorage.setItem(resultKey(scope),JSON.stringify(displayed));if(owner)localStorage.setItem('mission-apparent-age-owner-v1:'+owner,scope);}catch{}}
    root.setAttribute('data-result-source',result.status==='estimated'?'current':displayed?'saved':'missing');state.textContent=result.status!=='estimated'&&displayed?'Latest analysis / '+stamp(displayed.at)+'. New recording: '+message:message;
    latest=result.status==='estimated'&&key(input)?{report:result,input}:null;button.disabled=!latest;
    return result;
  }
  button.addEventListener('click',()=>{
    if(!latest)return;const {report,input}=latest,id=key(input),saved={method:core.method,range:{...report.range},conditions:{...input.conditions},at:new Date().toISOString()};memory.set(id,saved);
    try{localStorage.setItem(id,JSON.stringify(saved));volatile.delete(id);}catch{volatile.add(id);}
    finish(report,input);
  });
  value.textContent='Recording required';root.setAttribute('data-result-source','missing');showSample();
  window.missionApparentAge={begin,finish,setScope,setIdentity};
})();
