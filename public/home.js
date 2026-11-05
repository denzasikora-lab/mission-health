(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const friendProfile=document.querySelector('.mission-rail>.profile');
  const home=make('section','mission-home');home.id='mission-home';
  home.innerHTML='<section class="home-body-panel panel glass"><header><h2>Мои показатели</h2></header><div class="home-vitals" aria-label="Мои показатели"><div class="home-human"><img src="assets/health-body.svg?v=20261030-illustrated1" alt="Схема тела человека"></div></div></section><section class="home-checkin"></section>';
  document.querySelector('.mission-heading').after(home);
  const friendBody=make('section','friend-body-panel panel glass'),friendMetrics=document.getElementById('metrics');
  const friendHuman=make('div','home-human');friendHuman.innerHTML='<img src="assets/health-body.svg?v=20261030-illustrated1" alt="Схема тела человека">';
  friendMetrics.before(friendBody);friendBody.append(friendMetrics,friendHuman);

  home.querySelector('.home-checkin').append(window.missionCheckin.widget());
  for(const [key,label,unit]of [['hr','Пульс','уд/мин'],['spo2','SpO₂','%'],['temp','Температура кожи','°C'],['wellbeing','Самочувствие','/ 100'],['sleep','Сон','ч'],['hrv','HRV','мс'],['respiration','Дыхание','/мин'],['pressure','Давление','мм рт. ст.'],['recovery','Восстановление','/100'],['steps','Шаги','шагов'],['activity','Движение','counts'],['light','Освещенность','лк']]){
    const card=make('article','home-vital panel glass');card.dataset.homeMetric=key;
    card.append(make('span','',label),make('strong','','-'),make('small','',key==='wellbeing'?'Выбери оценку ниже':'Нет измерений'));home.querySelector('.home-vitals').append(card);
  }
  // Названия каналов соответствуют описаниям приборов CSA, NASA и производителя Astroskin.
  const csa='https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp',nasa='https://www.nasa.gov/wp-content/uploads/2023/11/roi-iss-facilities-june2023.pdf',astroskin='https://hexoskin.com/pages/astroskin';
  const instruments={
    hr:['Bio-Monitor / ЭКГ',csa],spo2:['Bio-Monitor / пульсоксиметр',csa],temp:['Bio-Monitor / датчик кожи',csa],
    sleep:['Actiwatch Plus / Actiware',nasa],hrv:['Astroskin / RR-интервалы',astroskin],respiration:['Bio-Monitor / дыхательный датчик',csa],
    pressure:['Portapres / манжета','https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000561?dataType=HARDWARE'],
    recovery:['Расчетный индекс'],steps:['Astroskin / акселерометр',astroskin],activity:['Actiwatch Plus',nasa],light:['Actiwatch Plus / датчик света',nasa]
  };
  function setSource(key,label,url){
    const note=home.querySelector('[data-home-metric='+key+'] > small');
    if(!note)return;
    note.replaceChildren();
    if(url){const link=make('a','home-instrument',label);link.href=url;link.target='_blank';link.rel='noopener';link.title='Описание прибора: '+label;note.append(link);}
    else note.textContent=label;
  }
  const demoValues={hr:['72','уд/мин'],spo2:['98','%'],temp:['36,7','°C'],sleep:['7','ч 40 мин'],hrv:['46','мс'],respiration:['14','/мин'],pressure:['118/76','мм рт. ст.'],recovery:['86','/100'],steps:['6240','шагов'],activity:['66 218','counts'],light:['187,3','лк']};
  for(const [key,[value,unit]]of Object.entries(demoValues)){const card=home.querySelector('[data-home-metric='+key+']'),number=card.querySelector('strong');if(['spo2','recovery'].includes(key))number.innerHTML=window.missionGauge.markup({value:Number(value),label:key==='spo2'?'SpO₂':'Восстановление',unit:key==='spo2'?'%':undefined});else{number.textContent=value;number.append(make('span','home-vital-unit',unit));}setSource(key,...instruments[key]);card.dataset.source='demo';}
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
    const report=window.missionCheckin.current(),vital=home.querySelector('[data-home-metric=wellbeing]');vital.querySelector('strong').innerHTML=window.missionGauge.markup({value:report?report.score:80,label:'Самочувствие'});vital.querySelector(':scope > small').textContent=report?'Твоя самооценка':'Шкала самочувствия';vital.dataset.source=report?'self_report':'demo';
    if(state.workspace==='crew'&&state.view==='health'&&state.visiting){document.getElementById('mission-heading-title').textContent='В гостях / '+crew[state.crew].name;document.getElementById('mission-heading-description').textContent='Показатели профиля друга';}
  }
  window.missionHome={render,setSource};window.addEventListener('mission-profile-change',render);window.addEventListener('mission-wellbeing-change',render);render();
})();
