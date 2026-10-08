const reserveModel='Qwen3.5-0.8B-ONNX-OPT:969350d5f4647ec9ac277110f8974c65d8c10e4b:q4';
async function localReplyContext(env,user,astronaut,row){
  let references=(await retrieve(env,user,astronaut,row.content)).filter(x=>x.id!==row.id);
  const recent=await history(env,user,astronaut);if(!references.length)references=recent.messages.filter(x=>x.role!=='assistant'&&x.id!==row.id).slice(-4);
  return {ownerId:user,astronautId:astronaut,query:row.content,language:row.language,references:references.slice(0,4),history:recent.messages.slice(-4),photos:await photoContext(env,user,astronaut,JSON.parse(row.attachments_json||'[]'),row.content)};
}
async function localReplyRoute(request,env,user,astronaut,id,action){
  const row=await database(env).prepare("SELECT * FROM journal_messages WHERE id=? AND owner_id=? AND astronaut_id=? AND role='user'").bind(id,user,astronaut).first();if(!row)fail('not_found',404);
  if(action==='context'&&request.method==='GET'){const context=await localReplyContext(env,user,astronaut,row);return json({system:diaryPrompt(context),query:row.content,language:row.language,records:context.references.map(x=>({date:x.createdAt,text:x.content.slice(0,800)})),history:context.history.map(x=>({role:x.role==='assistant'?'assistant':'user',content:x.content.slice(0,600)})),photos:context.photos.map(({dataUrl,...photo})=>photo)})}
  if(action!=='reply'||request.method!=='POST')fail('method_not_allowed',405);
  const raw=await boundedBytes(request,32000);let input;try{input=JSON.parse(new TextDecoder().decode(raw))}catch{fail('invalid_input',400)}
  if(input.model!==reserveModel||typeof input.content!=='string'||!input.content.trim()||input.content.length>8000)fail('invalid_input',400);
  const existing=await database(env).prepare('SELECT * FROM journal_messages WHERE reply_to=? AND owner_id=? AND astronaut_id=?').bind(id,user,astronaut).first();if(existing)return json({reply:await hydratedMessage(env,user,astronaut,existing)});
  const context=await localReplyContext(env,user,astronaut,row),references=[...context.references.map(x=>({id:x.id,createdAt:x.createdAt,content:x.content.slice(0,160)})),...context.photos.map(({dataUrl,...photo})=>({...photo,type:'photo',content:photo.region}))];
  const content=input.content.trim().replaceAll('ё','е').replaceAll('Ё','Е').replace(/[—–]/g,'-'),date=new Date().toISOString();
  await database(env).prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,reply_to,references_json,assistant_source) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM journal_messages WHERE reply_to=? AND owner_id=? AND astronaut_id=?)').bind(crypto.randomUUID(),user,astronaut,'assistant',content,row.language,date,'not_applicable',id,JSON.stringify(references),'browser:'+reserveModel,id,user,astronaut).run();
  const reply=await database(env).prepare('SELECT * FROM journal_messages WHERE reply_to=? AND owner_id=? AND astronaut_id=?').bind(id,user,astronaut).first();return json({reply:await hydratedMessage(env,user,astronaut,reply)});
}
