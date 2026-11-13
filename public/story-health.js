(() => {
  function snapshot(){
    if(window.missionCheckin)return {version:2,source:'self_report',profileId:'personal',capturedAt:new Date().toISOString(),wellbeing:window.missionCheckin.current(),metrics:{hr:null,spo2:null,temp:null,fatigue:null}};
    const person=crew[state.crew];
    // Values belong to a demonstration profile, rather than the author.
    return {version:1,source:'demo_dashboard',profileId:person.id,profileName:person.name,capturedAt:new Date().toISOString(),metrics:{...person.metrics}};
  }
  function render(node,health,{legacy=false}={}){
    node.replaceChildren();node.hidden=!health&&!legacy;
    if(!health){if(legacy){const text=document.createElement('small');text.textContent='No health snapshot is attached to this story.';node.append(text);}return;}
    const own=health.version===2;
    const header=document.createElement('header'),title=document.createElement('strong'),badge=document.createElement('small');title.textContent='Health readings';badge.textContent=own?'My':'Demo';header.append(title,badge);
    const meta=document.createElement('p');meta.className='story-health-meta';meta.textContent=(own?'My wellbeing':'Profile '+health.profileName)+' / '+new Intl.DateTimeFormat('en',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(health.capturedAt));
    const readings=document.createElement('div');readings.className='story-health-readings';
    for(const [key,label,unit]of [['hr','Pulse','bpm'],['spo2','SpO₂','%'],['temp','Temperature','°C'],['fatigue','Fatigue','/ 10']]){
      const cell=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong'),suffix=document.createElement('small');name.textContent=label;value.textContent=health.metrics[key]===null?'-':new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(health.metrics[key]);suffix.textContent=unit;value.append(suffix);cell.append(name,value);readings.append(cell);
    }
    const note=document.createElement('small');note.className='story-health-source';note.textContent=own?'Sensors are not connected yet.':'Demonstration / not astronaut medical data';node.append(header,meta,readings);
    if(own&&health.wellbeing){const report=document.createElement('p'),scale=health.wellbeing.wellbeingScale===100?100:10;report.className='story-health-meta';report.textContent='Wellbeing: '+health.wellbeing.score+' / '+scale+' · self-report';node.append(report);}
    node.append(note);
  }
  window.missionStoryHealth=Object.freeze({snapshot,render});
})();
