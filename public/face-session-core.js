(() => {
  const method='face-session-v1',model='embeddinggemma-2:daa72c51243991dfcaf9f9137d2c573d8f7790c0:q4:768';
  const metrics=globalThis.MissionAppearanceCore.metrics;
  const finite=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
  const median=globalThis.MissionAppearanceCore.median;
  function vector(value){
    if(!Array.isArray(value)||value.length!==768||value.some(n=>!finite(n,-1.01,1.01)))return null;
    const norm=Math.hypot(...value);return Math.abs(norm-1)<=.05?value.map(n=>n/norm):null;
  }
  function average(vectors){
    if(!Array.isArray(vectors)||vectors.length<2||vectors.length>3)return null;
    const unit=vectors.map(v=>{if(!Array.isArray(v)||v.length!==768||v.some(n=>!Number.isFinite(n)))return null;const norm=Math.hypot(...v);return norm>1e-6&&Number.isFinite(norm)?v.map(n=>n/norm):null;});if(unit.some(v=>!v))return null;
    const mean=Array.from({length:768},(_,i)=>unit.reduce((sum,v)=>sum+v[i],0)/unit.length),norm=Math.hypot(...mean);
    return norm>1e-6?mean.map(n=>n/norm):null;
  }
  function descriptor(samples,cameraKey){
    if(!Array.isArray(samples)||samples.length<2||samples.length>3||!/^[a-f0-9]{64}$/.test(cameraKey||''))return null;
    if(samples.some(s=>!s||metrics.some(m=>!Number.isFinite(s.metrics?.[m.key]))||!['l','a','b','side'].every(k=>Number.isFinite(s.light?.[k]))||!['yaw','pitch','roll'].every(k=>Number.isFinite(s.pose?.[k]))||!Number.isFinite(s.distance)))return null;
    const values={};for(const m of metrics){const all=samples.map(s=>s.metrics[m.key]),center=median(all);values[m.key]={center,noise:Math.max(m.floor,1.4826*median(all.map(n=>Math.abs(n-center))))};}
    return {method,cameraKey,frames:samples.length,metrics:values,light:Object.fromEntries(['l','a','b','side'].map(k=>[k,median(samples.map(s=>s.light[k]))])),pose:Object.fromEntries(['yaw','pitch','roll'].map(k=>[k,median(samples.map(s=>s.pose[k]))])),distance:median(samples.map(s=>s.distance))};
  }
  function validate(input){
    if(!input||input.method!==method||!/^[a-f0-9]{64}$/.test(input.cameraKey||'')||!Number.isInteger(input.frames)||input.frames<2||input.frames>3)return null;
    const embedding=vector(input.vector);if(!embedding||!finite(input.distance,.05,1))return null;
    if(!['l','a','b','side'].every(k=>finite(input.light?.[k],k==='l'?0:k==='side'?-100:-128,k==='l'||k==='side'?100:128))||!['yaw','pitch','roll'].every(k=>finite(input.pose?.[k],-15,15)))return null;
    const values={};for(const m of metrics){const v=input.metrics?.[m.key];if(!finite(v?.center,m.relative ? .001 : -200,m.relative?10:200)||!finite(v?.noise,m.floor,200))return null;values[m.key]={center:v.center,noise:v.noise};}
    return {method,cameraKey:input.cameraKey,frames:input.frames,vector:embedding,metrics:values,light:{l:input.light.l,a:input.light.a,b:input.light.b,side:input.light.side},pose:{yaw:input.pose.yaw,pitch:input.pose.pitch,roll:input.pose.roll},distance:input.distance};
  }
  function compare(current,previous,reference=null){
    const result={method,status:'first_session',cosine:null,values:{},reference:null};
    if(!previous)return result;
    result.reference=reference;
    if(current.cameraKey!==previous.cameraKey)return {...result,status:'camera_changed'};
    if(Math.abs(current.distance/previous.distance-1)>.15||['yaw','pitch','roll'].some(k=>Math.abs(current.pose[k]-previous.pose[k])>5))return {...result,status:'conditions_changed'};
    const colorOk=Math.abs(current.light.l-previous.light.l)<=7&&Math.abs(current.light.a-previous.light.a)<=4&&Math.abs(current.light.b-previous.light.b)<=4&&Math.abs(current.light.side-previous.light.side)<=5;
    for(const m of metrics){
      const a=current.metrics[m.key],b=previous.metrics[m.key],difference=a.center-b.center;
      result.values[m.key]={valid:!m.color||colorOk,delta:m.relative?100*difference/b.center:difference,z:Math.abs(difference)/Math.max(a.noise,b.noise),unit:m.unit};
    }
    result.status=colorOk?'compared':'lighting_changed';
    if(colorOk)result.cosine=Math.max(-1,Math.min(1,current.vector.reduce((sum,n,i)=>sum+n*previous.vector[i],0)));
    return result;
  }
  function snapshot(input){
    if(!input||input.method!==method||!['first_session','compared','camera_changed','conditions_changed','lighting_changed'].includes(input.status))return null;
    const reference=input.reference;
    if(input.status!=='first_session'&&(!reference||!/^[a-f0-9-]{36}$/i.test(reference.id)||!Number.isFinite(Date.parse(reference.at))))return null;
    if(input.status==='first_session'&&reference)return null;
    if(input.status==='compared'?!finite(input.cosine,-1,1):input.cosine!==null)return null;
    const values={};for(const m of metrics){const v=input.values?.[m.key];if(!v)continue;if(typeof v.valid!=='boolean'||!Number.isFinite(v.delta)||!finite(v.z,0,1e8))return null;values[m.key]={valid:v.valid,delta:v.delta,z:v.z,unit:m.unit};}
    if(['compared','lighting_changed'].includes(input.status)&&metrics.some(m=>!values[m.key]))return null;
    const result={method,status:input.status,cosine:input.cosine,values,reference:reference?{id:reference.id,at:reference.at}:null};
    const age=globalThis.MissionApparentAgeCore?.validate(input.apparentAge);if(age)result.apparentAge=age;
    return result;
  }
  globalThis.MissionFaceSessionCore={method,model,vector,average,descriptor,validate,compare,snapshot};
})();
