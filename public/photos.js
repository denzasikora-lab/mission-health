let cameraStream=null,cameraVersion=0,cameraBlob=null,cameraPreviewUrl=null,cameraFacing='user',cameraProfile=null,cameraSource=null,cameraBusy=false;
let cameraKind='photo',clipRecorder=null,clipTimer=null,clipStarted=0;
let imageWorker=null;
const imageJobs=new Map();
const photoHistoryState={profile:null,photos:[],hasMore:false,version:0};
function renderPhotoHistory(){const t=text(),node=$('photo-history-list');node.replaceChildren();$('photo-history').hidden=!photoHistoryState.photos.length;$('photo-history-older').hidden=!photoHistoryState.hasMore;for(const photo of photoHistoryState.photos){const button=element('button');button.type='button';const img=element('img');img.src=photo.posterUrl||photo.url;img.alt=photo.region==='face'?t.regionFace:photo.region;img.loading='lazy';button.append(img,element('span','',(photo.kind==='video'?t.videoLabel+' · ':'')+img.alt),element('span','',journalDate(photo.createdAt)));button.addEventListener('click',()=>showPhotoComparison(crew[state.crew].id,photo.id));node.append(button)}}
async function loadPhotoHistory(profile,older=false){const version=++photoHistoryState.version;try{const last=older?photoHistoryState.photos.at(-1):null,cursor=last?'?before='+encodeURIComponent(last.createdAt)+'&last='+last.id:'';const result=await journalApi('/api/astronauts/'+profile+'/photos'+cursor);if(version!==photoHistoryState.version||profile!==crew[state.crew].id)return;photoHistoryState.profile=profile;photoHistoryState.photos=older?[...photoHistoryState.photos,...result.photos]:result.photos;photoHistoryState.hasMore=result.hasMore;renderPhotoHistory()}catch{}}
function photoNotice(key){$('camera-notice').textContent=key?text()[key]:''}
function stopCamera(){if(clipRecorder?.state==='recording')clipRecorder.stop();clearInterval(clipTimer);clipTimer=null;++cameraVersion;cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;$('camera-video').srcObject=null}
function closeCamera(){if(cameraBusy)return;stopCamera();$('camera-dialog').close();if(cameraPreviewUrl)URL.revokeObjectURL(cameraPreviewUrl);cameraPreviewUrl=null;cameraBlob=null}
function resetCameraPreview(){cameraBlob=null;if(cameraPreviewUrl)URL.revokeObjectURL(cameraPreviewUrl);cameraPreviewUrl=null;$('camera-preview').hidden=true;$('clip-preview').pause();$('clip-preview').removeAttribute('src');$('clip-preview').hidden=true;$('camera-use').disabled=true;$('camera-retake').hidden=true}
async function startCamera(){
  stopCamera();resetCameraPreview();photoNotice(null);const version=cameraVersion;
  $('camera-video').hidden=true;$('camera-capture').hidden=true;$('camera-switch').hidden=true;$('video-record').hidden=true;$('recording-time').hidden=true;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('unavailable');
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:cameraFacing},width:{ideal:1280},height:{ideal:960}},audio:false});
    if(version!==cameraVersion||!$('camera-dialog').open||cameraProfile!==crew[state.crew].id){stream.getTracks().forEach(track=>track.stop());return}
    cameraStream=stream;const video=$('camera-video');video.srcObject=stream;await video.play();video.hidden=false;$('camera-capture').hidden=cameraKind!=='photo';$('video-record').hidden=cameraKind!=='video';$('video-record').textContent=text().recordVideo;$('camera-switch').hidden=false;
  }catch{if(version===cameraVersion)photoNotice('cameraDenied')}
}
function openPhotoDialog(source,kind='photo'){cameraKind=kind;$('video-guidance').hidden=kind!=='video';$('video-record').hidden=true;$('recording-time').hidden=true;
  cameraProfile=crew[state.crew].id;cameraSource=source;cameraBusy=false;resetCameraPreview();photoNotice(null);
  $('camera-video').hidden=true;$('camera-capture').hidden=true;$('camera-switch').hidden=true;$('camera-use').textContent=cameraKind==='video'?text().attachVideo:text().attachPhoto;
  $('camera-dialog').showModal();if(source==='camera')void startCamera();
}
async function compressedPhoto(source){
  const isVideo=source instanceof HTMLVideoElement,width=isVideo?source.videoWidth:source.naturalWidth,height=isVideo?source.videoHeight:source.naturalHeight;
  if(!width||!height||width<32||height<32)throw new Error('invalid_photo');
  const scale=Math.min(1,1600/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob||blob.size>3000000)throw new Error('invalid_photo');return {blob,width:canvas.width,height:canvas.height};
}
function previewPhoto(photo){photo.kind='photo';cameraBlob=photo;cameraPreviewUrl=URL.createObjectURL(photo.blob);$('camera-preview').src=cameraPreviewUrl;$('camera-preview').alt=text().currentPhoto;$('camera-preview').hidden=false;$('camera-video').hidden=true;$('camera-capture').hidden=true;$('camera-switch').hidden=true;$('camera-retake').hidden=cameraSource!=='camera';$('camera-use').disabled=false;stopCamera()}
function photoPhase(attachment){const t=text();if(attachment.phase==='photoLoading'&&attachment.progress){return t.photoLoading+' · '+Math.round(attachment.progress.loaded/1000000)+' / '+Math.round(attachment.progress.total/1000000)+' MB'}return t[attachment.phase]||''}
function renderPhotoAttachment(){
  const t=text(),draft=draftFor(),attachment=draft.photo,node=$('photo-attachment');node.hidden=!attachment;node.replaceChildren();if(location.hostname==='127.0.0.1')node.title=attachment?.error||'';
  if(attachment){const img=element('img');img.src=attachment.previewUrl||attachment.photo.posterUrl||attachment.photo.url;img.alt=attachment.photo.region==='face'?t.regionFace:attachment.photo.region;const info=element('div','photo-attachment-info');info.append(element('strong','',attachment.photo.region==='face'?t.regionFace:attachment.photo.region),element('span','photo-progress',photoPhase(attachment)));const remove=element('button','',t.removePhoto);remove.type='button';remove.disabled=draft.busy;remove.addEventListener('click',()=>removeAttachment());info.append(remove);if(attachment.phase==='photoVectorUnavailable'){const retry=element('button','',t.retryVectors);retry.type='button';retry.disabled=draft.busy;retry.addEventListener('click',()=>{attachment.pending=processPhoto(crew[state.crew].id,attachment);renderPhotoAttachment()});info.append(retry)}node.append(img,info)}
  $('open-camera').disabled=draft.busy||!journalState.capabilities.photos;$('open-video').disabled=$('open-camera').disabled;$('upload-video').disabled=$('open-camera').disabled;$('upload-photo').disabled=$('open-camera').disabled;
  $('journal-send').disabled=draft.busy||(!draft.content.trim()&&!draft.photo)||journalState.loading||journalState.loadError;
  if(draft.busy&&attachment&&['photoLoading','photoEncoding'].includes(attachment.phase))$('journal-send').textContent=t.photoPreparing;
}
function embeddingJob(blob,attachment){
  if(!imageWorker){imageWorker=new Worker('/embedding-worker.js?v=20261008-chat15',{type:'module'});imageWorker.onmessage=event=>{const job=imageJobs.get(event.data.id);if(!job)return;const data=event.data;if(data.type==='progress'){job.attachment.phase='photoLoading';job.attachment.progress={loaded:data.loaded,total:data.total};renderPhotoAttachment()}else if(data.type==='encoding'){job.attachment.phase='photoEncoding';renderPhotoAttachment()}else if(data.type==='result'||data.type==='error'){clearTimeout(job.timer);imageJobs.delete(data.id);data.type==='result'?job.resolve(data):job.reject(new Error(data.reason||'embedding_unavailable'))}};imageWorker.onerror=event=>{console.warn('Loading photo processor:',event.message); for(const job of imageJobs.values()){clearTimeout(job.timer);job.reject(new Error(event.message||'worker_unavailable'))}imageJobs.clear();imageWorker.terminate();imageWorker=null}}
  return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{imageJobs.delete(id);reject(new Error('embedding_unavailable'))},180000);imageJobs.set(id,{resolve,reject,attachment,timer});imageWorker.postMessage({id,blob,kind:attachment.photo.kind,frames:attachment.frames,duration:attachment.photo.duration})});
}
async function processPhoto(profile,attachment){
  attachment.phase='photoLoading';attachment.progress=null;renderPhotoAttachment();
  try{const blob=attachment.blob||await (await fetch(attachment.photo.url)).blob();if(attachment.photo.kind==='video'&&!attachment.frames){const clip=await sampledClip(blob,attachment.photo.duration);attachment.frames=clip.frames}const result=await embeddingJob(blob,attachment);const saved=await journalApi('/api/astronauts/'+profile+'/photos/'+attachment.photo.id,{method:'PATCH',body:JSON.stringify({model:result.model,vector:result.vector})});attachment.photo=saved.photo;attachment.phase='photoIndexed';for(const message of journalState.messages)for(const photo of message.attachments||[])if(photo.id===saved.photo.id)Object.assign(photo,saved.photo)}catch(error){console.warn('Image model:',error.message);attachment.error=error.message;attachment.phase='photoVectorUnavailable'}
  finally{if(profile===crew[state.crew].id){renderPhotoAttachment();void loadPhotoHistory(profile)}}
}
async function removeAttachment(){
  const draft=draftFor(),attachment=draft.photo;if(!attachment||draft.busy)return;
  if(attachment.temporary)try{await journalApi('/api/astronauts/'+crew[state.crew].id+'/photos/'+attachment.photo.id,{method:'DELETE'})}catch{showJournalNotice('photoError');return}
  if(attachment.previewUrl)URL.revokeObjectURL(attachment.previewUrl);draft.photo=null;draft.pendingId=null;renderJournal();
}
function photoCard(photo,caption){const figure=element('figure','comparison-photo');const img=element(photo.kind==='video'?'video':'img');img.src=photo.url;if(photo.kind==='video'){img.controls=true;img.playsInline=true;img.preload='metadata';img.poster=photo.posterUrl}else{img.alt=caption;img.loading='lazy'};figure.append(img,element('figcaption','',caption+' · '+journalDate(photo.createdAt)));return figure}
async function showPhotoComparison(profile,id){
  const node=$('photo-comparison');node.replaceChildren(element('p','',text().loading));$('comparison-dialog').showModal();
  try{const result=await journalApi('/api/astronauts/'+profile+'/photos/'+id+'?compare=1');if(profile!==crew[state.crew].id){$('comparison-dialog').close();return}const t=text(),pair=element('div','comparison-pair');pair.append(photoCard(result.current,t.currentPhoto));if(result.previous)pair.append(photoCard(result.previous,t.previousPhoto));node.replaceChildren(pair);
    if(!result.previous)node.append(element('p','',t.noPreviousPhoto));else if(result.method==='embeddinggemma2'){node.append(element('p','comparison-score',t.vectorSimilarity+': '+result.previous.similarity.toFixed(3)+' · '+t.comparedPhotos+': '+result.comparedCount));if(result.latest&&result.latest.id!==result.previous.id){const recent=element('details','');recent.append(element('summary','',t.chronologicalCompare),photoCard(result.latest,t.previousPhoto));node.append(recent)}}else node.append(element('p','',t.chronologicalCompare));
    const ask=element('button','photo-primary',t.askPhotoChanges);ask.type='button';ask.addEventListener('click',()=>{const draft=draftFor();if(draft.busy)return;draft.photo={photo:result.current,phase:result.current.vectorStatus==='indexed'?'photoIndexed':'photoVectorUnavailable',temporary:false};draft.content=result.current.kind==='video'?t.videoPrompt:t.photoPrompt;draft.mode='ask';draft.pendingId=null;$('comparison-dialog').close();renderJournal();$('journal-input').focus()});node.append(ask);
    const remove=element('button','photo-delete',t.photoDelete);remove.type='button';remove.addEventListener('click',async()=>{if(!confirm(text().photoDeleteConfirm))return;remove.disabled=true;try{await journalApi('/api/astronauts/'+profile+'/photos/'+id,{method:'DELETE'});$('comparison-dialog').close();await loadJournal();showJournalNotice('photoDeleted')}catch{remove.disabled=false;showJournalNotice('photoError')}});node.append(remove);
  }catch{node.replaceChildren(element('p','',text().photoError))}
}
window.photos={
  render(){renderPhotoAttachment();renderPhotoHistory()},
  load:loadPhotoHistory,
  onProfileChange(){++photoHistoryState.version;photoHistoryState.photos=[];photoHistoryState.hasMore=false;renderPhotoHistory();if($('camera-dialog').open&&!cameraBusy)closeCamera();$('comparison-dialog').close();stopCamera()},
  async beforeSend(profile){const attachment=draftFor(profile).photo;if(attachment?.pending)await Promise.race([attachment.pending,new Promise(resolve=>setTimeout(resolve,45000))]);return attachment?.photo.id?[attachment.photo.id]:[]},
  clear(profile,ids){const draft=draftFor(profile);if(ids.includes(draft.photo?.photo.id)){if(draft.photo.previewUrl)URL.revokeObjectURL(draft.photo.previewUrl);draft.photo=null}},
  messagePhoto(photo){const t=text(),card=element('div','message-photo');card.append(photoCard(photo,photo.region==='face'?t.regionFace:photo.region));const compare=element('button','',t.comparePhotos);compare.type='button';compare.addEventListener('click',()=>showPhotoComparison(crew[state.crew].id,photo.id));card.append(compare,element('span','photo-vector-status',photo.vectorStatus==='indexed'?t.photoIndexed:t.photoVectorUnavailable));return card}
};
$('photo-history-older').addEventListener('click',()=>loadPhotoHistory(crew[state.crew].id,true));
$('open-camera').addEventListener('click',()=>openPhotoDialog('camera'));
$('open-video').addEventListener('click',()=>openPhotoDialog('camera','video'));
$('upload-video').addEventListener('click',()=>$('video-file').click());
$('upload-photo').addEventListener('click',()=>$('photo-file').click());
$('photo-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;openPhotoDialog('upload');try{if(file.size>20000000)throw new Error('invalid_photo');const url=URL.createObjectURL(file),image=new Image();try{image.src=url;await image.decode();previewPhoto(await compressedPhoto(image))}finally{URL.revokeObjectURL(url)}}catch{photoNotice('invalidPhoto')}});
$('camera-capture').addEventListener('click',async()=>{if(cameraBusy)return;try{previewPhoto(await compressedPhoto($('camera-video')))}catch{photoNotice('invalidPhoto')}});
$('camera-retake').addEventListener('click',()=>{if(!cameraBusy)void startCamera()});
$('camera-switch').addEventListener('click',()=>{if(cameraBusy)return;cameraFacing=cameraFacing==='user'?'environment':'user';void startCamera()});
$('camera-close').addEventListener('click',closeCamera);
$('camera-dialog').addEventListener('cancel',event=>{event.preventDefault();closeCamera()});
$('camera-dialog').addEventListener('close',stopCamera);
$('comparison-close').addEventListener('click',()=>$('comparison-dialog').close());
$('photo-region').addEventListener('change',()=>{const skin=$('photo-region').value==='skin';$('photo-area').hidden=!skin;$('photo-area-label').hidden=!skin});
$('camera-use').addEventListener('click',async()=>{
  if(!cameraBlob||cameraBusy||cameraProfile!==crew[state.crew].id)return;const region=$('photo-region').value==='face'?'face':$('photo-area').value.trim();if(!region){photoNotice('photoAreaRequired');$('photo-area').focus();return}
  const profile=cameraProfile,photo=cameraBlob,draft=draftFor(profile);if(draft.photo){showJournalNotice('photoError');closeCamera();return}
  cameraBusy=true;$('camera-use').disabled=true;$('camera-use').textContent=text().photoSaving;const form=new FormData();form.set('id',crypto.randomUUID());form.set('kind',photo.kind||'photo');form.set('photo',photo.blob,photo.kind==='video'?'clip.mp4':'photo.jpg');if(photo.kind==='video'){form.set('duration',photo.duration);const frames=photo.frames;for(const index of [0,Math.floor(frames.length/2),frames.length-1])form.append('frame',frames[index].blob,'frame.jpg')}form.set('region',region);form.set('width',photo.width);form.set('height',photo.height);
  try{const response=await fetch('/api/astronauts/'+profile+'/photos',{method:'POST',body:form}),result=await response.json();if(!response.ok)throw new Error(result.error);const attachment={photo:result.photo,blob:photo.blob,frames:photo.frames,previewUrl:photo.kind==='video'?URL.createObjectURL(photo.frames[0].blob):URL.createObjectURL(photo.blob),phase:'photoLoading',temporary:true};draft.photo=attachment;draft.mode='ask';draft.pendingId=null;if(!draft.content.trim())draft.content=photo.kind==='video'?text().videoPrompt:text().photoPrompt;cameraBusy=false;closeCamera();attachment.pending=processPhoto(profile,attachment);void loadPhotoHistory(profile);renderJournal()}catch{cameraBusy=false;$('camera-use').disabled=false;$('camera-use').textContent=cameraKind==='video'?text().attachVideo:text().attachPhoto;photoNotice('photoError')}
});
window.addEventListener('pagehide',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();$('camera-capture').hidden=true;$('camera-switch').hidden=true;$('camera-retake').hidden=cameraSource!=='camera'}});
renderPhotoAttachment();

async function sampledClip(blob,knownDuration){
  if(blob.size>20000000)throw new Error('invalid_video');const video=document.createElement('video'),url=URL.createObjectURL(blob);video.muted=true;video.playsInline=true;video.preload='auto';
  try{await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('invalid_video'));video.src=url});const duration=Number.isFinite(video.duration)?video.duration:knownDuration;if(!Number.isFinite(duration)||duration<.1||duration>15.5)throw new Error('video_too_long');
    const count=Math.min(12,Math.max(1,Math.ceil(duration))),frames=[];for(let index=0;index<count;index++){const timestamp=Math.min(duration-.05,(index+.5)*duration/count);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('invalid_video')),10000);video.onseeked=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(new Error('invalid_video'))};video.currentTime=timestamp});const photo=await compressedPhoto(video);frames.push({blob:photo.blob,timestamp})}
    return {blob,kind:'video',duration,width:video.videoWidth,height:video.videoHeight,frames};
  }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
function previewClip(clip){cameraBlob=clip;cameraPreviewUrl=URL.createObjectURL(clip.blob);$('clip-preview').src=cameraPreviewUrl;$('clip-preview').hidden=false;$('camera-video').hidden=true;$('camera-preview').hidden=true;$('video-record').hidden=true;$('recording-time').hidden=true;$('camera-switch').hidden=true;$('camera-retake').hidden=cameraSource!=='camera';$('camera-use').disabled=false;stopCamera()}
$('video-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;openPhotoDialog('upload','video');photoNotice('samplingVideo');try{previewClip(await sampledClip(file));photoNotice(null)}catch(error){photoNotice(error.message==='video_too_long'?'videoTooLong':'invalidVideo')}});
$('video-record').addEventListener('click',()=>{
  if(cameraBusy)return;if(clipRecorder?.state==='recording'){clipRecorder.stop();return}if(!cameraStream||!window.MediaRecorder){photoNotice('videoUnavailable');return}
  const mime=['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp8','video/mp4','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime){photoNotice('videoUnavailable');return}
  const profile=cameraProfile,chunks=[];clipRecorder=new MediaRecorder(cameraStream,{mimeType:mime,videoBitsPerSecond:1200000});clipStarted=performance.now();const recorder=clipRecorder;
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};recorder.onerror=()=>{stopCamera();photoNotice('invalidVideo')};recorder.onstop=async()=>{clearInterval(clipTimer);clipTimer=null;$('recording-time').hidden=true;$('video-record').hidden=true;const duration=Math.min(15,(performance.now()-clipStarted)/1000),blob=new Blob(chunks,{type:recorder.mimeType});stopCamera();if(profile!==crew[state.crew].id||!$('camera-dialog').open)return;photoNotice('samplingVideo');try{previewClip(await sampledClip(blob,duration));photoNotice(null)}catch{photoNotice('invalidVideo')}};
  recorder.start(250);$('video-record').textContent=text().stopRecording;$('camera-switch').hidden=true;$('recording-time').hidden=false;clipTimer=setInterval(()=>{const seconds=Math.floor((performance.now()-clipStarted)/1000);$('recording-time').textContent=seconds+' / 15 s';if(seconds>=15&&recorder.state==='recording')recorder.stop()},250);
});
