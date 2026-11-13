import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,chmod,lstat,open,readFile,readdir,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const migrationTable='_standalone_migrations';
const defaultMaximum=32*1024*1024;
const defaultStorageMaximum=1024*1024*1024;
const digest=value=>createHash('sha256').update(value).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const rows=value=>value.map(row=>({...row}));

async function privateDirectory(path){
  await mkdir(path,{recursive:true,mode:0o700});
  const info=await lstat(path);
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Storage directory must be a real directory');
  await chmod(path,0o700);
}

async function privateFile(path){
  let handle;
  try{handle=await open(path,'wx',0o600);}catch(error){if(error.code!=='EEXIST')throw error;}
  if(handle)await handle.close();
  const info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink())throw new Error('Storage file must be a real file');
  await chmod(path,0o600);
}

async function atomicFile(path,bytes){
  const temporary=path+'.'+randomUUID()+'.tmp';
  let handle;
  try{
    handle=await open(temporary,'wx',0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();handle=null;
    await rename(temporary,path);
  }finally{
    if(handle)await handle.close();
    await rm(temporary,{force:true});
  }
}

async function migrations(database,directory){
  const entries=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.sql')).map(entry=>entry.name).sort();
  const sources=await Promise.all(entries.map(async name=>{const source=await readFile(join(directory,name),'utf8');return {name,source,checksum:digest(source)};}));
  database.exec('CREATE TABLE IF NOT EXISTS '+migrationTable+' (name TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied=new Map(database.prepare('SELECT name,checksum FROM '+migrationTable).all().map(row=>[row.name,row.checksum]));
  const available=new Map(sources.map(source=>[source.name,source]));
  for(const [name,checksum]of applied){
    if(!available.has(name))throw new Error('Applied migration is missing: '+name);
    if(available.get(name).checksum!==checksum)throw new Error('Applied migration checksum changed: '+name);
  }
  for(const migration of sources){
    if(applied.has(migration.name))continue;
    database.exec('BEGIN IMMEDIATE');
    try{
      database.exec(migration.source);
      database.prepare('INSERT INTO '+migrationTable+' (name,checksum,applied_at) VALUES (?,?,?)').run(migration.name,migration.checksum,new Date().toISOString());
      database.exec('COMMIT');
    }catch(error){database.exec('ROLLBACK');throw error;}
  }
}

function d1(database,available){
  const statements=new WeakMap();
  const check=()=>{if(!available())throw new Error('Storage is closed');};
  const result=(results=[],meta={changes:0})=>({success:true,results,meta});
  function execute(bound,operation,column){
    check();const {statement,values}=bound;
    if(operation==='run'){
      const outcome=statement.run(...values);
      return result([],{changes:Number(outcome.changes),last_row_id:Number(outcome.lastInsertRowid)});
    }
    if(operation==='first'){
      if(column!==undefined&&typeof column!=='string')throw new TypeError('Column must be a string');
      const row=statement.get(...values);if(!row)return null;
      if(column===undefined)return {...row};
      if(!own(row,column))throw new Error('Unknown result column: '+column);
      return row[column];
    }
    return result(rows(statement.all(...values)));
  }
  function wrap(statement,values=[]){
    const bound={statement,values};
    const wrapper={
      bind(...next){check();return wrap(statement,next);},
      async first(column){return execute(bound,'first',column);},
      async all(){return execute(bound,'all');},
      async run(){return execute(bound,'run');}
    };
    statements.set(wrapper,bound);return Object.freeze(wrapper);
  }
  return Object.freeze({
    prepare(source){check();if(typeof source!=='string'||!source.trim())throw new TypeError('SQL must be nonempty text');return wrap(database.prepare(source));},
    async batch(commands){
      check();if(!Array.isArray(commands)||commands.some(command=>!statements.has(command)))throw new TypeError('Batch requires statements from this database');
      if(!commands.length)return [];
      database.exec('BEGIN IMMEDIATE');
      try{
        const results=commands.map(command=>{const bound=statements.get(command);return execute(bound,bound.statement.columns().length?'all':'run');});
        database.exec('COMMIT');return results;
      }catch(error){database.exec('ROLLBACK');throw error;}
    }
  });
}

function metadata(value){
  if(value===undefined)return {};
  if(!plain(value)||Object.keys(value).length>64)throw new TypeError('Object metadata must be a bounded string map');
  return Object.fromEntries(Object.entries(value).map(([key,item])=>{
    if(!key||key.length>128||typeof item!=='string'||item.length>8192)throw new TypeError('Object metadata must contain bounded strings');
    return [key,item];
  }));
}

async function objectBytes(value,maximum){
  let bytes;
  if(typeof value==='string')bytes=Buffer.from(value,'utf8');
  else if(value instanceof ArrayBuffer)bytes=Buffer.from(new Uint8Array(value));
  else if(ArrayBuffer.isView(value))bytes=Buffer.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
  else if(value&&typeof value.arrayBuffer==='function'){
    if(Number.isFinite(value.size)&&value.size>maximum)throw new RangeError('Object exceeds storage limit');
    bytes=Buffer.from(await value.arrayBuffer());
  }else if(value&&typeof value.getReader==='function'){
    const reader=value.getReader(),chunks=[];let size=0;
    try{
      for(;;){const {done,value:chunk}=await reader.read();if(done)break;if(!ArrayBuffer.isView(chunk))throw new TypeError('Object stream must contain bytes');size+=chunk.byteLength;if(size>maximum){await reader.cancel();throw new RangeError('Object exceeds storage limit');}chunks.push(Buffer.from(new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength)));}
    }finally{reader.releaseLock();}
    bytes=Buffer.concat(chunks,size);
  }else throw new TypeError('Object body must be text or bytes');
  if(bytes.byteLength>maximum)throw new RangeError('Object exceeds storage limit');
  return bytes;
}

async function r2(directory,maximum,storageMaximum,available){
  const locks=new Map();
  let used=0,mutations=Promise.resolve();
  const mutate=operation=>{const task=mutations.catch(()=>{}).then(operation);mutations=task;return task;};
  const quotaError=()=>Object.assign(new RangeError('Object storage quota exceeded'),{code:'object_storage_limit',status:507});
  const keyHash=key=>{if(typeof key!=='string'||!key||Buffer.byteLength(key,'utf8')>1024||/[\u0000-\u001f\u007f]/.test(key))throw new TypeError('Invalid object key');return digest(key);};
  const locked=(hash,operation)=>{
    if(!available())return Promise.reject(new Error('Storage is closed'));
    const previous=locks.get(hash)||Promise.resolve(),task=previous.catch(()=>{}).then(operation);locks.set(hash,task);
    void task.finally(()=>{if(locks.get(hash)===task)locks.delete(hash);}).catch(()=>{});
    return task;
  };
  async function stored(hash){
    let bytes;try{bytes=await readFile(join(directory,hash+'.json'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
    let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Stored object metadata is invalid');}
    if(!plain(value)||value.version!==1||!/^[a-f0-9-]{36}$/i.test(value.generation||'')||!Number.isSafeInteger(value.size)||value.size<0||value.size>maximum||!(/^[a-f0-9]{64}$/).test(value.digest||''))throw new Error('Stored object metadata is invalid');
    value.httpMetadata=metadata(value.httpMetadata);value.customMetadata=metadata(value.customMetadata);return value;
  }
  const blobPath=(hash,value)=>join(directory,hash+'.'+value.generation+'.blob');
  const view=(key,value)=>({key,size:value.size,httpMetadata:{...value.httpMetadata},customMetadata:{...value.customMetadata}});
  const entries=await readdir(directory,{withFileTypes:true}),retained=new Set();
  for(const entry of entries){
    if(!/^[a-f0-9]{64}\.json$/.test(entry.name))continue;
    if(!entry.isFile()||entry.isSymbolicLink())throw new Error('Stored object metadata must be a real file');
    const hash=entry.name.slice(0,64),value=await stored(hash);let info;
    try{info=await lstat(blobPath(hash,value));}catch(error){if(error.code==='ENOENT'){await rm(join(directory,entry.name));continue;}throw error;}
    if(!info.isFile()||info.isSymbolicLink()||info.size!==value.size)throw new Error('Stored object bytes are invalid');
    retained.add(hash+'.'+value.generation+'.blob');used+=value.size;
    if(!Number.isSafeInteger(used))throw new RangeError('Stored object usage is invalid');
  }
  for(const entry of entries){
    const orphan=/^[a-f0-9]{64}\.[a-f0-9-]{36}\.blob$/.test(entry.name)&&!retained.has(entry.name),temporary=/^[a-f0-9]{64}(?:\.json|\.[a-f0-9-]{36}\.blob)\.[a-f0-9-]{36}\.tmp$/.test(entry.name);
    if((orphan||temporary)&&(entry.isFile()||entry.isSymbolicLink()))await rm(join(directory,entry.name),{force:true});
  }
  const bucket=Object.freeze({
    async put(key,body,options={}){
      const hash=keyHash(key),httpMetadata=metadata(options.httpMetadata),customMetadata=metadata(options.customMetadata);
      return locked(hash,()=>mutate(async()=>{
        const bytes=await objectBytes(body,maximum);
        const old=await stored(hash),nextUsage=used-(old?.size||0)+bytes.byteLength;
        if(nextUsage>storageMaximum)throw quotaError();
        const value={version:1,generation:randomUUID(),size:bytes.byteLength,digest:digest(bytes),httpMetadata,customMetadata},path=blobPath(hash,value);
        try{await atomicFile(path,bytes);await atomicFile(join(directory,hash+'.json'),JSON.stringify(value));}
        catch(error){await rm(path,{force:true});throw error;}
        used=nextUsage;
        if(old)await rm(blobPath(hash,old),{force:true}).catch(()=>{});
        return view(key,value);
      }));
    },
    async head(key){const hash=keyHash(key);return locked(hash,async()=>{
      const value=await stored(hash);if(!value)return null;
      let info;try{info=await lstat(blobPath(hash,value));}catch(error){if(error.code==='ENOENT')return null;throw error;}
      if(!info.isFile()||info.isSymbolicLink()||info.size!==value.size)throw new Error('Stored object bytes are invalid');
      return view(key,value);
    });},
    async get(key,options={}){
      const hash=keyHash(key);
      return locked(hash,async()=>{
        const value=await stored(hash);if(!value)return null;
        let bytes;try{bytes=await readFile(blobPath(hash,value));}catch(error){if(error.code==='ENOENT')return null;throw error;}
        if(bytes.byteLength!==value.size||digest(bytes)!==value.digest)throw new Error('Stored object bytes are invalid');
        if(options.range!==undefined){
          const range=options.range;if(!plain(range)||Object.keys(range).some(key=>!['offset','length'].includes(key)))throw new RangeError('Invalid object range');
          const offset=range.offset??0,length=range.length??value.size-offset;
          if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset>value.size)throw new RangeError('Invalid object range');
          bytes=bytes.subarray(offset,Math.min(value.size,offset+length));
        }
        const body=Uint8Array.from(bytes);
        return {...view(key,value),body,async arrayBuffer(){return Uint8Array.from(body).buffer;},async text(){return new TextDecoder().decode(body);}};
      });
    },
    async delete(keys){
      const values=Array.isArray(keys)?keys:[keys];if(values.length>1000)throw new RangeError('Too many object keys');
      const unique=[...new Map(values.map(key=>[keyHash(key),key])).keys()];
      await Promise.all(unique.map(hash=>locked(hash,()=>mutate(async()=>{const value=await stored(hash);await rm(join(directory,hash+'.json'),{force:true});if(value)await rm(blobPath(hash,value),{force:true});used-=value?.size||0;}))));
    }
  });
  return {bucket,drain:()=>Promise.allSettled([...locks.values()])};
}

export async function openStorage({dataDir,migrationsDir,maxObjectBytes=defaultMaximum,maxStorageBytes=defaultStorageMaximum}){
  if(typeof dataDir!=='string'||!dataDir||typeof migrationsDir!=='string'||!migrationsDir)throw new TypeError('Storage and migration directories are required');
  if(!Number.isSafeInteger(maxObjectBytes)||maxObjectBytes<1)throw new TypeError('Storage limit must be a positive integer');
  if(!Number.isSafeInteger(maxStorageBytes)||maxStorageBytes<1)throw new TypeError('Aggregate storage limit must be a positive integer');
  const directory=resolve(dataDir),objects=join(directory,'objects'),filename=join(directory,'mission-health.sqlite');
  await privateDirectory(directory);await privateDirectory(objects);await privateFile(filename);
  let database,closed=false,closing;
  try{
    database=new DatabaseSync(filename);database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    await migrations(database,resolve(migrationsDir));
    for(const suffix of ['','-wal','-shm'])await chmod(filename+suffix,0o600).catch(error=>{if(error.code!=='ENOENT')throw error;});
    const files=await r2(objects,maxObjectBytes,maxStorageBytes,()=>!closed),DB=d1(database,()=>!closed);
    return Object.freeze({DB,PHOTOS:files.bucket,close(){
      if(!closing){closed=true;closing=files.drain().then(()=>database.close());}
      return closing;
    }});
  }catch(error){if(database)database.close();throw error;}
}
