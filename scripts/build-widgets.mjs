import {build} from 'esbuild';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
const execute=promisify(execFile);
export async function buildWidgets(root){
  await mkdir(resolve(root,'public/vendor'),{recursive:true});
  await build({absWorkingDir:root,entryPoints:['ui/notifications.jsx'],outfile:'public/vendor/mission-notifications.js',bundle:true,minify:true,format:'iife',target:['safari16'],define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
  await execute(process.execPath,[resolve(root,'node_modules/@tailwindcss/cli/dist/index.mjs'),'-i','ui/notifications.css','-o','public/vendor/mission-notifications.css','--minify'],{cwd:root,maxBuffer:1024*1024});
  const css=resolve(root,'public/vendor/mission-notifications.css');await writeFile(css,(await readFile(css,'utf8')).replace(/(-?(?:\d*\.)?\d+)rem\b/g,(_match,value)=>Number(value)*16+'px'),'utf8');
  await cp(resolve(root,'ui/konsta-LICENSE.txt'),resolve(root,'public/vendor/konsta-LICENSE.txt'));
  for(const name of ['react','react-dom'])await cp(resolve(root,'node_modules',name,'LICENSE'),resolve(root,'public/vendor',name+'-LICENSE.txt'));
}
