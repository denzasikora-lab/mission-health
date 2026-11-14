(() => {
  const tools=window.missionBookTools,model='embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:text:256:v1';
  const book=document.createElement('section');book.id='mission-book';book.className='mission-book';book.lang='en';book.hidden=true;
  book.innerHTML=`<header class="book-toolbar" hidden><div><span class="book-eyebrow">PERSONAL ARCHIVE / MISSION HEALTH</span><h2>Archive</h2><p id="book-scope"></p><label class="book-archive-label">History <select id="book-archive-select" aria-label="Choose archive"><option value="personal">My archive</option><option value="jessica-meir">Earlier entries / Jessica</option><option value="jack-hathaway">Earlier entries / Jack</option><option value="christina-koch">Earlier entries / Christina</option></select></label></div><div class="book-toolbar-actions"><button type="button" id="book-exit" title="Return to my home page"><span aria-hidden="true">←</span> Leave archive</button><button type="button" id="book-write">+ Recording</button><button type="button" id="book-search-open"><span aria-hidden="true">✧</span> NasaGPT</button></div></header>
    <div id="book-demo-banner" class="book-demo-banner" hidden>SAMPLE / fictional entries that are not saved <button type="button" id="book-demo-exit">My history</button></div>
    <div class="book-stage" id="book-stage"><button type="button" id="book-cover" class="book-cover" aria-label="Open archive"><span class="cover-corner top"></span><span class="cover-kicker">MISSION HEALTH</span><img class="cover-nasa" src="assets/nasa-brand/nasa-insignia.png" alt="NASA"><strong>Personal<br>history</strong><span id="book-author">My archive</span><span class="cover-rule"></span><span class="cover-caption">OBSERVE · REMEMBER · RETURN</span><span class="cover-open">Open archive ↗</span><span class="cover-corner bottom"></span></button><div id="book-spread" class="book-spread" tabindex="0" role="region" aria-label="Pages of personal history" hidden></div></div>
    <nav class="book-navigation" aria-label="Browse book" hidden><button type="button" id="book-prev" aria-label="Previous pages">← Back</button><span id="book-position" role="status" aria-live="polite">Cover</span><button type="button" id="book-next" aria-label="Next pages">Next →</button></nav>
    <div class="book-bottom" hidden><button type="button" id="book-older" hidden>Load earlier entries</button><button type="button" id="book-close-cover">Back to cover</button><button type="button" id="book-demo">View sample</button><span id="book-notice" role="status"></span></div>`;
  document.querySelector('.main-column').prepend(book);
  const search=document.createElement('dialog');search.id='book-search-dialog';search.className='book-search-dialog';search.lang='en';
  search.innerHTML=`<header><div><span class="book-eyebrow">YOUR BOOK’S MEMORY</span><h2>✧ NasaGPT</h2></div><button type="button" data-close-search aria-label="Close NasaGPT">✕</button></header><p class="book-search-intro">Find a moment by meaning and return to its page.</p><form id="book-search-form"><label for="book-query">What would you like to recall?</label><div class="book-query-row"><input id="book-query" maxlength="1000" placeholder="When did noise disturb my sleep?" required autocomplete="off"><button type="submit" id="book-find">Find</button></div></form><div class="book-search-prompts"><button type="button" data-book-query="What disturbed my sleep?">Sleep</button><button type="button" data-book-query="How did I recover after exercise?">Recovery</button><button type="button" data-book-query="What observations did I record?">Observations</button></div><p id="book-search-status" role="status" aria-live="polite">Ready to search saved entries.</p><button type="button" id="book-search-stop" hidden>Stop search</button><div id="book-search-results"></div><footer>NasaGPT - search feature name in an independent research prototype. Results link to original entries. This is not a service from NASA.</footer>`;
  document.body.append(search);
  const editor=document.createElement('dialog');editor.id='book-editor';editor.className='book-editor';editor.lang='en';
  editor.innerHTML='<form id="book-entry-form"><header><h2>New page</h2><button type="button" id="book-editor-close" aria-label="Close new entry">✕</button></header><p>Thoughts, feelings and observations. Recording saved in the selected profile.</p><label for="book-entry-text">Your entry</label><textarea id="book-entry-text" rows="9" maxlength="6000" required placeholder="Today I noticed..."></textarea><p id="book-save-status" role="status"></p><button type="submit" id="book-save">Save to archive</button></form>';
  document.body.append(editor);
  const $b=id=>document.getElementById(id),B={profile:null,entries:[],samples:[],snapshot:null,pages:[],index:0,cover:true,hasMore:false,cursor:null,version:0,loading:false,loaded:false,demo:false,name:'My archive'};
  const searchActions=create('div','book-search-actions'),searchLaunch=$b('book-search-open');
  searchLaunch.textContent='Search archive';searchLaunch.setAttribute('aria-controls',search.id);searchLaunch.setAttribute('aria-haspopup','dialog');searchActions.append(searchLaunch);$b('book-stage').before(searchActions);
  let saveId=null,saving=false;
  let worker=null,job=null,searchVersion=0,controller=null,searching=false,turnTimer,resizeTimer,layoutSignature='',preloadTask;
  for(const id of ['book-position','book-notice']){const status=$b(id);status.className='sr-only';$b('book-stage').before(status);}
  $b('book-spread').setAttribute('aria-description','Right half of the page - next, left - back. Swipe or use keyboard arrows to turn pages.');
  const demoEntries=[
    {id:'demo-sleep',createdAt:'2026-10-26T07:10:00Z',content:'Sleep and quiet\n\nI slept for six hours. I woke up several times because of-the fan noise. It was hard to concentrate in the morning. I want to compare how I feel after a quieter night.'},
    {id:'demo-exercise',createdAt:'2026-10-27T17:30:00Z',content:'After exercise\n\nI finished my usual exercise bike workout. I took a break, drank water and recorded how I felt. By evening I felt less tired. Tomorrow I want to start with a gentle warm-up.'},
    {id:'demo-window',createdAt:'2026-10-28T18:20:00Z',content:'A moment at the window\n\nI took a few minutes, to look at Earth and calmly write down my impressions. These short breaks help me organize my thoughts. I saved this moment in my personal history.'}
  ];
  const stamp=value=>new Intl.DateTimeFormat('en',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value));
  const profile=()=>$b('book-archive-select').value;
  const visible=()=>state.workspace==='crew'&&state.view==='journal';
  function create(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
  function perSpread(){return $b('book-stage').clientWidth>=760?2:1}
  function note(value){$b('book-notice').textContent=value}
  function pauseMedia(){for(const node of $b('book-spread').querySelectorAll('audio,video'))node.pause();}
  function pageNode(page,number,measuring=false){
    const article=create('article','book-page');
    const display=page?.presentation,extra=page?.entry.archiveSample||page?.entry.archiveCurrent;
    if(display?.structured)article.classList.add('book-page-structured');
    article.append(create('div','book-page-running',page?.entry.preflight?'PREFLIGHT / SIMULATED RECORD':page?.entry.archiveSample?'PRELOADED RECORDING / TECHNICAL SAMPLE':page?.entry.archiveCurrent?'MISSION HEALTH / CURRENT RESULTS':B.demo?'SAMPLE / FICTIONAL ENTRY':'MISSION HEALTH / PERSONAL ARCHIVE'));
    if(page){
      const date=create('time','book-page-date',stamp(page.entry.createdAt));date.dateTime=page.entry.createdAt;article.append(date);
      const lines=page.content.split('\n'),hasHeading=!page.part&&lines.length>1&&lines[0].trim().length>0&&lines[0].length<=72;
      article.append(create('h3','',page.part?'Continued':display?.title|| (hasHeading?lines[0]:'Recording')));
      if(!page.part&&page.entry.wellbeing&&!extra&&window.missionFavorites)article.append(window.missionFavorites.badge(page.entry.wellbeing));
      if(!page.part&&!B.demo&&!extra&&window.missionFavorites)article.append(window.missionFavorites.button(page.entry,'diary',B.profile));
      if(!page.part&&display?.media){
        const media=display.media,node=create(measuring?'div':media.kind,'book-media book-observation-media');
        if(measuring)node.style.height=media.kind==='audio'?'54px':'210px';else{node.src=media.url;node.controls=true;node.preload='metadata';if(media.kind==='video'){node.playsInline=true;if(media.poster)node.poster=media.poster;}node.setAttribute('aria-label',media.kind==='video'?'Video observation recording':'Audio observation recording');}
        article.append(node);
      }
      const body=hasHeading?lines.slice(1).join('\n').trim():page.content;
      const text=create('div','book-page-text');text.dir='auto';if(display?.structured&&window.missionArchiveContent)window.missionArchiveContent.renderText(text,body,create);else text.textContent=body;article.append(text);
      if(!page.part&&!display?.media)for(const media of page.entry.attachments||[]){const node=create(measuring?'div':media.kind==='video'?'video':'img','book-media');if(measuring)node.style.height='210px';else{node.src=media.url;if(media.kind==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';if(media.posterUrl)node.poster=media.posterUrl}else{node.alt=media.region||'Photo from entry';node.loading='lazy'}}article.append(node);}
      article.append(create('div','book-page-foot',page.entry.preflight?'Preflight rehearsal / simulated data':page.entry.archiveSample?'Technical sample / not personal data':page.entry.archiveCurrent?'Personal results / without demonstration readings':'Personal entry / '+(page.part?'continued':'original text')));
    }else{
      article.classList.add('book-page-empty');article.append(create('span','book-empty-orbit','✧'),create('h3','',B.pages.length?'Room for a new story':'Your first chapter is ahead'),create('p','',B.pages.length?'Your next observation will appear here.':'Write down, how your day went. The book will preserve your words, and NasaGPT will help you return to them.'));
      const add=create('button','','Write a page');add.type='button';add.addEventListener('click',openEditor);article.append(add);
    }
    article.append(create('span','book-page-number',String(number).padStart(2,'0')));return article;
  }
  function draw(){
    const spread=$b('book-spread'),count=perSpread();B.index=Math.max(0,Math.min(B.index,Math.max(0,B.pages.length-1)));
    $b('book-cover').hidden=!B.cover;spread.hidden=B.cover;pauseMedia();spread.replaceChildren();spread.dataset.pages=count;
    if(!B.cover){spread.append(pageNode(B.pages[B.index],B.index+1));if(count===2)spread.append(pageNode(B.pages[B.index+1],B.index+2));}
    $b('book-position').textContent=B.cover?'Cover':B.pages.length?'Pages '+(B.index+1)+(count===2?' / '+(B.index+2):'')+' · entries: '+B.entries.length:'Blank page';
    $b('book-prev').disabled=B.cover||B.index===0;$b('book-next').disabled=B.loading||!B.cover&&B.index+count>=B.pages.length;
    $b('book-older').hidden=B.demo||!B.hasMore;$b('book-older').disabled=B.loading;$b('book-demo-banner').hidden=!B.demo;window.missionTraining?.render({visible:visible(),profile:B.profile,demo:B.demo});$b('book-demo').hidden=B.demo;
    $b('book-author').textContent=B.name;$b('book-scope').textContent=(B.profile===personalProfileId?'Your personal entries':'Your earlier archive / '+(crew.find(person=>person.id===B.profile)?.name||''))+(B.demo?' / sample':'');
    $b('book-cover').setAttribute('aria-label','Open book / '+B.name);
  }
  function pageLayout(){
    const stage=$b('book-stage'),style=window.getComputedStyle(stage),width=Math.max(220,stage.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)),count=perSpread(),height=Math.max(440,Math.min(650,Math.round(window.innerHeight*.74)||560));
    return {width:Math.max(180,Math.min(width,count===2?1100:620)/count),height,key:[Math.round(width),count,height].join(':')};
  }
  function paginate(){
    const layout=pageLayout(),stage=$b('book-stage');layoutSignature=layout.key;stage.style.setProperty('--book-page-height',layout.height+'px');
    const measure=create('div','book-measure');measure.style.width=layout.width+'px';measure.setAttribute('aria-hidden','true');stage.append(measure);
    const pages=[],capacity=Math.max(240,Math.floor((layout.width-50)/8)*Math.floor((layout.height-190)/24));
    try{
      const personal=[...B.entries].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)),entries=B.demo?personal:[...B.samples,...(B.snapshot?[B.snapshot]:[]),...personal];
      for(const entry of entries){
        const presentation=window.missionArchiveContent?.presentation(entry),pending=tools.chunks(presentation?.content??entry.content,capacity);let part=0,offset=0;
        while(pending.length){
          let content=pending.shift();const trailing=window.missionArchiveContent?.splitTrailingHeading(content);
          if(trailing&&pending.length){const next=trailing.heading+'\n'+pending.shift();if(trailing.body){content=trailing.body;pending.unshift(next);}else content=next;}
          const page={entry,content,part,offset,presentation};
          const fits=value=>{const node=pageNode({...page,content:value},pages.length+1,true);node.style.minHeight='0';measure.replaceChildren(node);return node.getBoundingClientRect().height<=layout.height;};
          if(content.length>80&&!fits(content)){
            const chars=Array.from(content);let low=1,high=chars.length;
            while(low<high){const middle=Math.ceil((low+high)/2);if(fits(chars.slice(0,middle).join('')))low=middle;else high=middle-1;}
            // Media may exceed the page height: short text remains with it without clipping.
            const limit=low<80&&!fits('')?Math.min(chars.length,160):low,prefix=chars.slice(0,limit).join(''),space=Math.max(prefix.lastIndexOf(' '),prefix.lastIndexOf('\n'));let cut=space>prefix.length*.65?space:prefix.length;
            const orphan=window.missionArchiveContent?.splitTrailingHeading(content.slice(0,cut));if(orphan?.body)cut=orphan.body.length;
            const first=prefix.slice(0,cut).trimEnd(),rest=content.slice(cut).trimStart();page.content=first;if(rest)pending.unshift(rest);
          }
          pages.push(page);offset+=page.content.length;part++;
        }
      }
    }finally{measure.remove();}
    return pages;
  }
  function rebuild(anchor){
    B.pages=paginate();
    if(anchor){const id=typeof anchor==='string'?anchor:anchor.id,offset=typeof anchor==='string'?0:anchor.offset;let index=B.pages.findIndex(page=>page.entry.id===id);if(index>=0){while(index+1<B.pages.length&&B.pages[index+1].entry.id===id&&B.pages[index+1].offset<=offset)index++;B.index=index;}}
    draw();
  }
  async function preload(){
    if(!preloadTask)preloadTask=fetch('/data/archive-preload.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error('preload_unavailable');return response.json();}).then(data=>data?.version===1&&Array.isArray(data.items)?data.items.filter(item=>item?.archiveSample===true&&typeof item.id==='string'&&Number.isFinite(Date.parse(item.createdAt))&&window.missionArchiveContent?.observation(item)).slice(0,2):[]).catch(()=>[]);
    return preloadTask;
  }
  async function personalExtras(entries){
    const helper=window.missionArchiveContent;if(!helper||B.profile!==personalProfileId)return {samples:[],snapshot:null};
    const [samples,identity,wearable]=await Promise.all([preload(),journalApi('/api/me').catch(()=>null),journalApi('/api/actiwatch').catch(()=>null)]);
    const identified=/^[a-f0-9]{64}$/i.test(identity?.storageScope||'');if(identified)window.missionAppearance?.setIdentity({storageScope:identity.storageScope,name:'Cdr. Sara Khan'});
    const visual=helper.captureVisual(identified?document:{querySelectorAll:()=>[]},entries),wellbeing=identified?window.missionCheckin?.current()||null:null;
    return {samples,snapshot:helper.currentEntry(entries,{visual,wellbeing,wearable:identified?wearable:null})};
  }
  async function load(older=false,preferredAnchor=null){
    if(B.loading)return;const version=B.version,id=B.profile;B.loading=true;note('Loading history...');draw();
    try{
      const data=await journalApi('/api/astronauts/'+id+'/book'+(older?'?cursor='+encodeURIComponent(B.cursor):''));if(version!==B.version||B.demo)return;
      const current=B.pages[B.index],anchor=preferredAnchor||(current?{id:current.entry.id,offset:current.offset}:null),entries=older?[...B.entries,...data.entries.filter(item=>!B.entries.some(old=>old.id===item.id))]:data.entries,extras=await personalExtras(entries);if(version!==B.version||B.demo)return;
      B.entries=entries;B.samples=entries.length?[]:extras.samples;B.snapshot=extras.snapshot;B.hasMore=data.hasMore;B.cursor=data.cursor;B.loaded=true;rebuild(older?anchor:null);note(data.total?'Saved personal entries: '+data.total:'Preloaded video and audio are available. No personal entries yet.');
    }catch{if(version===B.version)note('History failed to load. Open the section «Archive» again, to retry.');}
    finally{if(version===B.version){B.loading=false;draw()}}
  }
  function cancelSearch(){++searchVersion;controller?.abort();controller=null;worker?.terminate();worker=null;if(job){clearTimeout(job.timer);job.reject(new DOMException('Stopped','AbortError'));job=null}searching=false;$b('book-find').disabled=false;$b('book-search-stop').hidden=true;}
  function render(){
    const on=visible();document.body.dataset.book=String(on);book.hidden=!on;if(!on)pauseMedia();
    if(B.profile!==profile()){
      cancelSearch();B.version++;B.profile=profile();B.entries=[];B.samples=[];B.snapshot=null;B.pages=[];B.index=0;B.cover=true;B.demo=false;B.loading=false;B.loaded=false;B.hasMore=false;B.cursor=null;saveId=null;$b('book-search-results').replaceChildren();$b('book-query').value='';$b('book-entry-text').value='';editor.close();search.close();
    }
    if(on&&!B.loaded&&!B.loading)void load();if(on)draw();window.missionTraining?.render({visible:on,profile:B.profile,demo:B.demo});
  }
  async function turn(direction){
    if(B.cover){B.cover=false;B.index=0;draw();return}
    const firstPersonal=B.pages.findIndex(page=>!page.entry.archiveSample&&!page.entry.archiveCurrent),version=B.version;
    if(direction<0&&firstPersonal>=0&&B.index<=firstPersonal&&B.index+perSpread()>firstPersonal&&B.hasMore&&!B.demo&&!B.loading)await load(true,{id:B.pages[firstPersonal].entry.id,offset:0});
    if(version!==B.version)return;
    const index=B.index+direction*perSpread();if(index<0||index>=B.pages.length)return;
    clearTimeout(turnTimer);$b('book-spread').querySelectorAll('.book-turn-leaf').forEach(node=>node.remove());const old=$b('book-spread').querySelector(direction>0?'.book-page:last-child':'.book-page:first-child')?.cloneNode(true);B.index=index;draw();if(old){old.classList.add('book-turn-leaf');if(direction<0)old.classList.add('previous');old.setAttribute('aria-hidden','true');$b('book-spread').append(old);turnTimer=setTimeout(()=>old.remove(),520);}
  }
  function openEditor(){editor.showModal();$b('book-entry-text').focus();}
  function exitBook(){
    const url=new URL(window.location.href);
    if(url.searchParams.get('book')==='1'){url.searchParams.delete('book');window.history.replaceState(window.history.state,'',url);}
    cancelSearch();if(search.open)search.close();if(editor.open)editor.close();
    window.missionDesign.navigate('overview');window.scrollTo({top:0,behavior:'auto'});
    const target=document.querySelector('.stories-row .story-person>button')||document.querySelector('[data-mission-nav="archive"]');target?.focus({preventScroll:true});
  }
  function status(text){$b('book-search-status').textContent=text}
  function embed(text){
    if(!worker){worker=new Worker('/book-vector-worker.js?v=20261029-book2',{type:'module'});worker.onmessage=event=>{const data=event.data;if(!job||data.id!==job.id)return;if(data.type==='progress')status('Loading EmbeddingGemma 2: '+Math.round(data.loaded/1e6)+' / '+Math.round(data.total/1e6)+' MB. Texts remain on your device.');else if(data.type==='result'||data.type==='error'){const pending=job;job=null;clearTimeout(pending.timer);data.type==='result'?pending.resolve(tools.unit(data.vector)):pending.reject(new Error(data.reason||'embedding_unavailable'))}};worker.onerror=event=>{if(job){clearTimeout(job.timer);job.reject(new Error(event.message||'embedding_unavailable'));job=null}worker?.terminate();worker=null};}
    return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{worker?.terminate();worker=null;job=null;reject(new Error('embedding_timeout'))},240000);job={id,resolve,reject,timer};worker.postMessage({id,text})});
  }
  async function entryVectors(entry,check){
    const values=[];for(const chunk of tools.chunks(entry.content,1000).slice(0,8)){check();values.push(await embed('title: Journal '+entry.createdAt+' | text: '+chunk));}return values;
  }
  async function openResult(entry){
    if(!B.entries.some(item=>item.id===entry.id)){B.entries.push(entry);rebuild()}
    B.index=Math.max(0,B.pages.findIndex(page=>page.entry.id===entry.id));B.cover=false;draw();search.close();$b('book-spread').focus();
  }
  async function results(items,caption,query){
    const list=$b('book-search-results');list.replaceChildren();status(caption+(items.length?' / '+items.length+' closest entries':' / no entries yet'));
    const version=searchVersion,id=B.profile;
    let answer;
    if(items.length&&!B.demo){answer=create('div','book-rag-answer','Building an answer from retrieved entries...');answer.setAttribute('role','status');list.append(answer);}
    for(const entry of items){const display=window.missionArchiveContent?.presentation(entry),content=display?.content||entry.content,card=create('button','book-result');card.type='button';card.append(create('time','',stamp(entry.createdAt)),create('strong','',display?.title||content.split('\n')[0].slice(0,90)),create('span','',content.slice(0,210)),create('small','','Open page ↗'));card.addEventListener('click',()=>void openResult(entry));list.append(card)}
    if(answer)try{const data=await journalApi('/api/astronauts/'+id+'/book-answer',{method:'POST',signal:controller?.signal,body:JSON.stringify({query,ids:items.map(item=>item.id).slice(0,6)})});if(version===searchVersion&&id===B.profile)answer.textContent='NasaGPT\n\n'+String(data.answer).replace(/\*\*/g,'');}catch{if(version===searchVersion&&id===B.profile)answer.textContent='Recordings found by meaning. Language service response is unavailable; you can open the original pages.';}
  }
  $b('book-search-form').addEventListener('submit',async event=>{
    event.preventDefault();if(searching)return;const query=$b('book-query').value.trim();if(!query)return;
    cancelSearch();const version=searchVersion,id=B.profile,demo=B.demo;controller=new AbortController();const signal=controller.signal,check=()=>{if(version!==searchVersion||B.profile!==id||B.demo!==demo)throw new DOMException('Stopped','AbortError')};
    searching=true;$b('book-find').disabled=true;$b('book-search-stop').hidden=false;$b('book-search-results').replaceChildren();status('Searching book memory...');
    try{
      let found=demo?{needsVector:true}:await journalApi('/api/astronauts/'+id+'/book-search',{method:'POST',signal,body:JSON.stringify({query})});check();
      if(!found.needsVector){await results(found.matches,'Vector search / Qdrant',query);return}
      if(!demo&&B.loaded&&!B.entries.length){await results([],'The book has no saved entries yet',query);return}
      if(demo){
        const entries=[];for(const entry of demoEntries){status('Indexing sample '+(entries.length+1)+' / '+demoEntries.length);entries.push({...entry,vectors:await entryVectors(entry,check)});check()}
        const queryVector=await embed('task: search result | query: '+query);check();await results(tools.rank(queryVector,entries),'Sample / local vectors EmbeddingGemma 2',query);return;
      }
      let indexed=0;
      while(indexed<500){
        const pending=await journalApi('/api/astronauts/'+id+'/book-index',{signal});check();if(!pending.entries.length)break;
        for(const entry of pending.entries){check();status('Preparing vector memory / recording '+(indexed+1));const vectors=await entryVectors(entry,check);check();await journalApi('/api/astronauts/'+id+'/book-vectors',{method:'POST',signal,body:JSON.stringify({id:entry.id,model,vectors})});indexed++;if(indexed>=500)break;}
      }
      status('Comparing the meaning of your query and pages...');const vector=await embed('task: search result | query: '+query);check();
      found=await journalApi('/api/astronauts/'+id+'/book-search',{method:'POST',signal,body:JSON.stringify({query,model,vector})});check();await results(found.matches,'Vector search / '+found.searchedCount+' entries from the latest '+found.limit,query);
    }catch(error){if(error.name!=='AbortError')console.warn('NasaGPT:',error.name);if(error.name!=='AbortError'&&version===searchVersion)status('Could not start vector search. History is saved. Check the network for the initial model download or retry on a device with WebGPU.');}
    finally{if(version===searchVersion){searching=false;$b('book-find').disabled=false;$b('book-search-stop').hidden=true;}}
  });
  $b('book-entry-text').addEventListener('input',()=>{if(!saving)saveId=null});
  $b('book-entry-form').addEventListener('submit',async event=>{
    event.preventDefault();const content=$b('book-entry-text').value.trim();if(!content||saving)return;saving=true;saveId||=crypto.randomUUID();const id=B.profile,version=B.version,button=$b('book-save');button.disabled=true;$b('book-entry-text').disabled=true;
    try{await journalApi('/api/astronauts/'+id+'/messages',{method:'POST',body:JSON.stringify({id:saveId,content,mode:'diary',language:typeof state!=='undefined'&&state.language==='ur'?'ur':'en',attachments:[],wellbeing:window.missionCheckin?.current()||null})});if(version!==B.version)return;void window.missionActivity?.refresh();editor.close();saveId=null;$b('book-entry-text').value='';B.demo=false;B.loading=false;await load();B.cover=false;B.index=Math.max(0,B.pages.length-perSpread());draw();void loadJournal();}
    catch{if(version===B.version)$b('book-save-status').textContent='Could not save. Your text remains here, try again.';}finally{saving=false;button.disabled=false;$b('book-entry-text').disabled=false}
  });
  $b('book-archive-select').addEventListener('change',render);
  $b('book-cover').addEventListener('click',()=>turn(1));$b('book-next').addEventListener('click',()=>turn(1));$b('book-prev').addEventListener('click',()=>turn(-1));
  $b('book-close-cover').addEventListener('click',()=>{B.cover=true;draw()});$b('book-write').addEventListener('click',openEditor);$b('book-exit').addEventListener('click',exitBook);
  $b('book-older').addEventListener('click',()=>void load(true));$b('book-editor-close').addEventListener('click',()=>editor.close());
  $b('book-search-open').addEventListener('click',()=>{search.showModal();$b('book-query').focus()});search.querySelector('[data-close-search]').addEventListener('click',()=>search.close());
  $b('book-search-stop').addEventListener('click',()=>{cancelSearch();status('Search stopped. Recordings saved.')});search.addEventListener('close',()=>{if(searching){cancelSearch();status('Search stopped. Recordings saved.')}});
  search.querySelectorAll('[data-book-query]').forEach(button=>button.addEventListener('click',()=>{$b('book-query').value=button.dataset.bookQuery;$b('book-search-form').requestSubmit()}));
  $b('book-demo').addEventListener('click',()=>{cancelSearch();B.demo=true;B.entries=demoEntries.map(entry=>({...entry}));B.index=0;B.cover=false;rebuild();note('The sample demonstrates the layout. These entries do not describe you or the astronauts.')});
  $b('book-demo-exit').addEventListener('click',()=>{cancelSearch();B.demo=false;B.entries=[];B.pages=[];B.cover=true;B.loaded=false;void load()});
  const refresh=create('button','','Refresh history');refresh.type='button';refresh.id='book-refresh';refresh.addEventListener('click',()=>{cancelSearch();B.demo=false;void load()});$b('book-demo').before(refresh);
  $b('book-spread').addEventListener('keydown',event=>{if(event.target!==$b('book-spread'))return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();void turn(event.key==='ArrowRight'?1:-1)}});
  const spread=$b('book-spread'),interactive=target=>target.closest('button,a,input,textarea,select,video,audio,summary,label,[contenteditable]');
  const selecting=()=>{const selection=window.getSelection?.();return selection&&!selection.isCollapsed&&(spread.contains(selection.anchorNode)||spread.contains(selection.focusNode));};
  let touch;
  function releaseTouch(){const current=touch;touch=null;if(current&&spread.hasPointerCapture?.(current.id))spread.releasePointerCapture(current.id);return current;}
  spread.addEventListener('pointerdown',event=>{
    if(event.isPrimary===false||event.button!==undefined&&event.button!==0||interactive(event.target)||selecting())return;
    touch={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
    if(event.pointerType!=='mouse')spread.setPointerCapture?.(event.pointerId);
  });
  spread.addEventListener('pointermove',event=>{if(!touch||event.pointerId!==touch.id)return;const dx=Math.abs(event.clientX-touch.x),dy=Math.abs(event.clientY-touch.y);if(dy>10&&dy>dx*1.1)releaseTouch();});
  spread.addEventListener('pointerup',event=>{
    if(!touch||event.pointerId!==touch.id)return;const start=releaseTouch();if(interactive(event.target)||selecting())return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y,width=spread.getBoundingClientRect().width,threshold=Math.max(28,Math.min(50,width*.09));
    if(Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.3){event.preventDefault();void turn(dx<0?1:-1);}
    else if(Math.hypot(dx,dy)<=10&&performance.now()-start.time<500){const bounds=spread.getBoundingClientRect();void turn(event.clientX-bounds.left>=bounds.width/2?1:-1);}
  });
  spread.addEventListener('pointercancel',releaseTouch);spread.addEventListener('lostpointercapture',()=>touch=null);
  function resizePages(){if(!visible())return;if(pageLayout().key!==layoutSignature){const current=B.pages[B.index];rebuild(current?{id:current.entry.id,offset:current.offset}:null)}else draw();}
  new ResizeObserver(resizePages).observe($b('book-stage'));window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resizePages,80);});
  window.addEventListener('pagehide',()=>{cancelSearch();pauseMedia();});
  window.missionBook={render,refresh:()=>{if(visible()&&!B.demo)void load()}};render();
  if(new URLSearchParams(location.search).get('book')==='1')window.missionDesign.navigate('archive');
})();
