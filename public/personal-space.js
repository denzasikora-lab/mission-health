(() => {
  const modal=document.getElementById('media-diary-dialog'),views=[],sliders=[],cache=new Map(),selections=new Map(),favoriteBusy=new Set();
  let identity,identityTask,modalKind='chat',mainKind='chat',profileSeen='',favoriteItems=[],favoriteLoaded=false,favoriteCursor=null,favoriteMore=false,favoriteLoading=false;
  const profile=()=>personalProfileId;
  const label=value=>value<=20?'Очень плохо':value<=40?'Ниже обычного':value<=60?'Нормально':value<=80?'Хорошо':'Отлично';
  const hue=value=>Math.round((value-1)/99*150);
  const stamp=value=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  const create=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const api=(path,options)=>journalApi(path,options);
  function selection(){return selections.get(profile())||null;}
  function currentReport(){const value=selection();return value?{score:value.score,wellbeingScale:100}:null;}
  function canonicalReport(report){if(!report)return null;return {score:report.wellbeingScale===100?report.score:report.score*10,wellbeingScale:100};}
  function storageKey(id=profile()){return 'mission-checkin:'+identity.storageScope+':'+id;}
  async function prepare(){
    identityTask||=api('/api/me').then(value=>{identity=value;try{if(selection())localStorage.setItem(storageKey(),JSON.stringify(selection()));}catch{}restoreScore();}).catch(()=>{});await identityTask;
  }
  function restoreScore(){
    if(!identity||selections.has(profile()))return;
    try{
      const saved=JSON.parse(localStorage.getItem(storageKey())||'null'),scale=saved?.wellbeingScale===undefined?10:saved.wellbeingScale;
      if([10,100].includes(scale)&&Number.isInteger(saved?.score)&&saved.score>=1&&saved.score<=scale&&Number.isFinite(saved.at)&&Date.now()-saved.at>=0&&Date.now()-saved.at<12*3600000){
        const value={score:scale===10?saved.score*10:saved.score,wellbeingScale:100,at:saved.at};selections.set(profile(),value);
        if(scale===10)localStorage.setItem(storageKey(),JSON.stringify(value));
      }
    }catch{}
    renderScores();window.dispatchEvent(new Event('mission-wellbeing-change'));
  }
  function choose(score){
    if(!Number.isInteger(score)||score<1||score>100)return;
    const value={score,wellbeingScale:100,at:Date.now()};selections.set(profile(),value);
    try{if(identity)localStorage.setItem(storageKey(),JSON.stringify(value));}catch{}
    renderScores();window.dispatchEvent(new Event('mission-wellbeing-change'));void window.missionActivity?.record('wellbeing',{score,wellbeingScale:100});
  }
  function renderScores(){
    const chosen=selection();
    for(const widget of sliders){
      const score=chosen?.score||50;widget.input.value=score;widget.root.style.setProperty('--mood-hue',hue(score));widget.root.style.setProperty('--mood-value',(score-1)/99);widget.root.dataset.chosen=String(Boolean(chosen));
      widget.value.innerHTML=window.missionGauge.markup({value:chosen?score:null,label:'Самочувствие',compact:true});widget.label.textContent=chosen?label(score):'Выбери свое самочувствие';widget.input.setAttribute('aria-valuetext',chosen?score+' из 100 / '+label(score):'Самочувствие еще не выбрано');
      widget.mouth.setAttribute('d','M7 14 Q12 '+(9+(score-1)/99*11).toFixed(2)+' 17 14');
      widget.time.textContent=chosen?'Твоя оценка / '+new Date(chosen.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Самооценка, не показание датчика';
      widget.reset.hidden=!chosen;
    }
  }
  function slider(){
    const root=create('section','wellbeing-checkin');
    root.innerHTML='<header><div><span class="personal-eyebrow">CHECK IN</span><h3>Как ты сейчас?</h3></div><div class="wellbeing-face" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="1"/><circle cx="16" cy="9" r="1"/><path d="M7 14Q12 14 17 14"/></svg></div></header><div class="wellbeing-readout"><strong></strong><span></span></div><label class="sr-only">Твое самочувствие от 1 до 100<input type="range" min="1" max="100" step="1" value="50"></label><div class="wellbeing-range-shell"></div><div class="wellbeing-endpoints"><span>Очень плохо</span><span>Отлично</span></div><small class="wellbeing-time"></small>';
    const input=root.querySelector('input');input.setAttribute('aria-label','Твое самочувствие от 1 до 100');root.querySelector('.wellbeing-range-shell').append(input);root.querySelector('label').remove();
    input.addEventListener('input',()=>choose(Number(input.value)));
    const reset=create('button','wellbeing-reset','Сбросить оценку');reset.type='button';reset.hidden=true;reset.addEventListener('click',()=>{selections.delete(profile());try{if(identity)localStorage.removeItem(storageKey());}catch{}renderScores();window.dispatchEvent(new Event('mission-wellbeing-change'));});root.append(reset);
    sliders.push({root,input,reset,value:root.querySelector('strong'),label:root.querySelector('.wellbeing-readout span'),mouth:root.querySelector('path'),time:root.querySelector('.wellbeing-time')});renderScores();return root;
  }
  function badge(report){const scale=report.wellbeingScale===100?100:10,score=canonicalReport(report).score;const node=create('span','wellbeing-badge');node.innerHTML=window.missionGauge.markup({value:report.score,max:scale,label:'Самочувствие',compact:true});node.append(create('span','',report.label||label(score)));node.style.setProperty('--mood-hue',hue(score));return node;}
  function store(kind){const key=kind==='diary'?'diary:'+profile():kind;if(!cache.has(key))cache.set(key,{kind,profile:profile(),messages:[],loaded:false,loading:false,cursor:null,more:false,draft:'',files:[],pending:null,busy:false,notice:''});return cache.get(key);}
  function favoriteFor(type,id){return favoriteItems.find(item=>item.sourceType===type&&item.sourceId===id);}
  function star(entry,type='diary',id=profile()){
    const b=create('button','personal-star');b.type='button';b.dataset.favoriteSource=type;b.dataset.favoriteId=entry.id;
    const saved=favoriteFor(type,entry.id);b.setAttribute('aria-label',saved?'Убрать из избранного':'В избранное');b.setAttribute('aria-pressed',String(Boolean(saved)));b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.34l-5.62 2.96 1.07-6.27L2.9 9.6l6.3-.9Z"/></svg>';
    b.disabled=favoriteBusy.has(type+entry.id);
    b.addEventListener('click',()=>void toggle(entry,type,id));return b;
  }
  function updateStars(){
    document.querySelectorAll('[data-favorite-source]').forEach(button=>{const saved=favoriteFor(button.dataset.favoriteSource,button.dataset.favoriteId);button.setAttribute('aria-pressed',String(Boolean(saved)));button.setAttribute('aria-label',saved?'Убрать из избранного':'В избранное');button.disabled=favoriteBusy.has(button.dataset.favoriteSource+button.dataset.favoriteId);});
  }
  async function favorites(older=false){
    if(favoriteLoading)return;favoriteLoading=true;renderViews();
    try{const data=await api('/api/favorites'+(older&&favoriteCursor?'?cursor='+encodeURIComponent(favoriteCursor):''));favoriteItems=older?[...favoriteItems,...data.items.filter(item=>!favoriteItems.some(old=>old.id===item.id))]:data.items;favoriteLoaded=true;favoriteCursor=data.cursor;favoriteMore=data.hasMore;}
    catch{for(const view of views)if(view.kind==='favorites')view.status.textContent='Избранное не загрузилось. Нажми «Обновить».';}
    finally{favoriteLoading=false;renderViews();updateStars();}
  }
  async function toggle(entry,type,id){
    const key=type+entry.id;if(favoriteBusy.has(key))return;favoriteBusy.add(key);updateStars();
    try{
      const old=favoriteFor(type,entry.id);
      if(old){await api('/api/favorites/'+old.id,{method:'DELETE'});favoriteItems=favoriteItems.filter(item=>item.id!==old.id);}
      else{const data=await api('/api/favorites',{method:'PUT',body:JSON.stringify({sourceType:type,sourceId:entry.id,profile:id})});favoriteItems=[data.item,...favoriteItems.filter(item=>item.id!==data.item.id)];}
      renderViews();void window.missionActivity?.refresh();
    }catch{for(const view of views)view.status.textContent='Не удалось изменить избранное. Попробуй еще раз.';}
    finally{favoriteBusy.delete(key);updateStars();}
  }
  async function load(kind,older=false,quiet=false){
    if(kind==='favorites'){await favorites(older);return;}
    if(kind==='scheduler'){await window.missionScheduler.refresh();return;}
    const s=store(kind);if(s.loading||s.polling||s.busy)return;if(quiet)s.polling=true;else{s.loading=true;s.notice='';renderViews();}let changed=!quiet;
    try{
      const suffix=older&&s.cursor?'?cursor='+encodeURIComponent(s.cursor):'';
      const data=await api(kind==='team'?'/api/team-chat'+suffix:kind==='chat'?'/api/chat'+suffix:'/api/astronauts/'+s.profile+'/book'+suffix);
      const items=['chat','team'].includes(kind)?data.messages:data.entries.filter(entry=>entry.role==='note').reverse();if(quiet)changed=items.some(item=>!s.messages.some(old=>old.id===item.id));
      s.messages=older?[...items.filter(item=>!s.messages.some(old=>old.id===item.id)),...s.messages]:quiet?[...s.messages,...items.filter(item=>!s.messages.some(old=>old.id===item.id))]:items;s.cursor=data.cursor;s.more=data.hasMore;s.loaded=true;
    }catch{s.notice='История не загрузилась. Нажми «Обновить», текст останется в поле.';}
    finally{if(quiet)s.polling=false;else s.loading=false;if(changed)renderViews();}
  }
  function messageNode(entry,kind,id){
    const item=create('article','personal-message '+(kind==='team'&&!entry.isOwn||entry.role==='assistant'?'assistant':'user'));
    const header=create('header'),name=create('span','',kind==='team'?(entry.authorName+(entry.isOwn?' / ты':'')):kind==='diary'?'Твоя запись':entry.role==='assistant'?'NasaGPT':(window.missionProfileName?.name||'Ты'));header.append(name,create('time','',stamp(entry.createdAt)));if(kind!=='team')header.append(star(entry,kind,id));
    item.append(header);if(entry.content)item.append(create('p','',entry.content));if(kind!=='team'&&entry.wellbeing)item.append(badge(entry.wellbeing));for(const file of entry.attachments||[]){const link=create('a','chat-file-link',file.name+' / '+Math.max(1,Math.ceil(file.bytes/1024))+' КБ');link.href=file.url;link.download=file.name;item.append(link);}
    if(entry.pending&&kind==='chat'){const retry=create('button','personal-retry','Повторить запрос ответа');retry.type='button';retry.disabled=store('chat').busy;retry.addEventListener('click',()=>void retryChat(entry));item.append(retry);}
    return item;
  }
  function renderViews(){
    for(const view of views){
      if(view.host.hidden)continue;
      const kind=view.kind;
      if(kind==='scheduler'){view.form.hidden=true;view.more.hidden=true;window.missionScheduler.render(view.list);view.refresh.disabled=window.missionScheduler.loading;continue;}
      const s=kind==='favorites'?null:store(kind),scrollTop=view.list.scrollTop,atBottom=view.list.scrollHeight-view.list.scrollTop-view.list.clientHeight<40;view.list.replaceChildren();
      const items=kind==='favorites'?favoriteItems:kind==='team'&&window.missionProfileName?.name?s.messages.map(entry=>entry.isOwn?{...entry,authorName:window.missionProfileName.name}:entry):s.messages;
      if(!items.length)view.list.append(create('div','personal-empty',(kind==='favorites'?favoriteLoading:s.loading)?'Загружаю...':kind==='favorites'?'Сохраняй важные записи и ответы кнопкой со звездой.':kind==='diary'?'Расскажи, как прошел день. Запись и выбранное самочувствие попадут в дневник.':kind==='team'?'Общий канал астронавтов. Начни разговор с экипажем.':'Привет! Я NasaGPT. О чем поговорим?'));
      if(kind==='team'&&window.missionAstronautChat)window.missionAstronautChat.render(view.list,items,entry=>messageNode(entry,'team',s.profile));
      else for(const entry of items){
        if(kind==='favorites'){
          const card=create('article','personal-favorite'),header=create('header');header.append(create('span','',entry.sourceType==='diary'?'Архив':'NasaGPT'),create('time','',stamp(entry.createdAt)),star({...entry,id:entry.sourceId},entry.sourceType,entry.profile));card.append(header,create('p','',entry.content));if(entry.wellbeing)card.append(badge(entry.wellbeing));view.list.append(card);
        }else view.list.append(messageNode(entry,kind,s.profile));
      }
      view.list.scrollTop=atBottom?view.list.scrollHeight:scrollTop;
      view.more.hidden=kind==='favorites'?!favoriteMore:!s.more;view.more.disabled=kind==='favorites'?favoriteLoading:s.loading;
      view.refresh.disabled=kind==='favorites'?favoriteLoading:s.loading;
      if(view.form){view.form.hidden=kind==='favorites';if(kind!=='favorites'){if(view.input.value!==s.draft)view.input.value=s.draft;view.input.disabled=s.busy;view.send.disabled=s.busy||s.loading||s.dictating||s.files.some(file=>!file.id)||!s.draft.trim()&&!s.files.length;view.send.textContent=s.busy?kind==='chat'?'Ожидаю ответ...':'Сохраняю...':['chat','team'].includes(kind)?'Отправить':'В дневник';view.input.placeholder=kind==='team'?'Сообщение экипажу':['chat'].includes(kind)?'':'Что ты чувствуешь? Что сегодня изменилось?';view.status.textContent=s.notice;window.missionChatComposer.refresh(view);}}
    }
    updateStars();
  }
  async function send(kind){
    const s=store(kind);if(s.busy||s.dictating||s.files.some(file=>!file.id)||!s.draft.trim()&&!s.files.length)return;s.busy=true;s.notice='';
    s.pending||={id:crypto.randomUUID(),content:s.draft.trim(),attachments:s.files.map(file=>file.id),...(kind==='team'?{}:{wellbeing:currentReport(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})};const input=s.pending;renderViews();
    try{
      const result=await api(kind==='team'?'/api/team-chat':kind==='chat'?'/api/chat':'/api/astronauts/'+s.profile+'/messages',{method:'POST',body:JSON.stringify({...input,...(kind==='diary'?{mode:'diary',language:'ru',attachments:[]}:{} )})});
      for(const entry of [result.message,result.reply].filter(Boolean)){const index=s.messages.findIndex(item=>item.id===entry.id);if(index<0)s.messages.push(entry);else s.messages[index]=entry;}
      void window.missionActivity?.refresh();s.draft='';s.files=[];s.pending=null;s.loaded=true;s.notice=kind==='diary'?'Запись сохранена в дневнике.':result.replyError?'NasaGPT пока не смог ответить. Попробуй повторить запрос.':'';
      if(kind==='chat'&&result.tasks?.length){s.notice=(s.notice?s.notice+' ':'')+'В «Запланировано»: '+result.tasks.length+'.';void window.missionScheduler.refresh();}
      if(kind==='diary'){void window.missionBook?.refresh();void loadJournal();}
    }catch{s.notice='Не удалось завершить отправку. Текст сохранен здесь; можно повторить.';}
    finally{s.busy=false;renderViews();for(const view of views)if(view.kind===kind&&!view.host.hidden)view.list.scrollTop=view.list.scrollHeight;}
  }
  async function retryChat(entry){
    const s=store('chat');if(s.busy)return;s.busy=true;s.notice='';renderViews();
    try{const data=await api('/api/chat',{method:'POST',body:JSON.stringify({id:entry.id,content:entry.content,wellbeing:canonicalReport(entry.wellbeing),attachments:(entry.attachments||[]).map(file=>file.id),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});for(const row of [data.message,data.reply].filter(Boolean)){const i=s.messages.findIndex(item=>item.id===row.id);if(i<0)s.messages.push(row);else s.messages[i]=row;}if(data.tasks?.length)void window.missionScheduler.refresh();s.notice=data.replyError?'NasaGPT пока не смог ответить. Попробуй повторить запрос.':'';}catch{s.notice='Не удалось получить ответ. Попробуй еще раз.';}finally{s.busy=false;renderViews();}
  }
  function panel(host,kind,{favoriteShortcut=false,onKindChange}={}){
    const view={host,kind,favoriteShortcut,onKindChange};host.classList.add('personal-conversation');
    host.innerHTML='<header class="personal-conversation-heading"><div><span class="personal-section-title"></span><small class="personal-section-caption"></small></div><div><button type="button" data-personal-search>✧ NasaGPT</button><button type="button" data-personal-favorites hidden>Избранное</button><button type="button" data-personal-refresh aria-label="Обновить историю">↻</button></div></header><button type="button" class="personal-older" hidden>Ранние записи</button><div class="personal-messages" role="log" aria-live="polite"></div><form class="personal-composer"><label class="sr-only">Текст сообщения</label><textarea rows="2" maxlength="6000" aria-label="Текст сообщения"></textarea><footer><span class="personal-send-hint"></span><button type="submit"></button></footer></form><p class="personal-status" role="status"></p>';
    Object.assign(view,{list:host.querySelector('.personal-messages'),form:host.querySelector('form'),input:host.querySelector('textarea'),send:host.querySelector('button[type=submit]'),status:host.querySelector('.personal-status'),more:host.querySelector('.personal-older'),refresh:host.querySelector('[data-personal-refresh]')});
    view.form.addEventListener('submit',event=>{event.preventDefault();void send(view.kind);});
    view.input.addEventListener('input',()=>{const s=store(view.kind);s.draft=view.input.value;s.pending=null;view.send.disabled=!s.draft.trim()&&!s.files.length||s.files.some(file=>!file.id)||s.busy||s.loading||s.dictating;});
    view.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();view.form.requestSubmit();}});
    view.more.addEventListener('click',()=>void load(view.kind,true));view.refresh.addEventListener('click',()=>void load(view.kind));
    host.querySelector('[data-personal-favorites]').addEventListener('click',()=>setKind(view,view.kind==='favorites'?'chat':'favorites'));
    host.querySelector('[data-personal-search]').addEventListener('click',()=>{window.missionDesign.navigate('archive');document.getElementById('book-search-open').click();});
    window.missionChatComposer.attach(view,{store,render:renderViews});views.push(view);setKind(view,kind,false);return view;
  }
  function setKind(view,kind,fetch=true){
    if(view.kind!==kind){window.missionChatComposer.contextChanged(view);view.status.textContent='';}view.kind=kind;view.host.querySelector('.personal-section-title').textContent=kind==='diary'?'Твой дневник':kind==='chat'?'NasaGPT':kind==='scheduler'?'Запланировано':kind==='team'?'Общий чат':'Избранное';
    window.missionAstronautChat?.decorateHost(view.host,kind==='team');
    const shortcut=view.host.querySelector('[data-personal-favorites]');shortcut.hidden=!view.favoriteShortcut;shortcut.textContent=kind==='favorites'?'Назад в чат':'Избранное';view.onKindChange?.(kind);
    view.input.dataset.activityArea=kind==='diary'?'diary':kind==='team'?'team':'chat';
    view.host.querySelector('.personal-section-caption').textContent=kind==='diary'?'Личные наблюдения / отдельная история и поиск по смыслу':kind==='chat'?'Давай поговорим':kind==='scheduler'?'Задачи и напоминания из чата':kind==='team'?'Экипаж / общий канал':'Важные записи и ответы';
    view.host.querySelector('[data-personal-search]').hidden=kind!=='diary';view.host.querySelector('.personal-send-hint').textContent=kind==='diary'?'Enter / сохранить · Shift+Enter / новая строка':'Enter / отправить · Shift+Enter / новая строка';view.form.hidden=kind==='favorites'||kind==='scheduler';
    renderViews();window.missionCompose?.refresh(view.input);if(fetch){if(kind==='favorites'){if(!favoriteLoaded)void favorites();}else if(kind==='scheduler'){void window.missionScheduler.refresh();}else if(!store(kind).loaded)void load(kind);}
  }
  const checkin=create('section','media-checkin');checkin.hidden=true;
  const tabs=create('div','personal-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Личные разделы');
  for(const [kind,title] of [['chat','NasaGPT'],['favorites','Избранное'],['scheduler','Запланировано'],['team','Общий чат']]){const b=create('button','',title);b.type='button';b.id='media-personal-tab-'+kind;b.dataset.personalTab=kind;b.setAttribute('role','tab');b.setAttribute('aria-controls','media-personal-conversation');b.setAttribute('aria-selected',String(kind==='chat'));b.tabIndex=kind==='chat'?0:-1;b.addEventListener('click',()=>{modalKind=kind;for(const tab of tabs.children){tab.setAttribute('aria-selected',String(tab===b));tab.tabIndex=tab===b?0:-1;}compact.setAttribute('aria-labelledby',b.id);setKind(modalView,kind);});b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...tabs.children],i=list.indexOf(b),next=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowRight'?1:list.length-1))%list.length;list[next].click();list[next].focus();});tabs.append(b);}
  checkin.append(tabs);const compact=create('div','');compact.id='media-personal-conversation';compact.setAttribute('role','tabpanel');compact.setAttribute('aria-labelledby','media-personal-tab-chat');checkin.append(compact);modal.querySelector('.log-identity').before(checkin);const modalView=panel(compact,'chat');
  const main=create('section','personal-workspace panel glass');main.id='personal-workspace';main.hidden=true;const mainHost=create('div','');main.append(mainHost);document.querySelector('.main-column').append(main);const mainView=panel(mainHost,'chat',{favoriteShortcut:true,onKindChange:kind=>{mainKind=kind;}});
  const sidebar=create('section','nasagpt-sidebar panel glass');sidebar.id='nasagpt-sidebar';
  const legacy=document.getElementById('journal-view');legacy.classList.add('legacy-journal-archive');legacy.before(sidebar);const sidebarView=panel(sidebar,'chat',{favoriteShortcut:true});
  const sidebarTabs=create('div','personal-tabs sidebar-personal-tabs');sidebarTabs.setAttribute('role','tablist');sidebarTabs.setAttribute('aria-label','Разделы NasaGPT');
  sidebar.id='nasagpt-sidebar';sidebarView.list.id='sidebar-personal-content';sidebarView.list.setAttribute('role','tabpanel');
  for(const [kind,title] of [['chat','NasaGPT'],['favorites','Избранное'],['scheduler','Запланировано'],['team','Общий чат']]){const b=create('button','',title);b.type='button';b.id='sidebar-tab-'+kind;b.dataset.sidebarTab=kind;b.setAttribute('role','tab');b.setAttribute('aria-controls','sidebar-personal-content');b.setAttribute('aria-selected',String(kind==='chat'));b.tabIndex=kind==='chat'?0:-1;b.addEventListener('click',()=>{for(const tab of sidebarTabs.children){tab.setAttribute('aria-selected',String(tab===b));tab.tabIndex=tab===b?0:-1;}sidebarView.list.setAttribute('aria-labelledby',b.id);setKind(sidebarView,kind);});b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...sidebarTabs.children],i=list.indexOf(b),next=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowRight'?1:list.length-1))%list.length;list[next].click();list[next].focus();});sidebarTabs.append(b);}
  sidebar.prepend(sidebarTabs);sidebarView.list.setAttribute('aria-labelledby','sidebar-tab-chat');sidebar.querySelector('[data-personal-favorites]').hidden=true;sidebarView.favoriteShortcut=false;
  window.missionProfileName?.attach(sidebar.querySelector('.personal-conversation-heading'));
  window.addEventListener('mission-profile-change',renderViews);
  window.addEventListener('mission-tasks-change',renderViews);
  window.addEventListener('mission-tasks-open',()=>{window.missionDesign.navigate('overview');sidebarTabs.querySelector('[data-sidebar-tab=scheduler]').click();sidebar.scrollIntoView({behavior:'smooth',block:'start'});});
  setInterval(()=>{if(!document.hidden&&views.some(view=>view.kind==='team'&&view.host.getClientRects().length))void load('team',false,true);},5000);
  window.addEventListener('mission-diary-close',()=>window.missionChatComposer.stopWithin(modal));
  function render(section=state.view){
    const active=state.workspace==='crew'&&(section==='chat'||section==='favorites');main.hidden=!active;document.body.dataset.personalSection=active?section:'';
    if(profileSeen!==profile()){profileSeen=profile();restoreScore();if(window.missionDiary.active){const s=store(modalKind);if(modalKind!=='favorites'&&!s.loaded)void load(modalKind);}}
    if(active)setKind(mainView,section==='favorites'?'favorites':mainKind);renderScores();renderViews();
  }
  function onOpen(){void prepare();setKind(modalView,modalKind);if(!favoriteLoaded)void favorites();renderScores();}
  window.addEventListener('mission-diary-open',onOpen);
  window.missionCheckin={widget:slider,current:currentReport};
  window.missionFavorites={button:star,badge,refresh:favorites};window.missionConversations={render,refreshDiary:()=>load('diary')};
  void prepare();void load('chat');render();if(window.missionDiary.active)onOpen();
})();
