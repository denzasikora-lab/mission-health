import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile, readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto, createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
const source = (await Promise.all([
  'public/actiwatch-core.js', 'worker/activity.js', 'worker/scheduler.js', 'worker/personal.js',
  'worker/photos.js', 'worker/stories.js', 'worker/book.js',
  'worker/actiwatch.js', 'worker/index.js'
].map(path => readFile(new URL(path, root), 'utf8')))).join('\n').replace('export default', 'globalThis.app =');
const migrations = await Promise.all((await readdir(new URL('drizzle/', root)))
  .filter(name => name.endsWith('.sql')).sort()
  .map(name => readFile(new URL('drizzle/' + name, root), 'utf8')));
const model = 'embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:text:256:v1';
const clone = value => JSON.parse(JSON.stringify(value));
const csv = [
  'Epoch Length,30 seconds',
  'Date,Time,Activity,White Light,Sleep/Wake Score,Off-Wrist Status,Interval Status',
  '10/29/2026,12:00:00,0,0,0,0,Rest-Sleep',
  '10/29/2026,12:00:30,12,100,1,0,Active',
  '10/29/2026,12:01:00,99,900,0,1,Rest-Sleep',
  '10/29/2026,12:01:30,99,800,0,0,Excluded'
].join('\n');

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const migration of migrations) sql.exec(migration);
  const DB = {
    prepare(query) {
      const statement = sql.prepare(query);
      return {bind(...values) {
        return {
          first: async () => statement.get(...values) || null,
          all: async () => ({results: statement.all(...values)}),
          run: async () => statement.run(...values)
        };
      }};
    },
    async batch(commands) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const command of commands) results.push(await command.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const objects = new Map(), storageCalls = [], outgoing = [];
  const PHOTOS = {
    async put(key, body, metadata) {
      storageCalls.push({action: 'put', key});
      objects.set(key, {body: String(body), metadata: clone(metadata)});
    },
    async get(key) {
      storageCalls.push({action: 'get', key});
      const object = objects.get(key);
      return object ? {text: async () => object.body} : null;
    },
    async delete(key) {
      for (const item of Array.isArray(key) ? key : [key]) {
        storageCalls.push({action: 'delete', key: item});
        objects.delete(item);
      }
    }
  };
  const scope = {
    URL, Request, Response, FormData, Blob, Uint8Array, TextEncoder, TextDecoder,
    DataView, AbortSignal, crypto: webcrypto, atob,
    console: {warn() {}, error() {}},
    fetch: async (url, options) => {
      outgoing.push({url, body: options?.body});
      throw new Error('Сетевые вызовы запрещены в изолированной проверке');
    }
  };
  vm.runInNewContext(source, scope);
  const env = {DB, PHOTOS, LLM_API_KEY: 'test-key', LLM_BASE_URL: 'https://model.test/v1', LLM_MODEL: 'test-model'};
  const run = async (path, {owner = 'owner-a', method = 'GET', body, raw, environment = {}, headers: extra = {}} = {}) => {
    const headers = {'content-type': 'application/json', ...extra};
    if (owner) headers['oai-authenticated-user-id'] = owner;
    const response = await scope.app.fetch(new Request('https://mission.test' + path, {
      method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
    }), {...env, ...environment}, {waitUntil() {}});
    return {status: response.status, body: await response.json()};
  };
  const recording = () => clone(scope.MissionActiwatch.parseCSV(csv, {dateOrder: 'MDY', utcOffsetMinutes: 180}));
  const upload = (options = {}) => {
    const {id = webcrypto.randomUUID(), filename = 'actiware.csv', value = recording(), extra = {}, ...request} = options;
    return run('/api/actiwatch', {method: 'POST', ...request, body: {id, filename, recording: value, ...extra}});
  };
  return {sql, run, upload, recording, objects, storageCalls, outgoing, core: scope.MissionActiwatch};
}

test('Экспорт CSV проходит реальный парсер и сохраняется как каноническая запись', async t => {
  const f = fixture(t), value = f.recording();
  assert.equal(value.rows[0].timestamp, '2026-10-29T09:00:00.000Z');
  assert.equal(value.epochSeconds, 30);
  assert.equal(value.rows.length, 4);
  const saved = await f.upload({value});
  assert.equal(saved.status, 201);
  assert.equal(saved.body.duplicate, false);
  const row = f.sql.prepare('SELECT * FROM actiwatch_imports').get();
  assert.equal(row.owner_id, 'owner-a');
  assert.equal(row.recorded_end, '2026-10-29T09:02:00.000Z');
  assert.equal(row.digest, createHash('sha256').update(JSON.stringify(value)).digest('hex'));
  const object = f.objects.get(row.object_key);
  assert.deepEqual(JSON.parse(object.body), value);
  assert.equal(object.metadata.httpMetadata.contentType, 'application/json');
  assert.deepEqual(saved.body.import.summary, clone(f.core.summarize(value)));
});

test('Импорт создает личную заметку и событие без обращения к языковой модели', async t => {
  const f = fixture(t), saved = await f.upload();
  const note = f.sql.prepare('SELECT * FROM journal_messages').get();
  assert.equal(note.id, saved.body.import.diaryMessageId);
  assert.equal(note.owner_id, 'owner-a');
  assert.equal(note.astronaut_id, 'personal');
  assert.equal(note.role, 'note');
  assert.equal(note.assistant_source, 'actiwatch');
  assert.equal(note.vector_status, 'pending');
  assert.ok(note.content.includes('Активность полных эпох: 12 counts'));
  assert.ok(note.content.includes('Белый свет: среднее 50.0 лк'));
  assert.ok(note.content.includes('не предоставил в этой записи пульс, SpO2, ЭКГ или температуру'));
  const events = (await f.run('/api/activity')).body.events;
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'actiwatch_imported');
  assert.ok(events[0].summary.includes('4 эпох'));
  assert.equal(f.outgoing.length, 0);
});

test('Сводка и профиль клиента игнорируются при расчете серверных данных', async t => {
  const f = fixture(t), saved = await f.upload({filename: 'export\nname.csv', extra: {
    summary: {latest24h: {sleepSeconds: 999999, activityCounts: 999999}},
    profile: 'jessica-meir', diaryMessageId: webcrypto.randomUUID(), source: 'live-watch'
  }});
  assert.equal(saved.status, 201);
  assert.equal(saved.body.import.summary.latest24h.sleepSeconds, 30);
  assert.equal(saved.body.import.summary.latest24h.activityCounts, 12);
  assert.equal(saved.body.import.filename, 'export name.csv');
  assert.equal(saved.body.import.source, 'Actiwatch / Actiware CSV');
  const note = f.sql.prepare('SELECT * FROM journal_messages').get();
  assert.equal(note.astronaut_id, 'personal');
  assert.ok(!note.content.includes('999999'));
  assert.ok(note.content.includes('без прямого подключения к часам'));
});

test('Отсутствующие каналы и неизвестные метки не превращаются в нули или сон', async t => {
  const f = fixture(t), value = clone(f.core.parseCSV([
    'Timestamp,Activity,Sleep/Wake Score',
    '2026-10-29T09:00:00Z,NaN,2',
    '2026-10-29T09:00:30Z,,NaN'
  ].join('\n'), {epochSeconds: 30}));
  const saved = await f.upload({value});
  assert.equal(saved.status, 201);
  const summary = saved.body.import.summary.latest24h;
  for (const field of ['sleepSeconds', 'wakeSeconds', 'activityCounts', 'meanLightLux', 'maxLightLux']) assert.equal(summary[field], null);
  assert.equal(summary.coveredSeconds, 60);
  assert.equal(summary.sleepScoredSeconds, 0);
  const downloaded = await f.run('/api/actiwatch/' + saved.body.import.id);
  assert.equal(downloaded.body.recording.rows[0].offWrist, null);
  assert.equal(downloaded.body.recording.rows[0].sleepState, 'unknown');
  const text = f.sql.prepare('SELECT content FROM journal_messages').get().content;
  assert.ok(text.includes('Сон по неподвижности не вычислялся'));
  assert.ok(text.includes('Пригодных измерений активности нет'));
  assert.ok(text.includes('Пригодных измерений белого света нет'));
});

test('Без входа недоступны список импорт и скачивание', async t => {
  const f = fixture(t), saved = await f.upload();
  for (const [path, method] of [['/api/actiwatch', 'GET'], ['/api/actiwatch', 'POST'], ['/api/actiwatch/' + saved.body.import.id, 'GET']]) {
    const result = await f.run(path, {owner: null, method, ...(method === 'POST' ? {body: {}} : {})});
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'sign_in_required');
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM actiwatch_imports').get().n, 1);
});

test('Чужое происхождение и межсайтовая отправка отклоняются до сохранения', async t => {
  const f = fixture(t);
  for (const headers of [{origin: 'https://other.test'}, {'sec-fetch-site': 'cross-site'}]) {
    const result = await f.upload({headers});
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'forbidden');
  }
  assert.equal(f.objects.size, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n, 0);
  assert.equal(f.outgoing.length, 0);
});

test('Метаданные и исходная запись видны только владельцу', async t => {
  const f = fixture(t), saved = await f.upload(), id = saved.body.import.id;
  const own = await f.run('/api/actiwatch');
  assert.equal(own.body.imports.length, 1);
  assert.equal(own.body.latest.id, id);
  const downloaded = await f.run('/api/actiwatch/' + id);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(downloaded.body.recording, f.recording());
  const reads = f.storageCalls.filter(call => call.action === 'get').length;
  assert.deepEqual((await f.run('/api/actiwatch', {owner: 'owner-b'})).body, {imports: [], latest: null});
  const other = await f.run('/api/actiwatch/' + id, {owner: 'owner-b'});
  assert.equal(other.status, 404);
  assert.equal(f.storageCalls.filter(call => call.action === 'get').length, reads);
  assert.equal((await f.run('/api/activity', {owner: 'owner-b'})).body.events.length, 0);
});

test('Повтор того же ID и содержимого не дублирует файл заметку или событие', async t => {
  const f = fixture(t), id = webcrypto.randomUUID();
  const first = await f.upload({id}), second = await f.upload({id});
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.import.diaryMessageId, first.body.import.diaryMessageId);
  assert.equal(f.objects.size, 1);
  assert.equal(f.storageCalls.filter(call => call.action === 'put').length, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM actiwatch_imports').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n, 1);
  assert.equal((await f.run('/api/activity')).body.events.length, 1);
});

test('Тот же файл с новым ID и именем дедуплицируется внутри владельца', async t => {
  const f = fixture(t), first = await f.upload({filename: 'first.csv'});
  const again = await f.upload({filename: 'renamed.csv'});
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.import.id, first.body.import.id);
  assert.equal(again.body.import.filename, 'first.csv');
  assert.equal(f.objects.size, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n, 1);
});

test('Одинаковое содержимое разных владельцев хранится независимо', async t => {
  const f = fixture(t), first = await f.upload(), second = await f.upload({owner: 'owner-b'});
  assert.equal(second.status, 201);
  assert.notEqual(first.body.import.id, second.body.import.id);
  assert.notEqual(first.body.import.diaryMessageId, second.body.import.diaryMessageId);
  assert.equal(f.objects.size, 2);
  assert.equal((await f.run('/api/actiwatch')).body.imports.length, 1);
  assert.equal((await f.run('/api/actiwatch', {owner: 'owner-b'})).body.imports.length, 1);
});

test('Коллизия ID другого владельца и подмена содержимого дают конфликт', async t => {
  const f = fixture(t), id = webcrypto.randomUUID();
  await f.upload({id});
  assert.equal((await f.upload({id, owner: 'owner-b'})).status, 409);
  const changed = f.recording(); changed.rows[0].activity = 400;
  assert.equal((await f.upload({id, value: changed})).status, 409);
  assert.equal(f.objects.size, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM actiwatch_imports').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n, 1);
});

test('Ошибка второй операции пакета откатывает SQL и удаляет только новый объект', async t => {
  const f = fixture(t), first = await f.upload();
  const beforeObjects = clone([...f.objects]), beforeNotes = clone(f.sql.prepare('SELECT * FROM journal_messages').all());
  f.sql.exec("CREATE TRIGGER fail_actiwatch_note BEFORE INSERT ON journal_messages WHEN NEW.assistant_source='actiwatch' BEGIN SELECT RAISE(ABORT,'Проверка отката'); END;");
  const changed = f.recording(); changed.rows[0].activity = 700;
  const failed = await f.upload({value: changed});
  assert.equal(failed.status, 503);
  assert.deepEqual(clone([...f.objects]), beforeObjects);
  assert.deepEqual(clone(f.sql.prepare('SELECT * FROM journal_messages').all()), beforeNotes);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM actiwatch_imports').get().n, 1);
  assert.equal(f.sql.prepare('SELECT id FROM actiwatch_imports').get().id, first.body.import.id);
  assert.equal(f.storageCalls.filter(call => call.action === 'delete').length, 1);
  assert.equal((await f.run('/api/activity')).body.events.length, 1);
});

test('Последним считается конец измерений а не дата загрузки', async t => {
  const f = fixture(t), newer = await f.upload();
  const old = f.recording();
  for (const row of old.rows) row.timestamp = new Date(Date.parse(row.timestamp) - 86400000).toISOString();
  const older = await f.upload({value: old});
  f.sql.prepare('UPDATE actiwatch_imports SET created_at=? WHERE id=?').run('2030-01-01T00:00:00.000Z', older.body.import.id);
  f.sql.prepare('UPDATE actiwatch_imports SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z', newer.body.import.id);
  const list = await f.run('/api/actiwatch');
  assert.equal(list.body.latest.id, newer.body.import.id);
  assert.deepEqual(list.body.imports.map(item => item.id), [newer.body.import.id, older.body.import.id]);
});

test('Импорт доступен книге и векторному поиску только личного профиля владельца', async t => {
  const f = fixture(t), imported = await f.upload(), id = imported.body.import.diaryMessageId;
  const friendId = webcrypto.randomUUID();
  await f.run('/api/astronauts/jessica-meir/messages', {method: 'POST', body: {id: friendId, content: 'Запись чужого профиля', language: 'ru', mode: 'diary', attachments: []}});
  const personal = await f.run('/api/astronauts/personal/book');
  assert.equal(personal.body.total, 1);
  assert.equal(personal.body.entries[0].id, id);
  const pending = await f.run('/api/astronauts/personal/book-index');
  assert.equal(pending.body.entries.length, 1);
  assert.equal(pending.body.entries[0].id, id);
  assert.ok(pending.body.entries[0].content.includes('Actiwatch / импорт Actiware'));
  assert.equal((await f.run('/api/astronauts/jessica-meir/book-index')).body.entries[0].id, friendId);
  assert.equal((await f.run('/api/astronauts/personal/book-index', {owner: 'owner-b'})).body.entries.length, 0);
  const vector = Array.from({length: 256}, (_, index) => index === 0 ? 1 : 0);
  const indexed = await f.run('/api/astronauts/personal/book-vectors', {method: 'POST', body: {id, model, vectors: [vector]}});
  assert.equal(indexed.status, 200);
  for (const [profile, owner] of [['jessica-meir', 'owner-a'], ['personal', 'owner-b']]) {
    assert.equal((await f.run('/api/astronauts/' + profile + '/book-vectors', {owner, method: 'POST', body: {id, model, vectors: [vector]}})).status, 404);
  }
  const search = await f.run('/api/astronauts/personal/book-search', {method: 'POST', body: {query: 'Сон и освещенность Actiwatch', model, vector}});
  assert.equal(search.status, 200);
  assert.equal(search.body.method, 'browser-vectors');
  assert.deepEqual(search.body.matches.map(item => item.id), [id]);
  assert.equal(search.body.matches[0].source, 'actiwatch');
  assert.equal((await f.run('/api/astronauts/personal/book-index')).body.entries.length, 0);
  assert.equal(f.outgoing.length, 0);
});

test('Некорректный JSON формат и тип данных отклоняются без побочных эффектов', async t => {
  const f = fixture(t);
  const invalid = [
    {raw: '{'},
    {body: null},
    {body: {id: webcrypto.randomUUID(), filename: '', recording: f.recording()}},
    {body: {id: 'неверный ID', filename: 'file.csv', recording: f.recording()}},
    {body: {id: webcrypto.randomUUID(), filename: 'file.csv', recording: {...f.recording(), epochSeconds: '30'}}},
    {body: {id: webcrypto.randomUUID(), filename: 'file.csv', recording: f.recording()}, headers: {'content-type': 'text/plain'}}
  ];
  for (const options of invalid) assert.equal((await f.run('/api/actiwatch', {method: 'POST', ...options})).status, 400);
  assert.equal(f.objects.size, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM actiwatch_imports').get().n, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM journal_messages').get().n, 0);
});

test('Ограничение размера и отсутствие хранилища не создают метаданные', async t => {
  const f = fixture(t);
  const tooLarge = await f.upload({headers: {'content-length': '10000001'}});
  assert.equal(tooLarge.status, 413);
  const unavailable = await f.upload({environment: {PHOTOS: null}});
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error, 'storage_unavailable');
  assert.equal(f.objects.size, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM actiwatch_imports').get().n, 0);
});
