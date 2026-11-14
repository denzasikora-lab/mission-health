(() => {
  const core=MissionApparentAgeCore,root=document.createElement('article'),methods=document.createElement('div');
  root.className='appearance-metric appearance-metric-extra';root.setAttribute('data-visual-extra','age');root.setAttribute('data-level','neutral');root.setAttribute('aria-label','Apparent age');
  root.innerHTML='<span class="appearance-metric-title">Apparent age</span><strong id="apparent-age-value">-</strong><p id="apparent-age-state" class="appearance-metric-status" role="status">After recording video / two high-quality face frames are required</p>';
  methods.className='apparent-age-methods';methods.innerHTML='<p class="apparent-age-note">EmbeddingGemma 2 / experiment</p><div class="apparent-age-reference"><span id="apparent-age-reference">Previous recording is selected automatically</span></div><p class="apparent-age-note">Appearance-based range. Lighting, expression and sleep loss can change similarity.</p><div class="apparent-age-explanation"><p>Face crops from two or three quality-checked frames are embedded separately from the video background. Their mean unit vector is saved with the recording and compared with your previous saved face recording using cosine similarity. Face geometry and under-eye lightness contrast are compared separately; cosine similarity is not a health score and does not measure eye bags.</p><p>Age-group descriptions provide an experimental apparent-age range, not chronological or biological age. Accuracy in years is not established. Similarity cannot establish aging or the cause of a change. The first recording becomes the reference automatically. Later recordings use the previous recording from your private archive. Use the same camera, angle and lighting.</p><a href="https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2" target="_blank" rel="noopener">https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2</a></div>';
  document.querySelector('#appearance-metrics').append(root);document.querySelector('#appearance-extra-methods').append(methods);
  const value=root.querySelector('#apparent-age-value'),state=root.querySelector('#apparent-age-state'),referenceLabel=methods.querySelector('#apparent-age-reference');
  const results=new Map(),ownerScopes=new Map();let currentScope='',displayed,ownerIdentity='';
  const sampleVisual=window.missionAnalysisSamples?.visual;let sampleAllowed=true;
  const label=range=>range.max===null?range.min+' years and older':range.min+'-'+range.max+' years';
  function showSample(){
    if(!sampleVisual||!sampleAllowed||displayed)return;
    root.setAttribute('data-result-source','sample');value.textContent='≈ '+label(sampleVisual.age);state.textContent='Reference sample / illustrative range, not a user estimate';referenceLabel.textContent='Reference sample / no personal baseline';
  }
  const resultKey=scope=>'mission-apparent-age-result-v1:'+scope;
  function scopeOwner(scope){try{if(!scope.startsWith('mission-appearance-v2:'))return '';const parts=JSON.parse(scope.slice('mission-appearance-v2:'.length));return Array.isArray(parts)&&parts.length===3&&parts.every(value=>typeof value==='string')?JSON.stringify(parts.slice(0,2)):'';}catch{return '';}}
  function setIdentity(input){
    ownerIdentity=input?.storageScope&&input.name?JSON.stringify([input.storageScope,input.name]):'';sampleAllowed=true;setScope('');showSample();if(!ownerIdentity)return;
    try{const scope=ownerScopes.get(ownerIdentity)||localStorage.getItem('mission-apparent-age-owner-v1:'+ownerIdentity);if(scopeOwner(scope)===ownerIdentity&&savedResult(scope))setScope(scope);}catch{}
  }
  function savedResult(scope){if(!scope)return null;try{const item=results.get(scope)||JSON.parse(localStorage.getItem(resultKey(scope))||'null'),report=core.validate(item?.report);return report?.status==='estimated'&&Number.isFinite(Date.parse(item.at))?{report,conditions:item.conditions||null,at:item.at}:null;}catch{return results.get(scope)||null;}}
  function stamp(at){return new Date(at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'});}
  function setScope(scope){
    const next=typeof scope==='string'?scope:'';if(next===currentScope)return;currentScope=next;displayed=savedResult(next);
    root.setAttribute('data-result-source',displayed?'saved':'missing');value.textContent=displayed?'≈ '+label(displayed.report.range):'Recording required';state.textContent=displayed?'Latest analysis / '+stamp(displayed.at):'Record video with two high-quality face frames';
    referenceLabel.textContent='Previous recording is selected automatically';
    showSample();
  }
  function begin(){sampleAllowed=false;root.setAttribute('data-result-source',displayed?'saved':'pending');if(!displayed){referenceLabel.textContent='Previous recording will be checked after saving';value.textContent='Processing';}state.textContent=(displayed?'Latest analysis / '+stamp(displayed.at)+'. New recording: ':'')+'checking frames and embedder';}
  function finish(report,input){
    const scope=input?.context?.scope||'';if(ownerIdentity&&scopeOwner(scope)!==ownerIdentity)return core.unavailable('model_unavailable');sampleAllowed=false;if(scope!==currentScope)setScope(scope);
    const result=core.validate(report)||core.unavailable('model_unavailable');delete result.reference;result.comparison=result.status==='estimated'?'no_reference':'unavailable';
    value.textContent=result.range?'≈ '+label(result.range):displayed?'≈ '+label(displayed.report.range):'Undetermined';
    referenceLabel.textContent='Previous recording will be checked after saving';
    const statuses={higher:'Apparent range is above baseline / repeat after resting',lower:'Apparent range is below baseline',overlap:'Range overlaps the baseline',conditions_changed:'Comparison paused / match lighting and scale',no_reference:'Similarity-based range / '+result.samples+' face frames'};
    const message=result.status==='estimated'?statuses[result.comparison]:result.reason==='need_frames'?'Not enough high-quality frames / pause and look straight ahead':result.reason==='unstable'?'Descriptions and frames suggest different groups / record again':'Embedder unavailable / no estimate obtained';
    if(result.status==='estimated'&&scope){displayed={report:result,conditions:{...input.conditions},at:new Date().toISOString()};results.set(scope,displayed);const owner=scopeOwner(scope);if(owner)ownerScopes.set(owner,scope);try{localStorage.setItem(resultKey(scope),JSON.stringify(displayed));if(owner)localStorage.setItem('mission-apparent-age-owner-v1:'+owner,scope);}catch{}}
    root.setAttribute('data-result-source',result.status==='estimated'?'current':displayed?'saved':'missing');state.textContent=result.status!=='estimated'&&displayed?'Latest analysis / '+stamp(displayed.at)+'. New recording: '+message:message;
    return result;
  }
  function restoreSession(input,comparison,createdAt){
    const report=core.validate(input);sampleAllowed=false;
    value.textContent=report?.range?'≈ '+label(report.range):'Undetermined';root.setAttribute('data-result-source','saved');
    const messages={higher:'Apparent range above previous recording',lower:'Apparent range below previous recording',overlap:'Range overlaps previous recording',conditions_changed:'Comparison paused / match camera, lighting and scale',no_reference:'No previous age range / saved automatically',unavailable:'Not enough consistent face frames for an age range'};
    state.textContent=messages[report?.comparison||'unavailable'];referenceLabel.textContent=comparison.reference?'Previous recording / '+stamp(comparison.reference.at):'First face recording saved';
    if(report?.status==='estimated'&&currentScope){displayed={report,conditions:displayed?.conditions||null,at:createdAt};results.set(currentScope,displayed);try{localStorage.setItem(resultKey(currentScope),JSON.stringify(displayed));}catch{}}
  }
  value.textContent='Recording required';root.setAttribute('data-result-source','missing');showSample();
  window.missionApparentAge={begin,finish,setScope,setIdentity,restoreSession};
})();
