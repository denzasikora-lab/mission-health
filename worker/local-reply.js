async function localReplyContext(env,user,astronaut,row){
  let references=(await retrieve(env,user,astronaut,row.content)).filter(x=>x.id!==row.id);const matched=references.length>0;
  const recent=await history(env,user,astronaut);if(!references.length)references=recent.messages.filter(x=>x.role!=='assistant'&&x.id!==row.id).slice(-4);
  return {ownerId:user,astronautId:astronaut,query:row.content,language:row.language,matched,references:references.slice(0,4),history:recent.messages.slice(-4),photos:await photoContext(env,user,astronaut,JSON.parse(row.attachments_json||'[]'),row.content)};
}
async function localReplyRoute(request,env,user,astronaut,id,action){
  const row=await database(env).prepare("SELECT * FROM journal_messages WHERE id=? AND owner_id=? AND astronaut_id=? AND role='user'").bind(id,user,astronaut).first();if(!row)fail('not_found',404);
  if(action==='context'&&request.method==='GET'){const context=await localReplyContext(env,user,astronaut,row);return json({system:diaryPrompt(context),query:row.content,language:row.language,records:context.references.map(x=>({date:x.createdAt,text:x.content.slice(0,800)})),history:context.history.map(x=>({role:x.role==='assistant'?'assistant':'user',content:x.content.slice(0,600)})),photos:context.photos.map(({dataUrl,...photo})=>photo),captureReply:await captureHistoryReply(env,user,astronaut,context),historyReply:journalHistoryReply(context,row)})}
  if(action!=='reply'||request.method!=='POST')fail('method_not_allowed',405);
  const raw=await boundedBytes(request,32000);let input;try{input=JSON.parse(new TextDecoder().decode(raw))}catch{fail('invalid_input',400)}
  if(!['journal-history-v1','capture-history-v1'].includes(input.model)||typeof input.content!=='string'||input.content.length>8000)fail('invalid_input',400);
  const existing=await database(env).prepare('SELECT * FROM journal_messages WHERE reply_to=? AND owner_id=? AND astronaut_id=?').bind(id,user,astronaut).first();if(existing)return json({reply:await hydratedMessage(env,user,astronaut,existing)});
  const context=await localReplyContext(env,user,astronaut,row),references=[...context.references.map(x=>({id:x.id,createdAt:x.createdAt,content:x.content.slice(0,160)})),...context.photos.map(({dataUrl,...photo})=>({...photo,type:'photo',content:photo.region}))];
  const captureReply=input.model==='capture-history-v1'?await captureHistoryReply(env,user,astronaut,context):null;if(input.model==='capture-history-v1'&&!captureReply)fail('invalid_input',400);const content=(captureReply||journalHistoryReply(context,row)).replaceAll('ё','е').replaceAll('Ё','Е').replace(/[—–]/g,'-'),date=new Date().toISOString();
  await database(env).prepare('INSERT INTO journal_messages (id,owner_id,astronaut_id,role,content,language,created_at,vector_status,reply_to,references_json,assistant_source) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM journal_messages WHERE reply_to=? AND owner_id=? AND astronaut_id=?)').bind(crypto.randomUUID(),user,astronaut,'assistant',content,row.language,date,'not_applicable',id,JSON.stringify(references),captureReply?'comparison':'history',id,user,astronaut).run();
  const reply=await database(env).prepare('SELECT * FROM journal_messages WHERE reply_to=? AND owner_id=? AND astronaut_id=?').bind(id,user,astronaut).first();return json({reply:await hydratedMessage(env,user,astronaut,reply)});
}

async function captureHistoryReply(env,user,astronaut,context){
  const current=context.photos[0];if(!current)return null;
  const comparison=await comparePhoto(env,user,astronaut,current.id),previous=comparison.previous;
  const lang=/[а-яА-Я]/u.test(context.query)?'ru':/[\p{Script=Han}]/u.test(context.query)?'zh':/[\p{Script=Arabic}]/u.test(context.query)?'ar':context.language==='es'?'es':'en';
  const date=value=>new Intl.DateTimeFormat({en:'en-GB',ru:'ru-RU',zh:'zh-CN',ar:'ar',es:'es-ES'}[lang],{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' UTC';
  const stamp=date(current.createdAt),prior=previous?date(previous.createdAt):'',score=previous?.similarity?.toFixed(3),count=comparison.comparedCount;
  const replies={
    en:['Capture saved: '+stamp+'.',previous?'Previous capture of the same area: '+prior+'.':'This is the first capture of this area; a later capture will allow comparison.',score?'EmbeddingGemma 2 compared '+count+' previous vectors. Similarity: '+score+'.':current.vectorStatus==='indexed'?'The 768-dimensional vector is saved.':'The capture is saved; its vector is still pending.','Similarity retrieves earlier captures and cannot measure health changes. The cloud visual assistant is temporarily unavailable; the reserve cannot reliably judge skin or face changes.'],
    ru:['Запись сохранена: '+stamp+'.',previous?'Предыдущая запись того же участка: '+prior+'.':'Это первая запись данного участка; после следующей съемки появится сравнение.',score?'EmbeddingGemma 2 сравнила предыдущие векторы: '+count+'. Сходство: '+score+'.':current.vectorStatus==='indexed'?'Вектор из 768 чисел сохранен.':'Материал сохранен; вектор еще ожидает обработки.','Сходство помогает найти историю и не измеряет изменения здоровья. Облачный визуальный помощник временно недоступен; резерв не может надежно оценить изменения кожи или лица.'],
    zh:['记录已保存：'+stamp+'。',previous?'同一部位的历史记录：'+prior+'。':'这是该部位的首条记录；再次拍摄后可以比较。',score?'EmbeddingGemma 2 比较了 '+count+' 个历史向量。相似度：'+score+'。':current.vectorStatus==='indexed'?'768 维向量已保存。':'记录已保存，向量仍待处理。','相似度用于检索历史记录，不能衡量健康变化。云端视觉助手暂时不可用；备用助手无法可靠评估皮肤或面部变化。'],
    ar:['تم حفظ التسجيل: '+stamp+'.',previous?'التسجيل السابق للمنطقة نفسها: '+prior+'.':'هذا أول تسجيل لهذه المنطقة؛ يمكن المقارنة بعد تسجيل آخر.',score?'قارنت EmbeddingGemma 2 عدد '+count+' من المتجهات السابقة. التشابه: '+score+'.':current.vectorStatus==='indexed'?'تم حفظ المتجه ذي 768 بعدا.':'التسجيل محفوظ والمتجه ينتظر المعالجة.','التشابه يسترجع التسجيلات السابقة ولا يقيس تغيرات الصحة. المساعد البصري السحابي غير متاح مؤقتا؛ لا يستطيع البديل تقييم تغيرات الجلد أو الوجه بموثوقية.'],
    es:['Registro guardado: '+stamp+'.',previous?'Registro anterior de la misma zona: '+prior+'.':'Es el primer registro de esta zona; otro registro permitirá comparar.',score?'EmbeddingGemma 2 comparó '+count+' vectores anteriores. Similitud: '+score+'.':current.vectorStatus==='indexed'?'El vector de 768 dimensiones está guardado.':'El registro está guardado; el vector sigue pendiente.','La similitud recupera registros y no mide cambios de salud. El asistente visual en la nube no está disponible temporalmente; el reserva no puede evaluar cambios de piel o rostro con fiabilidad.']};
  return replies[lang].join(' ');
}

function journalHistoryReply(context,row){
  const lang=/[а-яА-Я]/u.test(row.content)?'ru':/[\p{Script=Han}]/u.test(row.content)?'zh':/[\p{Script=Arabic}]/u.test(row.content)?'ar':row.language==='es'?'es':'en';
  const copy={
    en:['Your entry is saved. The language service is temporarily unavailable.','Matching saved entries:','Recent saved entries:','There are no earlier entries in this profile.'],
    ru:['Запись сохранена. Языковой сервис временно недоступен.','Найденные сохраненные записи:','Последние сохраненные записи:','В этом профиле еще нет предыдущих записей.'],
    zh:['记录已保存。语言服务暂时不可用。','匹配的已保存记录：','最近保存的记录：','此档案尚无历史记录。'],
    ar:['تم حفظ التسجيل. خدمة اللغة غير متاحة مؤقتا.','السجلات المحفوظة المطابقة:','آخر السجلات المحفوظة:','لا توجد سجلات سابقة في هذا الملف.'],
    es:['Tu entrada está guardada. El servicio de lenguaje no está disponible temporalmente.','Entradas guardadas coincidentes:','Entradas guardadas recientes:','Todavía no hay entradas anteriores en este perfil.']};
  const phrases=copy[lang],entries=context.references.slice(0,context.matched?1:4);return phrases[0]+'\n\n'+(entries.length?phrases[context.matched?1:2]+'\n'+entries.map(x=>x.createdAt+'\n'+x.content.slice(0,800)).join('\n\n'):phrases[3]);
}
