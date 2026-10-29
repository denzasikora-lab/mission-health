import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const sandbox = {};
vm.runInNewContext(await readFile(new URL('../public/actiwatch-core.js', import.meta.url), 'utf8'), sandbox);
const {parseCSV, validate, summarize} = sandbox.MissionActiwatch;
const clone = value => JSON.parse(JSON.stringify(value));
const header = 'Date,Time,Activity,White Light,Sleep/Wake Score,Off-Wrist Status,Interval Status';
const options = {dateOrder:'MDY',utcOffsetMinutes:180,epochSeconds:30};
const sample = () => parseCSV(`${header}\n10/29/2026,12:00:00,0,0,0,0,Rest-Sleep\n10/29/2026,12:00:30,12,100,1,0,Active`,options);

test('Экспорт работает без window в окружении Worker',()=>{assert.deepEqual(Object.keys(sandbox.MissionActiwatch).sort(),['parseCSV','summarize','validate']);});
test('Преамбула, кавычки, CRLF и пустые строки не нарушают поиск заголовка',()=>{
  const text = '\uFEFF"Patient","Имя, Фамилия"\r\n"Epoch Length","30 seconds"\r\n\r\n'+header+'\r\n\r\n10/29/2026,12:00:00,0,0,0,0,Rest\r\n\r\n10/29/2026,12:00:30,4,5,1,0,Active\r\n';
  const value = parseCSV(text,{dateOrder:'MDY',utcOffsetMinutes:180});
  assert.equal(value.rows.length,2);assert.equal(value.epochSeconds,30);assert.equal(value.rows[0].timestamp,'2026-10-29T09:00:00.000Z');
});
test('Дата DMY не интерпретируется как MDY, поддерживаются YMD и AM/PM',()=>{
  const dmy=parseCSV(`${header}\n04/05/2026,12:00:00 AM,1,1,0,0,Rest\n04/05/2026,12:00:30 AM,1,1,0,0,Rest`,{...options,dateOrder:'DMY',utcOffsetMinutes:0});
  assert.equal(dmy.rows[0].timestamp,'2026-05-04T00:00:00.000Z');
  const ymd=parseCSV(`${header}\n2026-05-04,12:00:00 PM,1,1,0,0,Rest\n2026-05-04,12:00:30 PM,1,1,0,0,Rest`,{...options,dateOrder:'YMD',utcOffsetMinutes:-240});
  assert.equal(ymd.rows[0].timestamp,'2026-05-04T16:00:00.000Z');
});
test('Date и Time требуют явных формата даты и UTC-смещения',()=>{
  const text=`${header}\n10/29/2026,12:00:00,1,1,0,0,Rest\n10/29/2026,12:00:30,1,1,0,0,Rest`;
  assert.throws(()=>parseCSV(text,{epochSeconds:30,utcOffsetMinutes:0}),/формат даты/);
  assert.throws(()=>parseCSV(text,{epochSeconds:30,dateOrder:'MDY'}),/смещение UTC/);
  assert.throws(()=>parseCSV(text,{...options,utcOffsetMinutes:'180'}),/смещение UTC/);
  assert.throws(()=>parseCSV(text,{...options,utcOffsetMinutes:900}),/смещение UTC/);
});
test('ISO со своей зоной не требует локальных параметров и нормализуется в UTC',()=>{
  const value=parseCSV('Timestamp,Activity,Photopic Light,Sleep/Wake\n2026-10-29T12:00:00+03:00,1,20,0\n2026-10-29T09:00:30Z,3,40,1',{epochSeconds:30});
  assert.equal(value.rows[0].timestamp,'2026-10-29T09:00:00.000Z');assert.equal(value.rows[1].timestamp,'2026-10-29T09:00:30.000Z');
  assert.throws(()=>parseCSV('Timestamp,Activity\n2026-10-29T09:00:00,1\n2026-10-29T09:00:30,2',{epochSeconds:30}),/ISO/);
});
test('Нулевая активность и нулевой свет сохраняются, NaN и пустое остаются null',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,0,0,0,0,Rest\n10/29/2026,12:00:30,NaN,,NaN,NaN,N/A`,options);
  assert.deepEqual(clone(value.rows.map(row=>[row.activity,row.lightLux,row.sleepState,row.offWrist])),[[0,0,'sleep',false],[null,null,'unknown',null]]);
  const summary=summarize(value);assert.equal(summary.validSeconds,30);assert.equal(summary.latest24h.sleepSeconds,30);assert.equal(summary.latest24h.wakeSeconds,0);assert.equal(summary.latest24h.activityCounts,0);assert.equal(summary.latest24h.meanLightLux,0);
});
test('Неизвестная классификация не превращается в сон, цифровой Interval Status запрещен',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,1,1,2,0,Rest\n10/29/2026,12:00:30,1,1,,0,Rest`,options);
  assert.equal(summarize(value).latest24h.sleepSeconds,null);assert.equal(summarize(value).latest24h.wakeSeconds,null);assert.ok(value.warnings.some(text=>text.includes('метки сна')));
  assert.throws(()=>parseCSV(`${header}\n10/29/2026,12:00:00,1,1,0,0,1\n10/29/2026,12:00:30,1,1,0,0,1`,options),/Interval Status/);
});
test('Снятые часы, исключенные эпохи и отсутствующая активность не увеличивают сон',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,1,100,0,1,Rest\n10/29/2026,12:00:30,1,200,0,0,Excluded\n10/29/2026,12:01:00,NaN,300,0,0,Rest\n10/29/2026,12:01:30,2,400,1,0,Active`,options);
  const summary=summarize(value);assert.equal(summary.validSeconds,30);assert.equal(summary.offWristSeconds,30);assert.equal(summary.excludedSeconds,30);assert.equal(summary.latest24h.coveredSeconds,120);assert.equal(summary.latest24h.sleepScoredSeconds,30);assert.equal(summary.latest24h.sleepSeconds,0);assert.equal(summary.latest24h.wakeSeconds,30);assert.equal(summary.latest24h.activityCounts,2);assert.equal(summary.latest24h.meanLightLux,350);
});
test('Пропуски не заполняются и не экстраполируются',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,0,,0,0,Rest\n10/29/2026,18:00:00,0,,0,0,Rest`,options);
  const summary=summarize(value);assert.equal(summary.latest24h.coveredSeconds,60);assert.equal(summary.latest24h.sleepSeconds,60);assert.equal(summary.latest24h.meanLightLux,null);assert.equal(summary.latest24h.maxLightLux,null);assert.ok(value.warnings.some(text=>text.includes('пропуски')));
});
test('Последние 24 часа заканчиваются концом последней эпохи и исключают старые данные',()=>{
  const value=validate({version:1,sourceFormat:'actiware-csv',epochSeconds:30,warnings:[],rows:[
    {timestamp:'2026-10-27T23:59:30Z',activity:999,lightLux:999,sleepState:'sleep',offWrist:false,excluded:false},
    {timestamp:'2026-10-28T00:00:00Z',activity:2,lightLux:20,sleepState:'wake',offWrist:false,excluded:false},
    {timestamp:'2026-10-28T23:59:30Z',activity:3,lightLux:40,sleepState:'sleep',offWrist:false,excluded:false}
  ]});
  const summary=summarize(value);assert.equal(summary.latest24h.start,'2026-10-28T00:00:00.000Z');assert.equal(summary.end,'2026-10-29T00:00:00.000Z');assert.equal(summary.latest24h.activityCounts,5);assert.equal(summary.latest24h.meanLightLux,30);assert.equal(summary.latest24h.coveredSeconds,60);assert.equal(summary.validSeconds,90);
});
test('Граничная эпоха дает точную длительность, но counts не распределяются предположением',()=>{
  const row=(timestamp,activity,lightLux)=>({timestamp,activity,lightLux,sleepState:'sleep',offWrist:false,excluded:false});
  const summary=summarize({version:1,sourceFormat:'actiware-csv',epochSeconds:7,warnings:[],rows:[row('2026-10-28T00:00:00Z',100,20),row('2026-10-29T00:00:00Z',3,40)]});
  assert.equal(summary.latest24h.start,'2026-10-28T00:00:07.000Z');assert.equal(summary.latest24h.coveredSeconds,7);assert.equal(summary.latest24h.activityCounts,3);
  const partial=summarize({version:1,sourceFormat:'actiware-csv',epochSeconds:7,warnings:[],rows:[row('2026-10-28T00:00:04Z',100,20),row('2026-10-29T00:00:00Z',3,40)]});
  assert.equal(partial.latest24h.coveredSeconds,11);assert.equal(partial.latest24h.sleepSeconds,11);assert.equal(partial.latest24h.activityCounts,3);assert.equal(partial.latest24h.meanLightLux,(20*4+40*7)/11);
});
test('Валидатор сортирует копию, но отвергает дубликаты и перекрытия',()=>{
  const value=clone(sample());value.rows.reverse();const original=JSON.stringify(value);const sorted=validate(value);assert.equal(sorted.rows[0].timestamp,'2026-10-29T09:00:00.000Z');assert.equal(JSON.stringify(value),original);
  value.rows[1].timestamp=value.rows[0].timestamp;assert.throws(()=>validate(value),/дубликаты/);
  const overlap=clone(sample());overlap.rows[1].timestamp='2026-10-29T09:00:15Z';assert.throws(()=>validate(overlap),/перекрывающиеся/);
});
test('Невозможные даты и некорректные часы не исправляются автоматически',()=>{
  for(const stamp of ['2026-02-30T09:00:00Z','2026-10-29T24:00:00Z','2026-10-29T09:00:60Z','2026-10-29T09:00:00+14:01']){const value=clone(sample());value.rows[0].timestamp=stamp;assert.throws(()=>validate(value),/дат|время|пояс/);}
  assert.throws(()=>parseCSV(`${header}\n02/29/2026,12:00:00,1,1,0,0,Rest\n02/29/2026,12:00:30,1,1,0,0,Rest`,options),/дата/);
});
test('Длительность берется только из параметра или явно размерной метадаты',()=>{
  const text='Timestamp,Activity\n2026-10-29T09:00:00Z,1\n2026-10-29T09:01:00Z,2';
  assert.throws(()=>parseCSV(text),/длительность/);assert.throws(()=>parseCSV('Epoch Length,30\n'+text),/длительность/);
  assert.equal(parseCSV('Epoch Length (minutes),0.5\n'+text).epochSeconds,30);
  assert.equal(parseCSV('Epoch Length,00:01:00\n'+text).epochSeconds,60);
  for(const invalid of [0,121,1.5,'30',null])assert.throws(()=>parseCSV(text,{epochSeconds:invalid}),/эпохи/);
});
test('Строгая проверка типов не принимает строки чисел, бесконечности и отрицательные значения',()=>{
  for(const [field,values]of Object.entries({activity:['0',undefined,-1,NaN,Infinity],lightLux:['1',undefined,-1,Infinity],offWrist:[0,'false',undefined],excluded:[0,null,undefined],sleepState:[0,'Sleep',undefined]}))for(const value of values){const recording=clone(sample());recording.rows[0][field]=value;assert.throws(()=>validate(recording));}
  assert.throws(()=>parseCSV('Timestamp,Activity\n2026-10-29T09:00:00Z,-1\n2026-10-29T09:00:30Z,2',{epochSeconds:30}),/числовое/);
});
test('Количество строк и версия ограничены, пустая запись не проходит',()=>{
  const value=clone(sample());for(const count of [0,1,50001])assert.throws(()=>validate({...value,rows:Array.from({length:count},()=>value.rows[0])}),/2 до 50000/);
  assert.throws(()=>validate({...value,version:2}),/формат/);assert.throws(()=>validate({...value,warnings:'нет'}),/предупреждений/);
});
test('Отсутствующие каналы не подменяются RGB или нулем',()=>{
  const value=parseCSV('Timestamp,Activity,Red Light,Green Light,Blue Light\n2026-10-29T09:00:00Z,NaN,100,100,100\n2026-10-29T09:00:30Z,,100,100,100',{epochSeconds:30});
  const summary=summarize(value);assert.equal(summary.latest24h.activityCounts,null);assert.equal(summary.latest24h.sleepSeconds,null);assert.equal(summary.latest24h.meanLightLux,null);assert.equal(summary.latest24h.maxLightLux,null);assert.equal(value.rows[0].offWrist,null);
});
test('Незакрытый CSV, дубли столбцов и строка итога отвергаются вместо скрытой потери данных',()=>{
  assert.throws(()=>parseCSV('"незакрытый CSV'),/кавычки/);
  assert.throws(()=>parseCSV('Timestamp,Activity,Activity\n2026-10-29T09:00:00Z,1,1\n2026-10-29T09:00:30Z,1,1',{epochSeconds:30}),/Повторяющиеся/);
  assert.throws(()=>parseCSV('Timestamp,Activity\n2026-10-29T09:00:00Z,1\n2026-10-29T09:00:30Z,1\nSummary,10',{epochSeconds:30}),/ISO/);
});
test('Переполнение конечных counts и взвешенного света отклоняется до сериализации',()=>{
  for(const field of ['activity','lightLux']){
    const recording=clone(sample());
    for(const row of recording.rows)row[field]=1e308;
    assert.doesNotThrow(()=>validate(recording));
    assert.throws(()=>summarize(recording),/числовой итог.*допустимый диапазон/);
  }
});
