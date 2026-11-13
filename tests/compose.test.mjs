import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url);
const source=(await Promise.all(['speech','compose','index'].map(name=>readFile(new URL('worker/'+name+'.js',root),'utf8')))).join('\n').replace('export default','globalThis.app =');

function fixture(){
  const calls=[],logs=[];let dbAccess=0,reply=' I want to understand my wellbeing better.',handler=null;
  const env={LLM_API_KEY:'test-key',LLM_BASE_URL:'https://model.test/v1',LLM_MODEL:'test-model',DB:{prepare(){dbAccess++;throw new Error('Database access forbidden');}},PHOTOS:{get(){throw new Error('File reading forbidden');},put(){throw new Error('Recording files forbidden');}}};
  const scope={URL,Request,Response,Uint8Array,TextEncoder,TextDecoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{error(...values){logs.push(values);},warn(...values){logs.push(values);}},fetch:async(url,options)=>{
    const call={url,options,body:JSON.parse(options.body)};calls.push(call);
    return handler?handler(call):Response.json({choices:[{message:{content:reply}}]});
  }};
  vm.runInNewContext(source,scope);
  const run=async({owner='owner-a',method='POST',body={prefix:'Today I'},raw,headers:extra={},environment={}}={})=>{
    const headers={'content-type':'application/json',...extra};if(owner)headers['oai-authenticated-user-id']=owner;
    const response=await scope.app.fetch(new Request('https://mission.test/api/compose',{method,headers,...(['GET','HEAD'].includes(method)?{}:{body:raw??JSON.stringify(body)})}),{...env,...environment},{waitUntil(){throw new Error('Background recording forbidden');}});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  return {calls,logs,run,env,scope,dbAccess:()=>dbAccess,reply(value){reply=value;},handler(value){handler=value;}};
}

test('Autocomplete requires authentication before reading the body or calling the model',async()=>{
  const f=fixture(),result=await f.run({owner:null,raw:'{'});
  assert.equal(result.status,401);assert.equal(result.body.error,'sign_in_required');assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
});

test('Spoofed origins and cross-site requests do not send drafts to the provider',async()=>{
  const f=fixture();
  for(const headers of [{origin:'https://other.test'},{'sec-fetch-site':'cross-site'}]){const result=await f.run({headers});assert.equal(result.status,403);assert.equal(result.body.error,'forbidden');}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
  assert.equal((await f.run({headers:{origin:'https://mission.test'}})).status,200);
});

test('The route supports only POST with a real JSON content type',async()=>{
  const f=fixture();
  for(const method of ['GET','PUT','DELETE']){const result=await f.run({method});assert.equal(result.status,405);assert.equal(result.body.error,'method_not_allowed');}
  for(const type of ['text/plain','application/jsonp','application/json-other'])assert.equal((await f.run({headers:{'content-type':type}})).status,400);
  assert.equal(f.calls.length,0);
  assert.equal((await f.run({headers:{'content-type':'application/json; charset=utf-8'}})).status,200);
});

test('Empty and short prefixes return empty completion without a model or database',async()=>{
  const f=fixture();
  for(const prefix of ['', ' ', 'I', 'we', '  ab  ']){const result=await f.run({body:{prefix},environment:{AIR_GAP:'1'}});assert.equal(result.status,200);assert.deepEqual(result.body,{completion:''});}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
  assert.equal((await f.run({body:{prefix:'abc'}})).status,200);assert.equal(f.calls.length,1);
});

test('Invalid JSON and prefix types are rejected with a stable code',async()=>{
  const f=fixture();
  for(const options of [{raw:'{'},{body:null},{body:[]},{body:{}},{body:{prefix:123}},{raw:new Uint8Array([0xff,0xff])}]){const result=await f.run(options);assert.equal(result.status,400);assert.equal(result.body.error,'invalid_input');}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
});

test('The prefix limit is 6000 characters and is not silently truncated',async()=>{
  const f=fixture();
  assert.equal((await f.run({body:{prefix:'a'.repeat(6000)}})).status,200);assert.equal(f.calls[0].body.messages[1].content.length,6000);assert.equal((await f.run({body:{prefix:'I'.repeat(6000)}})).status,200);
  const result=await f.run({body:{prefix:'a'.repeat(6001)}});assert.equal(result.status,400);assert.equal(result.body.error,'invalid_input');assert.equal(f.calls.length,2);
});

test('Body size is checked using actual bytes regardless of content-length',async()=>{
  const f=fixture();
  for(const options of [{headers:{'content-length':'20001'}},{body:{prefix:'I'.repeat(6000),extra:'x'.repeat(15000)}},{body:{prefix:'I'.repeat(6000),extra:'x'.repeat(15000)},headers:{'content-length':'1'}},{raw:' '.repeat(20001)}]){const result=await f.run(options);assert.equal(result.status,413);assert.equal(result.body.error,'payload_too_large');}
  assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
});

test('The provider receives only the prefix and an instruction to continue the author’s text',async()=>{
  const f=fixture(),prefix='Today I feel';
  const result=await f.run({body:{prefix,history:['Private history'],profile:'jessica-meir',ownerId:'owner-b'}});
  assert.equal(result.status,200);assert.equal(f.dbAccess(),0);assert.equal(f.calls.length,1);
  const {body,options}=f.calls[0];assert.equal(body.messages.length,2);assert.equal(body.messages[1].content,prefix);assert.equal(body.messages[1].role,'user');
  assert.ok(body.messages[0].content.includes('in the author’s own voice'));assert.ok(body.messages[0].content.includes('Do not reply to the message'));assert.ok(body.messages[0].content.includes('Do not repeat the prefix'));
  assert.ok(!JSON.stringify(body).includes('Private history'));assert.ok(!JSON.stringify(body).includes('jessica-meir'));assert.ok(!JSON.stringify(body).includes('owner-b'));
  assert.equal(body.store,false);assert.equal(body.max_completion_tokens,256);assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,'Bearer test-key');
  assert.equal(result.headers.get('cache-control'),'private, no-store');
});

test('Concurrent requests from different owners do not share draft context',async()=>{
  const f=fixture();await Promise.all([f.run({body:{prefix:'First personal text'}}),f.run({owner:'owner-b',body:{prefix:'Second personal text'}})]);
  assert.equal(f.calls.length,2);assert.deepEqual(f.calls.map(call=>call.body.messages[1].content).sort(),['First personal text','Second personal text'].sort());assert.ok(f.calls.every(call=>call.body.messages.length===2));assert.equal(f.dbAccess(),0);
});

test('Echoed full prefixes are removed including quotes and case differences',async()=>{
  const f=fixture(),prefix='Today I';
  for(const answer of ['Today I want to rest.','  Today I want to rest.','today I want to rest.','"Today I want to rest."','«Today I want to rest.»']){f.reply(answer);const result=await f.run({body:{prefix}});assert.equal(result.status,200);assert.equal(result.body.completion,' want to rest.');assert.ok(!result.body.completion.includes(prefix));}
  f.reply('Today I');assert.equal((await f.run({body:{prefix}})).body.completion,'');
});

test('Joining whitespace and incomplete-word continuations are preserved',async()=>{
  const f=fixture();f.reply(' want to sleep.');assert.equal((await f.run({body:{prefix:'Today I'}})).body.completion,' want to sleep.');
  f.reply('el better today.');assert.equal((await f.run({body:{prefix:'I fe'}})).body.completion,'el better today.');
  f.reply('Today I want to sleep.');assert.equal((await f.run({body:{prefix:'Today I '}})).body.completion,'want to sleep.');
});

test('Completion is limited to 20 words and stripped of control characters',async()=>{
  const f=fixture();f.reply(' '+Array.from({length:30},(_,i)=>'word'+i).join('\n')+'\u0000');
  const result=await f.run();assert.equal(result.status,200);assert.equal(result.body.completion.trim().split(/\s+/).length,20);assert.ok(!/[\n\r\t\u0000]/.test(result.body.completion));assert.ok(result.body.completion.startsWith(' '));
  f.reply(' even\twarmer \u2014 and calmer.');assert.equal((await f.run()).body.completion,' even warmer - and calmer.');
});

test('A long word is limited to 300 characters without corrupting Unicode',async()=>{
  const f=fixture();f.reply('🙂'.repeat(500));const result=await f.run();assert.equal(Array.from(result.body.completion).length,300);assert.ok(!result.body.completion.includes('\ufffd'));
});

test('No configured model returns an availability error without fabricated text',async()=>{
  const f=fixture();for(const environment of [{LLM_API_KEY:''},{LLM_MODEL:''},{LLM_BASE_URL:''}]){const result=await f.run({environment});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});}
  assert.equal(f.calls.length,0);
});

test('AIR GAP blocks external models even with valid settings',async()=>{
  const f=fixture();const result=await f.run({environment:{AIR_GAP:'1'}});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});assert.equal(f.calls.length,0);assert.equal(f.dbAccess(),0);
  assert.equal((await f.run({environment:{AIR_GAP:'1',LLM_BASE_URL:'https://user:secret@localhost/v1'}})).status,503);assert.equal(f.calls.length,0);
});

test('AIR GAP allows a configured local model without cloud fallback',async()=>{
  const f=fixture();
  for(const base of ['http://127.0.0.1:8090/v1','http://localhost:8090/v1','http://10.0.0.5/v1','http://models.internal/v1']){const result=await f.run({environment:{AIR_GAP:'1',LLM_BASE_URL:base,LLM_API_KEY:''}});assert.equal(result.status,200);assert.equal(f.calls.at(-1).url,base+'/chat/completions');assert.equal(f.calls.at(-1).options.headers.authorization,undefined);assert.equal(f.calls.at(-1).options.redirect,'manual');}
  assert.equal(f.calls.length,4);
});

test('Local model redirects to external hosts are rejected',async()=>{
  const f=fixture();f.handler(()=>new Response(null,{status:307,headers:{location:'https://other.test/model'}}));
  const result=await f.run({environment:{AIR_GAP:'1',LLM_BASE_URL:'http://localhost:8090/v1'}});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.redirect,'manual');
});

test('Network failures and invalid provider responses make one request and a stable error',async()=>{
  const f=fixture();
  for(const handler of [()=>{throw new Error('Network failure');},()=>new Response('unavailable',{status:503}),()=>new Response('{',{status:200}),()=>Response.json({choices:[]}),()=>Response.json({choices:[{message:{content:'   '}}]})]){
    f.handler(handler);const before=f.calls.length,result=await f.run();assert.equal(result.status,503);assert.deepEqual(result.body,{error:'assistant_unavailable'});assert.equal(f.calls.length,before+1);
  }
  assert.equal(f.dbAccess(),0);
});

test('Parsing a structured model response preserves only text parts',async()=>{
  const f=fixture();f.handler(()=>Response.json({choices:[{message:{content:[{type:'text',text:' want'},{type:'text',text:' to rest.'}]}}]}));
  assert.equal((await f.run()).body.completion,' want to rest.');
});

test('Standard helper preserves previous limits, retries, and redirect behavior',async()=>{
  const f=fixture();let attempt=0;f.handler(()=>++attempt===1?new Response('unavailable',{status:503}):Response.json({choices:[{message:{content:'Normal answer'}}]}));
  const answer=await f.scope.completeLanguageMessages(f.env,[{role:'user',content:'Normal chat'}]);assert.equal(answer.text,'Normal answer');assert.equal(f.calls.length,2);assert.ok(f.calls.every(call=>call.body.max_completion_tokens===1536));assert.ok(f.calls.every(call=>!Object.hasOwn(call.options,'redirect')));
});
test('Autocomplete keeps its utility model when Azure is selected for primary chat',async()=>{
  const f=fixture(),result=await f.run({environment:{LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:'https://agent.test/responses?api-version=v1',AZURE_AGENT_API_KEY:'synthetic-azure-key'}});
  assert.equal(result.status,200);assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://model.test/v1/chat/completions');assert.equal(f.calls[0].options.headers['api-key'],undefined);assert.ok(f.calls[0].body.messages[0].content.includes('Continue the exact supplied prefix'));assert.equal(f.calls[0].body.max_completion_tokens,256);
});
