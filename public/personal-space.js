(() => {
  const modal=document.getElementById('media-diary-dialog'),views=[],sliders=[],cache=new Map(),selections=new Map(),favoriteBusy=new Set();
  let identity,identityTask,modalKind='chat',profileSeen='',favoriteItems=[],favoriteLoaded=false,favoriteCursor=null,favoriteMore=false,favoriteLoading=false;
  const profile=()=>crew[state.crew].id;
  const label=value=>value<=2?'Очень плохо':value<=4?'Ниже обычного':value<=6?'Нормально':value<=8?'Хорошо':'Отлично';
  const hue=value=>Math.round((value-1)/9*150);
  const stamp=value=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  const create=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const api=(path,options)=>journalApi(path,options);
  function selection(){return selections.get(profile())||null;}
  function storageKey(id=profile()){return 'mission-checkin:'+identity.storageScope+':'+id;}
  async function prepare(){
    identityTask||=api('/api/me').then(value=>{identity=value;try{if(selection())localStorage.setItem(storageKey(),JSON.stringify(selection()));}catch{}restoreScore();}).catch(()=>{});await identityTask;
  }
  function restoreScore(){
    if(!identity||selections.has(profile()))return;
    try{const saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(Number.isInteger(saved?.score)&&saved.score>=1&&saved.score<=10&&Date.now()-saved.at>=0&&Date.now()-saved.at<12*3600000)selections.set(profile(),saved);}catch{}
    renderScores();
  }
  function choose(score){
    const value={score,at:Date.now()};selections.set(profile(),value);
    try{if(identity)localStorage.setItem(storageKey(),JSON.stringify(value));}catch{}
    renderScores();
  }
  function renderScores(){
    const chosen=selection();
    for(const widget of sliders){
      const score=chosen?.score||5;widget.input.value=score;widget.root.style.setProperty('--mood-hue',hue(score));widget.root.style.setProperty('--mood-value',(score-1)/9);widget.root.dataset.chosen=String(Boolean(chosen));
      widget.value.textContent=chosen?score+' / 10':'- / 10';widget.label.textContent=chosen?label(score):'Выбери свое самочувствие';widget.input.setAttribute('aria-valuetext',chosen?score+' из 10 / '+label(score):'Самочувствие еще не выбрано');
      widget.mouth.setAttribute('d','M7 14 Q12 '+(score<=3?9:score>=7?20:14)+' 17 14');
      widget.time.textContent=chosen?'Твоя оценка / '+new Date(chosen.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Самооценка, не показание датчика';
      widget.reset.hidden=!chosen;
    }
  }
  function slider(){
    const root=create('section','wellbeing-checkin');
    root.innerHTML='<header><div><span class="personal-eyebrow">CHECK IN</span><h3>Как ты сейчас?</h3></div><div class="wellbeing-face" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="1"/><circle cx="16" cy="9" r="1"/><path d="M7 14Q12 14 17 14"/></svg></div></header><div class="wellbeing-readout"><strong></strong><span></span></div><label class="sr-only">Твое самочувствие от 1 до 10<input type="range" min="1" max="10" step="1" value="5"></label><div class="wellbeing-range-shell"></div><div class="wellbeing-endpoints"><span>Очень плохо</span><span>Отлично</span></div><small class="wellbeing-time"></small>';
    const input=root.querySelector('input');input.setAttribute('aria-label','Твое самочувствие от 1 до 10');root.querySelector('.wellbeing-range-shell').append(input);root.querySelector('label').remove();
    input.addEventListener('input',()=>choose(Number(input.value)));
    const reset=create('button','wellbeing-reset','Сбросить оценку');reset.type='button';reset.hidden=true;reset.addEventListener('click',()=>{selections.delete(profile());try{if(identity)localStorage.removeItem(storageKey());}catch{}renderScores();});root.append(reset);
    sliders.push({root,input,reset,value:root.querySelector('strong'),label:root.querySelector('.wellbeing-readout span'),mouth:root.querySelector('path'),time:root.querySelector('.wellbeing-time')});return root;
  }
  function badge(report){const node=create('span','wellbeing-badge',report.score+' / 10 · '+report.label);node.style.setProperty('--mood-hue',hue(report.score));return node;}
  function store(kind){const key=kind==='diary'?'diary:'+profile():kind;if(!cache.has(key))cache.set(key,{kind,profile:profile(),messages:[],loaded:false,loading:false,cursor:null,more:false,draft:'',pending:null,busy:false,notice:''});return cache.get(key);}
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
      renderViews();
    }catch{for(const view of views)view.status.textContent='Не удалось изменить избранное. Попробуй еще раз.';}
    finally{favoriteBusy.delete(key);updateStars();}
  }
  async function load(kind,older=false){
    if(kind==='favorites'){await favorites(older);return;}
    const s=store(kind);if(s.loading)return;s.loading=true;s.notice='';renderViews();
    try{
      const suffix=older&&s.cursor?'?cursor='+encodeURIComponent(s.cursor):'';
      const data=await api(kind==='chat'?'/api/chat'+suffix:'/api/astronauts/'+s.profile+'/book'+suffix);
      const items=kind==='chat'?data.messages:data.entries.filter(entry=>entry.role==='note').reverse();
      s.messages=older?[...items.filter(item=>!s.messages.some(old=>old.id===item.id)),...s.messages]:items;s.cursor=data.cursor;s.more=data.hasMore;s.loaded=true;
    }catch{s.notice='История не загрузилась. Нажми «Обновить», текст останется в поле.';}
    finally{s.loading=false;renderViews();}
  }
  function messageNode(entry,kind,id){
    const item=create('article','personal-message '+(entry.role==='assistant'?'assistant':'user'));
    const header=create('header'),name=create('span','',kind==='diary'?'Твоя запись':entry.role==='assistant'?'NasaGPT':'Ты');header.append(name,create('time','',stamp(entry.createdAt)),star(entry,kind,id));
    item.append(header,create('p','',entry.content));if(entry.wellbeing)item.append(badge(entry.wellbeing));
    if(entry.pending&&kind==='chat'){const retry=create('button','personal-retry','Повторить запрос ответа');retry.type='button';retry.disabled=store('chat').busy;retry.addEventListener('click',()=>void retryChat(entry));item.append(retry);}
    return item;
  }
  function renderViews(){
    for(const view of views){
      if(view.host.hidden)continue;
      const kind=view.kind,s=kind==='favorites'?null:store(kind);view.list.replaceChildren();
      const items=kind==='favorites'?favoriteItems:s.messages;
      if(!items.length)view.list.append(create('div','personal-empty',(kind==='favorites'?favoriteLoading:s.loading)?'Загружаю...':kind==='favorites'?'Сохраняй важные записи и ответы кнопкой со звездой.':kind==='diary'?'Расскажи, как прошел день. Запись и выбранное самочувствие попадут в дневник.':'Привет! Я NasaGPT. О чем поговорим?'));
      for(const entry of items){
        if(kind==='favorites'){
          const card=create('article','personal-favorite'),header=create('header');header.append(create('span','',entry.sourceType==='diary'?'Дневник':'Общий чат'),create('time','',stamp(entry.createdAt)),star({...entry,id:entry.sourceId},entry.sourceType,entry.profile));card.append(header,create('p','',entry.content));if(entry.wellbeing)card.append(badge(entry.wellbeing));view.list.append(card);
        }else view.list.append(messageNode(entry,kind,s.profile));
      }
      view.more.hidden=kind==='favorites'?!favoriteMore:!s.more;view.more.disabled=kind==='favorites'?favoriteLoading:s.loading;
      view.refresh.disabled=kind==='favorites'?favoriteLoading:s.loading;
      if(view.form){view.form.hidden=kind==='favorites';if(kind!=='favorites'){if(view.input.value!==s.draft)view.input.value=s.draft;view.input.disabled=s.busy;view.send.disabled=s.busy||s.loading||!s.draft.trim();view.send.textContent=s.busy?kind==='chat'?'Ожидаю ответ...':'Сохраняю...':kind==='chat'?'Отправить':'В дневник';view.input.placeholder=kind==='chat'?'Напиши сообщение...':'Что ты чувствуешь? Что сегодня изменилось?';view.status.textContent=s.notice;}}
    }
    updateStars();
  }
  async function send(kind){
    const s=store(kind);if(s.busy||!s.draft.trim())return;s.busy=true;s.notice='';
    s.pending||={id:crypto.randomUUID(),content:s.draft.trim(),wellbeing:selection()?{score:selection().score}:null};const input=s.pending;renderViews();
    try{
      const result=await api(kind==='chat'?'/api/chat':'/api/astronauts/'+s.profile+'/messages',{method:'POST',body:JSON.stringify({...input,...(kind==='diary'?{mode:'diary',language:'ru',attachments:[]}:{} )})});
      for(const entry of [result.message,result.reply].filter(Boolean)){const index=s.messages.findIndex(item=>item.id===entry.id);if(index<0)s.messages.push(entry);else s.messages[index]=entry;}
      s.draft='';s.pending=null;s.loaded=true;s.notice=kind==='diary'?'Запись сохранена в дневнике.':result.replyError?'NasaGPT пока не смог ответить. Попробуй повторить запрос.':'';
      if(kind==='diary'){void window.missionBook?.refresh();void loadJournal();}
    }catch{s.notice='Не удалось завершить отправку. Текст сохранен здесь; можно повторить.';}
    finally{s.busy=false;renderViews();for(const view of views)if(view.kind===kind&&!view.host.hidden)view.list.scrollTop=view.list.scrollHeight;}
  }
  async function retryChat(entry){
    const s=store('chat');if(s.busy)return;s.busy=true;s.notice='';renderViews();
    try{const data=await api('/api/chat',{method:'POST',body:JSON.stringify({id:entry.id,content:entry.content,wellbeing:entry.wellbeing?{score:entry.wellbeing.score}:null})});for(const row of [data.message,data.reply].filter(Boolean)){const i=s.messages.findIndex(item=>item.id===row.id);if(i<0)s.messages.push(row);else s.messages[i]=row;}s.notice=data.replyError?'NasaGPT пока не смог ответить. Попробуй повторить запрос.':'';}catch{s.notice='Не удалось получить ответ. Попробуй еще раз.';}finally{s.busy=false;renderViews();}
  }
  function panel(host,kind){
    const view={host,kind};host.classList.add('personal-conversation');
    host.innerHTML='<header class="personal-conversation-heading"><div><span class="personal-section-title"></span><small class="personal-section-caption"></small></div><div><button type="button" data-personal-search>✧ NasaGPT</button><button type="button" data-personal-refresh aria-label="Обновить историю">↻</button></div></header><button type="button" class="personal-older" hidden>Ранние записи</button><div class="personal-messages" role="log" aria-live="polite"></div><form class="personal-composer"><label class="sr-only">Текст сообщения</label><textarea rows="2" maxlength="6000" aria-label="Текст сообщения"></textarea><footer><span class="personal-send-hint"></span><button type="submit"></button></footer></form><p class="personal-status" role="status"></p>';
    Object.assign(view,{list:host.querySelector('.personal-messages'),form:host.querySelector('form'),input:host.querySelector('textarea'),send:host.querySelector('form button'),status:host.querySelector('.personal-status'),more:host.querySelector('.personal-older'),refresh:host.querySelector('[data-personal-refresh]')});
    view.form.addEventListener('submit',event=>{event.preventDefault();void send(view.kind);});
    view.input.addEventListener('input',()=>{const s=store(view.kind);s.draft=view.input.value;s.pending=null;view.send.disabled=!s.draft.trim()||s.busy||s.loading;});
    view.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();view.form.requestSubmit();}});
    view.more.addEventListener('click',()=>void load(view.kind,true));view.refresh.addEventListener('click',()=>void load(view.kind));
    host.querySelector('[data-personal-search]').addEventListener('click',()=>{if(modal.open)modal.close();window.missionDesign.navigate('diary');document.getElementById('book-search-open').click();});
    views.push(view);setKind(view,kind,false);return view;
  }
  function setKind(view,kind,fetch=true){
    if(view.kind!==kind)view.status.textContent='';view.kind=kind;view.host.querySelector('.personal-section-title').textContent=kind==='diary'?'Твой дневник':kind==='chat'?'NasaGPT':'Избранное';
    view.host.querySelector('.personal-section-caption').textContent=kind==='diary'?'Личные наблюдения / отдельная история и поиск по смыслу':kind==='chat'?'Давай поговорим':'Важные записи и ответы';
    view.host.querySelector('[data-personal-search]').hidden=kind!=='diary';view.host.querySelector('.personal-send-hint').textContent=kind==='diary'?'Enter / сохранить · Shift+Enter / новая строка':'Enter / отправить · Shift+Enter / новая строка';view.form.hidden=kind==='favorites';
    renderViews();if(fetch){if(kind==='favorites'){if(!favoriteLoaded)void favorites();}else if(!store(kind).loaded)void load(kind);}
  }
  const checkin=create('section','media-checkin');checkin.append(slider());
  const tabs=create('div','personal-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Личные разделы');
  for(const [kind,title] of [['chat','NasaGPT'],['diary','Дневник'],['favorites','Избранное']]){const b=create('button','',title);b.type='button';b.id='media-personal-tab-'+kind;b.dataset.personalTab=kind;b.setAttribute('role','tab');b.setAttribute('aria-controls','media-personal-conversation');b.setAttribute('aria-selected',String(kind==='chat'));b.tabIndex=kind==='chat'?0:-1;b.addEventListener('click',()=>{modalKind=kind;for(const tab of tabs.children){tab.setAttribute('aria-selected',String(tab===b));tab.tabIndex=tab===b?0:-1;}compact.setAttribute('aria-labelledby',b.id);setKind(modalView,kind);});b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...tabs.children],i=list.indexOf(b),next=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowRight'?1:list.length-1))%list.length;list[next].click();list[next].focus();});tabs.append(b);}
  checkin.append(tabs);const compact=create('div','');compact.id='media-personal-conversation';compact.setAttribute('role','tabpanel');compact.setAttribute('aria-labelledby','media-personal-tab-chat');checkin.append(compact);modal.querySelector('.log-identity').before(checkin);const modalView=panel(compact,'chat');
  const main=create('section','personal-workspace panel glass');main.id='personal-workspace';main.hidden=true;const mainCheckin=slider();main.append(mainCheckin);const mainHost=create('div','');main.append(mainHost);document.querySelector('.main-column').append(main);const mainView=panel(mainHost,'chat');
  const sidebar=create('section','nasagpt-sidebar panel glass');sidebar.id='nasagpt-sidebar';
  const legacy=document.getElementById('journal-view');legacy.classList.add('legacy-journal-archive');legacy.before(sidebar);const sidebarView=panel(sidebar,'chat');
  const mediaTools=create('div','nasagpt-media-tools');
  for(const [mode,title,icon] of [['video','Открыть камеру','<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/>'],['audio','Открыть микрофон','<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/>']]){
    const button=create('button','');button.type='button';button.setAttribute('aria-label',title);button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg>';button.addEventListener('click',()=>window.missionDiary.open(mode));mediaTools.append(button);
  }
  sidebarView.form.querySelector('footer').prepend(mediaTools);
  function render(section=state.view){
    const active=state.workspace==='crew'&&(section==='chat'||section==='favorites');main.hidden=!active;document.body.dataset.personalSection=active?section:'';mainCheckin.hidden=section==='favorites';
    if(profileSeen!==profile()){profileSeen=profile();restoreScore();if(modal.open){const s=store(modalKind);if(modalKind!=='favorites'&&!s.loaded)void load(modalKind);}}
    if(active)setKind(mainView,section);renderScores();renderViews();
  }
  function onOpen(){void prepare();setKind(modalView,modalKind);if(!favoriteLoaded)void favorites();renderScores();}
  new MutationObserver(()=>{if(modal.open)onOpen();}).observe(modal,{attributes:true,attributeFilter:['open']});
  window.missionCheckin={current:()=>selection()?{score:selection().score}:null};
  window.missionFavorites={button:star,badge,refresh:favorites};window.missionConversations={render};
  void prepare();void load('chat');render();if(modal.open)onOpen();
})();
