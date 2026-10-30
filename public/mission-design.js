(() => {
  const shell = document.querySelector('.shell');
  const frame = document.createElement('div'); frame.className = 'mission-frame';
  const content = document.createElement('div'); content.className = 'mission-content';
  const rail = document.querySelector('.crew-panel'); rail.classList.add('mission-rail'); rail.removeAttribute('data-i18n-aria'); rail.setAttribute('aria-label','Навигация и профили');
  const profile = document.querySelector('.profile'); rail.prepend(profile);
  const navigation = document.createElement('nav'); navigation.className = 'mission-nav'; navigation.lang = 'ru'; navigation.setAttribute('aria-label', 'Разделы Mission Health');
  const icons = {overview:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',observations:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z M3 12h4l2-3 4 6 2-3h6',diary:'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v16h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Z M12 6v16',sources:'M3 5c0-5 18-5 18 0v14c0 5-18 5-18 0Zm0 0c0 5 18 5 18 0M3 12c0 5 18 5 18 0'};
  icons.chat='M4 3h16v13H8l-4 5Z M8 8h8M8 12h5';icons.favorites='m12 3 2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.34l-5.62 2.96 1.07-6.27L2.9 9.6l6.3-.9Z';
  navigation.innerHTML = [['overview','Домой'],['observations','Здоровье'],['diary','Дневник'],['sources','Исследования']].map(([key,label])=>`<button type="button" data-mission-nav="${key}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[key]}"/></svg><span>${label}</span></button>`).join('');
  profile.after(navigation);
  const switcher = document.createElement('details'); switcher.className = 'mission-profiles';
  switcher.hidden=true;switcher.setAttribute('aria-hidden','true');
  switcher.append(document.querySelector('.panel-heading'), document.getElementById('crew-list'));
  navigation.after(switcher);
  document.querySelector('.aside-note').textContent = 'Профили NASA. Показатели здоровья и дневники - демонстрация.';
  const anatomy = document.createElement('section'); anatomy.className='mission-anatomy'; anatomy.setAttribute('aria-label','Схема показателей профиля'); anatomy.innerHTML='<img src="assets/health-body.svg" alt="Иллюстрация тела человека, без медицинской диагностики"><div>'+[['hr','Пульс'],['spo2','SpO₂'],['temp','Темп.'],['fatigue','Тонус']].map(([key,label])=>`<button type="button" data-body-metric="${key}"><span>${label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${metricIcons[key]}"/></svg></button>`).join('')+'</div>'; rail.append(anatomy);
  const oldResearch = document.getElementById('research-workspace'), oldCrew = document.getElementById('crew-workspace');
  const heading = document.createElement('header'); heading.className = 'mission-heading'; heading.lang = 'ru';
  heading.innerHTML = '<div><p class="mission-kicker">ЛИЧНЫЙ ФОН / НАБЛЮДЕНИЯ / ДНЕВНИК</p><h1 id="mission-heading-title">Состояние и наблюдения</h1><p id="mission-heading-description">Ключевые показатели на сегодня</p></div><span class="mission-data-label">Демо-данные</span>';
  content.append(heading, oldResearch, oldCrew); frame.append(rail, content); document.querySelector('.workspace-switch').after(frame);
  const journal = document.getElementById('journal-view');
  const right = document.querySelector('.insight-column');
  const context = document.createElement('details'); context.className = 'mission-context';
  context.innerHTML = '<summary>Контекст профиля и источники NASA</summary><div class="mission-context-grid"></div>';
  context.querySelector('div').append(...right.children);
  document.querySelector('.main-column').append(context);
  right.append(journal);
  const assistantTitle = document.createElement('h2'); assistantTitle.className = 'mission-assistant-title'; assistantTitle.textContent = 'NasaGPT';
  document.querySelector('.journal-header>div').prepend(assistantTitle);
  const assistantScope = document.createElement('p'); assistantScope.className = 'mission-chat-scope'; assistantScope.textContent = 'Дневник прототипа для выбранного профиля.';
  document.getElementById('journal-name').after(assistantScope);
  const attachments = document.createElement('details'); attachments.className = 'mission-attachments'; attachments.innerHTML = '<summary>Фото и видео для сравнения</summary>';
  const tools = document.querySelector('.photo-tools'); tools.before(attachments); attachments.append(tools);
  const audio = document.createElement('section'); audio.className = 'mission-audio panel glass'; audio.lang = 'ru';
  audio.innerHTML = '<h2>Медиадневник</h2><p>Мысли, ощущения и наблюдения за день</p><div class="mission-audio-body"><svg viewBox="0 0 290 60" aria-hidden="true">'+Array.from({length:65},(_,i)=>{const h=5+Math.abs(Math.sin(i*1.9)*Math.sin(i*.19))*42;return `<path d="M${i*4.4+3} ${30-h/2}v${h}"/>`}).join('')+'</svg><div><button type="button" data-open-voice>Аудио</button><button type="button" data-open-video-log>Видео</button></div></div>';
  document.querySelector('.bottom-grid').before(audio);
  document.querySelector('.bottom-grid').classList.add('mission-observations');
  const brandMark=document.querySelector('.brand-mark');brandMark.removeAttribute('aria-hidden');
  brandMark.innerHTML='<img class="nasa-header-light" src="assets/nasa-brand/nasa-header-light.png" alt="NASA" width="208" height="146"><img class="nasa-header-dark" src="assets/nasa-brand/nasa-header-dark.png" alt="NASA" width="238" height="154">';
  document.querySelector('.brand>span:last-child').textContent = 'MISSION HEALTH';
  const subtitle = document.createElement('span'); subtitle.className = 'mission-brand-caption'; subtitle.textContent = 'Независимое исследование'; document.querySelector('.brand').append(subtitle);
  const themeGroup = document.querySelector('.theme-control'); themeGroup.hidden=true;
  const themeToggle=document.createElement('button'); themeToggle.type='button';themeToggle.id='mission-theme-toggle';themeToggle.className='mission-tool';
  const sun=themeGroup.querySelector('[data-theme-choice="light"]').innerHTML,moon=themeGroup.querySelector('[data-theme-choice="dark"]').innerHTML;
  const toolbar=document.querySelector('.toolbar');toolbar.append(themeToggle);
  const date=document.createElement('time');date.className='mission-date';date.textContent=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric'}).format(new Date());date.dateTime=new Date().toISOString().slice(0,10);toolbar.prepend(date);
  const iconButton = document.createElement('button'); iconButton.type = 'button'; iconButton.className = 'mission-source-launch'; iconButton.setAttribute('aria-label','Открыть исследования NASA'); iconButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg>';
  toolbar.insertBefore(iconButton,toolbar.querySelector('.log-launch'));
  const atom='<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1"><ellipse cx="16" cy="16" rx="15" ry="6"/><ellipse cx="16" cy="16" rx="15" ry="6" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="15" ry="6" transform="rotate(120 16 16)"/></g><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>';
  assistantTitle.insertAdjacentHTML('afterbegin',atom);
  const chatTools=document.createElement('div');chatTools.className='mission-chat-tools';chatTools.innerHTML='<button type="button" data-chat-camera aria-label="Добавить фото в чат"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/></svg></button><button type="button" data-chat-voice aria-label="Открыть микрофон"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/></svg></button>';document.querySelector('.composer-footer').append(chatTools);
  chatTools.querySelector('[data-chat-camera]').addEventListener('click',()=>document.getElementById('open-camera').click());chatTools.querySelector('[data-chat-voice]').addEventListener('click',()=>window.missionDiary.open('audio'));
  anatomy.addEventListener('click',event=>{const button=event.target.closest('[data-body-metric]');if(button){state.metric=button.dataset.bodyMetric;window.render();}});
  const palette = matchMedia('(prefers-color-scheme: dark)');
  let themeMode; try { themeMode = localStorage.getItem('mission-health-theme-mode') || localStorage.getItem('mission-health-theme') || 'system'; } catch { themeMode='system'; }
  function render() {
    document.body.dataset.missionWorkspace = state.workspace;
    if(state.workspace==='crew')document.querySelector('.main-column').prepend(heading);else content.insertBefore(heading,oldResearch);
    themeToggle.innerHTML=state.theme==='dark'?sun:moon;themeToggle.setAttribute('aria-label',state.theme==='dark'?'Включить светлую тему':'Включить темную тему');themeToggle.title=themeToggle.getAttribute('aria-label');
    anatomy.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.bodyMetric===state.metric)));
    const stats=document.querySelector('.mission-chart-stats');if(stats){const values=seriesFor(crew[state.crew],state.metric,state.period);stats.innerHTML=[['Среднее',values.reduce((sum,value)=>sum+value,0)/values.length],['Мин.',Math.min(...values)],['Макс.',Math.max(...values)]].map(([label,value])=>`<div><span>${label}</span><strong>${format(value,state.metric)}<small> ${unit(state.metric)}</small></strong></div>`).join('');}
    const trendTitle=document.getElementById('trend-heading');trendTitle.removeAttribute('data-i18n');trendTitle.textContent='Сравнение с личным фоном';
    heading.querySelector('h1').textContent = state.workspace === 'research' ? researchState.dataset === 'library' ? 'Исследования' : 'Реальные наблюдения' : 'Состояние и наблюдения';
    document.getElementById('mission-heading-description').textContent = state.workspace === 'research' ? 'NASA OSD-575 / BIDMC / открытые исследования' : 'Ключевые показатели выбранного профиля';
    document.querySelector('.mission-data-label').textContent = state.workspace === 'research' ? 'Исходные данные' : 'Демо-данные';
    window.missionBook?.render();
    window.missionConversations?.render(state.view);
    const active = state.workspace === 'research' ? researchState.dataset === 'library' ? 'sources' : 'observations' : state.view === 'journal' ? 'diary' : ['chat','favorites'].includes(state.view)?state.view:'overview';
    if(active==='chat'||active==='favorites'){heading.querySelector('h1').textContent=active==='chat'?'NasaGPT':'Избранное';document.getElementById('mission-heading-description').textContent=active==='chat'?'Разговор с NasaGPT':'Важные записи и ответы в одном месте';document.querySelector('.mission-data-label').textContent='Личное';}
    navigation.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.missionNav===active&&!(active==='overview'&&state.visiting))));
    window.missionHome?.render();window.missionActivity?.render();
    themeGroup.querySelectorAll('[data-theme-choice]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.themeChoice===themeMode));if(button.dataset.themeChoice==='system'){button.setAttribute('aria-label','Системная тема');button.title='Системная тема';}});
  }
  function navigate(section) {
    void window.missionActivity?.record('navigation',{target:section});
    state.visiting=false;
    researchStop(); state.workspace = section === 'observations' || section === 'sources' ? 'research' : 'crew';
    if (section === 'sources') researchState.dataset = 'library';
    else if (section === 'observations' && researchState.dataset === 'library') researchState.dataset = 'nasa';
    state.view = section === 'diary' ? 'journal' : ['chat','favorites'].includes(section)?section:'health';
    window.research.render(); renderJournal(); render();
    if (section === 'diary') { void loadJournal();window.missionBook?.refresh(); document.getElementById('mission-book')?.scrollIntoView({behavior:'smooth',block:'start'}); }
  }
  navigation.addEventListener('click',event=>{const button=event.target.closest('[data-mission-nav]');if(button)navigate(button.dataset.missionNav)});
  iconButton.addEventListener('click',()=>navigate('sources'));
  themeToggle.addEventListener('click',()=>{themeMode=state.theme==='dark'?'light':'dark';state.theme=themeMode;savePreference('mission-health-theme-mode',themeMode);savePreference('mission-health-theme',themeMode);window.render();});
  palette.addEventListener('change',()=>{if(themeMode==='system'){state.theme=palette.matches?'dark':'light';window.render();}});
  audio.querySelector('[data-open-voice]').addEventListener('click',()=>window.missionDiary.open('audio'));
  audio.querySelector('[data-open-video-log]').addEventListener('click',()=>window.missionDiary.open('video'));
  const chartBody=document.createElement('div');chartBody.className='mission-chart-body';const plot=document.createElement('div');plot.className='mission-chart-plot';const chart=document.querySelector('.chart-wrap');chart.before(chartBody);chartBody.append(plot);plot.append(chart,document.getElementById('chart-axis'));const stats=document.createElement('div');stats.className='mission-chart-stats';chartBody.append(stats);
  document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',render));
  window.missionDesign = {render,navigate,content,rail};
  state.workspace = 'crew'; state.view = 'health'; state.theme = themeMode==='system'?(palette.matches?'dark':'light'):themeMode;
  window.render(); void loadJournal();
})();
