const readingNames={heart_rate:'Heart rate',spo2:'Blood oxygen saturation',body_temperature:'Body temperature',skin_temperature:'Skin temperature',bp_systolic:'Systolic blood pressure',bp_diastolic:'Diastolic blood pressure',respiratory_rate:'Respiratory rate',fatigue_index:'User-provided fatigue index',stress_index:'User-provided stress index',wellbeing:'Self-reported wellbeing',recovery:'User-provided recovery index',sleep_hours:'Sleep duration',hrv:'Heart-rate variability',steps:'Steps',activity:'Activity',light:'Illuminance'};
function readingRecordView(row){return {id:row.id,snapshot:JSON.parse(row.snapshot_json),sourceName:row.source_name,createdAt:row.created_at,vectorStatus:row.vector_status==='indexed'?'indexed':'pending'};}
function readingSnapshotInput(input){
  let snapshot;try{snapshot=globalThis.MissionHealthRules.normalize(input);}catch{fail('invalid_health_snapshot',400);}
  const values=Object.values(snapshot.readings).filter(Boolean);
  if(snapshot.actiwatchImportId!==null||!values.length||values.some(reading=>reading.source!=='manual'))fail('invalid_health_snapshot',400);
  return snapshot;
}
function readingSourceName(value){
  if(typeof value!=='string'||/[\u0000-\u001f\u007f-\u009f]/.test(value))fail('invalid_source_name',400);
  const name=value.trim().replace(/\s+/gu,' ');if(!name||name.length>120)fail('invalid_source_name',400);return name;
}
function readingJournalText(snapshot,sourceName){
  const lines=['Personal measurement record','Source: '+sourceName,'Input channel: user-provided manual data. A direct device connection has not been verified.','Snapshot captured: '+snapshot.capturedAt];
  for(const [key,reading] of Object.entries(snapshot.readings))if(reading)lines.push((readingNames[key]||key)+': '+reading.value+' '+reading.unit+' / observed '+reading.observedAt);
  return lines.join('\n');
}
async function latestReadingSnapshot(db,user){
  const {results}=await db.prepare("SELECT reading_key,reading_json,record_id,source_name,created_at FROM (SELECT j.key AS reading_key,j.value AS reading_json,r.id AS record_id,r.source_name,r.created_at,ROW_NUMBER() OVER (PARTITION BY j.key ORDER BY json_extract(j.value,'$.observedAt') DESC,r.created_at DESC,r.id DESC) AS position FROM health_readings r,json_each(r.snapshot_json,'$.readings') j WHERE r.owner_id=? AND j.type='object' AND json_extract(j.value,'$.source')='manual') WHERE position=1").bind(user).all();
  const readings={},provenance={};
  for(const row of results){readings[row.reading_key]=JSON.parse(row.reading_json);provenance[row.reading_key]={recordId:row.record_id,sourceName:row.source_name,createdAt:row.created_at};}
  const snapshot=globalThis.MissionHealthRules.normalize({profileId:'personal',capturedAt:new Date().toISOString(),actiwatchImportId:null,readings});
  return {snapshot,provenance};
}
async function readingRecord(db,id){return db.prepare('SELECT r.*,j.vector_status FROM health_readings r LEFT JOIN journal_messages j ON j.id=r.id AND j.owner_id=r.owner_id AND j.astronaut_id=? WHERE r.id=?').bind('personal',id).first();}
async function readingsRoute(request,env,user){
  const db=database(env);
  if(request.method==='GET'){
    const {results}=await db.prepare('SELECT r.*,j.vector_status FROM health_readings r LEFT JOIN journal_messages j ON j.id=r.id AND j.owner_id=r.owner_id AND j.astronaut_id=? WHERE r.owner_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 201').bind('personal',user).all();
    return json({...await latestReadingSnapshot(db,user),records:results.slice(0,200).map(readingRecordView),maxRecords:200,truncated:results.length>200});
  }
  if(request.method!=='POST')fail('method_not_allowed',405);
  const input=await personalInput(request);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['id','snapshot','sourceName'].includes(key))||typeof input.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.id))fail('invalid_input',400);
  const snapshot=readingSnapshotInput(input.snapshot),snapshotText=JSON.stringify(snapshot),sourceName=readingSourceName(input.sourceName);
  let row=await readingRecord(db,input.id),created=false;
  if(row&&(row.owner_id!==user||row.snapshot_json!==snapshotText||row.source_name!==sourceName))fail('id_conflict',409);
  if(!row){
    if(await db.prepare('SELECT id FROM journal_messages WHERE id=?').bind(input.id).first())fail('id_conflict',409);
    const createdAt=new Date().toISOString(),content=readingJournalText(snapshot,sourceName);
    const outcomes=await db.batch([
      db.prepare('INSERT OR IGNORE INTO health_readings (id,owner_id,snapshot_json,source_name,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM journal_messages WHERE id=?)').bind(input.id,user,snapshotText,sourceName,createdAt,input.id),
      db.prepare("INSERT OR IGNORE INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,references_json,attachments_json,assistant_source) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM health_readings WHERE id=? AND owner_id=? AND snapshot_json=? AND source_name=?)").bind(input.id,user,'personal','note',content,'en',createdAt,'pending','[]','[]','measurement-record',input.id,user,snapshotText,sourceName)
    ]);
    created=Boolean(outcomes[0]?.meta?.changes??outcomes[0]?.changes);
    row=await readingRecord(db,input.id);
    if(!row||row.owner_id!==user||row.snapshot_json!==snapshotText||row.source_name!==sourceName)fail('id_conflict',409);
  }
  const note=await db.prepare('SELECT * FROM journal_messages WHERE id=? AND owner_id=? AND astronaut_id=?').bind(row.id,user,'personal').first();
  if(!note||note.assistant_source!=='measurement-record'||note.content!==readingJournalText(JSON.parse(row.snapshot_json),row.source_name))fail('reading_record_unavailable',503);
  if(note.vector_status!=='indexed')await indexEntry(env,note);
  row=await readingRecord(db,input.id);
  return json({record:readingRecordView(row),...await latestReadingSnapshot(db,user),duplicate:!created},created?201:200);
}
