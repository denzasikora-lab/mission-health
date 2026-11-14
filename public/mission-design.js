(() => {
  const shell = document.querySelector('.shell');
  const frame = document.createElement('div'); frame.className = 'mission-frame';
  const content = document.createElement('div'); content.className = 'mission-content';
  const rail = document.querySelector('.crew-panel'); rail.classList.add('mission-rail'); rail.removeAttribute('data-i18n-aria'); rail.setAttribute('aria-label','Navigation and profiles');
  const profile = document.querySelector('.profile'); rail.prepend(profile);
  const navigation = document.createElement('nav'); navigation.className = 'mission-nav'; navigation.lang = 'en'; navigation.setAttribute('aria-label', 'Mission Health sections');
  const icons = {overview:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',observations:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z M3 12h4l2-3 4 6 2-3h6',diary:'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v16h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Z M12 6v16',sources:'M3 5c0-5 18-5 18 0v14c0 5-18 5-18 0Zm0 0c0 5 18 5 18 0M3 12c0 5 18 5 18 0'};
  icons.archive=icons.diary;icons.diary='M3 5h13v14H3Z M16 10l6-4v12l-6-4 M8 9v6m-3-3h6';
  icons.chat='M4 3h16v13H8l-4 5Z M8 8h8M8 12h5';icons.favorites='m12 3 2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.34l-5.62 2.96 1.07-6.27L2.9 9.6l6.3-.9Z';
  navigation.innerHTML = [['overview','Home'],['observations','Health'],['diary','Diary'],['archive','Archive'],['sources','Research']].map(([key,label])=>`<button type="button" data-mission-nav="${key}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[key]}"/></svg><span>${label}</span></button>`).join('');
  profile.after(navigation);
  const switcher = document.createElement('details'); switcher.className = 'mission-profiles';
  switcher.hidden=true;switcher.setAttribute('aria-hidden','true');
  switcher.append(document.querySelector('.panel-heading'), document.getElementById('crew-list'));
  navigation.after(switcher);
  document.querySelector('.aside-note').textContent = 'Public NASA profiles / no shared health measurements.';
  const anatomy = document.createElement('section'); anatomy.className='mission-anatomy'; anatomy.setAttribute('aria-label','Profile readings diagram'); anatomy.innerHTML='<img src="assets/health-body.svg?v=20261030-illustrated1" alt="Human body illustration, without medical diagnosis"><div>'+[['hr','Pulse'],['spo2','SpO₂'],['temp','Temp.'],['fatigue','Tone']].map(([key,label])=>`<button type="button" data-body-metric="${key}"><span>${label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${metricIcons[key]}"/></svg></button>`).join('')+'</div>'; rail.append(anatomy);
  const oldResearch = document.getElementById('research-workspace'), oldCrew = document.getElementById('crew-workspace');
  const heading = document.createElement('header'); heading.className = 'mission-heading'; heading.lang = 'en';
  heading.innerHTML = '<div><p class="mission-kicker">PERSONAL BASELINE / OBSERVATIONS / DIARY</p><h1 id="mission-heading-title">Condition and observations</h1><p id="mission-heading-description">Today’s key readings</p></div>';
  content.append(heading, oldResearch, oldCrew); frame.append(rail, content); document.querySelector('.workspace-switch').after(frame);
  const journal = document.getElementById('journal-view');
  const right = document.querySelector('.insight-column');
  const context = document.createElement('details'); context.className = 'mission-context';
  context.innerHTML = '<summary>Profile context and sources NASA</summary><div class="mission-context-grid"></div>';
  context.querySelector('div').append(...right.children);
  document.querySelector('.main-column').append(context);
  right.append(journal);
  const assistantTitle = document.createElement('h2'); assistantTitle.className = 'mission-assistant-title'; assistantTitle.textContent = 'NasaGPT';
  document.querySelector('.journal-header>div').prepend(assistantTitle);
  const assistantScope = document.createElement('p'); assistantScope.className = 'mission-chat-scope'; assistantScope.textContent = 'Prototype diary for the selected profile.';
  document.getElementById('journal-name').after(assistantScope);
  const attachments = document.createElement('details'); attachments.className = 'mission-attachments'; attachments.innerHTML = '<summary>Photos and video for comparison</summary>';
  const tools = document.querySelector('.photo-tools'); tools.before(attachments); attachments.append(tools);
  const audio = document.createElement('section'); audio.className = 'mission-audio panel glass'; audio.lang = 'en';
  audio.innerHTML = '<h2>Media diary</h2><p>Thoughts, feelings and observations from the day</p><div class="mission-audio-body"><svg viewBox="0 0 290 60" aria-hidden="true">'+Array.from({length:65},(_,i)=>{const h=5+Math.abs(Math.sin(i*1.9)*Math.sin(i*.19))*42;return `<path d="M${i*4.4+3} ${30-h/2}v${h}"/>`}).join('')+'</svg><div><button type="button" data-open-voice>Audio</button><button type="button" data-open-video-log>Video</button></div></div>';
  document.querySelector('.bottom-grid').before(audio);
  document.querySelector('.bottom-grid').classList.add('mission-observations');
  const brandMark=document.querySelector('.brand-mark');brandMark.removeAttribute('aria-hidden');
  brandMark.innerHTML='<img class="nasa-brand-logo" src="assets/nasa-brand/nasa-insignia.png" alt="NASA" width="121" height="102">';
  document.querySelector('.brand>span:last-child').textContent = 'MISSION HEALTH';
  const subtitle = document.createElement('span'); subtitle.className = 'mission-brand-caption'; subtitle.innerHTML = '<span class="mission-team-name">Bug Busters / NASA Space Apps</span><span aria-hidden="true">·</span><span class="mission-system-name">Astronaut Health Monitoring System</span>'; document.querySelector('.brand').append(subtitle);
  const themeGroup = document.querySelector('.theme-control'); themeGroup.hidden=true;
  const themeToggle=document.createElement('button'); themeToggle.type='button';themeToggle.id='mission-theme-toggle';themeToggle.className='mission-tool';
  const sun=themeGroup.querySelector('[data-theme-choice="light"]').innerHTML,moon=themeGroup.querySelector('[data-theme-choice="dark"]').innerHTML;
  const toolbar=document.querySelector('.toolbar');toolbar.append(themeToggle);
  const oldLaunch=toolbar.querySelector('.log-launch'),homeLaunch=oldLaunch.cloneNode(false);
  homeLaunch.removeAttribute('data-open-media-diary');homeLaunch.id='mission-home-button';homeLaunch.setAttribute('aria-label','Home');homeLaunch.title='Home';
  homeLaunch.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+icons.overview+'"/></svg>';oldLaunch.replaceWith(homeLaunch);
  homeLaunch.addEventListener('click',()=>navigate('overview'));
  document.querySelector('.brand').addEventListener('click',event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate('overview');window.scrollTo({top:0,behavior:'auto'});});

  const date=document.createElement('time');date.className='mission-date';date.textContent=new Intl.DateTimeFormat('en',{day:'numeric',month:'long',year:'numeric'}).format(new Date());date.dateTime=new Date().toISOString().slice(0,10);toolbar.prepend(date);
  const iconButton = document.createElement('button'); iconButton.type = 'button'; iconButton.className = 'mission-source-launch'; iconButton.setAttribute('aria-label','Open research NASA'); iconButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg>';
  toolbar.insertBefore(iconButton,toolbar.querySelector('.log-launch'));
  const atom='<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1"><ellipse cx="16" cy="16" rx="15" ry="6"/><ellipse cx="16" cy="16" rx="15" ry="6" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="15" ry="6" transform="rotate(120 16 16)"/></g><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>';
  assistantTitle.insertAdjacentHTML('afterbegin',atom);
  const chatTools=document.createElement('div');chatTools.className='mission-chat-tools';chatTools.innerHTML='<button type="button" data-chat-camera aria-label="Add a photo to chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/></svg></button><button type="button" data-chat-voice aria-label="Open microphone"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/></svg></button>';document.querySelector('.composer-footer').append(chatTools);
  chatTools.querySelector('[data-chat-camera]').addEventListener('click',()=>document.getElementById('open-camera').click());chatTools.querySelector('[data-chat-voice]').addEventListener('click',()=>window.missionDiary.open('audio'));
  anatomy.addEventListener('click',event=>{const button=event.target.closest('[data-body-metric]');if(button){state.metric=button.dataset.bodyMetric;window.render();}});
  const palette = matchMedia('(prefers-color-scheme: dark)');
  let themeMode; try { themeMode = localStorage.getItem('mission-health-theme-mode') || localStorage.getItem('mission-health-theme') || 'system'; } catch { themeMode='system'; }
  function render() {
    document.body.dataset.missionWorkspace = state.workspace;
    if(state.workspace==='crew')document.querySelector('.main-column').prepend(heading);else content.insertBefore(heading,oldResearch);
    themeToggle.innerHTML=state.theme==='dark'?sun:moon;themeToggle.setAttribute('aria-label',state.theme==='dark'?'Switch to light theme':'Switch to dark theme');themeToggle.title=themeToggle.getAttribute('aria-label');
    anatomy.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.bodyMetric===state.metric)));
    const stats=document.querySelector('.mission-chart-stats');if(stats){const values=seriesFor(crew[state.crew],state.metric,state.period);stats.innerHTML=[['Mean',values.reduce((sum,value)=>sum+value,0)/values.length],['Min.',Math.min(...values)],['Max.',Math.max(...values)]].map(([label,value])=>`<div><span>${label}</span><strong>${format(value,state.metric)}<small> ${unit(state.metric)}</small></strong></div>`).join('');}
    const trendTitle=document.getElementById('trend-heading');trendTitle.removeAttribute('data-i18n');trendTitle.textContent='Comparison with personal baseline';
    heading.querySelector('h1').textContent = state.workspace === 'research' ? ['library','blood','ecg'].includes(researchState.dataset) ? 'Research' : 'Measured observations' : 'Condition and observations';
    document.getElementById('mission-heading-description').textContent = state.workspace === 'research' ? 'NASA OSD-575 / OSD-569 / BIDMC / MIT-BIH' : 'Key readings for the selected profile';
    window.missionBook?.render();
    window.missionConversations?.render(state.view);
    const active = state.workspace === 'research' ? 'sources' : state.view === 'journal' ? 'archive' : state.view === 'health' ? 'observations' : ['chat','favorites','diary'].includes(state.view)?state.view:'overview';
    if(active==='chat'||active==='favorites'){heading.querySelector('h1').textContent=active==='chat'?'NasaGPT':'Favorites';document.getElementById('mission-heading-description').textContent=active==='chat'?'Conversation with NasaGPT':'Important entries and answers in one place';}
    navigation.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.missionNav===active&&!(active==='overview'&&state.visiting))));
    window.missionHome?.render();window.missionDiary.render();window.missionActivity?.render();
    themeGroup.querySelectorAll('[data-theme-choice]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.themeChoice===themeMode));if(button.dataset.themeChoice==='system'){button.setAttribute('aria-label','System theme');button.title='System theme';}});
  }
  function navigate(section) {
    void window.missionActivity?.record('navigation',{target:section});
    state.visiting=false;
    researchStop(); state.workspace = section === 'sources' ? 'research' : 'crew';
    if (section === 'sources') researchState.dataset = 'library';
    state.view = section === 'archive' ? 'journal' : section === 'observations' ? 'health' : ['chat','favorites','diary'].includes(section)?section:'overview';
    window.research.render(); renderJournal(); render();
    if(section==='diary')window.scrollTo({top:0,behavior:'auto'});
    if (section === 'archive') { void loadJournal();window.missionBook?.refresh(); document.getElementById('mission-book')?.scrollIntoView({behavior:'smooth',block:'start'}); }
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
  state.workspace = 'crew'; state.view = 'overview'; state.theme = themeMode==='system'?(palette.matches?'dark':'light'):themeMode;
  window.render(); void loadJournal();
})();
