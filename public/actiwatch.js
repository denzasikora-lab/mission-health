(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  function demoRecording(){
    const start=Date.parse('2026-10-28T12:00:00.000Z');
    // The deterministic sample exists only in interface memory, separately from the import draft.
    const rows=Array.from({length:1440},(_,minute)=>{
      const asleep=minute>=620&&minute<1080,exercise=minute>=250&&minute<290||minute>=1160&&minute<1180;
      return {timestamp:new Date(start+minute*60000).toISOString(),activity:asleep?(minute%71===0?6:0):18+(minute*19%83)+(exercise?140:0),lightLux:asleep?0.5:minute<360?240+(minute*11%360):minute<620?35+(minute*3%40):180+(minute*7%220),sleepState:asleep?'sleep':'wake',offWrist:false,excluded:false};
    });
    return {version:1,sourceFormat:'actiware-csv',epochSeconds:60,rows,warnings:[]};
  }
  const demoData=demoRecording(),demoState=Object.freeze({source:'demo',simulation:true,summary:globalThis.MissionActiwatch.summarize(demoData)});
  const home=document.getElementById('mission-home'),bodyPanel=home.querySelector('.home-body-panel');
  const dialog=make('dialog','actiwatch-dialog');dialog.id='actiwatch-dialog';dialog.setAttribute('aria-labelledby','actiwatch-title');
  dialog.innerHTML='<header><div><span>SOURCE / ACTIWATCH</span><h2 id="actiwatch-title">Import watch data</h2></div><button type="button" data-actiwatch-close aria-label="Close import Actiwatch">✕</button></header><p>Select CSV from Actiware with epoch records. A preview appears before upload.</p><label class="actiwatch-file">Export Actiware<input id="actiwatch-file" type="file" accept=".csv,text/csv"></label><div class="actiwatch-options"><label>Date format<select id="actiwatch-date"><option value="">From ISO Timestamp</option><option value="MDY">Month / day / year</option><option value="DMY">Day / month / year</option><option value="YMD">Year / month / day</option></select></label><label>File time zone<select id="actiwatch-zone"><option value="">From ISO Timestamp</option></select></label><label>Epoch duration<select id="actiwatch-epoch"><option value="">From file</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="120">120 seconds</option></select></label></div><p id="actiwatch-preview-status" role="status">No file selected yet.</p><div id="actiwatch-preview" class="actiwatch-preview" hidden></div><button type="button" id="actiwatch-save" disabled>Use data</button><details><summary>How to export a file</summary><p>In Actiware select export CSV: Full header and Epoch-by-epoch list. Required Activity and Date + Time or ISO Timestamp. Additionally: White Light / Photopic Light, Sleep/Wake Score, Off-Wrist Status and text Interval Status.</p><p>For separate Date and Time specify the date format and fixed offset UTC, used in the file. RGB-channels are not imported here.</p><p>The watch is read through hardware Actiwatch and Actiware. This import is not a direct wireless connection.</p><a href="https://www.philips.com/c-dam/b2bhc/master/sites/actigraphy/solutions/Actiware/actiware-user-guide.pdf" target="_blank" rel="noopener">Guide Philips Actiware ↗</a></details>';
  document.body.append(dialog);
  const get=id=>document.getElementById(id),previewStatus=get('actiwatch-preview-status'),save=get('actiwatch-save');
  let latest=null,recording=null,draft=null,raw='',filename='',busy=false,loadVersion=0,importId=null;
  const fmt=value=>value===null?'-':new Intl.NumberFormat('en',{maximumFractionDigits:1,useGrouping:false}).format(value);
  const duration=seconds=>{if(seconds===null)return '-';const minutes=Math.round(seconds/60);return Math.floor(minutes/60)+' h '+minutes%60+' min';};
  const date=value=>new Intl.DateTimeFormat('en',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(value))+' UTC';
  for(let offset=-720;offset<=840;offset+=15){const option=make('option','', 'UTC'+(offset>=0?'+':'-')+String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')+':'+String(Math.abs(offset)%60).padStart(2,'0'));option.value=offset;get('actiwatch-zone').append(option);}
  function values(host,summary,simulation=false){
    host.replaceChildren();const w=summary.latest24h;
    for(const [name,value,note]of [['Sleep',duration(w.sleepSeconds),simulation?'Simulated sleep':w.sleepSeconds===null?'No usable labels':'Based on labels Actiware'],['Activity',fmt(w.activityCounts),'counts / not steps'],['White light',fmt(w.meanLightLux)+(w.meanLightLux===null?'':' lx'),simulation?'Simulated illuminance':'Mean of usable epochs'],['Coverage',duration(w.coveredSeconds),'Within the last 24 h']]){const cell=make('div');cell.append(make('span','',name),make('strong','',value),make('small','',note));host.append(cell);}
  }
  function metric(key,value,unit,note){
    const card=bodyPanel.querySelector('[data-home-metric='+key+']');if(!card)return;
    card.dataset.source=latest?'actiwatch':'demo';card.dataset.device='actiwatch';
    const number=card.querySelector('strong');number.textContent=value;if(unit)number.append(make('span','home-vital-unit',unit));
    window.missionHome.setSource(key,note,latest?null:'https://www.nasa.gov/wp-content/uploads/2023/11/roi-iss-facilities-june2023.pdf');
    card.title=latest?'Actiwatch / '+latest.filename+' / to '+date(latest.summary.end):'Actiwatch / simulation, not a user measurement';
  }
  function render(){
    const summary=latest?.summary||demoState.summary,w=summary.latest24h,source=latest?'Actiwatch / Actiware CSV':'Actiwatch Plus';
    const minutes=w.sleepSeconds===null?null:Math.round(w.sleepSeconds/60);
    metric('sleep',minutes===null?'-':String(Math.floor(minutes/60)),minutes===null?'':'h '+minutes%60+' min',source+(minutes===null?' / no labels':''));
    metric('activity',fmt(w.activityCounts),w.activityCounts===null?'':'counts',source+' / accelerometer');
    metric('light',fmt(w.meanLightLux),w.meanLightLux===null?'':'lx',source+' / white light');
    bodyPanel.dataset.actiwatchSource=latest?'actiwatch':'demo';
    const label=bodyPanel.querySelector('header small');if(label)label.textContent=latest?'Actiwatch CSV + simulation':'Simulation';
  }
  async function load(){
    const version=++loadVersion;
    try{const data=await journalApi('/api/actiwatch');if(version!==loadVersion)return;let loaded=null;if(data.latest){if(latest?.id===data.latest.id&&recording)loaded=recording;else{const result=await journalApi('/api/actiwatch/'+data.latest.id);if(version!==loadVersion)return;loaded=result.recording;}}latest=data.latest||null;recording=loaded;render();}
    catch{if(version===loadVersion){latest=null;recording=null;render();}}
  }
  function parse(){
    draft=null;save.disabled=true;get('actiwatch-preview').hidden=true;if(!raw){previewStatus.textContent='No file selected yet.';return;}
    try{const options={};if(get('actiwatch-date').value)options.dateOrder=get('actiwatch-date').value;if(get('actiwatch-zone').value!=='')options.utcOffsetMinutes=Number(get('actiwatch-zone').value);if(get('actiwatch-epoch').value)options.epochSeconds=Number(get('actiwatch-epoch').value);draft=globalThis.MissionActiwatch.parseCSV(raw,options);const summary=globalThis.MissionActiwatch.summarize(draft);values(get('actiwatch-preview'),summary);get('actiwatch-preview').hidden=false;previewStatus.textContent=draft.rows.length+' epochs / '+date(summary.start)+' - '+date(summary.end)+(draft.warnings.length?'\n'+draft.warnings.join(' '):'');save.disabled=busy;importId=null;}
    catch(error){previewStatus.textContent=error.message;}
  }
  function openImport(){if(!dialog.open)dialog.showModal();if(!latest)void load();}
  dialog.querySelector('[data-actiwatch-close]').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  get('actiwatch-file').addEventListener('change',async event=>{if(busy)return;const file=event.target.files[0];raw='';draft=null;filename='';save.disabled=true;get('actiwatch-preview').hidden=true;if(!file){parse();return;}if(file.size>5000000){previewStatus.textContent='File must be no larger than 5 MB.';return;}try{const bytes=new Uint8Array(await file.arrayBuffer()),encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':'utf-8';raw=new TextDecoder(encoding,{fatal:true}).decode(bytes);filename=file.name;parse();}catch{previewStatus.textContent='Could not read the file. Requires CSV in UTF-8 or UTF-16LE.';save.disabled=true;}});
  for(const id of ['actiwatch-date','actiwatch-zone','actiwatch-epoch'])get(id).addEventListener('change',parse);
  save.addEventListener('click',async()=>{
    if(!draft||busy)return;busy=true;save.disabled=true;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=true);importId||=crypto.randomUUID();previewStatus.textContent='Saving data Actiwatch...';
    try{const result=await journalApi('/api/actiwatch',{method:'POST',body:JSON.stringify({id:importId,filename,recording:draft})});previewStatus.textContent=result.duplicate?'This file has already been added.':'Data added. Summary saved in your personal diary.';await load();void window.missionBook?.refresh();void window.missionConversations?.refreshDiary();void window.missionActivity?.refresh();draft=null;raw='';get('actiwatch-file').value='';dialog.close();}
    catch{previewStatus.textContent='Could not save. The file remains here, you can retry.';}
    finally{busy=false;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=false);save.disabled=!draft;}
  });
  window.missionActiwatch={refresh:load,current:()=>latest?{...latest,source:'actiwatch'}:demoState,demoState,openImport};render();void load();
})();
