import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {readWorkerSource} from '../scripts/worker-sources.mjs';

const root=new URL('../',import.meta.url);
const source=(await readWorkerSource(root)).replace('export default','globalThis.app =');
const migrations=await Promise.all((await readdir(new URL('drizzle/',root))).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(new URL('drizzle/'+name,root),'utf8')));
const clone=value=>JSON.parse(JSON.stringify(value));
const at=new Date().toISOString();
const reading=(value,unit,observedAt=at)=>({value,unit,source:'manual',observedAt});
const snapshot=readings=>({profileId:'personal',capturedAt:at,actiwatchImportId:null,readings});
const input=(readings={heart_rate:reading(72,'bpm')})=>({id:webcrypto.randomUUID(),snapshot:snapshot(readings),sourceName:'Synthetic manual test entry'});

function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());for(const migration of migrations)sql.exec(migration);
  let beforeBatch=null,memoryStatus=200;
  const DB={prepare(query){const statement=sql.prepare(query);return {bind(...values){return {first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>statement.run(...values)};}};},async batch(commands){if(beforeBatch){const callback=beforeBatch;beforeBatch=null;callback();}sql.exec('BEGIN');try{const results=[];for(const command of commands)results.push(await command.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const outgoing=[];
  const scope={URL,Request,Response,FormData,Blob,Uint8Array,TextEncoder,TextDecoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{warn(){},error(){}},fetch:async(url,options={})=>{
    outgoing.push({url,body:options.body?JSON.parse(options.body):null});
    if(new URL(url).hostname==='memory.test')return memoryStatus===200?Response.json({indexed:true,matches:[]}):new Response('unavailable',{status:memoryStatus});
    return Response.json({status:'completed',output:[]});
  }};
  vm.runInNewContext(source,scope);
  const settings={DB,LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-test-key'};
  async function run({method='GET',owner='owner-a',body,origin,environment={}}={}){
    const headers={'content-type':'application/json'};if(owner)headers['oai-authenticated-user-id']=owner;if(origin)headers.origin=origin;
    const response=await scope.app.fetch(new Request('https://mission.test/api/readings',{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),{...settings,...environment},{waitUntil(){}});
    return {status:response.status,body:await response.json()};
  }
  const post=(body=input(),options={})=>run({method:'POST',body,...options});
  const note=(id,owner='owner-b')=>sql.prepare("INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,assistant_source) VALUES (?,?,?,?,?,?,?,?)").run(id,owner,'personal','note','Synthetic existing private note','en',at,'server');
  return {sql,run,post,note,outgoing,memory:{MEMORY_URL:'https://memory.test',MEMORY_API_KEY:'synthetic-memory-key'},memoryStatus:value=>{memoryStatus=value;},beforeBatch:callback=>{beforeBatch=callback;}};
}

test('A new owner has no invented readings, source metadata or history',async t=>{
  const f=fixture(t),result=await f.run();assert.equal(result.status,200);assert.equal(result.body.snapshot.profileId,'personal');assert.equal(result.body.snapshot.actiwatchImportId,null);assert.ok(Object.values(result.body.snapshot.readings).every(value=>value===null));assert.ok(Number.isFinite(Date.parse(result.body.snapshot.capturedAt)));assert.deepEqual(result.body.records,[]);assert.deepEqual(result.body.provenance,{});assert.equal(result.body.maxRecords,200);assert.equal(result.body.truncated,false);assert.equal(f.outgoing.length,0);
});

test('Saving measurements preserves exact values units observed times and source without generating an AI answer',async t=>{
  const f=fixture(t),body=input({heart_rate:reading(71.25,'bpm'),spo2:reading(97,'%'),body_temperature:reading(36.8,'C'),skin_temperature:reading(33.4,'C'),steps:reading(0,'steps')});
  const result=await f.post(body);assert.equal(result.status,201);assert.equal(result.body.duplicate,false);assert.equal(result.body.record.sourceName,body.sourceName);assert.equal(result.body.record.vectorStatus,'pending');for(const [key,value] of Object.entries(body.snapshot.readings)){assert.deepEqual(result.body.record.snapshot.readings[key],value);assert.deepEqual(result.body.snapshot.readings[key],value);assert.equal(result.body.provenance[key].recordId,body.id);assert.equal(result.body.provenance[key].sourceName,body.sourceName);}
  const row=f.sql.prepare('SELECT * FROM journal_messages WHERE id=?').get(body.id);assert.equal(row.role,'note');assert.equal(row.astronaut_id,'personal');assert.equal(row.assistant_source,'measurement-record');assert.match(row.content,/Heart rate: 71\.25 bpm/);assert.match(row.content,/Body temperature: 36\.8 C/);assert.match(row.content,/Skin temperature: 33\.4 C/);assert.ok(row.content.includes(at));assert.match(row.content,/direct device connection has not been verified/);assert.equal(f.outgoing.length,0);
});

test('The latest snapshot merges actual per-field observation times rather than insertion order',async t=>{
  const f=fixture(t),older=new Date(Date.parse(at)-3600000).toISOString(),newer=new Date(Date.parse(at)-60000).toISOString();
  const first=input({heart_rate:reading(80,'bpm',newer),spo2:reading(96,'%',older)}),second=input({heart_rate:reading(70,'bpm',older),body_temperature:reading(36.6,'C',newer)});
  await f.post(first);await f.post(second);const result=await f.run();assert.equal(result.body.snapshot.readings.heart_rate.value,80);assert.equal(result.body.snapshot.readings.spo2.value,96);assert.equal(result.body.snapshot.readings.body_temperature.value,36.6);assert.equal(result.body.snapshot.readings.recovery,null);assert.equal(result.body.provenance.heart_rate.recordId,first.id);assert.equal(result.body.records.length,2);
});

test('History is bounded while the latest-known snapshot retains fields older than its history window',async t=>{
  const f=fixture(t),first=input({heart_rate:reading(73,'bpm')}),saved=await f.post(first);
  const insert=f.sql.prepare('INSERT INTO health_readings (id,owner_id,snapshot_json,source_name,created_at) VALUES (?,?,?,?,?)');
  for(let index=0;index<205;index++){const value=input({steps:reading(index,'steps')});insert.run(value.id,'owner-a',JSON.stringify(value.snapshot),'Synthetic bounded-history fixture',new Date(Date.parse(saved.body.record.createdAt)+index+1).toISOString());}
  const result=await f.run();assert.equal(result.body.records.length,200);assert.equal(result.body.truncated,true);assert.equal(result.body.snapshot.readings.heart_rate.value,73);assert.equal(result.body.provenance.heart_rate.recordId,first.id);assert.ok(!result.body.records.some(record=>record.id===first.id));
});

test('Idempotent retries preserve one record and one diary note and reject edited payloads',async t=>{
  const f=fixture(t),body=input(),first=await f.post(body),second=await f.post(body);assert.equal(first.status,201);assert.equal(second.status,200);assert.equal(second.body.duplicate,true);assert.deepEqual(second.body.record,first.body.record);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,1);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM journal_messages').get().count,1);
  const changed=clone(body);changed.snapshot.readings.heart_rate.value=90;assert.equal((await f.post(changed)).status,409);assert.equal((await f.post({...body,sourceName:'Another source'})).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,1);
});

test('Authentication origin checks and owner isolation protect measurements and their journal records',async t=>{
  const f=fixture(t),body=input();await f.post(body);assert.equal((await f.run({owner:null})).status,401);assert.equal((await f.post(body,{owner:null})).status,401);assert.equal((await f.post(input(),{origin:'https://foreign.test'})).status,403);assert.equal((await f.post(body,{owner:'owner-b'})).status,409);const other=await f.run({owner:'owner-b'});assert.deepEqual(other.body.records,[]);assert.ok(Object.values(other.body.snapshot.readings).every(value=>value===null));assert.deepEqual(other.body.provenance,{});assert.equal(f.outgoing.length,0);
});

test('Synthetic imported and missing measurements cannot be submitted as real manual readings',async t=>{
  const f=fixture(t),cases=[input({}),input({heart_rate:{value:72,unit:'bpm',source:'demo',observedAt:null}}),input({heart_rate:{value:72,unit:'bpm',source:'import',observedAt:at}}),input({heart_rate:reading(301,'bpm')}),input({spo2:reading(101,'%')}),input({heart_rate:reading('72','bpm')}),input({heart_rate:reading(72,'%')}),input({unknown:reading(72,'bpm')}),input({heart_rate:{value:72,unit:'bpm',source:'manual'}}),input({heart_rate:reading(72,'bpm',new Date(Date.parse(at)+3600000).toISOString())})];
  const foreign=input();foreign.snapshot.profileId='jessica-meir';cases.push(foreign);const watch=input();watch.snapshot.actiwatchImportId=webcrypto.randomUUID();cases.push(watch);
  for(const body of cases)assert.equal((await f.post(body)).status,400);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM journal_messages').get().count,0);assert.equal(f.outgoing.length,0);
});

test('Record identifiers and source labels are validated without accepting caller-owned metadata',async t=>{
  const f=fixture(t),cases=[{...input(),id:'not-an-id'},{...input(),sourceName:''},{...input(),sourceName:'x'.repeat(121)},{...input(),sourceName:'Line\nTwo'},{...input(),owner_id:'owner-b'},{...input(),vectorStatus:'indexed'},{...input(),result:{status:'NORMAL'}},{...input(),sourceName:123}];
  for(const body of cases)assert.equal((await f.post(body)).status,400);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,0);const result=await f.post({...input(),sourceName:'  Synthetic  manual  source  '});assert.equal(result.body.record.sourceName,'Synthetic manual source');
});

test('A preexisting diary identifier is never overwritten or appropriated by a measurement',async t=>{
  const f=fixture(t),body=input();f.note(body.id);assert.equal((await f.post(body)).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,0);assert.equal(f.sql.prepare('SELECT owner_id FROM journal_messages WHERE id=?').get(body.id).owner_id,'owner-b');
});

test('A racing diary insert cannot leave an orphan reading or overwrite another owner note',async t=>{
  const f=fixture(t),body=input();f.beforeBatch(()=>f.note(body.id));assert.equal((await f.post(body)).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,0);assert.equal(f.sql.prepare('SELECT owner_id FROM journal_messages WHERE id=?').get(body.id).owner_id,'owner-b');assert.equal(f.outgoing.length,0);
});

test('A failed atomic journal insert rolls back the measurement before any embedding call',async t=>{
  const f=fixture(t);f.sql.exec("CREATE TRIGGER synthetic_reading_note_failure BEFORE INSERT ON journal_messages WHEN NEW.assistant_source='measurement-record' BEGIN SELECT RAISE(ABORT,'synthetic note failure'); END");const result=await f.post(input(),{environment:f.memory});assert.equal(result.status,503);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM journal_messages').get().count,0);assert.equal(f.outgoing.length,0);
});

test('Embedding receives only the saved owner-scoped factual record and success marks its actual status',async t=>{
  const f=fixture(t),body=input({heart_rate:reading(77,'bpm'),spo2:reading(98,'%')});const result=await f.post(body,{environment:f.memory});assert.equal(result.status,201);assert.equal(result.body.record.vectorStatus,'indexed');assert.equal(f.outgoing.length,1);assert.equal(f.outgoing[0].url,'https://memory.test/upsert');assert.equal(f.outgoing[0].body.ownerId,'owner-a');assert.equal(f.outgoing[0].body.astronautId,'personal');assert.equal(f.outgoing[0].body.id,body.id);assert.match(f.outgoing[0].body.text,/Heart rate: 77 bpm/);assert.match(f.outgoing[0].body.text,/Blood oxygen saturation: 98 %/);assert.equal(f.outgoing[0].body.language,'en');assert.equal((await f.run()).body.records[0].vectorStatus,'indexed');await f.post(body,{environment:f.memory});assert.equal(f.outgoing.length,1);
});

test('Embedding failure preserves real measurements pending and an idempotent retry indexes the same note',async t=>{
  const f=fixture(t),body=input();f.memoryStatus(503);const first=await f.post(body,{environment:f.memory});assert.equal(first.status,201);assert.equal(first.body.record.vectorStatus,'pending');assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM health_readings').get().count,1);f.memoryStatus(200);const second=await f.post(body,{environment:f.memory});assert.equal(second.status,200);assert.equal(second.body.duplicate,true);assert.equal(second.body.record.vectorStatus,'indexed');assert.equal(f.outgoing.length,2);assert.equal(f.outgoing[0].body.id,f.outgoing[1].body.id);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM journal_messages').get().count,1);
});

test('Measurement intake does not invent values from a saved Actiwatch import',async t=>{
  const f=fixture(t),result=await f.run();assert.equal(result.body.snapshot.actiwatchImportId,null);for(const key of ['sleep_hours','activity','light'])assert.equal(result.body.snapshot.readings[key],null);assert.equal((await f.run({method:'PUT',body:input()})).status,405);assert.equal((await f.run({method:'DELETE'})).status,405);
});

test('Canonical reading sources remain exact on save retry and read without invoking translation models',async t=>{
  const f=fixture(t),body={...input(),sourceName:'\u041f\u0440\u0438\u0431\u043e\u0440'},environment={LLM_BASE_URL:'https://utility.test/v1',LLM_MODEL:'synthetic-utility-model',LLM_API_KEY:'synthetic-utility-key'};
  const saved=await f.post(body,{environment});assert.equal(saved.status,201);assert.equal(saved.body.record.sourceName,body.sourceName);assert.equal(saved.body.provenance.heart_rate.sourceName,body.sourceName);assert.equal(f.sql.prepare('SELECT source_name FROM health_readings WHERE id=?').get(body.id).source_name,body.sourceName);
  const retry=await f.post(body,{environment});assert.equal(retry.status,200);assert.equal(retry.body.duplicate,true);assert.equal(retry.body.record.sourceName,body.sourceName);
  const loaded=await f.run({environment});assert.equal(loaded.status,200);assert.equal(loaded.body.records[0].sourceName,body.sourceName);assert.equal(loaded.body.provenance.heart_rate.sourceName,body.sourceName);assert.equal(f.outgoing.length,0);
});
