(() => {
  const modal=document.getElementById('media-diary-dialog'),views=[],sliders=[],cache=new Map(),selections=new Map(),favoriteBusy=new Set();
  let identity=window.missionProfileName?.identity||null,identityTask,identityVersion=0,modalKind='chat',mainKind='chat',profileSeen='',favoriteItems=[],favoriteLoaded=false,favoriteCursor=null,favoriteMore=false,favoriteLoading=false;
  let confirmedOwnerSeen=Boolean(identity?.storageScope);
  const profile=()=>personalProfileId;
  const owner=()=>window.missionProfileName?window.missionProfileName.identity?.storageScope||null:identity?.storageScope||null;
  const accountActive=(expected,ticket)=>owner()===expected&&identity?.storageScope===expected&&ticket===identityVersion;
  const selectionKey=()=>owner()+':'+profile();
  const label=value=>value<=20?'Very poor':value<=40?'Below usual':value<=60?'Okay':value<=80?'Good':'Excellent';
  const hue=value=>Math.round((value-1)/99*150);
  const stamp=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
  const create=(tag,className,text)=>{const n=document.createElement(tag);if(tag==='p')n.dir='auto';if(tag==='time')n.dir='ltr';if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const api=(path,options)=>journalApi(path,options);
  let expiryTimer=0;
  function selection(){if(!owner()||identity?.storageScope!==owner())return null;const value=selections.get(selectionKey()),now=Date.now();return value&&Number.isFinite(value.at)&&value.at<=now&&now-value.at<12*3600000?value:null;}
  function scheduleExpiry(){if(typeof setTimeout!=='function')return;if(expiryTimer)clearTimeout(expiryTimer);expiryTimer=0;const value=selection();if(value)expiryTimer=setTimeout(()=>{expiryTimer=0;expireSelection();},Math.max(1,value.at+12*3600000-Date.now()));}
  function expireSelection(){if(selections.has(selectionKey())&&!selection()){selections.delete(selectionKey());try{if(identity)localStorage.removeItem(storageKey());}catch{}renderScores();window.dispatchEvent(new Event('mission-wellbeing-change'));}scheduleExpiry();}
  function currentReport(){const value=selection();return value?{score:value.score,wellbeingScale:100}:null;}
  function canonicalReport(report){if(!report)return null;return {score:report.wellbeingScale===100?report.score:report.score*10,wellbeingScale:100};}
  function storageKey(id=profile()){return 'mission-checkin:'+identity.storageScope+':'+id;}
  function bindIdentity(value){
    const next=value?.storageScope?value:null;
    if(next?.storageScope!==identity?.storageScope){
      const initialDrafts=!confirmedOwnerSeen&&!identity?.storageScope&&next?.storageScope?[...cache.entries()].filter(([key,item])=>key.startsWith('unbound:')&&typeof item.draft==='string'&&item.draft.trim()).map(([,item])=>({kind:item.kind,text:item.draft})):[];
      identityVersion++;identityTask=null;identity=next;cache.clear();selections.clear();favoriteItems=[];favoriteLoaded=false;favoriteCursor=null;favoriteMore=false;favoriteLoading=false;favoriteBusy.clear();profileSeen='';
      for(const view of views){window.missionChatComposer?.contextChanged(view);view.input.value='';view.status.textContent='';}
      for(const draft of initialDrafts){const item=store(draft.kind);item.draft=draft.text;item.recoveredDraft=true;item.notice='Connection restored. Your draft was not sent. Review it and press Send.';}
      renderScores();scheduleExpiry();window.dispatchEvent(new Event('mission-wellbeing-change'));
    }else identity=next;
    if(next?.storageScope)confirmedOwnerSeen=true;
    restoreScore();renderViews();
  }
  async function prepare(){
    if(window.missionProfileName?.identity){bindIdentity(window.missionProfileName.identity);return identity;}
    if(identityTask)return identityTask;const ticket=identityVersion;let task;
    task=Promise.resolve().then(()=>window.missionProfileName?.load?window.missionProfileName.load():api('/api/me')).then(value=>{
      if(ticket!==identityVersion)return identity;
      if(window.missionProfileName&&window.missionProfileName.identity?.storageScope!==value?.storageScope)return identity;
      bindIdentity(value);return identity;
    }).catch(()=>null).finally(()=>{if(identityTask===task)identityTask=null;});identityTask=task;return task;
  }
  function profileChanged(){
    bindIdentity(window.missionProfileName?.identity||null);
    if(owner())for(const kind of new Set(views.map(view=>view.kind)))void load(kind);
  }
  function restoreScore(){
    if(!identity||identity.storageScope!==owner()||selections.has(selectionKey()))return;
    try{
      const saved=JSON.parse(localStorage.getItem(storageKey())||'null'),scale=saved?.wellbeingScale===undefined?10:saved.wellbeingScale;
      if([10,100].includes(scale)&&Number.isInteger(saved?.score)&&saved.score>=1&&saved.score<=scale&&Number.isFinite(saved.at)&&Date.now()-saved.at>=0&&Date.now()-saved.at<12*3600000){
        const value={score:scale===10?saved.score*10:saved.score,wellbeingScale:100,at:saved.at};selections.set(selectionKey(),value);
        if(scale===10)localStorage.setItem(storageKey(),JSON.stringify(value));
      }
    }catch{}
    renderScores();scheduleExpiry();window.dispatchEvent(new Event('mission-wellbeing-change'));
  }
  function choose(score){
    if(!owner()||identity?.storageScope!==owner()||!Number.isInteger(score)||score<1||score>100)return;
    const value={score,wellbeingScale:100,at:Date.now()};selections.set(selectionKey(),value);
    try{if(identity)localStorage.setItem(storageKey(),JSON.stringify(value));}catch{}
    renderScores();scheduleExpiry();window.dispatchEvent(new Event('mission-wellbeing-change'));void window.missionActivity?.record('wellbeing',{score,wellbeingScale:100});
  }
  function renderScores(){const saved=selection();for(const widget of sliders)renderScore(widget,saved);}
  function renderScore(widget,saved=selection()){
      if(widget.preview?.scope!==owner())widget.preview=null;
      const chosen=widget.preview||saved,score=chosen?.score||50;widget.input.disabled=!owner()||identity?.storageScope!==owner();if(String(widget.input.value)!==String(score))widget.input.value=score;widget.root.style.setProperty('--mood-hue',hue(score));widget.root.style.setProperty('--mood-value',(score-1)/99);widget.root.dataset.chosen=String(Boolean(chosen));
      window.missionGauge.update(widget.value,{value:chosen?score:null,label:'Wellbeing',compact:true});widget.label.textContent=chosen?label(score):'Select how you feel';widget.input.setAttribute('aria-valuetext',chosen?score+' from 100 / '+label(score):'Wellbeing not selected yet');
      widget.mouth.setAttribute('d','M7 14 Q12 '+(9+(score-1)/99*11).toFixed(2)+' 17 14');
      widget.time.textContent=chosen?'Your score / '+new Date(chosen.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'Self-report, not a sensor reading';
      widget.reset.hidden=!chosen;
  }
  function slider(){
    const root=create('section','wellbeing-checkin');
    root.innerHTML='<header><div><span class="personal-eyebrow">CHECK IN</span><h3>How are you now?</h3></div><div class="wellbeing-face" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="1"/><circle cx="16" cy="9" r="1"/><path d="M7 14Q12 14 17 14"/></svg></div></header><div class="wellbeing-readout"><strong></strong><span></span></div><label class="sr-only">Your wellbeing from 1 to 100<input type="range" min="1" max="100" step="1" value="50"></label><div class="wellbeing-range-shell"></div><div class="wellbeing-endpoints"><span>Very poor</span><span>Excellent</span></div><small class="wellbeing-time"></small>';
    const input=root.querySelector('input');input.setAttribute('aria-label','Your wellbeing from 1 to 100');root.querySelector('.wellbeing-range-shell').append(input);root.querySelector('label').remove();
    const reset=create('button','wellbeing-reset','Reset score');reset.type='button';reset.hidden=true;reset.addEventListener('click',()=>{if(!owner()||identity?.storageScope!==owner())return;selections.delete(selectionKey());try{if(identity)localStorage.removeItem(storageKey());}catch{}renderScores();scheduleExpiry();window.dispatchEvent(new Event('mission-wellbeing-change'));});root.append(reset);
    const widget={root,input,reset,value:root.querySelector('strong'),label:root.querySelector('.wellbeing-readout span'),mouth:root.querySelector('path'),time:root.querySelector('.wellbeing-time'),preview:null};
    input.addEventListener('pointerdown',()=>input.focus({preventScroll:true}));
    input.addEventListener('input',()=>{const score=Number(input.value);if(input.disabled||!owner()||identity?.storageScope!==owner()||!Number.isInteger(score)||score<1||score>100)return;widget.preview={scope:owner(),score,at:Date.now()};renderScore(widget);});
    const commit=()=>{const value=widget.preview;widget.preview=null;if(value&&value.scope===owner())choose(value.score);};
    input.addEventListener('change',commit);input.addEventListener('blur',commit);input.addEventListener('pointercancel',()=>{widget.preview=null;renderScores();});
    sliders.push(widget);renderScores();return root;
  }
  function badge(report){const scale=report.wellbeingScale===100?100:10,score=canonicalReport(report).score;const node=create('span','wellbeing-badge');node.innerHTML=window.missionGauge.markup({value:report.score,max:scale,label:'Wellbeing',compact:true});node.title='Your wellbeing check-in / not an AI rating';node.append(create('span','','Wellbeing: '+(report.label||label(score))));node.style.setProperty('--mood-hue',hue(score));return node;}
  function store(kind){const key=(owner()||'unbound')+':'+(kind==='diary'?'diary:'+profile():kind);if(!cache.has(key))cache.set(key,{kind,profile:profile(),messages:[],loaded:false,loading:false,cursor:null,more:false,draft:'',files:[],pending:null,busy:false,notice:'',recoveredDraft:false,revision:0,generation:null,clearing:false});return cache.get(key);}
  function favoriteFor(type,id){return favoriteItems.find(item=>item.sourceType===type&&item.sourceId===id);}
  function star(entry,type='diary',id=profile()){
    const b=create('button','personal-star');b.type='button';b.dataset.favoriteSource=type;b.dataset.favoriteId=entry.id;
    const saved=favoriteFor(type,entry.id);b.setAttribute('aria-label',saved?'Remove from favorites':'Add to favorites');b.setAttribute('aria-pressed',String(Boolean(saved)));b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.34l-5.62 2.96 1.07-6.27L2.9 9.6l6.3-.9Z"/></svg>';
    b.disabled=favoriteBusy.has(type+entry.id);
    b.addEventListener('click',()=>void toggle(entry,type,id));return b;
  }
  function updateStars(){
    document.querySelectorAll('[data-favorite-source]').forEach(button=>{const saved=favoriteFor(button.dataset.favoriteSource,button.dataset.favoriteId);button.setAttribute('aria-pressed',String(Boolean(saved)));button.setAttribute('aria-label',saved?'Remove from favorites':'Add to favorites');button.disabled=favoriteBusy.has(button.dataset.favoriteSource+button.dataset.favoriteId);});
  }
  async function favorites(older=false){
    if(favoriteLoading||!owner()||identity?.storageScope!==owner())return;const expected=owner(),ticket=identityVersion;favoriteLoading=true;renderViews();
    try{const data=await api('/api/favorites'+(older&&favoriteCursor?'?cursor='+encodeURIComponent(favoriteCursor):''));if(!accountActive(expected,ticket))return;favoriteItems=older?[...favoriteItems,...data.items.filter(item=>!favoriteItems.some(old=>old.id===item.id))]:data.items;favoriteLoaded=true;favoriteCursor=data.cursor;favoriteMore=data.hasMore;}
    catch{if(accountActive(expected,ticket))for(const view of views)if(view.kind==='favorites')view.status.textContent='Favorites failed to load. Press «Refresh».';}
    finally{if(accountActive(expected,ticket)){favoriteLoading=false;renderViews();updateStars();}}
  }
  async function toggle(entry,type,id){
    const expected=owner(),ticket=identityVersion;if(!expected||identity?.storageScope!==expected)return;const key=type+entry.id;if(favoriteBusy.has(key))return;favoriteBusy.add(key);updateStars();
    try{
      const old=favoriteFor(type,entry.id);
      if(old){await api('/api/favorites/'+old.id,{method:'DELETE'});if(!accountActive(expected,ticket))return;favoriteItems=favoriteItems.filter(item=>item.id!==old.id);}
      else{const data=await api('/api/favorites',{method:'PUT',body:JSON.stringify({sourceType:type,sourceId:entry.id,profile:id})});if(!accountActive(expected,ticket))return;favoriteItems=[data.item,...favoriteItems.filter(item=>item.id!==data.item.id)];}
      renderViews();void window.missionActivity?.refresh();
    }catch{if(accountActive(expected,ticket))for(const view of views)view.status.textContent='Could not update favorites. Try again.';}
    finally{if(accountActive(expected,ticket)){favoriteBusy.delete(key);updateStars();}}
  }
  async function load(kind,older=false,quiet=false){
    const expected=owner(),ticket=identityVersion;if(!expected||identity?.storageScope!==expected)return;
    if(kind==='favorites'){await favorites(older);return;}
    if(kind==='scheduler'){await window.missionScheduler.refresh();return;}
    const s=store(kind),revision=s.revision;if(s.loading||s.polling||s.busy||s.clearing)return;if(quiet)s.polling=true;else{s.loading=true;if(!s.recoveredDraft)s.notice='';renderViews();}let changed=!quiet;
    try{
      const suffix=older&&s.cursor?'?cursor='+encodeURIComponent(s.cursor):'';
      const data=await api(kind==='team'?'/api/team-chat'+suffix:kind==='chat'?'/api/chat'+suffix:'/api/astronauts/'+s.profile+'/book'+suffix);
      if(!accountActive(expected,ticket)||s.revision!==revision)return;const reset=kind==='chat'&&Number.isInteger(data.generation)&&s.generation!==null&&s.generation!==data.generation;if(reset){s.messages=[];s.draft='';s.files=[];s.pending=null;s.cursor=null;older=false;changed=true;}if(kind==='chat'&&Number.isInteger(data.generation))s.generation=data.generation;const items=['chat','team'].includes(kind)?data.messages:data.entries.filter(entry=>entry.role==='note').reverse();if(quiet)changed=reset||items.some(item=>!s.messages.some(old=>old.id===item.id));
      s.messages=older?[...items.filter(item=>!s.messages.some(old=>old.id===item.id)),...s.messages]:quiet?[...s.messages,...items.filter(item=>!s.messages.some(old=>old.id===item.id))]:items;s.cursor=data.cursor;s.more=data.hasMore;s.loaded=true;
    }catch{if(accountActive(expected,ticket)&&s.revision===revision)s.notice='History failed to load. Press «Refresh», your text remains in the field.';}
    finally{if(accountActive(expected,ticket)&&s.revision===revision){if(quiet)s.polling=false;else s.loading=false;if(changed)renderViews();}}
  }
  async function clearChat(){
    const expected=owner(),ticket=identityVersion,s=store('chat');if(!expected||identity?.storageScope!==expected||s.clearing)return;
    s.clearing=true;s.notice='Clearing NasaGPT chat...';renderViews('chat');
    try{
      const result=await api('/api/chat',{method:'DELETE'});if(!accountActive(expected,ticket))return;if(result.cleared!==true||!Number.isSafeInteger(result.generation))throw Error('invalid_clear_response');
      s.revision++;s.generation=result.generation;s.messages=[];s.cursor=null;s.more=false;s.draft='';s.files=[];s.pending=null;s.busy=false;s.loading=false;s.polling=false;s.loaded=true;s.recoveredDraft=false;s.notice='NasaGPT chat cleared.';
      for(const view of views)if(view.kind==='chat'){window.missionChatComposer.contextChanged(view);view.input.value='';}
    }catch{if(accountActive(expected,ticket))s.notice='Could not clear NasaGPT chat. Try again.';}
    finally{if(accountActive(expected,ticket)){s.clearing=false;renderViews('chat');}}
  }
  function messageNode(entry,kind,id){
    const item=create('article','personal-message '+(kind==='team'&&!entry.isOwn||entry.role==='assistant'?'assistant':'user'));
    const header=create('header'),name=create('span','',kind==='team'?((entry.isOwn?'Cdr. Sara Khan':entry.authorName)+(entry.isOwn?' / you':'')):kind==='diary'?'Your entry':entry.role==='assistant'?'NasaGPT':(window.missionProfileName?.name||'Cdr. Sara Khan'));header.append(name,create('time','',stamp(entry.createdAt)));if(kind!=='team')header.append(star(entry,kind,id));
    item.append(header);if(entry.content)item.append(create('p','',entry.role==='assistant'?entry.content.replace(/\*\*/g,''):entry.content));if(kind!=='team'&&!entry.reminder&&entry.wellbeing)item.append(badge(entry.wellbeing));for(const file of entry.attachments||[]){const link=create('a','chat-file-link',file.name+' / '+Math.max(1,Math.ceil(file.bytes/1024))+' KB');link.href=file.url;link.download=file.name;item.append(link);}
    if(entry.pending&&kind==='chat'){const retry=create('button','personal-retry','Retry request answer');retry.type='button';retry.disabled=store('chat').busy;retry.addEventListener('click',()=>void retryChat(entry));item.append(retry);}
    return item;
  }
  function renderViews(onlyKind){
    for(const view of views){
      if(view.host.hidden||view.host.closest?.('[hidden]')||typeof onlyKind==='string'&&view.kind!==onlyKind)continue;
      const kind=view.kind;
      if(kind==='scheduler'){view.form.hidden=true;view.more.hidden=true;window.missionScheduler.render(view.list);view.refresh.disabled=window.missionScheduler.loading;continue;}
      const s=kind==='favorites'?null:store(kind),scrollTop=view.list.scrollTop,atBottom=view.list.scrollHeight-view.list.scrollTop-view.list.clientHeight<40;view.list.replaceChildren();
      const items=kind==='favorites'?favoriteItems:kind==='team'?s.messages.map(entry=>entry.isOwn?{...entry,authorName:'Cdr. Sara Khan'}:entry):s.messages;
      if(!items.length)view.list.append(create('div','personal-empty',(kind==='favorites'?favoriteLoading:s.loading)?'Loading...':kind==='favorites'?'Save important entries and answers using the star.':kind==='diary'?'Tell me, how your day went. Recording and selected wellbeing will be added to the diary.':kind==='team'?'Astronaut shared channel. Start a conversation with the crew.':'Hello! I NasaGPT. What shall we talk about?'));
      if(kind==='team'&&window.missionAstronautChat)window.missionAstronautChat.render(view.list,items,entry=>messageNode(entry,'team',s.profile));
      else for(const entry of items){
        if(kind==='favorites'){
          const card=create('article','personal-favorite'),header=create('header');header.append(create('span','',entry.sourceType==='diary'?'Archive':'NasaGPT'),create('time','',stamp(entry.createdAt)),star({...entry,id:entry.sourceId},entry.sourceType,entry.profile));card.append(header,create('p','',entry.content.replace(/\*\*/g,'')));if(entry.wellbeing)card.append(badge(entry.wellbeing));view.list.append(card);
        }else view.list.append(messageNode(entry,kind,s.profile));
      }
      view.list.scrollTop=atBottom?view.list.scrollHeight:scrollTop;
      view.more.hidden=kind==='favorites'?!favoriteMore:!s.more;view.more.disabled=kind==='favorites'?favoriteLoading:s.loading;
      view.refresh.disabled=kind==='favorites'?favoriteLoading:s.loading||s.clearing;if(view.clear)view.clear.disabled=!owner()||Boolean(s?.clearing);
      if(view.form){view.form.hidden=kind==='favorites';if(kind!=='favorites'){if(view.input.value!==s.draft)view.input.value=s.draft;view.input.disabled=s.busy||s.clearing;view.send.disabled=s.busy||s.clearing||s.loading||s.dictating||s.files.some(file=>!file.id)||!s.draft.trim()&&!s.files.length;view.send.textContent=s.busy?kind==='chat'?'Waiting for an answer...':'Saving...':['chat','team'].includes(kind)?'Send':'To diary';view.input.placeholder=kind==='team'?'Message the crew':['chat'].includes(kind)?'':'How do you feel? What changed today?';view.status.textContent=s.notice;window.missionChatComposer.refresh(view);}}
    }
    updateStars();
  }
  async function send(kind){
    const expected=owner(),ticket=identityVersion;if(!expected||identity?.storageScope!==expected){store(kind).notice='Connection unavailable. Your draft was not sent. Use Retry beside your name in NasaGPT, then send again.';renderViews();return;}const s=store(kind),revision=s.revision;if(s.busy||s.clearing||s.dictating||s.files.some(file=>!file.id)||!s.draft.trim()&&!s.files.length)return;s.busy=true;s.notice='';
    s.pending||={id:crypto.randomUUID(),content:s.draft.trim(),attachments:s.files.map(file=>file.id),...(kind==='team'?{}:{wellbeing:currentReport(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}),...(kind==='chat'&&window.missionHealth?.snapshot?{healthSnapshot:window.missionHealth.snapshot()}: {})};const input=s.pending;renderViews();
    try{
      const result=await api(kind==='team'?'/api/team-chat':kind==='chat'?'/api/chat':'/api/astronauts/'+s.profile+'/messages',{method:'POST',body:JSON.stringify({...input,...(kind==='chat'&&s.generation!==null?{generation:s.generation}:{}),...(kind==='diary'?{mode:'diary',language:typeof state!=='undefined'&&state.language==='ur'?'ur':'en',attachments:[]}:{} )})});
      if(!accountActive(expected,ticket)||s.revision!==revision)return;for(const entry of [result.message,result.reply].filter(Boolean)){const index=s.messages.findIndex(item=>item.id===entry.id);if(index<0)s.messages.push(entry);else s.messages[index]=entry;}
      void window.missionActivity?.refresh();s.draft='';s.files=[];s.pending=null;s.recoveredDraft=false;s.loaded=true;s.notice=kind==='diary'?'Recording saved in the diary.':result.replyError?'NasaGPT could not answer yet. Try the request again.':'';
      if(kind==='chat'&&Number.isInteger(result.generation))s.generation=result.generation;
      if(kind==='chat'&&result.tasks?.length){s.notice=(s.notice?s.notice+' ':'')+'In «Scheduled»: '+result.tasks.length+'.';void window.missionScheduler.refresh();}
      if(kind==='diary'){void window.missionBook?.refresh();void loadJournal();}
    }catch{if(accountActive(expected,ticket)&&s.revision===revision)s.notice='Could not finish sending. Your text is preserved here; you can retry.';}
    finally{if(accountActive(expected,ticket)&&s.revision===revision){s.busy=false;renderViews();for(const view of views)if(view.kind===kind&&!view.host.hidden)view.list.scrollTop=view.list.scrollHeight;}}
  }
  async function retryChat(entry){
    const expected=owner(),ticket=identityVersion;if(!expected||identity?.storageScope!==expected){store('chat').notice='Connection unavailable. Use Retry beside your name in NasaGPT, then retry this answer.';renderViews();return;}const s=store('chat'),revision=s.revision;if(s.busy||s.clearing)return;s.busy=true;s.notice='';renderViews();
    try{const data=await api('/api/chat',{method:'POST',body:JSON.stringify({...(s.generation!==null?{generation:s.generation}:{}),id:entry.id,content:entry.content,wellbeing:canonicalReport(entry.wellbeing),attachments:(entry.attachments||[]).map(file=>file.id),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});if(!accountActive(expected,ticket)||s.revision!==revision)return;for(const row of [data.message,data.reply].filter(Boolean)){const i=s.messages.findIndex(item=>item.id===row.id);if(i<0)s.messages.push(row);else s.messages[i]=row;}if(data.tasks?.length)void window.missionScheduler.refresh();s.notice=data.replyError?'NasaGPT could not answer yet. Try the request again.':'';}catch{if(accountActive(expected,ticket)&&s.revision===revision)s.notice='Could not get an answer. Try again.';}finally{if(accountActive(expected,ticket)&&s.revision===revision){s.busy=false;renderViews();}}
  }
  function panel(host,kind,{favoriteShortcut=false,onKindChange}={}){
    const view={host,kind,favoriteShortcut,onKindChange};host.classList.add('personal-conversation');
    host.innerHTML='<header class="personal-conversation-heading"><div><span class="personal-section-title"></span><small class="personal-section-caption"></small></div><div><button type="button" data-personal-search>✧ NasaGPT</button><button type="button" data-personal-favorites hidden>Favorites</button><button type="button" data-personal-refresh aria-label="Refresh history">↻</button><button type="button" data-personal-clear aria-label="Clear NasaGPT chat" title="Clear NasaGPT chat" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header><button type="button" class="personal-older" hidden>Earlier entries</button><div class="personal-messages" role="log" aria-live="polite"></div><form class="personal-composer"><label class="sr-only">Message text</label><textarea dir="auto" rows="2" maxlength="6000" aria-label="Message text"></textarea><footer><span class="personal-send-hint"></span><button type="submit"></button></footer></form><p class="personal-status" role="status"></p>';
    Object.assign(view,{list:host.querySelector('.personal-messages'),form:host.querySelector('form'),input:host.querySelector('textarea'),send:host.querySelector('button[type=submit]'),status:host.querySelector('.personal-status'),more:host.querySelector('.personal-older'),refresh:host.querySelector('[data-personal-refresh]'),clear:host.querySelector('[data-personal-clear]')});
    view.form.addEventListener('submit',event=>{event.preventDefault();void send(view.kind);});
    view.input.addEventListener('input',()=>{const s=store(view.kind);s.draft=view.input.value;s.pending=null;if(!s.draft.trim())s.recoveredDraft=false;view.send.disabled=!s.draft.trim()&&!s.files.length||s.files.some(file=>!file.id)||s.busy||s.clearing||s.loading||s.dictating;});
    view.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();view.form.requestSubmit();}});
    view.clear.addEventListener('click',()=>{if(view.kind==='chat')void clearChat();});view.more.addEventListener('click',()=>void load(view.kind,true));view.refresh.addEventListener('click',()=>void load(view.kind));
    host.querySelector('[data-personal-favorites]').addEventListener('click',()=>setKind(view,view.kind==='favorites'?'chat':'favorites'));
    host.querySelector('[data-personal-search]').addEventListener('click',()=>{window.missionDesign.navigate('archive');document.getElementById('book-search-open').click();});
    window.missionChatComposer.attach(view,{store,render:renderViews});views.push(view);setKind(view,kind,false);return view;
  }
  function setKind(view,kind,fetch=true){
    if(view.kind!==kind){window.missionChatComposer.contextChanged(view);view.status.textContent='';}view.kind=kind;view.host.querySelector('.personal-section-title').textContent=kind==='diary'?'Your diary':kind==='chat'?'NasaGPT':kind==='scheduler'?'Scheduled':kind==='team'?'Group chat':'Favorites';
    const heading=view.host.querySelector('.personal-conversation-heading'),nameForm=heading.querySelector('.profile-name-form');if(nameForm){nameForm.hidden=kind!=='chat';heading.classList.toggle('has-profile-name',kind==='chat');}
    if(view.clear)view.clear.hidden=kind!=='chat';window.missionAstronautChat?.decorateHost(view.host,kind==='team');
    const shortcut=view.host.querySelector('[data-personal-favorites]');shortcut.hidden=!view.favoriteShortcut;shortcut.textContent=kind==='favorites'?'Back to chat':'Favorites';view.onKindChange?.(kind);
    view.input.dataset.activityArea=kind==='diary'?'diary':kind==='team'?'team':'chat';
    view.host.querySelector('.personal-section-caption').textContent=kind==='diary'?'Personal observations / separate history and semantic search':kind==='chat'?'Let’s talk':kind==='scheduler'?'Tasks and reminders from chat':kind==='team'?'Crew / shared channel':'Important entries and answers';
    view.host.querySelector('[data-personal-search]').hidden=kind!=='diary';view.host.querySelector('.personal-send-hint').textContent=kind==='diary'?'Enter / save · Shift+Enter / new line':'Enter / send · Shift+Enter / new line';view.form.hidden=kind==='favorites'||kind==='scheduler';
    renderViews();window.missionCompose?.refresh(view.input);if(fetch){if(kind==='favorites'){if(!favoriteLoaded)void favorites();}else if(kind==='scheduler'){void window.missionScheduler.refresh();}else if(!store(kind).loaded)void load(kind);}
  }
  const checkin=create('section','media-checkin');checkin.hidden=true;
  const tabs=create('div','personal-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Personal sections');
  for(const [kind,title] of [['chat','NasaGPT'],['favorites','Favorites'],['scheduler','Scheduled'],['team','Group chat']]){const b=create('button','',title);b.type='button';b.id='media-personal-tab-'+kind;b.dataset.personalTab=kind;b.setAttribute('role','tab');b.setAttribute('aria-controls','media-personal-conversation');b.setAttribute('aria-selected',String(kind==='chat'));b.tabIndex=kind==='chat'?0:-1;b.addEventListener('click',()=>{modalKind=kind;for(const tab of tabs.children){tab.setAttribute('aria-selected',String(tab===b));tab.tabIndex=tab===b?0:-1;}compact.setAttribute('aria-labelledby',b.id);setKind(modalView,kind);});b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...tabs.children],i=list.indexOf(b),next=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowRight'?1:list.length-1))%list.length;list[next].click();list[next].focus();});tabs.append(b);}
  checkin.append(tabs);const compact=create('div','');compact.id='media-personal-conversation';compact.setAttribute('role','tabpanel');compact.setAttribute('aria-labelledby','media-personal-tab-chat');checkin.append(compact);modal.querySelector('.log-identity').before(checkin);const modalView=panel(compact,'chat');
  const main=create('section','personal-workspace panel glass');main.id='personal-workspace';main.hidden=true;const mainHost=create('div','');main.append(mainHost);document.querySelector('.main-column').append(main);const mainView=panel(mainHost,'chat',{favoriteShortcut:true,onKindChange:kind=>{mainKind=kind;}});
  const sidebar=create('section','nasagpt-sidebar panel glass');sidebar.id='nasagpt-sidebar';
  const legacy=document.getElementById('journal-view');legacy.classList.add('legacy-journal-archive');legacy.before(sidebar);const sidebarView=panel(sidebar,'chat',{favoriteShortcut:true});
  const sidebarTabs=create('div','personal-tabs sidebar-personal-tabs');sidebarTabs.setAttribute('role','tablist');sidebarTabs.setAttribute('aria-label','Sections NasaGPT');
  sidebar.id='nasagpt-sidebar';sidebarView.list.id='sidebar-personal-content';sidebarView.list.setAttribute('role','tabpanel');
  for(const [kind,title] of [['chat','NasaGPT'],['favorites','Favorites'],['scheduler','Scheduled'],['team','Group chat']]){const b=create('button','',title);b.type='button';b.id='sidebar-tab-'+kind;b.dataset.sidebarTab=kind;b.setAttribute('role','tab');b.setAttribute('aria-controls','sidebar-personal-content');b.setAttribute('aria-selected',String(kind==='chat'));b.tabIndex=kind==='chat'?0:-1;b.addEventListener('click',()=>{for(const tab of sidebarTabs.children){tab.setAttribute('aria-selected',String(tab===b));tab.tabIndex=tab===b?0:-1;}sidebarView.list.setAttribute('aria-labelledby',b.id);setKind(sidebarView,kind);});b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=[...sidebarTabs.children],i=list.indexOf(b),next=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowRight'?1:list.length-1))%list.length;list[next].click();list[next].focus();});sidebarTabs.append(b);}
  sidebar.prepend(sidebarTabs);sidebarView.list.setAttribute('aria-labelledby','sidebar-tab-chat');sidebar.querySelector('[data-personal-favorites]').hidden=true;sidebarView.favoriteShortcut=false;
  window.missionProfileName?.attach(sidebar.querySelector('.personal-conversation-heading'));
  window.addEventListener('mission-profile-change',profileChanged);
  window.addEventListener('mission-tasks-change',()=>renderViews('scheduler'));
  window.addEventListener('mission-reminder-messages',()=>void load('chat',false,true));
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
  window.missionCheckin={widget:slider,current:currentReport,selection:()=>{const value=selection();return value?{...value}:null;}};
  window.addEventListener('pageshow',expireSelection);document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)expireSelection();});
  window.missionFavorites={button:star,badge,refresh:favorites};window.missionConversations={render,refreshDiary:()=>load('diary')};
  void prepare().then(()=>load('chat'));render();if(window.missionDiary.active)onOpen();
})();
