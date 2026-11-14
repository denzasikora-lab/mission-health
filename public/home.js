(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const fields=[['hr','heart_rate','Pulse','bpm'],['spo2','spo2','SpO₂','%'],['temp','skin_temperature','Skin temperature','C'],['wellbeing','wellbeing','Wellbeing','/100'],['sleep','sleep_hours','Sleep','h'],['hrv','hrv','HRV','ms'],['respiration','respiratory_rate','Respiration','/min'],['pressure','bp_systolic','Blood pressure','mmHg'],['recovery','recovery','Reported recovery','/100'],['steps','steps','Steps','steps'],['activity','activity','Movement','counts'],['light','light','Illuminance','lx'],['bodyTemp','body_temperature','Body temperature','C'],['fatigue','fatigue_index','Reported fatigue','/100'],['stress','stress_index','Reported stress','/100']];
  const keys=['heart_rate','spo2','body_temperature','bp_systolic','bp_diastolic','respiratory_rate','fatigue_index','stress_index','skin_temperature','wellbeing','recovery','sleep_hours','hrv','steps','activity','light'];
  const friendProfile=document.querySelector('.mission-rail>.profile'),home=make('section','mission-home');home.id='mission-home';
  home.innerHTML='<section class="home-body-panel panel glass"><header><h2>My readings</h2></header><div class="home-vitals" aria-label="My readings"><div class="home-human"><img src="assets/health-body.svg?v=20261030-illustrated1" alt="Human body diagram"></div></div></section><section class="home-checkin"></section>';
  document.querySelector('.mission-heading').after(home);
  const friendBody=make('section','friend-body-panel panel glass'),friendMetrics=document.getElementById('metrics'),friendHuman=make('div','home-human');friendHuman.innerHTML='<img src="assets/health-body.svg?v=20261030-illustrated1" alt="Human body diagram">';friendMetrics.before(friendBody);friendBody.append(friendMetrics,friendHuman);
  home.querySelector('.home-checkin').append(window.missionCheckin.widget());
  const cards=new Map();
  for(const [key,readingKey,label]of fields){const card=make('article','home-vital panel glass');card.dataset.homeMetric=key;card.dataset.readingKey=readingKey;card.append(make('span','',label),make('strong','','-'),make('small','','No measurement'));home.querySelector('.home-vitals').append(card);cards.set(key,card);}
  function setSource(key,label,url){const note=cards.get(key)?.querySelector('small');if(!note)return;note.replaceChildren();if(url){const link=make('a','home-instrument',label);link.href=url;link.target='_blank';link.rel='noopener';note.append(link);}else note.textContent=label;}
  function model(){
    const stored=window.missionReadings?.current?.(),readings=Object.fromEntries(keys.map(key=>[key,stored?.readings?.[key]?{...stored.readings[key]}:null]));
    const report=window.missionCheckin.current(),at=window.missionCheckin.selection?.()?.at;
    if(report?.wellbeingScale===100&&Number.isInteger(report.score)&&report.score>=1&&report.score<=100&&Number.isFinite(at)&&at<=Date.now()&&Date.now()-at<12*3600000&&(!readings.wellbeing||Date.parse(readings.wellbeing.observedAt)<=at))readings.wellbeing={value:report.score,unit:'/100',source:'manual',observedAt:new Date(at).toISOString()};
    const watch=window.missionActiwatch?.current?.(),imported=watch?.source==='actiwatch'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(watch.id||'')&&Number.isFinite(Date.parse(watch.summary?.end));
    if(imported){const values=watch.summary.latest24h||{};for(const [key,value,unit]of [['sleep_hours',values.sleepSeconds===null?null:values.sleepSeconds/3600,'h'],['activity',values.activityCounts,'counts'],['light',values.meanLightLux,'lx']])readings[key]=Number.isFinite(value)?{value,unit,source:'import',observedAt:new Date(watch.summary.end).toISOString()}:null;}
    return {profileId:'personal',capturedAt:new Date().toISOString(),actiwatchImportId:imported?watch.id:null,readings};
  }
  function snapshot(){const value=model();if(value.actiwatchImportId)for(const key of ['sleep_hours','activity','light'])value.readings[key]=null;return value;}
  const format=value=>new Intl.NumberFormat('en',{maximumFractionDigits:2,useGrouping:false}).format(value);
  function sourceName(key,reading){
    if(reading.source==='import')return 'Actiwatch CSV / '+(window.missionActiwatch.current()?.filename||'saved import');
    const chosen=window.missionCheckin.selection?.();if(key==='wellbeing'&&chosen&&reading.observedAt===new Date(chosen.at).toISOString())return 'Self-report';
    const reported=window.missionReadings?.provenance?.()[key];if(reported?.sourceName)return reported.sourceName;
    const record=window.missionReadings?.records?.().find(item=>{const candidate=item.snapshot?.readings?.[key];return candidate&&candidate.value===reading.value&&candidate.observedAt===reading.observedAt;});return record?.sourceName||'Manual entry';
  }
  function renderValues(){
    const value=model();
    for(const [key,readingKey,label,unit]of fields){
      const card=cards.get(key),number=card.querySelector('strong'),reading=value.readings[readingKey],second=key==='pressure'?value.readings.bp_diastolic:null,valid=Number.isFinite(reading?.value),observed=reading?.observedAt;
      card.dataset.source=(reading||second)?.source||'missing';card.dataset.readingValue=valid?String(reading.value):'';card.dataset.observedAt=observed||second?.observedAt||'';
      if(key==='pressure'){card.dataset.diastolic=Number.isFinite(second?.value)?String(second.value):'';number.textContent=(valid?format(reading.value):'-')+'/'+(Number.isFinite(second?.value)?format(second.value):'-');if(!valid&&!second)number.textContent='-';}
      else if(['spo2','wellbeing','recovery','fatigue','stress'].includes(key))number.innerHTML=window.missionGauge.markup({value:valid?reading.value:null,label,unit:unit==='%'?'%':undefined,reverse:key==='fatigue'||key==='stress'});
      else if(key==='sleep'&&valid){const minutes=Math.round(reading.value*60);number.textContent=String(Math.floor(minutes/60));number.append(make('span','home-vital-unit','h '+minutes%60+' min'));}
      else number.textContent=valid?format(reading.value):'-';
      if((valid||Number.isFinite(second?.value))&&key!=='sleep'&&!['spo2','wellbeing','recovery','fatigue','stress'].includes(key))number.append(make('span','home-vital-unit',unit==='C'?'°C':unit));
      const selected=reading||second;let note='No measurement';if(selected){const title=sourceName(key==='pressure'&&!reading?'bp_diastolic':readingKey,selected),time=new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(selected.observedAt));note=title+' / '+time;if(second&&reading&&second.observedAt!==reading.observedAt)note+=' / diastolic '+new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(second.observedAt));}setSource(key,note);card.title=label+': '+note;
    }
  }
  function render(){
    const isHealth=state.workspace==='crew'&&state.view==='health'&&!state.visiting,isOverview=state.workspace==='crew'&&state.view==='overview';document.querySelector('.mission-heading').hidden=isHealth||isOverview||state.workspace==='crew'&&state.view==='diary';document.getElementById('mission-home-button').setAttribute('aria-pressed',String(isOverview));
    document.querySelectorAll('[data-crew]').forEach(button=>button.setAttribute('aria-pressed',String(state.visiting&&Number(button.dataset.crew)===state.crew)));document.body.dataset.home=String(isHealth);document.body.dataset.overview=String(isOverview);document.body.dataset.visiting=String(Boolean(state.visiting));home.hidden=!isHealth;
    const chat=document.getElementById('nasagpt-sidebar');if(!isOverview&&!chat.hidden)window.missionChatComposer.stopWithin(chat);chat.hidden=!isOverview;if(chat.parentElement!==home.parentElement)home.before(chat);friendProfile.classList.toggle('friend-profile',true);renderValues();
    if(state.workspace==='crew'&&state.view==='health'&&state.visiting){document.getElementById('mission-heading-title').textContent='Visiting / '+crew[state.crew].name;document.getElementById('mission-heading-description').textContent='Friend profile readings';}
  }
  window.missionHome={render,renderValues,setSource,model,snapshot};window.addEventListener('mission-profile-change',render);for(const event of ['mission-wellbeing-change','mission-readings-change','mission-actiwatch-change'])window.addEventListener(event,renderValues);render();window.dispatchEvent(new Event('mission-home-ready'));
})();
