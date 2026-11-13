import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url);
const source=(await Promise.all(['speech','compose','index'].map(name=>readFile(new URL('worker/'+name+'.js',root),'utf8')))).join('\n').replace('export default','globalThis.app =');
const endpoint='https://astronauthealthai.services.ai.azure.com/api/projects/AstronautHealthAI/agents/NASA-AI/endpoint/protocols/openai/responses?api-version=v1';
const completed=(text='Synthetic reply')=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]});
const unavailable=error=>error?.code==='assistant_unavailable'&&error.status===503;

function fixture(environment={}){
  const calls=[],logs=[];
  const env={LLM_PROVIDER:'azure_responses',AZURE_AGENT_ENDPOINT:endpoint,AZURE_AGENT_API_KEY:'synthetic-azure-key',...environment};
  let handler=()=>Response.json(completed());
  const scope={URL,Request,Response,Uint8Array,TextEncoder,TextDecoder,DataView,AbortSignal,crypto:webcrypto,atob,console:{error(...args){logs.push(args);},warn(...args){logs.push(args);}},fetch:async(url,options)=>{const call={url,options,body:JSON.parse(options.body)};calls.push(call);return handler(call,calls.length);}};
  vm.runInNewContext(source,scope);
  return {env,scope,calls,logs,handler(value){handler=value;},run(messages=[{role:'user',content:'Synthetic input'}],options={}){return scope.completeLanguageMessages(env,messages,options);}};
}

test('Azure is configured without a Chat Completions key, base URL or model',()=>{
  const f=fixture();assert.equal(f.scope.languageModelConfigured(f.env),true);assert.equal(f.scope.languageModelConfigured(f.env,'utility'),false);
  for(const environment of [{AZURE_AGENT_ENDPOINT:''},{AZURE_AGENT_API_KEY:''},{AIR_GAP:'1'},{LLM_PROVIDER:'unknown'}])assert.equal(f.scope.languageModelConfigured({...f.env,...environment}),false);
});

test('Azure sends the exact endpoint, api-key, Responses fields and ordered prompt history',async()=>{
  const f=fixture(),messages=[{role:'system',content:'Answer only from supplied observations.'},{role:'developer',content:'Keep units unchanged.'},{role:'user',content:'First question'},{role:'assistant',content:'Earlier answer'},{role:'user',content:'Follow-up question'}];
  assert.equal((await f.run(messages)).text,'Synthetic reply');
  const {url,options,body}=f.calls[0];assert.equal(url,endpoint);assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.equal(options.headers['api-key'],'synthetic-azure-key');assert.equal(options.headers.authorization,undefined);assert.equal(options.headers['content-type'],'application/json');
  assert.deepEqual(body.input,messages.map(message=>({type:'message',...message})));assert.equal(body.max_output_tokens,1536);assert.equal(body.stream,false);assert.equal(body.store,false);for(const field of ['model','messages','agent_reference','max_completion_tokens','reasoning','reasoning_effort'])assert.equal(Object.hasOwn(body,field),false);
});

test('Missing api-version defaults to v1 and explicit query parameters are preserved',async()=>{
  const f=fixture({AZURE_AGENT_ENDPOINT:endpoint.replace('?api-version=v1','')});await f.run();assert.equal(f.calls[0].url,endpoint);
  f.env.AZURE_AGENT_ENDPOINT=endpoint+'&custom=test';await f.run();assert.equal(f.calls[1].url,endpoint+'&custom=test');
});

test('Invalid Azure endpoints or missing credentials fail before transport',async()=>{
  for(const value of ['not a URL','http://model.test/responses','https://name:secret@model.test/responses','https://model.test/chat/completions',endpoint+'#fragment']){
    const f=fixture({AZURE_AGENT_ENDPOINT:value});assert.equal(f.scope.languageModelConfigured(f.env),false);await assert.rejects(f.run(),unavailable);assert.equal(f.calls.length,0);
  }
  const f=fixture({AZURE_AGENT_API_KEY:''});await assert.rejects(f.run(),unavailable);assert.equal(f.calls.length,0);
});

test('Azure converts text and images without dropping ordering, dates or image detail',async()=>{
  const f=fixture(),messages=[{role:'system',content:'Compare supplied images only.'},{role:'user',content:[{type:'text',text:'Capture date: 2030-01-02'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,AAAA',detail:'high'}},{type:'text',text:'Second frame'},{type:'image_url',image_url:{url:'data:image/png;base64,BBBB',detail:'low'}}]}];
  await f.run(messages);assert.deepEqual(f.calls[0].body.input,[{type:'message',...messages[0]},{type:'message',role:'user',content:[{type:'input_text',text:'Capture date: 2030-01-02'},{type:'input_image',image_url:'data:image/jpeg;base64,AAAA',detail:'high'},{type:'input_text',text:'Second frame'},{type:'input_image',image_url:'data:image/png;base64,BBBB',detail:'low'}]}]);
  assert.equal(f.calls.length,1);assert.equal(messages[1].content[1].type,'image_url');
});

test('Unsupported multimodal parts fail instead of silently losing context',async()=>{
  for(const content of [[{type:'audio',data:'unsupported'}],[null],null]){
    const f=fixture();await assert.rejects(f.run([{role:'user',content}]),unavailable);assert.equal(f.calls.length,0);
  }
});

test('Azure extracts only assistant output text after reasoning and tool items',async()=>{
  const f=fixture();f.handler(()=>Response.json({status:'completed',output:[null,{type:'reasoning',encrypted_content:'never display',summary:[{type:'summary_text',text:'hidden'}]},{type:'function_call',name:'tool',arguments:'private'},{type:'message',role:'user',content:[{type:'output_text',text:'not assistant'}]},{type:'message',role:'assistant',content:[null,{type:'output_text',text:'First '},{type:'reasoning_text',text:'hidden'},{type:'output_text',text:'message.'}]},{type:'message',role:'assistant',content:[{type:'output_text',text:'Second message.'}]}]}));
  assert.equal((await f.run()).text,'First message.\nSecond message.');assert.equal(f.logs.length,0);
});

test('Azure accepts an aggregate output_text only for completed responses without message items',async()=>{
  const f=fixture();f.handler(()=>Response.json({status:'completed',output_text:'Aggregate final answer.'}));assert.equal((await f.run()).text,'Aggregate final answer.');
});

test('Empty, malformed, incomplete, failed and refusal-only responses return an availability error',async()=>{
  const payloads=[null,{},completed('  '),{status:'completed',output:[]},{status:'incomplete',output:completed().output},{status:'failed',output:completed().output},{status:'completed',error:{message:'Failure'},output:completed().output},{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'No text output'}]}]}];
  for(const payload of payloads){const f=fixture();f.handler(()=>Response.json(payload));await assert.rejects(f.run(),unavailable);assert.equal(f.calls.length,1);}
  const f=fixture();f.handler(()=>new Response('{',{status:200}));await assert.rejects(f.run(),unavailable);
});

test('Transient upstream statuses retry and cancel the first response body',async()=>{
  for(const status of [502,503,504]){
    const f=fixture();let cancelled=0;f.handler((_call,number)=>number===1?{ok:false,status,body:{async cancel(){cancelled++;}}}:Response.json(completed('Recovered')));
    assert.equal((await f.run()).text,'Recovered');assert.equal(f.calls.length,2);assert.equal(cancelled,1);assert.deepEqual(f.calls[0].body,f.calls[1].body);
  }
});

test('Network failures retry within the selected attempt budget',async()=>{
  const f=fixture();f.handler((_call,number)=>{if(number===1)throw new TypeError('Synthetic connection failure');return Response.json(completed('Recovered'));});assert.equal((await f.run()).text,'Recovered');assert.equal(f.calls.length,2);
  const failed=fixture();failed.handler(()=>{throw new TypeError('Synthetic connection failure');});await assert.rejects(failed.run([], {attempts:1}),unavailable);assert.equal(failed.calls.length,1);
});

test('Non-transient errors and redirects are not retried or followed and never log response content or keys',async()=>{
  for(const status of [400,401,403,429,307]){
    const f=fixture();f.handler(()=>new Response('provider echoed synthetic-azure-key and private content',{status,headers:{location:'https://other.test/responses'}}));
    await assert.rejects(f.run([],{redirect:'follow'}),error=>unavailable(error)&&error.upstreamStatus===status);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.redirect,'manual');assert.ok(!JSON.stringify(f.logs).includes('synthetic-azure-key'));assert.ok(!JSON.stringify(f.logs).includes('private content'));
  }
});

test('Persistent transient failures stop after two attempts with upstream status retained',async()=>{
  const f=fixture();f.handler(()=>new Response('temporary',{status:503}));await assert.rejects(f.run(),error=>unavailable(error)&&error.upstreamStatus===503);assert.equal(f.calls.length,2);
});

test('Per-feature token and timeout settings apply to Responses requests',async()=>{
  const f=fixture(),timeouts=[];f.scope.AbortSignal={timeout(milliseconds){timeouts.push(milliseconds);return undefined;}};await f.run(undefined,{maxCompletionTokens:1800,timeoutMs:45000,attempts:1});assert.equal(f.calls[0].body.max_output_tokens,1800);assert.deepEqual(timeouts,[45000]);
});

test('AIR GAP blocks Azure even when old local Chat Completions settings remain',async()=>{
  const f=fixture({AIR_GAP:'1',LLM_BASE_URL:'http://localhost:8090/v1',LLM_MODEL:'local-model'});await assert.rejects(f.run(),unavailable);assert.equal(f.calls.length,0);
  f.handler(()=>Response.json({choices:[{message:{content:'Local utility reply'}}]}));
  await f.run(undefined,{purpose:'utility'});assert.equal(f.calls[0].url,'http://localhost:8090/v1/chat/completions');assert.equal(f.calls[0].options.headers['api-key'],undefined);
});

test('Utility requests retain the configured Chat Completions contract without Azure credentials',async()=>{
  const f=fixture({LLM_BASE_URL:'https://utility.test/v1',LLM_API_KEY:'synthetic-utility-key',LLM_MODEL:'utility-model'});f.handler(()=>Response.json({choices:[{message:{content:'{"tags":["Research"]}'}}]}));assert.equal(f.scope.languageModelConfigured(f.env,'utility'),true);
  const answer=await f.run([{role:'user',content:'Caption'}],{purpose:'utility',maxCompletionTokens:256,attempts:1,redirect:'manual'});assert.equal(answer.text,'{"tags":["Research"]}');const call=f.calls[0];assert.equal(call.url,'https://utility.test/v1/chat/completions');assert.equal(call.options.headers.authorization,'Bearer synthetic-utility-key');assert.equal(call.options.headers['api-key'],undefined);assert.equal(call.body.model,'utility-model');assert.equal(call.body.max_completion_tokens,256);assert.ok(!Object.hasOwn(call.body,'input'));
});

test('Missing utility configuration never falls back to the health agent',async()=>{
  const f=fixture();await assert.rejects(f.run(undefined,{purpose:'utility'}),unavailable);assert.equal(f.calls.length,0);
});

test('The default provider remains Chat Completions with its existing response text contract',async()=>{
  const f=fixture({LLM_PROVIDER:undefined,LLM_BASE_URL:'https://legacy.test/v1',LLM_API_KEY:'synthetic-legacy-key',LLM_MODEL:'legacy-model'});f.handler(()=>Response.json({choices:[{message:{content:[{type:'text',text:'Legacy '},{type:'text',text:'answer'}]}}]}));assert.equal(f.scope.languageModelConfigured(f.env),true);assert.equal((await f.run()).text,'Legacy answer');assert.equal(f.calls[0].url,'https://legacy.test/v1/chat/completions');assert.equal(Object.hasOwn(f.calls[0].options,'redirect'),false);
});

test('Diary prompts preserve scope, trusted history, citations and selected photos under Azure',async()=>{
  const f=fixture();const query={query:'Compare my supplied observations.',references:[{createdAt:'2030-01-01T10:00:00Z',role:'note',content:'A dated observation.'}],history:[{role:'assistant',source:'browser:untrusted',content:'Excluded browser output'},{role:'assistant',source:'history',content:'Excluded retrieved answer'},{role:'assistant',source:'server',content:'Trusted previous answer'},{role:'user',createdAt:'2030-01-02T10:00:00Z',content:'Compare my supplied observations.'}],photos:[{dataUrl:'data:image/jpeg;base64,AAAA',createdAt:'2030-01-02T10:00:00Z',region:'left cheek',position:1}]};
  await f.scope.languageModelAnswer(f.env,query);const input=f.calls[0].body.input;assert.equal(input.length,3);assert.equal(input[0].role,'system');assert.ok(input[0].content.includes('selected profile'));assert.ok(input[0].content.includes('cite the entry date'));assert.ok(input[0].content.includes('A dated observation.'));assert.ok(input[0].content.includes('Do not diagnose'));assert.ok(!JSON.stringify(input).includes('Excluded'));assert.equal(input[1].content,'Trusted previous answer');assert.ok(input[2].content[0].text.includes('Date: 2030-01-02'));assert.equal(input[2].content[2].image_url,'data:image/jpeg;base64,AAAA');assert.ok(!input[0].content.includes('base64'));
});

test('Raw transport JSON stays intact while validated health results become readable in diary answers',async()=>{
  const f=fixture(),health={status:'ATTENTION',alerts:['Heart rate 112 flagged'],summary:'Synthetic readings require review.'};f.handler(()=>Response.json(completed(JSON.stringify(health))));assert.equal((await f.run()).text,JSON.stringify(health));
  const answer=await f.scope.languageModelAnswer(f.env,{query:'Synthetic readings',references:[],history:[],photos:[]});assert.equal(answer.text,'Synthetic readings require review.\n\nStatus: ATTENTION\nAlerts:\n- Heart rate 112 flagged');
  for(const value of ['Ordinary conversation.',JSON.stringify({tags:['Research']}),JSON.stringify({...health,status:'UNKNOWN'}),JSON.stringify({...health,alerts:[{unexpected:'field'}]}),JSON.stringify({...health,extra:'Do not drop this'})])assert.equal(f.scope.readableHealthAnswer(value),value);
  assert.equal(f.scope.readableHealthAnswer(JSON.stringify({status:'NORMAL',alerts:[],summary:'No flags in the synthetic sample.'})),'No flags in the synthetic sample.\n\nStatus: NORMAL');
  assert.ok(f.scope.readableHealthAnswer(JSON.stringify({...health,alerts:[{parameter:'Heart rate',value:'112 bpm',severity:'moderate',note:'Elevated',trend:'rising'}]})).includes('Heart rate / 112 bpm / moderate / Elevated / rising'));
});

test('Structured health display preserves numeric zero and missing values without exposing raw JSON',()=>{
  const f=fixture();
  for(const [value,display] of [[112,'112'],[0,'0'],[null,'No signal']]){
    const health={status:'ATTENTION',summary:'Review the supplied observation.',alerts:[{parameter:'Sample value',value,severity:'info',note:'Synthetic observation',trend:'unknown'}]},original=JSON.stringify(health);
    assert.equal(f.scope.readableHealthAnswer(original),'Review the supplied observation.\n\nStatus: ATTENTION\nAlerts:\n- Sample value / '+display+' / info / Synthetic observation / unknown');
    assert.equal(JSON.stringify(health),original);
  }
  const base={status:'ATTENTION',summary:'Review the supplied observation.',alerts:[{parameter:'Sample value',value:112,severity:'info'}]};
  for(const edit of [alert=>alert.value=true,alert=>alert.value={unexpected:112},alert=>alert.value=[112],alert=>alert.note=112,alert=>alert.extra='unexpected']){
    const changed=JSON.parse(JSON.stringify(base));edit(changed.alerts[0]);const original=JSON.stringify(changed);assert.equal(f.scope.readableHealthAnswer(original),original);
  }
  const overflow=JSON.stringify(base).replace('"value":112','"value":1e400');assert.equal(f.scope.readableHealthAnswer(overflow),overflow);
});

test('Provider attribution and cache scope identify the actual selected backend',()=>{
  const f=fixture({LLM_MODEL:'old-utility-model',LLM_BASE_URL:'https://utility.test/v1'});assert.equal(f.scope.languageModelSource(f.env),'azure_responses/NASA-AI');assert.equal(f.scope.languageModelSource(f.env,'utility'),'old-utility-model');const scope=f.scope.languageProviderScope(f.env);assert.ok(scope.includes(endpoint));assert.ok(!scope.includes('synthetic-azure-key'));assert.notEqual(scope,f.scope.languageProviderScope({...f.env,AZURE_AGENT_ENDPOINT:endpoint+'&version=test'}));
});

test('Unknown providers fail closed without calling either service',async()=>{
  const f=fixture({LLM_PROVIDER:'azure_typo',LLM_BASE_URL:'https://legacy.test/v1',LLM_MODEL:'legacy-model',LLM_API_KEY:'synthetic-legacy-key'});await assert.rejects(f.run(),unavailable);assert.equal(f.calls.length,0);
});

test('Azure diary context retains normalized self-reports, scales and dates without changing stored observations',async()=>{
  const f=fixture(),record={score:8,wellbeingScale:10,source:'self_report',recordedAt:'2030-01-01T10:00:00Z'};
  const query={query:'Recall my self-report',references:[{createdAt:'2030-01-01T10:00:00Z',role:'note',content:'A dated note.',wellbeing:record}],history:[{role:'user',createdAt:'2030-01-02T10:00:00Z',content:'Recall my self-report',wellbeing:{score:70,wellbeingScale:100,source:'self_report'}}],photos:[]},original=JSON.stringify(query);
  await f.scope.languageModelAnswer(f.env,query);const input=f.calls[0].body.input;
  assert.match(input[0].content,/"score":80/);assert.match(input[0].content,/"wellbeingScale":100/);assert.match(input[0].content,/2030-01-01T10:00:00Z/);assert.match(input[0].content,/not a sensor reading or fatigue measurement/);assert.match(input[1].content,/Wellbeing: 70\/100/);assert.equal(JSON.stringify(query),original);
});
