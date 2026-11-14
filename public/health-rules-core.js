(function(root){
  'use strict';
  const version='pdf-prototype-v1',order=['NORMAL','ATTENTION','CRITICAL'];
  const fields={
    heart_rate:{unit:'bpm',min:1,max:300},spo2:{unit:'%',min:0,max:100},
    body_temperature:{unit:'C',min:20,max:50},skin_temperature:{unit:'C',min:20,max:50},
    bp_systolic:{unit:'mmHg',min:1,max:350},bp_diastolic:{unit:'mmHg',min:1,max:350},
    respiratory_rate:{unit:'/min',min:0,max:100},fatigue_index:{unit:'/100',min:0,max:100},stress_index:{unit:'/100',min:0,max:100},
    wellbeing:{unit:'/100',min:1,max:100},recovery:{unit:'/100',min:0,max:100},
    sleep_hours:{unit:'h',min:0,max:24},hrv:{unit:'ms',min:0,max:1000},steps:{unit:'steps',min:0,max:1e9},activity:{unit:'counts',min:0,max:1e9},light:{unit:'lx',min:0,max:1e9}
  };
  const groups={heart_rate:['heart_rate'],spo2:['spo2'],temperature:['body_temperature'],bp:['bp_systolic','bp_diastolic'],respiratory_rate:['respiratory_rate'],fatigue_stress:['fatigue_index','stress_index']};
  const names={heart_rate:'Heart rate',spo2:'SpO2',temperature:'Body temperature',bp:'Blood pressure',respiratory_rate:'Respiratory rate',fatigue_stress:'Fatigue/stress'};
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const plain=value=>value!==null&&Object.prototype.toString.call(value)==='[object Object]'&&!Array.isArray(value);
  function invalid(){throw new Error('invalid_health_snapshot');}
  function keys(value,allowed){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))invalid();}
  function time(value,now){
    if(typeof value!=='string')invalid();
    const parts=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
    if(!parts)invalid();
    const [,year,month,day,hour,minute,second,fraction,zone]=parts;
    if(+year<2000||+month<1||+month>12||+day<1||+day>31||+hour>23||+minute>59||+second>59)invalid();
    const calendar=new Date(Date.UTC(+year,+month-1,+day,+hour,+minute,+second,Number((fraction||'').padEnd(3,'0'))));
    if(calendar.getUTCFullYear()!==+year||calendar.getUTCMonth()!==+month-1||calendar.getUTCDate()!==+day)invalid();
    if(zone!=='Z'&&(+zone.slice(1,3)>14||+zone.slice(4,6)>59||+zone.slice(1,3)===14&&+zone.slice(4,6)!==0))invalid();
    const stamp=Date.parse(value);if(!Number.isFinite(stamp)||stamp<Date.UTC(2000,0,1)||stamp>now+300000)invalid();
    return new Date(stamp).toISOString();
  }
  function normalize(input,now=Date.now()){
    if(typeof now!=='number'||!Number.isFinite(now))invalid();
    keys(input,['profileId','capturedAt','actiwatchImportId','readings']);
    if(!own(input,'profileId')||input.profileId!=='personal'||!own(input,'capturedAt')||!own(input,'readings'))invalid();
    keys(input.readings,Object.keys(fields));
    const capturedAt=time(input.capturedAt,now),actiwatchImportId=own(input,'actiwatchImportId')?input.actiwatchImportId:null;
    if(actiwatchImportId!==null&&(typeof actiwatchImportId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actiwatchImportId)))invalid();
    const readings={};
    for(const [key,definition]of Object.entries(fields)){
      const value=own(input.readings,key)?input.readings[key]:null;
      if(value===null){readings[key]=null;continue;}
      keys(value,['value','unit','source','observedAt']);
      if(!own(value,'value')||typeof value.value!=='number'||!Number.isFinite(value.value)||value.value<definition.min||value.value>definition.max||!own(value,'unit')||value.unit!==definition.unit||!own(value,'source')||!['demo','manual','import'].includes(value.source))invalid();
      let observedAt=null;
      if(value.source==='demo'){if(own(value,'observedAt')&&value.observedAt!==null)invalid();}
      else{if(!own(value,'observedAt'))invalid();observedAt=time(value.observedAt,now);}
      readings[key]={value:value.value,unit:definition.unit,source:value.source,observedAt};
    }
    return {profileId:'personal',capturedAt,actiwatchImportId,readings};
  }
  function severity(key,value){
    if(key==='heart_rate')return value<40||value>120?'CRITICAL':value>=50&&value<=100?'NORMAL':'ATTENTION';
    if(key==='spo2')return value<90?'CRITICAL':value>=95?'NORMAL':'ATTENTION';
    if(key==='body_temperature')return value<35||value>38.5?'CRITICAL':value>=36&&value<=37.5?'NORMAL':'ATTENTION';
    if(key==='bp_systolic')return value<80||value>=180?'CRITICAL':value>=90&&value<140?'NORMAL':'ATTENTION';
    if(key==='bp_diastolic')return value<50||value>=110?'CRITICAL':value>=60&&value<90?'NORMAL':'ATTENTION';
    if(key==='respiratory_rate')return value<8||value>25?'CRITICAL':value>=12&&value<=20?'NORMAL':'ATTENTION';
    return value>=70?'ATTENTION':'NORMAL';
  }
  function evaluate(snapshot,now=Date.now()){
    const normalized=normalize(snapshot,now),parameters={},flags=[],missing=[],stale=[];
    const usable=reading=>reading!==null&&(reading.source==='demo'||now-Date.parse(reading.observedAt)<=900000);
    for(const [group,components]of Object.entries(groups)){
      const values={},missingComponents=[],staleComponents=[];let rank=-1;
      for(const key of components){
        const reading=normalized.readings[key],available=usable(reading);values[key]=available?reading.value:null;
        if(!available)missingComponents.push(key);
        if(reading!==null&&!available)staleComponents.push(key);
        if(available)rank=Math.max(rank,order.indexOf(severity(key,reading.value)));
      }
      const status=rank<0?'NO_SIGNAL':order[rank],available=components.filter(key=>values[key]!==null);
      let value=available.length?values[components[0]]:null;
      if(group==='bp')value=available.length?{systolic:values.bp_systolic,diastolic:values.bp_diastolic}:null;
      if(group==='fatigue_stress')value=available.length?Math.max(...available.map(key=>values[key])):null;
      parameters[group]={status,value,unit:fields[components[0]].unit,components:values,missingComponents,staleComponents,partial:available.length>0&&available.length<components.length};
      if(status==='NO_SIGNAL')missing.push(group);
      if(staleComponents.length)stale.push(group);
      if(rank>0)flags.push(group);
    }
    const complete=['heart_rate','spo2','temperature'].every(key=>parameters[key].status!=='NO_SIGNAL'),abnormalCount=flags.length,escalated=abnormalCount>=5;
    const rank=Math.max(0,...Object.values(parameters).map(parameter=>order.indexOf(parameter.status)));
    const status=escalated?'CRITICAL':!flags.length&&!complete?null:order[rank];
    return {version,status,parameters,flags,missing,stale,abnormalCount,combination:abnormalCount>=2,escalated,isDemo:Object.values(normalized.readings).some(reading=>reading?.source==='demo'),complete};
  }
  const number=value=>String(Math.round(value*1000)/1000);
  function parameterValue(parameter){
    if(parameter.value===null)return 'No signal';
    if(parameter.unit==='mmHg')return (parameter.value.systolic===null?'?':number(parameter.value.systolic))+'/'+(parameter.value.diastolic===null?'?':number(parameter.value.diastolic))+' mmHg';
    return number(parameter.value)+(parameter.unit==='%'?'%':parameter.unit==='C'?' C':' '+parameter.unit);
  }
  function ruleAlerts(rules){
    const alerts=[];
    for(const key of rules.flags){const parameter=rules.parameters[key];alerts.push(names[key]+': '+parameterValue(parameter)+' / '+(parameter.status==='CRITICAL'?'severe':'moderate')+' / Outside the illustrative range.');}
    for(const key of rules.missing)alerts.push(names[key]+': No signal / info / Check the sensor.');
    for(const [key,parameter]of Object.entries(rules.parameters))if(parameter.partial)alerts.push(names[key]+': Incomplete measurement / info / Missing '+parameter.missingComponents.join(', ')+'.');
    return alerts;
  }
  function notes(rules){
    const result=[];
    if(rules.combination)result.push('Several parameter groups are outside range at the same time: '+rules.flags.map(key=>names[key]).join(', ')+'.');
    if(rules.escalated)result.push('Five or more parameter groups are outside range, so the rule result is escalated to CRITICAL.');
    if(rules.missing.length)result.push('No signal: '+rules.missing.map(key=>names[key]).join(', ')+'. Check the missing sensors.');
    if(rules.stale.length)result.push('Stale readings: '+rules.stale.map(key=>names[key]).join(', ')+'.');
    const partial=Object.entries(rules.parameters).filter(([,parameter])=>parameter.partial).map(([key])=>names[key]);
    if(partial.length)result.push('Some measurement components are unavailable: '+partial.join(', ')+'.');
    if(!rules.complete)result.push('Core sensor data are incomplete; available normal readings do not establish an overall NORMAL status.');
    return result;
  }
  function fallback(rules){
    if(rules.status===null)return 'Insufficient current core sensor data to assign an overall status.';
    if(rules.status==='NORMAL')return 'The available core readings are within the illustrative demonstration ranges.';
    if(rules.status==='ATTENTION')return 'The supplied readings require human review against the illustrative demonstration ranges.';
    return 'The supplied readings require prompt human review under the illustrative demonstration rules.';
  }
  function agentResult(raw){
    if(typeof raw!=='string'||raw.length>65536)return null;
    let value;try{value=JSON.parse(raw);}catch{return null;}
    if(!plain(value)||Object.keys(value).length!==3||Object.keys(value).some(key=>!['status','alerts','summary'].includes(key))||!order.includes(value.status)||typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>4000||!Array.isArray(value.alerts)||value.alerts.length>16)return null;
    const alerts=[];
    for(const alert of value.alerts){
      if(typeof alert==='string'&&/^(?:mission[ _-]?time|provenance|is_demo|direct_sensor_connection)\s*:/i.test(alert.trim())||plain(alert)&&/^(?:mission[ _-]?time|provenance|is_demo|direct_sensor_connection)$/i.test(String(alert.parameter||'').trim()))continue;
      if(typeof alert==='string'){if(!alert.trim()||alert.length>2000)return null;alerts.push(alert.trim());continue;}
      if(!plain(alert)||Object.keys(alert).length!==5||Object.keys(alert).some(key=>!['parameter','value','severity','note','trend'].includes(key))||['parameter','severity','note','trend'].some(key=>typeof alert[key]!=='string'||!alert[key].trim()||alert[key].length>2000)||!['info','moderate','severe'].includes(alert.severity))return null;
      if(!(alert.value===null||typeof alert.value==='number'&&Number.isFinite(alert.value)||typeof alert.value==='string'&&alert.value.trim()&&alert.value.length<=2000))return null;
      const valueText=alert.value===null?'No signal':typeof alert.value==='number'?number(alert.value):alert.value.trim(),severityText=alert.value===null?'info':alert.severity;
      alerts.push(alert.parameter.trim()+': '+valueText+' / '+severityText+' / '+alert.note.trim()+' / '+alert.trend.trim());
    }
    return {status:value.status,alerts,summary:value.summary.trim()};
  }
  function mergeAgent(rules,rawJSONstring){
    const agent=agentResult(rawJSONstring),floor=rules.status===null?0:order.indexOf(rules.status);
    const downgradeBlocked=Boolean(agent&&order.indexOf(agent.status)<floor),normalWithoutCore=Boolean(agent&&agent.status==='NORMAL'&&!rules.complete),allowAgent=agent&&!downgradeBlocked&&!normalWithoutCore;
    let status=agent?order[Math.max(floor,order.indexOf(agent.status))]:rules.status;
    if(status==='NORMAL'&&!rules.complete)status=null;
    const alerts=[...new Set([...ruleAlerts(rules),...(allowAgent?agent.alerts:[])])].slice(0,16);
    const summary=[allowAgent?agent.summary:fallback(rules),...notes(rules),...(downgradeBlocked?['The agent\'s lower status was blocked by the rule result.']:[])].join(' ');
    return {status,alerts,summary,agentAvailable:Boolean(agent),agentStatus:agent?.status||null,downgradeBlocked,escalated:rules.escalated||status!==null&&order.indexOf(status)>floor,isDemo:rules.isDemo,complete:rules.complete};
  }
  root.MissionHealthRules={normalize,evaluate,mergeAgent};
})(globalThis);
