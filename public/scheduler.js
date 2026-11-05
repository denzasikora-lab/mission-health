(() => {
  let tasks=[],loading=false,loaded=false,error='',changing=new Set(),banner,editing=null,removed=null,version=0;
  const create=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const today=zone=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const due=task=>task.status==='planned'&&(task.dueAt?Date.parse(task.dueAt)<=Date.now():task.dueDate<=today(task.timeZone));
  function when(task){return task.dueAt?new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:task.timeZone}).format(new Date(task.dueAt)):new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(task.dueDate+'T12:00:00Z'))+' / в течение дня';}
  function localTime(task){
    if(!task.dueAt)return '';
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:task.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(task.dueAt));
    return parts.find(part=>part.type==='hour').value+':'+parts.find(part=>part.type==='minute').value;
  }
  function announce(){
    window.dispatchEvent(new Event('mission-tasks-change'));
    const host=document.getElementById('nasagpt-sidebar');if(!host)return;
    if(!banner){banner=create('button','scheduler-reminder');banner.type='button';banner.setAttribute('role','status');banner.addEventListener('click',()=>window.dispatchEvent(new Event('mission-tasks-open')));host.prepend(banner);}
    const ready=tasks.filter(due);banner.hidden=!ready.length;banner.textContent=ready.length?'Пора: '+ready[0].title+(ready.length>1?' / еще '+(ready.length-1):''):'';
  }
  async function refresh(){
    if(loading||changing.size)return;const snapshot=version;loading=true;error='';announce();
    try{const result=await journalApi('/api/tasks');if(snapshot===version){tasks=result.tasks;loaded=true;}}catch{error='Не удалось загрузить задачи. Нажми «Обновить».';}
    finally{loading=false;announce();}
  }
  async function change(task,payload,{method='PATCH',remember=false,restore=false}={}){
    if(changing.has(task.id))return false;version++;changing.add(task.id);error='';announce();
    try{
      const result=await journalApi('/api/tasks/'+task.id,{method,...(method==='PATCH'?{body:JSON.stringify(payload)}:{})});
      tasks=tasks.filter(item=>item.id!==task.id);if(result.task.status!=='cancelled')tasks.push(result.task);
      if(remember){removed=task;if(editing?.id===task.id)editing=null;}
      if(restore)removed=null;
      void window.missionActivity?.refresh();return true;
    }catch{error='Задача не изменена. Проверь название, дату и время / попробуй еще раз.';return false;}
    finally{changing.delete(task.id);announce();}
  }
  function action(label,path,callback){
    const button=create('button','scheduler-action');button.type='button';button.setAttribute('aria-label',label);button.title=label;
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';button.addEventListener('click',callback);return button;
  }
  function editForm(task){
    const form=create('form','scheduler-edit'),title=create('input'),date=create('input'),time=create('input');
    title.type='text';title.required=true;title.maxLength=200;title.value=editing.title;title.dataset.taskField='title';
    date.type='date';date.required=true;date.value=editing.dueDate;date.dataset.taskField='date';
    time.type='time';time.value=editing.dueTime;time.dataset.taskField='time';
    for(const [name,input,key] of [['Задача',title,'title'],['Дата',date,'dueDate'],['Время',time,'dueTime']]){
      const label=create('label','',name);label.append(input);form.append(label);input.addEventListener('input',()=>{if(editing?.id===task.id)editing[key]=input.value;});input.disabled=changing.has(task.id);
    }
    const hint=create('small','scheduler-edit-zone','Часовой пояс: '+task.timeZone+'. Без времени / задача на весь день.');
    const controls=create('div','scheduler-edit-controls'),save=create('button','','Сохранить'),cancel=create('button','','Отмена');save.type='submit';cancel.type='button';save.disabled=cancel.disabled=changing.has(task.id);controls.append(save,cancel);form.append(hint,controls);
    cancel.addEventListener('click',()=>{editing=null;announce();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(editing?.id!==task.id)return;
      const value={title:editing.title.trim(),dueDate:editing.dueDate,dueTime:editing.dueTime};
      if(!value.title){title.setCustomValidity('Укажи название задачи.');title.reportValidity();return;}
      title.setCustomValidity('');if(await change(task,value)){editing=null;announce();}
    });
    title.addEventListener('input',()=>title.setCustomValidity(''));
    return form;
  }
  function render(host){
    host.replaceChildren();host.classList.add('scheduler-content');
    if(error)host.append(create('p','scheduler-error',error));
    if(removed){const notice=create('div','scheduler-undo'),text=create('span','','Задача удалена: '+removed.title),undo=create('button','','Восстановить');notice.setAttribute('role','status');undo.type='button';undo.disabled=changing.has(removed.id);undo.addEventListener('click',()=>void change(removed,{status:removed.status},{restore:true}));notice.append(text,undo);host.append(notice);}
    if(!tasks.length){host.append(create('p','personal-empty',loading&&!loaded?'Загружаю задачи...':'Напиши в NasaGPT: «Завтра в 10:00 нужно измерить давление». Задача появится здесь.'));return;}
    const info=create('p','scheduler-note','Напоминания появляются, пока сайт открыт.');host.append(info);
    for(const status of ['planned','done']){
      const items=tasks.filter(task=>task.status===status).sort((a,b)=>(a.dueAt||a.dueDate).localeCompare(b.dueAt||b.dueDate));if(!items.length)continue;
      host.append(create('h4','scheduler-group',status==='done'?'Выполнено':'Предстоит'));
      for(const task of items){
        const card=create('article','scheduler-task');card.dataset.status=status;card.dataset.due=String(due(task));card.dataset.taskId=task.id;
        const check=create('button','scheduler-check',status==='done'?'✓':'');check.type='button';check.setAttribute('aria-label',(status==='done'?'Вернуть задачу: ':'Выполнить задачу: ')+task.title);check.setAttribute('aria-pressed',String(status==='done'));check.disabled=changing.has(task.id);check.addEventListener('click',()=>void change(task,{status:status==='done'?'planned':'done'}));
        const details=create('div','scheduler-details'),title=create('strong','',task.title),time=create('time','',when(task));time.dateTime=task.dueAt||task.dueDate;time.title=task.timeZone;details.append(title,time);if(due(task))details.append(create('span','scheduler-due','Пора выполнить'));
        const controls=create('div','scheduler-task-actions');
        const edit=action('Редактировать задачу: '+task.title,'m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5',()=>{editing={id:task.id,title:task.title,dueDate:task.dueDate,dueTime:localTime(task)};announce();});
        const remove=action('Удалить задачу: '+task.title,'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',()=>void change(task,null,{method:'DELETE',remember:true}));
        edit.disabled=remove.disabled=changing.has(task.id);controls.append(edit,remove);card.append(check,details,controls);if(editing?.id===task.id)card.append(editForm(task));host.append(card);
      }
    }
  }
  window.missionScheduler={render,refresh,get loading(){return loading;}};
  setTimeout(()=>void refresh(),0);
  const interval=setInterval(()=>{if(!document.hidden)void refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(interval);});
})();
