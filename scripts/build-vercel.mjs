import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildWidgets} from './build-widgets.mjs';

export async function buildVercel(projectRoot=resolve(fileURLToPath(new URL('../',import.meta.url)))){
  const destination=resolve(projectRoot,'vercel-static'),source=resolve(projectRoot,'public');
  const original=await readFile(resolve(source,'index.html'),'utf8');
  if(!original.includes('<head>'))throw new Error('Expected the existing HTML head.');
  await readFile(resolve(source,'standalone-session.js'),'utf8');
  if(original.includes('vendor/mission-notifications.js'))await buildWidgets(projectRoot);
  await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});
  await cp(source,destination,{recursive:true});
  await mkdir(resolve(destination,'vendor'),{recursive:true});
  await cp(resolve(projectRoot,'node_modules/@huggingface/transformers/dist/transformers.min.js'),resolve(destination,'vendor/transformers-4.3.1.bundle.min.js'));
  await cp(resolve(projectRoot,'node_modules/@huggingface/transformers/LICENSE'),resolve(destination,'vendor/transformers-LICENSE.txt'));
  await writeFile(resolve(destination,'index.html'),original.replace('<head>','<head>\n  <script src="/standalone-session.js"></script>'),'utf8');
  return destination;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Built Vercel frontend at '+await buildVercel());
