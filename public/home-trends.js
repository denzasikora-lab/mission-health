(() => {
  const periods=[
    {id:'1m',label:'1 min',name:'1 minute',scale:.08,axis:['-60 s','-45 s','-30 s','-15 s','Now']},
    {id:'1h',label:'1 h',name:'1 hour',scale:.25,axis:['-60 min','-45 min','-30 min','-15 min','Now']},
    {id:'24h',label:'24 h',name:'24 hours',scale:1,axis:['-24 h','-18 h','-12 h','-6 h','Now']},
    {id:'7d',label:'7 days',name:'7 days',scale:1.3,axis:['-7 d','-5 d','-3 d','-1 d','Now']},
    {id:'1mo',label:'Month',name:'1 month',scale:1.8,axis:['-30 d','-23 d','-15 d','-8 d','Now']},
    {id:'1y',label:'Year',name:'1 year',scale:2.2,axis:['-1 year','-9 mo','-6 mo','-3 mo','Now']}
  ];
  const metrics={
    hr:{name:'Pulse',unit:'bpm',digits:1,spread:3,bounds:[35,190],offset:[.3,1.4,2.4,2,1.3,.8]},
    spo2:{name:'SpO₂',unit:'%',deltaUnit:'pp',digits:1,spread:.35,bounds:[85,100],offset:[.4,.6,.8,1.6,2.3,1.2]},
    temp:{name:'Skin temperature',unit:'°C',digits:2,spread:.13,bounds:[28,42],offset:[.6,1.1,1.2,2.7,3.4,2.2]},
    wellbeing:{name:'Wellbeing',unit:'from 100',deltaUnit:'pp.',digits:1,spread:3,bounds:[1,100],offset:[-.3,-.7,-2.6,-1.9,-3.4,-2.2]},
    sleep:{name:'Sleep',unit:'h',deltaUnit:'min',digits:1,spread:.45,bounds:[0,14],offset:[.3,.8,3.4,2.5,1.4,.8]},
    hrv:{name:'HRV',unit:'ms',digits:1,spread:4,bounds:[5,180],offset:[.4,-1.2,-1.8,-2.4,-3.5,-1.7]},
    respiration:{name:'Respiration',unit:'/min',digits:1,spread:1,bounds:[6,40],offset:[.5,.8,1.1,2.4,1.6,3.5]},
    pressure:{name:'Blood pressure / systolic',unit:'mmHg. units.',digits:1,spread:3,bounds:[75,190],offset:[.6,1.3,3.3,2.6,1.5,.8]},
    recovery:{name:'Recovery',unit:'from 100',deltaUnit:'pp.',digits:1,spread:3,bounds:[0,100],offset:[.6,.9,1.3,2.4,3.4,1.8]},
    steps:{name:'Steps',unit:'per day',deltaUnit:'steps',digits:0,spread:300,bounds:[0,40000],offset:[.2,.8,2.8,1.4,3.4,2.1]},
    activity:{name:'Movement',unit:'counts',digits:0,spread:2000,bounds:[0,300000],offset:[.2,1.1,1.7,3.3,2.4,.9]},
    light:{name:'Illuminance',unit:'lx',digits:1,spread:40,bounds:[0,120000],offset:[.4,2.5,3.2,1.8,2.7,1.4]}
  };
  const levels={green:{name:'Green',description:'within two standard deviations'},amber:{name:'Amber',description:'between two and three standard deviations'},red:{name:'Red',description:'at least three standard deviations'},neutral:{name:'Gray',description:'no history for the selected period'}};
  const minuteOrigin=Math.floor(Date.now()/1000);
  function mean(values){return values.reduce((sum,value)=>sum+value,0)/values.length;}
  function statistics(points){
    const prior=points.slice(0,-1),average=mean(prior),variance=prior.reduce((sum,value)=>sum+(value-average)**2,0)/Math.max(1,prior.length-1),sd=Math.sqrt(variance),last=points.at(-1);
    const z=sd>1e-10?Math.abs(last-average)/sd:Math.abs(last-average)<1e-10?0:Infinity;
    return {average,sd,z,level:z<2?'green':z<3?'amber':'red',delta:last-points[0]};
  }
  function demoSeries(key,current,periodId){
    const config=metrics[key],periodIndex=periods.findIndex(period=>period.id===periodId),period=periods[periodIndex];
    if(!config||!period||!Number.isFinite(current))return null;
    const seed=Object.keys(metrics).indexOf(key)+1;
    if(periodId==='1m'){
      // One timeline preserves shared window points during updates and navigation.
      const second=Math.floor(Date.now()/1000)-minuteOrigin,amplitude=config.spread*period.scale;
      const points=Array.from({length:61},(_,index)=>{
        const at=second-60+index,shape=Math.sin(at*.53+seed)*.8+Math.cos(at*.21)*.45+Math.sin(at*.11+seed*2)*.3;
        return Math.max(config.bounds[0],Math.min(config.bounds[1],current+amplitude*shape));
      });
      return {points,...statistics(points)};
    }
    // Other periods use a fixed demonstration pattern.
    const shape=Array.from({length:60},(_,index)=>Math.sin(index*.53+seed)*.8+Math.cos(index*.21+periodIndex)*.45+Math.sin(index*.11+seed*2)*.3);
    const center=mean(shape),sd=Math.sqrt(shape.reduce((sum,value)=>sum+(value-center)**2,0)/(shape.length-1)),amplitude=config.spread*period.scale;
    const points=shape.map(value=>Math.max(config.bounds[0],Math.min(config.bounds[1],current+amplitude*((value-center)/sd-config.offset[periodIndex]))));
    points.push(current);
    return {points,...statistics(points)};
  }
  function metricValue(key,raw){
    const text=String(raw||'').replace(/[\u00a0\u202f]/g,' ').trim();
    if(key==='pressure'){const pair=text.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*\d/);return pair?Number(pair[1].replace(',','.')):null;}
    if(key==='sleep'){
      const hours=text.match(/(\d+(?:[.,]\d+)?)\s*h/),minutes=text.match(/(\d+(?:[.,]\d+)?)\s*min/);
      if(hours||minutes)return (hours?Number(hours[1].replace(',','.')):0)+(minutes?Number(minutes[1].replace(',','.'))/60:0);
    }
    const number=text.replace(/\s+/g,'').match(/^-?\d+(?:[.,]\d+)?/);
    return number?Number(number[0].replace(',','.')):null;
  }
  const home=document.getElementById('mission-home'),bodyPanel=home?.querySelector('.home-body-panel');
  if(!bodyPanel)return;
  const cards=[...bodyPanel.querySelectorAll('[data-home-metric]')].filter(card=>metrics[card.dataset.homeMetric]);
  if(!cards.length)return;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const panel=make('section','home-trends panel glass');panel.id='home-trends';panel.setAttribute('aria-labelledby','home-trend-heading');
  const header=make('header','home-trend-heading'),heading=make('h2'),reading=make('span','home-trend-reading');heading.id='home-trend-heading';header.append(heading,reading);
  const controls=make('div','home-trend-periods');controls.setAttribute('role','group');controls.setAttribute('aria-label','Trend period');
  for(const period of periods){const button=make('button','',period.label);button.type='button';button.dataset.trendPeriod=period.id;button.setAttribute('aria-label',period.name);controls.append(button);}
  const graph=make('div','home-trend-graph');graph.id='home-trend-chart';
  const yAxis=make('div','home-trend-yaxis');yAxis.setAttribute('aria-hidden','true');
  const plot=make('div','home-trend-plot'),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 800 210');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');
  const dot=make('span','home-trend-dot');dot.setAttribute('aria-hidden','true');plot.append(svg,dot);
  const empty=make('p','home-trend-empty','No history for this period.');empty.hidden=true;graph.append(yAxis,plot,empty);
  const xAxis=make('div','home-trend-xaxis');xAxis.setAttribute('aria-hidden','true');
  const legend=make('div','home-trend-legend'),source=make('span','home-trend-source','Demo / personal baseline'),meaning=make('span','','Color: difference from baseline / not a diagnosis');legend.append(source,meaning);
  legend.title='The demonstration baseline uses preceding points from the selected period. Green: |z| < 2; amber: 2 <= |z| < 3; red: |z| >= 3. The band shows the mean +/- 2 standard deviations. Statistical limits are not medical norms.';
  panel.append(header,controls,graph,xAxis,legend);bodyPanel.after(panel);
  let selected='hr',periodId='24h',scheduled=0,minuteTimer=0,suspended=false;
  const indicators=new Map(),format=(number,digits=1)=>new Intl.NumberFormat('en',{maximumFractionDigits:digits}).format(number);
  for(const card of cards){
    const line=make('span','home-vital-trend');line.setAttribute('aria-hidden','true');card.append(line);indicators.set(card,line);
    card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-controls','home-trend-chart');
    const choose=()=>{selected=card.dataset.homeMetric;refresh();};
    card.addEventListener('click',event=>{if(!event.target.closest('button,a,input,select,textarea'))choose();});
    card.addEventListener('keydown',event=>{if(event.target!==card)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});
  }
  function deltaText(key,delta){
    const config=metrics[key],value=key==='sleep'?delta*60:delta,digits=key==='sleep'?0:config.digits,threshold=.5*10**-digits;
    const visibleUnit=key==='sleep'?' min':key==='temp'?' °C':key==='spo2'?' pp':'';
    if(Math.abs(value)<threshold)return {visible:'\u2192 0'+visibleUnit,accessible:'unchanged'};
    const arrow=value>0?'\u2191':'\u2193',sign=value>0?'+':'-',unit=config.deltaUnit||config.unit;
    return {visible:arrow+' '+sign+format(Math.abs(value),digits)+visibleUnit,accessible:(value>0?'increase of ':'decrease of ')+format(Math.abs(value),digits)+' '+unit};
  }
  function snapshot(card){
    const key=card.dataset.homeMetric,raw=card.querySelector('strong')?.textContent||'',value=metricValue(key,raw),isDemo=card.dataset.source==='demo';
    return {key,raw,value,isDemo,result:isDemo?demoSeries(key,value,periodId):null};
  }
  function svgNode(tag,attributes){const node=document.createElementNS(ns,tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,String(value));return node;}
  function renderGraph(item){
    const config=metrics[item.key],period=periods.find(value=>value.id===periodId),result=item.result;
    heading.textContent=config.name;reading.textContent=item.key==='pressure'&&item.value!==null?format(item.value,0)+' mmHg. units.':item.raw;panel.dataset.trendLevel=result?.level||'neutral';panel.dataset.trendMetric=item.key;panel.dataset.trendPeriod=periodId;
    controls.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.trendPeriod===periodId)));
    svg.replaceChildren();yAxis.replaceChildren();xAxis.replaceChildren();empty.hidden=Boolean(result);plot.hidden=!result;yAxis.hidden=!result;xAxis.hidden=!result;
    const noMinuteFeed=periodId==='1m'&&!item.isDemo;
    empty.textContent=noMinuteFeed?'No measurement stream for the last minute.':'No history for this period.';
    source.textContent=result?(periodId==='1m'?'Demo / personal baseline · update 1 s':'Demo / personal baseline'):noMinuteFeed?'No measurement stream':'No history for this period';
    if(!result){svg.setAttribute('aria-label',config.name+'. '+empty.textContent);return;}
    const {points,average,sd,level}=result,minimum=Math.min(...points,average-2*sd),maximum=Math.max(...points,average+2*sd),padding=Math.max((maximum-minimum)*.14,config.spread*.05),low=minimum-padding,high=maximum+padding;
    const y=value=>210-(value-low)/(high-low)*210,x=index=>index/(points.length-1)*800;
    svg.append(svgNode('rect',{x:0,y:y(average+2*sd),width:800,height:Math.max(0,y(average-2*sd)-y(average+2*sd)),class:'home-trend-band'}));
    for(let index=0;index<4;index++){
      const value=high-(high-low)*index/3,position=index*70;svg.append(svgNode('line',{x1:0,x2:800,y1:position,y2:position,class:'home-trend-grid'}));yAxis.append(make('span','',format(value,item.key==='temp'?2:config.digits)));
    }
    svg.append(svgNode('line',{x1:0,x2:800,y1:y(average),y2:y(average),class:'home-trend-baseline'}));
    const line=points.map((value,index)=>(index?'L':'M')+x(index).toFixed(2)+' '+y(value).toFixed(2)).join(' ');
    svg.append(svgNode('path',{d:line+' L 800 210 L 0 210 Z',class:'home-trend-fill'}),svgNode('path',{d:line,class:'home-trend-line'}));
    dot.style.top=(y(points.at(-1))/210*100)+'%';for(const label of period.axis)xAxis.append(make('span','',label));
    const delta=deltaText(item.key,result.delta);svg.setAttribute('aria-label',config.name+', '+period.name+'. Demonstration trend. '+delta.accessible+'. '+levels[level].name+': '+levels[level].description+'.');
  }
  function refresh(){
    const snapshots=cards.map(snapshot);
    for(let index=0;index<cards.length;index++){
      const card=cards[index],item=snapshots[index],result=item.result,line=indicators.get(card),level=result?.level||'neutral',period=periods.find(value=>value.id===periodId),delta=result?deltaText(item.key,result.delta):null;
      card.dataset.trendLevel=level;card.dataset.trendPeriod=periodId;card.setAttribute('aria-pressed',String(item.key===selected));
      if(result){card.dataset.trendDelta=String(result.delta);card.dataset.trendZ=String(result.z);}else{delete card.dataset.trendDelta;delete card.dataset.trendZ;}
      line.textContent=delta?delta.visible:'No history';line.title=result?'Change since period start '+period.name+'. Demo / personal baseline. '+levels[level].name+': '+levels[level].description+'.':'No actual history for '+period.name+'. Value preserved without synthetic continuation.';
      card.setAttribute('aria-label',metrics[item.key].name+': '+item.raw+'. '+(delta?delta.accessible+' over '+period.name+'. ':'')+levels[level].name+': '+levels[level].description+'.'+(result?' Demo / personal baseline.':''));
    }
    renderGraph(snapshots.find(item=>item.key===selected)||snapshots[0]);
    syncMinuteClock();
  }
  controls.addEventListener('click',event=>{const button=event.target.closest('[data-trend-period]');if(button){periodId=button.dataset.trendPeriod;refresh();}});
  function visible(){return !suspended&&!document.hidden&&!home.hidden&&home.getClientRects().length>0;}
  function stopMinuteClock(){clearTimeout(minuteTimer);minuteTimer=0;}
  function syncMinuteClock(){
    const card=cards.find(item=>item.dataset.homeMetric===selected);
    if(periodId!=='1m'||!visible()||card?.dataset.source!=='demo'||!Number.isFinite(metricValue(selected,card.querySelector('strong')?.textContent))){stopMinuteClock();return;}
    if(!minuteTimer)minuteTimer=setTimeout(()=>{minuteTimer=0;if(visible()&&periodId==='1m')refresh();else stopMinuteClock();},1000-Date.now()%1000);
  }
  function schedule(){if(!visible()){stopMinuteClock();cancelAnimationFrame(scheduled);scheduled=0;return;}if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;refresh();});}
  const observer=new MutationObserver(schedule);
  for(const card of cards){const number=card.querySelector('strong');if(number)observer.observe(number,{childList:true,subtree:true,characterData:true});observer.observe(card,{attributes:true,attributeFilter:['data-source']});}
  const visibilityObserver=new MutationObserver(schedule);visibilityObserver.observe(home,{attributes:true,attributeFilter:['hidden']});visibilityObserver.observe(document.body,{attributes:true,attributeFilter:['data-home','data-overview','data-mission-workspace']});
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('mission-wellbeing-change',schedule);
  window.addEventListener('pageshow',()=>{suspended=false;schedule();});
  window.addEventListener('pagehide',event=>{suspended=true;stopMinuteClock();cancelAnimationFrame(scheduled);scheduled=0;if(!event.persisted){observer.disconnect();visibilityObserver.disconnect();}});
  window.missionHomeTrends={refresh};refresh();
})();
