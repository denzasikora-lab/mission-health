(function(root){
  const metrics={sleep_hours:['Sleep','h'],heart_rate:['Pulse','bpm'],spo2:['SpO2','%'],body_temperature:['Body temperature','C'],hrv:['HRV','ms'],recovery:['Recovery','/100'],wellbeing:['Wellbeing','/100'],fatigue_index:['Fatigue','/100']};
  const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  function personalSeries(snapshot,records,key,days=7){
    const selected=snapshot?.readings?.[key];if(!selected||!Number.isFinite(selected.value)||selected.unit!==metrics[key]?.[1])return {points:[],baseline:null,current:null,delta:null,source:null,unit:metrics[key]?.[1]||''};
    const end=Date.parse(snapshot.capturedAt),start=end-days*86400000,seen=new Map();
    for(const item of [...records,{snapshot}]){
      const s=item.snapshot,r=s?.readings?.[key],at=Date.parse(r?.observedAt||s?.capturedAt);
      if(!r||!Number.isFinite(r.value)||r.source!==selected.source||r.unit!==selected.unit||!Number.isFinite(at)||at<start||at>end)continue;
      seen.set(at,{at,value:r.value,source:r.source});
    }
    const points=[...seen.values()].sort((a,b)=>a.at-b.at),prior=points.slice(0,-1),baseline=mean(prior.slice(0,Math.max(1,Math.min(3,prior.length))).map(p=>p.value)),current=points.at(-1)?.value??null;
    return {points,baseline,current,delta:baseline===null||current===null?null:current-baseline,source:selected.source,unit:selected.unit};
  }
  function sourceSeries(source,participant,key){
    if(source.key==='sleep')return source.rows.filter(r=>r.participant===participant).map(r=>({label:(r.phase==='PRE_TEST'?'PRE ':r.phase==='POST_TEST'?'POST ':'BR ')+r.day,value:r[key],phase:r.phase}));
    if(source.key==='exercise')return source.rows.filter(r=>r.group===participant).sort((a,b)=>['PRE_TEST','IN_TEST','POST_TEST'].indexOf(a.phase)-['PRE_TEST','IN_TEST','POST_TEST'].indexOf(b.phase)||a.trial-b.trial).map(r=>({label:r.phase.replace('_TEST','')+' '+r.trial,value:r.value,phase:r.phase}));
    return source.rows.filter(r=>r.astronaut_id===participant).map(r=>({label:r.timepoint,value:r[key],phase:r.phase}));
  }
  function baseline(points){return mean(points.filter(p=>['PRE_TEST','preflight'].includes(p.phase)&&Number.isFinite(p.value)).map(p=>p.value));}
  function studyContext(data,selection,topic){
    const defaults={recovery:{source:'sleep',participant:'C1G0001',metric:'sleep_hours'},blood:{source:'cbc',participant:'C001',metric:'hemoglobin_g_dl'},behavior:{source:'journals'}};
    const choice=selection||defaults[topic],source=data.sources.find(s=>s.key===choice?.source&&s.topic===topic);if(!source)throw Error('invalid_study');
    if(source.key==='journals')return {title:source.title,url:source.url,setting:source.setting,themes:source.themes};
    const ids=source.participants||source.groups||['C001','C002','C003','C004'];if(!ids.includes(choice.participant))throw Error('invalid_study');
    const units=source.key==='sleep'?{sleep_hours:'h',latency_minutes:'min',efficiency_percent:'%'}:source.key==='exercise'?{value:'W/kg'}:Object.fromEntries(source.metrics.map(m=>[m.key,m.unit]));
    if(!Object.hasOwn(units,choice.metric))throw Error('invalid_study');
    const points=sourceSeries(source,choice.participant,choice.metric),reference=baseline(points),latest=points.filter(p=>Number.isFinite(p.value)).at(-1)?.value??null;
    return {title:source.title,url:source.url,setting:source.setting,participant:choice.participant,metric:choice.metric,unit:units[choice.metric],baseline:reference,latest,delta:reference===null||latest===null?null:latest-reference,points};
  }
  function lexicalEvidence(data,query,topic){
    const words=[...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g)||[])];
    return data.evidence.filter(e=>!topic||e.topic===topic||e.topics?.includes(topic)).map(e=>({entry:e,score:words.reduce((n,w)=>n+Number((e.title+' '+e.text).toLowerCase().includes(w)),0)})).sort((a,b)=>b.score-a.score).slice(0,3).map(e=>e.entry);
  }
  root.MissionResearchCore=Object.freeze({metrics,mean,personalSeries,sourceSeries,baseline,studyContext,lexicalEvidence});
})(globalThis);
