(() => {
  const core=MissionSkinSpotsCore,root=document.createElement('div');root.className='skin-spots-methods';
  root.innerHTML='<p id="skin-spots-status" role="status">Enable the camera. Small areas require a sharp close-up.</p><button type="button" id="skin-spots-reset" disabled>New skin baseline</button><div id="skin-spots-items" class="skin-spots-items"></div><small id="skin-spots-reference">Forehead and both cheeks / no baseline collected yet</small><small id="skin-spots-search">Matching earlier entries becomes available after video analysis.</small><div class="skin-spots-explanation"><p>Checks the forehead and cheeks for recurring new areas and changes in size or color. Embeddings help find similar areas in earlier recordings. Measurements use pixels; this does not diagnose skin conditions.</p></div>';
  const grid=document.querySelector('#appearance-metrics'),cards=[];
  for(const [key,title] of [['new','New skin areas'],['changed','Pigmentation changes']]){
    const card=document.createElement('article');card.className='appearance-metric appearance-metric-extra';card.setAttribute('data-visual-extra','skin-'+key);card.setAttribute('data-level','neutral');
    card.innerHTML='<div class="skin-metric-heading"><span class="appearance-metric-title">'+title+'</span><span id="skin-spots-'+key+'-badge" class="skin-metric-badge" hidden></span></div><div class="skin-metric-reading"><strong id="skin-spots-'+key+'">-</strong><span id="skin-spots-'+key+'-delta" class="skin-metric-delta" hidden></span></div><p id="skin-spots-'+key+'-state" class="appearance-metric-status">No comparison</p>';grid.append(card);
    cards.push({node:card,value:card.querySelector('#skin-spots-'+key),status:card.querySelector('#skin-spots-'+key+'-state'),badge:card.querySelector('#skin-spots-'+key+'-badge'),delta:card.querySelector('#skin-spots-'+key+'-delta')});
  }
  document.querySelector('#appearance-extra-methods').append(root);
  const status=root.querySelector('#skin-spots-status'),referenceLabel=root.querySelector('#skin-spots-reference'),search=root.querySelector('#skin-spots-search'),list=root.querySelector('#skin-spots-items'),reset=root.querySelector('#skin-spots-reset');
  reset.disabled=true;
  const names={'forehead':'Forehead','left-cheek':'Left frame area / cheek','right-cheek':'Right frame area / cheek'},reasons={need_camera:'Enable the camera for comparison.',need_frames:'A complete sharp face frame is required.',need_closeup:'Move closer: there are not enough pixels for individual spots.',not_enough_detail:'Could not reliably isolate the regions. Repeat the close-up and lighting.',no_reference:'Skin baseline required.',unstable:'Waiting for three stable frames.',conditions_changed:'Match lighting, baseline distance and angle.',collecting:'Collecting skin baseline'};
  let scope='',reference=null,samples=[],lastTime=0,latestTime=0,latest=null,report=core.unavailable('need_camera'),storageOk=true;
  const sampleVisual=window.missionAnalysisSamples?.visual;let sampleAllowed=false,trial=false;
  const key=()=> 'mission-skin-spots-v1:'+scope,fmt=n=>new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(n),hex=c=>'#'+['r','g','b'].map(k=>c[k].toString(16).padStart(2,'0')).join('');
  function render(){
    list.replaceChildren();const compared=report.status==='compared'&&!trial,sample=(trial||sampleAllowed)&&Boolean(sampleVisual)&&!compared;
    root.setAttribute('data-result-source',sample?'preflight':compared?'current':'missing');
    for(const [index,card] of cards.entries()){
      const count=compared?(index===0?report.newCount:report.changedCount):sample?(index===0?sampleVisual.skin.newCount:sampleVisual.skin.changedCount):null,notice=count>0;
      card.value.textContent=count??'-';card.node.setAttribute('data-result-source',compared?'current':sample?'preflight':'missing');card.node.setAttribute('data-level',count===null?'neutral':notice?'amber':'green');
      card.delta.hidden=count===null;card.delta.textContent=count===null?'':'Δ '+(count>0?'+':'')+count;card.delta.title='Change count versus baseline';
      const badge=notice?'Check':'';card.badge.hidden=!badge;card.badge.textContent=badge;card.badge.title='New or changed area to check';window.missionKonstaBadge?.mount(card.badge,badge);
      card.status.textContent=count===null?'No comparison':notice?(index===0?'New area / check':'Pigmentation changed / check'):'No change vs baseline';
      card.node.setAttribute('aria-label',(index===0?'New skin areas':'Pigmentation changes')+': '+(count??'No comparison')+(sample?'. Preflight data':count===null?'':'. Baseline comparison'));
    }
    status.textContent=sample?'Preflight data / synthetic skin comparison':compared?'Available regions compared / candidates require review':reasons[report.reason]||reasons.need_frames;
    referenceLabel.textContent=sample?'Preflight baseline / 5 simulated frames':reference?'Baseline '+new Date(reference.at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'})+(storageOk?' / on this device':' / this session only'):'Forehead and both cheeks / baseline '+samples.length+' from 5 frames';
    if(sample){reset.disabled=true;search.textContent='Preflight: 0 → 1 new area / same face before and after';return;}
    for(const item of report.items){
      const node=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p'),colors=document.createElement('div');node.className='skin-spot-item';title.textContent=(item.change==='new'?'New contrasting area':item.change==='changed'?'Area changed':'Area matched')+' / '+names[item.region];
      detail.textContent='Equiv. diameter ≈ '+fmt(item.diameterPixels)+' px · area '+fmt(item.areaPixels)+' px²'+(item.baseline?' · area '+(item.areaChangePercent>0?'+':'')+fmt(item.areaChangePercent)+'% · color '+fmt(item.deltaE)+' ΔE':' · not detected in baseline');
      colors.className='skin-spot-colors';for(const [label,color]of [['Baseline',item.baseline?.color],['Now',item.color]])if(color){const chip=document.createElement('span'),swatch=document.createElement('i');swatch.style.background=hex(color);swatch.setAttribute('aria-hidden','true');chip.append(swatch,document.createTextNode(label+' '+hex(color)));colors.append(chip);}
      node.append(title,detail,colors);list.append(node);
    }
  }
  function setScope(value){
    sampleAllowed=false;trial=false;scope=value;reset.disabled=true;samples=[];lastTime=latestTime=0;latest=null;reference=null;storageOk=true;report=core.unavailable('need_camera');search.textContent='Matching earlier entries becomes available after video analysis.';
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
  function preflight(enabled){if(latest)return;trial=Boolean(enabled);sampleAllowed=Boolean(enabled);render();}
  window.addEventListener?.('mission-badges-ready',render);
  window.missionSkinSpots={setScope,observe,pause,snapshot,pending,encoded,matches,preflight};render();
})();
