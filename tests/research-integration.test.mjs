import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readWorkerSource} from '../scripts/worker-sources.mjs';

const root=new URL('../',import.meta.url),data=JSON.parse(await readFile(new URL('public/data/nasa-research.json',root),'utf8'));
const coreScope={};vm.runInNewContext(await readFile(new URL('public/research-core.js',root),'utf8'),coreScope);const core=coreScope.MissionResearchCore;
const copy=x=>JSON.parse(JSON.stringify(x));
const now=new Date().toISOString(),snapshot=(value=7,source='manual',at=now)=>({profileId:'personal',capturedAt:at,actiwatchImportId:null,readings:{sleep_hours:{value,unit:'h',source,observedAt:source==='demo'?null:at}}});

test('NASA sleep and exercise tables match the catalog checksums and all published values',async()=>{
  for(const [name,item] of Object.entries(data.provenance)){const bytes=await readFile(new URL('research/raw/nasa-context/'+name,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(bytes.length,item.bytes);}
  assert.equal(data.sources.length,5);assert.equal(data.sources.find(s=>s.key==='sleep').rows.length,207);assert.equal(data.sources.find(s=>s.key==='exercise').rows.length,39);
  assert.equal(createHash('md5').update(await readFile(new URL('research/raw/nasa-context/actigraphy.csv',root))).digest('hex'),'761c8d9d31e107186be1b9ca9d2bea79');
  assert.equal(data.sources.find(s=>s.key==='sleep').rows[0].sleep_hours,7+44/60);assert.equal(data.sources.find(s=>s.key==='sleep').participants.length,3);
  assert.equal(data.sources.find(s=>s.key==='cmp').rows.length,28);assert.ok(data.evidence.every(e=>/^https:\/\/(?:nlsp|ntrs|osdr)\.nasa\.gov\//.test(e.url)));
});
test('Personal baseline excludes future, different sources, wrong units and duplicate timestamps',()=>{
  const at=n=>new Date(Date.parse(now)+n*3600000).toISOString();
  const records=[{snapshot:snapshot(8,'manual',at(-4))},{snapshot:snapshot(7,'manual',at(-3))},{snapshot:snapshot(6,'manual',at(-2))},{snapshot:snapshot(2,'demo',at(-1))},{snapshot:snapshot(23,'manual',at(1))},{snapshot:snapshot(6,'manual',at(-2))}];
  const wrong=snapshot(12,'manual',at(-1));wrong.readings.sleep_hours.unit='min';records.push({snapshot:wrong});
  const result=core.personalSeries(snapshot(6),records,'sleep_hours',7);assert.equal(result.points.length,4);assert.equal(result.baseline,7);assert.equal(result.delta,-1);
  assert.equal(core.personalSeries(snapshot(),[],'sleep_hours').baseline,null);
});
test('Research displays the agent summary without its unrelated clinical template or raw emphasis',async()=>{
  const scope={};vm.runInNewContext(await readFile(new URL('worker/research.js',root),'utf8')+';globalThis.clean=researchAnswer;',scope);
  assert.equal(scope.clean('STATUS:\nNORMAL\n\nALERTS:\n- An alert\n\nSUMMARY:\n**Sleep** stayed stable.'),'Sleep stayed stable.');
  assert.equal(scope.clean(JSON.stringify({status:'NORMAL',alerts:[],summary:'Review the earlier sleep observations.'})),'Review the earlier sleep observations.');
});
test('NASA baselines retain the same participant or exercise group and original units',()=>{
  const sleep=data.sources.find(s=>s.key==='sleep'),a=core.sourceSeries(sleep,'C1G0001','sleep_hours');assert.ok(a.length>20);assert.ok(Math.abs(core.baseline(a)-(7+44/60+7+50/60)/2)<1e-10);
  const exercise=core.sourceSeries(data.sources.find(s=>s.key==='exercise'),'CTRL','value');assert.equal(exercise.length,13);assert.equal(exercise[0].label,'PRE 1');assert.ok(core.baseline(exercise)>0);
  const facts=core.lexicalEvidence(data,'sleep fatigue','recovery');assert.ok(facts.length);assert.ok(facts.every(v=>v.topic==='recovery'||v.topics.includes('recovery')));
});

async function fixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());for(const name of (await readdir(new URL('drizzle/',root))).filter(n=>n.endsWith('.sql')).sort())sql.exec(await readFile(new URL('drizzle/'+name,root),'utf8'));
  const DB={prepare(query){const s=sql.prepare(query);return {bind(...args){return {first:async()=>s.get(...args)||null,all:async()=>({results:s.all(...args)}),run:async()=>s.run(...args)};}};},async batch(commands){sql.exec('BEGIN');try{const results=[];for(const command of commands)results.push(await command.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const calls=[];let unavailable=false;
  const scope={URL,Request,Response,FormData,Blob,TextEncoder,TextDecoder,Uint8Array,DataView,AbortSignal,crypto:webcrypto,atob,console,fetch:async(url,options)=>{
    const body=options.body?JSON.parse(options.body):null;calls.push({url,body});
    if(url==='https://memory.test/search')return Response.json({matches:data.evidence.map((e,i)=>({id:e.id,score:.88-i*.01})).concat([{id:webcrypto.randomUUID(),score:.99}])});
    if(url==='https://memory.test/upsert')return Response.json({indexed:true});
    if(unavailable)return new Response('offline',{status:503});
    return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Sleep is lower than your earlier baseline. NASA provides context for sleep and workload. Keep a dated note of sleep interruptions.'}]}]});
  }};
  vm.runInNewContext((await readWorkerSource()).replace('export default','globalThis.app='),scope);
  const env={DB,LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://azure.test/agents/NASA-AI/endpoint/protocols/openai/responses',AZURE_AGENT_API_KEY:'test-key',MEMORY_URL:'https://memory.test',MEMORY_API_KEY:'memory-test-key'};
  const body=()=>({id:webcrypto.randomUUID(),topic:'recovery',days:7,snapshot:snapshot()});
  async function request(value,{owner='one',method='POST',path='/api/research-analysis',origin}={}){
    const headers={'content-type':'application/json'};if(owner)headers['oai-authenticated-user-id']=owner;if(origin)headers.origin=origin;
    const r=await scope.app.fetch(new Request('https://app.test'+path,{method,headers,body:method==='POST'?JSON.stringify(value):undefined}),env,{waitUntil(){}});return {status:r.status,body:await r.json()};
  }
  return {sql,scope,calls,body,request,fail:()=>unavailable=true,recover:()=>unavailable=false};
}
test('Research combines owner-only history, scoped NASA Qdrant evidence and Azure, then archives once',async t=>{
  const f=await fixture(t);
  for(const [owner,value]of [['one',8],['two',18]]){const s=snapshot(value,'manual',new Date(Date.parse(now)-3600000).toISOString());f.sql.prepare('INSERT INTO health_readings(id,owner_id,snapshot_json,source_name,created_at) VALUES(?,?,?,?,?)').run(webcrypto.randomUUID(),owner,JSON.stringify(s),'My report',s.capturedAt);}
  const input=f.body(),r=await f.request(input);assert.equal(r.status,201);assert.equal(r.body.observations.sleep_hours.delta,-1);assert.equal(r.body.retrieval,'qdrant');assert.equal(r.body.saved,true);
  assert.ok(r.body.references.every(e=>['sleep','exercise','journals'].includes(e.sourceKey)));
  assert.ok(f.calls.some(c=>c.url.endsWith('/search')&&c.body.ownerId===data.scope));
  const ai=f.calls.find(c=>c.url.startsWith('https://azure.test/'));assert.ok(ai);const context=JSON.parse(ai.body.input.find(m=>m.role==='user').content);assert.equal(context.observations.sleep_hours.baseline,8);assert.equal(context.nasaStudy.unit,'h');assert.equal(context.nasaStudy.participant,'C1G0001');assert.ok(context.nasaStudy.points.length>20);assert.equal(JSON.stringify(context).includes('owner_id'),false);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM journal_messages WHERE owner_id='one' AND assistant_source='research-analysis'").get().n,1);
  const again=await f.request(input);assert.equal(again.status,200);assert.equal(f.calls.filter(c=>c.url.startsWith('https://azure.test/')).length,1);
  assert.equal((await f.request(null,{method:'GET',path:'/api/research-analysis/'+input.id,owner:'two'})).status,404);
});
test('Research validates access and input, and retries a failed Azure run without losing the original request',async t=>{
  const f=await fixture(t),input=f.body();assert.equal((await f.request(input,{owner:null})).status,401);assert.equal((await f.request(input,{origin:'https://other.test'})).status,403);
  assert.equal((await f.request({...input,topic:'injected'})).status,400);assert.equal((await f.request({...input,study:{source:'sleep',participant:'other-person',metric:'sleep_hours'}})).status,400);
  f.fail();assert.equal((await f.request(input)).status,503);assert.equal(f.sql.prepare('SELECT count(*) n FROM journal_messages').get().n,0);f.recover();assert.equal((await f.request(input)).status,201);
  assert.equal((await f.request({...input,days:30})).status,409);
});
test('Preflight research keeps synthetic history separate and marks its archived interpretation',async t=>{
  const f=await fixture(t),preflight=f.scope.MissionPreflightCore.create(Date.parse(now)),r=await f.request({...f.body(),snapshot:copy(preflight.snapshot)});
  assert.equal(r.status,201);assert.equal(r.body.synthetic,true);assert.equal(r.body.observations.sleep_hours.source,'demo');assert.ok(r.body.observations.sleep_hours.points.length>1);
  assert.match(f.sql.prepare("SELECT content FROM journal_messages WHERE assistant_source='research-analysis'").get().content,/Preflight \/ synthetic/);
});
test('Research renders exactly three blocks and retains English, Spanish and Urdu controls',async()=>{
  const nodes=new Map(),make=()=>({hidden:false,textContent:'',innerHTML:'',replaceChildren(){},addEventListener(){}}),get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
  const window={addEventListener(){},missionHome:{sampleActive:()=>false,model:()=>snapshot()},missionReadings:{records:()=>[]}};
  const scope={state:{workspace:'research',language:'en'},window,document:{querySelector:()=>make(),getElementById:get},$:get,Intl,Date,Number,Map,Set,globalThis:null,fetch:()=>new Promise(()=>{})};scope.globalThis=scope;
  vm.runInNewContext(await readFile(new URL('public/research-core.js',root),'utf8')+'\n'+await readFile(new URL('public/research.js',root),'utf8'),scope);
  scope.bundle=data;vm.runInNewContext('researchState.data=bundle;renderResearch()',scope);
  for(const lang of ['en','es','ur']){scope.state.language=lang;scope.window.research.render();const html=get('research-main').innerHTML;assert.equal((html.match(/data-research-block=/g)||[]).length,3);assert.equal(html.includes('NaN'),false);const evidence=html.split('data-research-block="evidence"')[1].split('</section>')[0],catalog=evidence.split('<ul class="research-source-list">')[1].split('</ul>')[0];assert.equal((catalog.match(/<li>/g)||[]).length,5);for(const source of data.sources)assert.ok(catalog.includes('href="'+source.url+'"'));assert.ok(evidence.indexOf('research-sources-used')<evidence.indexOf('research-study-controls'));}
});
