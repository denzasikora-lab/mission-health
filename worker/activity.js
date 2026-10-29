async function activityWrite(env,user,kind,summary,id=crypto.randomUUID()){
  try{await database(env).prepare('INSERT OR IGNORE INTO activity_events (id,owner_id,kind,summary,created_at) VALUES (?,?,?,?,?)').bind(id,user,kind,summary.slice(0,250),new Date().toISOString()).run();return true;}catch{return false;}
}
async function activityRoute(request,env,user){
  if(request.method==='GET'){
    const {results}=await database(env).prepare('SELECT id,kind,summary,created_at FROM activity_events WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 80').bind(user).all();
    return json({events:results.map(row=>({id:row.id,kind:row.kind,summary:row.summary,createdAt:row.created_at}))});
  }
  if(request.method!=='POST')fail('method_not_allowed',405);
  const input=await personalInput(request);if(!input||typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id))fail('invalid_input',400);
  const sections={overview:'Домой',observations:'Наблюдения',chat:'NasaGPT',diary:'Дневник',favorites:'Избранное',sources:'Источники'};
  const people={'jessica-meir':'Jessica Meir','jack-hathaway':'Jack Hathaway','christina-koch':'Christina Koch'};
  const areas={chat:'NasaGPT',diary:'дневнике',caption:'подписи сториз'};
  let summary;
  if(input.kind==='navigation'&&Object.hasOwn(sections,input.target)&&sections[input.target])summary='Открыл раздел «'+sections[input.target]+'»';
  if(input.kind==='friend_visit'&&Object.hasOwn(people,input.profile)&&people[input.profile])summary='Зашел в гости / '+people[input.profile];
  if(input.kind==='media_open'&&['audio','video'].includes(input.mode))summary='Открыл '+(input.mode==='audio'?'аудиодневник':'видеодневник');
  if(input.kind==='draft'&&Object.hasOwn(areas,input.area)&&Number.isInteger(input.length)&&input.length>=0&&input.length<=6000)summary=(input.length?'Изменил черновик в '+areas[input.area]+' / '+input.length+' символов':'Очистил черновик в '+areas[input.area]);
  if(input.kind==='wellbeing'&&Number.isInteger(input.score)&&input.score>=1&&input.score<=10)summary='Выбрал самочувствие / '+input.score+' из 10';
  if(input.kind==='training_review')summary='Открыл подготовку fine-tuning / LoRA';
  if(input.kind==='camera_click')summary='Нажал переключатель камеры';
  if(input.kind==='microphone_click')summary='Нажал переключатель микрофона';
  if(!summary)fail('invalid_input',400);
  const id='ui:'+user+':'+input.id;
  if(!await activityWrite(env,user,input.kind,summary,id))fail('storage_unavailable',503);
  return json({recorded:true},201);
}
