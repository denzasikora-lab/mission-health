import { readdir,readFile,mkdir,writeFile,rm,cp } from 'node:fs/promises';
import { extname } from 'node:path';
import { gzipSync } from 'node:zlib';
const mime={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.txt':'text/plain; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.webm':'video/webm'};
const assets={};
async function collect(directory,prefix=''){
  for(const item of await readdir(directory,{withFileTypes:true})){
    const filename=directory+'/'+item.name,path=prefix+'/'+item.name;
    if(item.isDirectory())await collect(filename,path);
    else {
      const bytes=await readFile(filename),gzip=gzipSync(bytes,{level:9}),compressed=!['.mp4','.mp3','.m4a','.wav','.webm'].includes(extname(item.name))&&gzip.length<bytes.length*.95;
      assets[path]={type:mime[extname(item.name)]||'application/octet-stream',data:(compressed?gzip:bytes).toString('base64'),...(compressed?{encoding:'gzip'}:{})};
    }
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
const source=(await readFile('public/story-tags-core.js','utf8'))+'\n'+(await readFile('worker/story-tags.js','utf8'))+'\n'+(await readFile('public/skin-spots-core.js','utf8'))+'\n'+(await readFile('public/apparent-age-core.js','utf8'))+'\n'+(await readFile('public/actiwatch-core.js','utf8'))+'\n'+(await readFile('worker/actiwatch.js','utf8'))+'\n'+(await readFile('worker/activity.js','utf8'))+'\n'+(await readFile('worker/scheduler.js','utf8'))+'\n'+(await readFile('public/health-rules-core.js','utf8'))+'\n'+(await readFile('worker/health-analysis.js','utf8'))+'\n'+(await readFile('worker/personal.js','utf8'))+'\n'+(await readFile('worker/photos.js','utf8'))+'\n'+(await readFile('worker/stories.js','utf8'))+'\n'+(await readFile('worker/local-reply.js','utf8'))+'\n'+(await readFile('worker/speech.js','utf8'))+'\n'+(await readFile('worker/training.js','utf8'))+'\n'+(await readFile('worker/book.js','utf8'))+'\n'+(await readFile('worker/compose.js','utf8'))+'\n'+(await readFile('worker/media-analysis.js','utf8'))+'\n'+(await readFile('worker/index.js','utf8'));
await writeFile('dist/server/index.js','const assets='+JSON.stringify(assets)+';\n'+source);
await cp('.openai/hosting.json','dist/.openai/hosting.json');
try{await cp('drizzle','dist/.openai/drizzle',{recursive:true})}catch(error){if(error.code!=='ENOENT')throw error}
console.log('Built server and '+Object.keys(assets).length+' assets.');
