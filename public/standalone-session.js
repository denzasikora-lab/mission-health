(() => {
  if(window.missionStandaloneSession)return;
  const originalFetch=window.fetch.bind(window),sessionUrl=new URL('/api/session',location.href).href;
  let pending=null,established=false;
  async function establish(){
    const response=await originalFetch(sessionUrl,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
    if(!response.ok){try{await response.body?.cancel();}catch{}throw new Error('Guest session setup failed ('+response.status+').');}
    try{await response.body?.cancel();}catch{}
  }
  function ready(){
    if(established)return Promise.resolve();
    if(pending)return pending;
    const run=()=>establish(),task=typeof navigator.locks?.request==='function'?navigator.locks.request('mission-health-guest-session',run):Promise.resolve().then(run);
    pending=Promise.resolve(task).then(()=>{established=true;},error=>{pending=null;throw error;});
    return pending;
  }
  function wait(signal){
    if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('The request was aborted.','AbortError'));
    const task=ready();if(!signal)return task;
    return new Promise((resolve,reject)=>{
      const finish=callback=>value=>{signal.removeEventListener('abort',abort);callback(value);};
      const abort=()=>finish(reject)(signal.reason||new DOMException('The request was aborted.','AbortError'));
      signal.addEventListener('abort',abort,{once:true});
      task.then(finish(()=>{if(signal.aborted)abort();else resolve();}),finish(reject));
    });
  }
  window.fetch=(input,init)=>{
    let url;try{url=new URL(typeof Request!=='undefined'&&input instanceof Request?input.url:input,location.href);}catch{return originalFetch(input,init);}
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,init);
    const signal=init?.signal===null?null:init?.signal??(typeof Request!=='undefined'&&input instanceof Request?input.signal:undefined);
    return wait(signal).then(()=>originalFetch(input,init));
  };
  window.missionStandaloneSession=Object.freeze({ready});
  void ready().catch(()=>{});
})();
