(() => {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const home=document.getElementById('mission-home'),bodyPanel=home?.querySelector('.home-body-panel');if(!bodyPanel)return;
  const dialog=make('dialog','actiwatch-dialog');dialog.id='actiwatch-dialog';dialog.setAttribute('aria-labelledby','actiwatch-title');
  dialog.innerHTML='<header><div><span>SOURCE / ACTIWATCH</span><h2 id="actiwatch-title">Import watch data</h2></div><button type="button" data-actiwatch-close aria-label="Close import Actiwatch">✕</button></header><p>Select CSV from Actiware with epoch records. A preview appears before upload.</p><label class="actiwatch-file">Export Actiware<input id="actiwatch-file" type="file" accept=".csv,text/csv"></label><div class="actiwatch-options"><label>Date format<select id="actiwatch-date"><option value="">From ISO Timestamp</option><option value="MDY">Month / day / year</option><option value="DMY">Day / month / year</option><option value="YMD">Year / month / day</option></select></label><label>File time zone<select id="actiwatch-zone"><option value="">From ISO Timestamp</option></select></label><label>Epoch duration<select id="actiwatch-epoch"><option value="">From file</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="120">120 seconds</option></select></label></div><p id="actiwatch-preview-status" role="status">No file selected yet.</p><div id="actiwatch-preview" class="actiwatch-preview" hidden></div><button type="button" id="actiwatch-save" disabled>Use data</button><details><summary>How to export a file</summary><p>In Actiware select export CSV: Full header and Epoch-by-epoch list. Required Activity and Date + Time or ISO Timestamp. Additionally: White Light / Photopic Light, Sleep/Wake Score, Off-Wrist Status and text Interval Status.</p><p>For separate Date and Time specify the date format and fixed offset UTC, used in the file. RGB-channels are not imported here.</p><p>The watch is read through hardware Actiwatch and Actiware. This import is not a direct wireless connection.</p><a href="https://www.philips.com/c-dam/b2bhc/master/sites/actigraphy/solutions/Actiware/actiware-user-guide.pdf" target="_blank" rel="noopener">Guide Philips Actiware ↗</a></details>';
  document.body.append(dialog);
  const get=id=>document.getElementById(id),previewStatus=get('actiwatch-preview-status'),save=get('actiwatch-save');
  let latest=null,recording=null,draft=null,raw='',filename='',busy=false,loadVersion=0,fileVersion=0,importId=null,loading=false,refreshFailed=false,suspended=false,scopeVersion=0,loadController=null,saveController=null;
  const owner=()=>window.missionProfileName?.identity?.storageScope||null;let scope=owner();
  const sourceStatus=make('p','actiwatch-source-note');sourceStatus.setAttribute('role','status');sourceStatus.style.fontSize='.65rem';sourceStatus.style.color='var(--muted)';bodyPanel.append(sourceStatus);
  const fmt=value=>value===null?'-':new Intl.NumberFormat('en',{maximumFractionDigits:1,useGrouping:false}).format(value);
  const duration=seconds=>{if(seconds===null)return '-';const minutes=Math.round(seconds/60);return Math.floor(minutes/60)+' h '+minutes%60+' min';};
  const date=value=>new Intl.DateTimeFormat('en',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(value))+' UTC';
  for(let offset=-720;offset<=840;offset+=15){const option=make('option','', 'UTC'+(offset>=0?'+':'-')+String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')+':'+String(Math.abs(offset)%60).padStart(2,'0'));option.value=offset;get('actiwatch-zone').append(option);}
  function values(host,summary){
    host.replaceChildren();const w=summary.latest24h;
    for(const [name,value,note]of [['Sleep',duration(w.sleepSeconds),w.sleepSeconds===null?'No usable labels':'Based on labels Actiware'],['Activity',fmt(w.activityCounts),'counts / not steps'],['White light',fmt(w.meanLightLux)+(w.meanLightLux===null?'':' lx'),'Mean of usable epochs'],['Coverage',duration(w.coveredSeconds),'Within the last 24 h of the recording']]){const cell=make('div');cell.append(make('span','',name),make('strong','',value),make('small','',note));host.append(cell);}
  }
  function current(){return scope&&owner()===scope&&latest?{...latest,source:'actiwatch'}:null;}
  function frozen(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))frozen(item);Object.freeze(value);}return value;}
  function accept(metadata,value){
    if(!metadata||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(metadata.id||'')||typeof metadata.filename!=='string'||!Number.isFinite(Date.parse(metadata.createdAt)))throw new Error('invalid_watch_import');
    if(latest?.id===metadata.id&&recording===value)return;
    const validated=globalThis.MissionActiwatch.validate(value),summary=globalThis.MissionActiwatch.summarize(validated);
    recording=frozen(validated);latest=frozen({id:metadata.id,filename:metadata.filename,createdAt:metadata.createdAt,summary,source:'actiwatch'});
  }
  function render(){
    const value=current();bodyPanel.dataset.actiwatchSource=value?'actiwatch':'missing';
    sourceStatus.textContent=value?'Actiwatch CSV / '+value.filename+' / Recorded '+date(value.summary.end)+(refreshFailed?' / Refresh failed; last saved import shown.':loading?' / Refreshing...':''):refreshFailed?'Could not load imported watch data. No watch measurements are shown.':loading?'Loading imported watch data...':'No watch data imported. Import a CSV to add actual sleep, activity and light records.';
    window.missionHome?.renderValues?.();window.dispatchEvent(new Event('mission-actiwatch-change'));
  }
  async function load(){
    if(owner()!==scope){profileChanged();return current();}if(!scope||suspended)return current();
    const version=++loadVersion,expected=scope;loadController?.abort();const request=new AbortController(),timeout=setTimeout(()=>request.abort(),15000);loadController=request;loading=true;
    const active=()=>version===loadVersion&&scope===expected&&owner()===expected&&!suspended;
    try{const data=await journalApi('/api/actiwatch',{cache:'no-store',signal:request.signal});if(!active())return current();if(!data||!Object.hasOwn(data,'latest'))throw new Error('invalid_watch_import');
      if(data.latest){let value=recording;if(latest?.id!==data.latest.id||!value){const result=await journalApi('/api/actiwatch/'+encodeURIComponent(data.latest.id),{cache:'no-store',signal:request.signal});if(!active())return current();if(result.import?.id!==data.latest.id)throw new Error('invalid_watch_import');value=result.recording;}accept(data.latest,value);}
      else{latest=null;recording=null;}refreshFailed=false;
    }catch(error){if(active()){refreshFailed=true;if(error?.message==='sign_in_required'){latest=null;recording=null;}}}
    finally{clearTimeout(timeout);if(active()){loading=false;if(loadController===request)loadController=null;render();}}
    return current();
  }
  function parse(){
    draft=null;save.disabled=true;get('actiwatch-preview').hidden=true;if(!raw){previewStatus.textContent='No file selected yet.';return;}
    try{const options={};if(get('actiwatch-date').value)options.dateOrder=get('actiwatch-date').value;if(get('actiwatch-zone').value!=='')options.utcOffsetMinutes=Number(get('actiwatch-zone').value);if(get('actiwatch-epoch').value)options.epochSeconds=Number(get('actiwatch-epoch').value);draft=globalThis.MissionActiwatch.parseCSV(raw,options);const summary=globalThis.MissionActiwatch.summarize(draft);values(get('actiwatch-preview'),summary);get('actiwatch-preview').hidden=false;previewStatus.textContent=draft.rows.length+' epochs / '+date(summary.start)+' - '+date(summary.end)+(draft.warnings.length?'\n'+draft.warnings.join(' '):'');save.disabled=busy;importId=null;}
    catch(error){previewStatus.textContent=error.message;}
  }
  function openImport(){if(!dialog.open)dialog.showModal();if(!latest)void load();}
  dialog.querySelector('[data-actiwatch-close]').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  get('actiwatch-file').addEventListener('change',async event=>{if(busy)return;if(owner()!==scope)profileChanged();const file=event.target.files[0],ticket=++fileVersion,expected=scope;raw='';draft=null;filename='';save.disabled=true;get('actiwatch-preview').hidden=true;if(!file){parse();return;}if(file.size>5000000){previewStatus.textContent='File must be no larger than 5 MB.';return;}const active=()=>ticket===fileVersion&&owner()===expected&&scope===expected&&!suspended;try{const bytes=new Uint8Array(await file.arrayBuffer());if(!active())return;const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':'utf-8';raw=new TextDecoder(encoding,{fatal:true}).decode(bytes);filename=file.name;parse();}catch{if(active()){previewStatus.textContent='Could not read the file. Requires CSV in UTF-8 or UTF-16LE.';save.disabled=true;}}});
  for(const id of ['actiwatch-date','actiwatch-zone','actiwatch-epoch'])get(id).addEventListener('change',parse);
  save.addEventListener('click',async()=>{
    if(owner()!==scope){profileChanged();return;}if(!draft||busy||!scope)return;
    const expected=scope,ticket=scopeVersion,value=draft;busy=true;save.disabled=true;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=true);importId||=crypto.randomUUID();previewStatus.textContent='Saving data Actiwatch...';
    const request=new AbortController(),timeout=setTimeout(()=>request.abort(),45000);saveController=request;const active=()=>ticket===scopeVersion&&scope===expected&&owner()===expected&&!suspended;
    try{const result=await journalApi('/api/actiwatch',{method:'POST',body:JSON.stringify({id:importId,filename,recording:value}),signal:request.signal});if(!active())return;accept(result.import,value);refreshFailed=false;render();previewStatus.textContent=result.duplicate?'This file has already been added.':'Data added. Summary saved in your personal diary.';await load();if(!active())return;void window.missionBook?.refresh();void window.missionConversations?.refreshDiary();void window.missionActivity?.refresh();draft=null;raw='';get('actiwatch-file').value='';dialog.close();}
    catch{if(active())previewStatus.textContent='Could not save. The file remains here, you can retry.';}
    finally{clearTimeout(timeout);if(active()){busy=false;if(saveController===request)saveController=null;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=false);save.disabled=!draft;}}
  });
  function profileChanged(){
    const next=owner();if(next!==scope){scope=next;scopeVersion++;loadVersion++;fileVersion++;loadController?.abort();saveController?.abort();loadController=saveController=null;latest=recording=draft=null;raw=filename='';importId=null;busy=loading=refreshFailed=false;save.disabled=true;get('actiwatch-file').value='';get('actiwatch-preview').hidden=true;previewStatus.textContent='No file selected yet.';dialog.querySelectorAll('input,select').forEach(input=>input.disabled=false);if(dialog.open)dialog.close();render();if(scope&&!suspended)void load();}
  }
  window.addEventListener('mission-profile-change',profileChanged);
  window.addEventListener('pagehide',()=>{suspended=true;scopeVersion++;loadVersion++;fileVersion++;loadController?.abort();saveController?.abort();loadController=saveController=null;busy=loading=false;dialog.querySelectorAll('input,select').forEach(input=>input.disabled=false);save.disabled=!draft;});
  window.addEventListener('pageshow',()=>{suspended=false;if(owner()!==scope)profileChanged();else if(scope)void load();});
  window.missionActiwatch=Object.freeze({refresh:load,current,recording:()=>current()?recording:null,series:()=>current()?recording.rows:[],status:()=>({loading,refreshFailed,observedAt:current()?.summary.end||null}),openImport});render();
  if(scope)void load();else if(window.missionProfileName?.load)void window.missionProfileName.load().then(()=>{if(owner()!==scope)profileChanged();}).catch(()=>{refreshFailed=true;render();});
})();
