(() => {
  let tasks=[],loading=false,loaded=false,error='',changing=new Set(),banner;
  const create=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const today=zone=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const due=task=>task.status==='planned'&&(task.dueAt?Date.parse(task.dueAt)<=Date.now():task.dueDate<=today(task.timeZone));
  function when(task){return task.dueAt?new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:task.timeZone}).format(new Date(task.dueAt)):new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(task.dueDate+'T12:00:00Z'))+' / в течение дня';}
  function announce(){
    window.dispatchEvent(new Event('mission-tasks-change'));
    const host=document.getElementById('nasagpt-sidebar');if(!host)return;
    if(!banner){banner=create('button','scheduler-reminder');banner.type='button';banner.setAttribute('role','status');banner.addEventListener('click',()=>window.dispatchEvent(new Event('mission-tasks-open')));host.prepend(banner);}
    const ready=tasks.filter(due);banner.hidden=!ready.length;banner.textContent=ready.length?'Пора: '+ready[0].title+(ready.length>1?' / еще '+(ready.length-1):''):'';
  }
  async function refresh(){
    if(loading)return;loading=true;error='';announce();
    try{const result=await journalApi('/api/tasks');tasks=result.tasks;loaded=true;}catch{error='Не удалось загрузить задачи. Нажми «Обновить».';}
    finally{loading=false;announce();}
  }
  async function change(task,status){
    if(changing.has(task.id))return;changing.add(task.id);error='';announce();
    try{const result=await journalApi('/api/tasks/'+task.id,{method:'PATCH',body:JSON.stringify({status})});tasks=tasks.map(item=>item.id===task.id?result.task:item).filter(item=>item.status!=='cancelled');void window.missionActivity?.refresh();}
    catch{error='Задача не изменена. Попробуй еще раз.';}finally{changing.delete(task.id);announce();}
  }
  function render(host){
    host.replaceChildren();host.classList.add('scheduler-content');
    if(error)host.append(create('p','scheduler-error',error));
    if(!tasks.length){host.append(create('p','personal-empty',loading&&!loaded?'Загружаю задачи...':'Напиши в NasaGPT: «Завтра в 10:00 нужно измерить давление». Задача появится здесь.'));return;}
    const info=create('p','scheduler-note','Напоминания появляются, пока сайт открыт.');host.append(info);
    for(const status of ['planned','done']){
      const items=tasks.filter(task=>task.status===status).sort((a,b)=>(a.dueAt||a.dueDate).localeCompare(b.dueAt||b.dueDate));if(!items.length)continue;
      host.append(create('h4','scheduler-group',status==='done'?'Выполнено':'Предстоит'));
      for(const task of items){
        const card=create('article','scheduler-task');card.dataset.status=status;card.dataset.due=String(due(task));
        const check=create('button','scheduler-check',status==='done'?'✓':'');check.type='button';check.setAttribute('aria-label',(status==='done'?'Вернуть задачу: ':'Выполнить задачу: ')+task.title);check.setAttribute('aria-pressed',String(status==='done'));check.disabled=changing.has(task.id);check.addEventListener('click',()=>void change(task,status==='done'?'planned':'done'));
        const details=create('div','scheduler-details'),title=create('strong','',task.title),time=create('time','',when(task));time.dateTime=task.dueAt||task.dueDate;time.title=task.timeZone;details.append(title,time);if(due(task))details.append(create('span','scheduler-due','Пора выполнить'));
        const cancel=create('button','scheduler-cancel','×');cancel.type='button';cancel.setAttribute('aria-label','Отменить задачу: '+task.title);cancel.disabled=changing.has(task.id);cancel.addEventListener('click',()=>void change(task,'cancelled'));card.append(check,details,cancel);host.append(card);
      }
    }
  }
  window.missionScheduler={render,refresh,get loading(){return loading;}};
  setTimeout(()=>void refresh(),0);
  const interval=setInterval(()=>{if(!document.hidden)void refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(interval);});
})();
