(() => {
  const core=MissionSkinSpotsCore,root=document.createElement('div');root.className='skin-spots-methods';
  root.innerHTML='<p id="skin-spots-status" role="status">Enable the camera. Small areas require a sharp close-up.</p><button type="button" id="skin-spots-reset" disabled>New skin baseline</button><div id="skin-spots-items" class="skin-spots-items"></div><small id="skin-spots-reference">Forehead and both cheeks / no baseline collected yet</small><small id="skin-spots-search">Matching earlier entries becomes available after video analysis.</small><div class="skin-spots-explanation"><p>Three small forehead and cheek regions are compared, aligned by face landmarks. A new candidate must recur in three comparable frames. The camera cannot determine, whether an area is a mole, freckle, irritation or artifact. Other skin is not examined.</p><p>Size is shown in original frame pixels. Equivalent diameter - diameter of a circle with the same area. Area change is normalized by face scale. Color is compared in CIELAB; changes in lighting, angle and white balance pause comparison. Without a ruler and color calibration, millimeters and absolute color cannot be measured. Area change threshold 20% or color 6 ΔE - technical prototype rule, not a medical norm.</p><p>The embedder receives close-up images of selected areas to retrieve similar earlier entries. Vector similarity does not determine size, novelty or risk of a spot. A zero count does not confirm the absence of skin changes.</p><p>A new or changing spot should be assessed by a dermatologist.</p><a href="https://www.aad.org/public/diseases/skin-cancer/find/at-risk/abcdes" target="_blank" rel="noopener">Guidance AAD</a></div>';
  const grid=document.querySelector('#appearance-metrics'),cards=[];
  for(const [key,title] of [['new','New skin areas'],['changed','Pigmentation changes']]){
    const card=document.createElement('article');card.className='appearance-metric appearance-metric-extra';card.setAttribute('data-visual-extra','skin-'+key);card.setAttribute('data-level','neutral');
    card.innerHTML='<span class="appearance-metric-title">'+title+'</span><strong id="skin-spots-'+key+'">-</strong><p class="appearance-metric-status">No comparison</p>';grid.append(card);
    cards.push({node:card,value:card.querySelector('#skin-spots-'+key),status:card.querySelector('.appearance-metric-status')});
  }
  document.querySelector('#appearance-extra-methods').append(root);
  const status=root.querySelector('#skin-spots-status'),referenceLabel=root.querySelector('#skin-spots-reference'),search=root.querySelector('#skin-spots-search'),list=root.querySelector('#skin-spots-items'),reset=root.querySelector('#skin-spots-reset');
  reset.disabled=true;
  const names={'forehead':'Forehead','left-cheek':'Left frame area / cheek','right-cheek':'Right frame area / cheek'},reasons={need_camera:'Enable the camera for comparison.',need_frames:'A complete sharp face frame is required.',need_closeup:'Move closer: there are not enough pixels for individual spots.',not_enough_detail:'Could not reliably isolate the regions. Repeat the close-up and lighting.',no_reference:'Skin baseline required.',unstable:'Waiting for three stable frames.',conditions_changed:'Match lighting, baseline distance and angle.',collecting:'Collecting skin baseline'};
  let scope='',reference=null,samples=[],lastTime=0,latestTime=0,latest=null,report=core.unavailable('need_camera'),storageOk=true;
  const sampleVisual=window.missionAnalysisSamples?.visual;let sampleAllowed=true;
  const key=()=> 'mission-skin-spots-v1:'+scope,fmt=n=>new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(n),hex=c=>'#'+['r','g','b'].map(k=>c[k].toString(16).padStart(2,'0')).join('');
  function render(){
    list.replaceChildren();const compared=report.status==='compared',sample=sampleAllowed&&Boolean(sampleVisual)&&!compared;
    root.setAttribute('data-result-source',sample?'sample':compared?'current':'missing');
    for(const [index,card] of cards.entries()){card.value.textContent=compared?(index===0?report.newCount:report.changedCount):sample?(index===0?sampleVisual.skin.newCount:sampleVisual.skin.changedCount):'-';card.node.setAttribute('data-result-source',compared?'current':sample?'sample':'missing');card.status.textContent=sample?'Reference sample':compared?'Baseline comparison':'No comparison';}
    status.textContent=sample?'Reference sample / zero counters illustrate the interface, user skin was not measured':compared?'Available regions compared / candidates require review':reasons[report.reason]||reasons.need_frames;
    referenceLabel.textContent=sample?'Reference sample / no personal baseline':reference?'Baseline '+new Date(reference.at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'})+(storageOk?' / on this device':' / this session only'):'Forehead and both cheeks / baseline '+samples.length+' from 5 frames';
    if(sample){reset.disabled=true;search.textContent='The reference sample is not saved to your personal archive.';}
    for(const item of report.items){
      const node=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p'),colors=document.createElement('div');node.className='skin-spot-item';title.textContent=(item.change==='new'?'New contrasting area':item.change==='changed'?'Area changed':'Area matched')+' / '+names[item.region];
      detail.textContent='Equiv. diameter ≈ '+fmt(item.diameterPixels)+' px · area '+fmt(item.areaPixels)+' px²'+(item.baseline?' · area '+(item.areaChangePercent>0?'+':'')+fmt(item.areaChangePercent)+'% · color '+fmt(item.deltaE)+' ΔE':' · not detected in baseline');
      colors.className='skin-spot-colors';for(const [label,color]of [['Baseline',item.baseline?.color],['Now',item.color]])if(color){const chip=document.createElement('span'),swatch=document.createElement('i');swatch.style.background=hex(color);swatch.setAttribute('aria-hidden','true');chip.append(swatch,document.createTextNode(label+' '+hex(color)));colors.append(chip);}
      node.append(title,detail,colors);list.append(node);
    }
  }
  function setScope(value){
    sampleAllowed=false;scope=value;reset.disabled=true;samples=[];lastTime=latestTime=0;latest=null;reference=null;storageOk=true;report=core.unavailable('need_camera');search.textContent='Matching earlier entries becomes available after video analysis.';
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
  reset.addEventListener('click',()=>{if(reset.disabled)return;reference=null;samples=[];report=core.unavailable('collecting');reset.disabled=true;search.textContent='Collecting a new skin baseline.';render();});
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
  function pending(value){const clean=core.validate(value);if(clean?.status==='compared'&&clean.trackingKey===reference?.trackingKey&&!latest){sampleAllowed=false;report=clean;render();search.textContent='Size and color measured / recording vectorization pending.';}}
  function encoded(value){const clean=core.validate(value);if(!clean||clean.status==='compared'&&clean.trackingKey!==reference?.trackingKey)return;sampleAllowed=false;if(!latest){report=clean;render();}const count=clean.items.filter(v=>v.vector).length;search.textContent=count?'For '+count+' regions vectorized / searching earlier entries.':'Region vectors unavailable / pixel comparison preserved.';}
  function matches(value,trackingKey){if(trackingKey!==reference?.trackingKey||!Array.isArray(value)||value.length>4)return;search.textContent=value.length?'Similar regions found in '+new Set(value.map(v=>v.recordId)).size+' earlier entries. Similarity helps matching, it does not confirm the spot type.':'No comparable earlier vectors yet.';}
  window.missionSkinSpots={setScope,observe,pause,snapshot,pending,encoded,matches};render();
})();
