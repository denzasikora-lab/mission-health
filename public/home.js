(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const friendProfile=document.querySelector('.mission-rail>.profile');
  const home=make('section','mission-home');home.id='mission-home';
  home.innerHTML='<section class="home-body-panel panel glass"><header><h2>My readings</h2></header><div class="home-vitals" aria-label="My readings"><div class="home-human"><img src="assets/health-body.svg?v=20261030-illustrated1" alt="Human body diagram"></div></div></section><section class="home-checkin"></section>';
  document.querySelector('.mission-heading').after(home);
  const friendBody=make('section','friend-body-panel panel glass'),friendMetrics=document.getElementById('metrics');
  const friendHuman=make('div','home-human');friendHuman.innerHTML='<img src="assets/health-body.svg?v=20261030-illustrated1" alt="Human body diagram">';
  friendMetrics.before(friendBody);friendBody.append(friendMetrics,friendHuman);

  home.querySelector('.home-checkin').append(window.missionCheckin.widget());
  for(const [key,label,unit]of [['hr','Pulse','bpm'],['spo2','SpO₂','%'],['temp','Skin temperature','°C'],['wellbeing','Wellbeing','/ 100'],['sleep','Sleep','h'],['hrv','HRV','ms'],['respiration','Respiration','/min'],['pressure','Blood pressure','mmHg. units.'],['recovery','Recovery','/100'],['steps','Steps','steps'],['activity','Movement','counts'],['light','Illuminance','lx']]){
    const card=make('article','home-vital panel glass');card.dataset.homeMetric=key;
    card.append(make('span','',label),make('strong','','-'),make('small','',key==='wellbeing'?'Select a score below':'No measurements'));home.querySelector('.home-vitals').append(card);
  }
  // Channel names follow the instrument descriptions from CSA, NASA and the manufacturer Astroskin.
  const csa='https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp',nasa='https://www.nasa.gov/wp-content/uploads/2023/11/roi-iss-facilities-june2023.pdf',astroskin='https://hexoskin.com/pages/astroskin';
  const instruments={
    hr:['Bio-Monitor / ECG',csa],spo2:['Bio-Monitor / pulse oximeter',csa],temp:['Bio-Monitor / skin sensor',csa],
    sleep:['Actiwatch Plus / Actiware',nasa],hrv:['Astroskin / RR-intervals',astroskin],respiration:['Bio-Monitor / respiratory sensor',csa],
    pressure:['Portapres / cuff','https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000561?dataType=HARDWARE'],
    recovery:['Calculated index'],steps:['Astroskin / accelerometer',astroskin],activity:['Actiwatch Plus',nasa],light:['Actiwatch Plus / light sensor',nasa]
  };
  function setSource(key,label,url){
    const note=home.querySelector('[data-home-metric='+key+'] > small');
    if(!note)return;
    note.replaceChildren();
    if(url){const link=make('a','home-instrument',label);link.href=url;link.target='_blank';link.rel='noopener';link.title='Instrument description: '+label;note.append(link);}
    else note.textContent=label;
  }
  const demoValues={hr:[72,'bpm'],spo2:[98,'%'],temp:[36.7,'°C'],sleep:[7+40/60,'h'],hrv:[46,'ms'],respiration:[14,'/min'],pressure:[{systolic:118,diastolic:76},'mmHg'],recovery:[86,'/100'],steps:[6240,'steps'],activity:[66218,'counts'],light:[187.3,'lx']};
  for(const [key,[value,unit]]of Object.entries(demoValues)){const card=home.querySelector('[data-home-metric='+key+']'),number=card.querySelector('strong');if(['spo2','recovery'].includes(key))number.innerHTML=window.missionGauge.markup({value,label:key==='spo2'?'SpO₂':'Recovery',unit:key==='spo2'?'%':undefined});else{number.textContent=key==='pressure'?value.systolic+'/'+value.diastolic:key==='sleep'?String(Math.floor(value)):new Intl.NumberFormat('en',{maximumFractionDigits:1,useGrouping:false}).format(value);number.append(make('span','home-vital-unit',key==='sleep'?'h '+Math.round(value%1*60)+' min':unit));}setSource(key,...instruments[key]);card.dataset.source='demo';}
  function snapshot(){
    const reading=(value,unit)=>Number.isFinite(value)?{value,unit,source:'demo',observedAt:null}:null;
    const readings={heart_rate:reading(demoValues.hr[0],'bpm'),spo2:reading(demoValues.spo2[0],'%'),body_temperature:null,bp_systolic:reading(demoValues.pressure[0].systolic,'mmHg'),bp_diastolic:reading(demoValues.pressure[0].diastolic,'mmHg'),respiratory_rate:reading(demoValues.respiration[0],'/min'),fatigue_index:null,stress_index:null,skin_temperature:reading(demoValues.temp[0],'C'),wellbeing:null,recovery:reading(demoValues.recovery[0],'/100'),sleep_hours:reading(demoValues.sleep[0],'h'),hrv:reading(demoValues.hrv[0],'ms'),steps:reading(demoValues.steps[0],'steps'),activity:reading(demoValues.activity[0],'counts'),light:reading(demoValues.light[0],'lx')};
    const report=window.missionCheckin.current(),at=window.missionCheckin.selection?.()?.at;
    if(report?.wellbeingScale===100&&Number.isInteger(report.score)&&report.score>=1&&report.score<=100&&Number.isFinite(at)&&at<=Date.now()&&Date.now()-at<12*3600000)readings.wellbeing={value:report.score,unit:'/100',source:'manual',observedAt:new Date(at).toISOString()};
    const watch=window.missionActiwatch?.current(),imported=watch?.source==='actiwatch'&&/^[a-f0-9-]{36}$/i.test(watch.id||'');
    if(imported){readings.sleep_hours=null;readings.activity=null;readings.light=null;}
    else if(watch?.source==='demo'&&watch.simulation===true&&watch.summary?.latest24h){const value=watch.summary.latest24h;readings.sleep_hours=reading(value.sleepSeconds===null?null:value.sleepSeconds/3600,'h');readings.activity=reading(value.activityCounts,'counts');readings.light=reading(value.meanLightLux,'lx');}
    return {profileId:'personal',capturedAt:new Date().toISOString(),actiwatchImportId:imported?watch.id:null,readings};
  }
  function render(){
    const isHealth=state.workspace==='crew'&&state.view==='health'&&!state.visiting,isOverview=state.workspace==='crew'&&state.view==='overview';
    document.querySelector('.mission-heading').hidden=isHealth||isOverview||state.workspace==='crew'&&state.view==='diary';
    const homeButton=document.getElementById('mission-home-button');homeButton.setAttribute('aria-pressed',String(isOverview));
    document.querySelectorAll('[data-crew]').forEach(button=>button.setAttribute('aria-pressed',String(state.visiting&&Number(button.dataset.crew)===state.crew)));
    document.body.dataset.home=String(isHealth);document.body.dataset.overview=String(isOverview);document.body.dataset.visiting=String(Boolean(state.visiting));home.hidden=!isHealth;
    const chat=document.getElementById('nasagpt-sidebar');
    if(!isOverview&&!chat.hidden)window.missionChatComposer.stopWithin(chat);
    chat.hidden=!isOverview;
    if(chat.parentElement!==home.parentElement)home.before(chat);
    friendProfile.classList.toggle('friend-profile',true);
    const report=window.missionCheckin.current(),vital=home.querySelector('[data-home-metric=wellbeing]');vital.querySelector('strong').innerHTML=window.missionGauge.markup({value:report?report.score:80,label:'Wellbeing'});vital.querySelector(':scope > small').textContent=report?'Your self-report':'Wellbeing scale';vital.dataset.source=report?'self_report':'demo';
    if(state.workspace==='crew'&&state.view==='health'&&state.visiting){document.getElementById('mission-heading-title').textContent='Visiting / '+crew[state.crew].name;document.getElementById('mission-heading-description').textContent='Friend profile readings';}
  }
  window.missionHome={render,setSource,snapshot};window.addEventListener('mission-profile-change',render);window.addEventListener('mission-wellbeing-change',render);render();
})();
