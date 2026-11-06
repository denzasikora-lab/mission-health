const bookVectorModel='embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:text:256:v1';
function bookUnitVector(value){
  if(!Array.isArray(value)||value.length!==256||value.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100))fail('invalid_vector',400);
  const norm=Math.hypot(...value);if(norm<.01||norm>100)fail('invalid_vector',400);return value.map(n=>n/norm);
}
async function bookRoute(request,env,user,profile,action,url){
  const db=database(env);
  if(action==='book'&&request.method==='GET'){
    let cursor=null;try{cursor=url.searchParams.has('cursor')?JSON.parse(url.searchParams.get('cursor')):null}catch{fail('invalid_input',400)}
    if(cursor&&(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||cursor[0].length>40||typeof cursor[1]!=='string'||!/^[a-f0-9-]{36}$/i.test(cursor[1])))fail('invalid_input',400);
    const filter=cursor?' AND (created_at<? OR (created_at=? AND id<?))':'';
    const {results}=await db.prepare("SELECT * FROM journal_messages WHERE owner_id=? AND astronaut_id=? AND role!='assistant'"+filter+' ORDER BY created_at DESC,id DESC LIMIT 25').bind(user,profile,...(cursor?[cursor[0],cursor[0],cursor[1]]:[])).all();
    const rows=results.slice(0,24),last=rows.at(-1),count=await db.prepare("SELECT COUNT(*) AS total FROM journal_messages WHERE owner_id=? AND astronaut_id=? AND role!='assistant'").bind(user,profile).first();
    const entries=await Promise.all(rows.map(async row=>{
      const entry=await hydratedMessage(env,user,profile,row);
      if(profile==='personal'&&row.assistant_source==='media-upload'){
        const observation=await mediaBookObservation(env,user,row);
        if(observation){entry.observation=observation;entry.references=[{type:'media',id:row.id,kind:observation.kind,duration:observation.duration,createdAt:row.created_at}];}
      }
      return entry;
    }));
    return json({entries,total:count.total,hasMore:results.length>24,cursor:last?JSON.stringify([last.created_at,last.id]):null});
  }
  if(action==='book-index'&&request.method==='GET'){
    const {results}=await db.prepare("SELECT m.id,m.content,m.created_at,m.wellbeing_json FROM journal_messages m LEFT JOIN journal_text_vectors v ON v.message_id=m.id AND v.owner_id=m.owner_id AND v.astronaut_id=m.astronaut_id AND v.model=? WHERE m.owner_id=? AND m.astronaut_id=? AND m.role!='assistant' AND v.message_id IS NULL ORDER BY m.created_at DESC,m.id DESC LIMIT 12").bind(bookVectorModel,user,profile).all();
    return json({entries:results.map(row=>({id:row.id,content:diaryDocument(row),createdAt:row.created_at})),model:bookVectorModel});
  }
  if(!['book-vectors','book-search','book-answer'].includes(action)||request.method!=='POST')fail('method_not_allowed',405);
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('invalid_input',400);
  const raw=await request.text();if(raw.length>100000)fail('invalid_input',400);let input;try{input=JSON.parse(raw)}catch{fail('invalid_input',400)}
  if(action==='book-answer'){
    if(typeof input?.query!=='string'||!input.query.trim()||input.query.length>1000||!Array.isArray(input.ids)||!input.ids.length||input.ids.length>6||input.ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)))fail('invalid_input',400);
    const rows=[];for(const id of [...new Set(input.ids)]){const row=await db.prepare("SELECT * FROM journal_messages WHERE id=? AND owner_id=? AND astronaut_id=? AND role!='assistant'").bind(id,user,profile).first();if(!row)fail('not_found',404);rows.push(row);}
    if(!languageModelConfigured(env))fail('assistant_unavailable',503);
    const answer=await languageModelAnswer(env,{query:input.query.trim(),language:'ru',history:[],photos:[],references:rows.map(row=>({...serialize(row),content:diaryDocument(row)}))});
    return json({answer:answer.text.slice(0,16000).replaceAll('\u0451','\u0435').replaceAll('\u0401','\u0415').replace(/[\u2013\u2014]/g,'-'),references:rows.map(serialize)});
  }
  if(action==='book-vectors'){
    if(input?.model!==bookVectorModel||typeof input.id!=='string'||!Array.isArray(input.vectors)||!input.vectors.length||input.vectors.length>8)fail('invalid_input',400);
    const vectors=input.vectors.map(bookUnitVector);
    const row=await db.prepare("SELECT id FROM journal_messages WHERE id=? AND owner_id=? AND astronaut_id=? AND role!='assistant'").bind(input.id,user,profile).first();if(!row)fail('not_found',404);
    await db.prepare('INSERT INTO journal_text_vectors (message_id,owner_id,astronaut_id,model,vectors_json,indexed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(message_id) DO UPDATE SET model=excluded.model,vectors_json=excluded.vectors_json,indexed_at=excluded.indexed_at WHERE owner_id=excluded.owner_id AND astronaut_id=excluded.astronaut_id').bind(row.id,user,profile,bookVectorModel,JSON.stringify(vectors),new Date().toISOString()).run();
    return json({indexed:true});
  }
  if(typeof input?.query!=='string'||!input.query.trim()||input.query.length>1000)fail('invalid_input',400);
  if(!input.vector){
    if(memoryConfigured(env))try{await syncPending(env,user,profile);return json({matches:await vectorMatches(env,user,profile,input.query),method:'qdrant',model:'EmbeddingGemma 2'})}catch{}
    return json({needsVector:true,model:bookVectorModel});
  }
  if(input.model!==bookVectorModel)fail('invalid_vector',400);const query=bookUnitVector(input.vector);
  // Ограничение защищает память воркера; интерфейс явно показывает фактический охват.
  const {results}=await db.prepare("SELECT m.*,v.vectors_json FROM journal_text_vectors v JOIN journal_messages m ON m.id=v.message_id AND m.owner_id=v.owner_id AND m.astronaut_id=v.astronaut_id WHERE m.owner_id=? AND m.astronaut_id=? AND m.role!='assistant' AND v.model=? ORDER BY m.created_at DESC,m.id DESC LIMIT 500").bind(user,profile,bookVectorModel).all();
  const ranked=results.map(row=>({row,score:Math.max(...JSON.parse(row.vectors_json).map(vector=>vector.reduce((sum,n,i)=>sum+n*query[i],0)))})).filter(item=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score).slice(0,6);
  return json({matches:await Promise.all(ranked.map(async({row,score})=>({...await hydratedMessage(env,user,profile,row),score:Math.max(-1,Math.min(1,score))}))),method:'browser-vectors',model:'EmbeddingGemma 2',searchedCount:results.length,limit:500});
}
