(() => {
  const node=document.createElement('section');node.className='book-training';node.id='book-training';
  node.innerHTML='<div class="training-icon" aria-hidden="true">✧</div><div><span class="book-eyebrow">СЛЕДУЮЩАЯ ГЛАВА / LoRA</span><h3>Модель, которая учится на твоих записях</h3><p>Локальное обучение стиля дневника. Результат - отдельный LoRA-адаптер для проверки.</p><span id="training-summary" role="status">Проверяю накопленные записи...</span></div><button type="button" id="training-review">Запустить fine-tuning ↗</button><div id="training-progress" hidden><progress id="training-meter" max="200" value="0"></progress><p id="training-job-status"></p><button type="button" id="training-cancel" hidden>Остановить обучение</button></div>';
  document.getElementById('mission-book').append(node);
  const dialog=document.createElement('dialog');dialog.id='training-dialog';dialog.className='book-editor';dialog.lang='ru';
  dialog.innerHTML='<header><h2>Подготовка LoRA</h2><button type="button" id="training-close" aria-label="Закрыть подготовку LoRA">✕</button></header><p>В обучение попадут твои текстовые записи из выбранного профиля длиной от 80 символов. Для первого запуска нужно минимум 20 записей.</p><dl><div><dt>Данные</dt><dd id="training-data-count">-</dd></div><div><dt>Вычисления</dt><dd id="training-connection">-</dd></div><div><dt>Задание</dt><dd>200 шагов / LoRA / проверочная выборка 10%</dd></div></dl><p>Это длительная операция на локальной машине. Прогресс сохраняется, обучение продолжится после закрытия окна.</p><label class="training-consent"><input id="training-consent" type="checkbox">Использовать мои накопленные записи для локального обучения</label><p id="training-start-status" role="status"></p><button type="button" id="training-start" disabled>Начать обучение</button>';
  document.body.append(dialog);
  const get=id=>document.getElementById(id),labels={queued:'В очереди',running:'Обучение',completed:'Адаптер готов к проверке',failed:'Обучение завершилось с ошибкой',cancelled:'Обучение остановлено',interrupted:'Процесс был прерван',unconfirmed:'Проверяется запуск'};
  let profile=null,version=0,active=false,demo=false,info=null,timer=null,busy=false,pendingId=null,loadedAt=0;
  const running=()=>['queued','running','unconfirmed'].includes(info?.jobs?.[0]?.status);
  function draw(){
    if(!info)return;const job=info.jobs?.[0];
    get('training-summary').textContent=demo?'Пример не участвует в обучении.':info.examples+' / '+info.minimum+' записей для первого запуска · '+(info.connected?'локальный воркер готов':'локальный воркер не подключен');
    get('training-data-count').textContent='Записей: '+info.examples+' / минимум '+info.minimum;
    get('training-connection').textContent=info.connected?'Локальный воркер готов / '+info.model:'Нужно подключить локальный воркер LoRA';
    get('training-start').disabled=busy||demo||!get('training-consent').checked||!info.connected||info.examples<info.minimum||running();
    get('training-progress').hidden=!job;get('training-cancel').hidden=!running();
    if(job){get('training-meter').value=job.progress?.step||0;get('training-job-status').textContent=(labels[job.status]||job.status)+' / '+(job.progress?.step||0)+' из 200 шагов'+(Number.isFinite(job.progress?.loss)?' / loss '+job.progress.loss.toFixed(3):'')+' · '+job.examples+' записей';}
  }
  async function load(){
    if(!active||busy||!profile)return;const current=version;loadedAt=Date.now();
    try{const data=await journalApi('/api/astronauts/'+profile+'/training');if(current!==version)return;info=data;draw();if(running())void poll();}
    catch{if(current===version)get('training-summary').textContent='Не удалось проверить воркер. Нажми кнопку подготовки, чтобы повторить.';}
  }
  function schedule(){clearTimeout(timer);if(active&&running())timer=setTimeout(()=>void poll(),8000)}
  async function poll(){
    if(!active||!running())return;const current=version,job=info.jobs[0];
    try{const result=await journalApi('/api/astronauts/'+profile+'/training/'+job.id);if(current!==version)return;info.jobs[0]=result.job;draw();}
    catch{if(current===version)get('training-job-status').textContent='Нет связи с локальным воркером. Показан последний полученный прогресс.';}
    finally{if(current===version)schedule()}
  }
  window.missionTraining={render(value){
    const wasActive=active;active=value.visible;demo=value.demo;
    if(profile!==value.profile){version++;profile=value.profile;info=null;pendingId=null;loadedAt=0;clearTimeout(timer);dialog.close();get('training-consent').checked=false;}
    if(!active){clearTimeout(timer);return}if(!wasActive&&info){void load();return}if(!info&&Date.now()-loadedAt>3000)void load();else draw();
  },openPersonal(){
    window.missionTraining.render({visible:true,demo:false,profile:personalProfileId});dialog.showModal();get('training-start-status').textContent='';void load();void window.missionActivity?.record('training_review');
  }};
  get('training-review').addEventListener('click',()=>{dialog.showModal();get('training-start-status').textContent='';void load();void window.missionActivity?.record('training_review')});get('training-close').addEventListener('click',()=>dialog.close());get('training-consent').addEventListener('change',draw);
  get('training-start').addEventListener('click',async()=>{
    if(get('training-start').disabled)return;const current=version;busy=true;pendingId||=crypto.randomUUID();draw();get('training-start-status').textContent='Подготавливаю выборку и передаю локальному воркеру...';
    try{const result=await journalApi('/api/astronauts/'+profile+'/training',{method:'POST',body:JSON.stringify({id:pendingId,confirm:true})});if(current!==version)return;info.jobs=[result.job];void window.missionActivity?.refresh();pendingId=null;dialog.close();draw();schedule();}
    catch(error){if(current===version)get('training-start-status').textContent=error.message==='training_not_enough_data'?'Пока недостаточно подходящих записей.':'Не удалось подтвердить запуск. Проверь связь с локальным воркером.';}
    finally{if(current===version){busy=false;draw();void load()}}
  });
  get('training-cancel').addEventListener('click',async()=>{
    if(!running())return;const current=version;
    try{const result=await journalApi('/api/astronauts/'+profile+'/training/'+info.jobs[0].id,{method:'DELETE'});if(current!==version)return;info.jobs[0]=result.job;draw();clearTimeout(timer)}catch{get('training-job-status').textContent='Не удалось подтвердить остановку. Проверь локальный воркер.';}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(active)void load()});window.addEventListener('pagehide',()=>clearTimeout(timer));
  window.missionBook.render();
})();
