(() => {
  let tasks=[],loading=false,loaded=false,error='',changing=new Set(),editing=null,removed=null,version=0,dueTimer=0,dismissedScope=null,dismissed=new Set();
  const create=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const today=zone=>{const parts=new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),part=type=>parts.find(value=>value.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');};
  const due=task=>task.status==='planned'&&(task.dueAt?Date.parse(task.dueAt)<=Date.now():task.dueDate<=today(task.timeZone));
  function when(task){return task.dueAt?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:task.timeZone}).format(new Date(task.dueAt)):new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(task.dueDate+'T12:00:00Z'))+' / during the day';}
  function localTime(task){
    if(!task.dueAt)return '';
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:task.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(task.dueAt));
    return parts.find(part=>part.type==='hour').value+':'+parts.find(part=>part.type==='minute').value;
  }
  function announce(){
    window.dispatchEvent(new Event('mission-tasks-change'));
    const scope=window.missionProfileName?.identity?.storageScope||'guest',key='mission-health-dismissed-reminders:'+scope,token=task=>task.id+':'+(task.dueAt||task.dueDate);
    if(dismissedScope!==scope){dismissedScope=scope;try{const saved=JSON.parse(window.sessionStorage?.getItem(key)||'[]');dismissed=new Set(Array.isArray(saved)?saved.filter(value=>typeof value==='string').slice(-200):[]);}catch{dismissed=new Set();}}
    const ready=tasks.filter(task=>due(task)&&!dismissed.has(token(task)));
    if(ready.length)window.missionNotifications?.show(ready,()=>{for(const task of ready)dismissed.add(token(task));try{window.sessionStorage?.setItem(key,JSON.stringify([...dismissed].slice(-200)));}catch{}announce();});
    else window.missionNotifications?.hide();
    if(dueTimer)clearTimeout(dueTimer);dueTimer=0;
    const next=tasks.filter(task=>task.status==='planned'&&task.dueAt&&Date.parse(task.dueAt)>Date.now()).map(task=>Date.parse(task.dueAt)).sort((a,b)=>a-b)[0];
    if(next)dueTimer=setTimeout(()=>{dueTimer=0;announce();void refresh();window.dispatchEvent(new Event('mission-reminder-messages'));},Math.min(2147483000,Math.max(1,next-Date.now()+10)));
  }
  async function refresh(){
    if(loading||changing.size)return;const snapshot=version;loading=true;error='';announce();
    try{const result=await journalApi('/api/tasks');if(snapshot===version){tasks=result.tasks;loaded=true;if(result.delivered)window.dispatchEvent(new Event('mission-reminder-messages'));}}catch{error='Could not load tasks. Press «Refresh».';}
    finally{loading=false;announce();}
  }
  async function change(task,payload,{method='PATCH',remember=false,restore=false}={}){
    if(changing.has(task.id))return false;version++;changing.add(task.id);error='';announce();
    try{
      const result=await journalApi('/api/tasks'+(method==='POST'?'':'/'+task.id),{method,...(['PATCH','POST'].includes(method)?{body:JSON.stringify(payload)}:{})});
      tasks=tasks.filter(item=>item.id!==task.id);if(result.task.status!=='cancelled')tasks.push(result.task);
      if(remember){removed=task;if(editing?.id===task.id)editing=null;}
      if(restore)removed=null;
      void window.missionActivity?.refresh();return true;
    }catch{error=(method==='POST'?'Task not added.':'Task not changed.')+' Check the title, date and time / try again.';return false;}
    finally{changing.delete(task.id);announce();}
  }
  function action(label,path,callback,caption){
    const button=create('button','scheduler-action');button.type='button';button.setAttribute('aria-label',label);button.title=label;
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';button.append(create('span','',caption));button.addEventListener('click',callback);return button;
  }
  function editForm(task){
    const isNew=Boolean(task.isNew);
    const form=create('form','scheduler-edit'),title=create('input'),date=create('input'),time=create('input');
    title.type='text';title.required=true;title.maxLength=200;title.value=editing.title;title.dataset.taskField='title';
    date.type='date';date.required=true;date.value=editing.dueDate;date.dataset.taskField='date';
    time.type='time';time.value=editing.dueTime;time.dataset.taskField='time';
    for(const [name,input,key] of [['Task',title,'title'],['Date',date,'dueDate'],['Time',time,'dueTime']]){
      const label=create('label','',name);label.append(input);form.append(label);input.addEventListener('input',()=>{if(editing?.id===task.id)editing[key]=input.value;});input.disabled=changing.has(task.id);
    }
    const hint=create('small','scheduler-edit-zone','Time zone: '+task.timeZone+'. No time / all-day task.');
    const controls=create('div','scheduler-edit-controls'),save=create('button','',isNew?'Add':'Save'),cancel=create('button','','Cancel');save.type='submit';cancel.type='button';save.disabled=cancel.disabled=changing.has(task.id);controls.append(save,cancel);form.append(hint,controls);
    cancel.addEventListener('click',()=>{editing=null;announce();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(editing?.id!==task.id)return;
      const value={title:editing.title.trim(),dueDate:editing.dueDate,dueTime:editing.dueTime};
      if(isNew){value.id=task.id;value.timeZone=task.timeZone;}
      if(!value.title){title.setCustomValidity('Enter a task title.');title.reportValidity();return;}
      title.setCustomValidity('');if(await change(task,value,{method:isNew?'POST':'PATCH'})){editing=null;announce();}
    });
    title.addEventListener('input',()=>title.setCustomValidity(''));
    return form;
  }
  function render(host){
    host.replaceChildren();host.classList.add('scheduler-content');
    const toolbar=create('div','scheduler-toolbar'),add=create('button','scheduler-add','+ Add task');add.type='button';add.disabled=Boolean(editing||changing.size);add.addEventListener('click',()=>{const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';editing={id:crypto.randomUUID(),isNew:true,title:'',dueDate:today(zone),dueTime:'',timeZone:zone};announce();});toolbar.append(add);host.append(toolbar);
    if(error)host.append(create('p','scheduler-error',error));
    if(removed){const notice=create('div','scheduler-undo'),text=create('span','','Task deleted: '+removed.title),undo=create('button','','Undo');notice.setAttribute('role','status');undo.type='button';undo.disabled=changing.has(removed.id);undo.addEventListener('click',()=>void change(removed,{status:removed.status},{restore:true}));notice.append(text,undo);host.append(notice);}
    if(editing?.isNew){const card=create('section','scheduler-create');card.append(create('h4','','New task'),editForm(editing));host.append(card);}
    if(!tasks.length){if(!editing?.isNew)host.append(create('p','scheduler-empty',loading&&!loaded?'Loading tasks...':'No tasks yet. Add a task above or describe it in NasaGPT.'));return;}
    const info=create('p','scheduler-note','Reminders appear, while this site is open.');host.append(info);
    for(const status of ['planned','done']){
      const items=tasks.filter(task=>task.status===status).sort((a,b)=>(a.dueAt||a.dueDate).localeCompare(b.dueAt||b.dueDate));if(!items.length)continue;
      host.append(create('h4','scheduler-group',status==='done'?'Completed':'Upcoming'));
      for(const task of items){
        const card=create('article','scheduler-task');card.dataset.status=status;card.dataset.due=String(due(task));card.dataset.taskId=task.id;
        const check=create('button','scheduler-check',status==='done'?'✓':'');check.type='button';check.setAttribute('aria-label',(status==='done'?'Restore task: ':'Complete task: ')+task.title);check.setAttribute('aria-pressed',String(status==='done'));check.disabled=changing.has(task.id);check.addEventListener('click',()=>void change(task,{status:status==='done'?'planned':'done'}));
        const details=create('div','scheduler-details'),title=create('strong','',task.title),time=create('time','',when(task));time.dateTime=task.dueAt||task.dueDate;time.title=task.timeZone;details.append(title,time);if(due(task))details.append(create('span','scheduler-due','Task due'));
        const controls=create('div','scheduler-task-actions');
        const edit=action('Edit task: '+task.title,'m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5',()=>{editing={id:task.id,title:task.title,dueDate:task.dueDate,dueTime:localTime(task)};announce();},'Edit');
        const remove=action('Delete task: '+task.title,'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',()=>void change(task,null,{method:'DELETE',remember:true}),'Delete');
        edit.disabled=remove.disabled=changing.has(task.id);controls.append(edit,remove);card.append(check,details,controls);if(editing?.id===task.id)card.append(editForm(task));host.append(card);
      }
    }
  }
  window.missionScheduler={render,refresh,get loading(){return loading;}};
  setTimeout(()=>void refresh(),0);
  const interval=setInterval(()=>{if(!document.hidden)void refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.addEventListener('pagehide',event=>{if(dueTimer)clearTimeout(dueTimer);dueTimer=0;if(!event.persisted)clearInterval(interval);});
  window.addEventListener('pageshow',announce);
})();
