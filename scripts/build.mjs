import { readdir,readFile,mkdir,writeFile,rm,cp } from 'node:fs/promises';
import { extname } from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
const assets={};
async function collect(directory,prefix=''){
  for(const item of await readdir(directory,{withFileTypes:true})){
    const filename=directory+'/'+item.name,path=prefix+'/'+item.name;
    if(item.isDirectory())await collect(filename,path);
    else assets[path]={type:mime[extname(item.name)]||'application/octet-stream',data:(await readFile(filename)).toString('base64')};
  }
}
await collect('public');
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
const source=await readFile('worker/index.js','utf8');
await writeFile('dist/server/index.js','const assets='+JSON.stringify(assets)+';\n'+source);
await cp('.openai/hosting.json','dist/.openai/hosting.json');
try{await cp('drizzle','dist/.openai/drizzle',{recursive:true})}catch(error){if(error.code!=='ENOENT')throw error}
console.log('Собран сервер и '+Object.keys(assets).length+' ресурсов.');
