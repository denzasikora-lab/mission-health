import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const scope={};vm.runInNewContext(await readFile(new URL('../public/mars-core.js',import.meta.url),'utf8'),scope);const core=scope.MissionMARSCore;
const now=Date.parse('2026-11-14T12:00:00Z'),day=86400000;
const snapshot=(values,at=now,source='manual',profileId='personal')=>({profileId,capturedAt:new Date(at).toISOString(),readings:Object.fromEntries(Object.entries(values).map(([key,[value,unit]])=>[key,{value,unit,source,observedAt:source==='demo'?null:new Date(at).toISOString()}]))});
const audio=(at,level=-24,quiet=.2,clipping=0,kind='audio')=>({kind,createdAt:new Date(at).toISOString(),features:{acoustic:{seconds:5,level,quiet,clipping}}});
test('MARS has no score for missing inputs, rather than assigning a healthy zero',()=>{
  const value=core.calculate({},now,day);assert.equal(value.score,null);assert.equal(value.coverage,0);for(const group of Object.values(value.groups))assert.equal(group.score,null);
});
test('MARS uses explicit weights and available coverage without inventing unavailable modalities',()=>{
  const value=core.calculate({snapshot:snapshot({heart_rate:[110,'bpm'],fatigue_index:[20,'/100'],wellbeing:[80,'/100']})},now,day);
  const denominator=40/7+25/6+15/3,expected=(50*40/7+20*25/6+20*15/3)/denominator;
  assert.equal(value.score,Math.round(expected*10)/10);assert.equal(value.coverage,Math.round(denominator*10)/10);assert.equal(value.groups.A.score,null);assert.equal(value.groups.S.available,1);
});
test('MARS excludes wrong units, future observations, expired readings and another profile',()=>{
  for(const input of [snapshot({heart_rate:[72,'ms']}),snapshot({heart_rate:[72,'bpm']},now+1),snapshot({heart_rate:[72,'bpm']},now-day-1),snapshot({heart_rate:[72,'bpm']},now,'manual','jessica')])assert.equal(core.calculate({snapshot:input},now,day).score,null);
});
test('Examples remain isolated from actual readings, recordings and personal check-ins',()=>{
  const value=core.calculate({snapshot:snapshot({fatigue_index:[30,'/100']},now,'demo'),records:[{snapshot:snapshot({heart_rate:[160,'bpm']})}],media:[audio(now)],checkin:{score:1,wellbeingScale:100,at:now}},now,day);
  assert.equal(value.isDemo,true);assert.equal(value.score,30);assert.equal(value.groups.M.score,null);assert.equal(value.groups.S.score,null);assert.equal(value.mediaCount,0);
});
test('HRV and activity require three prior comparable records and ignore duplicate snapshots',()=>{
  const records=[3,2,1].map(i=>({snapshot:snapshot({hrv:[40,'ms'],steps:[1000,'steps']},now-i*1000)})),current=snapshot({hrv:[44,'ms'],steps:[1100,'steps']});
  const enough=core.calculate({snapshot:current,records:[...records,{snapshot:current}]},now,day);assert.equal(enough.groups.M.score,50);assert.equal(enough.groups.R.score,50);
  const fewer=core.calculate({snapshot:current,records:records.slice(1)},now,day);assert.equal(fewer.score,null);
  const foreign=records.map(item=>({snapshot:snapshot({hrv:[40,'ms']},Date.parse(item.snapshot.capturedAt),'import')}));assert.equal(core.calculate({snapshot:current,records:foreign},now,day).groups.M.score,null);
});
test('Comparable recordings contribute voice and face changes, not emotion similarity or apparent age',()=>{
  const video={kind:'video',createdAt:new Date(now).toISOString(),features:{faceComparison:{status:'compared',values:{underEye:{valid:true,z:2}}},apparentAge:{range:{min:40,max:49}},tone:[{label:'tense',similarity:.9}]}},media=[audio(now-3000),audio(now-2000),audio(now-1000),audio(now,-20,.25),video],value=core.calculate({media},now,day);
  assert.equal(value.groups.A.available,2);assert.equal(value.mediaCount,5);assert.equal(value.visualObservations.apparentAge.range.min,40);assert.ok(value.groups.A.indicators.every(item=>!item.key.includes('age')&&!item.key.includes('tone')));
  assert.equal(core.calculate({media:[{...video,features:{apparentAge:video.features.apparentAge,tone:video.features.tone}}]},now,day).score,null);
  assert.equal(core.calculate({media:[audio(now,0,.1,.1)]},now,day).groups.A.score,null);
});
test('Reports follow the selected period and expose observed changes',()=>{
  const input={records:[{snapshot:snapshot({heart_rate:[110,'bpm']},now-7200000)},{snapshot:snapshot({heart_rate:[70,'bpm']},now-1000)}]};
  const broad=core.report(input,now,day),narrow=core.report(input,now,60000);assert.equal(broad.timeline.length,2);assert.equal(broad.delta,-50);assert.equal(narrow.timeline.length,1);assert.equal(narrow.delta,null);
});
test('A crew score requires two distinct shared member scores and a separate optional interaction rating',()=>{
  const a={id:'one',shared:true,score:20,coverage:50},b={id:'two',shared:true,score:40,coverage:50};assert.equal(core.crewScore([a,{...b,shared:false}]),null);assert.equal(core.crewScore([a,a]),null);assert.equal(core.crewScore([a,b]).score,30);assert.equal(core.crewScore([a,b],80).score,40);assert.equal(core.crewScore([a,b],80).interactionIncluded,true);
});
test('Preflight fills all four MARS groups and every visual feature with explicitly synthetic inputs',async()=>{
  const scenarioScope={};vm.runInNewContext(await readFile(new URL('../public/analysis-samples.js',import.meta.url),'utf8'),scenarioScope);
  const scenario=scenarioScope.MissionPreflightCore.create(now),score=core.calculate(scenario,now,60000);
  assert.equal(score.coverage,100);assert.ok(Number.isFinite(score.score)&&score.score>0&&score.score<50);assert.ok(Object.values(score.groups).every(group=>group.coverage===1&&group.score!==null));
  assert.equal(Object.keys(scenario.visual.deltas).length,12);assert.ok(Object.values(scenario.snapshot.readings).every(reading=>reading.source==='demo'));assert.ok(scenario.media.every(item=>item.synthetic&&item.source==='preflight'));
  assert.equal(scenario.records.length,12);assert.equal(core.crewScore(scenario.crew,100-scenario.social.interaction).members,4);
  const actual=core.calculate({...scenario,snapshot:snapshot({heart_rate:[76,'bpm']})},now,60000);assert.equal(actual.groups.A.score,null);assert.equal(actual.groups.S.score,null);assert.equal(actual.mediaCount,0);
});
