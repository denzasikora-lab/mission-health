(() => {
  const minute=60000,day=86400000;
  const periods=[{id:'1m',label:'1 min',name:'1 minute',ms:minute},{id:'1h',label:'1 h',name:'1 hour',ms:60*minute},{id:'24h',label:'24 h',name:'24 hours',ms:day},{id:'7d',label:'7 days',name:'7 days',ms:7*day},{id:'1mo',label:'Month',name:'30 days',ms:30*day},{id:'1y',label:'Year',name:'365 days',ms:365*day}];
  const metrics={hr:{reading:'heart_rate',name:'Pulse',unit:'bpm',digits:1},spo2:{reading:'spo2',name:'SpO₂',unit:'%',digits:1},temp:{reading:'skin_temperature',name:'Skin temperature',unit:'°C',digits:2},bodyTemp:{reading:'body_temperature',name:'Body temperature',unit:'°C',digits:2},wellbeing:{reading:'wellbeing',name:'Wellbeing',unit:'/100',digits:1},sleep:{reading:'sleep_hours',name:'Sleep in recorded 24 h',unit:'h',digits:2},hrv:{reading:'hrv',name:'HRV',unit:'ms',digits:1},respiration:{reading:'respiratory_rate',name:'Respiration',unit:'/min',digits:1},pressure:{reading:'bp_systolic',name:'Blood pressure / systolic',unit:'mmHg',digits:1},recovery:{reading:'recovery',name:'Reported recovery',unit:'/100',digits:1},fatigue:{reading:'fatigue_index',name:'Reported fatigue',unit:'/100',digits:1},stress:{reading:'stress_index',name:'Reported stress',unit:'/100',digits:1},steps:{reading:'steps',name:'Steps',unit:'steps',digits:0},activity:{reading:'activity',name:'Movement in recorded 24 h',unit:'counts',digits:0},light:{reading:'light',name:'Mean light in recorded 24 h',unit:'lx',digits:1}};
  const sources=new Set(['manual','import','imported','actiwatch','device','sensor','self_report']);
  const sampleRanges={heart_rate:[55,100,3,0],spo2:[95,100,.5,1],body_temperature:[36.4,37.5,.12,2],skin_temperature:[31.5,36.5,.2,2],bp_systolic:[96,128,4,0],bp_diastolic:[60,84,3,0],respiratory_rate:[11,20,1,0],fatigue_index:[5,50,8,0],stress_index:[5,48,8,0],wellbeing:[60,98,6,0],recovery:[55,98,6,0],sleep_hours:[5.5,9.5,.7,1],hrv:[22,80,5,0],steps:[1000,12500,1400,0],activity:[3000,90000,6500,0],light:[50,850,120,0]};
  function sampleValue(snapshot,key,at){
    const reading=snapshot?.readings?.[key],range=sampleRanges[key],anchor=Date.parse(snapshot?.capturedAt);if(!range||reading?.source!=='demo'||!Number.isFinite(reading.value)||!Number.isFinite(anchor)||!Number.isFinite(at))return null;
    if(!['heart_rate','spo2','body_temperature','skin_temperature','bp_systolic','bp_diastolic','respiratory_rate','hrv'].includes(key))return reading.value;
    let seed=2166136261;for(const char of snapshot.capturedAt+':'+key)seed=Math.imul(seed^char.charCodeAt(0),16777619);const phase=(seed>>>0)/4294967296*Math.PI*2;
    const signal=time=>.12*Math.sin(time/17000+phase)+.18*Math.sin(time/240000+phase)+.3*Math.sin(time/5400000+phase)+.4*Math.sin(time/(2*day)+phase);
    const value=Math.max(range[0],Math.min(range[1],reading.value+range[2]*(signal(at)-signal(anchor))));return Number(value.toFixed(range[3]));
  }
  function sampleSnapshot(snapshot,now=Date.now()){
    const readings={};for(const [key,reading]of Object.entries(snapshot.readings||{})){const value=sampleValue(snapshot,key,now);readings[key]=value===null?reading?{...reading}:null:{...reading,value};}
    if(readings.bp_systolic&&readings.bp_diastolic)readings.bp_diastolic.value=Math.min(readings.bp_diastolic.value,readings.bp_systolic.value-24);
    return {...snapshot,capturedAt:new Date(now).toISOString(),readings};
  }
  function sampleHistory(key,snapshot,period,now=Date.now()){
    if(!metrics[key]||!periods.some(value=>value.id===period?.id&&value.ms===period.ms)||sampleValue(snapshot,metrics[key].reading,now)===null)return [];
    const steps=period.id==='1y'?365:period.id==='1mo'?120:period.id==='7d'?112:period.id==='24h'?96:60,points=[];
    for(let index=0;index<=steps;index++){const at=now-period.ms+Math.round(period.ms*index/steps);points.push({at,value:sampleValue(snapshot,metrics[key].reading,at),sourceKey:'generated:'+snapshot.capturedAt,sourceName:'Generated sample',maxGapMs:period.ms/steps*1.5});}return points;
  }
  const lowerBound=(values,target,end=values.length)=>{let start=0;while(start<end){const middle=(start+end)>>1;if(values[middle]<target)start=middle+1;else end=middle;}return start;};
  function observation(reading,now,sourceName='Saved reading'){
    const at=Date.parse(reading?.observedAt);
    return Number.isFinite(reading?.value)&&sources.has(reading.source)&&Number.isFinite(at)&&at<=now?{at,value:reading.value,sourceName,sourceKey:reading.source+':'+sourceName}:null;
  }
  function watchSeries(input){
    const result={sleep_hours:[],activity:[],light:[]};let recording;
    try{recording=globalThis.MissionActiwatch.validate(input);}catch{return result;}
    const rows=recording.rows,duration=recording.epochSeconds*1000,seconds=recording.epochSeconds,times=rows.map(row=>Date.parse(row.timestamp));
    const sums=Object.fromEntries(['activity','activityEpochs','sleep','scored','light','lightSeconds'].map(key=>[key,new Float64Array(rows.length+1)]));
    const usable=row=>!row.excluded&&row.offWrist!==true,activity=row=>usable(row)&&row.activity!==null,sleep=row=>activity(row)&&row.sleepState!=='unknown',light=row=>usable(row)&&row.lightLux!==null;
    for(let index=0;index<rows.length;index++){
      const row=rows[index],a=activity(row),s=sleep(row),l=light(row);
      const increment={activity:a?row.activity:0,activityEpochs:a?1:0,sleep:s&&row.sleepState==='sleep'?seconds:0,scored:s?seconds:0,light:l?row.lightLux*seconds:0,lightSeconds:l?seconds:0};
      for(const key of Object.keys(sums)){sums[key][index+1]=sums[key][index]+increment[key];if(!Number.isFinite(sums[key][index+1]))return {sleep_hours:[],activity:[],light:[]};}
      const at=times[index]+duration,start=at-day,first=lowerBound(times,start,index+1),values=Object.fromEntries(Object.keys(sums).map(key=>[key,sums[key][index+1]-sums[key][first]]));
      if(first>0){const prior=rows[first-1],overlap=Math.max(0,(times[first-1]+duration-start)/1000);if(overlap>0){if(sleep(prior)){values.scored+=overlap;if(prior.sleepState==='sleep')values.sleep+=overlap;}if(light(prior)){values.light+=prior.lightLux*overlap;values.lightSeconds+=overlap;}}}
      const gap=index===0||times[index]>times[index-1]+duration;
      for(const [key,value,valid,previousValid]of [['activity',values.activityEpochs?values.activity:null,a,index>0&&activity(rows[index-1])],['sleep_hours',values.scored?values.sleep/3600:null,s,index>0&&sleep(rows[index-1])],['light',values.lightSeconds?values.light/values.lightSeconds:null,l,index>0&&light(rows[index-1])]])result[key].push({at,value:valid?value:null,gapBefore:gap||!valid||!previousValid,maxGapMs:duration*1.5});
    }
    return result;
  }
  function history(key,{records=[],current=null,watch=null,recording=null,watchPoints=null,selfReports=[]}={},now=Date.now()){
    const config=metrics[key];if(!config)return [];
    const readingKey=config.reading,values=new Map(),imported=current?.source==='import'&&watch&&['sleep_hours','activity','light'].includes(readingKey);
    const add=point=>{if(point&&Number.isFinite(point.at)&&point.at<=now&&(point.value===null||Number.isFinite(point.value)))values.set(point.at,{...point});};
    if(imported){for(const point of (watchPoints||watchSeries(recording))[readingKey]||[])add({...point,sourceName:'Actiwatch CSV / '+watch.filename,sourceKey:'watch:'+watch.id});}
    else{
      for(const record of [...records].reverse())add(observation(record.snapshot?.readings?.[readingKey],now,record.sourceName||'Manual entry'));
      if(key==='wellbeing')for(const report of selfReports)add(observation(report,now,'Self-report'));
    }
    const matching=[...records].find(record=>{const value=record.snapshot?.readings?.[readingKey];return value?.observedAt===current?.observedAt&&value?.value===current?.value;});
    const point=observation(current,now,imported?'Actiwatch CSV / '+watch.filename:matching?.sourceName||'Current saved reading');
    if(point){const existing=values.get(point.at);if(!existing||existing.value!==point.value)add({...point,sourceKey:imported?'watch:'+watch.id:point.sourceKey,gapBefore:true});}
    return [...values.values()].sort((left,right)=>left.at-right.at);
  }
  function statistics(points){
    const valid=points.filter(point=>Number.isFinite(point.value));if(!valid.length)return null;
    const last=valid.at(-1),prior=valid.slice(0,-1).filter(point=>point.sourceKey===last.sourceKey);
    let average=0,variance=0;for(let index=0;index<prior.length;index++){const delta=prior[index].value-average;average+=delta/(index+1);variance+=delta*(prior[index].value-average);}
    const sd=prior.length>1?Math.sqrt(variance/(prior.length-1)):null,z=Number.isFinite(sd)?sd>0?Math.abs(last.value-average)/sd:last.value===average?0:Infinity:null;
    return {count:valid.length,delta:valid.length>1?last.value-valid[0].value:null,average:prior.length?average:null,sd,z,level:prior.length<3||z===null?'neutral':z<2?'green':z<3?'amber':'red'};
  }
  function segments(points,period){
    const result=[];let previous=null;
    for(const point of points){if(point.value===null){previous=null;continue;}const gap=point.gapBefore||!previous||point.sourceKey!==previous.sourceKey||point.at-previous.at>(point.maxGapMs||previous.maxGapMs||period.ms/4);if(gap)result.push([]);result.at(-1).push(point);previous=point;}
    return result;
  }
  function sample(segment,limit=500){
    if(segment.length<=limit)return segment;
    const output=[segment[0]],buckets=Math.max(1,Math.floor((limit-2)/2)),width=(segment.length-2)/buckets;
    for(let bucket=0;bucket<buckets;bucket++){const from=1+Math.floor(bucket*width),to=Math.min(segment.length-1,1+Math.floor((bucket+1)*width));let low=from,high=from;for(let index=from;index<to;index++){if(segment[index].value<segment[low].value)low=index;if(segment[index].value>segment[high].value)high=index;}for(const index of [...new Set([low,high])].sort((a,b)=>a-b))output.push(segment[index]);}
    output.push(segment.at(-1));return output;
  }
  globalThis.MissionHomeTrendData=Object.freeze({periods,metrics,observation,watchSeries,history,statistics,segments,sample,sampleValue,sampleSnapshot,sampleHistory});
  const home=document.getElementById('mission-home'),bodyPanel=home?.querySelector('.home-body-panel');if(!bodyPanel)return;
  const cards=[...bodyPanel.querySelectorAll('[data-home-metric]')].filter(card=>metrics[card.dataset.homeMetric]);if(!cards.length)return;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;},owner=()=>window.missionProfileName?.identity?.storageScope||null;
  const panel=make('section','home-trends panel glass');panel.id='home-trends';panel.setAttribute('aria-labelledby','home-trend-heading');
  const header=make('header','home-trend-heading'),heading=make('h2'),reading=make('span','home-trend-reading');heading.id='home-trend-heading';header.append(heading,reading);
  const controls=make('div','home-trend-periods');controls.setAttribute('role','group');controls.setAttribute('aria-label','Trend period');for(const period of periods){const button=make('button','',period.label);button.type='button';button.dataset.trendPeriod=period.id;button.setAttribute('aria-label',period.name);controls.append(button);}
  const graph=make('div','home-trend-graph'),yAxis=make('div','home-trend-yaxis'),plot=make('div','home-trend-plot'),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');graph.id='home-trend-chart';yAxis.setAttribute('aria-hidden','true');svg.setAttribute('viewBox','0 0 800 210');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');
  const dot=make('span','home-trend-dot');dot.setAttribute('aria-hidden','true');plot.append(svg,dot);const empty=make('p','home-trend-empty');graph.append(yAxis,plot,empty);const xAxis=make('div','home-trend-xaxis');xAxis.setAttribute('aria-hidden','true');
  const legend=make('div','home-trend-legend'),source=make('span','home-trend-source'),meaning=make('span','','Actual observations / time gaps are not filled');legend.append(source,meaning);legend.title='Color compares the latest observation with at least three earlier observations from the same source. This is a descriptive personal baseline, not a medical range.';panel.append(header,controls,graph,xAxis,legend);bodyPanel.after(panel);
  let selected='hr',periodId='24h',scheduled=0,minuteTimer=0,suspended=false,destroyed=false,polling=false,pollVersion=0,lastPoll=-Infinity,scope=owner(),watchCache=null,graphSignature='';
  const indicators=new Map(),selfReports=new Map(),listeners=[],format=(value,digits=1)=>new Intl.NumberFormat('en',{maximumFractionDigits:digits}).format(value);
  const listen=(target,type,callback)=>{target.addEventListener(type,callback);listeners.push([target,type,callback]);};
  for(const card of cards){const line=make('span','home-vital-trend');line.setAttribute('aria-hidden','true');card.append(line);indicators.set(card,line);card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-controls','home-trend-chart');const choose=()=>{selected=card.dataset.homeMetric;refresh();};listen(card,'click',event=>{if(!event.target.closest('button,a,input,select,textarea'))choose();});listen(card,'keydown',event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();choose();}});}
  function visible(){return !destroyed&&!suspended&&!document.hidden&&!home.hidden&&home.getClientRects().length>0;}
  function context(now=Date.now()){
    if(owner()!==scope){scope=owner();selfReports.clear();watchCache=null;lastPoll=-Infinity;}
    const sampleBase=window.missionHome?.sampleActive?.()?window.missionHome.sampleBase?.():null;
    if(sampleBase)return {records:[],model:sampleSnapshot(sampleBase,now),sampleBase,watch:null,recording:null,watchPoints:null,selfReports:[]};
    if(!scope)return {records:[],model:{readings:{}},watch:null,recording:null,watchPoints:null,selfReports:[]};
    const model=window.missionHome?.model?.()||{readings:{}},records=window.missionReadings?.records?.()||[],watch=window.missionActiwatch?.current?.()||null,recording=window.missionActiwatch?.recording?.()||null;
    const selectedReport=window.missionCheckin?.selection?.(),report=window.missionCheckin?.current?.();if(Number.isFinite(selectedReport?.at)&&selectedReport.at<=Date.now()&&report?.wellbeingScale===100&&Number.isFinite(report.score)){selfReports.set(selectedReport.at,{value:report.score,source:'manual',observedAt:new Date(selectedReport.at).toISOString()});if(selfReports.size>200)selfReports.delete(selfReports.keys().next().value);}
    if(!watch||!recording)watchCache=null;else if(watchCache?.recording!==recording||watchCache.id!==watch.id)watchCache={id:watch.id,recording,points:watchSeries(recording)};
    return {records,model,watch,recording,watchPoints:watchCache?.points||null,selfReports:[...selfReports.values()]};
  }
  function item(card,data,now){const key=card.dataset.homeMetric,period=periods.find(value=>value.id===periodId),current=data.model.readings?.[metrics[key].reading]||null,generated=Boolean(data.sampleBase),points=generated?sampleHistory(key,data.sampleBase,period,now):history(key,{...data,current},now).filter(point=>point.at>=now-period.ms&&point.at<=now);return {key,current,points,generated,result:statistics(points)};}
  function deltaText(key,delta){const value=key==='sleep'?delta*60:delta,digits=key==='sleep'?0:metrics[key].digits,unit=key==='sleep'?' min':key==='spo2'?' pp':key==='temp'||key==='bodyTemp'?' °C':'';return Math.abs(value)<.5*10**-digits?'\u2192 0'+unit:(value>0?'\u2191 +':'\u2193 -')+format(Math.abs(value),digits)+unit;}
  function svgNode(tag,attributes){const node=document.createElementNS(ns,tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,String(value));return node;}
  function axisLabels(host,labels){
    for(let index=0;index<labels.length;index++){let node=host.children[index];if(!node){node=make('span');host.append(node);}if(node.textContent!==labels[index])node.textContent=labels[index];}
    while(host.children.length>labels.length)host.lastElementChild.remove();
  }
  const graphText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
  function renderGraph(value,now){
    // Updating the self-report does not rebuild the unchanged chart above the slider.
    const graphKey=JSON.stringify([value.key,periodId,value.generated,value.current,value.points,Math.floor(now/(periodId==='1m'?1000:60000))]);if(graphKey===graphSignature)return;graphSignature=graphKey;
    const config=metrics[value.key],period=periods.find(item=>item.id===periodId),points=value.points.filter(point=>Number.isFinite(point.value)),start=now-period.ms;
    graphText(heading,config.name);graphText(reading,(value.generated&&Number.isFinite(value.current?.value)||observation(value.current,now))?format(value.current.value,config.digits)+' '+config.unit:'Not measured');panel.dataset.trendLevel=value.generated?'neutral':value.result?.level||'neutral';panel.dataset.trendMetric=value.key;panel.dataset.trendPeriod=periodId;panel.dataset.observationCount=String(points.length);panel.dataset.source=value.generated?'demo':'observations';
    graphText(meaning,value.generated?'Generated sample':'Actual observations / time gaps are not filled');
    controls.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.trendPeriod===periodId)));empty.hidden=points.length>0;plot.hidden=yAxis.hidden=xAxis.hidden=!points.length;
    graphText(empty,periodId==='1m'?'No measurements recorded in the last minute.':'No observations recorded in this period.');
    graphText(source,points.length?(value.generated?'Sample history':value.current?.source==='import'?'Recorded 24 h aggregates from Actiwatch epochs':'Saved observations')+' / '+points.length+' point'+(points.length===1?'':'s')+' / UTC':empty.textContent);
    if(!points.length){svg.replaceChildren();yAxis.replaceChildren();xAxis.replaceChildren();svg.setAttribute('aria-label',config.name+'. '+empty.textContent);return;}
    let low=Math.min(...points.map(point=>point.value)),high=Math.max(...points.map(point=>point.value));const padding=Math.max((high-low)*.12,Math.max(Math.abs(low),Math.abs(high))*1e-6,10**-config.digits);low-=padding;high+=padding;
    if(!Number.isFinite(high-low)||high===low){empty.hidden=false;empty.textContent='Recorded values exceed the chart display range.';plot.hidden=yAxis.hidden=xAxis.hidden=true;return;}
    const y=value=>210-(value-low)/(high-low)*210,x=at=>Math.max(0,Math.min(800,(at-start)/period.ms*800));
    const nodes=[],yLabels=[],xLabels=[];
    for(let index=0;index<4;index++){nodes.push(svgNode('line',{x1:0,x2:800,y1:index*70,y2:index*70,class:'home-trend-grid'}));yLabels.push(format(high-(high-low)*index/3,config.digits));}
    const lines=[],marks=[];for(const segment of segments(value.points,period)){const observed=sample(segment);if(observed.length>1)lines.push(observed.map((point,index)=>(index?'L':'M')+x(point.at).toFixed(2)+' '+y(point.value).toFixed(2)).join(' '));else if(observed.length){const point=observed[0],px=x(point.at),py=y(point.value);marks.push('M'+(px-3).toFixed(2)+' '+py.toFixed(2)+'a3 3 0 1 0 6 0a3 3 0 1 0 -6 0');}}
    if(lines.length)nodes.push(svgNode('path',{d:lines.join(' '),class:'home-trend-line'}));if(marks.length)nodes.push(svgNode('path',{d:marks.join(' '),fill:'var(--home-trend-color)',class:'home-trend-points'}));
    const last=points.at(-1);dot.style.top=y(last.value)/210*100+'%';dot.style.left=x(last.at)/800*100+'%';dot.style.right='auto';
    const axisFormat=new Intl.DateTimeFormat('en-GB',period.ms<=day?{hour:'2-digit',minute:'2-digit',...(periodId==='1m'?{second:'2-digit'}:{}),timeZone:'UTC'}:{day:'2-digit',month:'short',...(periodId==='1y'?{year:'2-digit'}:{}),timeZone:'UTC'});for(let index=0;index<5;index++)xLabels.push(axisFormat.format(new Date(start+period.ms*index/4)));
    // Keep axis rows populated so a refresh never temporarily shortens the page.
    svg.replaceChildren(...nodes);axisLabels(yAxis,yLabels);axisLabels(xAxis,xLabels);
    svg.setAttribute('aria-label',config.name+', '+period.name+'. '+points.length+(value.generated?' generated sample points. Latest sample ':' actual observations. Latest observation ')+new Date(last.at).toISOString()+(value.generated?'.':'. Gaps are not filled.'));
  }
  function refresh(){
    if(destroyed)return;const now=Date.now(),data=context(now),values=cards.map(card=>item(card,data,now));
    if(data.sampleBase&&cards.some(card=>card.dataset.readingValue!==String(data.model.readings?.[metrics[card.dataset.homeMetric].reading]?.value??'')))window.missionHome.renderValues?.(now);
    for(let index=0;index<cards.length;index++){
      const card=cards[index],value=values[index],generated=value.current?.source==='demo',result=generated?null:value.result,line=indicators.get(card);line.hidden=generated;card.dataset.trendLevel=result?.level||'neutral';card.dataset.trendPeriod=periodId;card.setAttribute('aria-pressed',String(value.key===selected));
      if(result?.delta!==null&&result?.delta!==undefined){card.dataset.trendDelta=String(result.delta);line.textContent=deltaText(value.key,result.delta);}else{delete card.dataset.trendDelta;line.textContent=generated?'':result?'One observation':'No history';}if(result?.z!==null&&result?.z!==undefined)card.dataset.trendZ=String(result.z);else delete card.dataset.trendZ;line.title=result?'Based on '+result.count+' actual observations in the selected period.':'No observations recorded in this period.';
    }
    renderGraph(values.find(value=>value.key===selected)||values[0],now);syncMinuteClock();
  }
  function stopMinuteClock(){clearTimeout(minuteTimer);minuteTimer=0;pollVersion++;polling=false;}
  function pollActual(){
    if(polling||!visible()||periodId!=='1m'||window.missionHome?.sampleActive?.()||!owner()||Date.now()-lastPoll<5000)return;
    const requests=[window.missionReadings,window.missionActiwatch].filter(store=>typeof store?.refresh==='function');if(!requests.length)return;
    polling=true;lastPoll=Date.now();const expected=owner(),ticket=++pollVersion;void Promise.allSettled(requests.map(store=>Promise.resolve().then(()=>store.refresh()))).finally(()=>{if(ticket!==pollVersion)return;polling=false;if(visible()&&owner()===expected)schedule();});
  }
  function syncMinuteClock(){if(periodId!=='1m'||!visible()||!owner()&&!window.missionHome?.sampleActive?.()){stopMinuteClock();return;}pollActual();if(!minuteTimer)minuteTimer=setTimeout(()=>{minuteTimer=0;if(visible()&&periodId==='1m')refresh();else stopMinuteClock();},1000-Date.now()%1000);}
  function schedule(){if(!visible()){stopMinuteClock();cancelAnimationFrame(scheduled);scheduled=0;return;}if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;refresh();});}
  listen(controls,'click',event=>{const button=event.target.closest('[data-trend-period]');if(button){periodId=button.dataset.trendPeriod;refresh();window.missionMARS?.periodChanged();}});
  const observer=new MutationObserver(schedule);for(const card of cards)observer.observe(card,{attributes:true,attributeFilter:['data-source','data-reading-value','data-observed-at']});const visibilityObserver=new MutationObserver(schedule);visibilityObserver.observe(home,{attributes:true,attributeFilter:['hidden']});visibilityObserver.observe(document.body,{attributes:true,attributeFilter:['data-home','data-overview','data-mission-workspace']});
  listen(document,'visibilitychange',schedule);for(const name of ['mission-wellbeing-change','mission-readings-change','mission-actiwatch-change','mission-profile-change','mission-sample-change'])listen(window,name,schedule);listen(window,'pageshow',()=>{suspended=false;schedule();});listen(window,'pagehide',event=>{suspended=true;stopMinuteClock();cancelAnimationFrame(scheduled);scheduled=0;if(!event.persisted){destroyed=true;observer.disconnect();visibilityObserver.disconnect();for(const [target,type,callback]of listeners)target.removeEventListener(type,callback);}});
  window.missionHomeTrends=Object.freeze({refresh,period:()=>periodId});refresh();
})();
