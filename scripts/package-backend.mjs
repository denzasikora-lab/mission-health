import {cp,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,isAbsolute,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readWorkerSource} from './worker-sources.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),archive=process.argv[2];
if(!archive||!isAbsolute(archive))throw new Error('Provide an absolute output archive path');
if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).trim())throw new Error('Commit the verified source before packaging the backend');
const commitSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const expected='const assets={};\n'+await readWorkerSource();
if(await readFile(join(root,'dist/backend/worker.mjs'),'utf8')!==expected)throw new Error('Rebuild the backend from the current source');
const files=['dist/backend/worker.mjs','public/standalone-session.js',...['standalone-api','standalone-session','standalone-storage'].map(name=>'tests/'+name+'.test.mjs')];
for(const directory of ['server','worker'])for(const entry of await readdir(join(root,directory),{withFileTypes:true}))if(entry.isFile()&&/\.(?:mjs|js)$/.test(entry.name))files.push(directory+'/'+entry.name);
for(const entry of await readdir(join(root,'drizzle'),{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.sql'))files.push('drizzle/'+entry.name);
for(const name of ['story-tags-core','skin-spots-core','apparent-age-core','actiwatch-core','health-rules-core'])files.push('public/'+name+'.js');
const staging=await mkdtemp(join(tmpdir(),'mission-backend-package-')),checksums={};
try{
  for(const path of files){await mkdir(dirname(join(staging,path)),{recursive:true});await cp(join(root,path),join(staging,path));checksums[path]=createHash('sha256').update(await readFile(join(staging,path))).digest('hex');}
  await writeFile(join(staging,'deployment-source.json'),JSON.stringify({commitSha,nodeVersion:'24.14.0',files:checksums},null,2)+'\n','utf8');
  execFileSync('tar',['-czf',archive,'-C',staging,'--',...files,'deployment-source.json']);
  console.log(JSON.stringify({archive,commitSha,sha256:createHash('sha256').update(await readFile(archive)).digest('hex'),files:files.length}));
}finally{await rm(staging,{recursive:true,force:true});}
