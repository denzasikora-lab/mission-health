/* Find local contrast in aligned skin areas. This is not a mole classifier. */
(() => {
  const method='aligned-face-spots-v1',width=128,height=96,regions=['forehead','left-cheek','right-cheek'];
  const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:NaN;};
  const finite=Number.isFinite,delta=(a,b)=>Math.hypot(a.l-b.l,a.a-b.a,a.b-b.b);
  const unavailable=(reason='need_frames',samples=0)=>({method,status:'unavailable',reason,samples,coverage:[...regions],items:[],newCount:0,changedCount:0});
  const colorValid=c=>c&&['r','g','b'].every(k=>Number.isInteger(c[k])&&c[k]>=0&&c[k]<=255);
  const labValid=c=>c&&finite(c.l)&&c.l>=0&&c.l<=100&&['a','b'].every(k=>finite(c[k])&&Math.abs(c[k])<=150);
  function describe(patch,lab){
    const {pixels,sourceWidth,sourceHeight}=patch;
    if(pixels?.length!==width*height*4||sourceWidth<64||sourceHeight<40)return null;
    const n=width*height,luma=new Float32Array(n),integral=new Float64Array((width+1)*(height+1)),chromaIntegral=new Float64Array((width+1)*(height+1)),mask=new Uint8Array(n),seen=new Uint8Array(n),rgb=[[],[],[]];
    let clipped=0,inside=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const at=y*width+x,i=at*4;luma[at]=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
      if(((x-width/2)/(width*.43))**2+((y-height/2)/(height*.40))**2<1){inside++;clipped+=Math.max(pixels[i],pixels[i+1],pixels[i+2])>250||Math.max(pixels[i],pixels[i+1],pixels[i+2])<12?1:0;for(let c=0;c<3;c++)rgb[c].push(pixels[i+c]);}
      const k=(y+1)*(width+1)+x+1;integral[k]=luma[at]+integral[k-1]+integral[k-width-1]-integral[k-width-2];chromaIntegral[k]=pixels[i]-pixels[i+1]+chromaIntegral[k-1]+chromaIntegral[k-width-1]-chromaIntegral[k-width-2];
    }
    if(clipped/inside>.04)return null;
    const background=lab(...rgb.map(median)),radius=12;
    for(let y=radius;y<height-radius;y++)for(let x=radius;x<width-radius;x++){
      if(((x-width/2)/(width*.40))**2+((y-height/2)/(height*.37))**2>=1)continue;
      const x0=x-radius,y0=y-radius,x1=x+radius+1,y1=y+radius+1,stride=width+1;
      const mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
      // Isolated samples are suppressed by averaging three neighbors.
      const v=(luma[y*width+x-1]+2*luma[y*width+x]+luma[y*width+x+1])/4;
      if(Math.abs(v-mean)>=18)mask[y*width+x]=v<mean?1:2;
      else{const average=(chromaIntegral[y1*stride+x1]-chromaIntegral[y0*stride+x1]-chromaIntegral[y1*stride+x0]+chromaIntegral[y0*stride+x0])/((x1-x0)*(y1-y0)),i=(y*width+x)*4;if(Math.abs(pixels[i]-pixels[i+1]-average)>=18)mask[y*width+x]=3;}
    }
    const spots=[];
    for(let at=0;at<n;at++){
      if(!mask[at]||seen[at])continue;
      const queue=[at],indices=[],tone=mask[at];seen[at]=1;let minX=width,minY=height,maxX=0,maxY=0;
      for(let cursor=0;cursor<queue.length;cursor++){
        const i=queue[cursor],x=i%width,y=Math.floor(i/width);indices.push(i);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(const next of [i-1,i+1,i-width,i+width])if(next>=0&&next<n&&!seen[next]&&mask[next]===tone&&Math.abs(next%width-x)+Math.abs(Math.floor(next/width)-y)===1){seen[next]=1;queue.push(next);}
      }
      const boxWidth=maxX-minX+1,boxHeight=maxY-minY+1,area=indices.length,areaPixels=area*sourceWidth/width*sourceHeight/height,diameterPixels=2*Math.sqrt(areaPixels/Math.PI);
      if(diameterPixels<4||area>n*.12||area/(boxWidth*boxHeight)<.28||Math.max(boxWidth/boxHeight,boxHeight/boxWidth)>3.5)continue;
      const channels=[0,1,2].map(c=>indices.map(i=>pixels[i*4+c])),color={r:median(channels[0]),g:median(channels[1]),b:median(channels[2])};
      const measured=lab(color.r,color.g,color.b);
      // A local filter’s light halo around a dark spot is not a second area.
      if(delta(measured,background)<6)continue;
      spots.push({x:indices.reduce((s,i)=>s+i%width,0)/area/width,y:indices.reduce((s,i)=>s+Math.floor(i/width),0)/area/height,areaPixels,diameterPixels,relativeArea:area/n,color,lab:measured,box:{x:minX,y:minY,width:boxWidth,height:boxHeight},tone:tone===1?'dark':tone===2?'light':'color'});
    }
    if(spots.length>12)return null;
    return {...patch,background,spots};
  }
  function extract(image,points,measurement,lab){
    if(!measurement?.valid)return {valid:false,reason:'need_frames'};
    const p=points.map(v=>({x:v.x*image.width,y:v.y*image.height})),d=Math.hypot(p[263].x-p[33].x,p[263].y-p[33].y);
    if(d<200)return {valid:false,reason:'need_closeup'};
    const ex={x:(p[263].x-p[33].x)/d,y:(p[263].y-p[33].y)/d},ey={x:-ex.y,y:ex.x},mid=(a,b,t=.5)=>({x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t});
    const eyeL=mid(p[33],p[133]),eyeR=mid(p[362],p[263]);
    const centers=[mid(p[10],p[9],.55),{x:eyeL.x+ey.x*d*.34-ex.x*d*.025,y:eyeL.y+ey.y*d*.34-ex.y*d*.025},{x:eyeR.x+ey.x*d*.34+ex.x*d*.025,y:eyeR.y+ey.y*d*.34+ex.y*d*.025}];
    const patches=[];
    for(let r=0;r<3;r++){
      const sourceWidth=d*(r===0?.44:.34),sourceHeight=d*(r===0?.22:.30),pixels=new Uint8ClampedArray(width*height*4),center=centers[r];
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const u=(x+.5)/width-.5,v=(y+.5)/height-.5,sx=Math.round(center.x+ex.x*u*sourceWidth+ey.x*v*sourceHeight),sy=Math.round(center.y+ex.y*u*sourceWidth+ey.y*v*sourceHeight);
        if(sx<0||sy<0||sx>=image.width||sy>=image.height)return {valid:false,reason:'need_frames'};
        const at=(y*width+x)*4,from=(sy*image.width+sx)*4;pixels.set(image.data.subarray(from,from+4),at);
      }
      const patch=describe({region:regions[r],pixels,sourceWidth,sourceHeight},lab);
      if(!patch)return {valid:false,reason:'not_enough_detail'};patches.push(patch);
    }
    return {valid:true,patches,light:measurement.light,pose:measurement.pose,distance:measurement.distance};
  }
  function stable(samples){
    if(samples.length<3||samples.some(s=>!s.valid))return null;
    const latest=samples.at(-1),patches=[];
    for(const region of regions){
      const current=latest.patches.find(p=>p.region===region);if(!current)return null;
      const previous=samples.map(s=>s.patches.find(p=>p.region===region));if(previous.some(p=>!p||delta(p.background,current.background)>5))return null;
      const spots=[];
      for(const spot of current.spots){
        const matches=previous.map(p=>p.spots.filter(v=>v.tone===spot.tone&&Math.hypot(v.x-spot.x,v.y-spot.y)<.035).sort((a,b)=>Math.hypot(a.x-spot.x,a.y-spot.y)-Math.hypot(b.x-spot.x,b.y-spot.y))[0]);
        if(matches.some(v=>!v)||matches.some(v=>Math.abs(v.relativeArea/spot.relativeArea-1)>.35))continue;
        spots.push({...spot,relativeArea:median(matches.map(v=>v.relativeArea)),areaPixels:median(matches.map(v=>v.areaPixels)),diameterPixels:median(matches.map(v=>v.diameterPixels)),lab:{l:median(matches.map(v=>v.lab.l)),a:median(matches.map(v=>v.lab.a)),b:median(matches.map(v=>v.lab.b))}});
      }
      patches.push({...current,spots});
    }
    return {...latest,patches};
  }
  function reference(samples,at=new Date().toISOString(),trackingKey=globalThis.crypto?.randomUUID?.()){
    if(!/^[a-f0-9-]{36}$/i.test(trackingKey||''))return null;
    if(samples.length<5)return null;const value=stable(samples);if(!value)return null;
    return {method,at,trackingKey,light:{...value.light},pose:{...value.pose},distance:value.distance,patches:value.patches.map(p=>({region:p.region,background:{...p.background},spots:p.spots.map(({box,...s})=>s)}))};
  }
  function referenceValid(value){return value?.method===method&&/^[a-f0-9-]{36}$/i.test(value.trackingKey||'')&&finite(Date.parse(value.at))&&finite(value.distance)&&value.distance>0&&regions.every(region=>{const p=value.patches?.find(p=>p.region===region);return p&&labValid(p.background)&&Array.isArray(p.spots)&&p.spots.length<=12&&p.spots.every(spotValid);})&&['l','a','b','side'].every(k=>finite(value.light?.[k]))&&['yaw','pitch','roll'].every(k=>finite(value.pose?.[k]));}
  function spotValid(s){return s&&['x','y'].every(k=>finite(s[k])&&s[k]>=0&&s[k]<=1)&&finite(s.areaPixels)&&s.areaPixels>0&&s.areaPixels<1000000&&finite(s.diameterPixels)&&s.diameterPixels>=4&&s.diameterPixels<2000&&finite(s.relativeArea)&&s.relativeArea>0&&s.relativeArea<=.12&&colorValid(s.color)&&labValid(s.lab)&&['dark','light','color'].includes(s.tone);}
  function compare(samples,ref){
    if(!referenceValid(ref))return unavailable('no_reference',samples.length);
    const current=stable(samples);if(!current)return unavailable('unstable',samples.length);
    if(Math.abs(current.distance/ref.distance-1)>.12||['yaw','pitch','roll'].some(k=>Math.abs(current.pose[k]-ref.pose[k])>4)||Math.abs(current.light.l-ref.light.l)>5||Math.abs(current.light.a-ref.light.a)>3||Math.abs(current.light.b-ref.light.b)>3||Math.abs(current.light.side-ref.light.side)>4)return unavailable('conditions_changed',samples.length);
    const items=[];let newCount=0,changedCount=0;
    for(const patch of current.patches){
      const base=ref.patches.find(p=>p.region===patch.region);if(delta(base.background,patch.background)>5)return unavailable('conditions_changed',samples.length);
      const used=new Set();
      for(const [index,s]of patch.spots.entries()){
        const matches=base.spots.map((p,i)=>({p,i,d:Math.hypot(p.x-s.x,p.y-s.y)})).filter(v=>v.d<.065&&!used.has(v.i)).sort((a,b)=>a.d-b.d),matched=matches[0];
        if(matches[1]&&matches[1].d-matched.d<.02)return unavailable('unstable',samples.length);
        if(matched)used.add(matched.i);
        const baseline=matched?.p||null,areaChangePercent=baseline?100*(s.relativeArea/baseline.relativeArea-1):null,deltaE=baseline?delta(s.lab,baseline.lab):null,change=!baseline?'new':Math.abs(areaChangePercent)>=20||deltaE>=6?'changed':'matched';
        if(change==='new')newCount++;if(change==='changed')changedCount++;
        const {box,...clean}=s;items.push({...clean,id:patch.region+'-'+index,region:patch.region,change,baseline:baseline?{relativeArea:baseline.relativeArea,diameterPixels:baseline.diameterPixels,color:{...baseline.color},lab:{...baseline.lab}}:null,areaChangePercent,deltaE});
      }
      if(used.size<base.spots.length)return unavailable('not_enough_detail',samples.length);
    }
    items.sort((a,b)=>(a.change==='new'?0:a.change==='changed'?1:2)-(b.change==='new'?0:b.change==='changed'?1:2)||b.relativeArea-a.relativeArea);
    return {method,status:'compared',reason:'ready',samples:samples.length,referenceAt:ref.at,trackingKey:ref.trackingKey,coverage:[...regions],newCount,changedCount,items:items.slice(0,4)};
  }
  function validate(value){
    if(!value||value.method!==method||!['compared','unavailable'].includes(value.status)||!Number.isInteger(value.samples)||value.samples<0||value.samples>5||!Array.isArray(value.coverage)||value.coverage.length!==3||regions.some((v,i)=>value.coverage[i]!==v)||!Array.isArray(value.items)||value.items.length>4)return null;
    if(value.status==='unavailable')return ['need_frames','need_closeup','not_enough_detail','no_reference','unstable','conditions_changed','collecting','need_camera'].includes(value.reason)&&!value.items.length?unavailable(value.reason,value.samples):null;
    if(value.reason!=='ready'||!/^[a-f0-9-]{36}$/i.test(value.trackingKey||'')||value.samples<3||!finite(Date.parse(value.referenceAt))||Date.parse(value.referenceAt)>Date.now()+300000||!['newCount','changedCount'].every(k=>Number.isInteger(value[k])&&value[k]>=0&&value[k]<=36))return null;
    const result={method,status:'compared',reason:'ready',samples:value.samples,referenceAt:value.referenceAt,trackingKey:value.trackingKey,coverage:[...regions],newCount:value.newCount,changedCount:value.changedCount,items:[]},ids=new Set();
    for(const s of value.items){
      if(!spotValid(s)||!regions.includes(s.region)||typeof s.id!=='string'||!new RegExp('^'+s.region+'-[0-9]{1,2}$').test(s.id)||ids.has(s.id)||!['new','changed','matched'].includes(s.change))return null;ids.add(s.id);
      const item={id:s.id,region:s.region,change:s.change,x:s.x,y:s.y,areaPixels:s.areaPixels,diameterPixels:s.diameterPixels,relativeArea:s.relativeArea,color:{r:s.color.r,g:s.color.g,b:s.color.b},lab:{l:s.lab.l,a:s.lab.a,b:s.lab.b},tone:s.tone,baseline:null,areaChangePercent:null,deltaE:null};
      if(s.change==='new'){if(s.baseline!==null||s.areaChangePercent!==null||s.deltaE!==null)return null;}
      else{
        const b=s.baseline;if(!b||!finite(b.relativeArea)||b.relativeArea<=0||b.relativeArea>.12||!finite(b.diameterPixels)||b.diameterPixels<4||b.diameterPixels>2000||!colorValid(b.color)||!labValid(b.lab))return null;
        const change=100*(s.relativeArea/b.relativeArea-1),de=delta(s.lab,b.lab);if(!finite(s.areaChangePercent)||Math.abs(change-s.areaChangePercent)>.001||!finite(s.deltaE)||Math.abs(de-s.deltaE)>.001||(s.change==='changed')!==(Math.abs(change)>=20||de>=6))return null;
        item.baseline={relativeArea:b.relativeArea,diameterPixels:b.diameterPixels,color:{r:b.color.r,g:b.color.g,b:b.color.b},lab:{l:b.lab.l,a:b.lab.a,b:b.lab.b}};item.areaChangePercent=change;item.deltaE=de;
      }
      if(s.vector!==undefined){if(!Array.isArray(s.vector)||s.vector.length!==768||s.vector.some(v=>!finite(v)||Math.abs(v)>1.01)||Math.abs(Math.hypot(...s.vector)-1)>.02)return null;const norm=Math.hypot(...s.vector);item.vector=s.vector.map(v=>v/norm);}
      result.items.push(item);
    }
    if(result.newCount<result.items.filter(i=>i.change==='new').length||result.changedCount<result.items.filter(i=>i.change==='changed').length)return null;
    return result;
  }
  globalThis.MissionSkinSpotsCore={method,width,height,regions,describe,extract,stable,reference,referenceValid,compare,validate,unavailable};
})();
