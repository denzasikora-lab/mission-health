(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const friendProfile=document.querySelector('.mission-rail>.profile');
  const home=make('section','mission-home');home.id='mission-home';
  home.innerHTML='<section class="home-body-panel panel glass"><header><h2>Мои показатели</h2><small>Демо / симуляция показателей</small></header><div class="home-vitals" aria-label="Мои показатели"><div class="home-human"><img src="assets/health-body.svg" alt="Схема тела человека"><span>Демонстрация</span></div></div></section><section class="home-checkin"></section>';
  document.querySelector('.mission-heading').after(home);
  const friendBody=make('section','friend-body-panel panel glass'),friendMetrics=document.getElementById('metrics');
  const friendHuman=make('div','home-human');friendHuman.innerHTML='<img src="assets/health-body.svg" alt="Схема тела человека">';
  friendMetrics.before(friendBody);friendBody.append(friendMetrics,friendHuman);

  home.querySelector('.home-checkin').append(window.missionCheckin.widget());
  for(const [key,label,unit]of [['hr','Пульс','уд/мин'],['spo2','SpO₂','%'],['temp','Температура запястья','°C'],['wellbeing','Самочувствие','/ 100'],['sleep','Сон','ч'],['hrv','HRV','мс'],['respiration','Дыхание','/мин'],['pressure','Давление','мм рт. ст.'],['recovery','Восстановление','/100'],['steps','Шаги','шагов'],['activity','Движение','counts'],['light','Освещенность','лк']]){
    const card=make('article','home-vital panel glass');card.dataset.homeMetric=key;
    card.append(make('span','',label),make('strong','','-'),make('small','',key==='wellbeing'?'Выбери оценку ниже':'Нет измерений'));home.querySelector('.home-vitals').append(card);
  }
  const demoValues={hr:['72','уд/мин'],spo2:['98','%'],temp:['36,7','°C'],sleep:['7','ч 40 мин'],hrv:['46','мс'],respiration:['14','/мин'],pressure:['118/76','мм рт. ст.'],recovery:['86','/100'],steps:['6240','шагов'],activity:['66 218','counts'],light:['187,3','лк']};
  for(const [key,[value,unit]]of Object.entries(demoValues)){const card=home.querySelector('[data-home-metric='+key+']'),number=card.querySelector('strong');number.textContent=value;number.append(make('span','home-vital-unit',unit));card.querySelector('small').textContent='Демо / пример показателя';card.dataset.source='demo';}
  function render(){
    const isHome=state.workspace==='crew'&&state.view==='health'&&!state.visiting;
    const homeButton=document.querySelector('[data-mission-nav="overview"]');homeButton.hidden=isHome;homeButton.querySelector('span').textContent=state.visiting?'Домой':'Моя страница';
    document.querySelectorAll('[data-crew]').forEach(button=>button.setAttribute('aria-pressed',String(state.visiting&&Number(button.dataset.crew)===state.crew)));
    document.body.dataset.home=String(isHome);document.body.dataset.visiting=String(Boolean(state.visiting));home.hidden=!isHome;
    friendProfile.classList.toggle('friend-profile',true);
    const report=window.missionCheckin.current(),vital=home.querySelector('[data-home-metric=wellbeing]');vital.querySelector('strong').textContent=(report?report.score:80)+' / 100';vital.querySelector('small').textContent=report?'Твоя самооценка':'Демо / пример самооценки';vital.dataset.source=report?'self_report':'demo';
    if(isHome){document.getElementById('mission-heading-title').textContent='Моя страница';document.getElementById('mission-heading-description').textContent='Личный дневник и самочувствие';document.querySelector('.mission-data-label').textContent='Личное';}
    else if(state.workspace==='crew'&&state.view==='health'&&state.visiting){document.getElementById('mission-heading-title').textContent='В гостях / '+crew[state.crew].name;document.getElementById('mission-heading-description').textContent='Показатели профиля друга';}
  }
  window.missionHome={render};window.addEventListener('mission-profile-change',render);window.addEventListener('mission-wellbeing-change',render);render();
})();
