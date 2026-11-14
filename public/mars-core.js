(function(root){
  'use strict';
  const weights=Object.freeze({M:40,A:20,R:25,S:15}),version='mars-research-v1';
  const ranges={heart_rate:[40,50,100,120],spo2:[90,95,100,100],body_temperature:[35,36,37.5,38.5],bp_systolic:[80,90,140,180],bp_diastolic:[50,60,90,110],respiratory_rate:[8,12,20,25]};
  const limits={heart_rate:[1,300],spo2:[0,100],body_temperature:[20,50],skin_temperature:[20,50],bp_systolic:[1,350],bp_diastolic:[1,350],respiratory_rate:[0,100],hrv:[0,1000],sleep_hours:[0,24],fatigue_index:[0,100],stress_index:[0,100],recovery:[0,100],wellbeing:[1,100],steps:[0,1e9],activity:[0,1e9],light:[0,1e9]};
  const units={heart_rate:'bpm',spo2:'%',body_temperature:'C',skin_temperature:'C',bp_systolic:'mmHg',bp_diastolic:'mmHg',respiratory_rate:'/min',hrv:'ms',sleep_hours:'h',fatigue_index:'/100',stress_index:'/100',recovery:'/100',wellbeing:'/100',steps:'steps',activity:'counts',light:'lx'};
  const clamp=value=>Math.max(0,Math.min(100,value)),mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,round=value=>value===null?null:Math.round(value*10)/10;
  function rangeRisk(value,[outerLow,low,high,outerHigh]){return value<low?clamp((low-value)/Math.max(.0001,low-outerLow)*100):value>high?clamp((value-high)/Math.max(.0001,outerHigh-high)*100):0;}
  function deviation(value,prior){
    if(prior.length<3)return null;
    const average=mean(prior),sd=Math.sqrt(mean(prior.map(item=>(item-average)**2))),floor=Math.max(Math.abs(average)*.05,.01);
    return clamp(Math.abs(value-average)/Math.max(sd,floor)*25);
  }
  function calculate(input={},now=Date.now(),periodMs=86400000){
    if(!Number.isFinite(now)||!Number.isFinite(periodMs)||periodMs<=0)throw Error('invalid_mars_period');
    const start=now-periodMs,demo=Object.values(input.snapshot?.readings||{}).some(reading=>reading?.source==='demo'),series={},observations={};
    const snapshots=[...(input.records||[]).map(item=>item.snapshot),input.snapshot].filter(Boolean);
    for(const snapshot of snapshots){
      if(snapshot.profileId!=='personal')continue;
      for(const [key,reading]of Object.entries(snapshot.readings||{})){
        const bound=limits[key];if(!bound||!reading||reading.unit!==units[key]||!Number.isFinite(reading.value)||reading.value<bound[0]||reading.value>bound[1]||!['manual','import','demo'].includes(reading.source)||(reading.source==='demo')!==demo)continue;
        const at=Date.parse(demo?snapshot.capturedAt:reading.observedAt);if(!Number.isFinite(at)||at<start||at>now)continue;
        const rows=series[key]||=new Map();rows.set(at,{value:reading.value,unit:reading.unit,at,source:reading.source});
      }
    }
    for(const [key,rows]of Object.entries(series)){series[key]=[...rows.values()].sort((a,b)=>a.at-b.at);observations[key]=series[key].at(-1);}
    if(!demo&&input.checkin?.wellbeingScale===100&&Number.isInteger(input.checkin.score)&&input.checkin.score>=1&&input.checkin.score<=100&&Number.isFinite(input.checkin.at)&&input.checkin.at>=start&&input.checkin.at<=now&&(!observations.wellbeing||observations.wellbeing.at<input.checkin.at))observations.wellbeing={value:input.checkin.score,unit:'/100',at:input.checkin.at,source:'self-report'};
    const M=[],R=[],visual=[],audio=[],S=[],latest=key=>observations[key]?.value;
    for(const [key,range]of Object.entries(ranges))if(Number.isFinite(latest(key)))M.push({key,score:rangeRisk(latest(key),range)});
    for(const [key,group]of [['hrv',M],['steps',R],['activity',R]]){
      const rows=series[key]||[],last=rows.at(-1),prior=last?rows.slice(0,-1).filter(row=>row.source===last.source).map(row=>row.value):[],score=last?deviation(last.value,prior):null;
      if(score!==null)group.push({key,score});
    }
    for(const [key,convert]of [['fatigue_index',value=>value],['stress_index',value=>value],['recovery',value=>100-value],['sleep_hours',value=>clamp(Math.abs(8-value)/4*100)]])if(Number.isFinite(latest(key)))R.push({key,score:convert(latest(key))});
    if(Number.isFinite(latest('wellbeing')))S.push({key:'self_reported_wellbeing',score:100-latest('wellbeing')});
    if(demo&&input.social?.synthetic===true&&input.social.source==='preflight')for(const key of ['support','interaction'])if(Number.isFinite(input.social[key])&&input.social[key]>=0&&input.social[key]<=100)S.push({key:'preflight_'+key,score:100-input.social[key]});
    const media=(input.media||[]).filter(item=>(demo?item.synthetic===true&&item.source==='preflight':item.synthetic!==true)&&['audio','video'].includes(item.kind)&&Number.isFinite(Date.parse(item.createdAt))&&Date.parse(item.createdAt)>=start&&Date.parse(item.createdAt)<=now).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
    const videos=media.filter(item=>item.kind==='video'),face=videos.at(-1)?.features?.faceComparison;
    if(face?.status==='compared')for(const [key,value]of Object.entries(face.values||{}))if(value?.valid===true&&Number.isFinite(value.z)&&value.z>=0)visual.push({key,score:clamp(value.z*25)});
    const sounds=media.filter(item=>{const a=item.features?.acoustic;return a&&Number.isFinite(a.seconds)&&a.seconds>=3&&Number.isFinite(a.clipping)&&a.clipping>=0&&a.clipping<=.01&&Number.isFinite(a.level)&&a.level>=-120&&a.level<=1&&Number.isFinite(a.quiet)&&a.quiet>=0&&a.quiet<=1;});
    const sound=sounds.at(-1);
    if(sound)for(const key of ['level','quiet']){const score=deviation(sound.features.acoustic[key],sounds.slice(0,-1).filter(item=>item.kind===sound.kind).map(item=>item.features.acoustic[key]));if(score!==null)audio.push({key,score});}
    const group=(entries,total)=>({score:round(mean(entries.map(item=>item.score))),coverage:Math.min(1,entries.length/total),available:entries.length,total,indicators:entries.map(item=>({...item,score:round(item.score)}))});
    const A=[...(visual.length?[{key:'visual_baseline_change',score:mean(visual.map(item=>item.score))}]:[]),...(audio.length?[{key:'audio_baseline_change',score:mean(audio.map(item=>item.score))}]:[])];
    const groups={M:group(M,7),A:group(A,2),R:group(R,6),S:group(S,3)};
    let numerator=0,denominator=0;for(const [key,value]of Object.entries(groups))if(value.score!==null){const weight=weights[key]*value.coverage;numerator+=value.score*weight;denominator+=weight;}
    return {version,score:round(denominator?numerator/denominator:null),coverage:round(denominator),groups,isDemo:demo,period:{from:new Date(start).toISOString(),to:new Date(now).toISOString()},observations,mediaCount:media.length,visualObservations:videos.at(-1)?.features||null,audioObservations:sound?.features?.acoustic||null,weights};
  }
  function report(input={},now=Date.now(),periodMs=86400000){
    const current=calculate(input,now,periodMs),times=[...(input.records||[]).flatMap(item=>Object.values(item.snapshot?.readings||{}).map(reading=>Date.parse(reading?.observedAt))),...(input.media||[]).map(item=>Date.parse(item.createdAt))].filter(at=>Number.isFinite(at)&&at>=now-periodMs&&at<=now);
    const ordered=[...new Set(times)].sort((a,b)=>a-b),stride=Math.max(1,Math.ceil(ordered.length/80)),selected=ordered.filter((_,index)=>index%stride===0||index===ordered.length-1);
    const timeline=current.isDemo?[]:selected.map(at=>({at:new Date(at).toISOString(),score:calculate(input,at,periodMs).score})).filter(item=>item.score!==null);
    return {...current,timeline,delta:timeline.length>1?round(timeline.at(-1).score-timeline[0].score):null};
  }
  function crewScore(members,interactionRisk=null){
    const shared=(members||[]).filter(item=>item?.shared===true&&typeof item.id==='string'&&Number.isFinite(item.score)&&item.score>=0&&item.score<=100&&Number.isFinite(item.coverage)&&item.coverage>0&&item.coverage<=100),unique=[...new Map(shared.map(item=>[item.id,item])).values()];
    if(unique.length<2)return null;
    const value=unique.reduce((sum,item)=>sum+item.score*item.coverage,0)/unique.reduce((sum,item)=>sum+item.coverage,0);
    return {score:round(Number.isFinite(interactionRisk)&&interactionRisk>=0&&interactionRisk<=100?value*.8+interactionRisk*.2:value),members:unique.length,interactionIncluded:Number.isFinite(interactionRisk)&&interactionRisk>=0&&interactionRisk<=100};
  }
  root.MissionMARSCore=Object.freeze({version,weights,calculate,report,crewScore});
})(globalThis);
