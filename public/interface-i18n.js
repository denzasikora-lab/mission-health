(() => {
  const ur={
    'Home':'مرکزی صفحہ','Health':'صحت','Diary':'ڈائری','Archive':'محفوظات','Research':'تحقیق',
    'Favorites':'پسندیدہ','Scheduled':'طے شدہ','Group chat':'گروپ چیٹ','Your diary':'آپ کی ڈائری','Personal diary':'ذاتی ڈائری','Search archive':'محفوظات میں تلاش کریں',
    'Let’s talk':'آئیے بات کریں','Back to chat':'گفتگو پر واپس جائیں','Important entries and answers':'اہم اندراجات اور جوابات',
    'Tasks and reminders from chat':'گفتگو سے بنائے گئے کام اور یاد دہانیاں','Crew / shared channel':'عملہ / مشترکہ گفتگو',
    'Personal observations / separate history and semantic search':'ذاتی مشاہدات / الگ تاریخ اور معنوی تلاش',
    'Send':'بھیجیں','Waiting for an answer...':'جواب کا انتظار ہے...','Saving...':'محفوظ کیا جا رہا ہے...','To diary':'ڈائری میں محفوظ کریں',
    'Attach file':'فائل منسلک کریں','Voice input':'آواز سے لکھیں','Stop voice input':'آواز سے لکھنا بند کریں',
    'Health files':'صحت کی فائلیں','Attach health data file':'صحت کے ڈیٹا کی فائل منسلک کریں','Medical and health data files':'طبی اور صحت کے ڈیٹا کی فائلیں',
    'Attach medical reports or health readings for analysis and search. CSV / JSON / TXT, UTF-8, up to 64 KB and 6,000 characters per file.':'تجزیے اور تلاش کے لیے طبی رپورٹس یا صحت کی پیمائشیں منسلک کریں. CSV / JSON / TXT، UTF-8، ہر فائل زیادہ سے زیادہ 64 KB اور 6,000 حروف.',
    'Refresh history':'گفتگو تازہ کریں','Message text':'پیغام کا متن','Message files':'پیغام کی فائلیں',
    'Earlier entries':'پرانے اندراجات','Retry request answer':'جواب کے لیے دوبارہ کوشش کریں',
    'Add to favorites':'پسندیدہ میں شامل کریں','Remove from favorites':'پسندیدہ سے نکالیں',
    'LOAD READINGS':'پیمائشیں لوڈ کریں','Load saved readings and imported device data':'محفوظ پیمائشیں اور آلے کا درآمد شدہ ڈیٹا لوڈ کریں','My readings':'میری پیمائشیں','PREFLIGHT RUN':'مثالی ڈیٹا','Load clearly labeled example readings':'واضح طور پر نشان زد مثالی پیمائشیں لوڈ کریں','Clear generated sample':'بنایا ہوا نمونہ ہٹائیں','Generated sample':'بنایا ہوا نمونہ','Preflight data':'ابتدائی آزمائشی ڈیٹا','Pulse':'نبض','Skin temperature':'جلد کا درجہ حرارت','Wellbeing':'کیفیت','Sleep':'نیند',
    'HRV':'دل کی دھڑکن کے وقفوں میں فرق','Respiration':'سانس کی رفتار','Blood pressure':'فشار خون','Recovery':'بحالی',
    'Steps':'قدم','Movement':'حرکت','Illuminance':'روشنی کی شدت','Calculated index':'حسابی اشاریہ',
    'Select a score below':'نیچے اسکور منتخب کریں','No measurements':'کوئی پیمائش موجود نہیں','Your self-report':'آپ کی بتائی گئی کیفیت','Wellbeing scale':'کیفیت کا پیمانہ',
    'CHECK IN':'اپنی کیفیت بتائیں','How are you now?':'آپ اس وقت کیسا محسوس کر رہے ہیں؟','Select how you feel':'اپنی کیفیت منتخب کریں',
    'Very poor':'بہت خراب','Below usual':'معمول سے کم','Okay':'مناسب','Good':'اچھا','Excellent':'بہترین','Reset score':'اسکور دوبارہ مقرر کریں',
    'Self-report, not a sensor reading':'خود بتائی گئی کیفیت، سینسر کی پیمائش نہیں','Your score':'آپ کا اسکور','Your wellbeing from 1 to 100':'1 سے 100 تک اپنی کیفیت بتائیں',
    'Health analysis':'صحت کا تجزیہ','Analyze':'تجزیہ کریں','Analyzing...':'تجزیہ جاری ہے...','Retry analysis':'دوبارہ تجزیہ کریں',
    'Use current readings':'موجودہ پیمائشیں استعمال کریں','Analysis details':'تجزیے کی تفصیل','Example':'نمونہ','Incomplete':'نامکمل','Provided readings':'فراہم کردہ پیمائشیں',
    'Visual':'بصری','Audio':'آڈیو','Enable camera':'کیمرہ چلائیں','Disable camera':'کیمرہ بند کریں','Camera':'کیمرہ','Disable':'بند کریں',
    'Cancel connection':'کنکشن منسوخ کریں','Preparing recording':'ریکارڈنگ تیار ہو رہی ہے','Start recording':'ریکارڈنگ شروع کریں','Stop recording':'ریکارڈنگ بند کریں',
    'Start audio recording':'آڈیو ریکارڈنگ شروع کریں','Stop audio recording':'آڈیو ریکارڈنگ بند کریں','Recording':'ریکارڈنگ','Stop':'بند کریں',
    'Processing':'کارروائی جاری ہے','Cancel':'منسوخ کریں','Record again':'دوبارہ ریکارڈ کریں','New recording':'نئی ریکارڈنگ',
    'Video appearance':'ویڈیو کا منظر','Voice waveform style':'آواز کی موجوں کا انداز','Signal level':'سگنل کی سطح','Source':'ماخذ',
    'Laboratory / Avatar':'لیبارٹری / اوتار','Spacecraft cabin / Earth':'خلائی جہاز کا کیبن / زمین','Inside helmet / Tony Stark':'ہیلمٹ کے اندر / ٹونی اسٹارک','Original camera':'اصل کیمرہ',
    'Particles':'ذرات','Wave':'موج','Press Audio to start recording':'ریکارڈنگ شروع کرنے کے لیے آڈیو دبائیں',
    'The waveform responds to your voice':'موجیں آپ کی آواز کے مطابق بدلتی ہیں','Allow microphone access in your browser':'براؤزر میں مائیکروفون کی اجازت دیں',
    'Microphone is off.':'مائیکروفون بند ہے.','Waiting for microphone permission.':'مائیکروفون کی اجازت کا انتظار ہے.',
    'Preparing audio recording.':'آڈیو ریکارڈنگ تیار ہو رہی ہے.','Recording sent for analysis.':'ریکارڈنگ تجزیے کے لیے بھیج دی گئی.',
    'Recording audio. Press «Audio», to stop.':'آڈیو ریکارڈ ہو رہی ہے. روکنے کے لیے آڈیو دبائیں.',
    'Home / Mission Health':'مرکزی صفحہ / Mission Health'
  };
  const rules=[];
  const add=(selector,values,attribute='textContent')=>rules.push({selector,values,attribute});
  add('[data-mission-nav] > span',['Home','Health','Diary','Archive','Research']);
  add('[data-personal-tab], [data-sidebar-tab]',['Favorites','Scheduled','Group chat']);
  add('.personal-conversation-heading .personal-section-title',['Your diary','Scheduled','Group chat','Favorites']);
  add('.personal-conversation-heading .personal-section-caption',['Let’s talk','Important entries and answers','Tasks and reminders from chat','Crew / shared channel','Personal observations / separate history and semantic search']);
  add('[data-personal-favorites]',['Favorites','Back to chat']);
  add('.personal-composer button[type="submit"]',['Send','Waiting for an answer...','Saving...','To diary']);
  add('.personal-older',['Earlier entries']);
  add('.personal-retry',['Retry request answer']);
  add('.chat-composer-tools button',['Attach file','Attach health data file','Voice input','Stop voice input'],'aria-label');
  add('.chat-composer-tools button',['Attach file','Attach health data file','Voice input','Stop voice input'],'title');
  add('.chat-health-file > span',['Health files']);
  add('.chat-file-help',['Attach medical reports or health readings for analysis and search. CSV / JSON / TXT, UTF-8, up to 64 KB and 6,000 characters per file.']);
  add('[data-personal-refresh]',['Refresh history'],'aria-label');
  add('.personal-composer textarea, .personal-composer .sr-only',['Message text'],'aria-label');
  add('.personal-composer .sr-only',['Message text']);
  add('.personal-composer input[type="file"]',['Message files','Medical and health data files'],'aria-label');
  add('[data-favorite-source]',['Add to favorites','Remove from favorites'],'aria-label');
  add('#mission-home-button',['Home'],'aria-label');add('#mission-home-button',['Home'],'title');
  add('.brand',['Home / Mission Health'],'aria-label');
  add('#book-search-open > span',['Search archive']);
  add('.home-body-panel > header > h2',['My readings']);
  add('.home-example-button',['PREFLIGHT RUN']);add('.home-example-button',['Load clearly labeled example readings'],'title');add('.home-sample-button',['LOAD READINGS']);add('.home-sample-button',['Load saved readings and imported device data'],'title');
  add('.home-sample-clear',['Clear generated sample'],'aria-label');add('.home-sample-clear',['Clear generated sample'],'title');
  add('.home-vitals',['My readings'],'aria-label');
  add('.home-vital > span:first-child',['Pulse','Skin temperature','Wellbeing','Sleep','HRV','Respiration','Blood pressure','Recovery','Steps','Movement','Illuminance']);
  add('.home-vital > small',['Select a score below','No measurements','Your self-report','Wellbeing scale','Calculated index','Generated sample']);
  add('.wellbeing-checkin .personal-eyebrow',['CHECK IN']);add('.wellbeing-checkin h3',['How are you now?']);
  add('.wellbeing-readout > span',['Select how you feel','Very poor','Below usual','Okay','Good','Excellent']);
  add('.wellbeing-endpoints > span',['Very poor','Excellent']);add('.wellbeing-reset',['Reset score']);
  add('.wellbeing-time',['Self-report, not a sensor reading','Your score']);
  add('.wellbeing-range-shell input',['Your wellbeing from 1 to 100'],'aria-label');
  add('#health-analysis-title',['Health analysis']);add('.health-analysis-button',['Analyze','Analyzing...','Retry analysis']);
  add('.health-analysis-new',['Use current readings']);add('.health-analysis-disclosure > summary',['Analysis details']);
  add('.health-analysis-scope',['Example','Provided readings']);add('.health-analysis-status',['Incomplete']);
  add('#video-log-title',['Personal diary','Diary']);add('#diary-visual-title',['Visual']);add('#diary-audio-title',['Audio']);
  const capture=['Enable camera','Disable camera','Cancel connection','Preparing recording','Start recording','Stop recording','Start audio recording','Stop audio recording'];
  add('#video-log-camera',capture);add('#voice-mic > span',capture);
  add('#video-log-camera, #voice-mic',capture,'aria-label');add('#video-log-camera, #voice-mic',capture,'title');
  add('#video-log-camera, #voice-mic',['Camera','Disable','Cancel','Processing','Recording','Stop','Record again','Audio',...capture],'data-compact-label');
  add('#video-log-background',['Video appearance'],'aria-label');add('#voice-style',['Voice waveform style'],'aria-label');add('#voice-style',['Voice waveform style'],'title');
  add('#video-log-background option',['Laboratory / Avatar','Spacecraft cabin / Earth','Inside helmet / Tony Stark','Original camera']);
  add('#voice-style option',['Particles','Wave']);add('.voice-readings > div > span',['Signal level','Source']);
  add('#voice-stage-hint',['Press Audio to start recording','The waveform responds to your voice','Allow microphone access in your browser']);
  add('#voice-notice',['Microphone is off.','Waiting for microphone permission.','Preparing audio recording.','Recording sent for analysis.','Recording audio. Press «Audio», to stop.']);
  const compact={'Enable camera':'Camera','Disable camera':'Disable','Cancel connection':'Cancel','Preparing recording':'Processing','Start recording':'Recording','Stop recording':'Stop'};
  const baselines=new WeakMap(),selector=rules.map(rule=>rule.selector).join(', ');
  let scheduled=false,observer;
  const language=()=>document.documentElement.lang==='ur'?'ur':'en';
  function translate(node,rule){
    const original=rule.attribute==='textContent'?node.textContent:node.getAttribute(rule.attribute);
    if(typeof original!=='string')return;
    const current=original.trim();
    let records=baselines.get(node);if(!records){records=new Map();baselines.set(node,records);}
    let key=rule.values.includes(current)?current:null,suffix='';
    if(!key&&rule.selector==='.wellbeing-time'){
      const prefix=language()==='ur'?'Your score / ':ur['Your score']+' / ';
      if(current.startsWith(prefix)){key='Your score';suffix=current.slice(prefix.length);}
    }
    if(key)records.set(rule.attribute,{key,suffix});
    else{
      const saved=records.get(rule.attribute);
      if(saved&&rule.values.includes(saved.key)&&current===(ur[saved.key]||saved.key)+(saved.suffix?' / '+saved.suffix:'')){key=saved.key;suffix=saved.suffix;}
      else key=rule.values.find(value=>ur[value]===current);
    }
    if(!key)return;
    if(rule.attribute==='data-compact-label'){key=node.matches('#voice-mic')?'Audio':compact[key]||key;records.set(rule.attribute,{key,suffix});}
    const value=original.slice(0,original.length-original.trimStart().length)+(language()==='ur'?ur[key]||key:key)+(suffix?' / '+suffix:'')+original.slice(original.trimEnd().length);
    if(value===original)return;
    if(rule.attribute==='textContent'){
      if(node.children.length)return;
      node.textContent=value;
    }else node.setAttribute(rule.attribute,value);
  }
  function observe(){observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','data-compact-label']});}
  function refresh(){
    scheduled=false;observer?.disconnect();
    try{
      for(const node of document.querySelectorAll('.mission-nav, .mission-heading, .personal-conversation-heading'))if(node.getAttribute('lang')!==language())node.setAttribute('lang',language());
      for(const rule of rules)for(const node of document.querySelectorAll(rule.selector))translate(node,rule);
    }
    finally{observe();}
  }
  function relevant(node){const element=node?.nodeType===1?node:node?.parentElement;return Boolean(element&&(element.closest(selector)||element.querySelector(selector)));}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(refresh);}
  observer=new MutationObserver(records=>{if(records.some(record=>relevant(record.target)||[...(record.addedNodes||[])].some(relevant)))schedule();});
  window.addEventListener('mission-language-change',refresh);
  window.missionInterfaceI18n=Object.freeze({refresh});refresh();
})();
