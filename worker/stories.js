function validatedStoryHealth(raw){
  if(raw===null||raw===undefined||raw==='')return null;
  if(typeof raw!=='string'||raw.length>2000)fail('invalid_story_health',400);
  let value;try{value=JSON.parse(raw)}catch{fail('invalid_story_health',400)}
  if(value?.version===2){
    if(value.source!=='self_report'||value.profileId!=='personal'||typeof value.capturedAt!=='string'||!Number.isFinite(Date.parse(value.capturedAt))||Date.parse(value.capturedAt)>Date.now()+300000)fail('invalid_story_health',400);
    const report=selfReport(value.wellbeing);
    return {version:2,source:'self_report',profileId:'personal',capturedAt:new Date(value.capturedAt).toISOString(),wellbeing:report,metrics:{hr:null,spo2:null,temp:null,fatigue:null}};
  }
  const profiles={'jessica-meir':'Jessica Meir','jack-hathaway':'Jack Hathaway','christina-koch':'Christina Koch'};
  if(!value||value.version!==1||value.source!=='demo_dashboard'||!Object.hasOwn(profiles,value.profileId)||!value.metrics||typeof value.capturedAt!=='string'||!Number.isFinite(Date.parse(value.capturedAt))||Date.parse(value.capturedAt)>Date.now()+300000)fail('invalid_story_health',400);
  const metrics={};for(const [key,min,max]of [['hr',20,250],['spo2',50,100],['temp',30,45],['fatigue',0,10]]){const number=value.metrics[key];if(typeof number!=='number'||!Number.isFinite(number)||number<min||number>max)fail('invalid_story_health',400);metrics[key]=number;}
  return {version:1,source:'demo_dashboard',profileId:value.profileId,profileName:profiles[value.profileId],capturedAt:new Date(value.capturedAt).toISOString(),metrics};
}
function savedStoryHealth(row){try{return row.health_json?JSON.parse(row.health_json):null}catch{return null}}
function storyView(row){return {id:row.id,author:row.author_name,caption:row.caption,health:savedStoryHealth(row),kind:row.media_kind,createdAt:row.created_at,duration:row.duration_ms?row.duration_ms/1000:null,url:'/api/stories/'+row.id+'/media',poster:row.poster_key?'/api/stories/'+row.id+'/media?poster=1':'/api/stories/'+row.id+'/media'}}
async function storyRow(env,user,id){return database(env).prepare('SELECT * FROM personal_stories WHERE id=? AND owner_id=?').bind(id,user).first()}
async function storiesRoute(request,env,user,id,media,url){
  if(!id){
    if(request.method==='GET'){const {results}=await database(env).prepare('SELECT * FROM personal_stories WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 40').bind(user).all();return json({stories:results.map(storyView)})}
    if(request.method!=='POST')fail('method_not_allowed',405);
    const bytes=await boundedBytes(request,22000000);let form;try{form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')||''}}).formData()}catch{fail('invalid_story',400)}
    const storyId=String(form.get('id')||''),file=form.get('file'),kind=form.get('kind'),author=String(form.get('author')||'').trim(),caption=String(form.get('caption')||'').trim(),width=Number(form.get('width')),height=Number(form.get('height')),duration=kind==='video'?Number(form.get('duration')):null;
    if(!/^[a-f0-9-]{36}$/i.test(storyId)||!['photo','video'].includes(kind)||!file||typeof file.arrayBuffer!=='function'||!author||author.length>100||caption.length>300||!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||width>7680||height>7680)fail('invalid_story',400);
    const health=validatedStoryHealth(form.get('health'));
    const content=new Uint8Array(await file.arrayBuffer());if(content.length<64||content.length>(kind==='video'?20000000:3000000))fail('story_too_large',413);
    const mime=kind==='video'?videoMime(content):photoMime(content);
    if(kind==='video'&&(!Number.isFinite(duration)||duration<.1||duration>15.5))fail('invalid_story',400);
    let poster;if(kind==='video'){const image=form.get('poster');if(!image||typeof image.arrayBuffer!=='function'||image.size>1000000)fail('invalid_story',400);poster=new Uint8Array(await image.arrayBuffer());if(photoMime(poster)!=='image/jpeg')fail('invalid_story',400)}
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content)),x=>x.toString(16).padStart(2,'0')).join('');
    const existing=await database(env).prepare('SELECT * FROM personal_stories WHERE id=?').bind(storyId).first();if(existing){if(existing.owner_id!==user||existing.digest!==digest)fail('id_conflict',409);return json({story:storyView(existing)})}
    const count=await database(env).prepare('SELECT COUNT(*) AS total FROM personal_stories WHERE owner_id=?').bind(user).first();if(count.total>=40)fail('story_limit',409);
    const key='stories/'+crypto.randomUUID(),posterKey=poster?'stories/'+crypto.randomUUID():null;
    await photoStore(env).put(key,content,{httpMetadata:{contentType:mime}});
    try{
      if(poster)await photoStore(env).put(posterKey,poster,{httpMetadata:{contentType:'image/jpeg'}});
      await database(env).prepare('INSERT INTO personal_stories (id,owner_id,author_name,caption,health_json,media_kind,object_key,poster_key,mime,bytes,width,height,duration_ms,digest,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(storyId,user,author,caption,health?JSON.stringify(health):null,kind,key,posterKey,mime,content.length,width,height,duration?Math.round(duration*1000):null,digest,new Date().toISOString()).run();
    }catch(error){await photoStore(env).delete([key,...(posterKey?[posterKey]:[])]);throw error}
    return json({story:storyView(await storyRow(env,user,storyId))},201);
  }
  const row=await storyRow(env,user,id);if(!row)fail('not_found',404);
  if(request.method==='DELETE'&&!media){await photoStore(env).delete([row.object_key,...(row.poster_key?[row.poster_key]:[])]);await database(env).prepare('DELETE FROM personal_stories WHERE id=? AND owner_id=?').bind(id,user).run();return json({deleted:true})}
  if(!media||!['GET','HEAD'].includes(request.method))fail('method_not_allowed',405);
  const poster=url.searchParams.get('poster')==='1';if(poster&&!row.poster_key)fail('not_found',404);
  const headers={'content-type':poster?'image/jpeg':row.mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline','cross-origin-resource-policy':'same-origin'};
  let options,status=200;const range=request.headers.get('range');
  if(range&&!poster&&row.media_kind==='video'){
    const match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match)return new Response(null,{status:416,headers:{...headers,'content-range':'bytes */'+row.bytes}});
    const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),row.bytes-1):row.bytes-1;if(start>end||start>=row.bytes)return new Response(null,{status:416,headers:{...headers,'content-range':'bytes */'+row.bytes}});
    options={range:{offset:start,length:end-start+1}};status=206;headers['content-range']='bytes '+start+'-'+end+'/'+row.bytes;headers['content-length']=String(end-start+1);
  }
  if(!poster&&row.media_kind==='video')headers['accept-ranges']='bytes';
  const object=await photoStore(env).get(poster?row.poster_key:row.object_key,options);if(!object)fail('not_found',404);
  return new Response(request.method==='HEAD'?null:object.body,{status,headers});
}
