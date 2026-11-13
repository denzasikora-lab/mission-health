(() => {
  const visual=Object.freeze({
    source:'Reference sample',
    deltas:Object.freeze({width:.4,balance:.2,underEye:-.3,redness:.1,height:.3,jawWidth:-.2,lowerFace:.2,eyeOpening:.4,eyeBalance:.1,mouthWidth:-.3,toneBalance:.2,underEyeBalance:-.2}),
    age:Object.freeze({min:40,max:49}),skin:Object.freeze({newCount:0,changedCount:0})
  });
  const audio=fetch('/data/archive-preload.json',{cache:'reload'}).then(response=>{
    if(!response.ok)throw new Error('sample_unavailable');return response.json();
  }).then(data=>Array.isArray(data?.items)?data.items.filter(item=>item?.archiveSample&&['audio','video'].includes(item.observation?.kind)).flatMap(item=>{
    const a=item.observation.features?.acoustic;
    if(!a||!['level','quiet','clipping','seconds'].every(key=>Number.isFinite(a[key]))||a.level< -120||a.level>1||a.quiet<0||a.quiet>1||a.clipping<0||a.clipping>1||a.seconds<=0||a.seconds>125)return [];
    return [{kind:item.observation.kind,transcript:String(item.observation.transcript||''),source:String(item.observation.source||'Synthetic technical speech / Samantha'),mediaUrl:item.observation.mediaUrl,acoustic:{level:a.level,quiet:a.quiet,clipping:a.clipping,seconds:a.seconds}}];
  }):[]).catch(()=>[]);
  window.missionAnalysisSamples={visual,audio};
})();
