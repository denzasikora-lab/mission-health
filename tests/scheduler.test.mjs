import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
const root=new URL('../',import.meta.url),source=await readFile(new URL('worker/scheduler.js',root),'utf8');
const scope={Intl,Date};vm.runInNewContext(source,scope);
const parse=(text,created='2026-10-30T18:00:00Z',zone='Europe/Istanbul')=>JSON.parse(JSON.stringify(scope.plannedFromText(text,created,zone)));
test('Tomorrow uses local time and preserves title case',()=>assert.deepEqual(parse('Remind me tomorrow at 10:30 check SpO2'),[{title:'Check SpO2',dueDate:'2026-10-31',dueAt:'2026-10-31T07:30:00.000Z',timeZone:'Europe/Istanbul'}]));
test('A date without time remains an all-day task, multiple instructions are separated',()=>{const tasks=parse('31.10 need to measure blood pressure; The day after tomorrow I need to check the watch');assert.equal(tasks.length,2);assert.equal(tasks[0].dueDate,'2026-10-31');assert.equal(tasks[0].dueAt,null);assert.equal(tasks[1].dueDate,'2026-11-01');});
test('Relative time and the next weekday',()=>{assert.equal(parse('In 20 minutes I need to rest')[0].dueAt,'2026-10-30T18:20:00.000Z');assert.equal(parse('On Monday at 9:00 I need to measure pulse')[0].dueAt,'2026-11-02T06:00:00.000Z');});
test('Questions, past actions, negations and ordinary conversation do not create tasks',()=>{for(const message of ['What is tomorrow’s blood pressure?','Yesterday I needed to check pulse','Do not remind me tomorrow at 10 remind','Every day at 8 I need to check pulse','Tomorrow will be sunny','I need to read about an intermediary'])assert.deepEqual(parse(message),[]);});
test('Invalid dates and nonexistent local times during clock changes are discarded',()=>{assert.deepEqual(parse('31.02.2027 I need to check pulse'),[]);assert.deepEqual(parse('2027-03-14 at 02:30 need to check pulse','2027-03-13T00:00:00Z','America/New_York'),[]);assert.equal(parse('2027-03-14 at 03:30 need to check pulse','2027-03-13T00:00:00Z','America/New_York')[0].dueAt,'2027-03-14T07:30:00.000Z');});
const migrations=await Promise.all((await readdir(new URL('drizzle',root))).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL('drizzle/'+n,root),'utf8')));
function fixture(){const sql=new DatabaseSync(':memory:');migrations.forEach(m=>sql.exec(m));const DB={prepare(query){const q=sql.prepare(query);return{bind(...values){return{all:async()=>({results:q.all(...values)}),first:async()=>q.get(...values),run:async()=>q.run(...values)}}}}};const context={crypto:webcrypto,Intl,Date,database:e=>e.DB,activityWrite:async()=>{},json:(value,status=200)=>Response.json(value,{status}),personalInput:r=>r.json(),fail:(code,status)=>{throw Object.assign(new Error(code),{status})}};vm.runInNewContext(source,context);return{sql,plan:(owner,row,zone)=>context.planChatTasks({DB},owner,row,zone),route:(owner,id,input,method=id?'PATCH':'GET')=>context.tasksRoute(new Request('https://test/api/tasks'+(id?'/'+id:''),{method,body:['PATCH','POST'].includes(method)?JSON.stringify(typeof input==='string'?{status:input}:input):undefined,headers:{'content-type':'application/json'}}),{DB},owner,id)};}
test('Chat retries do not duplicate tasks or change deadlines',async()=>{const f=fixture(),row={id:webcrypto.randomUUID(),content:'Tomorrow at 10:00 I need to measure pulse',created_at:'2026-10-30T18:00:00Z'},first=await f.plan('a',row,'Europe/Istanbul'),second=await f.plan('a',row,'UTC');assert.equal(first[0].id,second[0].id);assert.equal(second[0].dueAt,'2026-10-31T07:00:00.000Z');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_tasks').get().n,1);});
test('Tasks are isolated by owner, completion and cancellation are saved',async()=>{const f=fixture(),tasks=await f.plan('a',{id:webcrypto.randomUUID(),content:'Tomorrow I need to rest',created_at:'2026-10-30T18:00:00Z'},'UTC'),id=tasks[0].id;assert.deepEqual((await(await f.route('b')).json()).tasks,[]);await assert.rejects(f.route('b',id,'done'),e=>e.status===404);assert.equal((await(await f.route('a',id,'done')).json()).task.status,'done');assert.equal((await(await f.route('a',id,'planned')).json()).task.status,'planned');await f.route('a',id,'cancelled');assert.equal((await(await f.route('a')).json()).tasks.length,0);assert.equal(f.sql.prepare('SELECT status FROM personal_tasks').get().status,'cancelled');});

const sampleTask=async(f,owner='a',zone='Europe/Istanbul',content='Tomorrow at 10:00 I need to measure pulse')=>JSON.parse(JSON.stringify((await f.plan(owner,{id:webcrypto.randomUUID(),content,created_at:'2026-10-30T18:00:00Z'},zone))[0]));
test('Title and local date/time edits preserve status and source',async()=>{
  const f=fixture(),task=await sampleTask(f);await f.route('a',task.id,'done');
  const edited=(await(await f.route('a',task.id,{title:' Check watch ',dueDate:'2026-11-03',dueTime:'08:45'})).json()).task;
  assert.equal(edited.title,'Check watch');assert.equal(edited.dueDate,'2026-11-03');assert.equal(edited.dueAt,'2026-11-03T05:45:00.000Z');assert.equal(edited.timeZone,'Europe/Istanbul');assert.equal(edited.status,'done');assert.equal(edited.sourceMessageId,task.sourceMessageId);
  assert.deepEqual((await(await f.route('a')).json()).tasks,[edited]);
});
test('Date changes preserve local time across seasonal clock changes',async()=>{
  const f=fixture(),task=await sampleTask(f,'a','America/New_York');
  const edited=(await(await f.route('a',task.id,{dueDate:'2026-11-03'})).json()).task;
  assert.equal(edited.dueAt,'2026-11-03T15:00:00.000Z');
  const shifted=(await(await f.route('a',task.id,{timeZone:'Europe/Istanbul'})).json()).task;
  assert.equal(shifted.dueAt,'2026-11-03T07:00:00.000Z');
});
test('Time can be added to an all-day task and removed again',async()=>{
  const f=fixture(),task=await sampleTask(f,'a','UTC','Tomorrow I need to rest');assert.equal(task.dueAt,null);
  assert.equal((await(await f.route('a',task.id,{dueTime:'09:15'})).json()).task.dueAt,'2026-10-31T09:15:00.000Z');
  const cleared=(await(await f.route('a',task.id,{dueDate:'2026-11-04',dueTime:''})).json()).task;
  assert.equal(cleared.dueAt,null);assert.equal(cleared.dueDate,'2026-11-04');
});
test('Deleting hides a task, restoring returns the same identifier and deadline',async()=>{
  const f=fixture(),task=await sampleTask(f);await f.route('a',task.id,'done');
  const deleted=(await(await f.route('a',task.id,null,'DELETE')).json()).task;assert.equal(deleted.status,'cancelled');
  assert.equal((await(await f.route('a')).json()).tasks.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_tasks').get().n,1);
  const restored=(await(await f.route('a',task.id,{status:'done'})).json()).task;
  assert.equal(restored.id,task.id);assert.equal(restored.status,'done');assert.equal(restored.title,task.title);assert.equal(restored.dueAt,task.dueAt);assert.equal((await(await f.route('a')).json()).tasks.length,1);
});
test('Another owner’s tasks cannot be edited, deleted or restored',async()=>{
  const f=fixture(),task=await sampleTask(f);
  for(const [input,method] of [[{title:'Changed'},'PATCH'],[null,'DELETE'],[{status:'planned'},'PATCH']])await assert.rejects(f.route('b',task.id,input,method),error=>error.status===404);
  assert.equal((await(await f.route('a')).json()).tasks[0].title,task.title);
});
test('Invalid edits are rejected atomically without changing the saved task',async()=>{
  const f=fixture(),task=await sampleTask(f);
  const inputs=[{},[],null,{title:''},{title:' '.repeat(4)},{title:'a'.repeat(201)},{dueDate:'2026-02-30'},{dueDate:'2026-2-03'},{dueTime:'24:00'},{dueTime:'09:60'},{timeZone:'Invalid/Zone'},{status:'lost'},{dueAt:'2026-11-03T12:00:00Z'},{title:'New',dueDate:'2026-02-30'}];
  for(const input of inputs)await assert.rejects(f.route('a',task.id,input),error=>error.status===400);
  assert.deepEqual((await(await f.route('a')).json()).tasks,[task]);
});
test('Nonexistent local time during daylight-saving changes is not saved',async()=>{
  const f=fixture(),task=await sampleTask(f,'a','America/New_York');
  await assert.rejects(f.route('a',task.id,{dueDate:'2027-03-14',dueTime:'02:30'}),error=>error.status===400);
  assert.deepEqual((await(await f.route('a')).json()).tasks,[task]);
});

const manualTaskInput=(extra={})=>({id:webcrypto.randomUUID(),title:'Check watch',dueDate:'2026-11-07',dueTime:'09:30',timeZone:'Europe/Istanbul',...extra});
test('Manual tasks preserve local date, time and a separate source',async()=>{
  const f=fixture(),input=manualTaskInput({title:' Check watch '}),response=await f.route('a',null,input,'POST'),task=(await response.json()).task;
  assert.equal(response.status,201);assert.equal(task.id,input.id);assert.equal(task.title,'Check watch');assert.equal(task.dueDate,input.dueDate);assert.equal(task.dueAt,'2026-11-07T06:30:00.000Z');assert.equal(task.timeZone,input.timeZone);assert.equal(task.status,'planned');assert.equal(task.sourceMessageId,'manual:'+input.id);
  assert.deepEqual((await(await f.route('a')).json()).tasks,[task]);assert.deepEqual((await(await f.route('b')).json()).tasks,[]);
});
test('Manual tasks without time remain all-day tasks',async()=>{
  const f=fixture();for(const dueTime of ['',null,undefined]){const input=manualTaskInput({dueTime}),task=(await(await f.route('a',null,input,'POST')).json()).task;assert.equal(task.dueAt,null);assert.equal(task.dueDate,input.dueDate);}
});
test('Retrying creation with the same UUID does not duplicate a task and preserves later status',async()=>{
  const f=fixture(),input=manualTaskInput(),first=(await(await f.route('a',null,input,'POST')).json()).task;
  await f.route('a',first.id,{status:'done'});const second=(await(await f.route('a',null,{...input,id:input.id.toUpperCase()},'POST')).json()).task;
  assert.equal(second.id,first.id);assert.equal(second.createdAt,first.createdAt);assert.equal(second.status,'done');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_tasks').get().n,1);
});
test('The same UUID with changed content returns a conflict without losing edits',async()=>{
  const f=fixture(),input=manualTaskInput(),first=(await(await f.route('a',null,input,'POST')).json()).task;
  for(const changed of [{title:'Another task'},{dueDate:'2026-11-08'},{dueTime:'10:00'},{timeZone:'UTC'}])await assert.rejects(f.route('a',null,{...input,...changed},'POST'),error=>error.status===409);
  await f.route('a',first.id,{title:'Edited after creation'});await assert.rejects(f.route('a',null,input,'POST'),error=>error.status===409);
  assert.equal((await(await f.route('a')).json()).tasks[0].title,'Edited after creation');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_tasks').get().n,1);
});
test('Collision UUID of another owner and chat-generated tasks never returns someone else’s record',async()=>{
  const f=fixture(),input=manualTaskInput();await f.route('a',null,input,'POST');await assert.rejects(f.route('b',null,input,'POST'),error=>error.status===409);assert.deepEqual((await(await f.route('b')).json()).tasks,[]);
  const chat=await sampleTask(f);await assert.rejects(f.route('a',null,{...input,id:chat.id,title:chat.title,dueDate:chat.dueDate,dueTime:'10:00'},'POST'),error=>error.status===409);
});
test('Creation rejects incomplete data, invalid UUID, dates, time and time zone',async()=>{
  const f=fixture(),valid=manualTaskInput(),inputs=[null,[],{},...['id','title','dueDate','timeZone'].map(key=>{const input={...valid};delete input[key];return input;}),...[
    {id:'bad-id'},{id:'11111111-1111-1111-1111-111111111111'},{title:''},{title:' '.repeat(5)},{title:'x'.repeat(201)},{dueDate:'2026-02-30'},{dueTime:'24:00'},{dueTime:12},{timeZone:'Invalid/Zone'},{timeZone:''},{status:'done'},{dueAt:'2026-11-07T10:00:00Z'},{dueDate:'2027-03-14',dueTime:'02:30',timeZone:'America/New_York'}
  ].map(patch=>({...valid,...patch}))];
  for(const input of inputs)await assert.rejects(f.route('a',null,input,'POST'),error=>error.status===400);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM personal_tasks').get().n,0);
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
function schedulerUiFixture(initial,{at=Date.now(),storage=new Map()}={}){
  const host=new SchedulerNode('div'),handlers=new Map(),calls=[],timers=new Map();let rows=structuredClone(initial),fail=false,loseNextCreate=false,ui,now=at,seq=0,notification=null;
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const window={addEventListener(name,callback){handlers.set(name,callback);},dispatchEvent(event){if(event.type==='mission-tasks-change')ui?.render(host);},missionActivity:{refresh:async()=>{}},missionProfileName:{identity:{storageScope:'owner-a'}},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},missionNotifications:{show(items,onClose){notification={items,onClose};},hide(){notification=null;}}};
  const document={createElement:tag=>new SchedulerNode(tag),getElementById:()=>null,addEventListener(){},hidden:false};
  const journalApi=async(path,options={})=>{calls.push({path,...options});if(!options.method)return {tasks:structuredClone(rows.filter(task=>task.status!=='cancelled'))};if(fail)throw new Error('offline');
    if(options.method==='POST'){const input=JSON.parse(options.body);let task=rows.find(row=>row.id===input.id);if(!task){task={...input,status:'planned',dueAt:input.dueTime?input.dueDate+'T'+input.dueTime+':00.000Z':null};rows.push(task);}if(loseNextCreate){loseNextCreate=false;throw new Error('response_lost');}return {task:structuredClone(task)};}
    const id=path.split('/').at(-1),task=rows.find(row=>row.id===id);if(options.method==='DELETE')task.status='cancelled';else{const patch=JSON.parse(options.body);Object.assign(task,patch);if(Object.hasOwn(patch,'dueTime'))task.dueAt=patch.dueTime?patch.dueDate+'T'+patch.dueTime+':00.000Z':null;}return {task:structuredClone(task)};};
  vm.runInNewContext(schedulerUiSource,{window,document,journalApi,Intl,Date:Clock,Event,crypto:webcrypto,setTimeout:(callback,delay)=>{timers.set(++seq,{callback,at:now+delay});return seq;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){}});ui=window.missionScheduler;
  const all=()=>{const result=[];const visit=node=>{result.push(node);node.children.forEach(visit);};visit(host);return result;};
  return {ui,host,calls,all,storage,handlers,timers,get notification(){return notification;},advance(ms){const end=now+ms;let loops=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(loops++>100)throw Error('timer loop');now=next[1].at;timers.delete(next[0]);next[1].callback();}now=end;},byLabel:prefix=>all().find(node=>node.attributes['aria-label']?.startsWith(prefix)),field:key=>all().find(node=>node.dataset.taskField===key),button:text=>all().find(node=>node.tagName==='button'&&node.textContent===text),fail:()=>{fail=true;},recover:()=>{fail=false;},loseCreateResponse:()=>{loseNextCreate=true;},get rows(){return rows;}};
}
const uiTask={id:'task-1',title:'Check pulse',dueDate:'2026-11-06',dueAt:'2026-11-06T10:00:00.000Z',timeZone:'UTC',status:'planned'};
test('Minute reminders fire at their deadline and dismissal survives refresh without cancelling the task',async()=>{
  const at=Date.parse('2026-11-06T09:59:00Z'),f=schedulerUiFixture([uiTask],{at});await f.ui.refresh();f.advance(0);await new Promise(setImmediate);assert.equal(f.notification,null);f.advance(59999);assert.equal(f.notification,null);f.advance(20);assert.equal(f.notification.items[0].id,uiTask.id);f.notification.onClose();assert.equal(f.notification,null);assert.equal(f.rows[0].status,'planned');await f.ui.refresh();assert.equal(f.notification,null);
  const reloaded=schedulerUiFixture([uiTask],{at:at+70000,storage:f.storage});await reloaded.ui.refresh();assert.equal(reloaded.notification,null);assert.equal(reloaded.calls.filter(call=>call.method).length,0);
  f.rows[0].dueAt='2026-11-06T10:01:00.000Z';await f.ui.refresh();f.advance(60000);assert.equal(f.notification.items[0].id,uiTask.id);f.handlers.get('pagehide')({persisted:true});assert.equal(f.timers.size,0);
});
test('The editor preserves entered fields during task refresh and sends local time',async()=>{
  const f=schedulerUiFixture([uiTask]);await f.ui.refresh();await f.byLabel('Edit task:').trigger('click');
  for(const [key,value] of [['title','Check watch'],['date','2026-11-07'],['time','09:30']]){const field=f.field(key);field.value=value;await field.trigger('input');}
  await f.ui.refresh();assert.equal(f.field('title').value,'Check watch');assert.equal(f.field('time').value,'09:30');
  await f.all().find(node=>node.tagName==='form').trigger('submit');
  const save=f.calls.find(call=>call.method==='PATCH');assert.deepEqual(JSON.parse(save.body),{title:'Check watch',dueDate:'2026-11-07',dueTime:'09:30'});assert.equal(f.field('title'),undefined);
});
test('Save errors preserve text and date in the editor',async()=>{
  const f=schedulerUiFixture([uiTask]);await f.ui.refresh();await f.byLabel('Edit task:').trigger('click');
  f.field('title').value='Text after error';await f.field('title').trigger('input');f.fail();
  await f.all().find(node=>node.tagName==='form').trigger('submit');assert.equal(f.field('title').value,'Text after error');assert.equal(f.field('date').value,'2026-11-06');assert.equal(f.rows[0].title,uiTask.title);
});
test('Deleting the last task shows Undo and restores its completed state',async()=>{
  const f=schedulerUiFixture([{...uiTask,status:'done'}]);await f.ui.refresh();await f.byLabel('Delete task:').trigger('click');
  assert.equal(f.rows[0].status,'cancelled');assert.ok(f.button('Undo'));assert.equal(f.byLabel('Edit task:'),undefined);
  await f.button('Undo').trigger('click');assert.equal(f.rows[0].status,'done');assert.ok(f.byLabel('Edit task:'));assert.equal(f.button('Undo'),undefined);
});

test('An empty list offers creation with today’s date and no invented task',async()=>{
  const f=schedulerUiFixture([]);await f.ui.refresh();assert.ok(f.button('+ Add task'));assert.equal(f.byLabel('Edit task:'),undefined);
  await f.button('+ Add task').trigger('click');const now=new Date(),expectedDate=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  assert.equal(f.field('title').value,'');assert.equal(f.field('date').value,expectedDate);assert.equal(f.field('time').value,'');assert.ok(f.button('Add'));assert.equal(f.rows.length,0);assert.equal(f.calls.some(call=>call.method==='POST'),false);
  await f.button('Cancel').trigger('click');assert.equal(f.field('title'),undefined);assert.equal(f.rows.length,0);assert.ok(f.button('+ Add task'));
});
test('Creating from an empty list shows the actual task and labeled actions',async()=>{
  const f=schedulerUiFixture([]);await f.ui.refresh();await f.button('+ Add task').trigger('click');
  for(const [key,value] of [['title','Check watch'],['date','2026-11-09'],['time','12:20']]){const field=f.field(key);field.value=value;await field.trigger('input');}
  await f.all().find(node=>node.tagName==='form').trigger('submit');const request=f.calls.find(call=>call.method==='POST'),input=JSON.parse(request.body);
  assert.equal(request.path,'/api/tasks');assert.match(input.id,/^[a-f0-9-]{36}$/);assert.equal(input.title,'Check watch');assert.equal(input.dueDate,'2026-11-09');assert.equal(input.dueTime,'12:20');assert.equal(input.timeZone,Intl.DateTimeFormat().resolvedOptions().timeZone);assert.equal(f.rows.length,1);assert.equal(f.field('title'),undefined);
  assert.ok(f.byLabel('Edit task: Check watch'));assert.ok(f.byLabel('Delete task: Check watch'));assert.ok(f.all().some(node=>node.tagName==='span'&&node.textContent==='Edit'));assert.ok(f.all().some(node=>node.tagName==='span'&&node.textContent==='Delete'));
});
test('A lost create response preserves fields and UUID for retry without duplicates',async()=>{
  const f=schedulerUiFixture([]);await f.ui.refresh();await f.button('+ Add task').trigger('click');f.field('title').value='Do not lose the task';await f.field('title').trigger('input');
  f.loseCreateResponse();await f.all().find(node=>node.tagName==='form').trigger('submit');assert.equal(f.rows.length,1);assert.equal(f.field('title').value,'Do not lose the task');const date=f.field('date').value;
  await f.ui.refresh();assert.equal(f.field('date').value,date);await f.all().find(node=>node.tagName==='form').trigger('submit');
  const requests=f.calls.filter(call=>call.method==='POST').map(call=>JSON.parse(call.body));assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(f.rows.length,1);assert.equal(f.field('title'),undefined);
});
