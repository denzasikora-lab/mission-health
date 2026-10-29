(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  let identity,name='Моя страница';
  const own=make('section','mission-self-profile');
  own.innerHTML='<button type="button" class="self-avatar" aria-label="Моя страница"><span>Я</span></button><h2></h2><small>Моя страница</small>';
  const friendProfile=document.querySelector('.mission-rail>.profile');friendProfile.before(own);
  own.querySelector('button').addEventListener('click',()=>window.missionDesign.navigate('overview'));
  const home=make('section','mission-home');home.id='mission-home';
  home.innerHTML='<section class="home-welcome panel glass"><span class="home-eyebrow">МОЯ ОРБИТА</span><h2></h2><p>Твое самочувствие, дневник и важные моменты.</p><div class="home-actions"><button type="button" data-home-video>Видеодневник</button><button type="button" data-home-audio>Аудиодневник</button><button type="button" data-home-book>Открыть книгу</button></div></section><section class="home-body-panel panel glass"><header><h2>Мои показатели</h2><small>Датчики не подключены</small></header><div class="home-vitals" aria-label="Мои показатели"><div class="home-human"><img src="assets/health-body.svg" alt="Схема тела человека"><span>Личный фон</span></div></div></section><section class="home-checkin"></section><section class="home-friends panel glass"><header><h2>Друзья</h2><small>Профили NASA / демо показателей</small></header><div></div></section>';
  document.querySelector('.mission-heading').after(home);
  const friendBody=make('section','friend-body-panel panel glass'),friendMetrics=document.getElementById('metrics');
  const friendHuman=make('div','home-human');friendHuman.innerHTML='<img src="assets/health-body.svg" alt="Схема тела человека">';
  friendMetrics.before(friendBody);friendBody.append(friendMetrics,friendHuman);

  home.querySelector('.home-checkin').append(window.missionCheckin.widget());
  for(const [key,label,unit]of [['hr','Пульс','уд/мин'],['spo2','SpO₂','%'],['temp','Температура запястья','°C'],['wellbeing','Самочувствие','/ 10'],['sleep','Сон','ч'],['hrv','HRV','мс']]){
    const card=make('article','home-vital panel glass');card.dataset.homeMetric=key;
    card.append(make('span','',label),make('strong','','-'),make('small','',key==='wellbeing'?'Выбери оценку ниже':'Нет измерений'));home.querySelector('.home-vitals').append(card);
  }
  const adaptation=make('section','home-adaptation panel glass');adaptation.innerHTML='<div><span class="home-eyebrow">NasaGPT / LoRA</span><h2>Адаптировать модель</h2><p>Подстроить локальную модель по накопленным записям дневника.</p></div><button type="button">Подготовить fine-tuning ↗</button>';home.append(adaptation);adaptation.querySelector('button').addEventListener('click',()=>window.missionTraining.openPersonal());
  for(const [index,person]of crew.entries()){
    const button=make('button','home-friend');button.type='button';button.dataset.visitFriend=index;
    const image=make('img');image.src=person.photo;image.alt='';button.append(image,make('strong','',person.name),make('small','','В гости ↗'));
    button.addEventListener('click',()=>{document.querySelector('[data-crew="'+index+'"]').click();document.querySelector('.mission-profiles').open=false;document.getElementById('crew-workspace').scrollIntoView({behavior:'smooth',block:'start'});});home.querySelector('.home-friends>div').append(button);
  }
  home.querySelector('[data-home-video]').addEventListener('click',()=>window.missionDiary.open('video'));
  home.querySelector('[data-home-audio]').addEventListener('click',()=>window.missionDiary.open('audio'));
  home.querySelector('[data-home-book]').addEventListener('click',()=>window.missionDesign.navigate('diary'));
  async function author(){
    try{identity||=await journalApi('/api/me');try{name=localStorage.getItem('mission-health-log-'+identity.researcherId+'-name')||identity.name||'Моя страница';}catch{name=identity.name||'Моя страница';}render();}catch{}
  }
  function render(){
    const isHome=state.workspace==='crew'&&state.view==='health'&&!state.visiting;
    document.querySelectorAll('[data-crew]').forEach(button=>button.setAttribute('aria-pressed',String(state.visiting&&Number(button.dataset.crew)===state.crew)));
    document.body.dataset.home=String(isHome);document.body.dataset.visiting=String(Boolean(state.visiting));home.hidden=!isHome;
    own.hidden=Boolean(state.visiting);friendProfile.classList.toggle('friend-profile',true);
    own.querySelector('h2').textContent=name;own.querySelector('.self-avatar span').textContent=name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();home.querySelector('.home-welcome h2').textContent=name;
    const report=window.missionCheckin.current(),vital=home.querySelector('[data-home-metric=wellbeing]');vital.querySelector('strong').textContent=report?report.score+' / 10':'-';vital.querySelector('small').textContent=report?'Твоя самооценка':'Выбери оценку ниже';
    if(isHome){document.getElementById('mission-heading-title').textContent='Моя страница';document.getElementById('mission-heading-description').textContent='Личный дневник и самочувствие';document.querySelector('.mission-data-label').textContent='Личное';}
    else if(state.workspace==='crew'&&state.view==='health'&&state.visiting){document.getElementById('mission-heading-title').textContent='В гостях / '+crew[state.crew].name;document.getElementById('mission-heading-description').textContent='Показатели профиля друга';}
  }
  window.missionHome={render};window.addEventListener('mission-profile-change',()=>void author());window.addEventListener('mission-wellbeing-change',render);void author();render();
})();
