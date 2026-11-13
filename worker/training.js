function trainingEndpoint(env,path){const base=localSpeechUrl(env.TRAINING_URL);return base?base.replace(/\/$/,'')+path:null}
async function trainerRequest(env,path,body){
  const url=trainingEndpoint(env,path);if(!url)fail('trainer_not_connected',503);
  const headers={'content-type':'application/json'};if(env.TRAINING_KEY)headers.authorization='Bearer '+env.TRAINING_KEY;
  let response;try{response=await fetch(url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(body?15000:2500)})}catch{fail('trainer_not_connected',503)}
  if(!response.ok){const status=response.status;await response.body?.cancel();fail(status===404?'trainer_job_not_found':'trainer_unavailable',status===404?404:503)}return response.json();
}
function trainingJob(row){return {id:row.id,status:row.status,examples:row.example_count,createdAt:row.created_at,updatedAt:row.updated_at,progress:JSON.parse(row.progress_json||'{}')}}
async function trainingRoute(request,env,user,profile,id){
  const db=database(env);
  if(id){
    if(!/^[a-f0-9-]{36}$/i.test(id))fail('invalid_input',400);
    const row=await db.prepare('SELECT * FROM journal_training_jobs WHERE id=? AND owner_id=? AND astronaut_id=?').bind(id,user,profile).first();if(!row)fail('not_found',404);
    if(request.method!=='GET'&&request.method!=='DELETE')fail('method_not_allowed',405);
    if(request.method==='DELETE'||['queued','running','unconfirmed'].includes(row.status)){
      let state;try{state=await trainerRequest(env,'/jobs/'+row.id+(request.method==='DELETE'?'/cancel':''),request.method==='DELETE'?{ownerId:user}:undefined)}catch(error){if(error.code!=='trainer_job_not_found')throw error;state={status:request.method==='DELETE'?'cancelled':'failed',adapterReady:false}}
      const allowed=['queued','running','completed','failed','cancelled','interrupted'];if(!allowed.includes(state.status))fail('trainer_unavailable',503);
      const progress={step:Number.isFinite(state.step)?Math.max(0,Math.min(200,state.step)):0,total:200,loss:Number.isFinite(state.loss)?state.loss:null,adapterReady:state.status==='completed'&&state.adapterReady===true};
      row.status=state.status;row.progress_json=JSON.stringify(progress);row.updated_at=new Date().toISOString();
      await db.prepare('UPDATE journal_training_jobs SET status=?,progress_json=?,updated_at=? WHERE id=? AND owner_id=? AND astronaut_id=?').bind(row.status,row.progress_json,row.updated_at,id,user,profile).run();
    }
    return json({job:trainingJob(row)});
  }
  const count=await db.prepare("SELECT COUNT(DISTINCT content) AS total FROM journal_messages WHERE owner_id=? AND astronaut_id=? AND role='note' AND length(content)>=80").bind(user,profile).first();
  if(request.method==='GET'){
    let connected=false;if(trainingEndpoint(env,''))try{connected=(await trainerRequest(env,'/health')).ready===true}catch{}
    const {results}=await db.prepare('SELECT * FROM journal_training_jobs WHERE owner_id=? AND astronaut_id=? ORDER BY created_at DESC LIMIT 5').bind(user,profile).all();
    return json({examples:count.total,minimum:20,connected,model:'Qwen3 / local model',jobs:results.map(trainingJob)});
  }
  if(request.method!=='POST')fail('method_not_allowed',405);
  const raw=await request.text();if(raw.length>1000)fail('invalid_input',400);let input;try{input=JSON.parse(raw)}catch{fail('invalid_input',400)}
  if(input?.confirm!==true||typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id))fail('invalid_input',400);
  const existing=await db.prepare('SELECT * FROM journal_training_jobs WHERE id=?').bind(input.id).first();if(existing){if(existing.owner_id!==user||existing.astronaut_id!==profile)fail('id_conflict',409);return json({job:trainingJob(existing)})}
  if(count.total<20)fail('training_not_enough_data',409);if(!trainingEndpoint(env,''))fail('trainer_not_connected',503);
  const active=await db.prepare("SELECT id FROM journal_training_jobs WHERE owner_id=? AND astronaut_id=? AND status IN ('queued','running','unconfirmed') LIMIT 1").bind(user,profile).first();if(active)fail('training_already_running',409);
  const {results}=await db.prepare("SELECT content,wellbeing_json,MAX(created_at) AS latest FROM journal_messages WHERE owner_id=? AND astronaut_id=? AND role='note' AND length(content)>=80 GROUP BY content ORDER BY latest DESC LIMIT 500").bind(user,profile).all();
  const date=new Date().toISOString(),progress=JSON.stringify({step:0,total:200,adapterReady:false});
  // Save the run identifier first, so retrying does not create a second training job.
  await db.prepare('INSERT INTO journal_training_jobs (id,owner_id,astronaut_id,status,example_count,progress_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(input.id,user,profile,'queued',results.length,progress,date,date).run();
  try{const accepted=await trainerRequest(env,'/jobs',{id:input.id,ownerId:user,profile,entries:results.map(diaryDocument)});if(accepted.id!==input.id)fail('trainer_unavailable',503)}catch(error){await db.prepare('UPDATE journal_training_jobs SET status=?,updated_at=? WHERE id=? AND owner_id=? AND astronaut_id=?').bind('unconfirmed',date,input.id,user,profile).run();throw error}
  if(typeof activityWrite==='function')await activityWrite(env,user,'training_queued','Started fine-tuning / LoRA / '+results.length+' entries','training:'+input.id);
  return json({job:{id:input.id,status:'queued',examples:results.length,createdAt:date,updatedAt:date,progress:JSON.parse(progress)}},202);
}
