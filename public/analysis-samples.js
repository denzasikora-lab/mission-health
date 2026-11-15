(function(root){
  const deltas={width:.7,balance:.3,underEye:1.4,redness:.8,height:.4,jawWidth:.6,lowerFace:.5,eyeOpening:-.8,eyeBalance:.2,mouthWidth:.4,toneBalance:.6,underEyeBalance:.5};
  const visual={deltas,age:{min:35,max:44},skin:{newCount:1,changedCount:0},cosine:.982};
  const transcript='Hello crew. I can hear you clearly. How are you feeling today? I slept well and I am ready for our next check in. This is a simulated preflight rehearsal.';
  function create(now=Date.now(),provided=null){
    const units={heart_rate:'bpm',spo2:'%',body_temperature:'C',skin_temperature:'C',bp_systolic:'mmHg',bp_diastolic:'mmHg',respiratory_rate:'/min',fatigue_index:'/100',stress_index:'/100',wellbeing:'/100',recovery:'/100',sleep_hours:'h',hrv:'ms',steps:'steps',activity:'counts',light:'lx'};
    const values={heart_rate:76,spo2:98,body_temperature:36.8,skin_temperature:34.2,bp_systolic:116,bp_diastolic:74,respiratory_rate:16,fatigue_index:36,stress_index:30,wellbeing:78,recovery:76,sleep_hours:7.2,hrv:46,steps:6200,activity:31000,light:340};
    for(const key of Object.keys(values))if(provided?.readings?.[key]?.source==='demo'&&Number.isFinite(provided.readings[key].value))values[key]=provided.readings[key].value;
    const snapshot=(at,prior=false)=>({profileId:'personal',capturedAt:new Date(at).toISOString(),actiwatchImportId:null,readings:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value:prior?({hrv:51,steps:6500,activity:32500}[key]??value):value,unit:units[key],source:'demo',observedAt:null}]))});
    const records=Array.from({length:12},(_,index)=>({snapshot:snapshot(now-(12-index)*15000,true)})),media=[3,2,1,0].map(index=>({kind:'audio',synthetic:true,source:'preflight',createdAt:new Date(now-index*12000).toISOString(),transcript,features:{acoustic:{seconds:9.2035,level:index?-16.1:-15.806,quiet:index ? .08 : .086022,clipping:0}}}));
    media.push({kind:'video',synthetic:true,source:'preflight',createdAt:new Date(now).toISOString(),features:{faceComparison:{status:'compared',cosine:visual.cosine,values:Object.fromEntries(Object.entries(deltas).map(([key,delta])=>[key,{valid:true,delta,z:Math.abs(delta)*.8}]))},apparentAge:{range:visual.age},skin:{status:'compared',...visual.skin}}});
    const crew=[12,15,11,14].map((score,index)=>({id:'preflight-crew-'+index,shared:true,synthetic:true,score,coverage:100}));
    return {synthetic:true,source:'preflight',snapshot:snapshot(now),records,media,social:{synthetic:true,source:'preflight',support:76,interaction:80},crew,visual,transcript};
  }
  root.MissionPreflightCore=Object.freeze({create,visual,transcript});
  if(root.window)root.window.missionAnalysisSamples=Object.freeze({visual,audio:Promise.resolve([])});
})(globalThis);
