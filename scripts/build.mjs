import { readdir,readFile,mkdir,writeFile,rm,cp } from 'node:fs/promises';
import { extname } from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.txt':'text/plain; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
const assets={};
async function collect(directory,prefix=''){
  for(const item of await readdir(directory,{withFileTypes:true})){
    const filename=directory+'/'+item.name,path=prefix+'/'+item.name;
    if(item.isDirectory())await collect(filename,path);
    else assets[path]={type:mime[extname(item.name)]||'application/octet-stream',data:(await readFile(filename)).toString('base64')};
  }
}
await rm('public/vendor',{recursive:true,force:true});
await mkdir('public/vendor',{recursive:true});
await cp('node_modules/@huggingface/transformers/dist/transformers.min.js','public/vendor/transformers-4.3.1.bundle.min.js');
await cp('node_modules/@huggingface/transformers/LICENSE','public/vendor/transformers-LICENSE.txt');
await collect('public');
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
const source=(await readFile('worker/photos.js','utf8'))+'\n'+(await readFile('worker/local-reply.js','utf8'))+'\n'+(await readFile('worker/index.js','utf8')); 
await writeFile('dist/server/index.js','const assets='+JSON.stringify(assets)+';\n'+source);
await cp('.openai/hosting.json','dist/.openai/hosting.json');
try{await cp('drizzle','dist/.openai/drizzle',{recursive:true})}catch(error){if(error.code!=='ENOENT')throw error}
console.log('Собран сервер и '+Object.keys(assets).length+' ресурсов.');
