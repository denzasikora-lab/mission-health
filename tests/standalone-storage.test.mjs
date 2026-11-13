import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {openStorage} from '../server/storage.mjs';

const realMigrations=fileURLToPath(new URL('../drizzle/',import.meta.url));
const schema='CREATE TABLE sample (id TEXT PRIMARY KEY NOT NULL, value TEXT, n INTEGER);';
async function fixture(t,sources={'0000.sql':schema},options={}){
  const root=await mkdtemp(join(tmpdir(),'mission-health-storage-')),dataDir=join(root,'data'),migrationsDir=sources===null?realMigrations:join(root,'migrations');
  let storage,settings={...options};
  t.after(async()=>{await storage?.close();await rm(root,{recursive:true,force:true});});
  if(sources!==null){await mkdir(migrationsDir);for(const [name,source]of Object.entries(sources))await writeFile(join(migrationsDir,name),source,'utf8');}
  storage=await openStorage({dataDir,migrationsDir,...settings});
  return {root,dataDir,migrationsDir,get storage(){return storage;},get DB(){return storage.DB;},get PHOTOS(){return storage.PHOTOS;},async reopen(options={}){await storage.close();settings={...settings,...options};storage=await openStorage({dataDir,migrationsDir,...settings});return storage;}};
}

test('Native SQLite statements implement D1 bindings, nullable first values and mutation metadata',async t=>{
  const f=await fixture(t),insert=f.DB.prepare('INSERT INTO sample (id,value,n) VALUES (?,?,?)');
  const created=await insert.bind('one','first',1).run();assert.equal(created.success,true);assert.equal(created.meta.changes,1);assert.ok(Number.isSafeInteger(created.meta.last_row_id));
  await insert.bind('two',null,2).run();assert.deepEqual(await f.DB.prepare('SELECT id,value,n FROM sample WHERE id=?').bind('one').first(),{id:'one',value:'first',n:1});
  assert.equal(await f.DB.prepare('SELECT value FROM sample WHERE id=?').bind('one').first('value'),'first');assert.equal(await f.DB.prepare('SELECT value FROM sample WHERE id=?').bind('two').first('value'),null);assert.equal(await f.DB.prepare('SELECT value FROM sample WHERE id=?').bind('missing').first(),null);
  await assert.rejects(f.DB.prepare('SELECT value FROM sample LIMIT 1').first('unknown'),/Unknown result column/);
  const listed=await f.DB.prepare('SELECT id,n FROM sample ORDER BY n').all();assert.equal(listed.success,true);assert.deepEqual(listed.results,[{id:'one',n:1},{id:'two',n:2}]);
  assert.equal((await f.DB.prepare('UPDATE sample SET n=n+1 WHERE id=?').bind('one').run()).meta.changes,1);assert.equal((await f.DB.prepare('UPDATE sample SET n=n+1 WHERE id=?').bind('missing').run()).meta.changes,0);
  assert.equal(await f.DB.prepare('SELECT n FROM sample WHERE id=?').bind('one').first('n'),2);
});

test('A batch executes atomically and rejects statements from another database before changing data',async t=>{
  const f=await fixture(t),other=await fixture(t),insert=f.DB.prepare('INSERT INTO sample (id,n) VALUES (?,?)');
  await assert.rejects(f.DB.batch([insert.bind('duplicate',1),insert.bind('duplicate',2)]),/UNIQUE/);assert.equal(await f.DB.prepare('SELECT COUNT(*) AS n FROM sample').first('n'),0);
  await assert.rejects(f.DB.batch([insert.bind('one',1),other.DB.prepare('SELECT 1')]),/this database/);assert.equal(await f.DB.prepare('SELECT COUNT(*) AS n FROM sample').first('n'),0);
  const pending=f.DB.batch([insert.bind('one',1),insert.bind('two',2),f.DB.prepare('SELECT id FROM sample ORDER BY n')]);
  assert.equal(await f.DB.prepare('SELECT COUNT(*) AS n FROM sample').first('n'),2);const result=await pending;assert.equal(result.length,3);assert.equal(result[0].meta.changes,1);assert.deepEqual(result[2].results,[{id:'one'},{id:'two'}]);assert.deepEqual(await f.DB.batch([]),[]);
});

test('Migrations apply once, persist data and refuse modified or missing applied source files',async t=>{
  const f=await fixture(t);await f.DB.prepare('INSERT INTO sample (id,n) VALUES (?,?)').bind('saved',7).run();await f.reopen();assert.equal(await f.DB.prepare('SELECT n FROM sample WHERE id=?').bind('saved').first('n'),7);assert.equal(await f.DB.prepare('SELECT COUNT(*) AS n FROM _standalone_migrations').first('n'),1);
  await f.storage.close();await writeFile(join(f.migrationsDir,'0000.sql'),schema+'\nCREATE TABLE changed (id TEXT);','utf8');await assert.rejects(openStorage({dataDir:f.dataDir,migrationsDir:f.migrationsDir}),/checksum changed/);
  await rm(join(f.migrationsDir,'0000.sql'));await assert.rejects(openStorage({dataDir:f.dataDir,migrationsDir:f.migrationsDir}),/migration is missing/);
  const raw=new DatabaseSync(join(f.dataDir,'mission-health.sqlite'));try{assert.equal(raw.prepare('SELECT n FROM sample WHERE id=?').get('saved').n,7);assert.equal(raw.prepare("SELECT name FROM sqlite_master WHERE name='changed'").get(),undefined);}finally{raw.close();}
});

test('A failed migration rolls back its schema and ledger entry while preserving earlier migrations',async t=>{
  const f=await fixture(t);await f.storage.close();await writeFile(join(f.migrationsDir,'0001.sql'),'CREATE TABLE partial_change (id TEXT);\nINSERT INTO nonexistent_table VALUES (1);','utf8');
  await assert.rejects(openStorage({dataDir:f.dataDir,migrationsDir:f.migrationsDir}),/nonexistent_table/);
  const raw=new DatabaseSync(join(f.dataDir,'mission-health.sqlite'));try{assert.equal(raw.prepare("SELECT name FROM sqlite_master WHERE name='partial_change'").get(),undefined);assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM _standalone_migrations').get().n,1);}finally{raw.close();}
  await writeFile(join(f.migrationsDir,'0001.sql'),'CREATE TABLE completed_change (id TEXT);','utf8');await f.reopen();assert.equal(await f.DB.prepare("SELECT name FROM sqlite_master WHERE name='completed_change'").first('name'),'completed_change');
});

test('The full existing application migrations create usable health, diary and quota-compatible SQLite tables',async t=>{
  const f=await fixture(t,null);await f.DB.prepare("INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at) VALUES ('note','owner','personal','note','Synthetic note','en',?)").bind(new Date().toISOString()).run();
  assert.equal(await f.DB.prepare('SELECT content FROM journal_messages WHERE id=?').bind('note').first('content'),'Synthetic note');
  const columns=(await f.DB.prepare('PRAGMA table_info(general_chat_messages)').all()).results;assert.ok(columns.some(column=>column.name==='health_context_json'));
  await f.DB.prepare('CREATE TABLE standalone_quota (owner TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY (owner,day))').run();await f.DB.prepare('INSERT INTO standalone_quota (owner,day,used) VALUES (?,?,?)').bind('owner','2030-01-01',1).run();assert.equal(await f.DB.prepare('SELECT used FROM standalone_quota').first('used'),1);await f.reopen();assert.equal(await f.DB.prepare('SELECT COUNT(*) AS n FROM journal_messages').first('n'),1);
});

test('Filesystem objects preserve bytes and cloned HTTP/custom metadata across a restart',async t=>{
  const f=await fixture(t),httpMetadata={contentType:'audio/webm'},customMetadata={owner:'owner-a',digest:'synthetic-digest'},bytes=Uint8Array.from([0,1,2,255,10]);
  const put=await f.PHOTOS.put('recording/one',bytes,{httpMetadata,customMetadata});assert.equal(put.size,5);httpMetadata.contentType='text/plain';customMetadata.owner='changed';bytes[0]=99;
  const head=await f.PHOTOS.head('recording/one');assert.equal(head.size,5);assert.equal(head.body,undefined);assert.deepEqual(head.httpMetadata,{contentType:'audio/webm'});assert.deepEqual(head.customMetadata,{owner:'owner-a',digest:'synthetic-digest'});head.customMetadata.owner='not persisted';
  await f.reopen();const object=await f.PHOTOS.get('recording/one');assert.equal(object.size,5);assert.equal(object.customMetadata.owner,'owner-a');assert.deepEqual(new Uint8Array(await object.arrayBuffer()),Uint8Array.from([0,1,2,255,10]));assert.deepEqual(new Uint8Array(await new Response(object.body).arrayBuffer()),Uint8Array.from([0,1,2,255,10]));
  const copy=new Uint8Array(await object.arrayBuffer());copy[0]=77;assert.equal(new Uint8Array(await object.arrayBuffer())[0],0);assert.equal(await f.PHOTOS.get('missing'),null);assert.equal(await f.PHOTOS.head('missing'),null);
});

test('Object reads support text, blobs, byte streams and validated ranges without changing full size metadata',async t=>{
  const f=await fixture(t);await f.PHOTOS.put('text','Synthetic text\n',{httpMetadata:{contentType:'text/plain'}});assert.equal(await (await f.PHOTOS.get('text')).text(),'Synthetic text\n');
  await f.PHOTOS.put('blob',new Blob(['abc']));assert.equal(await (await f.PHOTOS.get('blob')).text(),'abc');
  await f.PHOTOS.put('stream',new ReadableStream({start(controller){controller.enqueue(Uint8Array.from([0,1]));controller.enqueue(Uint8Array.from([2,3,4]));controller.close();}}));
  const part=await f.PHOTOS.get('stream',{range:{offset:1,length:3}});assert.equal(part.size,5);assert.deepEqual(new Uint8Array(await part.arrayBuffer()),Uint8Array.from([1,2,3]));assert.deepEqual(new Uint8Array(await (await f.PHOTOS.get('stream',{range:{offset:3,length:99}})).arrayBuffer()),Uint8Array.from([3,4]));
  for(const range of [{offset:-1,length:1},{offset:1.5,length:1},{offset:6,length:1},{offset:0,length:-1},{suffix:2}])await assert.rejects(f.PHOTOS.get('stream',{range}),/Invalid object range/);
  await f.PHOTOS.put('empty','');assert.equal((await f.PHOTOS.head('empty')).size,0);assert.equal(await (await f.PHOTOS.get('empty')).text(),'');
});

test('Object keys are hashed and cannot escape the private storage directory',async t=>{
  const f=await fixture(t),key='../../outside/object';await f.PHOTOS.put(key,'inside');assert.equal(await (await f.PHOTOS.get(key)).text(),'inside');assert.deepEqual((await readdir(f.root)).sort(),['data','migrations']);
  const files=await readdir(join(f.dataDir,'objects'));assert.equal(files.length,2);for(const file of files)assert.match(file,/^[a-f0-9]{64}(?:\.json|\.[a-f0-9-]{36}\.blob)$/);
  for(const key of ['',null,'bad\0key','x'.repeat(1025)])await assert.rejects(f.PHOTOS.get(key),/Invalid object key/);
  await assert.rejects(f.PHOTOS.delete([key,'']),/Invalid object key/);assert.equal(await (await f.PHOTOS.get(key)).text(),'inside');
});

test('Concurrent overwrites publish a complete generation and clean temporary or replaced blobs',async t=>{
  const f=await fixture(t),versions=Array.from({length:12},(_,index)=>({text:String(index).repeat(10000),version:String(index)}));
  await Promise.all(versions.map(value=>f.PHOTOS.put('shared',value.text,{customMetadata:{version:value.version}})));const current=await f.PHOTOS.get('shared');assert.equal(await current.text(),versions[Number(current.customMetadata.version)].text);
  const files=await readdir(join(f.dataDir,'objects'));assert.equal(files.length,2);assert.ok(files.every(file=>!file.endsWith('.tmp')));await f.reopen();assert.equal(await (await f.PHOTOS.get('shared')).text(),await current.text());
  await f.PHOTOS.put('second','second');await f.PHOTOS.delete(['shared','second','shared','missing']);assert.equal(await f.PHOTOS.get('shared'),null);assert.equal(await f.PHOTOS.get('second'),null);assert.deepEqual(await readdir(join(f.dataDir,'objects')),[]);
});

test('Missing or damaged object bytes never become a successful head or fabricated payload',async t=>{
  const f=await fixture(t);await f.PHOTOS.put('object','original');const directory=join(f.dataDir,'objects'),blob=(await readdir(directory)).find(file=>file.endsWith('.blob'));await writeFile(join(directory,blob),'bad');await assert.rejects(f.PHOTOS.get('object'),/bytes are invalid/);await assert.rejects(f.PHOTOS.head('object'),/bytes are invalid/);
  await rm(join(directory,blob));assert.equal(await f.PHOTOS.get('object'),null);assert.equal(await f.PHOTOS.head('object'),null);
});

test('Storage bounds reject oversized objects and invalid metadata without committing a pointer',async t=>{
  const f=await fixture(t,undefined,{maxObjectBytes:4});for(const body of ['12345',new Blob(['12345']),Uint8Array.from([1,2,3,4,5])])await assert.rejects(f.PHOTOS.put('too-big',body),/storage limit/);
  await assert.rejects(f.PHOTOS.put('bad-metadata','ok',{customMetadata:{owner:123}}),/metadata/);assert.deepEqual(await readdir(join(f.dataDir,'objects')),[]);
  let cancelled=false;await assert.rejects(f.PHOTOS.put('too-big',new ReadableStream({pull(controller){controller.enqueue(Uint8Array.from([1,2,3,4,5]));},cancel(){cancelled=true;}})),/storage limit/);assert.equal(cancelled,true);
});

test('The aggregate object quota admits only the concurrent writes that fit and remains enforced after restart',async t=>{
  const f=await fixture(t,undefined,{maxStorageBytes:12}),keys=['a','b','c','d'];
  const outcomes=await Promise.allSettled(keys.map(key=>f.PHOTOS.put(key,'1234'))),accepted=keys.filter((_key,index)=>outcomes[index].status==='fulfilled'),rejected=outcomes.filter(value=>value.status==='rejected');
  assert.equal(accepted.length,3);assert.equal(rejected.length,1);assert.equal(rejected[0].reason.code,'object_storage_limit');assert.equal(rejected[0].reason.status,507);assert.equal((await readdir(join(f.dataDir,'objects'))).length,6);
  for(let index=0;index<keys.length;index++)assert.equal(Boolean(await f.PHOTOS.head(keys[index])),outcomes[index].status==='fulfilled');
  await f.reopen();await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit'&&error.status===507);
  await f.PHOTOS.delete(accepted[0]);await f.PHOTOS.put('replacement','1234');await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit');
  assert.equal(await (await f.PHOTOS.get('replacement')).text(),'1234');
});

test('Quota failures preserve an existing object and smaller replacements and deletion release capacity',async t=>{
  const f=await fixture(t,undefined,{maxStorageBytes:10}),directory=join(f.dataDir,'objects');
  await f.PHOTOS.put('large','123456',{customMetadata:{version:'original'}});await f.PHOTOS.put('other','1234');const before=(await readdir(directory)).sort();
  await assert.rejects(f.PHOTOS.put('large','1234567',{customMetadata:{version:'rejected'}}),error=>error.code==='object_storage_limit');await assert.rejects(f.PHOTOS.put('new','x'),error=>error.code==='object_storage_limit');
  assert.deepEqual((await readdir(directory)).sort(),before);const original=await f.PHOTOS.get('large');assert.equal(await original.text(),'123456');assert.equal(original.customMetadata.version,'original');assert.equal(await f.PHOTOS.get('new'),null);
  await f.PHOTOS.put('large','abc');await f.PHOTOS.put('third','123');await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit');
  await f.PHOTOS.delete(['other','missing']);await f.PHOTOS.put('fourth','1234');await f.reopen();assert.equal(await (await f.PHOTOS.get('large')).text(),'abc');assert.equal(await (await f.PHOTOS.get('third')).text(),'123');assert.equal(await (await f.PHOTOS.get('fourth')).text(),'1234');await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit');
});

test('Concurrent replacements of one key use its committed size instead of accumulating or losing quota',async t=>{
  const f=await fixture(t,undefined,{maxStorageBytes:10});await f.PHOTOS.put('shared','12345');await f.PHOTOS.put('fixed','12345');
  const results=await Promise.allSettled([f.PHOTOS.put('shared','abc'),f.PHOTOS.put('shared','1234567'),f.PHOTOS.put('shared','abcde')]);
  assert.deepEqual(results.map(result=>result.status),['fulfilled','rejected','fulfilled']);assert.equal(results[1].reason.code,'object_storage_limit');assert.equal(await (await f.PHOTOS.get('shared')).text(),'abcde');assert.equal((await readdir(join(f.dataDir,'objects'))).length,4);
  await assert.rejects(f.PHOTOS.put('extra','x'),error=>error.code==='object_storage_limit');await f.PHOTOS.delete('fixed');await f.PHOTOS.put('extra','12345');await f.reopen();await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit');
});

test('Restart recovery recounts committed objects and removes abandoned generations without reading outside the object store',async t=>{
  const f=await fixture(t,undefined,{maxStorageBytes:10}),directory=join(f.dataDir,'objects'),hash='a'.repeat(64),orphan=hash+'.'+randomUUID()+'.blob',temporary=hash+'.json.'+randomUUID()+'.tmp';
  await f.PHOTOS.put('saved','123456');await f.storage.close();await writeFile(join(directory,orphan),Buffer.alloc(100));await writeFile(join(directory,temporary),Buffer.alloc(100));
  const outside=join(f.root,'outside');await mkdir(outside);await writeFile(join(outside,'keep.bin'),Buffer.alloc(10000,7));await writeFile(join(f.dataDir,'not-an-object.bin'),Buffer.alloc(10000,8));
  if(process.platform!=='win32')await symlink(outside,join(directory,'external-directory'));
  await f.reopen();const files=await readdir(directory);assert.ok(!files.includes(orphan));assert.ok(!files.includes(temporary));assert.equal(await (await f.PHOTOS.get('saved')).text(),'123456');assert.equal((await readFile(join(outside,'keep.bin'))).length,10000);assert.equal((await readFile(join(f.dataDir,'not-an-object.bin'))).length,10000);
  await f.PHOTOS.put('fits','1234');await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit');
});

test('Restart recovery releases missing object bytes and a lowered limit still protects existing readable data',async t=>{
  const f=await fixture(t,undefined,{maxStorageBytes:10}),directory=join(f.dataDir,'objects');await f.PHOTOS.put('missing','123456');await f.PHOTOS.put('saved','1234');await f.storage.close();
  const hash=createHash('sha256').update('missing').digest('hex'),pointer=JSON.parse(await readFile(join(directory,hash+'.json'),'utf8'));await rm(join(directory,hash+'.'+pointer.generation+'.blob'));
  await f.reopen();assert.equal(await f.PHOTOS.head('missing'),null);assert.ok(!(await readdir(directory)).includes(hash+'.json'));await f.PHOTOS.put('new','123456');
  await f.reopen({maxStorageBytes:6});assert.equal(await (await f.PHOTOS.get('saved')).text(),'1234');assert.equal(await (await f.PHOTOS.get('new')).text(),'123456');await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit');await f.PHOTOS.delete('new');await f.PHOTOS.put('fits','12');await assert.rejects(f.PHOTOS.put('overflow','x'),error=>error.code==='object_storage_limit');
  for(const maxStorageBytes of [0,-1,1.5,Infinity,'10'])await assert.rejects(openStorage({dataDir:f.dataDir,migrationsDir:f.migrationsDir,maxStorageBytes}),/Aggregate storage limit/);
});

test('Storage directories and files stay private and symlink storage roots are rejected',async t=>{
  const f=await fixture(t);await f.DB.prepare('INSERT INTO sample (id,n) VALUES (?,?)').bind('one',1).run();await f.PHOTOS.put('object','private');
  if(process.platform!=='win32'){
    for(const directory of [f.dataDir,join(f.dataDir,'objects')])assert.equal((await stat(directory)).mode&0o777,0o700);
    for(const file of await readdir(f.dataDir)){const path=join(f.dataDir,file);if((await stat(path)).isFile())assert.equal((await stat(path)).mode&0o777,0o600);}
    for(const file of await readdir(join(f.dataDir,'objects')))assert.equal((await stat(join(f.dataDir,'objects',file))).mode&0o777,0o600);
    const destination=join(f.root,'linked');await symlink(f.dataDir,destination);await assert.rejects(openStorage({dataDir:destination,migrationsDir:f.migrationsDir}),/real directory/);
  }
});

test('Close drains already queued writes, is idempotent and rejects new operations',async t=>{
  const f=await fixture(t),queued=f.PHOTOS.put('saved','saved'),another=f.PHOTOS.put('saved','latest');const first=f.storage.close(),second=f.storage.close();assert.equal(first,second);await Promise.all([queued,another,first]);
  assert.throws(()=>f.DB.prepare('SELECT 1'),/Storage is closed/);
  await assert.rejects(f.PHOTOS.get('saved'),/Storage is closed/);await assert.rejects(f.PHOTOS.put('new','new'),/Storage is closed/);await f.reopen();assert.equal(await (await f.PHOTOS.get('saved')).text(),'latest');
});
