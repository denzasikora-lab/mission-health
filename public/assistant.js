async function reserveAnswer(profile,message){
  if(profile!==crew[state.crew].id)throw new Error('cancelled');
  const context=await journalApi('/api/astronauts/'+profile+'/messages/'+message.id+'/context');
  if(profile!==crew[state.crew].id)throw new Error('cancelled');
  const saved=await journalApi('/api/astronauts/'+profile+'/messages/'+message.id+'/reply',{method:'POST',body:JSON.stringify({content:'',model:context.captureReply?'capture-history-v1':'journal-history-v1'})});
  message.replyStatus='pending';return saved.reply;
}
window.reserveAssistant={answer:reserveAnswer,onProfileChange(){journalState.transient=null}};
