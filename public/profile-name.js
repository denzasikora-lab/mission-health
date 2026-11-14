(() => {
  let identity=null,loading=null,loadVersion=0,saveChain=Promise.resolve(),loadError='';
  const widgets=new Set(),prefix='mission-profile-name:',defaultName='Cdr. Sara Khan';
  const normalize=value=>String(value||'').replace(/[\u2013\u2014]/g,'-').trim().replace(/\s+/g,' ');
  function valid(value){return typeof value==='string'&&!/[\u0000-\u001f\u007f-\u009f]/.test(value)&&normalize(value).length>0&&normalize(value).length<=100;}
  async function request(options){
    const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('profile_timeout'));controller.abort();},15000);});
    try{const response=await Promise.race([fetch('/api/me',{cache:'no-store',...options,signal:controller.signal}),timeout]),value=await Promise.race([response.json(),timeout]);if(!response.ok||!value||!valid(value.name)||!/^[a-f0-9]{64}$/i.test(value.storageScope||''))throw new Error('profile_unavailable');return value;}finally{clearTimeout(timer);}
  }
  function paint(view){
    view.input.disabled=false;if(!view.dirty)view.input.value=identity?.name||defaultName;
    const retry=!identity||Boolean(loadError);view.action.textContent=retry?'Retry':'Save';view.action.setAttribute('aria-label',retry?'Retry profile connection':'Save full name');view.action.disabled=Boolean(loading)||view.saving;
    if(view.saving)view.status.textContent='Saving...';else if(loadError)view.status.textContent='Could not load profile. Your draft is not saved. Press Retry.';else if(loading)view.status.textContent=view.dirty?'Connecting. Your draft is not saved.':'Connecting profile...';else if(view.dirty)view.status.textContent=view.requiresReview?'Draft not saved. Review the name and press Save.':'Draft not saved.';else view.status.textContent=view.message||'';
  }
  function paintAll(){for(const view of widgets)paint(view);}
  function accept(value){
    const previous=identity?.storageScope,changed=!identity||previous!==value.storageScope||identity.name!==value.name;identity={...value,name:normalize(value.name)};loadError='';
    try{const key=prefix+identity.storageScope;if(localStorage.getItem(key)!==identity.name)localStorage.setItem(key,identity.name);}catch{}
    for(const view of widgets){
      clearTimeout(view.timer);view.timer=null;
      if(previous&&previous!==identity.storageScope){view.dirty=false;view.draftScope=null;view.requiresReview=false;view.request++;view.saving=false;view.message='Profile changed. The previous draft was not saved.';}
      else if(view.dirty&&!view.saving){view.draftScope=identity.storageScope;view.requiresReview=true;view.message='';}
      paint(view);
    }
    if(changed)window.dispatchEvent(new Event('mission-profile-change'));return identity;
  }
  async function load(force=false){
    if(loading&&!force)return loading;if(identity&&!force&&!loadError)return identity;
    const ticket=++loadVersion;let pending;pending=request().then(value=>ticket===loadVersion?accept(value):identity||(loading!==pending?loading:null));loading=pending;paintAll();
    try{return await pending;}catch(error){if(ticket===loadVersion){loadError='profile_unavailable';paintAll();}throw error;}finally{if(loading===pending){loading=null;paintAll();}}
  }
  async function set(value){
    if(!valid(value))throw new Error('invalid_name');const name=normalize(value),confirmed=await load();if(!confirmed)throw new Error('profile_unavailable');const owner=confirmed.storageScope;
    const operation=saveChain.catch(()=>{}).then(async()=>{
      if(identity?.storageScope!==owner)throw new Error('profile_changed');
      const result=await request({method:'PUT',headers:{'content-type':'application/json','x-mission-profile-scope':owner},body:JSON.stringify({name})});
      if(result.storageScope!==owner||identity?.storageScope!==owner)throw new Error('profile_changed');loadVersion++;loading=null;accept(result);return result;
    });saveChain=operation;return operation;
  }
  function attach(heading){
    if(!heading||heading.querySelector('.profile-name-form'))return;
    const root=document.createElement('form'),input=document.createElement('input'),action=document.createElement('button'),status=document.createElement('small');root.className='profile-name-form';root.style.gridTemplateColumns='minmax(0,1fr) auto';root.style.alignItems='center';root.style.gap='8px';
    input.type='text';input.maxLength=100;input.autocomplete='name';input.placeholder='Full name';input.setAttribute('aria-label','Full name');input.title='Full name';action.type='button';action.style.fontSize='12px';action.style.padding='6px 9px';status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(input,action,status);heading.insertBefore(root,heading.lastElementChild);heading.classList.add('has-profile-name');
    const view={root,input,action,status,dirty:false,draftScope:null,requiresReview:false,saving:false,timer:null,request:0,message:''};widgets.add(view);paint(view);
    async function commit(explicit=false){
      clearTimeout(view.timer);view.timer=null;if(!view.dirty||view.saving)return;
      if(!identity||loading||loadError){paint(view);return;}
      if(view.draftScope!==identity.storageScope){view.requiresReview=true;view.draftScope=identity.storageScope;paint(view);return;}
      if(view.requiresReview&&!explicit){paint(view);return;}if(!valid(input.value)){view.message='Enter your full name.';status.textContent=view.message;return;}
      const name=normalize(input.value),owner=identity.storageScope,attempt=++view.request;view.saving=true;view.message='';paint(view);
      try{if(name!==identity.name)await set(name);if(attempt===view.request&&identity?.storageScope===owner&&normalize(input.value)===name){view.dirty=false;view.requiresReview=false;input.value=name;view.message='Saved';}}
      catch{if(attempt===view.request&&identity?.storageScope===owner){view.requiresReview=true;view.message='Could not save. Your text remains in the field.';}}
      finally{if(attempt===view.request){view.saving=false;paint(view);if(view.message&&view.dirty)status.textContent=view.message;}}
    }
    function activate(){if(!identity||loadError){void load(true).catch(()=>{});}else void commit(true);}
    input.addEventListener('input',()=>{view.dirty=true;view.draftScope=identity?.storageScope||null;view.requiresReview=false;view.message='';clearTimeout(view.timer);paint(view);if(identity&&!loading&&!loadError&&!view.saving)view.timer=setTimeout(()=>void commit(),700);});
    input.addEventListener('change',()=>void commit());action.addEventListener('click',activate);root.addEventListener('submit',event=>{event.preventDefault();activate();});void load().catch(()=>{});
  }
  window.addEventListener('storage',event=>{if(identity&&event.key===prefix+identity.storageScope)void load(true).catch(()=>{});});
  window.missionProfileName={load,set,attach,get name(){return identity?.name||'';},get identity(){return identity;}};void load().catch(()=>{});
})();
