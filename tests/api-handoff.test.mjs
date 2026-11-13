import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const root=new URL('../',import.meta.url),collectionText=await readFile(new URL('docs/mission-health.postman_collection.json',root),'utf8'),collection=JSON.parse(collectionText);
const index=await readFile(new URL('worker/index.js',root),'utf8'),core=await readFile(new URL('public/health-rules-core.js',root),'utf8');
const items=value=>value.flatMap(item=>item.item?items(item.item):[item]);
const requests=items(collection.item),find=name=>{const result=requests.find(item=>item.name===name);assert.ok(result,name);return result;};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function sandbox(){
  const saved=new Map(collection.variable.map(variable=>[variable.key,variable.value])),environment=new Map(),local=new Map();let now=Date.parse('2026-11-14T10:00:00.000Z'),generated=0;
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const values={get:key=>local.has(key)?local.get(key):environment.has(key)?environment.get(key):saved.get(key),set:(key,value)=>local.set(key,value)};
  values.replaceIn=text=>String(text).replace(/\{\{([^}]+)\}\}/g,(_match,key)=>{if(key==='$guid'){generated++;return randomUUID();}const value=values.get(key);if(value===undefined)throw new Error('Unknown variable '+key);return value;});
  const pm={variables:values,collectionVariables:{get:key=>saved.get(key),set:(key,value)=>saved.set(key,value)},environment:{get:key=>environment.get(key),set:(key,value)=>environment.set(key,value)}};
  function scripts(events){for(const event of events||[]){assert.equal(event.listen,'prerequest');assert.equal(event.script.type,'text/javascript');assert.ok(Array.isArray(event.script.exec));vm.runInNewContext(event.script.exec.join('\n'),{pm,Date:Clock,JSON,Error});}}
  function prepare(item){local.clear();scripts(collection.event);scripts(item.event);return {url:values.replaceIn(item.request.url),headers:Object.fromEntries(item.request.header.map(header=>[header.key,values.replaceIn(header.value)])),body:item.request.body?.mode==='raw'?JSON.parse(values.replaceIn(item.request.body.raw)):item.request.body?.formdata?.map(field=>({...field,...(field.type==='text'?{value:values.replaceIn(field.value)}:{})}))};}
  return {prepare,saved,environment,pm,advance:milliseconds=>{now+=milliseconds;},get generated(){return generated;},get now(){return now;}};
}

test('The importable v2.1 handoff has local defaults, explicit language headers and no credentials or automatic requests',()=>{
  assert.equal(collection.info.schema,'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');assert.ok(collection.info.name);assert.equal(collection.auth.type,'noauth');assert.equal(collection.variable.find(value=>value.key==='baseUrl').value,'http://localhost:8765');assert.equal(collection.variable.find(value=>value.key==='language').value,'en');assert.equal(requests.length,14);
  for(const item of requests){assert.equal(item.request.auth.type,'noauth');assert.match(item.request.url,/^\{\{baseUrl\}\}\/api\//);assert.ok(item.request.description);assert.ok(!item.response);for(const header of item.request.header){assert.ok(['content-type','x-mission-language'].includes(header.key.toLowerCase()));if(header.key==='x-mission-language')assert.equal(header.value,'{{language}}');}assert.ok(item.request.header.some(header=>header.key==='x-mission-language'));}
  assert.doesNotMatch(collectionText,/[\u0400-\u04ff]|\bsk-[a-zA-Z0-9_-]+|oai-authenticated-user-id|Authorization|api-key|pm\.sendRequest|pm\.execution|setNextRequest|runRequest/);
  for(const variable of collection.variable)assert.doesNotMatch(variable.key,/secret|password|token|api.?key/i);
  const s=sandbox();s.environment.set('language','ur');const prepared=s.prepare(find('Get capabilities'));assert.equal(prepared.headers['x-mission-language'],'ur');assert.equal(prepared.url,'http://localhost:8765/api/status');
});

test('The collection refuses production and remote targets rather than inventing production authentication',()=>{
  const s=sandbox(),request=find('Get capabilities');for(const target of ['https://example.com','https://localhost:8765','http://localhost.attacker.test:8765','http://192.0.2.1:8765','http://localhost:8765/']){s.environment.set('baseUrl',target);assert.throws(()=>s.prepare(request),/local-only/);}
  s.environment.set('baseUrl','http://127.0.0.1:8766');assert.equal(s.prepare(request).url,'http://127.0.0.1:8766/api/status');s.environment.set('language','ru');assert.throws(()=>s.prepare(request),/en or ur/);
});

test('Write scripts generate separate UUIDs, save them for retries and keep unknown IDs from triggering reads or edits',()=>{
  const s=sandbox(),names=['Send synthetic chat message','Analyze synthetic readings','Save synthetic diary note','Create synthetic task','Analyze a synthetic audio recording'];
  for(const name of names)s.prepare(find(name));const ids=['chatId','healthAnalysisId','diaryNoteId','taskId','recordingId'].map(key=>s.saved.get(key));for(const id of ids)assert.match(id,uuid);assert.equal(new Set(ids).size,5);assert.equal(s.generated,5);
  s.advance(60000);for(const name of names)s.prepare(find(name));assert.deepEqual(['chatId','healthAnalysisId','diaryNoteId','taskId','recordingId'].map(key=>s.saved.get(key)),ids);assert.equal(s.generated,5);
  const blank=sandbox();for(const name of ['Get the saved health analysis by ID','Edit the synthetic task','Cancel the synthetic task'])assert.throws(()=>blank.prepare(find(name)),/create request first/);assert.equal(blank.generated,0);
});

test('The health request uses a frozen current capture time, canonical units and explicitly synthetic readings',()=>{
  const s=sandbox(),request=find('Analyze synthetic readings'),first=s.prepare(request).body;assert.match(first.id,uuid);assert.equal(first.snapshot.capturedAt,new Date(s.now).toISOString());assert.equal(first.snapshot.profileId,'personal');assert.equal(first.snapshot.actiwatchImportId,null);
  const scope={Date,JSON};scope.globalThis=scope;vm.runInNewContext(core,scope);const normalized=scope.MissionHealthRules.normalize(first.snapshot,s.now),rules=scope.MissionHealthRules.evaluate(normalized,s.now);assert.equal(rules.isDemo,true);assert.equal(rules.complete,true);assert.equal(rules.status,'ATTENTION');
  for(const reading of Object.values(first.snapshot.readings).filter(Boolean)){assert.equal(reading.source,'demo');assert.equal(reading.observedAt,null);assert.equal(typeof reading.value,'number');}
  assert.equal(first.snapshot.readings.body_temperature.unit,'C');assert.equal(first.snapshot.readings.skin_temperature,null);assert.equal(first.snapshot.readings.wellbeing,null);assert.equal(first.snapshot.readings.fatigue_index,null);
  s.advance(120000);assert.deepEqual(s.prepare(request).body,first);assert.ok(s.prepare(find('Get the saved health analysis by ID')).url.endsWith(first.id));s.saved.set('healthAnalysisId','');const second=s.prepare(request).body;assert.notEqual(second.id,first.id);assert.equal(second.snapshot.capturedAt,new Date(s.now).toISOString());assert.notEqual(second.snapshot.capturedAt,first.snapshot.capturedAt);
});

test('Task edit and cancellation retain the saved ID and the create request retains its original UTC date',()=>{
  const s=sandbox(),create=find('Create synthetic task'),first=s.prepare(create).body;assert.match(first.id,uuid);assert.equal(first.dueDate,'2026-11-15');assert.equal(first.dueTime,'10:00');assert.equal(first.timeZone,'UTC');s.advance(86400000);assert.deepEqual(s.prepare(create).body,first);
  for(const name of ['Edit the synthetic task','Cancel the synthetic task'])assert.ok(s.prepare(find(name)).url.endsWith(first.id));assert.deepEqual(s.prepare(find('Edit the synthetic task')).body,{title:'Updated synthetic integration check',status:'done'});
  s.saved.set('taskId','');const second=s.prepare(create).body;assert.notEqual(second.id,first.id);assert.equal(second.dueDate,'2026-11-16');
});

test('File controls have no selected paths and recording retries preserve metadata without invented acoustic measurements',()=>{
  const s=sandbox(),upload=find('Upload a synthetic chat attachment'),recording=find('Analyze a synthetic audio recording');
  for(const item of [upload,recording]){assert.equal(item.request.body.mode,'formdata');assert.ok(!item.request.header.some(header=>header.key.toLowerCase()==='content-type'));const file=item.request.body.formdata.find(field=>field.type==='file');assert.equal(file.key,'file');assert.equal(file.src,null);assert.ok(!item.request.body.formdata.some(field=>field.key==='features'));}
  assert.equal(s.prepare(upload).body.find(field=>field.key==='room').value,'private');const first=s.prepare(recording).body,field=key=>first.find(value=>value.key===key).value;assert.match(field('id'),uuid);assert.equal(field('kind'),'audio');assert.equal(field('duration'),'5');assert.equal(field('createdAt'),new Date(s.now).toISOString());assert.match(field('transcript'),/Synthetic/);s.advance(60000);assert.deepEqual(s.prepare(recording).body,first);
});

test('The collection documents saved-but-unavailable, pending leases and conflict outcomes without fabricated response examples',()=>{
  assert.match(collection.info.description,/AIR_GAP=1/);assert.match(collection.info.description,/authenticated Sites browser session/);assert.match(find('Send synthetic chat message').request.description,/201.*reply.*null.*replyError/);assert.match(find('Analyze synthetic readings').request.description,/202.*pending true/);assert.match(find('Analyze synthetic readings').request.description,/409 id_conflict/);assert.match(find('Analyze a synthetic audio recording').request.description,/503.*pending.*saved true/);assert.match(find('Analyze a synthetic audio recording').request.description,/Successful analysis returns HTTP 200/);assert.doesNotMatch(find('Analyze a synthetic audio recording').request.description,/HTTP 201/);
});

test('Every collection method and path reaches the current Worker routing surface without network access',async()=>{
  const calls=[],scope={URL,Request,Response,Headers,console,fetch(){throw new Error('Unexpected network access');}};
  vm.runInNewContext(index.replace('export default','globalThis.app =')+';globalThis.router=missionHandler;',scope);
  const reply=(handler,request,extra={})=>{calls.push({handler,method:request.method,...extra});return new Response(JSON.stringify({handler,...extra}),{headers:{'content-type':'application/json'}});};
  scope.capabilities=async()=>({handler:'status',assistant:false});scope.profileIdentityRoute=request=>reply('identity',request);scope.generalChatRoute=request=>reply('chat',request);scope.healthAnalysisRoute=(request,_env,_owner,id)=>reply('health',request,{id});scope.tasksRoute=(request,_env,_owner,id)=>reply('tasks',request,{id});scope.chatFilesRoute=request=>reply('files',request);scope.mediaAnalysisRoute=request=>reply('media',request);scope.addMessage=(request,_env,_owner,profile)=>reply('diary-create',request,{profile});scope.history=async(_env,_owner,profile)=>({handler:'diary-list',profile,messages:[]});scope.syncPending=async()=>{};
  const expected=[['GET','/api/status','status'],['GET','/api/me','identity'],['POST','/api/chat','chat'],['POST','/api/health-analysis','health'],['GET','/api/health-analysis','health'],['GET','/api/health-analysis/{id}','health'],['POST','/api/astronauts/personal/messages','diary-create'],['GET','/api/astronauts/personal/messages','diary-list'],['POST','/api/tasks','tasks'],['PATCH','/api/tasks/{id}','tasks'],['DELETE','/api/tasks/{id}','tasks'],['GET','/api/tasks','tasks'],['POST','/api/chat-files','files'],['POST','/api/media-analysis','media']];
  const s=sandbox();for(let i=0;i<requests.length;i++){const item=requests[i],prepared=s.prepare(item),path=new URL(prepared.url).pathname.replace(/\/[a-f0-9-]{36}$/i,'/{id}');assert.equal(item.request.method,expected[i][0]);assert.equal(path,expected[i][1]);const response=await scope.router.fetch(new Request(prepared.url,{method:item.request.method,headers:prepared.headers}),{LOCAL_PREVIEW:'1'},{waitUntil(){}});assert.equal(response.status,200,item.name);const body=await response.json();assert.equal(body.handler,expected[i][2],item.name);if(path.includes('/personal/'))assert.equal(body.profile,'personal');}
  assert.equal(calls.filter(value=>value.handler==='tasks').length,4);
});
