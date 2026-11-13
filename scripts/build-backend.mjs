import {mkdir,writeFile} from 'node:fs/promises';
import {readWorkerSource} from './worker-sources.mjs';

await mkdir(new URL('../dist/backend/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/backend/worker.mjs',import.meta.url),'const assets={};\n'+await readWorkerSource(),'utf8');
console.log('Built standalone API Worker module.');
