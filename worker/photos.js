const videoModel='embeddinggemma-2-onnx:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768:140-video:1fps:12';
const photoModel='embeddinggemma-2-onnx:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768:280';
function photoStore(env){if(!env.PHOTOS)fail('photos_unavailable',503);return env.PHOTOS}
function photoView(row){return {id:row.id,kind:row.media_kind||'photo',duration:row.duration_ms?row.duration_ms/1000:null,posterUrl:row.media_kind==='video'?'/api/astronauts/'+row.astronaut_id+'/photos/'+row.id+'?frame=0':null,region:row.region,createdAt:row.created_at,width:row.width,height:row.height,vectorStatus:row.vector_status,url:'/api/astronauts/'+row.astronaut_id+'/photos/'+row.id}}
async function photoRow(env,user,astronaut,id){return database(env).prepare('SELECT * FROM journal_photos WHERE id=? AND owner_id=? AND astronaut_id=?').bind(id,user,astronaut).first()}
async function hydratedMessage(env,user,astronaut,row){
  const result=serialize(row);result.attachments=[];
  for(const id of JSON.parse(row.attachments_json||'[]')){const photo=await photoRow(env,user,astronaut,id);if(photo)result.attachments.push(photoView(photo))}
  const references=[];for(const reference of result.references){if(reference.type==='photo'){const photo=await photoRow(env,user,astronaut,reference.id);if(photo){const view=photoView(photo);if(photo.media_kind==='video'&&Number.isInteger(reference.frame)&&reference.frame>=0&&reference.frame<3){view.url+='?frame='+reference.frame;view.posterUrl=view.url}references.push({...reference,...view})}}else references.push(reference)}result.references=references;
  return result;
}
async function boundedBytes(request,limit){
  if(Number(request.headers.get('content-length'))>limit)fail('photo_too_large',413);
  const reader=request.body?.getReader();if(!reader)fail('invalid_input',400);
  let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('photo_too_large',413)}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
function photoMime(bytes){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(bytes.length>8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';if(bytes.length>12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';fail('invalid_photo',400)}
async function uploadPhoto(request,env,user,astronaut){
  photoStore(env);const raw=await boundedBytes(request,26000000);
  let form;try{form=await new Response(raw,{headers:{'content-type':request.headers.get('content-type')||''}}).formData()}catch{fail('invalid_photo',400)}
  const kind=form.get('kind')==='video'?'video':'photo',file=form.get('photo'),id=form.get('id'),region=String(form.get('region')||'').trim(),width=Number(form.get('width')),height=Number(form.get('height'));
  if(!file||typeof file.arrayBuffer!=='function'||! /^[a-f0-9-]{36}$/i.test(id||'')||!region||region.length>80||!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||width>(kind==='video'?7680:1600)||height>(kind==='video'?7680:1600))fail('invalid_photo',400);
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length>(kind==='video'?20000000:3000000)||bytes.length<64)fail('photo_too_large',413);
  const mime=kind==='video'?videoMime(bytes):photoMime(bytes),duration=kind==='video'?Number(form.get('duration')):null;
  if(kind==='video'&&(!Number.isFinite(duration)||duration<.1||duration>15.5))fail('invalid_video',400);
  const frameBytes=[];if(kind==='video'){for(const item of form.getAll('frame')){if(!item||typeof item.arrayBuffer!=='function'||item.size>1000000)fail('invalid_video',400);const frame=new Uint8Array(await item.arrayBuffer());if(photoMime(frame)!=='image/jpeg')fail('invalid_video',400);frameBytes.push(frame)}if(frameBytes.length!==3)fail('invalid_video',400)}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const existing=await database(env).prepare('SELECT * FROM journal_photos WHERE id=?').bind(id).first();
  if(existing){if(existing.owner_id!==user||existing.astronaut_id!==astronaut||existing.digest!==digest||existing.region!==region||existing.media_kind!==kind)fail('id_conflict',409);return json({photo:photoView(existing)})}
  const key='journal/'+crypto.randomUUID(),date=new Date().toISOString(),regionKey=region.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');
  await photoStore(env).put(key,bytes,{httpMetadata:{contentType:mime}});const frameKeys=[];try{for(const frame of frameBytes){const frameKey='journal/'+crypto.randomUUID();await photoStore(env).put(frameKey,frame,{httpMetadata:{contentType:'image/jpeg'}});frameKeys.push(frameKey)}}catch(error){await photoStore(env).delete([key,...frameKeys]);throw error}
  try{await database(env).prepare('INSERT INTO journal_photos (id,owner_id,astronaut_id,region,region_key,created_at,object_key,mime,width,height,bytes,digest,vector_status,media_kind,duration_ms,frames_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user,astronaut,region,regionKey,date,key,mime,width,height,bytes.length,digest,'pending',kind,duration?Math.round(duration*1000):null,JSON.stringify(frameKeys)).run()}catch(error){await photoStore(env).delete([key,...frameKeys]);throw error}
  return json({photo:photoView(await photoRow(env,user,astronaut,id))},201);
}
async function setPhotoVector(request,env,user,astronaut,id){
  const row=await photoRow(env,user,astronaut,id);if(!row)fail('not_found',404);
  const raw=await boundedBytes(request,25000);let input;try{input=JSON.parse(new TextDecoder().decode(raw))}catch{fail('invalid_input',400)}
  const expectedModel=row.media_kind==='video'?videoModel:photoModel;
  if(input.model!==expectedModel||!Array.isArray(input.vector)||input.vector.length!==768||input.vector.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>100))fail('invalid_vector',400);
  const norm=Math.hypot(...input.vector);if(norm<0.01||norm>100)fail('invalid_vector',400);
  const vector=input.vector.map(x=>x/norm);
  await database(env).prepare('UPDATE journal_photos SET vector_json=?,model=?,vector_status=? WHERE id=? AND owner_id=? AND astronaut_id=?').bind(JSON.stringify(vector),expectedModel,'indexed',id,user,astronaut).run();
  return json({photo:photoView({...row,vector_status:'indexed'}),comparison:await comparePhoto(env,user,astronaut,id)});
}
async function comparePhoto(env,user,astronaut,id){
  const current=await photoRow(env,user,astronaut,id);if(!current)fail('not_found',404);
  const {results}=await database(env).prepare('SELECT * FROM journal_photos WHERE owner_id=? AND astronaut_id=? AND region_key=? AND media_kind=? AND id!=? AND created_at<=? ORDER BY created_at DESC,id DESC LIMIT 200').bind(user,astronaut,current.region_key,current.media_kind||'photo',id,current.created_at).all();
  const vector=current.vector_json?JSON.parse(current.vector_json):null;
  const ranked=vector?results.filter(row=>row.model===current.model&&row.vector_json).map(row=>({row,score:JSON.parse(row.vector_json).reduce((sum,n,i)=>sum+n*vector[i],0)})).sort((a,b)=>b.score-a.score):[];
  const closest=ranked[0];
  return {current:photoView(current),previous:closest?{...photoView(closest.row),similarity:Math.max(-1,Math.min(1,closest.score))}:results[0]?photoView(results[0]):null,latest:results[0]?photoView(results[0]):null,comparedCount:ranked.length,method:closest?'embeddinggemma2':'chronological'};
}
async function photoContext(env,user,astronaut,ids,query){
  let current;
  if(ids.length)current=await photoRow(env,user,astronaut,ids[0]);
  else if(/video|clip|photo|picture|image|face|skin|mole/iu.test(query))current=await database(env).prepare('SELECT * FROM journal_photos WHERE owner_id=? AND astronaut_id=? ORDER BY created_at DESC LIMIT 1').bind(user,astronaut).first();
  if(!current)return [];
  const comparison=await comparePhoto(env,user,astronaut,current.id),items=[{...comparison.current,position:'current',method:comparison.method,comparedCount:comparison.comparedCount},comparison.latest?{...comparison.latest,position:'previous'}:null,comparison.previous?{...comparison.previous,position:'similar',similarity:comparison.previous.similarity}:null].filter(Boolean);
  const unique=items.filter((item,i)=>items.findIndex(x=>x.id===item.id)===i),ready=[];
  for(const item of unique){const row=await photoRow(env,user,astronaut,item.id);if(!row)continue;const keys=row.media_kind==='video'?JSON.parse(row.frames_json||'[]'):[row.object_key];for(let frame=0;frame<keys.length;frame++){const object=await photoStore(env).get(keys[frame]);if(!object)continue;const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));ready.push({...item,frame:row.media_kind==='video'?frame:null,url:row.media_kind==='video'?item.url+'?frame='+frame:item.url,posterUrl:row.media_kind==='video'?item.url+'?frame='+frame:null,dataUrl:'data:'+(row.media_kind==='video'?'image/jpeg':row.mime)+';base64,'+btoa(binary)})}}
  return ready;
}
async function photoRoute(request,env,user,astronaut,id,url){
  if(!id){if(request.method==='POST')return uploadPhoto(request,env,user,astronaut);if(request.method==='GET'){const before=url.searchParams.get('before')||'9999',last=url.searchParams.get('last')||'ffffffff-ffff-ffff-ffff-ffffffffffff';if(before.length>40||last.length>36)fail('invalid_input',400);const {results}=await database(env).prepare('SELECT * FROM journal_photos WHERE owner_id=? AND astronaut_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 13').bind(user,astronaut,before,before,last).all();return json({photos:results.slice(0,12).map(photoView),hasMore:results.length>12})}fail('method_not_allowed',405)}
  if(url.searchParams.has('compare')&&request.method==='GET')return json(await comparePhoto(env,user,astronaut,id));
  if(request.method==='PATCH')return setPhotoVector(request,env,user,astronaut,id);
  const row=await photoRow(env,user,astronaut,id);if(!row)fail('not_found',404);
  if(request.method==='DELETE'){await photoStore(env).delete([row.object_key,...JSON.parse(row.frames_json||'[]')]);await database(env).prepare('DELETE FROM journal_photos WHERE id=? AND owner_id=? AND astronaut_id=?').bind(id,user,astronaut).run();return json({deleted:true})}
  if(!['GET','HEAD'].includes(request.method))fail('method_not_allowed',405);
  const frame=url.searchParams.get('frame'),frames=JSON.parse(row.frames_json||'[]');if(frame!==null&&(!/^[0-2]$/.test(frame)||!frames[Number(frame)]))fail('not_found',404);
  const key=frame===null?row.object_key:frames[Number(frame)],mime=frame===null?row.mime:'image/jpeg',headers={'content-type':mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline','cross-origin-resource-policy':'same-origin'};
  const range=request.headers.get('range');let options,status=200;
  if(range&&frame===null&&row.media_kind==='video'){const match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match)return new Response(null,{status:416,headers:{...headers,'content-range':'bytes */'+row.bytes}});const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),row.bytes-1):row.bytes-1;if(start>end||start>=row.bytes)return new Response(null,{status:416,headers:{...headers,'content-range':'bytes */'+row.bytes}});options={range:{offset:start,length:end-start+1}};status=206;headers['content-range']='bytes '+start+'-'+end+'/'+row.bytes;headers['content-length']=String(end-start+1)}
  if(row.media_kind==='video')headers['accept-ranges']='bytes';
  const object=await photoStore(env).get(key,options);if(!object)fail('not_found',404);
  return new Response(request.method==='HEAD'?null:object.body,{status,headers});
}

function videoMime(bytes){if(bytes.length>12&&new TextDecoder().decode(bytes.slice(4,8))==='ftyp')return 'video/mp4';if(bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163)return 'video/webm';fail('invalid_video',400)}
