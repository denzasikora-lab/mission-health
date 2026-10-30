(() => {
  const root=document.createElement('section');root.id='personal-activity';root.className='personal-activity panel glass';
  root.innerHTML='<header><h2>Недавние события</h2><button type="button" class="activity-training">Fine-tuning / LoRA ↗</button><span><i></i>Сейчас</span></header><ol aria-live="polite"></ol><p role="status"></p>';
  document.getElementById('mission-book').append(root);
  root.querySelector('.activity-training').addEventListener('click',()=>window.missionTraining.openPersonal());
  const secondaryTraining=document.createElement('button');secondaryTraining.type='button';secondaryTraining.className='activity-training';secondaryTraining.textContent='Fine-tuning / LoRA ↗';secondaryTraining.addEventListener('click',()=>window.missionTraining.openPersonal());document.getElementById('activity-heading').after(secondaryTraining);
  const list=root.querySelector('ol'),status=root.querySelector('p'),draftTimers=new WeakMap();let loading=false,queued=false,timer,lastEvents=[];
  function render(events=lastEvents){
    lastEvents=events;list.replaceChildren();
    for(const entry of events.slice(0,12)){
      const item=document.createElement('li'),dot=document.createElement('i'),body=document.createElement('div'),text=document.createElement('span'),time=document.createElement('time');
      dot.className='activity-dot';text.textContent=entry.summary;time.dateTime=entry.createdAt;time.textContent=new Intl.DateTimeFormat('ru',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(entry.createdAt));body.append(text,time);item.append(dot,body);list.append(item);
    }
    status.textContent=events.length?'':'Здесь появятся твои действия.';
    const other=document.getElementById('event-list');other.replaceChildren();
    for(const entry of events.slice(0,5)){const item=document.createElement('li'),dot=document.createElement('span'),text=document.createElement('p'),time=document.createElement('time');dot.className='event-marker';text.textContent=entry.summary;time.textContent=new Intl.DateTimeFormat('ru',{hour:'2-digit',minute:'2-digit'}).format(new Date(entry.createdAt));text.append(time);item.append(dot,text);other.append(item);}
    if(!events.length){const item=document.createElement('li');item.textContent='Здесь появятся твои действия.';other.append(item);}

  }
  async function refresh(){
    if(loading){queued=true;return;}loading=true;
    try{const data=await journalApi('/api/activity');render(data.events);}catch{status.textContent='Не удалось обновить события.';}finally{loading=false;if(queued){queued=false;void refresh();}}
  }
  async function record(kind,details={}){
    try{await journalApi('/api/activity',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),kind,...details})});await refresh();}catch{status.textContent='Событие пока не сохранено. Проверь связь.';}
  }
  document.addEventListener('input',event=>{
    const field=event.target;if(!field.matches('textarea,#story-caption'))return;
    const area=field.dataset.activityArea|| (field.id==='story-caption'?'caption':field.id==='book-entry-text'?'diary':field.closest('.personal-conversation')?'chat':null);if(!area)return;
    clearTimeout(draftTimers.get(field));const length=field.value.length;draftTimers.set(field,setTimeout(()=>{if(field.value.length===length)void record('draft',{area,length});},1800));
  });
  document.addEventListener('click',event=>{
    const target=event.target.closest('#video-log-camera,#story-camera-toggle,#voice-mic');if(target)void record(target.id==='voice-mic'?'microphone_click':'camera_click');
  });
  function schedule(){clearInterval(timer);if(!document.hidden)timer=setInterval(()=>void refresh(),10000);}
  document.addEventListener('visibilitychange',()=>{schedule();if(!document.hidden)void refresh();});window.addEventListener('pagehide',()=>clearInterval(timer));
  window.missionActivity={record,refresh,render};schedule();void refresh();
})();
