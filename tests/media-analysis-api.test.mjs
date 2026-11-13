import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const source=(await Promise.all(['public/skin-spots-core.js','public/apparent-age-core.js','worker/photos.js','worker/speech.js','worker/activity.js','worker/book.js','worker/media-analysis.js','worker/index.js'].map(path=>readFile(new URL(path,root),'utf8')))).join('\n').replace('export default','globalThis.app =');
const migrations=await Promise.all((await readdir(new URL('drizzle/',root))).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL('drizzle/'+n,root),'utf8')));
const identifier='a7337ee1-9cf8-42cf-b0d5-75d90258835c';
const wav=new Uint8Array(64);wav.set(new TextEncoder().encode('RIFF'));wav.set(new TextEncoder().encode('WAVE'),8);
const clip=new Uint8Array(64);clip.set([26,69,223,163]);const jpg=new Uint8Array([255,216,255,224,1,2,3,4]);
function fixture(t){
  const db=new DatabaseSync(':memory:');for(const sql of migrations)db.exec(sql);t.after(()=>db.close());
  const objects=new Map(),outgoing=[],objectReads=[];let failSpeech=false,failModel=false,modelText='Wellbeing was described by the user. No objective measurements in the entry.';
  const env={DB:{prepare(sql){const s=db.prepare(sql);return{bind(...args){return{first:async()=>s.get(...args)||null,run:async()=>s.run(...args),all:async()=>({results:s.all(...args)})};}}}},PHOTOS:{async put(key,bytes,options){objects.set(key,{bytes,size:bytes.length,customMetadata:options.customMetadata,httpMetadata:options.httpMetadata});},async head(key){objectReads.push({method:'head',key});const item=objects.get(key);return item?{...item}:null;},async get(key,options){objectReads.push({method:'get',key,options});const item=objects.get(key);return item?{...item,body:options?.range?item.bytes.slice(options.range.offset,options.range.offset+options.range.length):item.bytes}:null;},async delete(key){objects.delete(key);}},LLM_API_KEY:'test-key',LLM_BASE_URL:'https://model.invalid/v1',LLM_MODEL:'vision-model',SPEECH_API_URL:'https://speech.invalid/transcribe',SPEECH_API_KEY:'test-key'};
  const wasm=new Uint8Array([0,97,115,109,1,0,0,0]),assets={'/sample.mp4':{type:'video/mp4',data:Buffer.from(clip).toString('base64')},'/sample.mp3':{type:'audio/mpeg',data:Buffer.from(wav).toString('base64')},'/test.wasm':{type:'application/wasm',encoding:'gzip',data:gzipSync(wasm).toString('base64')}};
  const sandbox={Request,Response,Headers,FormData,Blob,URL,Uint8Array,TextEncoder,TextDecoder,AbortSignal,crypto:webcrypto,btoa,atob,assets,console,fetch:async(url,options)=>{outgoing.push({url,options});if(url.includes('speech.invalid'))return Response.json(failSpeech?{error:'offline'}:{text:'I felt tired after exercise today, no pain.'},{status:failSpeech?503:200});const text=modelText,body=JSON.parse(options.body);return Response.json(failModel?{error:'offline'}:body.input?{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}:{choices:[{message:{content:text}}]},{status:failModel?503:200});}};
  vm.runInNewContext(source,sandbox);
  async function send({owner='person-a',kind='audio',id=identifier,bytes,frames,transcript='',features,wellbeing,origin='https://site.invalid'}={}){const form=new FormData();form.set('id',id);form.set('kind',kind);form.set('duration','5');form.set('transcript',transcript);if(features)form.set('features',JSON.stringify(features));if(wellbeing)form.set('wellbeing',JSON.stringify(wellbeing));form.set('file',new Blob([bytes||(kind==='video'?clip:wav)]),'recording');for(const frame of frames||(kind==='video'?[jpg,jpg,jpg]:[]))form.append('frame',new Blob([frame]),'frame.jpg');const headers={origin};if(owner)headers['oai-authenticated-user-id']=owner;const response=await sandbox.app.fetch(new Request('https://site.invalid/api/media-analysis',{method:'POST',headers,body:form}),env,{waitUntil(){}});return{status:response.status,body:await response.json()};}
  async function get(owner='person-a'){const headers=owner?{'oai-authenticated-user-id':owner}:{};const response=await sandbox.app.fetch(new Request('https://site.invalid/api/media-analysis',{headers}),env,{waitUntil(){}});return {status:response.status,body:await response.json()};}
  async function read(path,{owner='person-a',method='GET',range}={}){const headers={};if(owner)headers['oai-authenticated-user-id']=owner;if(range!==undefined)headers.range=range;const response=await sandbox.app.fetch(new Request('https://site.invalid'+path,{method,headers}),env,{waitUntil(){}}),bytes=new Uint8Array(await response.arrayBuffer());return{status:response.status,headers:response.headers,bytes,body:response.headers.get('content-type')?.includes('application/json')&&bytes.length?JSON.parse(new TextDecoder().decode(bytes)):null};}
  return{env,db,objects,outgoing,objectReads,send,get,read,wasm,setSpeechFailure:value=>failSpeech=value,setModelFailure:value=>failModel=value,setModelText:value=>modelText=value};
}
test('Audio is transcribed, analyzed and saved with the response in the personal diary',async t=>{const f=fixture(t),r=await f.send();assert.equal(r.status,200);assert.equal(r.body.status,'analyzed');assert.equal(f.outgoing.length,2);assert.equal(f.objects.size,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM journal_messages').get().n,2);const body=JSON.parse(f.outgoing[1].options.body);assert.match(body.messages[1].content[0].text,/I felt tired after exercise today/);assert.match(body.messages[0].content,/Do not infer a diagnosis from face or voice/);});
test('Video sends three image attachments and speech text to the model',async t=>{const f=fixture(t),r=await f.send({kind:'video',transcript:'User message'});assert.equal(r.status,200);assert.equal(r.body.frames,3);const body=JSON.parse(f.outgoing[0].options.body);assert.equal(body.messages[1].content.filter(p=>p.type==='image_url').length,3);assert.match(body.messages[1].content[0].text,/User message/);});
test('Unknown video formats are rejected before storage or model calls',async t=>{
  const f=fixture(t),result=await f.send({kind:'video',bytes:new Uint8Array(64),transcript:'Synthetic observation'});
  assert.equal(result.status,400);assert.equal(result.body.error,'invalid_video');assert.equal(f.outgoing.length,0);assert.equal(f.objects.size,0);assert.equal(f.objectReads.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM journal_messages').get().n,0);
});
test('Recognized MP4 and WebM containers preserve their media type and frames',async t=>{
  const mp4=new Uint8Array(64);mp4.set(new TextEncoder().encode('ftyp'),4);
  for(const [bytes,mime] of [[mp4,'video/mp4'],[clip,'video/webm']]){const f=fixture(t),result=await f.send({kind:'video',bytes,transcript:'Synthetic observation'});assert.equal(result.status,200);assert.equal(result.body.frames,3);assert.equal(f.objects.size,1);assert.equal([...f.objects.values()][0].httpMetadata.contentType,mime);const body=JSON.parse(f.outgoing[0].options.body);assert.equal(body.messages[1].content.filter(part=>part.type==='image_url').length,3);}
});
test('Azure media analysis preserves selected frames and attributes the stored response to the agent',async t=>{
  const f=fixture(t);Object.assign(f.env,{LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-azure-key'});
  const result=await f.send({kind:'video',transcript:'Synthetic speech'});assert.equal(result.status,200);assert.equal(result.body.status,'analyzed');const body=JSON.parse(f.outgoing[0].options.body);assert.equal(body.input[1].content.filter(part=>part.type==='input_image').length,3);assert.match(body.input[0].content,/Do not infer a diagnosis from face or voice/);assert.match(body.input[1].content[0].text,/Synthetic speech/);const row=f.db.prepare("SELECT assistant_source,owner_id,reply_to FROM journal_messages WHERE role='assistant'").get();assert.equal(row.assistant_source,'media-analysis:azure_responses/NASA-AI');assert.equal(row.owner_id,'person-a');assert.equal(row.reply_to,identifier);assert.equal(f.outgoing[0].options.headers.authorization,undefined);
});
test('Retrying one recording returns the saved answer without repeated model calls',async t=>{const f=fixture(t);await f.send();const count=f.outgoing.length,r=await f.send();assert.equal(r.body.duplicate,true);assert.equal(f.outgoing.length,count);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM journal_messages').get().n,2);});
test('Another owner cannot retry or read a result using someone else’s identifier',async t=>{const f=fixture(t);await f.send();const count=f.outgoing.length,r=await f.send({owner:'person-b'});assert.equal(r.status,409);assert.equal(f.outgoing.length,count);assert.equal(f.objects.size,1);});
test('Replacing content under an existing identifier is rejected',async t=>{const f=fixture(t);await f.send();const changed=wav.slice();changed[60]=1;assert.equal((await f.send({bytes:changed})).status,409);});
test('Transcription failure saves the recording without invented analysis and allows retry',async t=>{const f=fixture(t);f.setSpeechFailure(true);const r=await f.send();assert.equal(r.status,503);assert.equal(r.body.saved,true);assert.equal(r.body.status,'pending');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM journal_messages WHERE role='assistant'").get().n,0);f.setSpeechFailure(false);assert.equal((await f.send()).body.status,'analyzed');assert.equal(f.objects.size,1);});
test('Model failure saves the original recording and retry does not duplicate the diary',async t=>{const f=fixture(t);f.setModelFailure(true);assert.equal((await f.send({transcript:'Speech'})).body.saved,true);f.setModelFailure(false);assert.equal((await f.send({transcript:'Speech'})).body.status,'analyzed');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM journal_messages').get().n,2);});
test('A disabled model makes no outgoing requests or fabricated response',async t=>{const f=fixture(t);f.env.LLM_API_KEY='';const r=await f.send();assert.equal(r.body.saved,true);assert.equal(r.body.status,'pending');assert.equal(f.outgoing.length,0);});
test('Isolated mode does not send recordings to the cloud',async t=>{const f=fixture(t);f.env.AIR_GAP='1';assert.equal((await f.send()).body.status,'pending');assert.equal(f.outgoing.length,0);});
test('Video without frames and foreign-origin requests write no data',async t=>{const f=fixture(t);assert.equal((await f.send({kind:'video',frames:[]})).status,400);assert.equal((await f.send({origin:'https://other.invalid'})).status,403);assert.equal((await f.send({owner:null})).status,401);assert.equal(f.objects.size,0);});

test('Acoustic features and actual vectors are saved with the recording and sent without substitution by clinical scales',async t=>{const f=fixture(t),features={acoustic:{level:-24,quiet:.2,clipping:.001,seconds:5},model:'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768',audioVector:Array.from({length:768},(_,i)=>i===0?1:0),tone:[{label:'neutral',similarity:.6}]},r=await f.send({transcript:'Audio check',features});assert.equal(r.status,200);const rows=f.db.prepare("SELECT references_json FROM journal_messages WHERE role='user'").get(),ref=JSON.parse(rows.references_json)[0];assert.equal(ref.features.audioVector.length,768);assert.equal(ref.features.tone[0].similarity,.6);assert.match(JSON.parse(f.outgoing[0].options.body).messages[1].content[0].text,/not emotion probability/);});
test('Damaged features and vectors are not saved',async t=>{for(const features of [{acoustic:{level:NaN,quiet:0,clipping:0,seconds:5}},{acoustic:{level:-20,quiet:2,clipping:0,seconds:5}},{acoustic:{level:-20,quiet:0,clipping:0,seconds:5},model:'fake'}]){const f=fixture(t);assert.equal((await f.send({features})).status,400);assert.equal(f.objects.size,0);}});

function ageFeatures(){return{acoustic:null,model:'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768',videoVector:Array.from({length:768},(_,i)=>i===0?1:0),tone:[],apparentAge:{method:'embeddinggemma2-text-age-v1',status:'estimated',reason:'consensus',samples:3,range:{min:40,max:49},votes:[4,4,4,4,4,4],scores:Array.from({length:9},(_,i)=>({band:i,similarity:i===4?.4:.2})),comparison:'no_reference'}};}
test('Apparent age is saved with silent video and does not become medical aging',async t=>{const f=fixture(t),r=await f.send({kind:'video',transcript:'Neutral recording',features:ageFeatures()});assert.equal(r.status,200);const row=f.db.prepare("SELECT references_json FROM journal_messages WHERE role='user'").get(),ref=JSON.parse(row.references_json)[0];assert.deepEqual(ref.features.apparentAge.range,{min:40,max:49});assert.equal(ref.features.acoustic,null);const messages=JSON.parse(f.outgoing.at(-1).options.body).messages;assert.match(messages[0].content,/do not claim aging/);assert.match(messages[1].content[0].text,/accuracy in years is not established/);assert.equal(JSON.stringify(ref).includes('storageScope'),false);});
test('Frameless audio cannot submit age and damaged age is not saved',async t=>{for(const edit of [f=>f.apparentAge.range.min=44,f=>f.apparentAge.scores[0].similarity=2,f=>f.apparentAge.samples=1]){const f=fixture(t),features=ageFeatures();edit(features);assert.equal((await f.send({kind:'video',features})).status,400);assert.equal(f.objects.size,0);}const f=fixture(t),features=ageFeatures();features.acoustic={level:-20,quiet:.1,clipping:0,seconds:5};assert.equal((await f.send({kind:'audio',features})).status,400);});

function skinFeatures(withVector=true){
  const vector=Array.from({length:768},(_,i)=>i===0?1:0),features={acoustic:null,skin:{method:'aligned-face-spots-v1',status:'compared',reason:'ready',samples:3,referenceAt:new Date().toISOString(),trackingKey:'029036ef-a29c-4bb0-a0be-f26d07eff82d',coverage:['forehead','left-cheek','right-cheek'],newCount:1,changedCount:0,items:[{id:'forehead-0',region:'forehead',change:'new',x:.5,y:.5,areaPixels:Math.PI*16,diameterPixels:8,relativeArea:.004,color:{r:60,g:40,b:20},lab:{l:30,a:10,b:20},tone:'dark',baseline:null,areaChangePercent:null,deltaE:null}]}};
  if(withVector){Object.assign(features,{model:'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768',videoVector:vector,tone:[]});features.skin.items[0].vector=vector;}
  return features;
}
test('Spot comparison preserves size and color without millimeters, account coordinates or invented diagnosis',async t=>{
  const f=fixture(t),features=skinFeatures();features.skin.owner='private';features.skin.items[0].diagnosis='fake';const result=await f.send({kind:'video',transcript:'Check',features});assert.equal(result.status,200);
  const reference=JSON.parse(f.db.prepare("SELECT references_json FROM journal_messages WHERE role='user'").get().references_json)[0];assert.equal(reference.features.skin.items[0].vector.length,768);assert.equal(reference.features.skin.items[0].diameterPixels,8);assert.equal(reference.features.skin.owner,undefined);assert.equal(reference.features.skin.items[0].diagnosis,undefined);
  const messages=JSON.parse(f.outgoing.at(-1).options.body).messages;assert.match(messages[0].content,/Do not invent millimeters/);assert.match(messages[1].content[0].text,/Size uses original frame pixels only/);assert.doesNotMatch(messages[1].content[0].text,/"vector":/);
});
test('Vector search finds earlier regions from the same owner and baseline',async t=>{
  const f=fixture(t);await f.send({kind:'video',features:skinFeatures(),transcript:'First recording'});const features=skinFeatures(),second='73b1fd88-50ef-44bf-bc10-1d92c413eb94';features.skin.items[0].vector=Array.from({length:768},(_,i)=>i===0?.8:i===1?.6:0);
  const result=await f.send({kind:'video',id:second,features,transcript:'Second recording'});assert.equal(result.status,200);assert.equal(result.body.skinMatches.length,1);assert.equal(result.body.skinMatches[0].recordId,identifier);assert.ok(Math.abs(result.body.skinMatches[0].similarity-.8)<1e-8);
  const duplicate=await f.send({kind:'video',id:second,features});assert.equal(duplicate.body.skinMatches.length,1);assert.equal(duplicate.body.duplicate,true);
  const different=skinFeatures();different.skin.trackingKey='86fe003b-aabc-48c1-9024-e4ffcc6fad50';assert.equal((await f.send({kind:'video',id:'86fe003b-aabc-48c1-9024-e4ffcc6fad50',features:different})).body.skinMatches.length,0);
  assert.equal((await f.send({owner:'person-b',kind:'video',id:'5849b426-35e1-43bd-97a1-51c97b1727ba',features:skinFeatures()})).body.skinMatches.length,0);
});
test('Embedder failure preserves image measurements without pretending vector search succeeded',async t=>{const f=fixture(t),result=await f.send({kind:'video',features:skinFeatures(false)});assert.equal(result.status,200);assert.deepEqual(result.body.skinMatches,[]);const ref=JSON.parse(f.db.prepare("SELECT references_json FROM journal_messages WHERE role='user'").get().references_json)[0];assert.equal(ref.features.skin.items[0].vector,undefined);assert.equal(ref.features.model,undefined);});
test('Audio rejects skin features, invalid percentages or vectors do not reach the archive',async t=>{
  for(const edit of [f=>f.skin.items[0].vector=[1,0],f=>f.skin.items[0].color.r=999,f=>f.skin.items[0].change='changed',f=>f.skin.samples=1]){const f=fixture(t),features=skinFeatures();edit(features);assert.equal((await f.send({kind:'video',features})).status,400);assert.equal(f.objects.size,0);}
  const f=fixture(t),features=skinFeatures();features.acoustic={level:-20,quiet:0,clipping:0,seconds:5};assert.equal((await f.send({kind:'audio',features})).status,400);
});


test('Latest saved measurements return without decoding again or exposing vectors',async t=>{
  const f=fixture(t),features={acoustic:{level:-24,quiet:.2,clipping:.001,seconds:5},model:'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768',audioVector:Array.from({length:768},(_,i)=>i===0?1:0),tone:[{label:'neutral',similarity:.6}]};
  await f.send({transcript:'Audio check',features});const requests=f.outgoing.length,result=await f.get();assert.equal(result.status,200);assert.equal(f.outgoing.length,requests);assert.equal(result.body.items.length,1);
  const item=result.body.items[0];assert.equal(item.kind,'audio');assert.equal(item.id,identifier);assert.equal(item.status,'analyzed');assert.equal(item.features.acoustic.level,-24);assert.equal(item.features.tone[0].similarity,.6);assert.equal(item.transcript,'Audio check');assert.match(item.analysis,/Wellbeing/);assert.equal(item.features.audioVector,undefined);assert.equal(JSON.stringify(item).includes('digest'),false);
});
test('Successful videos without acoustic data restore their saved analysis without exposing vectors or calling the model',async t=>{
  const visual={acoustic:null,model:'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768',tone:[],videoVector:Array.from({length:768},(_,index)=>index===0?1:0)};
  for(const features of [undefined,visual]){
    const f=fixture(t),id=webcrypto.randomUUID();
    await f.send({kind:'video',features:{acoustic:{level:-24,quiet:.2,clipping:0,seconds:5}},transcript:'Older synthetic video'});
    f.db.prepare('UPDATE journal_messages SET created_at=? WHERE id=?').run(new Date(Date.now()-60000).toISOString(),identifier);
    const saved=await f.send({id,kind:'video',features,transcript:'Synthetic selected-frame observation'});assert.equal(saved.status,200);assert.equal(saved.body.status,'analyzed');
    const calls=f.outgoing.length;f.env.LLM_API_KEY='';f.env.PHOTOS=null;
    const result=await f.get();assert.equal(result.status,200);assert.equal(result.body.items.length,1);const item=result.body.items[0];
    assert.equal(item.id,id);assert.equal(item.kind,'video');assert.equal(item.status,'analyzed');assert.equal(item.features,null);assert.equal(item.transcript,'Synthetic selected-frame observation');assert.equal(item.analysis,saved.body.analysis);assert.doesNotMatch(JSON.stringify(item),/videoVector|audioVector|digest/);
    if(features)assert.equal(JSON.parse(f.db.prepare('SELECT references_json FROM journal_messages WHERE id=?').get(id).references_json)[0].features.videoVector.length,768);
    assert.deepEqual((await f.get('person-b')).body.items,[]);assert.equal((await f.get(null)).status,401);assert.equal(f.outgoing.length,calls);
  }
});
test('A failed video without usable measurements cannot hide an older analyzed video or borrow another profile answer',async t=>{
  const f=fixture(t),pendingId=webcrypto.randomUUID();await f.send({kind:'video',transcript:'Saved synthetic frames'});
  f.db.prepare('UPDATE journal_messages SET created_at=? WHERE id=?').run(new Date(Date.now()-60000).toISOString(),identifier);
  f.setModelFailure(true);const failed=await f.send({id:pendingId,kind:'video',transcript:'Pending synthetic frames'});assert.equal(failed.status,503);assert.equal(failed.body.saved,true);
  const insert=f.db.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,reply_to,assistant_source) VALUES (?,?,?,?,?,?,?,?,?)');
  insert.run(webcrypto.randomUUID(),'person-b','personal','assistant','Foreign owner answer','en',new Date().toISOString(),pendingId,'media-analysis:other');
  insert.run(webcrypto.randomUUID(),'person-a','jessica-meir','assistant','Foreign profile answer','en',new Date().toISOString(),pendingId,'media-analysis:other');
  const calls=f.outgoing.length,result=await f.get();assert.equal(result.status,200);assert.equal(result.body.items.length,1);assert.equal(result.body.items[0].id,identifier);assert.equal(result.body.items[0].features,null);assert.doesNotMatch(result.body.items[0].analysis,/Foreign/);
  insert.run(webcrypto.randomUUID(),'person-a','personal','assistant','   ','en',new Date().toISOString(),pendingId,'media-analysis:empty');
  assert.equal((await f.get()).body.items[0].id,identifier);assert.deepEqual((await f.get('person-b')).body.items,[]);assert.equal(f.outgoing.length,calls);
});
test('Saved measurements are owner-only and need no original-file storage',async t=>{
  const f=fixture(t);await f.send({features:{acoustic:{level:-21,quiet:.1,clipping:0,seconds:5}},transcript:'Own recording'});f.env.PHOTOS=null;
  assert.equal((await f.get('person-a')).body.items.length,1);assert.deepEqual((await f.get('person-b')).body.items,[]);assert.equal((await f.get(null)).status,401);
});
test('Language model failure preserves actual acoustic measurements and speech',async t=>{
  const f=fixture(t);f.env.LLM_API_KEY='';await f.send({features:{acoustic:{level:-30,quiet:.4,clipping:.002,seconds:5}},transcript:'Saved speech'});
  const item=(await f.get()).body.items[0];assert.equal(item.status,'measured');assert.equal(item.analysis,'');assert.equal(item.transcript,'Saved speech');assert.equal(item.features.acoustic.quiet,.4);assert.equal(f.outgoing.length,0);
});
test('An empty new recording does not erase the latest usable measurements of its format',async t=>{
  const f=fixture(t);await f.send({features:{acoustic:{level:-28,quiet:.3,clipping:0,seconds:5}},transcript:'First recording'});
  await f.send({id:'bd9955a7-a316-4a38-a1bd-72e17c9e40a9',transcript:'Second recording without decoded audio'});
  await f.send({kind:'video',id:'e768409a-982d-4d82-8235-a1482b6b5687',features:{acoustic:{level:-18,quiet:.02,clipping:.004,seconds:5}},transcript:'Video audio'});
  const items=(await f.get()).body.items;assert.equal(items.length,2);assert.equal(items.find(item=>item.kind==='audio').id,identifier);assert.equal(items.find(item=>item.kind==='video').features.acoustic.level,-18);
});

test('The book combines the user’s audio recording, speech, features and response without vectors or original text changes',async t=>{
  const f=fixture(t),features={acoustic:{level:-24,quiet:.2,clipping:.001,seconds:5},model:'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768',audioVector:Array.from({length:768},(_,i)=>i===0?1:0),tone:[{label:'neutral',similarity:.6}]};
  await f.send({transcript:'Saved personal speech',features,wellbeing:{score:79,wellbeingScale:100}});
  const original=f.db.prepare('SELECT content,references_json FROM journal_messages WHERE id=?').get(identifier),reference=JSON.parse(original.references_json);reference[0].features.owner='private-owner';reference[0].features.digest='private-digest';f.db.prepare('UPDATE journal_messages SET references_json=? WHERE id=?').run(JSON.stringify(reference),identifier);
  const result=await f.read('/api/astronauts/personal/book'),entry=result.body.entries[0],observation=entry.observation;
  assert.equal(result.status,200);assert.equal(result.body.entries.length,1);assert.equal(entry.id,identifier);assert.equal(entry.content,original.content);assert.equal(entry.wellbeing.score,79);assert.equal(observation.kind,'audio');assert.equal(observation.duration,5);assert.equal(observation.transcript,'Saved personal speech');assert.match(observation.analysis,/Wellbeing was described/);assert.equal(observation.status,'analyzed');assert.equal(observation.mediaUrl,'/api/media-analysis/'+identifier+'/media');assert.equal(observation.features.acoustic.level,-24);assert.equal(observation.features.tone[0].similarity,.6);
  assert.equal(observation.features.audioVector,undefined);assert.equal(observation.features.owner,undefined);assert.equal(observation.features.digest,undefined);assert.equal(entry.references[0].digest,undefined);assert.equal(entry.references[0].features,undefined);assert.equal(JSON.parse(f.db.prepare('SELECT references_json FROM journal_messages WHERE id=?').get(identifier).references_json)[0].features.audioVector.length,768);
});
test('The book preserves the age range, skin size and color without vectors or internal matching keys',async t=>{
  const f=fixture(t),features={...ageFeatures(),skin:skinFeatures().skin};await f.send({kind:'video',transcript:'Video observation',features});
  const entry=(await f.read('/api/astronauts/personal/book')).body.entries[0],value=entry.observation.features;
  assert.equal(entry.observation.kind,'video');assert.deepEqual(value.apparentAge.range,{min:40,max:49});assert.equal(value.apparentAge.comparison,'no_reference');assert.equal(value.skin.newCount,1);assert.equal(value.skin.changedCount,0);assert.equal(value.skin.items[0].diameterPixels,8);assert.deepEqual(value.skin.items[0].color,{r:60,g:40,b:20});assert.equal(value.videoVector,undefined);assert.equal(value.skin.items[0].vector,undefined);assert.equal(value.skin.trackingKey,undefined);assert.equal(JSON.stringify(entry).includes('"vector":'),false);
});
test('Archive and original recording are isolated by owner and profile with the same reply_to',async t=>{
  const f=fixture(t);await f.send({transcript:'Personal speech'});
  const insert=f.db.prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,reply_to,assistant_source) VALUES (?,?,?,?,?,?,?,?,?)');
  insert.run(webcrypto.randomUUID(),'person-b','personal','assistant','Another owner’s secret response','en','2099-01-01T00:00:00Z',identifier,'media-analysis:other');insert.run(webcrypto.randomUUID(),'person-a','jessica-meir','assistant','Another profile’s response','en','2099-01-01T00:00:00Z',identifier,'media-analysis:other');
  const own=await f.read('/api/astronauts/personal/book');assert.match(own.body.entries[0].observation.analysis,/Wellbeing was described/);assert.doesNotMatch(own.body.entries[0].observation.analysis,/secret|another profile/);assert.equal((await f.read('/api/astronauts/personal/book',{owner:'person-b'})).body.entries.length,0);
  const reads=f.objectReads.length;assert.equal((await f.read('/api/media-analysis/'+identifier+'/media',{owner:'person-b'})).status,404);assert.equal(f.objectReads.length,reads);assert.equal((await f.read('/api/media-analysis/'+identifier+'/media',{owner:null})).status,401);
  f.db.prepare("UPDATE journal_messages SET astronaut_id='jessica-meir' WHERE id=?").run(identifier);assert.equal((await f.read('/api/media-analysis/'+identifier+'/media')).status,404);const friend=(await f.read('/api/astronauts/jessica-meir/book')).body.entries[0];assert.equal(friend.observation,undefined);
});
test('Original audio and video support full reads, HEAD and single byte ranges',async t=>{
  const f=fixture(t);await f.send({transcript:'Sound'});const videoId='6ee6931a-814a-4d13-b051-3fcfcd194fb1';await f.send({id:videoId,kind:'video',transcript:'Video'});
  for(const [id,bytes,mime] of [[identifier,wav,'audio/wav'],[videoId,clip,'video/webm']]){
    const path='/api/media-analysis/'+id+'/media',full=await f.read(path);assert.equal(full.status,200);assert.deepEqual(full.bytes,bytes);assert.equal(full.headers.get('content-type'),mime);assert.equal(full.headers.get('cache-control'),'private, no-store');assert.equal(full.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(full.headers.get('accept-ranges'),'bytes');assert.equal(full.headers.get('content-length'),'64');
    const first=await f.read(path,{range:'bytes=0-1'});assert.equal(first.status,206);assert.equal(first.headers.get('content-range'),'bytes 0-1/64');assert.deepEqual(first.bytes,bytes.slice(0,2));assert.equal(first.headers.get('content-length'),'2');
    const tail=await f.read(path,{range:'bytes=-4'});assert.equal(tail.status,206);assert.deepEqual(tail.bytes,bytes.slice(-4));assert.equal(tail.headers.get('content-range'),'bytes 60-63/64');
    assert.deepEqual((await f.read(path,{range:'bytes=60-999'})).bytes,bytes.slice(60));assert.deepEqual((await f.read(path,{range:'bytes=60-'})).bytes,bytes.slice(60));
    const head=await f.read(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.bytes.length,0);assert.equal(head.headers.get('content-length'),'64');const partialHead=await f.read(path,{method:'HEAD',range:'bytes=1-3'});assert.equal(partialHead.status,206);assert.equal(partialHead.bytes.length,0);assert.equal(partialHead.headers.get('content-length'),'3');
    for(const range of ['bytes=64-','bytes=5-2','bytes=0-1,4-5','bytes=-0','bytes=999999999999999999999-']){const invalid=await f.read(path,{range});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */64');}
    assert.equal((await f.read(path,{method:'POST'})).status,405);
  }
});
test('Missing originals are not replaced by samples, damaged features do not become measurements',async t=>{
  const f=fixture(t);f.env.LLM_API_KEY='';await f.send({transcript:'Preserved speech'});const row=f.db.prepare('SELECT references_json FROM journal_messages WHERE id=?').get(identifier),reference=JSON.parse(row.references_json);reference[0].features={acoustic:{level:-24,quiet:9,clipping:0,seconds:5},apparentAge:{range:{min:44,max:45}},skin:{status:'compared',items:[]},owner:'private'};f.db.prepare('UPDATE journal_messages SET references_json=? WHERE id=?').run(JSON.stringify(reference),identifier);f.objects.clear();
  const value=(await f.read('/api/astronauts/personal/book')).body.entries[0].observation;assert.equal(value.mediaUrl,null);assert.equal(value.features,null);assert.equal(value.status,'pending');assert.equal(value.analysis,'');assert.equal(value.transcript,'Preserved speech');assert.equal((await f.read('/api/media-analysis/'+identifier+'/media')).status,404);
  f.env.PHOTOS=null;assert.equal((await f.read('/api/astronauts/personal/book')).body.entries[0].observation.mediaUrl,null);assert.equal((await f.read('/api/media-analysis/'+identifier+'/media')).status,404);
});
test('Preloaded audio and video return Range, and gzip WASM preserves the previous delivery method',async t=>{
  const f=fixture(t);
  for(const [path,bytes,mime] of [['/sample.mp4',clip,'video/mp4'],['/sample.mp3',wav,'audio/mpeg']]){
    const first=await f.read(path,{owner:null,range:'bytes=0-1'});assert.equal(first.status,206);assert.equal(first.headers.get('content-type'),mime);assert.equal(first.headers.get('content-range'),'bytes 0-1/64');assert.deepEqual(first.bytes,bytes.slice(0,2));assert.equal(first.headers.get('content-encoding'),null);
    const head=await f.read(path,{owner:null,method:'HEAD',range:'bytes=-3'});assert.equal(head.status,206);assert.equal(head.bytes.length,0);assert.equal(head.headers.get('content-length'),'3');assert.equal((await f.read(path,{owner:null,range:'bytes=100-'})).status,416);assert.deepEqual((await f.read(path,{owner:null})).bytes,bytes);
  }
  const wasm=await f.read('/test.wasm',{owner:null,range:'bytes=0-1'});assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');assert.equal(wasm.headers.get('content-encoding'),'gzip');assert.deepEqual(new Uint8Array(gunzipSync(wasm.bytes)),f.wasm);
});

test('Azure structured media results are readable and saved with the same owner and recording',async t=>{
  const f=fixture(t);Object.assign(f.env,{LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-key'});
  f.setModelText(JSON.stringify({status:'ATTENTION',alerts:['Synthetic sample flag'],summary:'Review the supplied synthetic observation.'}));
  const result=await f.send({transcript:'Synthetic integration observation'});
  assert.equal(result.status,200);assert.equal(result.body.analysis,'Review the supplied synthetic observation.\n\nStatus: ATTENTION\nAlerts:\n- Synthetic sample flag');
  const saved=f.db.prepare("SELECT content,owner_id,reply_to FROM journal_messages WHERE role='assistant'").get();assert.equal(saved.content,result.body.analysis);assert.equal(saved.owner_id,'person-a');assert.equal(saved.reply_to,identifier);
});


test('Stored health JSON is readable on retry, history, latest analysis and archive without rewriting the original',async t=>{
  const f=fixture(t),features={acoustic:{level:-24,quiet:.2,clipping:0,seconds:5}};
  await f.send({transcript:'Synthetic observation',features});
  const original=JSON.stringify({status:'ATTENTION',alerts:['Synthetic flag',{parameter:'heart_rate',value:112,severity:'moderate',note:'Review pulse',trend:'rising'},{parameter:'clipping',value:0,severity:'info',note:'No clipped samples',trend:'flat'},{parameter:'spo2',value:null,severity:'info',note:'Measurement missing',trend:'unknown'}],summary:'Review the supplied observation.'}),expected='Review the supplied observation.\n\nStatus: ATTENTION\nAlerts:\n- Synthetic flag\n- heart_rate / 112 / moderate / Review pulse / rising\n- clipping / 0 / info / No clipped samples / flat\n- spo2 / No signal / info / Measurement missing / unknown';
  f.db.prepare("UPDATE journal_messages SET content=? WHERE role='assistant'").run(original);
  const requests=f.outgoing.length;
  assert.equal((await f.send({features})).body.analysis,expected);
  assert.equal((await f.get()).body.items[0].analysis,expected);
  const history=await f.read('/api/astronauts/personal/messages');assert.equal(history.status,200);assert.equal(history.body.messages.find(item=>item.role==='assistant').content,expected);
  const archive=await f.read('/api/astronauts/personal/book');assert.equal(archive.status,200);assert.equal(archive.body.entries[0].observation.analysis,expected);
  assert.equal((await f.get('person-b')).body.items.length,0);assert.equal(f.outgoing.length,requests);
  assert.equal(f.db.prepare("SELECT content FROM journal_messages WHERE role='assistant'").get().content,original);
});
