import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const scope={};vm.runInNewContext(await readFile(new URL('../public/health-rules-core.js',import.meta.url),'utf8'),scope);
const {normalize,evaluate,mergeAgent}=scope.MissionHealthRules;
const now=Date.parse('2026-11-14T12:00:00.000Z'),stamp=new Date(now).toISOString();
const normal={heart_rate:[72,'bpm'],spo2:[98,'%'],body_temperature:[36.7,'C'],bp_systolic:[118,'mmHg'],bp_diastolic:[76,'mmHg'],respiratory_rate:[15,'/min'],fatigue_index:[20,'/100'],stress_index:[30,'/100']};
const clone=value=>JSON.parse(JSON.stringify(value));
function snapshot(values=normal,source='demo',observedAt=stamp){return {profileId:'personal',capturedAt:stamp,readings:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,value===null?null:{value:value[0],unit:value[1],source,observedAt:source==='demo'?null:observedAt}]))};}
const change=(field,value)=>snapshot({...normal,[field]:[value,normal[field][1]]});
const agent=(status,alerts=[],summary='Review the supplied readings.')=>JSON.stringify({status,alerts,summary});
const invalid=error=>error?.message==='invalid_health_snapshot';

test('Normalization fills absent channels, canonicalizes timestamps and does not change the input',()=>{
  const input=snapshot({heart_rate:[72,'bpm']},'manual','2026-11-14T14:00:00+02:00'),before=JSON.stringify(input),value=normalize(input,now);
  assert.equal(Object.keys(value.readings).length,16);assert.equal(value.readings.heart_rate.observedAt,stamp);assert.equal(value.readings.spo2,null);assert.equal(value.actiwatchImportId,null);assert.equal(JSON.stringify(input),before);
  value.readings.heart_rate.value=200;assert.equal(input.readings.heart_rate.value,72);
});

test('Only fixed snapshot and reading properties are accepted',()=>{
  for(const mutate of [value=>value.owner_id='other',value=>value.status='NORMAL',value=>value.profileId='jessica-meir',value=>value.readings.unknown={value:1,unit:'x',source:'demo'},value=>value.readings.heart_rate.diagnosis='unknown',value=>delete value.profileId,value=>delete value.capturedAt,value=>delete value.readings,value=>value.actiwatchImportId='bad']){const input=snapshot();mutate(input);assert.throws(()=>normalize(input,now),invalid);}
  assert.equal(normalize({...snapshot(),actiwatchImportId:'00000000-0000-0000-0000-000000000000'},now).actiwatchImportId,'00000000-0000-0000-0000-000000000000');
});

test('Unknown values stay null while numeric strings, booleans and nonfinite values are rejected',()=>{
  assert.equal(normalize(snapshot({heart_rate:null}),now).readings.heart_rate,null);
  for(const value of ['72',true,NaN,Infinity,-Infinity,undefined])assert.throws(()=>normalize(snapshot({heart_rate:[value,'bpm']}),now),invalid);
  for(const edit of [reading=>reading.unit='beats',reading=>reading.source='sensor',reading=>reading.value=null]){const input=snapshot();edit(input.readings.heart_rate);assert.throws(()=>normalize(input,now),invalid);}
});

test('All loose numeric limits are enforced independently of illustrative status ranges',()=>{
  const ranges={heart_rate:[1,300,'bpm'],spo2:[0,100,'%'],body_temperature:[20,50,'C'],skin_temperature:[20,50,'C'],bp_systolic:[1,350,'mmHg'],bp_diastolic:[1,350,'mmHg'],respiratory_rate:[0,100,'/min'],fatigue_index:[0,100,'/100'],stress_index:[0,100,'/100'],wellbeing:[1,100,'/100'],recovery:[0,100,'/100'],sleep_hours:[0,24,'h'],hrv:[0,1000,'ms'],steps:[0,1e9,'steps'],activity:[0,1e9,'counts'],light:[0,1e9,'lx']};
  for(const [key,[low,high,unit]]of Object.entries(ranges)){for(const value of [low,high])assert.equal(normalize(snapshot({[key]:[value,unit]}),now).readings[key].value,value);for(const value of [low-.001,high+.001])assert.throws(()=>normalize(snapshot({[key]:[value,unit]}),now),invalid);}
});

test('Observation times require a real ISO date and demo channels never acquire a timestamp',()=>{
  for(const time of [null,'invalid','2026-02-30T12:00:00Z','2026-11-14T24:00:00Z','2026-11-14T12:00:60Z','2026-11-14T12:00:00+14:01','1999-12-31T23:59:59Z',new Date(now+300001).toISOString()])assert.throws(()=>normalize(snapshot({heart_rate:[72,'bpm']},'manual',time),now),invalid);
  assert.equal(normalize(snapshot({heart_rate:[72,'bpm']},'manual',new Date(now+300000).toISOString()),now).readings.heart_rate.source,'manual');
  const demo=snapshot();delete demo.readings.heart_rate.observedAt;assert.equal(normalize(demo,now).readings.heart_rate.observedAt,null);demo.readings.heart_rate.observedAt=stamp;assert.throws(()=>normalize(demo,now),invalid);
  const manual=snapshot(normal,'import');delete manual.readings.heart_rate.observedAt;assert.throws(()=>normalize(manual,now),invalid);
});

const boundaries={
  heart_rate:[[39,'CRITICAL'],[40,'ATTENTION'],[49,'ATTENTION'],[50,'NORMAL'],[100,'NORMAL'],[101,'ATTENTION'],[120,'ATTENTION'],[121,'CRITICAL']],
  spo2:[[89,'CRITICAL'],[90,'ATTENTION'],[94,'ATTENTION'],[95,'NORMAL'],[100,'NORMAL']],
  body_temperature:[[34.999,'CRITICAL'],[35,'ATTENTION'],[35.9,'ATTENTION'],[35.95,'ATTENTION'],[36,'NORMAL'],[37.5,'NORMAL'],[37.55,'ATTENTION'],[37.6,'ATTENTION'],[38.5,'ATTENTION'],[38.501,'CRITICAL']],
  bp_systolic:[[79,'CRITICAL'],[80,'ATTENTION'],[89,'ATTENTION'],[90,'NORMAL'],[139,'NORMAL'],[139.99,'NORMAL'],[140,'ATTENTION'],[179,'ATTENTION'],[180,'CRITICAL']],
  bp_diastolic:[[49,'CRITICAL'],[50,'ATTENTION'],[59,'ATTENTION'],[60,'NORMAL'],[89,'NORMAL'],[89.99,'NORMAL'],[90,'ATTENTION'],[109,'ATTENTION'],[110,'CRITICAL']],
  respiratory_rate:[[7,'CRITICAL'],[8,'ATTENTION'],[11,'ATTENTION'],[12,'NORMAL'],[20,'NORMAL'],[21,'ATTENTION'],[25,'ATTENTION'],[26,'CRITICAL']],
  fatigue_index:[[0,'NORMAL'],[39,'NORMAL'],[40,'NORMAL'],[69,'NORMAL'],[70,'ATTENTION'],[100,'ATTENTION']],
  stress_index:[[0,'NORMAL'],[69,'NORMAL'],[70,'ATTENTION'],[100,'ATTENTION']]
};
for(const [field,values]of Object.entries(boundaries))test('Illustrative boundaries: '+field,()=>{
  const group=field.startsWith('bp_')?'bp':field.includes('_index')?'fatigue_stress':field==='body_temperature'?'temperature':field;
  for(const [value,expected]of values)assert.equal(evaluate(change(field,value),now).parameters[group].status,expected,field+'='+value);
});

test('Normal input has no alerts and the brief example produces four attention groups',()=>{
  const good=evaluate(snapshot(),now);assert.equal(good.version,'pdf-prototype-v1');assert.equal(good.status,'NORMAL');assert.equal(good.flags.length,0);assert.equal(good.complete,true);assert.equal(good.isDemo,true);
  const result=evaluate(snapshot({...normal,heart_rate:[112,'bpm'],spo2:[94,'%'],body_temperature:[38.1,'C'],bp_systolic:null,bp_diastolic:null,fatigue_index:[70,'/100']}),now);
  assert.equal(result.status,'ATTENTION');assert.deepEqual(clone(result.flags),['heart_rate','spo2','temperature','fatigue_stress']);assert.equal(result.abnormalCount,4);assert.equal(result.combination,true);assert.equal(result.escalated,false);assert.ok(result.missing.includes('bp'));
});

test('Blood-pressure components and fatigue/stress count as one group each',()=>{
  const result=evaluate(snapshot({...normal,bp_systolic:[180,'mmHg'],bp_diastolic:[111,'mmHg'],fatigue_index:[100,'/100'],stress_index:[100,'/100']}),now);
  assert.equal(result.status,'CRITICAL');assert.equal(result.abnormalCount,2);assert.equal(result.parameters.bp.status,'CRITICAL');assert.equal(result.parameters.fatigue_stress.value,100);assert.equal(result.escalated,false);
  const partial=evaluate(snapshot({...normal,bp_systolic:null,bp_diastolic:[110,'mmHg'],fatigue_index:null,stress_index:[70,'/100']}),now);assert.equal(partial.parameters.bp.status,'CRITICAL');assert.equal(partial.parameters.bp.partial,true);assert.equal(partial.parameters.fatigue_stress.status,'ATTENTION');assert.equal(partial.parameters.bp.value.systolic,null);
});

test('Five abnormal groups escalate while four groups do not',()=>{
  const values={...normal,heart_rate:[108,'bpm'],spo2:[94,'%'],body_temperature:[38,'C'],respiratory_rate:[23,'/min']};
  assert.equal(evaluate(snapshot(values),now).status,'ATTENTION');
  const result=evaluate(snapshot({...values,fatigue_index:[75,'/100']}),now);assert.equal(result.abnormalCount,5);assert.equal(result.status,'CRITICAL');assert.equal(result.escalated,true);
});

test('Missing core measurements never become normal and skin temperature cannot replace body temperature',()=>{
  const empty=evaluate(snapshot({}),now);assert.equal(empty.status,null);assert.equal(empty.complete,false);assert.equal(empty.abnormalCount,0);assert.equal(empty.missing.length,6);
  const onlySkin=evaluate(snapshot({heart_rate:[72,'bpm'],spo2:[98,'%'],skin_temperature:[39,'C'],wellbeing:[100,'/100'],recovery:[100,'/100']}),now);assert.equal(onlySkin.status,null);assert.equal(onlySkin.parameters.temperature.status,'NO_SIGNAL');assert.equal(onlySkin.parameters.temperature.value,null);assert.equal(onlySkin.flags.length,0);
  const flagged=evaluate(snapshot({spo2:[88,'%']}),now);assert.equal(flagged.complete,false);assert.equal(flagged.status,'CRITICAL');assert.deepEqual(clone(flagged.flags),['spo2']);
});

test('Only manual/import readings older than fifteen minutes become stale',()=>{
  for(const source of ['manual','import']){
    const edge=evaluate(snapshot(normal,source,new Date(now-900000).toISOString()),now);assert.equal(edge.complete,true);assert.equal(edge.status,'NORMAL');assert.equal(edge.stale.length,0);assert.equal(edge.isDemo,false);
    const stale=evaluate(snapshot(normal,source,new Date(now-900001).toISOString()),now);assert.equal(stale.status,null);assert.equal(stale.complete,false);assert.equal(stale.stale.length,6);assert.equal(stale.parameters.heart_rate.value,null);assert.equal(stale.abnormalCount,0);
  }
  assert.equal(evaluate(snapshot(),now+86400000).complete,true);
});

test('Stale components cannot hide a fresh critical component',()=>{
  const input=snapshot(normal,'manual');input.readings.bp_systolic.observedAt=new Date(now-900001).toISOString();input.readings.bp_diastolic.value=111;
  const result=evaluate(input,now);assert.equal(result.parameters.bp.status,'CRITICAL');assert.equal(result.parameters.bp.value.systolic,null);assert.ok(result.stale.includes('bp'));assert.ok(result.parameters.bp.missingComponents.includes('bp_systolic'));
});

test('Agent cannot lower rules and both string and structured alerts normalize to strings',()=>{
  const rules=evaluate(change('spo2',88),now),result=mergeAgent(rules,agent('NORMAL',[{parameter:'SpO2',value:'88%',severity:'severe',note:'Reduced',trend:'worsening'}]));
  assert.equal(result.agentAvailable,true);assert.equal(result.status,'CRITICAL');assert.ok(result.alerts.every(value=>typeof value==='string'));assert.ok(result.alerts.some(value=>value.includes('SpO2: 88%')&&value.includes('severe')));assert.equal(result.complete,true);assert.equal(result.isDemo,true);
  const elevated=mergeAgent(evaluate(snapshot(),now),agent('CRITICAL',['Combination needs review']));assert.equal(elevated.status,'CRITICAL');assert.equal(elevated.escalated,true);
});

test('Incomplete normal agent output retains a null overall status',()=>{
  const rules=evaluate(snapshot({heart_rate:[72,'bpm']}),now),result=mergeAgent(rules,agent('NORMAL'));
  assert.equal(result.agentAvailable,true);assert.equal(result.status,null);assert.equal(result.complete,false);assert.ok(result.summary.includes('No signal'));assert.ok(result.alerts.some(value=>value.includes('Check the sensor')));
  const flagged=mergeAgent(evaluate(snapshot({spo2:[94,'%']}),now),agent('NORMAL'));assert.equal(flagged.status,'ATTENTION');
});

test('Invalid agent JSON and unknown fields fall back to deterministic rules',()=>{
  const rules=evaluate(change('spo2',88),now),good={status:'NORMAL',alerts:[],summary:'Review.'};
  const invalidValues=['not JSON','```json\n'+JSON.stringify(good)+'\n```',JSON.stringify(null),JSON.stringify([]),JSON.stringify({...good,status:'UNKNOWN'}),JSON.stringify({...good,extra:true}),JSON.stringify({...good,summary:''}),JSON.stringify({...good,summary:'x'.repeat(4001)}),JSON.stringify({...good,alerts:Array(17).fill('Alert')}),JSON.stringify({...good,alerts:[4]}),JSON.stringify({...good,alerts:[{parameter:'SpO2',value:'88%',severity:'bad',note:'Reduced',trend:'worsening'}]}),JSON.stringify({...good,alerts:[{parameter:'SpO2',value:[88],severity:'severe',note:'Reduced',trend:'worsening'}]}),JSON.stringify({...good,alerts:[{parameter:'SpO2',value:'88%',severity:'severe',note:'Reduced',trend:'worsening',diagnosis:'unknown'}]})];
  for(const raw of invalidValues){const result=mergeAgent(rules,raw);assert.equal(result.agentAvailable,false);assert.equal(result.status,'CRITICAL');assert.ok(result.alerts.some(value=>value.includes('SpO2: 88%')));assert.ok(result.summary.includes('human review'));}
});

test('Missing and combination notes survive an otherwise valid agent summary',()=>{
  const values={...normal,heart_rate:[112,'bpm'],spo2:[94,'%'],body_temperature:[38.1,'C'],respiratory_rate:[22,'/min'],fatigue_index:[80,'/100'],bp_systolic:null,bp_diastolic:null};
  const rules=evaluate(snapshot(values),now),result=mergeAgent(rules,agent('NORMAL',[],'Review the supplied sample.'));
  assert.equal(result.status,'CRITICAL');assert.ok(result.summary.includes('Several parameter groups'));assert.ok(result.summary.includes('Five or more'));assert.ok(result.summary.includes('No signal: Blood pressure'));assert.equal(result.alerts.filter(value=>value.includes('Outside the illustrative range')).length,5);
});

test('All supported alert severities are accepted and rule alerts stay ahead of agent extras',()=>{
  const rules=evaluate(change('heart_rate',112),now),alerts=['info','moderate','severe'].map(severity=>({parameter:'Review',value:'Supplied observation',severity,note:'Context',trend:'steady'})),result=mergeAgent(rules,agent('ATTENTION',alerts));
  assert.equal(result.agentAvailable,true);assert.ok(result.alerts[0].startsWith('Heart rate:'));assert.equal(result.alerts.length,4);
  const capped=mergeAgent(rules,agent('ATTENTION',Array.from({length:16},(_,i)=>'Agent context '+i)));assert.equal(capped.alerts.length,16);assert.ok(capped.alerts[0].startsWith('Heart rate:'));
});

test('A contradictory agent downgrade preserves rules without retaining reassuring model text',()=>{
  const rules=evaluate(change('spo2',88),now),result=mergeAgent(rules,agent('NORMAL',['All measurements are normal.'],'The astronaut is healthy and all readings are normal.'));
  assert.equal(result.status,'CRITICAL');assert.equal(result.agentStatus,'NORMAL');assert.equal(result.agentAvailable,true);assert.equal(result.downgradeBlocked,true);
  assert.ok(result.summary.includes('human review'));assert.ok(result.summary.includes('lower status was blocked'));assert.ok(!result.summary.includes('healthy'));assert.ok(!result.summary.includes('all readings are normal'));
  assert.ok(result.alerts.some(value=>value.includes('SpO2: 88%')));assert.ok(!result.alerts.some(value=>value.includes('All measurements are normal')));
});

test('Normal agent prose cannot declare health when core data are incomplete',()=>{
  const rules=evaluate(snapshot({heart_rate:[72,'bpm']}),now),result=mergeAgent(rules,agent('NORMAL',['The other readings are normal.'],'Everything is healthy.'));
  assert.equal(result.status,null);assert.equal(result.agentStatus,'NORMAL');assert.equal(result.agentAvailable,true);assert.equal(result.downgradeBlocked,false);
  assert.ok(result.summary.includes('Insufficient'));assert.ok(!result.summary.includes('Everything is healthy'));assert.ok(!result.alerts.some(value=>value.includes('other readings are normal')));
  const fallback=mergeAgent(rules,'invalid');assert.equal(fallback.agentStatus,null);assert.equal(fallback.downgradeBlocked,false);
});

test('Live Azure numeric and null alert values are normalized without making missing data abnormal',()=>{
  const rules=evaluate(normalize(snapshot({...normal,spo2:[88,'%']}),now),now),result=mergeAgent(rules,JSON.stringify({status:'CRITICAL',alerts:[{parameter:'spo2',value:88,severity:'severe',note:'Below the supplied prototype range.',trend:'unknown'},{parameter:'bp',value:null,severity:'moderate',note:'Reading missing.',trend:'unknown'}],summary:'The supplied synthetic oxygen reading is outside range.'}));
  assert.equal(result.agentAvailable,true);assert.equal(result.agentStatus,'CRITICAL');assert.equal(result.status,'CRITICAL');assert.ok(result.alerts.some(value=>value.includes('spo2: 88 / severe')));assert.ok(result.alerts.some(value=>value.includes('bp: No signal / info')));
  const invalid=mergeAgent(rules,JSON.stringify({status:'CRITICAL',alerts:[{parameter:'spo2',value:{value:88},severity:'severe',note:'Invalid nested data.',trend:'unknown'}],summary:'Invalid fixture.'}));assert.equal(invalid.agentAvailable,false);assert.equal(invalid.status,'CRITICAL');
});
