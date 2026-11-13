(() => {
  let identity=null,loading=null,loadVersion=0,saveChain=Promise.resolve();
  const widgets=new Set(),prefix='mission-profile-name:';
  const normalize=value=>String(value||'').replace(/[\u2013\u2014]/g,'-').trim().replace(/\s+/g,' ');
  function valid(value){return typeof value==='string'&&!/[\u0000-\u001f\u007f]/.test(value)&&normalize(value).length>0&&normalize(value).length<=100;}
  async function request(options){const response=await fetch('/api/me',{cache:'no-store',...options});const value=await response.json();if(!response.ok||!value||typeof value.name!=='string'||!/^[a-f0-9]{64}$/i.test(value.storageScope||''))throw new Error('profile_unavailable');return value;}
  function paint(view){view.input.disabled=!identity;if(!view.dirty)view.input.value=identity?.name||'';}
  function accept(value){
    const changed=!identity||identity.storageScope!==value.storageScope||identity.name!==value.name;
    identity={...value,name:normalize(value.name)};
    try{const key=prefix+identity.storageScope;if(localStorage.getItem(key)!==identity.name)localStorage.setItem(key,identity.name);}catch{}
    for(const view of widgets)paint(view);
    if(changed)window.dispatchEvent(new Event('mission-profile-change'));
    return identity;
  }
  async function load(force=false){
    if(loading&&!force)return loading;if(identity&&!force)return identity;
    const ticket=++loadVersion;let pending;pending=request().then(value=>ticket===loadVersion?accept(value):identity||(loading!==pending?loading:null));
    loading=pending;try{return await pending;}finally{if(loading===pending)loading=null;}
  }
  async function set(value){
    if(!valid(value))throw new Error('invalid_name');const name=normalize(value),owner=(await load()).storageScope;
    const operation=saveChain.catch(()=>{}).then(async()=>{
      if(identity?.storageScope!==owner)throw new Error('profile_changed');
      const result=await request({method:'PUT',headers:{'content-type':'application/json','x-mission-profile-scope':owner},body:JSON.stringify({name})});
      if(result.storageScope!==owner||identity?.storageScope!==owner)throw new Error('profile_changed');
      loadVersion++;loading=null;accept(result);return result;
    });
    saveChain=operation;return operation;
  }
  function attach(heading){
    if(!heading||heading.querySelector('.profile-name-form'))return;
    const root=document.createElement('form'),input=document.createElement('input'),status=document.createElement('small');root.className='profile-name-form';
    input.type='text';input.maxLength=100;input.autocomplete='name';input.placeholder='Full name';input.setAttribute('aria-label','Full name');input.title='Full name';input.disabled=true;
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(input,status);heading.insertBefore(root,heading.lastElementChild);heading.classList.add('has-profile-name');
    const view={root,input,status,dirty:false,timer:null,request:0};widgets.add(view);paint(view);
    async function commit(){
      clearTimeout(view.timer);if(!view.dirty||!identity)return;
      if(!valid(input.value)){status.textContent='Enter your full name.';return;}
      const name=normalize(input.value),attempt=++view.request;status.textContent='Saving...';
      try{if(name!==identity.name)await set(name);if(attempt===view.request&&normalize(input.value)===name){view.dirty=false;input.value=name;status.textContent='Saved';}}
      catch{if(attempt===view.request)status.textContent='Could not save. Your text remains in the field.';}
    }
    input.addEventListener('input',()=>{view.dirty=true;status.textContent='';clearTimeout(view.timer);view.timer=setTimeout(()=>void commit(),700);});
    input.addEventListener('change',()=>void commit());root.addEventListener('submit',event=>{event.preventDefault();void commit();});
    void load().then(()=>paint(view)).catch(()=>{status.textContent='Could not load profile. Refresh the page.';});
  }
  window.addEventListener('storage',event=>{if(identity&&event.key===prefix+identity.storageScope)void load(true).catch(()=>{});});
  window.missionProfileName={load,set,attach,get name(){return identity?.name||'';},get identity(){return identity;}};
  void load().catch(()=>{});
})();
