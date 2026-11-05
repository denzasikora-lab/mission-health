import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url),source=await readFile(new URL('worker/scheduler.js',root),'utf8');
const scope={Intl,Date};vm.runInNewContext(source,scope);
const parse=(text,created='2026-10-30T18:00:00Z',zone='Europe/Istanbul')=>JSON.parse(JSON.stringify(scope.plannedFromText(text,created,zone)));
test('Завтра с местным временем и исходным регистром названия',()=>assert.deepEqual(parse('Напомни завтра в 10:30 проверить SpO2'),[{title:'Проверить SpO2',dueDate:'2026-10-31',dueAt:'2026-10-31T07:30:00.000Z',timeZone:'Europe/Istanbul'}]));
test('Дата без часа остается задачей на день, несколько поручений разделяются',()=>{const tasks=parse('31.10 нужно измерить давление; Послезавтра надо проверить часы');assert.equal(tasks.length,2);assert.equal(tasks[0].dueDate,'2026-10-31');assert.equal(tasks[0].dueAt,null);assert.equal(tasks[1].dueDate,'2026-11-01');});
test('Относительное время и следующий день недели',()=>{assert.equal(parse('Через 20 минут нужно отдохнуть')[0].dueAt,'2026-10-30T18:20:00.000Z');assert.equal(parse('В понедельник в 9:00 нужно измерить пульс')[0].dueAt,'2026-11-02T06:00:00.000Z');});
test('Вопросы, прошлые действия, отрицания и обычная беседа не создают задачи',()=>{for(const message of ['Какое завтра давление?','Вчера нужно было проверить пульс','Не надо завтра в 10 напоминать','Каждый день в 8 нужно проверить пульс','Завтра будет солнце','Нужно читать про посредника'])assert.deepEqual(parse(message),[]);});
test('Недопустимая дата и несуществующее время при смене часового пояса отбрасываются',()=>{assert.deepEqual(parse('31.02.2027 нужно проверить пульс'),[]);assert.deepEqual(parse('2027-03-14 at 02:30 need to check pulse','2027-03-13T00:00:00Z','America/New_York'),[]);assert.equal(parse('2027-03-14 at 03:30 need to check pulse','2027-03-13T00:00:00Z','America/New_York')[0].dueAt,'2027-03-14T07:30:00.000Z');});
const migrations=await Promise.all((await readdir(new URL('drizzle',root))).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL('drizzle/'+n,root),'utf8')));
function fixture(){const sql=new DatabaseSync(':memory:');migrations.forEach(m=>sql.exec(m));const DB={prepare(query){const q=sql.prepare(query);return{bind(...values){return{all:async()=>({results:q.all(...values)}),first:async()=>q.get(...values),run:async()=>q.run(...values)}}}}};const context={crypto:webcrypto,Intl,Date,database:e=>e.DB,activityWrite:async()=>{},json:Response.json,personalInput:r=>r.json(),fail:(code,status)=>{throw Object.assign(new Error(code),{status})}};vm.runInNewContext(source,context);return{sql,plan:(owner,row,zone)=>context.planChatTasks({DB},owner,row,zone),route:(owner,id,input,method=id?'PATCH':'GET')=>context.tasksRoute(new Request('https://test/api/tasks'+(id?'/'+id:''),{method,body:method==='PATCH'?JSON.stringify(typeof input==='string'?{status:input}:input):undefined,headers:{'content-type':'application/json'}}),{DB},owner,id)};}
test('Повтор чата не дублирует задачу и не меняет ее срок',async()=>{const f=fixture(),row={id:webcrypto.randomUUID(),content:'Завтра в 10:00 нужно измерить пульс',created_at:'2026-10-30T18:00:00Z'},first=await f.plan('a',row,'Europe/Istanbul'),second=await f.plan('a',row,'UTC');assert.equal(first[0].id,second[0].id);assert.equal(second[0].dueAt,'2026-10-31T07:00:00.000Z');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_tasks').get().n,1);});
test('Задачи изолированы по владельцу, выполнение и отмена сохраняются',async()=>{const f=fixture(),tasks=await f.plan('a',{id:webcrypto.randomUUID(),content:'Завтра нужно отдохнуть',created_at:'2026-10-30T18:00:00Z'},'UTC'),id=tasks[0].id;assert.deepEqual((await(await f.route('b')).json()).tasks,[]);await assert.rejects(f.route('b',id,'done'),e=>e.status===404);assert.equal((await(await f.route('a',id,'done')).json()).task.status,'done');assert.equal((await(await f.route('a',id,'planned')).json()).task.status,'planned');await f.route('a',id,'cancelled');assert.equal((await(await f.route('a')).json()).tasks.length,0);assert.equal(f.sql.prepare('SELECT status FROM personal_tasks').get().status,'cancelled');});

const sampleTask=async(f,owner='a',zone='Europe/Istanbul',content='Завтра в 10:00 нужно измерить пульс')=>JSON.parse(JSON.stringify((await f.plan(owner,{id:webcrypto.randomUUID(),content,created_at:'2026-10-30T18:00:00Z'},zone))[0]));
test('Название и местные дата и время редактируются без потери статуса и источника',async()=>{
  const f=fixture(),task=await sampleTask(f);await f.route('a',task.id,'done');
  const edited=(await(await f.route('a',task.id,{title:' Проверить часы ',dueDate:'2026-11-03',dueTime:'08:45'})).json()).task;
  assert.equal(edited.title,'Проверить часы');assert.equal(edited.dueDate,'2026-11-03');assert.equal(edited.dueAt,'2026-11-03T05:45:00.000Z');assert.equal(edited.timeZone,'Europe/Istanbul');assert.equal(edited.status,'done');assert.equal(edited.sourceMessageId,task.sourceMessageId);
  assert.deepEqual((await(await f.route('a')).json()).tasks,[edited]);
});
test('Изменение даты сохраняет местный час через смену сезонного времени',async()=>{
  const f=fixture(),task=await sampleTask(f,'a','America/New_York');
  const edited=(await(await f.route('a',task.id,{dueDate:'2026-11-03'})).json()).task;
  assert.equal(edited.dueAt,'2026-11-03T15:00:00.000Z');
  const shifted=(await(await f.route('a',task.id,{timeZone:'Europe/Istanbul'})).json()).task;
  assert.equal(shifted.dueAt,'2026-11-03T07:00:00.000Z');
});
test('Время можно добавить к задаче на день и убрать обратно',async()=>{
  const f=fixture(),task=await sampleTask(f,'a','UTC','Завтра нужно отдохнуть');assert.equal(task.dueAt,null);
  assert.equal((await(await f.route('a',task.id,{dueTime:'09:15'})).json()).task.dueAt,'2026-10-31T09:15:00.000Z');
  const cleared=(await(await f.route('a',task.id,{dueDate:'2026-11-04',dueTime:''})).json()).task;
  assert.equal(cleared.dueAt,null);assert.equal(cleared.dueDate,'2026-11-04');
});
test('Удаление скрывает задачу, восстановление возвращает тот же идентификатор и срок',async()=>{
  const f=fixture(),task=await sampleTask(f);await f.route('a',task.id,'done');
  const deleted=(await(await f.route('a',task.id,null,'DELETE')).json()).task;assert.equal(deleted.status,'cancelled');
  assert.equal((await(await f.route('a')).json()).tasks.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_tasks').get().n,1);
  const restored=(await(await f.route('a',task.id,{status:'done'})).json()).task;
  assert.equal(restored.id,task.id);assert.equal(restored.status,'done');assert.equal(restored.title,task.title);assert.equal(restored.dueAt,task.dueAt);assert.equal((await(await f.route('a')).json()).tasks.length,1);
});
test('Чужие задачи нельзя редактировать, удалять или восстанавливать',async()=>{
  const f=fixture(),task=await sampleTask(f);
  for(const [input,method] of [[{title:'Изменено'},'PATCH'],[null,'DELETE'],[{status:'planned'},'PATCH']])await assert.rejects(f.route('b',task.id,input,method),error=>error.status===404);
  assert.equal((await(await f.route('a')).json()).tasks[0].title,task.title);
});
test('Некорректные правки отвергаются целиком и не меняют сохраненную задачу',async()=>{
  const f=fixture(),task=await sampleTask(f);
  const inputs=[{},[],null,{title:''},{title:' '.repeat(4)},{title:'a'.repeat(201)},{dueDate:'2026-02-30'},{dueDate:'2026-2-03'},{dueTime:'24:00'},{dueTime:'09:60'},{timeZone:'Invalid/Zone'},{status:'lost'},{dueAt:'2026-11-03T12:00:00Z'},{title:'Новое',dueDate:'2026-02-30'}];
  for(const input of inputs)await assert.rejects(f.route('a',task.id,input),error=>error.status===400);
  assert.deepEqual((await(await f.route('a')).json()).tasks,[task]);
});
test('Невозможный местный час при переходе на летнее время не сохраняется',async()=>{
  const f=fixture(),task=await sampleTask(f,'a','America/New_York');
  await assert.rejects(f.route('a',task.id,{dueDate:'2027-03-14',dueTime:'02:30'}),error=>error.status===400);
  assert.deepEqual((await(await f.route('a')).json()).tasks,[task]);
});

const schedulerUiSource=await readFile(new URL('public/scheduler.js',root),'utf8');
class SchedulerNode{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.value='';this.classList={add:()=>{}};}
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(type,callback){(this.events[type]||=[]).push(callback);}
  async trigger(type){for(const callback of this.events[type]||[])await callback({preventDefault(){}});await new Promise(setImmediate);}
  setCustomValidity(value){this.validationMessage=value;}
  reportValidity(){return !this.validationMessage;}
}
function schedulerUiFixture(initial){
  const host=new SchedulerNode('div'),handlers=new Map(),calls=[];let rows=structuredClone(initial),fail=false,ui;
  const window={addEventListener(name,callback){handlers.set(name,callback);},dispatchEvent(event){if(event.type==='mission-tasks-change')ui?.render(host);},missionActivity:{refresh:async()=>{}}};
  const document={createElement:tag=>new SchedulerNode(tag),getElementById:()=>null,addEventListener(){},hidden:false};
  const journalApi=async(path,options={})=>{calls.push({path,...options});if(!options.method)return {tasks:structuredClone(rows.filter(task=>task.status!=='cancelled'))};if(fail)throw new Error('offline');const id=path.split('/').at(-1),task=rows.find(row=>row.id===id);if(options.method==='DELETE')task.status='cancelled';else{const patch=JSON.parse(options.body);Object.assign(task,patch);if(Object.hasOwn(patch,'dueTime'))task.dueAt=patch.dueTime?patch.dueDate+'T'+patch.dueTime+':00.000Z':null;}return {task:structuredClone(task)};};
  vm.runInNewContext(schedulerUiSource,{window,document,journalApi,Intl,Date,Event,setTimeout:()=>0,setInterval:()=>0,clearInterval(){}});ui=window.missionScheduler;
  const all=()=>{const result=[];const visit=node=>{result.push(node);node.children.forEach(visit);};visit(host);return result;};
  return {ui,host,calls,all,byLabel:prefix=>all().find(node=>node.attributes['aria-label']?.startsWith(prefix)),field:key=>all().find(node=>node.dataset.taskField===key),button:text=>all().find(node=>node.tagName==='button'&&node.textContent===text),fail:()=>{fail=true;},get rows(){return rows;}};
}
const uiTask={id:'task-1',title:'Проверить пульс',dueDate:'2026-11-06',dueAt:'2026-11-06T10:00:00.000Z',timeZone:'UTC',status:'planned'};
test('Редактор сохраняет введенные поля при обновлении задач и отправляет местное время',async()=>{
  const f=schedulerUiFixture([uiTask]);await f.ui.refresh();await f.byLabel('Редактировать задачу:').trigger('click');
  for(const [key,value] of [['title','Проверить часы'],['date','2026-11-07'],['time','09:30']]){const field=f.field(key);field.value=value;await field.trigger('input');}
  await f.ui.refresh();assert.equal(f.field('title').value,'Проверить часы');assert.equal(f.field('time').value,'09:30');
  await f.all().find(node=>node.tagName==='form').trigger('submit');
  const save=f.calls.find(call=>call.method==='PATCH');assert.deepEqual(JSON.parse(save.body),{title:'Проверить часы',dueDate:'2026-11-07',dueTime:'09:30'});assert.equal(f.field('title'),undefined);
});
test('Ошибка сохранения оставляет введенный текст и дату в редакторе',async()=>{
  const f=schedulerUiFixture([uiTask]);await f.ui.refresh();await f.byLabel('Редактировать задачу:').trigger('click');
  f.field('title').value='Текст после ошибки';await f.field('title').trigger('input');f.fail();
  await f.all().find(node=>node.tagName==='form').trigger('submit');assert.equal(f.field('title').value,'Текст после ошибки');assert.equal(f.field('date').value,'2026-11-06');assert.equal(f.rows[0].title,uiTask.title);
});
test('Удаление последней задачи показывает восстановление и возвращает выполненный статус',async()=>{
  const f=schedulerUiFixture([{...uiTask,status:'done'}]);await f.ui.refresh();await f.byLabel('Удалить задачу:').trigger('click');
  assert.equal(f.rows[0].status,'cancelled');assert.ok(f.button('Восстановить'));assert.equal(f.byLabel('Редактировать задачу:'),undefined);
  await f.button('Восстановить').trigger('click');assert.equal(f.rows[0].status,'done');assert.ok(f.byLabel('Редактировать задачу:'));assert.equal(f.button('Восстановить'),undefined);
});
