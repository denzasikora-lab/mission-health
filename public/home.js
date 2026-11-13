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
  const demoValues={hr:['72','bpm'],spo2:['98','%'],temp:['36,7','°C'],sleep:['7','h 40 min'],hrv:['46','ms'],respiration:['14','/min'],pressure:['118/76','mmHg. units.'],recovery:['86','/100'],steps:['6240','steps'],activity:['66 218','counts'],light:['187,3','lx']};
  for(const [key,[value,unit]]of Object.entries(demoValues)){const card=home.querySelector('[data-home-metric='+key+']'),number=card.querySelector('strong');if(['spo2','recovery'].includes(key))number.innerHTML=window.missionGauge.markup({value:Number(value),label:key==='spo2'?'SpO₂':'Recovery',unit:key==='spo2'?'%':undefined});else{number.textContent=value;number.append(make('span','home-vital-unit',unit));}setSource(key,...instruments[key]);card.dataset.source='demo';}
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
  window.missionHome={render,setSource};window.addEventListener('mission-profile-change',render);window.addEventListener('mission-wellbeing-change',render);render();
})();
