function actiwatchView(row){return {id:row.id,filename:row.filename,summary:JSON.parse(row.summary_json),diaryMessageId:row.diary_message_id,createdAt:row.created_at,source:'Actiwatch / Actiware CSV'};}
function actiwatchStorage(env){if(!env.PHOTOS)fail('storage_unavailable',503);return env.PHOTOS;}
function actiwatchNote(summary,filename){
  const window=summary.latest24h,minutes=value=>Math.round(value/60),lines=[
    'Actiwatch / import Actiware',
    'Source: '+filename+'. These data come from an uploaded file, without direct watch connection.',
    'Recording period: '+summary.start+' - '+summary.end+'. Epoch: '+summary.epochSeconds+' s. Epochs: '+summary.rowCount+'.',
    'Last window of 24 hours ending at '+window.end+'. Coverage: '+minutes(window.coveredSeconds)+' min; classified as sleep/wakefulness: '+minutes(window.sleepScoredSeconds)+' min.',
    window.sleepSeconds===null?'Sleep labels are missing or unusable. Sleep was not inferred from inactivity.':'Sleep from supplied labels Actiware: '+minutes(window.sleepSeconds)+' min; wakefulness: '+minutes(window.wakeSeconds)+' min.',
    window.activityCounts===null?'No usable activity measurements.':'Complete epoch activity: '+window.activityCounts+' counts. These are relative counts, not steps or calories.',
    window.meanLightLux===null?'No usable white-light measurements.':'White light: mean '+window.meanLightLux.toFixed(1)+' lx, maximum '+window.maxLightLux.toFixed(1)+' lx.',
    'Watch removed during recording: '+minutes(summary.offWristSeconds)+' min; excluded epochs: '+minutes(summary.excludedSeconds)+' min.',
    'Actiwatch did not provide pulse in this recording, SpO2, ECG or temperature. Sleep interpretation depends on source software labels.'
  ];return lines.join('\n');
}
async function actiwatchRoute(request,env,user,id){
  const db=database(env);
  if(request.method==='GET'){
    if(id){
      const row=await db.prepare('SELECT * FROM actiwatch_imports WHERE id=? AND owner_id=?').bind(id,user).first();if(!row)fail('not_found',404);
      const object=await actiwatchStorage(env).get(row.object_key);if(!object)fail('storage_unavailable',503);
      return json({import:actiwatchView(row),recording:JSON.parse(await object.text())});
    }
    const {results}=await db.prepare('SELECT * FROM actiwatch_imports WHERE owner_id=? ORDER BY recorded_end DESC,created_at DESC LIMIT 10').bind(user).all();
    return json({imports:results.map(actiwatchView),latest:results[0]?actiwatchView(results[0]):null});
  }
  if(request.method!=='POST'||id)fail('method_not_allowed',405);
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('invalid_input',400);
  const bytes=await boundedBytes(request,10000000);let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('invalid_actiwatch',400);}
  if(!input||typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id)||typeof input.filename!=='string'||!input.filename.trim()||input.filename.length>160)fail('invalid_actiwatch',400);
  let recording,summary;try{recording=globalThis.MissionActiwatch.validate(input.recording);summary=globalThis.MissionActiwatch.summarize(recording);}catch{fail('invalid_actiwatch',400);}
  const canonical=JSON.stringify(recording),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),value=>value.toString(16).padStart(2,'0')).join('');
  const byId=await db.prepare('SELECT * FROM actiwatch_imports WHERE id=?').bind(input.id).first();
  if(byId){if(byId.owner_id!==user||byId.digest!==digest)fail('id_conflict',409);return json({import:actiwatchView(byId),duplicate:true});}
  const previous=await db.prepare('SELECT * FROM actiwatch_imports WHERE owner_id=? AND digest=?').bind(user,digest).first();if(previous)return json({import:actiwatchView(previous),duplicate:true});
  const filename=input.filename.replace(/[\r\n\t]/g,' ').trim(),key='actiwatch/'+crypto.randomUUID(),diaryId=crypto.randomUUID(),date=new Date().toISOString();
  await actiwatchStorage(env).put(key,canonical,{httpMetadata:{contentType:'application/json'}});
  try{
    await db.batch([
      db.prepare('INSERT INTO actiwatch_imports (id,owner_id,digest,filename,object_key,summary_json,recorded_end,diary_message_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(input.id,user,digest,filename,key,JSON.stringify(summary),summary.end,diaryId,date),
      db.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,references_json,attachments_json,assistant_source) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(diaryId,user,'personal','note',actiwatchNote(summary,filename),'en',date,'pending','[]','[]','actiwatch')
    ]);
  }catch(error){
    await actiwatchStorage(env).delete(key);
    const raced=await db.prepare('SELECT * FROM actiwatch_imports WHERE owner_id=? AND digest=?').bind(user,digest).first();if(raced)return json({import:actiwatchView(raced),duplicate:true});throw error;
  }
  if(typeof activityWrite==='function')await activityWrite(env,user,'actiwatch_imported','Imported data Actiwatch / '+summary.rowCount+' epochs','actiwatch:'+input.id);
  const row=await db.prepare('SELECT * FROM actiwatch_imports WHERE id=? AND owner_id=?').bind(input.id,user).first();
  return json({import:actiwatchView(row),duplicate:false},201);
}
