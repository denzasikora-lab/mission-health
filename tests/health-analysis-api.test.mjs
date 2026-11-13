import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url);
const source=(await Promise.all([
  'public/health-rules-core.js','worker/activity.js','worker/scheduler.js','worker/personal.js',
  'worker/photos.js','worker/stories.js','worker/speech.js','worker/training.js','worker/book.js',
  'worker/health-analysis.js','worker/index.js'
].map(path=>readFile(new URL(path,root),'utf8')))).join('\n').replace('export default','globalThis.app =');
const migrations=await Promise.all((await readdir(new URL('drizzle/',root))).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(new URL('drizzle/'+name,root),'utf8')));
const copy=value=>JSON.parse(JSON.stringify(value));
const now=new Date().toISOString();
const reading=(value,unit,source='manual',observedAt=source==='demo'?null:now)=>({value,unit,source,observedAt});
function snapshot(overrides={}){
  return {profileId:'personal',capturedAt:now,actiwatchImportId:null,readings:{heart_rate:reading(72,'bpm'),spo2:reading(98,'%'),body_temperature:reading(36.8,'C'),...overrides}};
}
function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());for(const migration of migrations)sql.exec(migration);
  let claimHook=null;
  const DB={prepare(query){const statement=sql.prepare(query);return {bind(...values){return {first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>{if(query.startsWith('UPDATE health_analyses SET lease_until=')&&claimHook){const callback=claimHook;claimHook=null;callback();return {changes:0};}return statement.run(...values);}};}};}};
  const outgoing=[];let code=200,answer=JSON.stringify({status:'NORMAL',alerts:[],summary:'Synthetic readings were supplied. Review the supplied measurements.'}),gate=null,signalRequest=null;
  const scope={URL,Request,Response,FormData,Blob,Uint8Array,TextEncoder,TextDecoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{warn(){},error(){}},fetch:async(url,options)=>{
    const body=JSON.parse(options.body);outgoing.push({url,body});signalRequest?.();if(gate)await gate;
    return code===200?Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:answer}]}]}):new Response('unavailable',{status:code});
  }};
  vm.runInNewContext(source,scope);
  const env={DB,LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-test-key'};
  async function run(path='/api/health-analysis',{method='GET',owner='owner-a',body,environment={},origin}={}){
    const headers={'content-type':'application/json'};if(owner)headers['oai-authenticated-user-id']=owner;if(origin)headers.origin=origin;
    const response=await scope.app.fetch(new Request('https://mission.test'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),{...env,...environment},{waitUntil(){}});
    return {status:response.status,body:await response.json()};
  }
  const post=(value=snapshot(),options={})=>run('/api/health-analysis',{method:'POST',...options,body:{id:webcrypto.randomUUID(),snapshot:value,...options.body}});
  const payload=(index=outgoing.length-1)=>JSON.parse(outgoing[index].body.input.find(item=>item.role==='user').content);
  function importRow({id=webcrypto.randomUUID(),owner='owner-a',sleepSeconds=25200,activityCounts=1234,meanLightLux=56,end=now}={}){
    const summary={end,latest24h:{sleepSeconds,activityCounts,meanLightLux}};
    sql.prepare('INSERT INTO actiwatch_imports (id,owner_id,digest,filename,object_key,summary_json,recorded_end,diary_message_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,owner,id,'synthetic.csv','synthetic/'+id,JSON.stringify(summary),end,webcrypto.randomUUID(),end);
    return {id,summary};
  }
  return {sql,outgoing,run,post,payload,importRow,beforeClaim:callback=>{claimHook=callback;},provider:(status,text)=>{code=status;if(text!==undefined)answer=text;},hold:()=>{let release;gate=new Promise(resolve=>{release=resolve;});const started=new Promise(resolve=>{signalRequest=resolve;});return {release,started};}};
}

test('Server rules prevent Azure NORMAL from lowering critical SpO2',async t=>{
  const f=fixture(t),value=snapshot({spo2:reading(88,'%')});
  const saved=await f.post(value);assert.equal(saved.status,201);assert.equal(saved.body.rules.status,'CRITICAL');assert.equal(saved.body.result.status,'CRITICAL');assert.equal(saved.body.result.agentAvailable,true);assert.equal(saved.body.result.agentStatus,'NORMAL');assert.equal(saved.body.result.downgradeBlocked,true);assert.equal(saved.body.rules.complete,true);assert.ok(saved.body.rules.version);assert.ok(saved.body.result.alerts.length>0);
  const payload=f.payload();assert.equal(payload.latest.spo2,88);assert.equal(payload.rule_result.status,'CRITICAL');assert.equal(payload.rule_result.version,saved.body.rules.version);assert.equal(payload.provenance.direct_sensor_connection,false);assert.equal(f.outgoing[0].body.store,false);
  const rejected=await f.run('/api/health-analysis',{method:'POST',body:{id:webcrypto.randomUUID(),snapshot:value,rules:{status:'NORMAL'},result:{status:'NORMAL'}}});assert.equal(rejected.status,400);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM health_analyses').get().n,1);
});

test('Successful analyses are immutable and cached without another agent request',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),value=snapshot(),body={id,snapshot:value};
  const first=await f.run('/api/health-analysis',{method:'POST',body});assert.equal(first.status,201);const raw=f.sql.prepare('SELECT * FROM health_analyses WHERE id=?').get(id);
  const duplicate=await f.run('/api/health-analysis',{method:'POST',body});assert.equal(duplicate.status,200);assert.equal(duplicate.body.duplicate,true);assert.deepEqual(duplicate.body.snapshot,first.body.snapshot);assert.deepEqual(duplicate.body.result,first.body.result);assert.equal(f.outgoing.length,1);
  const changed=copy(body);changed.snapshot.readings.heart_rate.value=120;assert.equal((await f.run('/api/health-analysis',{method:'POST',body:changed})).status,409);assert.deepEqual(f.sql.prepare('SELECT * FROM health_analyses WHERE id=?').get(id),raw);
  const latest=await f.run(),byId=await f.run('/api/health-analysis/'+id);assert.deepEqual(latest.body.item,byId.body.item);assert.equal(byId.body.item.id,id);assert.equal(f.outgoing.length,1);
});

test('Azure failure preserves rules and retry completes the same analysis once',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),body={id,snapshot:snapshot({spo2:reading(88,'%')})};f.provider(503);
  const first=await f.run('/api/health-analysis',{method:'POST',body});assert.equal(first.status,201);assert.equal(first.body.result.status,'CRITICAL');assert.equal(first.body.result.agentAvailable,false);assert.ok(first.body.result.summary);const raw=f.sql.prepare('SELECT snapshot_json,rules_json,created_at FROM health_analyses WHERE id=?').get(id);
  f.provider(200,JSON.stringify({status:'ATTENTION',alerts:['Synthetic agent note'],summary:'Review the supplied values.'}));
  const retry=await f.run('/api/health-analysis',{method:'POST',body});assert.equal(retry.status,201);assert.equal(retry.body.id,id);assert.equal(retry.body.result.agentAvailable,true);assert.equal(retry.body.result.status,'CRITICAL');assert.deepEqual(f.sql.prepare('SELECT snapshot_json,rules_json,created_at FROM health_analyses WHERE id=?').get(id),raw);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM health_analyses').get().n,1);assert.equal(f.outgoing.length,2);
});

test('Invalid agent JSON returns a persisted deterministic fallback',async t=>{
  const f=fixture(t);f.provider(200,'{"status":"NORMAL","alerts":[]');
  const saved=await f.post(snapshot({spo2:reading(88,'%')}));assert.equal(saved.status,201);assert.equal(saved.body.result.agentAvailable,false);assert.equal(saved.body.result.status,'CRITICAL');assert.ok(saved.body.result.summary);assert.equal((await f.run('/api/health-analysis/'+saved.body.id)).body.item.result.agentAvailable,false);
});

test('AIR_GAP prevents model requests and persists the deterministic result',async t=>{
  const f=fixture(t),saved=await f.post(snapshot(),{environment:{AIR_GAP:'1'}});assert.equal(saved.status,201);assert.equal(saved.body.result.agentAvailable,false);assert.equal(saved.body.result.status,saved.body.rules.status);assert.equal(f.outgoing.length,0);assert.equal((await f.run()).body.item.id,saved.body.id);
});

test('Skin temperature and wellbeing cannot replace missing body temperature',async t=>{
  const f=fixture(t),value=snapshot({body_temperature:null,skin_temperature:reading(39,'C'),wellbeing:reading(90,'/100'),recovery:reading(86,'/100')});
  const saved=await f.post(value);assert.equal(saved.status,201);assert.equal(saved.body.rules.complete,false);assert.notEqual(saved.body.rules.status,'NORMAL');assert.notEqual(saved.body.result.status,'NORMAL');
  const payload=f.payload();assert.equal(payload.latest.temperature,null);assert.equal(payload.latest.fatigue,null);assert.equal(payload.latest.fatigue_index,null);assert.equal(payload.latest.stress_index,null);assert.equal(payload.provenance.readings.skin_temperature.value,39);assert.equal(payload.provenance.readings.wellbeing.value,90);
});

test('Stale core readings remain unknown instead of becoming healthy agent conclusions',async t=>{
  const f=fixture(t),old=new Date(Date.parse(now)-20*60000).toISOString(),value=snapshot({heart_rate:reading(72,'bpm','manual',old),spo2:reading(98,'%','manual',old),body_temperature:reading(36.8,'C','manual',old)});
  const saved=await f.post(value);assert.equal(saved.status,201);assert.equal(saved.body.rules.complete,false);assert.equal(saved.body.rules.status,null);assert.equal(saved.body.result.status,null);assert.equal(saved.body.result.agentStatus,'NORMAL');assert.ok(!saved.body.result.summary.includes('Synthetic readings were supplied.'));
  const payload=f.payload();assert.equal(payload.latest.heart_rate,null);assert.equal(payload.latest.spo2,null);assert.equal(payload.latest.temperature,null);assert.ok(payload.rule_result.stale.includes('heart_rate'));
});

test('Analysis routes enforce owner isolation authentication and origin protection',async t=>{
  const f=fixture(t),saved=await f.post(),id=saved.body.id;assert.equal((await f.run('/api/health-analysis/'+id,{owner:'owner-b'})).status,404);assert.equal((await f.run('/api/health-analysis',{owner:'owner-b'})).body.item,null);
  assert.equal((await f.run('/api/health-analysis',{owner:'owner-b',method:'POST',body:{id,snapshot:snapshot()}})).status,409);
  for(const path of ['/api/health-analysis','/api/health-analysis/'+id])assert.equal((await f.run(path,{owner:null})).status,401);
  assert.equal((await f.post(snapshot(),{origin:'https://other.test'})).status,403);assert.equal(f.outgoing.length,1);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM health_analyses').get().n,1);
});

test('Invalid snapshots neither create analyses nor call the agent',async t=>{
  const f=fixture(t);
  const badProfile=snapshot();badProfile.profileId='jessica-meir';const badTime=snapshot();badTime.capturedAt='not-a-date';const badUnit=snapshot({spo2:reading(98,'bpm')}),badValue=snapshot({spo2:reading('98','%')});
  for(const value of [null,[],{},badProfile,badTime,badUnit,badValue])assert.equal((await f.post(value)).status,400,JSON.stringify(value));
  assert.equal((await f.run('/api/health-analysis',{method:'POST',body:{id:'not-an-id',snapshot:snapshot()}})).status,400);assert.equal(f.outgoing.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM health_analyses').get().n,0);
});

test('Actiwatch values come from the owner saved summary instead of client values',async t=>{
  const f=fixture(t),imported=f.importRow(),value=snapshot({sleep_hours:reading(23,'h','import'),activity:reading(99999,'counts','import'),light:reading(99999,'lx','import')});value.actiwatchImportId=imported.id;
  const saved=await f.post(value);assert.equal(saved.status,201);const readings=saved.body.snapshot.readings;assert.equal(readings.sleep_hours.value,7);assert.equal(readings.activity.value,1234);assert.equal(readings.light.value,56);assert.equal(readings.sleep_hours.observedAt,imported.summary.end);assert.equal(readings.sleep_hours.source,'import');
  assert.equal(f.payload().provenance.readings.activity.value,1234);assert.equal(f.payload().provenance.actiwatch_import_id,imported.id);
  const foreign=f.importRow({owner:'owner-b'}),other=snapshot();other.actiwatchImportId=foreign.id;assert.equal((await f.post(other)).status,404);assert.equal((await f.post(snapshot({sleep_hours:reading(7,'h','import')}))).status,400);assert.equal(f.outgoing.length,1);
});

test('Missing imported channels remain unknown and Actiwatch cannot supply heart rate',async t=>{
  const f=fixture(t),imported=f.importRow({sleepSeconds:null,activityCounts:null,meanLightLux:null}),value=snapshot();value.actiwatchImportId=imported.id;
  const saved=await f.post(value);assert.equal(saved.status,201);for(const key of ['sleep_hours','activity','light'])assert.equal(saved.body.snapshot.readings[key],null);assert.equal(saved.body.snapshot.readings.heart_rate.source,'manual');
  const invalid=snapshot({heart_rate:reading(72,'bpm','import')});invalid.actiwatchImportId=imported.id;assert.equal((await f.post(invalid)).status,400);assert.equal(f.outgoing.length,1);
});

test('Chat persists canonical snapshot metadata and retries use the frozen context',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),value=snapshot({spo2:reading(88,'%'),skin_temperature:reading(36.7,'C'),wellbeing:reading(80,'/100')});
  const first=await f.run('/api/chat',{method:'POST',environment:{AIR_GAP:'1'},body:{id,content:'Review my supplied readings.',attachments:[],healthSnapshot:value}});assert.equal(first.status,201);assert.equal(first.body.reply,null);assert.equal(first.body.message.healthContext.rules.status,'CRITICAL');
  const raw=f.sql.prepare('SELECT health_context_json FROM general_chat_messages WHERE id=?').get(id).health_context_json,stored=JSON.parse(raw);assert.equal(stored.snapshot.readings.skin_temperature.value,36.7);assert.equal(stored.snapshot.readings.wellbeing.value,80);
  const retry=await f.run('/api/chat',{method:'POST',body:{id,content:'Review my supplied readings.',attachments:[]}});assert.equal(retry.status,201);assert.ok(retry.body.reply);assert.match(retry.body.reply.content,/CRITICAL/);assert.equal(f.sql.prepare('SELECT health_context_json FROM general_chat_messages WHERE id=?').get(id).health_context_json,raw);
  const contextMessage=f.outgoing[0].body.input.find(item=>item.role==='system'&&item.content.includes('Context: ')),payload=JSON.parse(contextMessage.content.split('Context: ')[1]);assert.equal(payload.latest.spo2,88);assert.equal(payload.latest.temperature,36.8);assert.equal(payload.latest.fatigue,null);assert.equal(payload.provenance.readings.skin_temperature.value,36.7);assert.equal(payload.provenance.readings.wellbeing.value,80);
  const messages=(await f.run('/api/chat')).body.messages;assert.deepEqual(messages.find(message=>message.id===id).healthContext,stored);assert.equal((await f.run('/api/chat',{owner:'owner-b'})).body.messages.length,0);assert.equal((await f.run('/api/chat',{owner:'owner-b',method:'POST',body:{id,content:'Review my supplied readings.',attachments:[]}})).status,409);assert.equal(f.outgoing.length,1);
});

test('Chat rejects injected rules and saves the canonical Actiwatch summary',async t=>{
  const f=fixture(t),imported=f.importRow(),value=snapshot({activity:reading(987654,'counts','import')});value.actiwatchImportId=imported.id;value.rules={status:'CRITICAL'};
  const rejected=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Review data.',healthSnapshot:value}});assert.equal(rejected.status,400);delete value.rules;
  const saved=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Review data.',healthSnapshot:value}});assert.equal(saved.status,201);assert.equal(saved.body.message.healthContext.snapshot.readings.activity.value,1234);assert.equal(saved.body.message.healthContext.rules.status,'NORMAL');
  const context=JSON.parse(f.outgoing[0].body.input.find(item=>item.role==='system'&&item.content.includes('Context: ')).content.split('Context: ')[1]);assert.equal(context.provenance.readings.activity.value,1234);assert.equal(context.latest.fatigue,null);
});

test('Trends compare ten distinct manual timestamps and leave demonstration trends unknown',async t=>{
  const f=fixture(t),base=Date.parse(now);
  for(let index=0;index<9;index++){
    const observedAt=new Date(base-(9-index)*60000).toISOString(),value=snapshot({heart_rate:reading(index<5?60:80,'bpm','manual',observedAt)});value.capturedAt=observedAt;
    f.sql.prepare('INSERT INTO health_analyses (id,owner_id,snapshot_json,rules_json,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(webcrypto.randomUUID(),'owner-a',JSON.stringify(value),'{}','{}',observedAt,observedAt);
  }
  const saved=await f.post(snapshot({heart_rate:reading(80,'bpm')}));assert.equal(saved.status,201);assert.equal(f.payload().recent_trend.heart_rate,'rising');
  const demo=await f.post(snapshot({heart_rate:reading(80,'bpm','demo')}));assert.equal(demo.status,201);assert.equal(f.payload().recent_trend.heart_rate,'unknown');
});

test('Repeated timestamps and foreign-owner snapshots cannot manufacture a real trend',async t=>{
  const f=fixture(t),base=Date.parse(now);
  for(let index=0;index<9;index++){
    const observedAt=new Date(base-(9-index)*60000).toISOString(),value=snapshot({heart_rate:reading(60,'bpm','manual',observedAt)});value.capturedAt=observedAt;
    f.sql.prepare('INSERT INTO health_analyses (id,owner_id,snapshot_json,rules_json,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(webcrypto.randomUUID(),'owner-b',JSON.stringify(value),'{}','{}',observedAt,observedAt);
    const duplicate=snapshot({heart_rate:reading(60,'bpm','manual',new Date(base-60000).toISOString())});
    f.sql.prepare('INSERT INTO health_analyses (id,owner_id,snapshot_json,rules_json,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(webcrypto.randomUUID(),'owner-a',JSON.stringify(duplicate),'{}','{}',observedAt,observedAt);
  }
  const saved=await f.post(snapshot({heart_rate:reading(80,'bpm')}));assert.equal(saved.status,201);assert.equal(f.payload().recent_trend.heart_rate,'unknown');
});

test('Concurrent retry returns pending without starting a second Azure request',{timeout:2000},async t=>{
  const f=fixture(t),{release,started}=f.hold(),body={id:webcrypto.randomUUID(),snapshot:snapshot()};t.after(release);
  const first=f.run('/api/health-analysis',{method:'POST',body});await started;
  const pending=await f.run('/api/health-analysis',{method:'POST',body});assert.equal(pending.status,202);assert.equal(pending.body.pending,true);assert.equal(pending.body.id,body.id);assert.equal(f.outgoing.length,1);
  release();const complete=await first;assert.equal(complete.status,201);assert.equal(complete.body.result.agentAvailable,true);assert.equal(f.sql.prepare('SELECT lease_until FROM health_analyses WHERE id=?').get(body.id).lease_until,0);
  const cached=await f.run('/api/health-analysis',{method:'POST',body});assert.equal(cached.status,200);assert.equal(cached.body.duplicate,true);assert.equal(f.outgoing.length,1);
});


test('Plain conversational status text cannot bypass an abnormal saved rule floor',async t=>{
  const f=fixture(t);f.provider(200,'Status: NORMAL. Everything is normal.');
  const result=await f.run('/api/chat',{method:'POST',body:{id:webcrypto.randomUUID(),content:'Review the supplied readings.',healthSnapshot:snapshot({spo2:reading(88,'%')})}});
  assert.equal(result.status,201);assert.match(result.body.reply.content,/Prototype status: CRITICAL/);assert.doesNotMatch(result.body.reply.content,/Everything is normal|Status: NORMAL/);assert.equal(result.body.message.healthContext.rules.status,'CRITICAL');
});

test('A completed concurrent analysis is returned as ready when the lease CAS loses',async t=>{
  const f=fixture(t),id=webcrypto.randomUUID(),result={status:'NORMAL',agentStatus:'NORMAL',agentAvailable:true,summary:'The concurrent request completed.',alerts:[]};
  f.beforeClaim(()=>{f.sql.prepare('UPDATE health_analyses SET result_json=?,lease_until=0 WHERE id=?').run(JSON.stringify(result),id);});
  const response=await f.post(snapshot(),{body:{id}});assert.equal(response.status,200);assert.equal(response.body.pending,false);assert.equal(response.body.duplicate,true);assert.equal(response.body.result.summary,result.summary);assert.equal(f.outgoing.length,0);
});
