import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const excluded=new Set(['node_modules','.git','.wrangler','.sites-runtime','.venv','dist','vendor','storage','models','runtime','__pycache__']);
async function sourceFiles(directory){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(excluded.has(entry.name))continue;
    const url=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
    if(entry.isDirectory())files.push(...await sourceFiles(url));
    else if(/\.(?:m?js|html|css|json|md|txt|py|sh|sql|csv)$/.test(entry.name))files.push(url);
  }
  return files;
}

test('Product text, documentation and metadata remain English; code comments follow workspace instructions',async()=>{
  const failures=[];
  for(const url of await sourceFiles(root)){
    let text=await readFile(url,'utf8');
    if(/\.(?:m?js|py)$/.test(url.pathname))text=text.replace(/^\s*(?:\/\/|#)[^\n]*/gm,'');
    if(url.pathname.endsWith('.py'))text=text.replace(/(?:^|\n)\s*(?:"""[\s\S]*?"""|'''[\s\S]*?''')/g,'');
    if(/[\u0400-\u04ff]/u.test(text))failures.push(url.pathname);
  }
  assert.deepEqual(failures,[]);
});

test('English defaults and Urdu remain available without a Russian language choice',async()=>{
  const html=await readFile(new URL('public/index.html',root),'utf8');
  assert.match(html,/<html lang="en"/);
  assert.deepEqual([...html.matchAll(/data-language="([^"]+)"/g)].map(match=>match[1]),['en','ur']);
  const scope={};vm.runInNewContext(await readFile(new URL('public/translations.js',root),'utf8')+'\n'+await readFile(new URL('public/locales.js',root),'utf8')+';globalThis.actual=translations;',scope);
  assert.deepEqual(Object.keys(scope.actual),['en','ur']);assert.equal(scope.actual.ur.locale,'ur-PK');assert.equal(scope.actual.ur.language,'زبان');assert.deepEqual(Object.keys(scope.actual.ur).sort(),Object.keys(scope.actual.en).sort());
  assert.equal(scope.actual.en.locale,'en-GB');assert.ok(scope.actual.en.crewHeadline);assert.ok(scope.actual.en.crewIntro);assert.ok(scope.actual.en.workspaceLabel);
  const app=await readFile(new URL('public/app.js',root),'utf8');
  assert.match(app,/language:"en"/);
  const initialization=app.slice(app.indexOf('const languageInfo='),app.indexOf('const $='));
  for(const [saved,expected] of [['ur','ur'],['en','en'],['ru','en'],['unknown','en'],[null,'en']]){
    const preferences=new Map(saved?[['mission-health-language',saved]]:[]),context={document:{documentElement:{dataset:{theme:'dark'}}},localStorage:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)}};
    vm.runInNewContext(initialization+';globalThis.selected=state.language;globalThis.info=languageInfo;',context);assert.equal(context.selected,expected);assert.equal(Object.hasOwn(context.info,'ru'),false);if(saved==='ur')assert.equal(preferences.get('mission-health-language'),'ur');
  }
});

test('Preloaded English recordings retain measured non-silent audio and existing media files',async()=>{
  const manifest=JSON.parse(await readFile(new URL('public/data/archive-preload.json',root),'utf8'));
  assert.deepEqual(manifest.items.map(item=>item.observation.kind).sort(),['audio','video']);
  for(const item of manifest.items){
    const value=item.observation;
    assert.match(value.source,/Samantha/);
    assert.match(value.transcript,/No personal health data was measured/);
    assert.ok(value.features.acoustic.level>-100&&value.features.acoustic.level<0);
    assert.ok(value.features.acoustic.quiet>=0&&value.features.acoustic.quiet<1);
    assert.ok((await stat(new URL('public'+value.mediaUrl,root))).size>1000);
  }
});

const worker=await readFile(new URL('worker/index.js',root),'utf8');
const displaySource=worker.slice(worker.indexOf('const englishDisplayMemory='),worker.lastIndexOf('export default'));
const {webcrypto}=await import('node:crypto');
function translationFixture(){
  const cached=new Map(),calls=[];let available=true,answer='English entry';
  const DB={prepare(sql){return {bind(owner,hash,value){return {first:async()=>cached.has(owner+hash)?{translation:cached.get(owner+hash)}:null,run:async()=>{cached.set(owner+hash,value);}};}};}};
  const scope={crypto:webcrypto,TextEncoder,console:{warn(){}},languageModelConfigured:()=>available,completeLanguageMessages:async(_env,messages)=>{calls.push(messages);return {text:JSON.stringify(JSON.parse(messages[1].content).map(()=>answer))};}};
  vm.runInNewContext(displaySource+';globalThis.display=englishDisplay;',scope);
  return {display:(body,owner='a')=>scope.display(body,{DB},owner),calls,cached,offline:()=>{available=false;},answer:value=>{answer=value;}};
}

test('Historical text is translated without rewriting originals and cached separately for each owner',async()=>{
  const f=translationFixture(),original={messages:[{content:String.fromCodePoint(0x416)}],task:{title:String.fromCodePoint(0x416)},count:80},saved=JSON.stringify(original);
  const first=await f.display(original);assert.equal(first.messages[0].content,'English entry');assert.equal(first.task.title,'English entry');assert.equal(first.count,80);assert.equal(JSON.stringify(original),saved);assert.equal(f.calls.length,1);
  await f.display(original);assert.equal(f.calls.length,1);await f.display(original,'b');assert.equal(f.calls.length,2);assert.equal(f.cached.size,2);
});

test('English history needs no model call and failed translations never expose untranslated text',async()=>{
  const f=translationFixture(),plain={content:'Tomorrow at 10:00 check the task list'};
  assert.equal(await f.display(plain),plain);assert.equal(f.calls.length,0);
  f.offline();const source=String.fromCodePoint(0x416),result=await f.display({content:source});assert.match(result.content,/English translation is temporarily unavailable/);assert.ok(!result.content.includes(source));assert.equal(f.calls.length,0);
});
