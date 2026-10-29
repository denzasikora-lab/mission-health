function actiwatchView(row){return {id:row.id,filename:row.filename,summary:JSON.parse(row.summary_json),diaryMessageId:row.diary_message_id,createdAt:row.created_at,source:'Actiwatch / Actiware CSV'};}
function actiwatchStorage(env){if(!env.PHOTOS)fail('storage_unavailable',503);return env.PHOTOS;}
function actiwatchNote(summary,filename){
  const window=summary.latest24h,minutes=value=>Math.round(value/60),lines=[
    'Actiwatch / импорт Actiware',
    'Источник: '+filename+'. Это данные загруженного файла, без прямого подключения к часам.',
    'Период записи: '+summary.start+' - '+summary.end+'. Эпоха: '+summary.epochSeconds+' с. Эпох: '+summary.rowCount+'.',
    'Окно последних 24 часов до '+window.end+'. Покрытие: '+minutes(window.coveredSeconds)+' мин; классифицировано сон/бодрствование: '+minutes(window.sleepScoredSeconds)+' мин.',
    window.sleepSeconds===null?'Метки сна не предоставлены или непригодны. Сон по неподвижности не вычислялся.':'Сон по готовым меткам Actiware: '+minutes(window.sleepSeconds)+' мин; бодрствование: '+minutes(window.wakeSeconds)+' мин.',
    window.activityCounts===null?'Пригодных измерений активности нет.':'Активность полных эпох: '+window.activityCounts+' counts. Это относительные отсчеты, не шаги и не калории.',
    window.meanLightLux===null?'Пригодных измерений белого света нет.':'Белый свет: среднее '+window.meanLightLux.toFixed(1)+' лк, максимум '+window.maxLightLux.toFixed(1)+' лк.',
    'Снятые часы за запись: '+minutes(summary.offWristSeconds)+' мин; исключенные эпохи: '+minutes(summary.excludedSeconds)+' мин.',
    'Actiwatch не предоставил в этой записи пульс, SpO2, ЭКГ или температуру. Интерпретация сна зависит от меток исходного ПО.'
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
      db.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,references_json,attachments_json,assistant_source) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(diaryId,user,'personal','note',actiwatchNote(summary,filename),'ru',date,'pending','[]','[]','actiwatch')
    ]);
  }catch(error){
    await actiwatchStorage(env).delete(key);
    const raced=await db.prepare('SELECT * FROM actiwatch_imports WHERE owner_id=? AND digest=?').bind(user,digest).first();if(raced)return json({import:actiwatchView(raced),duplicate:true});throw error;
  }
  if(typeof activityWrite==='function')await activityWrite(env,user,'actiwatch_imported','Добавил данные Actiwatch / '+summary.rowCount+' эпох','actiwatch:'+input.id);
  const row=await db.prepare('SELECT * FROM actiwatch_imports WHERE id=? AND owner_id=?').bind(input.id,user).first();
  return json({import:actiwatchView(row),duplicate:false},201);
}
