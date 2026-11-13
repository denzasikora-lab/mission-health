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
  const sections={overview:'Home',observations:'Health',chat:'NasaGPT',diary:'Diary',archive:'Archive',favorites:'Favorites',sources:'Research'};
  const people={'jessica-meir':'Jessica Meir','jack-hathaway':'Jack Hathaway','christina-koch':'Christina Koch'};
  const areas={team:'group chat',chat:'NasaGPT',diary:'diary',caption:'story caption'};
  let summary;
  if(input.kind==='navigation'&&Object.hasOwn(sections,input.target)&&sections[input.target])summary='Opened section «'+sections[input.target]+'»';
  if(input.kind==='friend_visit'&&Object.hasOwn(people,input.profile)&&people[input.profile])summary='Visited / '+people[input.profile];
  if(input.kind==='media_open'&&['audio','video'].includes(input.mode))summary='Opened '+(input.mode==='audio'?'audio diary':'video diary');
  if(input.kind==='draft'&&Object.hasOwn(areas,input.area)&&Number.isInteger(input.length)&&input.length>=0&&input.length<=6000)summary=(input.length?'Edited draft in '+areas[input.area]+' / '+input.length+' characters':'Cleared draft in '+areas[input.area]);
  if(input.kind==='wellbeing'){const report=selfReport({score:input.score,wellbeingScale:input.wellbeingScale});summary='Selected wellbeing / '+report.score+' from 100';}
  if(input.kind==='training_review')summary='Opened preparation fine-tuning / LoRA';
  if(input.kind==='camera_click')summary='Pressed camera toggle';
  if(input.kind==='microphone_click')summary='Pressed microphone toggle';
  if(!summary)fail('invalid_input',400);
  const id='ui:'+user+':'+input.id;
  if(!await activityWrite(env,user,input.kind,summary,id))fail('storage_unavailable',503);
  return json({recorded:true},201);
}
