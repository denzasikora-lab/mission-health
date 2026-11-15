(() => {
  const tones={neutral:'Neutral',happy:'Happy',sad:'Sad',angry:'Irritated',tense:'Tense'};
  const reasons={need_frames:'Insufficient frames',need_camera:'Camera recording required',model_unavailable:'Model unavailable',unstable:'Frames produced an unstable result',conditions_changed:'Capture conditions changed',no_reference:'No baseline selected',need_closeup:'A sharp close-up frame is required',not_enough_detail:'Insufficient detail',collecting:'Collecting baseline',compared:'Comparison complete',estimated:'Range determined',uncertain:'Unstable result',unavailable:'No result',pending:'Awaiting analysis',measured:'Signal properties measured',analyzed:'Analysis complete'};
  const visualTitles=['Face contour','Contour symmetry','Under-eye area','Cheek tone','Face height','Jawline','Lower face','Eye opening','Eye symmetry','Lip width','Cheek tone difference','Under-eye tone','Apparent age','New skin areas','Pigmentation changes','Face similarity'];
  const number=(value,digits=1)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits:digits}).format(value);
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const plain=value=>String(value||'').replace(/[\u2013\u2014]/g,'-').trim();
  const reason=value=>reasons[value]||'Insufficient data';
  const stamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'Time not saved';
  const range=value=>value&&finite(value.min)&&(value.max===null||finite(value.max))?(value.max===null?number(value.min,0)+' years and older':number(value.min,0)+'-'+number(value.max,0)+' years'):'';
  function acoustic(value){return value&&['level','quiet','clipping','seconds'].every(key=>finite(value[key]))&&value.level>=-120&&value.level<=1&&value.quiet>=0&&value.quiet<=1&&value.clipping>=0&&value.clipping<=1&&value.seconds>0?value:null;}
  function signalLines(features){
    const value=acoustic(features?.acoustic);return value?['Average level: '+number(value.level)+' dBFS','Quiet intervals: '+number(value.quiet*100)+'%','Clipping: '+number(value.clipping*100,2)+'%','Audio measured: '+number(value.seconds)+' s']:['No acoustic measurements obtained'];
  }
  function toneLines(features){
    const ranked=Array.isArray(features?.tone)?features.tone.filter(item=>tones[item?.label]&&finite(item.similarity)&&Math.abs(item.similarity)<=1.01).sort((a,b)=>b.similarity-a.similarity):[];
    return ranked.length?ranked.map(item=>tones[item.label]+' / description similarity '+number(item.similarity,2)).concat('Similarity is not emotion probability.'):['No model result'];
  }
  function ageLines(value){
    if(value?.status!=='estimated'||!range(value.range))return [reason(value?.reason||value?.status)];
    const result=['Apparent range: '+range(value.range)];
    if(value.reference?.range)result.push('Baseline: '+range(value.reference.range));
    const comparison={higher:'Range above baseline',lower:'Range below baseline',overlap:'Range overlaps the baseline',conditions_changed:'Lighting or angle changed, comparison paused',no_reference:'No baseline selected'};
    if(comparison[value.comparison])result.push(comparison[value.comparison]);
    result.push('Experimental appearance similarity, not biological age.');return result;
  }
  function skinLines(value){
    if(value?.status!=='compared')return [reason(value?.reason||value?.status)];
    const lines=['New areas: '+(finite(value.newCount)?number(value.newCount,0):'No data'),'Changed: '+(finite(value.changedCount)?number(value.changedCount,0):'No data')];
    const regions={forehead:'Forehead','left-cheek':'Left frame area / cheek','right-cheek':'Right frame area / cheek'};
    for(const item of (Array.isArray(value.items)?value.items:[]).slice(0,12)){
      const metrics=[];if(finite(item.diameterPixels))metrics.push('diameter '+number(item.diameterPixels)+' px');if(finite(item.areaPixels))metrics.push('area '+number(item.areaPixels)+' px²');if(finite(item.areaChangePercent))metrics.push('area change '+(item.areaChangePercent>0?'+':'')+number(item.areaChangePercent)+'%');if(finite(item.deltaE))metrics.push('color change '+number(item.deltaE)+' ΔE');
      if(metrics.length)lines.push((regions[item.region]||'Skin area')+': '+metrics.join(' / '));
    }
    lines.push('Local forehead and cheek image comparison. Candidates are not identified as moles or diseases.');return lines;
  }
  function dataText(value){
    if(Array.isArray(value)&&value.every(item=>tones[item?.label]))return toneLines({tone:value}).join('\n');
    if(value?.range||['estimated','uncertain'].includes(value?.status))return ageLines(value).join('\n');
    if(value?.coverage||value?.newCount!==undefined)return skinLines(value).join('\n');
    if(value?.acoustic)return signalLines(value).join('\n');
    return 'Technical features saved with the recording.';
  }
  function jsonAt(text,start){
    const first=text[start];if(first!=='{'&&first!=='[')return null;let quoted=false,escaped=false,depth=0;
    for(let at=start;at<text.length;at++){
      const char=text[at];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"'){quoted=true;continue;}if(char==='{'||char==='[')depth++;else if(char==='}'||char===']'){depth--;if(depth===0)try{return {value:JSON.parse(text.slice(start,at+1)),end:at+1};}catch{return null;}}
    }return null;
  }
  function readableText(value){
    const text=plain(value);let result='',at=0;
    while(at<text.length){const char=text[at],parsed=(char==='{'||char==='[')&&jsonAt(text,at);if(parsed){result+=dataText(parsed.value);at=parsed.end;}else{result+=char;at++;}}
    return result.replace(/\*\*/g,'').replace(/No signal/g,'Awaiting reading');
  }
  function legacy(entry){
    const text=String(entry?.content||'');if(!/^(Video|Audio)\s*(observation|recording)/.test(text))return null;
    const kind=text.startsWith('Video')?'video':'audio',features={};
    for(const [key,label] of [['tone','EmbeddingGemma 2:'],['apparentAge','Apparent age / experimental similarity:'],['skin','Skin comparison / client processor observations:']]){const index=text.indexOf(label);if(index<0)continue;const at=text.slice(index+label.length).search(/[\[{]/);if(at>=0){const parsed=jsonAt(text,index+label.length+at);if(parsed)features[key]=parsed.value;}}
    const level=text.match(/average level (-?[\d.]+) dBFS/),quiet=text.match(/quiet windows below -40 dBFS ([\d.]+)%/),clipping=text.match(/clipped samples ([\d.]+)%/),duration=text.match(/\/\s*([\d.]+) s(?:\n|$)/);
    if(level&&quiet&&clipping&&duration)features.acoustic={level:Number(level[1]),quiet:Number(quiet[1])/100,clipping:Number(clipping[1])/100,seconds:Number(duration[1])};
    const transcript=text.match(/Recognized speech: ([\s\S]*?)(?=\n(?:Self-reported wellbeing|Original audio features|Audio not decoded|EmbeddingGemma 2|Apparent age|Skin comparison)|$)/)?.[1]||'';
    return {kind,duration:duration?Number(duration[1]):null,transcript,features,mediaUrl:null,analysis:'',status:Object.keys(features).length?'measured':'pending'};
  }
  function observation(entry){const value=entry?.observation||legacy(entry);return value&&['audio','video'].includes(value.kind)?value:null;}
  function media(value){
    const url=value?.mediaUrl;if(!['audio','video'].includes(value?.kind)||typeof url!=='string'||!/^\/(?:api\/media-analysis\/[a-f0-9-]{36}\/media|assets\/archive\/[A-Za-z0-9._-]+\.(?:mp4|mp3|wav|webm|ogg))$/i.test(url))return null;
    return {kind:value.kind,url};
  }
  function observationText(value,{compact=false}={}){
    const blocks=['Acoustic properties\n'+signalLines(value.features).join('\n')];
    if(!compact)blocks.push('Voice tone\n'+toneLines(value.features).join('\n'));
    blocks.push('Recognized speech\n'+(readableText(value.transcript)||'No intelligible speech detected.'));
    blocks.push((compact?'Recording review':'Recording analysis')+'\n'+(readableText(value.analysis)||reason(value.status)));
    if(value.kind==='video'&&!compact){blocks.push('Apparent age\n'+ageLines(value.features?.apparentAge).join('\n'));blocks.push('Spots and pigmentation\n'+skinLines(value.features?.skin).join('\n'));const face=value.features?.faceComparison;if(face?.method==='face-session-v1')blocks.push('Face comparison\n'+(finite(face.cosine)?'Cosine similarity: '+number(face.cosine,3):face.status==='first_session'?'First face recording saved':'Capture conditions need matching')+(face.reference?'\nPrevious recording: '+stamp(face.reference.at):'')+(face.values?.underEye?.valid?'\nUnder-eye contrast change: '+number(face.values.underEye.delta)+' L*':''));}
    return blocks.join('\n\n');
  }
  function latest(entries){const result={};for(const entry of [...entries].filter(item=>!item.archiveSample&&!item.archiveCurrent&&!item.preflight).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))){const value=observation(entry);if(value&&!result[value.kind])result[value.kind]={entry,value};}return result;}
  function missing(value){return !value||/^(?:-|No |Need|Insufficient|Undetermined)/.test(value);}
  function captureVisual(document,entries=[]){
    const saved=latest(entries).video?.value?.features||{},nodes=Array.from(document.querySelectorAll('#appearance-metrics .appearance-metric'));
    return visualTitles.map(title=>{
      const candidate=nodes.find(item=>plain(item.querySelector('.appearance-metric-title')?.textContent)===title),node=['sample','preflight'].includes(candidate?.dataset?.resultSource)||['sample','preflight'].includes(candidate?.dataset?.source)||candidate?.closest?.('[data-result-source="sample"],[data-source="sample"],[data-result-source="preflight"]')?null:candidate,result={title,value:plain(node?.querySelector('strong')?.textContent)||'No comparison',status:plain(node?.querySelector('.appearance-metric-status')?.textContent||node?.querySelector('small')?.textContent)||'No comparison',source:node?.dataset?.resultSource||'missing'};
      if(missing(result.value)&&title==='Apparent age'&&saved.apparentAge?.status==='estimated'&&range(saved.apparentAge.range)){result.value=range(saved.apparentAge.range);result.status='Latest saved analysis';result.source='saved';}
      if(missing(result.value)&&saved.skin?.status==='compared'&&['New skin areas','Pigmentation changes'].includes(title)){const count=title==='New skin areas'?saved.skin.newCount:saved.skin.changedCount;if(finite(count)){result.value=number(count,0);result.status='Latest baseline comparison';result.source='saved';}}
      if(title==='Face similarity'&&finite(saved.faceComparison?.cosine)&&missing(result.value)){result.value=number(saved.faceComparison.cosine,3);result.status='Cosine / previous recording';result.source='saved';}
      return result;
    });
  }
  function currentEntry(entries,{visual=[],wellbeing=null,wearable=null,now=new Date().toISOString()}={}){
    const recent=latest(entries),blocks=[];
    blocks.push('Self-report\n'+(wellbeing&&Number.isInteger(wellbeing.score)&&wellbeing.score>=1&&wellbeing.score<=100?wellbeing.score+'/100'+(wellbeing.label?' / '+plain(wellbeing.label):'')+(wellbeing.recordedAt?' / '+stamp(wellbeing.recordedAt):''):'No score selected yet'));
    for(const [kind,title] of [['audio','Latest audio'],['video','Latest video']]){const item=recent[kind];blocks.push(title+'\n'+(item?stamp(item.entry.createdAt)+'\n'+observationText(item.value):'No personal recording saved yet'));}
    blocks.push('Visual features\n'+(visual.length?visual:visualTitles.map(title=>({title,value:'No comparison',status:'Recording and personal baseline required'}))).map(item=>{const value=plain(item.value)||'No comparison',status=plain(item.status);return plain(item.title)+': '+value+(status&&status!==value?' / '+status:'');}).join('\n'));
    const imported=wearable?.latest,summary=imported?.summary?.latest24h;if(summary&&wearable.source!=='demo'){const values=[];if(finite(summary.sleepSeconds))values.push('Sleep: '+number(summary.sleepSeconds/3600)+' h');if(finite(summary.activityCounts))values.push('Movement: '+number(summary.activityCounts,0)+' samples');if(finite(summary.meanLightLux))values.push('Average illuminance: '+number(summary.meanLightLux)+' lx');if(values.length)blocks.push('Actiwatch / personal import\n'+values.join('\n'));}
    return {id:'archive-current-results',title:'Current results',content:'Current results\n\n'+blocks.join('\n\n'),createdAt:now,archiveCurrent:true};
  }
  function introEntry(){
    return {id:'archive-nasa-flight-preview',archiveIntro:true,title:'A moment aboard the ISS',content:'A moment aboard the ISS\n\nMatthew Dominick / NASA\nTwo seconds of public flight footage.'};
  }
  function presentation(entry){
    if(entry.archiveIntro===true)return {title:'A moment aboard the ISS',content:entry.content,media:{kind:'video',url:'/assets/diary-demo/nasa-dominick-lab-2s.mp4',publicPreview:true},structured:true,source:'nasa',sourceUrl:'https://www.youtube.com/shorts/FKsghZt8bLs'};
    const value=observation(entry),sample=entry.archiveSample===true,current=entry.archiveCurrent===true;
    if(!value)return {content:readableText(entry.content),title:entry.title||'',media:null,structured:current,source:current?'current':'personal'};
    const title=plain(entry.title)||(value.kind==='video'?'Video observation':'Audio observation'),duration=finite(value.duration)&&value.duration>0?' / '+number(value.duration)+' s':'',player=media(value);if(sample&&player?.kind==='video')player.poster='/assets/stories/iss075e0003980.jpg';
    const blocks=[title+duration];if(sample)blocks.push('Preloaded recording / technical sample');blocks.push(observationText(value,{compact:sample}));
    if(!player)blocks.push('Media file unavailable / recording results preserved.');
    if(sample&&plain(entry.content))blocks.push('Sources\n'+readableText(entry.content));
    return {title:title+duration,content:blocks.join('\n\n'),media:player,structured:true,source:sample?'sample':'personal'};
  }
  const headings=new Set(['Acoustic properties','Voice tone','Recognized speech','Recording analysis','Recording review','Apparent age','Spots and pigmentation','Self-report','Latest audio','Latest video','Visual features','Sources','Actiwatch / personal import']);
  function splitTrailingHeading(text){const match=text.match(/(?:^|\n)([^\n]+)\s*$/);return match&&headings.has(match[1].trim())?{body:text.slice(0,match.index).trimEnd(),heading:match[1].trim()}:null;}
  function renderText(root,text,create){
    for(const paragraph of text.split(/\n\s*\n/)){const [first,...rest]=paragraph.split('\n');if(headings.has(first)){const body=rest.join('\n');if(!body.trim())continue;const section=create('section','book-observation-section');section.append(create('h4','',first),create('p','',body));root.append(section);}else root.append(create('p','',paragraph));}
  }
  window.missionArchiveContent={introEntry,presentation,observation,latest,currentEntry,captureVisual,readableText,renderText,splitTrailingHeading,visualTitles};
})();
