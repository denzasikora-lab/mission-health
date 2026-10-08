const journalState={profile:null,mode:'ask',messages:[],hasMore:false,capabilities:{memory:false,history:false,assistant:false},loading:false,loadError:false,notice:null,assistantError:null};
const journalDrafts=new Map();
let journalLoadVersion=0;
function draftFor(id=crew[state.crew].id){if(!journalDrafts.has(id))journalDrafts.set(id,{content:'',mode:'ask',pendingId:null,busy:false});return journalDrafts.get(id)}
function journalDate(value){return new Intl.DateTimeFormat(text().locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}
function element(tag,className,content){const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node}
async function journalApi(path,options){
  const response=await fetch(path,{...options,headers:{'content-type':'application/json',...options?.headers}});let body;try{body=await response.json()}catch{throw new Error('storage_unavailable')}
  if(!response.ok)throw new Error(body.error||'storage_unavailable');return body;
}
function showJournalNotice(key){journalState.notice=key;renderJournalNotice()}
function renderJournalNotice(){const t=text(),notice=$('journal-notice');notice.hidden=!journalState.notice;notice.replaceChildren();if(!journalState.notice)return;notice.append(element('span','',t[journalState.notice]||t.saveError));if(journalState.notice==='aiUnavailable'&&journalState.assistantError?.upstreamStatus)notice.append(element('span','',t.aiServiceError.replace('{status}',journalState.assistantError.upstreamStatus)));if(journalState.loadError){const button=element('button','older-button',t.retry);button.type='button';button.addEventListener('click',()=>loadJournal());notice.append(button)}}
function renderJournalMessages(){
  const t=text(),list=$('journal-messages');list.replaceChildren();
  if(journalState.loading&&!journalState.messages.length){list.append(element('p','journal-empty',t.loading));return}
  if(!journalState.messages.length){const empty=element('div','journal-empty');empty.append(element('h3','',t.journalEmpty),element('p','',t.journalEmptyText));list.append(empty);return}
  for(const message of journalState.messages){
    const article=element('article','journal-message '+(message.role==='assistant'?'assistant':'user'));article.id='entry-'+message.id;
    const meta=element('div','message-meta');meta.append(element('strong','',message.role==='assistant'?(message.source==='comparison'?t.visualHistory:message.source==='history'?t.journalHistory:message.source?.startsWith('browser:')?t.reserveAssistant:t.assistant):t.you));const time=element('time','',journalDate(message.createdAt));time.dateTime=message.createdAt;meta.append(time);
    for(const photo of message.attachments||[])if(window.photos)article.append(window.photos.messagePhoto(photo));
    if(message.source?.startsWith('browser:'))article.append(element('p','photo-scope',t.experimentalWarning));const content=element('div','message-content',message.content);content.dir='auto';article.append(meta,content);
    if(message.role!=='assistant')article.append(element('div','message-memory',message.vectorStatus==='indexed'?t.indexed:journalState.capabilities.memory?t.pendingIndex:t.journalSaved));
    if(message.role==='user'&&message.replyStatus==='pending'){const retry=element('button','reply-retry',t.retryAnswer);retry.type='button';retry.disabled=draftFor().busy;retry.addEventListener('click',()=>retryJournalMessage(message));article.append(retry)}
    if(message.references?.length){const refs=element('details','message-references');refs.append(element('summary','',t.memoryMatches));for(const reference of message.references){const node=element('div','',journalDate(reference.createdAt)+' · '+reference.content);if(reference.type==='photo'){const img=element('img','reference-photo');img.src=reference.url;img.alt=reference.region;img.loading='lazy';node.append(img)}node.dir='auto';refs.append(node)}article.append(refs)}
    list.append(article);
  }
  if(journalState.transient){const article=element('article','journal-message assistant');article.append(element('div','message-meta',t.reserveAssistant),element('div','message-content',journalState.transient));list.append(article)}
}
function renderJournal(){
  const t=text(),draft=draftFor();document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.view===state.view)));
  $('health-view').hidden=state.view!=='health';$('journal-view').hidden=state.view!=='journal';document.querySelector('.insight-column').hidden=state.view==='journal';
  $('journal-name').textContent=t.people[state.crew].name;$('journal-storage').textContent=journalState.messages.length?t.journalSaved:t.journalTitle;
  $('journal-capabilities').replaceChildren(element('span','',journalState.capabilities.memory?t.memoryReady:journalState.capabilities.history?t.historyReady:t.memoryOffline),element('span','',journalState.capabilities.assistantState==='unavailable'?t.aiTemporarilyUnavailable:journalState.capabilities.assistantState==='ready'?t.aiReady:journalState.capabilities.assistant?t.aiConfigured:t.aiOffline));
  $('journal-input').placeholder=t.composerPlaceholder;
  $('journal-input').value=draft.content;$('journal-length').textContent=draft.content.length+' / 6000';$('journal-send').disabled=draft.busy||!draft.content.trim()||journalState.loading||journalState.loadError;
  $('journal-send').textContent=draft.busy?(draft.mode==='ask'?t.responding:t.sending):draft.mode==='ask'?t.sendAsk:t.send;document.querySelectorAll('[data-journal-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.journalMode===draft.mode)));
  $('journal-older').hidden=!journalState.hasMore;$('journal-older').disabled=journalState.loading;renderJournalMessages();renderJournalNotice();window.photos?.render();
}
async function loadJournal(older=false){
  const profile=crew[state.crew].id,version=++journalLoadVersion;journalState.loading=true;journalState.loadError=false;journalState.notice=null;journalState.assistantError=null;renderJournal();
  try{
    const cursor=older&&journalState.messages.length?'?before='+encodeURIComponent(journalState.messages[0].createdAt):'';
    const result=await journalApi('/api/astronauts/'+profile+'/messages'+cursor);if(version!==journalLoadVersion||profile!==crew[state.crew].id)return;
    journalState.messages=older?[...result.messages,...journalState.messages]:result.messages;journalState.hasMore=result.hasMore;journalState.capabilities=result.capabilities;
  }catch(error){if(version!==journalLoadVersion)return;journalState.loadError=true;journalState.notice='loadError'}
  finally{if(version===journalLoadVersion){journalState.loading=false;renderJournal();if(!older){$('journal-messages').scrollTop=$('journal-messages').scrollHeight;void window.photos?.load(crew[state.crew].id)}}}
}
window.journal={onProfileChange(){const profile=crew[state.crew].id;if(journalState.profile!==profile){window.reserveAssistant?.onProfileChange(profile);journalState.transient=null;window.photos?.onProfileChange();journalState.profile=profile;journalState.messages=[];journalState.hasMore=false;journalState.notice=null;journalState.loadError=false;++journalLoadVersion;if(state.view==='journal'){void loadJournal();return}}renderJournal()}};
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;renderJournal();if(state.view==='journal')void loadJournal()}));
document.querySelector('.view-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const selected=event.key==='Home'?'health':event.key==='End'?'journal':state.view==='health'?'journal':'health';document.querySelector('[data-view="'+selected+'"]').click();document.querySelector('[data-view="'+selected+'"]').focus()});
document.querySelectorAll('[data-journal-mode]').forEach(button=>button.addEventListener('click',()=>{draftFor().mode=button.dataset.journalMode;renderJournal();$('journal-input').focus()}));
document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{const draft=draftFor();draft.content=text()[{sleep:'promptTextSleep',exercise:'promptTextExercise',recall:'promptTextRecall'}[button.dataset.prompt]];draft.mode='ask';draft.pendingId=null;renderJournal();$('journal-input').focus()}));
$('journal-input').addEventListener('input',()=>{const draft=draftFor();draft.content=$('journal-input').value;draft.pendingId=null;$('journal-length').textContent=draft.content.length+' / 6000';$('journal-send').disabled=draft.busy||(!draft.content.trim()&&!draft.photo)||journalState.loading||journalState.loadError});
$('journal-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();$('journal-form').requestSubmit()}});
$('journal-older').addEventListener('click',()=>loadJournal(true));
$('journal-form').addEventListener('submit',async event=>{
  event.preventDefault();const profile=crew[state.crew].id,draft=draftFor(profile);if(draft.busy||(!draft.content.trim()&&!draft.photo)||journalState.loading||journalState.loadError)return;
  if(!journalState.capabilities.assistant){showJournalNotice('aiUnavailable');return}
  const sent=draft.content.trim()||(draft.photo?text().photoPrompt:'');draft.pendingId??=crypto.randomUUID();draft.busy=true;showJournalNotice(null);renderJournal();
  try{
    const attachments=await window.photos?.beforeSend(profile)||[];
    const result=await journalApi('/api/astronauts/'+profile+'/messages',{method:'POST',body:JSON.stringify({id:draft.pendingId,content:sent,mode:'ask',language:state.language,attachments})});
    if(profile===crew[state.crew].id){const index=journalState.messages.findIndex(item=>item.id===result.message.id);if(index===-1)journalState.messages.push(result.message);else journalState.messages[index]=result.message;renderJournalMessages()}
    if(result.replyError&&attachments.length&&window.reserveAssistant){try{result.reply=await window.reserveAssistant.answer(profile,result.message)}catch{}}
    if(draft.photo&&attachments.includes(draft.photo.photo.id))draft.photo.temporary=false;
    if(draft.content.trim()===sent||!draft.content.trim()){draft.content='';draft.pendingId=null;window.photos?.clear(profile,attachments)}
    if(profile===crew[state.crew].id){for(const message of [result.message,result.reply].filter(Boolean)){const index=journalState.messages.findIndex(item=>item.id===message.id);if(index===-1)journalState.messages.push(message);else journalState.messages[index]=message};journalState.assistantError=result.assistantError||null;journalState.capabilities.assistantState=result.assistantState||'configured';showJournalNotice(result.replyError?'aiUnavailable':'saved')}
  }catch(error){if(profile===crew[state.crew].id)showJournalNotice(error.message==='assistant_unavailable'?'aiUnavailable':'saveError')}
  finally{draft.busy=false;if(profile===crew[state.crew].id){renderJournal();$('journal-messages').scrollTop=$('journal-messages').scrollHeight}}
});
window.journal.onProfileChange();

async function retryJournalMessage(message){
  const profile=crew[state.crew].id,draft=draftFor(profile);if(draft.busy)return;draft.busy=true;showJournalNotice(null);renderJournal();
  try{
    const result=await journalApi('/api/astronauts/'+profile+'/messages',{method:'POST',body:JSON.stringify({id:message.id,content:message.content,mode:'ask',language:message.language,attachments:message.attachmentIds||[]})});
    if(profile!==crew[state.crew].id)return;
    for(const item of [result.message,result.reply].filter(Boolean)){const index=journalState.messages.findIndex(x=>x.id===item.id);if(index===-1)journalState.messages.push(item);else journalState.messages[index]=item}
    journalState.assistantError=result.assistantError||null;journalState.capabilities.assistantState=result.assistantState||(result.replyError?'unavailable':'ready');showJournalNotice(result.replyError?'aiUnavailable':'saved');
  }catch{if(profile===crew[state.crew].id){journalState.capabilities.assistantState='unavailable';showJournalNotice('aiUnavailable')}}
  finally{draft.busy=false;if(profile===crew[state.crew].id)renderJournal()}

}
