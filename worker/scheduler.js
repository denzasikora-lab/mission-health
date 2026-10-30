function taskTimeZone(value){try{const zone=typeof value==='string'&&value.length<80?value:'UTC';new Intl.DateTimeFormat('en',{timeZone:zone}).format();return zone;}catch{return 'UTC';}}
function taskDateParts(date,zone){const entries=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(entries.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function taskDateString(parts){return parts.year+'-'+String(parts.month).padStart(2,'0')+'-'+String(parts.day).padStart(2,'0');}
function taskAddDays(date,days){return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);}
function taskZonedInstant(date,hour,minute,zone){const [year,month,day]=date.split('-').map(Number),target=Date.UTC(year,month-1,day,hour,minute);let guess=target;for(let i=0;i<4;i++){const p=taskDateParts(new Date(guess),zone),actual=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);guess+=target-actual;}const p=taskDateParts(new Date(guess),zone);return taskDateString(p)===date&&p.hour===hour&&p.minute===minute?new Date(guess).toISOString():null;}
function plannedFromText(content,createdAt,timeZone){
  const zone=taskTimeZone(timeZone),now=new Date(createdAt),result=[];
  if(!Number.isFinite(now.valueOf()))return result;
  const today=taskDateString(taskDateParts(now,zone));
  for(const original of content.split(/[;\n]+/).slice(0,20)){
    const normalized=original.replaceAll('\u0451','\u0435').replaceAll('\u0401','\u0415'),lower=normalized.toLocaleLowerCase().replaceAll('\u0451','\u0435');
    if(original.length<5||original.startsWith('>')||/\?|вчера|yesterday|не\s+(?:надо|нужно|напоминай|планируй)|уже\s+(?:сделал|сделала|выполнил)|кажд(?:ый|ую|ое)|\bevery\b/u.test(lower))continue;
    if(!/(?:напомни|запланируй|нужно|надо|не забыть|прием|встреч|должен|планирую|(?:^|\s)[а-я]{4,}(?:ть|ти)(?=\s|[.,!]|$)|remind|schedule|need to|have to|appointment|meeting|\bcall\b|\bcheck\b)/u.test(lower))continue;
    let date=null,dueAt=null,temporal=[],hour=null,minute=0;
    const relative=lower.match(/(?:через|in)\s+(\d{1,3})\s*(минут[а-я]*|час[а-я]*|дн[а-я]*|день|minutes?|hours?|days?)/u);
    if(relative){const n=Number(relative[1]),unit=relative[2];if(n<1||n>365)continue;temporal.push(relative[0]);if(/мин|minute|час|hour/u.test(unit)){dueAt=new Date(now.valueOf()+n*(/час|hour/u.test(unit)?3600000:60000)).toISOString();date=taskDateString(taskDateParts(new Date(dueAt),zone));}else date=taskAddDays(today,n);}
    const time=lower.match(/(?:^|\s)(?:в|at)\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*(утра|вечера|am|pm))?(?=\s|[,.!]|$)/u)||lower.match(/\b(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/u);
    if(time){hour=Number(time[1]);minute=time[2]&&/^\d+$/.test(time[2])?Number(time[2]):0;const period=time[3];if((period==='вечера'||period==='pm')&&hour<12)hour+=12;if(period==='am'&&hour===12)hour=0;if(hour>23||minute>59)continue;temporal.push(time[0].trim());}
    const iso=lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/u),numeric=lower.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/u);
    if(iso){date=iso[0];temporal.push(iso[0]);}else if(numeric&&!(time&&numeric[0]===time[0].trim())){date=(numeric[3]||today.slice(0,4))+'-'+numeric[2].padStart(2,'0')+'-'+numeric[1].padStart(2,'0');temporal.push(numeric[0]);}
    const months=['январ','феврал','март','апрел','мая','июн','июл','август','сентябр','октябр','ноябр','декабр'];
    if(!date){const named=lower.match(/\b(\d{1,2})\s+(январ[а-я]*|феврал[а-я]*|март[а-я]*|апрел[а-я]*|мая|июн[а-я]*|июл[а-я]*|август[а-я]*|сентябр[а-я]*|октябр[а-я]*|ноябр[а-я]*|декабр[а-я]*)(?:\s+(\d{4}))?/u);if(named){const month=months.findIndex(v=>named[2].startsWith(v))+1;date=(named[3]||today.slice(0,4))+'-'+String(month).padStart(2,'0')+'-'+named[1].padStart(2,'0');temporal.push(named[0]);}}
    if(!date){const word=lower.match(/послезавтра|завтра|сегодня|tomorrow|today/u);if(word){date=taskAddDays(today,word[0]==='послезавтра'?2:/завтра|tomorrow/u.test(word[0])?1:0);temporal.push(word[0]);}}
    if(!date){const weekdays=[['воскресень','sunday'],['понедельник','monday'],['вторник','tuesday'],['сред','wednesday'],['четверг','thursday'],['пятниц','friday'],['суббот','saturday']];for(let weekday=0;weekday<7;weekday++){const word=weekdays[weekday].find(v=>new RegExp('(?:^|\\s)'+v+'[а-яa-z]*(?=\\s|[,.!]|$)','u').test(lower));if(word){let days=(weekday-new Date(today+'T12:00:00Z').getUTCDay()+7)%7;date=taskAddDays(today,days);if(hour!==null&&days===0&&new Date(taskZonedInstant(date,hour,minute,zone)).valueOf()<=now.valueOf())date=taskAddDays(date,7);const found=lower.match(new RegExp('(?:в|on)?\\s*'+word+'[а-яa-z]*','u'));if(found)temporal.push(found[0].trim());break;}}}
    if(!date&&hour!==null){date=today;const instant=taskZonedInstant(date,hour,minute,zone);if(instant&&new Date(instant)<=now)date=taskAddDays(date,1);}
    if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)continue;
    if(hour!==null){dueAt=taskZonedInstant(date,hour,minute,zone);if(!dueAt)continue;}
    let title=normalized;for(const phrase of temporal.sort((a,b)=>b.length-a.length)){const at=title.toLocaleLowerCase().indexOf(phrase);if(at>=0)title=title.slice(0,at)+' '+title.slice(at+phrase.length);}title=title.replace(/(?:напомни(?:\s+мне)?|запланируй|нужно|надо|remind me(?: to)?|schedule|i need to|i have to)/giu,' ').replace(/\s+/g,' ').replace(/^[\s,.:\-]+|[\s,.:\-]+$/g,'').trim();if(!title)continue;
    result.push({title:(title[0].toUpperCase()+title.slice(1)).slice(0,200),dueDate:date,dueAt,timeZone:zone});if(result.length>=10)break;
  }
  return result;
}
function plannedTask(row){return{id:row.id,title:row.title,dueDate:row.due_date,dueAt:row.due_at,timeZone:row.time_zone,status:row.status,sourceMessageId:row.source_message_id,createdAt:row.created_at};}
async function planChatTasks(env,user,row,zone){
  const db=database(env),existing=await db.prepare('SELECT * FROM personal_tasks WHERE owner_id=? AND source_message_id=? ORDER BY ordinal').bind(user,row.id).all();if(existing.results.length)return existing.results.map(plannedTask);
  const tasks=plannedFromText(row.content,row.created_at,zone),created=new Date().toISOString();
  for(let ordinal=0;ordinal<tasks.length;ordinal++){const task=tasks[ordinal];await db.prepare('INSERT OR IGNORE INTO personal_tasks (id,owner_id,source_message_id,ordinal,title,due_date,due_at,time_zone,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user,row.id,ordinal,task.title,task.dueDate,task.dueAt,task.timeZone,'planned',created,created).run();}
  if(tasks.length)await activityWrite(env,user,'tasks_planned','Добавлено в запланированное / '+tasks.length,'tasks:'+row.id);
  return (await db.prepare('SELECT * FROM personal_tasks WHERE owner_id=? AND source_message_id=? ORDER BY ordinal').bind(user,row.id).all()).results.map(plannedTask);
}
async function tasksRoute(request,env,user,id){
  const db=database(env);
  if(!id&&request.method==='GET'){const {results}=await db.prepare("SELECT * FROM personal_tasks WHERE owner_id=? AND status!='cancelled' ORDER BY CASE status WHEN 'planned' THEN 0 ELSE 1 END,due_date,due_at,created_at LIMIT 200").bind(user).all();return json({tasks:results.map(plannedTask)});}
  if(id&&request.method==='PATCH'){const input=await personalInput(request);if(!['planned','done','cancelled'].includes(input.status))fail('invalid_input',400);const previous=await db.prepare('SELECT * FROM personal_tasks WHERE owner_id=? AND id=?').bind(user,id).first();if(!previous)fail('not_found',404);await db.prepare('UPDATE personal_tasks SET status=?,updated_at=? WHERE owner_id=? AND id=?').bind(input.status,new Date().toISOString(),user,id).run();return json({task:plannedTask({...previous,status:input.status})});}
  fail('method_not_allowed',405);
}
