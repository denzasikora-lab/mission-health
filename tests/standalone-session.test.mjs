import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {createSessions,SESSION_COOKIE} from '../server/session.mjs';

const secret='synthetic-session-test-secret-32-bytes-minimum',browserSource=await readFile(new URL('../public/standalone-session.js',import.meta.url),'utf8');
const cookieValue=value=>value.split(';')[0];
const defer=()=>{let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});return {promise,resolve,reject};};
const settle=async()=>{for(let index=0;index<8;index++)await Promise.resolve();};

test('Signed guest sessions are independent, stable across restart and use host-only secure attributes',()=>{
  const sessions=createSessions({secret}),first=sessions.issue(),second=sessions.issue(),cookie=cookieValue(first.cookie);
  assert.notEqual(first.owner,second.owner);assert.match(first.owner,/^guest:[A-Za-z0-9_-]{43}$/);assert.match(first.cookie,/^__Host-mission_guest=/);for(const flag of ['Path=/','Secure','HttpOnly','SameSite=Lax','Max-Age=2592000'])assert.ok(first.cookie.includes(flag));assert.doesNotMatch(first.cookie,/Domain=/i);
  assert.equal(sessions.verify(cookie),first.owner);assert.equal(sessions.verify('other=value; '+cookie),first.owner);assert.equal(createSessions({secret}).verify(cookie),first.owner);assert.equal(createSessions({secret:secret+'different'}).verify(cookie),null);
});

test('Guest sessions reject tampered, duplicate, malformed and expired cookies without accepting unsigned identity',()=>{
  let now=Date.parse('2026-11-14T10:00:00Z');const sessions=createSessions({secret,ttlSeconds:60,now:()=>now}),first=sessions.issue(),cookie=cookieValue(first.cookie),token=cookie.slice(SESSION_COOKIE.length+1),parts=token.split('.');
  for(const value of [undefined,null,'',first.owner,'oai-authenticated-user-id=guest:spoofed',cookie+'; '+cookie,SESSION_COOKIE+'="'+token+'"',SESSION_COOKIE+'='+encodeURIComponent(token).replace(/\./g,'%2E')])assert.equal(sessions.verify(value),null);
  for(const index of [0,1,2,3]){const changed=[...parts];changed[index]=index===0?'v2':changed[index].slice(0,-1)+(changed[index].endsWith('A')?'B':'A');assert.equal(sessions.verify(SESSION_COOKIE+'='+changed.join('.')),null);}
  now+=59000;assert.equal(sessions.verify(cookie),first.owner);now+=1000;assert.equal(sessions.verify(cookie),null);
  const forged='v1.'+parts[1]+'.999999999999';assert.equal(sessions.verify(SESSION_COOKIE+'='+forged+'.'+createHmac('sha256','wrong synthetic secret').update(forged).digest('base64url')),null);
});

test('Session secrets and options must be explicit and valid',()=>{
  for(const options of [{},{secret:''},{secret:'short'},{secret:12},{secret,ttlSeconds:0},{secret,ttlSeconds:1.5},{secret,ttlSeconds:400*86400},{secret,now:null}])assert.throws(()=>createSessions(options));
  const bytes=Buffer.from(secret),sessions=createSessions({secret:bytes});const issued=sessions.issue();bytes.fill(0);assert.equal(sessions.verify(cookieValue(issued.cookie)),issued.owner);
  const invalid=createSessions({secret,now:()=>NaN});assert.throws(()=>invalid.issue(),/clock/);assert.equal(invalid.verify(cookieValue(issued.cookie)),null);
});

function browser({bootstrap,locks}={}){
  const calls=[];let sessionCalls=0;
  const originalFetch=(input,init)=>{const url=typeof input==='string'?new URL(input,'https://site.invalid/').href:input.url||String(input);calls.push({input,init,url});if(new URL(url).pathname==='/api/session'){sessionCalls++;return bootstrap?.(sessionCalls)||Promise.resolve(new Response(null,{status:204}));}return Promise.resolve(new Response('Synthetic response',{status:200}));};
  const scope={URL,Request,Response,AbortController,DOMException,Promise,console,location:{href:'https://site.invalid/',origin:'https://site.invalid'},navigator:{...(locks?{locks}:{})},fetch:originalFetch};scope.window=scope;vm.runInNewContext(browserSource,scope);
  return {scope,calls,get sessionCalls(){return sessionCalls;},reload:()=>vm.runInNewContext(browserSource,scope)};
}

test('Concurrent same-origin API calls wait for one bootstrap and preserve their requests and responses',async()=>{
  const gate=defer(),f=browser({bootstrap:()=>gate.promise}),controller=new AbortController(),request=new Request('https://site.invalid/api/chat',{method:'POST',body:'{"synthetic":true}',headers:{'content-type':'application/json'},signal:controller.signal}),init={method:'PATCH',body:'{"status":"done"}',headers:{'x-mission-language':'ur'},signal:controller.signal};
  const first=f.scope.fetch(request),second=f.scope.fetch('/api/tasks/synthetic',init);await settle();assert.equal(f.sessionCalls,1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.credentials,'same-origin');assert.equal(f.calls[0].init.cache,'no-store');assert.equal(f.calls[0].init.redirect,'error');
  gate.resolve(new Response(null,{status:204}));const replies=await Promise.all([first,second]);assert.equal(f.calls[1].input,request);assert.equal(f.calls[2].init,init);assert.equal(await replies[0].text(),'Synthetic response');assert.equal(await request.text(),'{"synthetic":true}');
  await f.scope.fetch('/api/me');assert.equal(f.sessionCalls,1);const wrapped=f.scope.fetch;f.reload();assert.equal(f.scope.fetch,wrapped);
});

test('External services and static model assets bypass the API bootstrap',async()=>{
  const gate=defer(),f=browser({bootstrap:()=>gate.promise});await f.scope.fetch('https://external.invalid/api/model');await f.scope.fetch('/vendor/model.wasm');await f.scope.fetch('/data/research.json');assert.equal(f.calls.filter(call=>!call.url.endsWith('/api/session')).length,3);assert.equal(f.sessionCalls,1);gate.resolve(new Response(null,{status:204}));await f.scope.missionStandaloneSession.ready();
});

test('Failed bootstrap sends no queued application request and allows a later deliberate retry',async()=>{
  const first=defer(),f=browser({bootstrap:number=>number===1?first.promise:Promise.resolve(new Response(null,{status:204}))}),one=f.scope.fetch('/api/chat',{method:'POST',body:'Synthetic'}),two=f.scope.fetch('/api/me');first.resolve(new Response(null,{status:503}));await assert.rejects(one,/setup failed/);await assert.rejects(two,/setup failed/);assert.equal(f.calls.length,1);assert.equal(f.sessionCalls,1);
  await f.scope.fetch('/api/me');assert.equal(f.sessionCalls,2);assert.equal(f.calls.at(-1).url,'https://site.invalid/api/me');
});

test('Aborting a gated request does not send its body or cancel bootstrap for other requests',async()=>{
  const gate=defer(),f=browser({bootstrap:()=>gate.promise}),controller=new AbortController(),cancelled=f.scope.fetch('/api/chat',{method:'POST',body:'Synthetic',signal:controller.signal}),other=f.scope.fetch('/api/me');controller.abort();await assert.rejects(cancelled,error=>error.name==='AbortError');assert.equal(f.calls.length,1);gate.resolve(new Response(null,{status:204}));await other;assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1).url,'https://site.invalid/api/me');
});

test('An explicit null signal override retains native fetch request-init semantics',async()=>{
  const controller=new AbortController(),request=new Request('https://site.invalid/api/chat',{method:'POST',body:'Synthetic',signal:controller.signal});controller.abort();const f=browser(),init={signal:null};const response=await f.scope.fetch(request,init);assert.equal(response.status,200);assert.equal(f.calls.at(-1).input,request);assert.equal(f.calls.at(-1).init,init);
});

test('Bootstrap can use the browser lock to serialize session creation across tabs',async()=>{
  const names=[],f=browser({locks:{async request(name,callback){names.push(name);return callback();}}});await f.scope.missionStandaloneSession.ready();assert.deepEqual(names,['mission-health-guest-session']);assert.equal(f.sessionCalls,1);await f.scope.fetch('/api/me');assert.equal(f.sessionCalls,1);
});
