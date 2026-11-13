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

test('Export works without window in the environment Worker',()=>{assert.deepEqual(Object.keys(sandbox.MissionActiwatch).sort(),['parseCSV','summarize','validate']);});
test('Preamble, quotes, CRLF and empty lines do not break header detection',()=>{
  const text = '\uFEFF"Patient","First name, Last name"\r\n"Epoch Length","30 seconds"\r\n\r\n'+header+'\r\n\r\n10/29/2026,12:00:00,0,0,0,0,Rest\r\n\r\n10/29/2026,12:00:30,4,5,1,0,Active\r\n';
  const value = parseCSV(text,{dateOrder:'MDY',utcOffsetMinutes:180});
  assert.equal(value.rows.length,2);assert.equal(value.epochSeconds,30);assert.equal(value.rows[0].timestamp,'2026-10-29T09:00:00.000Z');
});
test('Date DMY is not interpreted as MDY, are supported YMD and AM/PM',()=>{
  const dmy=parseCSV(`${header}\n04/05/2026,12:00:00 AM,1,1,0,0,Rest\n04/05/2026,12:00:30 AM,1,1,0,0,Rest`,{...options,dateOrder:'DMY',utcOffsetMinutes:0});
  assert.equal(dmy.rows[0].timestamp,'2026-05-04T00:00:00.000Z');
  const ymd=parseCSV(`${header}\n2026-05-04,12:00:00 PM,1,1,0,0,Rest\n2026-05-04,12:00:30 PM,1,1,0,0,Rest`,{...options,dateOrder:'YMD',utcOffsetMinutes:-240});
  assert.equal(ymd.rows[0].timestamp,'2026-05-04T16:00:00.000Z');
});
test('Date and Time require an explicit date format and UTC-offset',()=>{
  const text=`${header}\n10/29/2026,12:00:00,1,1,0,0,Rest\n10/29/2026,12:00:30,1,1,0,0,Rest`;
  assert.throws(()=>parseCSV(text,{epochSeconds:30,utcOffsetMinutes:0}),/date format/);
  assert.throws(()=>parseCSV(text,{epochSeconds:30,dateOrder:'MDY'}),/offset UTC/);
  assert.throws(()=>parseCSV(text,{...options,utcOffsetMinutes:'180'}),/offset UTC/);
  assert.throws(()=>parseCSV(text,{...options,utcOffsetMinutes:900}),/offset UTC/);
});
test('ISO with its own zone needs no local options and is normalized to UTC',()=>{
  const value=parseCSV('Timestamp,Activity,Photopic Light,Sleep/Wake\n2026-10-29T12:00:00+03:00,1,20,0\n2026-10-29T09:00:30Z,3,40,1',{epochSeconds:30});
  assert.equal(value.rows[0].timestamp,'2026-10-29T09:00:00.000Z');assert.equal(value.rows[1].timestamp,'2026-10-29T09:00:30.000Z');
  assert.throws(()=>parseCSV('Timestamp,Activity\n2026-10-29T09:00:00,1\n2026-10-29T09:00:30,2',{epochSeconds:30}),/ISO/);
});
test('Zero activity and light values are preserved, NaN and empty values remain null',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,0,0,0,0,Rest\n10/29/2026,12:00:30,NaN,,NaN,NaN,N/A`,options);
  assert.deepEqual(clone(value.rows.map(row=>[row.activity,row.lightLux,row.sleepState,row.offWrist])),[[0,0,'sleep',false],[null,null,'unknown',null]]);
  const summary=summarize(value);assert.equal(summary.validSeconds,30);assert.equal(summary.latest24h.sleepSeconds,30);assert.equal(summary.latest24h.wakeSeconds,0);assert.equal(summary.latest24h.activityCounts,0);assert.equal(summary.latest24h.meanLightLux,0);
});
test('Unknown classifications do not become sleep, numeric Interval Status is rejected',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,1,1,2,0,Rest\n10/29/2026,12:00:30,1,1,,0,Rest`,options);
  assert.equal(summarize(value).latest24h.sleepSeconds,null);assert.equal(summarize(value).latest24h.wakeSeconds,null);assert.ok(value.warnings.some(text=>text.includes('sleep labels')));
  assert.throws(()=>parseCSV(`${header}\n10/29/2026,12:00:00,1,1,0,0,1\n10/29/2026,12:00:30,1,1,0,0,1`,options),/Interval Status/);
});
test('Watch removal, excluded epochs and missing activity do not increase sleep duration',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,1,100,0,1,Rest\n10/29/2026,12:00:30,1,200,0,0,Excluded\n10/29/2026,12:01:00,NaN,300,0,0,Rest\n10/29/2026,12:01:30,2,400,1,0,Active`,options);
  const summary=summarize(value);assert.equal(summary.validSeconds,30);assert.equal(summary.offWristSeconds,30);assert.equal(summary.excludedSeconds,30);assert.equal(summary.latest24h.coveredSeconds,120);assert.equal(summary.latest24h.sleepScoredSeconds,30);assert.equal(summary.latest24h.sleepSeconds,0);assert.equal(summary.latest24h.wakeSeconds,30);assert.equal(summary.latest24h.activityCounts,2);assert.equal(summary.latest24h.meanLightLux,350);
});
test('Gaps are not filled or extrapolated',()=>{
  const value=parseCSV(`${header}\n10/29/2026,12:00:00,0,,0,0,Rest\n10/29/2026,18:00:00,0,,0,0,Rest`,options);
  const summary=summarize(value);assert.equal(summary.latest24h.coveredSeconds,60);assert.equal(summary.latest24h.sleepSeconds,60);assert.equal(summary.latest24h.meanLightLux,null);assert.equal(summary.latest24h.maxLightLux,null);assert.ok(value.warnings.some(text=>text.includes('between epochs')));
});
test('The last 24 hours end at the last epoch and exclude older data',()=>{
  const value=validate({version:1,sourceFormat:'actiware-csv',epochSeconds:30,warnings:[],rows:[
    {timestamp:'2026-10-27T23:59:30Z',activity:999,lightLux:999,sleepState:'sleep',offWrist:false,excluded:false},
    {timestamp:'2026-10-28T00:00:00Z',activity:2,lightLux:20,sleepState:'wake',offWrist:false,excluded:false},
    {timestamp:'2026-10-28T23:59:30Z',activity:3,lightLux:40,sleepState:'sleep',offWrist:false,excluded:false}
  ]});
  const summary=summarize(value);assert.equal(summary.latest24h.start,'2026-10-28T00:00:00.000Z');assert.equal(summary.end,'2026-10-29T00:00:00.000Z');assert.equal(summary.latest24h.activityCounts,5);assert.equal(summary.latest24h.meanLightLux,30);assert.equal(summary.latest24h.coveredSeconds,60);assert.equal(summary.validSeconds,90);
});
test('A boundary epoch contributes exact duration, but counts are not distributed by assumption',()=>{
  const row=(timestamp,activity,lightLux)=>({timestamp,activity,lightLux,sleepState:'sleep',offWrist:false,excluded:false});
  const summary=summarize({version:1,sourceFormat:'actiware-csv',epochSeconds:7,warnings:[],rows:[row('2026-10-28T00:00:00Z',100,20),row('2026-10-29T00:00:00Z',3,40)]});
  assert.equal(summary.latest24h.start,'2026-10-28T00:00:07.000Z');assert.equal(summary.latest24h.coveredSeconds,7);assert.equal(summary.latest24h.activityCounts,3);
  const partial=summarize({version:1,sourceFormat:'actiware-csv',epochSeconds:7,warnings:[],rows:[row('2026-10-28T00:00:04Z',100,20),row('2026-10-29T00:00:00Z',3,40)]});
  assert.equal(partial.latest24h.coveredSeconds,11);assert.equal(partial.latest24h.sleepSeconds,11);assert.equal(partial.latest24h.activityCounts,3);assert.equal(partial.latest24h.meanLightLux,(20*4+40*7)/11);
});
test('The validator sorts a copy, but rejects duplicates and overlaps',()=>{
  const value=clone(sample());value.rows.reverse();const original=JSON.stringify(value);const sorted=validate(value);assert.equal(sorted.rows[0].timestamp,'2026-10-29T09:00:00.000Z');assert.equal(JSON.stringify(value),original);
  value.rows[1].timestamp=value.rows[0].timestamp;assert.throws(()=>validate(value),/Duplicate/);
  const overlap=clone(sample());overlap.rows[1].timestamp='2026-10-29T09:00:15Z';assert.throws(()=>validate(overlap),/overlapping/);
});
test('Impossible dates and invalid hours are not corrected automatically',()=>{
  for(const stamp of ['2026-02-30T09:00:00Z','2026-10-29T24:00:00Z','2026-10-29T09:00:60Z','2026-10-29T09:00:00+14:01']){const value=clone(sample());value.rows[0].timestamp=stamp;assert.throws(()=>validate(value),/date|time|zone/);}
  assert.throws(()=>parseCSV(`${header}\n02/29/2026,12:00:00,1,1,0,0,Rest\n02/29/2026,12:00:30,1,1,0,0,Rest`,options),/date/);
});
test('Duration comes only from a parameter or explicitly dimensioned metadata',()=>{
  const text='Timestamp,Activity\n2026-10-29T09:00:00Z,1\n2026-10-29T09:01:00Z,2';
  assert.throws(()=>parseCSV(text),/duration/);assert.throws(()=>parseCSV('Epoch Length,30\n'+text),/duration/);
  assert.equal(parseCSV('Epoch Length (minutes),0.5\n'+text).epochSeconds,30);
  assert.equal(parseCSV('Epoch Length,00:01:00\n'+text).epochSeconds,60);
  for(const invalid of [0,121,1.5,'30',null])assert.throws(()=>parseCSV(text,{epochSeconds:invalid}),/Epoch/);
});
test('Strict type checks reject numeric strings, infinities and negative values',()=>{
  for(const [field,values]of Object.entries({activity:['0',undefined,-1,NaN,Infinity],lightLux:['1',undefined,-1,Infinity],offWrist:[0,'false',undefined],excluded:[0,null,undefined],sleepState:[0,'Sleep',undefined]}))for(const value of values){const recording=clone(sample());recording.rows[0][field]=value;assert.throws(()=>validate(recording));}
  assert.throws(()=>parseCSV('Timestamp,Activity\n2026-10-29T09:00:00Z,-1\n2026-10-29T09:00:30Z,2',{epochSeconds:30}),/numeric/);
});
test('Row count and version are limited, an empty record is rejected',()=>{
  const value=clone(sample());for(const count of [0,1,50001])assert.throws(()=>validate({...value,rows:Array.from({length:count},()=>value.rows[0])}),/2 to 50000/);
  assert.throws(()=>validate({...value,version:2}),/format/);assert.throws(()=>validate({...value,warnings:'none'}),/warning/);
});
test('Missing channels are not replaced by RGB or zero',()=>{
  const value=parseCSV('Timestamp,Activity,Red Light,Green Light,Blue Light\n2026-10-29T09:00:00Z,NaN,100,100,100\n2026-10-29T09:00:30Z,,100,100,100',{epochSeconds:30});
  const summary=summarize(value);assert.equal(summary.latest24h.activityCounts,null);assert.equal(summary.latest24h.sleepSeconds,null);assert.equal(summary.latest24h.meanLightLux,null);assert.equal(summary.latest24h.maxLightLux,null);assert.equal(value.rows[0].offWrist,null);
});
test('Unclosed CSV, duplicate columns and total rows are rejected instead of silently losing data',()=>{
  assert.throws(()=>parseCSV('"unclosed CSV'),/quotation marks/);
  assert.throws(()=>parseCSV('Timestamp,Activity,Activity\n2026-10-29T09:00:00Z,1,1\n2026-10-29T09:00:30Z,1,1',{epochSeconds:30}),/Duplicate/);
  assert.throws(()=>parseCSV('Timestamp,Activity\n2026-10-29T09:00:00Z,1\n2026-10-29T09:00:30Z,1\nSummary,10',{epochSeconds:30}),/ISO/);
});
test('Overflow of finite counts and weighted light is rejected before serialization',()=>{
  for(const field of ['activity','lightLux']){
    const recording=clone(sample());
    for(const row of recording.rows)row[field]=1e308;
    assert.doesNotThrow(()=>validate(recording));
    assert.throws(()=>summarize(recording),/numeric total.*allowed range/);
  }
});
