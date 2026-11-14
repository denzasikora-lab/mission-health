(() => {
  const home=document.getElementById('mission-home');
  if(!home||!window.missionHome?.snapshot)return;
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const panel=make('section','health-analysis panel glass'),header=make('header','health-analysis-header'),title=make('h2','','Health analysis'),badges=make('div','health-analysis-badges'),scopeBadge=make('span','health-analysis-scope'),statusBadge=make('strong','health-analysis-status');
  panel.id='health-analysis';panel.setAttribute('aria-labelledby','health-analysis-title');title.id='health-analysis-title';badges.append(scopeBadge,statusBadge);header.append(title,badges);
  const summary=make('p','health-analysis-summary'),disclosure=make('details','health-analysis-disclosure'),disclosureTitle=make('summary','','Analysis details'),fullSummary=make('p','health-analysis-full-summary'),alerts=make('ul','health-analysis-alerts'),details=make('p','health-analysis-details'),footer=make('footer','health-analysis-footer'),actions=make('div','health-analysis-actions'),button=make('button','health-analysis-button','Analyze'),newSnapshot=make('button','health-analysis-new','Use current readings'),meta=make('span','health-analysis-meta'),notice=make('p','health-analysis-notice');
  button.type='button';newSnapshot.type='button';newSnapshot.hidden=true;notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');disclosure.append(disclosureTitle,fullSummary,alerts,details);actions.append(button,newSnapshot);footer.append(actions,meta);panel.append(header,summary,disclosure,footer,notice);home.querySelector('.home-checkin').before(panel);
  const statuses=['NORMAL','ATTENTION','CRITICAL'],labels={heart_rate:'Pulse',spo2:'SpO2',temperature:'Body temperature',body_temperature:'Body temperature',bp:'Blood pressure',bp_systolic:'Systolic pressure',bp_diastolic:'Diastolic pressure',respiratory_rate:'Respiration',fatigue_stress:'Fatigue or stress',fatigue_index:'Fatigue',stress_index:'Stress'};
  let scope=owner(),generation=0,controller=null,latest=null,pending=null,busy=false,inProgress=false,message='',staleTimer=0;
  function owner(){return window.missionProfileName?.identity?.storageScope||null;}
  function snapshot(){return window.missionHome.snapshot();}
  function rulesFor(value){try{return window.MissionHealthRules.evaluate(value);}catch{return null;}}
  function statusFor(status,rules){return statuses.includes(status)&&!(status==='NORMAL'&&!rules?.complete)?status:null;}
  function signature(value){const readings=Object.fromEntries(Object.keys(value?.readings||{}).sort().map(key=>{const reading=value.readings[key];return [key,value.actiwatchImportId&&['sleep_hours','activity','light'].includes(key)?null:reading?{value:reading.value,unit:reading.unit,source:reading.source,observedAt:reading.observedAt??null}:null];}));return JSON.stringify({profileId:value?.profileId,actiwatchImportId:value?.actiwatchImportId,readings});}
  function time(value){return Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):null;}
  function alertText(value){
    if(typeof value==='string')return /^(?:mission[ _-]?time|provenance|is_demo|direct_sensor_connection)\s*:/i.test(value.trim())?'':value;
    if(!value||typeof value!=='object'||Array.isArray(value))return '';
    if(/^(?:mission[ _-]?time|provenance|is_demo|direct_sensor_connection)$/i.test(String(value.parameter||'').trim()))return '';
    return ['parameter','value','severity','note','trend'].map(key=>typeof value[key]==='string'||typeof value[key]==='number'?String(value[key]):'').filter(Boolean).join(' / ');
  }
  function item(value){
    if(!value||typeof value.id!=='string'||value.snapshot?.profileId!=='personal'||!value.rules||!value.result||typeof value.result.summary!=='string'||!Array.isArray(value.result.alerts)||typeof value.result.agentAvailable!=='boolean')throw new Error('invalid_health_analysis');
    return value;
  }
  function scheduleStaleness(value){
    if(staleTimer)clearTimeout(staleTimer);staleTimer=0;
    const now=Date.now(),times=['heart_rate','spo2','body_temperature','bp_systolic','bp_diastolic','respiratory_rate','fatigue_index','stress_index'].map(key=>value?.readings?.[key]).filter(reading=>reading&&reading.source!=='demo').map(reading=>Date.parse(reading.observedAt)+900001).filter(at=>Number.isFinite(at)&&at>now);
    if(times.length)staleTimer=setTimeout(()=>{staleTimer=0;render();},Math.max(1,Math.min(...times)-now));
  }
  function render(){
    const current=snapshot(),saved=pending&&pending.id!==latest?.id?null:latest,value=pending?.snapshot||saved?.snapshot||current,snapshotRules=rulesFor(value),expired=Boolean(saved&&snapshotRules?.stale?.length),rules=expired?rulesFor(current):saved?.rules||snapshotRules,result=saved?.result;
    const status=statusFor(!expired&&result?.agentAvailable?result.status:rules?.status,rules),example=rules?.isDemo===true;scheduleStaleness(expired?current:value);
    scopeBadge.textContent=example?'Example':'Provided readings';statusBadge.textContent=status||'Incomplete';statusBadge.dataset.level=status?status.toLowerCase():'incomplete';
    panel.setAttribute('aria-busy',String(busy));button.disabled=busy||!scope||!window.MissionHealthRules;button.textContent=busy?'Analyzing...':pending?'Retry analysis':'Analyze';newSnapshot.hidden=!pending||signature(pending.snapshot)===signature(current);newSnapshot.disabled=busy;

    summary.textContent=result?(expired?'Saved analysis: ':'')+String(result.summary||'Rule results are shown below.').replace(/\*\*/g,'').replace(/No signal/gi,'Awaiting reading'):!rules?'Health checks are temporarily unavailable.':'Review available readings with the prototype rules.';
    fullSummary.textContent=summary.textContent;
    alerts.replaceChildren();for(const text of (result?.alerts||[]).map(alertText).filter(text=>text&&!/No signal|Check the (?:missing )?sensor/i.test(text)))alerts.append(make('li','',text));alerts.hidden=!alerts.children.length;
    const parts=[];
    if(example)parts.push('Includes example values, not live sensor readings.');
    if(rules?.flags?.length)parts.push('Rule flags: '+rules.flags.map(key=>labels[key]||key).join(', ')+'.');
    details.textContent=parts.join(' ');details.hidden=!parts.length;
    const stamp=time(saved?.createdAt||value.capturedAt);
    meta.textContent=inProgress?'Analysis in progress':saved?(expired?'Saved analysis / current rules only':result.agentAvailable?'AI + rules':'Rules only / AI unavailable')+(stamp?' / '+stamp:''):pending?'Retry uses the original snapshot.':'Local rule preview / no AI request';
    const changed=saved&&signature(saved.snapshot)!==signature(current);
    notice.textContent=!scope?'Sign in to analyze.':expired?'Saved observations have expired. Current status uses only unexpired readings. Add current measurements and analyze again.':message||(changed?'Readings changed. Analyze to update.':'');notice.hidden=!notice.textContent;
  }
  function active(ticket,expected){return ticket===generation&&scope===expected&&owner()===expected;}
  function accept(value){
    const view=item(value);
    if((view.rules.isDemo===true||rulesFor(view.snapshot)?.isDemo===true)&&(!window.missionHome.sampleActive?.()||pending?.id!==view.id)){latest=null;pending=null;inProgress=false;message='';return;}
    if(view.pending===true){pending||={id:view.id,snapshot:view.snapshot};inProgress=true;message='Analysis in progress. Retry to check this snapshot.';return;}
    latest=view;inProgress=false;
    if(view.result.agentAvailable){if(pending?.id===view.id)pending=null;message='';}
    else{pending||={id:view.id,snapshot:view.snapshot};message=view.result.agentError==='ai_daily_limit'?'Daily AI request limit reached. Your readings are saved. Try again after the daily reset.':view.result.agentError==='ai_concurrency_limit'?'AI is processing another request. Retry this snapshot shortly.':'AI unavailable. Rule results are shown. You can retry this snapshot.';}
  }
  async function load(){
    if(!scope||busy)return;const expected=scope,ticket=++generation;controller?.abort();const request=new AbortController(),timeout=setTimeout(()=>request.abort(),15000);controller=request;
    try{const data=await journalApi('/api/health-analysis',{cache:'no-store',signal:request.signal});if(!active(ticket,expected))return;if(data.item===null){latest=null;}else accept(data.item);}
    catch{if(active(ticket,expected))message=latest?'Could not refresh saved analysis. The last available result is shown.':'Saved analysis could not be loaded. Local rules are shown.';}
    finally{clearTimeout(timeout);if(active(ticket,expected)){if(controller===request)controller=null;render();}}
  }
  async function analyze(){
    if(owner()!==scope)profileChanged();if(busy||!scope)return;
    if(!pending){try{const value=window.MissionHealthRules.normalize(snapshot());if(Object.values(value.readings).some(reading=>reading?.source==='demo')&&!window.missionHome.sampleActive?.())throw new Error('example_readings');pending={id:crypto.randomUUID(),snapshot:value};}catch{message='Could not prepare the readings. Please try again.';render();return;}}
    const expected=scope,ticket=++generation,payload=pending;controller?.abort();const request=new AbortController(),timeout=setTimeout(()=>request.abort(),75000);controller=request;busy=true;message='';render();
    try{
      const data=await journalApi('/api/health-analysis',{method:'POST',body:JSON.stringify(payload),signal:request.signal});if(!active(ticket,expected))return;
      const result=item(data);if(result.id!==payload.id)throw new Error('invalid_health_analysis');accept(result);
    }catch{if(active(ticket,expected))message='Could not complete the request. Retry keeps the same readings.';}
    finally{clearTimeout(timeout);if(active(ticket,expected)){busy=false;if(controller===request)controller=null;render();}}
  }
  function profileChanged(){
    const next=owner();if(next!==scope){scope=next;generation++;controller?.abort();controller=null;latest=null;pending=null;busy=false;inProgress=false;message='';render();if(scope)void load();}else render();
  }
  function sampleChanged(){generation++;controller?.abort();controller=null;latest=null;pending=null;busy=false;inProgress=false;message='';render();}
  window.addEventListener('mission-sample-change',sampleChanged);
  button.addEventListener('click',()=>void analyze());newSnapshot.addEventListener('click',()=>{if(busy)return;pending=null;inProgress=false;void analyze();});window.addEventListener('mission-profile-change',profileChanged);window.addEventListener('mission-wellbeing-change',render);window.addEventListener('mission-readings-change',render);window.addEventListener('mission-actiwatch-change',render);
  window.addEventListener('pagehide',()=>{generation++;controller?.abort();controller=null;busy=false;if(staleTimer)clearTimeout(staleTimer);staleTimer=0;});window.addEventListener('pageshow',profileChanged);document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)profileChanged();});
  window.missionHealth=Object.freeze({snapshot,refresh:load,analyze});render();
  if(scope)void load();else if(window.missionProfileName?.load){const ticket=generation;void window.missionProfileName.load().then(()=>{if(ticket===generation)profileChanged();}).catch(()=>{if(ticket!==generation||owner())return;message='Could not load your account. Please refresh the page.';render();});}
})();
