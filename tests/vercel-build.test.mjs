import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildVercel} from '../scripts/build-vercel.mjs';

test('Vercel serves the existing frontend with a session gate before every application script',async t=>{
  const root=await mkdtemp(join(tmpdir(),'mission-vercel-build-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'public/data'),{recursive:true});await mkdir(join(root,'node_modules/@huggingface/transformers/dist'),{recursive:true});
  const html='<!doctype html><html><head><script src="app.js"></script></head><body>Mission Health</body></html>';
  for(const [path,value]of Object.entries({'public/index.html':html,'public/app.js':'window.example=true;','public/standalone-session.js':'window.sessionReady=true;','public/data/sample.json':'{"sample":true}','node_modules/@huggingface/transformers/dist/transformers.min.js':'synthetic-vendor','node_modules/@huggingface/transformers/LICENSE':'synthetic-license','.dev.vars':'PRIVATE_SETTING=synthetic-private-value'}))await writeFile(join(root,path),value,'utf8');
  const output=await buildVercel(root),built=await readFile(join(output,'index.html'),'utf8');
  assert.ok(built.indexOf('/standalone-session.js')<built.indexOf('app.js'));assert.equal((built.match(/standalone-session\.js/g)||[]).length,1);
  assert.equal(await readFile(join(root,'public/index.html'),'utf8'),html);assert.equal(await readFile(join(output,'vendor/transformers-4.3.1.bundle.min.js'),'utf8'),'synthetic-vendor');
  assert.equal(await readFile(join(output,'data/sample.json'),'utf8'),'{"sample":true}');await assert.rejects(access(join(output,'.dev.vars')));await assert.rejects(access(join(output,'server')));
  await buildVercel(root);assert.equal(await readFile(join(output,'index.html'),'utf8'),built);
});

test('Vercel configuration routes API traffic to the isolated VPS backend without embedding credentials',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.framework,null);assert.equal(config.buildCommand,'npm run build:vercel');assert.equal(config.outputDirectory,'vercel-static');assert.equal(config.git.deploymentEnabled,true);
  assert.deepEqual(config.rewrites,[{source:'/api/:path*',destination:'https://users.fereyuserstopstrongcloudwinter.shop/mission-health-api/api/:path*'}]);
  assert.equal(config.env,undefined);assert.equal(config.build,undefined);
});
