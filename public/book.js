(() => {
  const tools=window.missionBookTools,model='embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:text:256:v1';
  const book=document.createElement('section');book.id='mission-book';book.className='mission-book';book.lang='ru';book.hidden=true;
  book.innerHTML=`<header class="book-toolbar" hidden><div><span class="book-eyebrow">PERSONAL ARCHIVE / MISSION HEALTH</span><h2>Архив</h2><p id="book-scope"></p><label class="book-archive-label">История <select id="book-archive-select" aria-label="Выбрать архив"><option value="personal">Мой архив</option><option value="jessica-meir">Прежние записи / Jessica</option><option value="jack-hathaway">Прежние записи / Jack</option><option value="christina-koch">Прежние записи / Christina</option></select></label></div><div class="book-toolbar-actions"><button type="button" id="book-exit" title="Вернуться на мою главную"><span aria-hidden="true">←</span> Выйти из архива</button><button type="button" id="book-write">+ Запись</button><button type="button" id="book-search-open"><span aria-hidden="true">✧</span> NasaGPT</button></div></header>
    <div id="book-demo-banner" class="book-demo-banner" hidden>ПРИМЕР / записи придуманы и не сохраняются <button type="button" id="book-demo-exit">Моя история</button></div>
    <div class="book-stage" id="book-stage"><button type="button" id="book-cover" class="book-cover" aria-label="Открыть архив"><span class="cover-corner top"></span><span class="cover-kicker">MISSION HEALTH</span><img class="cover-nasa" src="assets/nasa-brand/nasa-insignia.png" alt="NASA"><strong>Личная<br>история</strong><span id="book-author">Мой архив</span><span class="cover-rule"></span><span class="cover-caption">НАБЛЮДАТЬ · ЗАПОМИНАТЬ · ВОЗВРАЩАТЬСЯ</span><span class="cover-open">Открыть архив ↗</span><span class="cover-corner bottom"></span></button><div id="book-spread" class="book-spread" tabindex="0" role="region" aria-label="Страницы личной истории" hidden></div></div>
    <nav class="book-navigation" aria-label="Листать книгу"><button type="button" id="book-prev" aria-label="Предыдущие страницы">← Назад</button><span id="book-position" role="status" aria-live="polite">Обложка</span><button type="button" id="book-next" aria-label="Следующие страницы">Далее →</button></nav>
    <div class="book-bottom"><button type="button" id="book-older" hidden>Загрузить ранние записи</button><button type="button" id="book-close-cover">На обложку</button><button type="button" id="book-demo">Посмотреть пример</button><span id="book-notice" role="status"></span></div>`;
  document.querySelector('.main-column').prepend(book);
  const search=document.createElement('dialog');search.id='book-search-dialog';search.className='book-search-dialog';search.lang='ru';
  search.innerHTML=`<header><div><span class="book-eyebrow">ПАМЯТЬ ТВОЕЙ КНИГИ</span><h2>✧ NasaGPT</h2></div><button type="button" data-close-search aria-label="Закрыть NasaGPT">✕</button></header><p class="book-search-intro">Найди момент по смыслу и вернись на нужную страницу.</p><form id="book-search-form"><label for="book-query">Что вспомнить?</label><div class="book-query-row"><input id="book-query" maxlength="1000" placeholder="Когда мне мешал шум во время сна?" required autocomplete="off"><button type="submit" id="book-find">Найти</button></div></form><div class="book-search-prompts"><button type="button" data-book-query="Что мешало мне спать?">Сон</button><button type="button" data-book-query="Как я восстанавливался после тренировки?">Восстановление</button><button type="button" data-book-query="Какие наблюдения я записывал?">Наблюдения</button></div><p id="book-search-status" role="status" aria-live="polite">EmbeddingGemma 2 / поиск по смыслу. При первом запуске загружается текстовая модель, записи обрабатываются на устройстве.</p><button type="button" id="book-search-stop" hidden>Остановить поиск</button><div id="book-search-results"></div><footer>NasaGPT - название поиска в независимом исследовательском прототипе. Результаты ведут к исходным записям. Это не сервис NASA.</footer>`;
  document.body.append(search);
  const editor=document.createElement('dialog');editor.id='book-editor';editor.className='book-editor';editor.lang='ru';
  editor.innerHTML='<form id="book-entry-form"><header><h2>Новая страница</h2><button type="button" id="book-editor-close" aria-label="Закрыть новую запись">✕</button></header><p>Мысли, ощущения и наблюдения. Запись сохранится в выбранном профиле.</p><label for="book-entry-text">Твоя запись</label><textarea id="book-entry-text" rows="9" maxlength="6000" required placeholder="Сегодня я заметил..."></textarea><p id="book-save-status" role="status"></p><button type="submit" id="book-save">Сохранить в архив</button></form>';
  document.body.append(editor);
  const $b=id=>document.getElementById(id),B={profile:null,entries:[],pages:[],index:0,cover:true,hasMore:false,cursor:null,version:0,loading:false,loaded:false,demo:false,name:'Мой архив'};
  let saveId=null,saving=false;
  let worker=null,job=null,searchVersion=0,controller=null,searching=false,turnTimer;
  const demoEntries=[
    {id:'demo-sleep',createdAt:'2026-10-26T07:10:00Z',content:'Сон и тишина\n\nСпал шесть часов. Ночью несколько раз просыпался из-за шума вентилятора. Утром было трудно сосредоточиться. Хочу сравнить самочувствие с более спокойной ночью.'},
    {id:'demo-exercise',createdAt:'2026-10-27T17:30:00Z',content:'После тренировки\n\nЗакончил обычную тренировку на велотренажере. Сделал паузу, выпил воды и записал ощущения. К вечеру усталость стала меньше. Завтра хочу начать с легкой разминки.'},
    {id:'demo-window',createdAt:'2026-10-28T18:20:00Z',content:'Момент у иллюминатора\n\nВыделил несколько минут, чтобы посмотреть на Землю и спокойно записать впечатления. Такие небольшие паузы помогают мне упорядочить мысли. Сохранил этот момент в личной истории.'}
  ];
  const stamp=value=>new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value));
  const profile=()=>$b('book-archive-select').value;
  const visible=()=>state.workspace==='crew'&&state.view==='journal';
  function create(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
  function perSpread(){return $b('book-stage').clientWidth>=580?2:1}
  function note(value){$b('book-notice').textContent=value}
  function pageNode(page,number){
    const article=create('article','book-page');
    article.append(create('div','book-page-running',B.demo?'ПРИМЕР / ВЫМЫШЛЕННАЯ ЗАПИСЬ':'MISSION HEALTH / ЛИЧНЫЙ АРХИВ'));
    if(page){
      const date=create('time','book-page-date',stamp(page.entry.createdAt));date.dateTime=page.entry.createdAt;article.append(date);
      article.append(create('h3','',page.part?'Продолжение':page.content.split(/\n|[.!?]\s/)[0].slice(0,72)||'Наблюдение'));
      if(!page.part&&page.entry.wellbeing&&window.missionFavorites)article.append(window.missionFavorites.badge(page.entry.wellbeing));
      if(!page.part&&!B.demo&&window.missionFavorites)article.append(window.missionFavorites.button(page.entry,'diary',B.profile));
      const lines=page.content.split('\n'),body=!page.part&&lines.length>1&&lines[0].length<=72?lines.slice(1).join('\n').trim():page.content;
      const text=create('div','book-page-text',body);text.dir='auto';article.append(text);
      if(!page.part)for(const media of page.entry.attachments||[]){const node=create(media.kind==='video'?'video':'img','book-media');node.src=media.url;if(media.kind==='video'){node.controls=true;node.playsInline=true;node.preload='metadata';if(media.posterUrl)node.poster=media.posterUrl}else{node.alt=media.region||'Фото из записи';node.loading='lazy'}article.append(node);}
      article.append(create('div','book-page-foot','Личная запись / '+(page.part?'продолжение':'исходный текст')));
    }else{
      article.classList.add('book-page-empty');article.append(create('span','book-empty-orbit','✧'),create('h3','',B.pages.length?'Место для новой истории':'Первая глава впереди'),create('p','',B.pages.length?'Здесь появится следующее наблюдение.':'Запиши, как прошел день. Книга сохранит твои слова, а NasaGPT поможет вернуться к ним.'));
      const add=create('button','','Написать страницу');add.type='button';add.addEventListener('click',openEditor);article.append(add);
    }
    article.append(create('span','book-page-number',String(number).padStart(2,'0')));return article;
  }
  function draw(){
    const spread=$b('book-spread'),count=perSpread();B.index=Math.max(0,Math.min(B.index,Math.max(0,B.pages.length-1)));
    $b('book-cover').hidden=!B.cover;spread.hidden=B.cover;spread.replaceChildren();spread.dataset.pages=count;
    if(!B.cover){spread.append(pageNode(B.pages[B.index],B.index+1));if(count===2)spread.append(pageNode(B.pages[B.index+1],B.index+2));}
    $b('book-position').textContent=B.cover?'Обложка':B.pages.length?'Страницы '+(B.index+1)+(count===2?' / '+(B.index+2):'')+' · записей: '+B.entries.length:'Чистый лист';
    $b('book-prev').disabled=B.cover||B.index===0;$b('book-next').disabled=B.loading||!B.cover&&B.index+count>=B.pages.length;
    $b('book-older').hidden=B.demo||!B.hasMore;$b('book-older').disabled=B.loading;$b('book-demo-banner').hidden=!B.demo;window.missionTraining?.render({visible:visible(),profile:B.profile,demo:B.demo});$b('book-demo').hidden=B.demo;
    $b('book-author').textContent=B.name;$b('book-scope').textContent=(B.profile===personalProfileId?'Твои личные записи':'Твой прежний архив / '+(crew.find(person=>person.id===B.profile)?.name||''))+(B.demo?' / пример':'');
    $b('book-cover').setAttribute('aria-label','Открыть книгу / '+B.name);
  }
  function rebuild(anchor){B.pages=tools.pages(B.entries);if(anchor){const index=B.pages.findIndex(page=>page.entry.id===anchor);if(index>=0)B.index=index}draw()}
  async function load(older=false){
    if(B.loading)return;const version=B.version,id=B.profile;B.loading=true;note('Загружаю историю...');draw();
    try{
      const data=await journalApi('/api/astronauts/'+id+'/book'+(older?'?cursor='+encodeURIComponent(B.cursor):''));if(version!==B.version||B.demo)return;
      const anchor=B.pages[B.index]?.entry.id;B.entries=older?[...B.entries,...data.entries.filter(item=>!B.entries.some(old=>old.id===item.id))]:data.entries;B.hasMore=data.hasMore;B.cursor=data.cursor;B.loaded=true;rebuild(older?anchor:null);note(data.total?'Сохраненных записей: '+data.total:'В книге пока нет записей. Можно написать первую или посмотреть пример.');
    }catch{if(version===B.version)note('История не загрузилась. Нажми «Обновить историю», чтобы повторить.');}
    finally{if(version===B.version){B.loading=false;draw()}}
  }
  function cancelSearch(){++searchVersion;controller?.abort();controller=null;worker?.terminate();worker=null;if(job){clearTimeout(job.timer);job.reject(new DOMException('Остановлено','AbortError'));job=null}searching=false;$b('book-find').disabled=false;$b('book-search-stop').hidden=true;}
  function render(){
    const on=visible();document.body.dataset.book=String(on);book.hidden=!on;
    if(B.profile!==profile()){
      cancelSearch();B.version++;B.profile=profile();B.entries=[];B.pages=[];B.index=0;B.cover=true;B.demo=false;B.loading=false;B.loaded=false;B.hasMore=false;B.cursor=null;saveId=null;$b('book-search-results').replaceChildren();$b('book-query').value='';$b('book-entry-text').value='';editor.close();search.close();
    }
    if(on&&!B.loaded&&!B.loading)void load();if(on)draw();window.missionTraining?.render({visible:on,profile:B.profile,demo:B.demo});
  }
  async function turn(direction){
    if(B.cover){B.cover=false;B.index=0;draw();return}
    const index=B.index+direction*perSpread();if(index<0||index>=B.pages.length)return;
    clearTimeout(turnTimer);const old=$b('book-spread').querySelector(direction>0?'.book-page:last-child':'.book-page:first-child')?.cloneNode(true);B.index=index;draw();if(old){old.classList.add('book-turn-leaf');if(direction<0)old.classList.add('previous');old.setAttribute('aria-hidden','true');$b('book-spread').append(old);turnTimer=setTimeout(()=>old.remove(),520);}
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
    if(!worker){worker=new Worker('/book-vector-worker.js?v=20261029-book2',{type:'module'});worker.onmessage=event=>{const data=event.data;if(!job||data.id!==job.id)return;if(data.type==='progress')status('Загрузка EmbeddingGemma 2: '+Math.round(data.loaded/1e6)+' / '+Math.round(data.total/1e6)+' МБ. Тексты остаются на устройстве.');else if(data.type==='result'||data.type==='error'){const pending=job;job=null;clearTimeout(pending.timer);data.type==='result'?pending.resolve(tools.unit(data.vector)):pending.reject(new Error(data.reason||'embedding_unavailable'))}};worker.onerror=event=>{if(job){clearTimeout(job.timer);job.reject(new Error(event.message||'embedding_unavailable'));job=null}worker?.terminate();worker=null};}
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
    const list=$b('book-search-results');list.replaceChildren();status(caption+(items.length?' / '+items.length+' ближайших записей':' / записей пока нет'));
    const version=searchVersion,id=B.profile;
    let answer;
    if(items.length&&!B.demo){answer=create('div','book-rag-answer','Собираю ответ по найденным записям...');answer.setAttribute('role','status');list.append(answer);}
    for(const entry of items){const card=create('button','book-result');card.type='button';card.append(create('time','',stamp(entry.createdAt)),create('strong','',entry.content.split('\n')[0].slice(0,90)),create('span','',entry.content.slice(0,210)),create('small','','Открыть страницу ↗'));card.addEventListener('click',()=>void openResult(entry));list.append(card)}
    if(answer)try{const data=await journalApi('/api/astronauts/'+id+'/book-answer',{method:'POST',signal:controller?.signal,body:JSON.stringify({query,ids:items.map(item=>item.id).slice(0,6)})});if(version===searchVersion&&id===B.profile)answer.textContent='NasaGPT\n\n'+data.answer;}catch{if(version===searchVersion&&id===B.profile)answer.textContent='Записи найдены по смыслу. Ответ языкового сервиса пока недоступен; можно открыть исходные страницы.';}
  }
  $b('book-search-form').addEventListener('submit',async event=>{
    event.preventDefault();if(searching)return;const query=$b('book-query').value.trim();if(!query)return;
    cancelSearch();const version=searchVersion,id=B.profile,demo=B.demo;controller=new AbortController();const signal=controller.signal,check=()=>{if(version!==searchVersion||B.profile!==id||B.demo!==demo)throw new DOMException('Остановлено','AbortError')};
    searching=true;$b('book-find').disabled=true;$b('book-search-stop').hidden=false;$b('book-search-results').replaceChildren();status('Ищу в памяти книги...');
    try{
      let found=demo?{needsVector:true}:await journalApi('/api/astronauts/'+id+'/book-search',{method:'POST',signal,body:JSON.stringify({query})});check();
      if(!found.needsVector){await results(found.matches,'Векторный поиск / Qdrant',query);return}
      if(!demo&&B.loaded&&!B.entries.length){await results([],'В книге пока нет сохраненных записей',query);return}
      if(demo){
        const entries=[];for(const entry of demoEntries){status('Индексирую пример '+(entries.length+1)+' / '+demoEntries.length);entries.push({...entry,vectors:await entryVectors(entry,check)});check()}
        const queryVector=await embed('task: search result | query: '+query);check();await results(tools.rank(queryVector,entries),'Пример / локальные векторы EmbeddingGemma 2',query);return;
      }
      let indexed=0;
      while(indexed<500){
        const pending=await journalApi('/api/astronauts/'+id+'/book-index',{signal});check();if(!pending.entries.length)break;
        for(const entry of pending.entries){check();status('Готовлю векторную память / запись '+(indexed+1));const vectors=await entryVectors(entry,check);check();await journalApi('/api/astronauts/'+id+'/book-vectors',{method:'POST',signal,body:JSON.stringify({id:entry.id,model,vectors})});indexed++;if(indexed>=500)break;}
      }
      status('Сравниваю смысл запроса и страниц...');const vector=await embed('task: search result | query: '+query);check();
      found=await journalApi('/api/astronauts/'+id+'/book-search',{method:'POST',signal,body:JSON.stringify({query,model,vector})});check();await results(found.matches,'Векторный поиск / '+found.searchedCount+' записей из последних '+found.limit,query);
    }catch(error){if(error.name!=='AbortError')console.warn('NasaGPT:',error.name);if(error.name!=='AbortError'&&version===searchVersion)status('Не удалось запустить векторный поиск. История сохранена. Проверь сеть для первой загрузки модели или повтори на устройстве с WebGPU.');}
    finally{if(version===searchVersion){searching=false;$b('book-find').disabled=false;$b('book-search-stop').hidden=true;}}
  });
  $b('book-entry-text').addEventListener('input',()=>{if(!saving)saveId=null});
  $b('book-entry-form').addEventListener('submit',async event=>{
    event.preventDefault();const content=$b('book-entry-text').value.trim();if(!content||saving)return;saving=true;saveId||=crypto.randomUUID();const id=B.profile,version=B.version,button=$b('book-save');button.disabled=true;$b('book-entry-text').disabled=true;
    try{await journalApi('/api/astronauts/'+id+'/messages',{method:'POST',body:JSON.stringify({id:saveId,content,mode:'diary',language:'ru',attachments:[],wellbeing:window.missionCheckin?.current()||null})});if(version!==B.version)return;void window.missionActivity?.refresh();editor.close();saveId=null;$b('book-entry-text').value='';B.demo=false;B.loading=false;await load();B.cover=false;B.index=Math.max(0,B.pages.length-perSpread());draw();void loadJournal();}
    catch{if(version===B.version)$b('book-save-status').textContent='Не удалось сохранить. Текст остается здесь, попробуй еще раз.';}finally{saving=false;button.disabled=false;$b('book-entry-text').disabled=false}
  });
  $b('book-archive-select').addEventListener('change',render);
  $b('book-cover').addEventListener('click',()=>turn(1));$b('book-next').addEventListener('click',()=>turn(1));$b('book-prev').addEventListener('click',()=>turn(-1));
  $b('book-close-cover').addEventListener('click',()=>{B.cover=true;draw()});$b('book-write').addEventListener('click',openEditor);$b('book-exit').addEventListener('click',exitBook);
  $b('book-older').addEventListener('click',()=>void load(true));$b('book-editor-close').addEventListener('click',()=>editor.close());
  $b('book-search-open').addEventListener('click',()=>{search.showModal();$b('book-query').focus()});search.querySelector('[data-close-search]').addEventListener('click',()=>search.close());
  $b('book-search-stop').addEventListener('click',()=>{cancelSearch();status('Поиск остановлен. Записи сохранены.')});search.addEventListener('close',()=>{if(searching){cancelSearch();status('Поиск остановлен. Записи сохранены.')}});
  search.querySelectorAll('[data-book-query]').forEach(button=>button.addEventListener('click',()=>{$b('book-query').value=button.dataset.bookQuery;$b('book-search-form').requestSubmit()}));
  $b('book-demo').addEventListener('click',()=>{cancelSearch();B.demo=true;B.entries=demoEntries.map(entry=>({...entry}));B.index=0;B.cover=false;rebuild();note('Пример показывает оформление. Эти записи не относятся к тебе или астронавтам.')});
  $b('book-demo-exit').addEventListener('click',()=>{cancelSearch();B.demo=false;B.entries=[];B.pages=[];B.cover=true;B.loaded=false;void load()});
  const refresh=create('button','','Обновить историю');refresh.type='button';refresh.id='book-refresh';refresh.addEventListener('click',()=>{cancelSearch();B.demo=false;void load()});$b('book-notice').before(refresh);
  $b('book-spread').addEventListener('keydown',event=>{if(event.target!==$b('book-spread'))return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();void turn(event.key==='ArrowRight'?1:-1)}});
  let touch; $b('book-spread').addEventListener('pointerdown',event=>{if(event.target.closest('button,video,a'))return;touch={x:event.clientX,y:event.clientY};});$b('book-spread').addEventListener('pointerup',event=>{if(!touch)return;const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=null;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5)void turn(dx<0?1:-1)});$b('book-spread').addEventListener('pointercancel',()=>touch=null);
  new ResizeObserver(()=>{if(visible())draw()}).observe($b('book-stage'));
  window.addEventListener('pagehide',cancelSearch);
  window.missionBook={render,refresh:()=>{if(visible()&&!B.demo)void load()}};render();
  if(new URLSearchParams(location.search).get('book')==='1')window.missionDesign.navigate('archive');
})();
