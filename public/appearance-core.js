/* Local image features. Quality thresholds and scale colors are not clinical norms. */
(() => {
  const metrics = [
    {key:'width', title:'Face contour', unit:'%', relative:true, floor:.015, description:'Cheekbone width relative to the distance between outer eye corners. This does not measure swelling volume.'},
    {key:'balance', title:'Contour symmetry', unit:'pp', floor:.8, description:'Difference between nose-to-cheekbone distances on both sides, in percentage points.'},
    {key:'underEye', title:'Under-eye area', unit:'L*', floor:1.2, color:true, description:'Lightness contrast between under-eye areas and cheeks. This does not assess fatigue or eye bags.'},
    {key:'redness', title:'Cheek tone', unit:'a*', floor:1, color:true, description:'Red-green component CIELAB of cheeks relative to the forehead. This does not diagnose inflammation.'},
    {key:'height', title:'Face height', unit:'%', relative:true, floor:.015, description:'Distance from upper face contour to chin relative to the distance between outer eye corners.'},
    {key:'jawWidth', title:'Jawline', unit:'%', relative:true, floor:.015, description:'Lower face contour width, normalized by the distance between outer eye corners.'},
    {key:'lowerFace', title:'Lower face', unit:'%', relative:true, floor:.012, description:'Distance from nose base to chin relative to the distance between outer eye corners.'},
    {key:'eyeOpening', title:'Eye opening', unit:'pp', floor:.8, description:'Mean ratio of eye opening height to width. Blinking and facial expression affect this feature.'},
    {key:'eyeBalance', title:'Eye symmetry', unit:'pp', floor:.8, description:'Difference in relative eye opening between both sides of the frame.'},
    {key:'mouthWidth', title:'Lip width', unit:'%', relative:true, floor:.012, description:'Distance between lip corners relative to the distance between outer eye corners.'},
    {key:'toneBalance', title:'Cheek tone difference', unit:'a*', floor:1, color:true, description:'Difference in red-green component CIELAB between cheeks.'},
    {key:'underEyeBalance', title:'Under-eye tone', unit:'L*', floor:1.2, color:true, description:'Difference in under-eye-to-cheek lightness contrast between both sides.'}
  ];
  const median = values => { const a=[...values].sort((x,y)=>x-y), m=Math.floor(a.length/2); return a.length ? a.length%2 ? a[m] : (a[m-1]+a[m])/2 : NaN; };
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const mix = (a,b,t=.5) => ({x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t});
  function lab(r,g,b) {
    const linear = v => (v/=255)<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
    r=linear(r);g=linear(g);b=linear(b);
    const f = v => v>216/24389 ? Math.cbrt(v) : (24389/27*v+16)/116;
    const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047), y=f(.2126729*r+.7151522*g+.072175*b), z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);
    return {l:116*y-16,a:500*(x-y),b:200*(y-z)};
  }
  function patch(image,center,ex,ey,rx,ry) {
    const {data,width,height}=image, channels=[[],[],[]]; let clipped=0,edge=0,count=0;
    const luma=(x,y)=>{const i=(y*width+x)*4;return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2];};
    for(let v=-1;v<=1;v+=.16)for(let u=-1;u<=1;u+=.16){
      if(u*u+v*v>1)continue;
      const x=Math.round(center.x+ex.x*u*rx+ey.x*v*ry),y=Math.round(center.y+ex.y*u*rx+ey.y*v*ry);
      if(x<1||y<1||x>=width-1||y>=height-1)return null;
      const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
      channels[0].push(r);channels[1].push(g);channels[2].push(b);
      clipped+=Math.max(r,g,b)>250||Math.max(r,g,b)<12 ? 1:0;
      const lap=luma(x-1,y)+luma(x+1,y)+luma(x,y-1)+luma(x,y+1)-4*luma(x,y);edge+=lap*lap;count++;
    }
    return {...lab(...channels.map(median)),clip:clipped/count,sharp:edge/count};
  }
  function measure(image,result) {
    const faces=result.faceLandmarks||[];
    const reject=(reason)=>({valid:false,reason});
    if(faces.length!==1)return reject(faces.length?'The frame must contain one face':'Center your face');
    const p=faces[0].map(v=>({x:v.x*image.width,y:v.y*image.height,z:v.z*image.width}));
    if(p.length<455||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)||!Number.isFinite(v.z)))return reject('Could not measure the face');
    const d=dist(p[33],p[263]),width=dist(p[234],p[454]);
    if(d<110||width<200)return reject('Move closer to the camera');
    if(p.some(v=>v.x<5||v.y<5||v.x>image.width-5||v.y>image.height-5))return reject('Your whole face must fit inside the frame');
    const ex={x:(p[263].x-p[33].x)/d,y:(p[263].y-p[33].y)/d},ey={x:-ex.y,y:ex.x};
    const roll=Math.atan2(ex.y,ex.x)*180/Math.PI;
    const m=result.facialTransformationMatrixes?.[0]?.data;
    const yaw=m?Math.atan2(m[8],m[10])*180/Math.PI:Math.atan2(p[234].z-p[454].z,width)*180/Math.PI;
    const pitch=m?Math.atan2(-m[9],Math.hypot(m[8],m[10]))*180/Math.PI:0;
    if(Math.abs(roll)>7||Math.abs(yaw)>12||Math.abs(pitch)>12)return reject('Look straight ahead, keep your head level');
    const shapes=result.faceBlendshapes?.[0]?.categories||[];
    if(dist(p[13],p[14])/d>.045||shapes.some(s=>/^(mouthSmile|jawOpen|browInnerUp|browOuterUp)/.test(s.categoryName)&&s.score>.3))return reject('Pause speaking for comparison, relax your face');
    const eyeL=mix(p[33],p[133]),eyeR=mix(p[362],p[263]);
    const offset=(point,x,y)=>({x:point.x+ex.x*d*x+ey.x*d*y,y:point.y+ex.y*d*x+ey.y*d*y});
    const centers={cheekL:offset(eyeL,-.025,.34),cheekR:offset(eyeR,.025,.34),underL:offset(eyeL,0,.105),underR:offset(eyeR,0,.105),forehead:mix(p[10],p[9],.55)};
    const patches=Object.fromEntries(Object.entries(centers).map(([k,c])=>[k,patch(image,c,ex,ey,d*(k.startsWith('under')?.10:.12),d*(k.startsWith('under')?.045:.075))]));
    if(Object.values(patches).some(v=>!v))return reject('The frame crops the measurement area');
    const cL=patches.cheekL,cR=patches.cheekR,f=patches.forehead;
    const light={l:(cL.l+cR.l)/2,a:f.a,b:f.b,side:cL.l-cR.l};
    if(Object.values(patches).some(v=>v.clip>.08)||light.l<18||light.l>92)return reject('Use soft light without overexposure or deep shadows');
    if(Math.abs(light.side)>10)return reject('Light your face evenly from both sides');
    // Sharpness is measured around the eyes, because smooth skin may have little texture.
    const eyeSharp=[eyeL,eyeR].map(c=>patch(image,c,ex,ey,d*.13,d*.055)?.sharp||0);
    if(Math.max(...eyeSharp)<12)return reject('Wait for the camera to focus, stay still');
    const a=dist(p[234],p[1]),b=dist(p[454],p[1]),eyeWidthL=dist(p[33],p[133]),eyeWidthR=dist(p[362],p[263]);
    if(eyeWidthL<1||eyeWidthR<1)return reject('Could not measure the eyes');
    const openL=dist(p[159],p[145])/eyeWidthL,openR=dist(p[386],p[374])/eyeWidthR;
    const values={width:width/d,balance:100*(a-b)/(a+b),underEye:light.l-(patches.underL.l+patches.underR.l)/2,redness:(cL.a+cR.a)/2-f.a,height:dist(p[10],p[152])/d,jawWidth:dist(p[172],p[397])/d,lowerFace:dist(p[2],p[152])/d,eyeOpening:50*(openL+openR),eyeBalance:100*(openL-openR),mouthWidth:dist(p[61],p[291])/d,toneBalance:cL.a-cR.a,underEyeBalance:(cL.l-patches.underL.l)-(cR.l-patches.underR.l)};
    if(metrics.some(metric=>!Number.isFinite(values[metric.key])||metric.relative&&values[metric.key]<=0))return reject('Could not measure the face contour');
    return {valid:true,metrics:values,light,pose:{yaw,pitch,roll},distance:d/image.width,center:mix(p[33],p[263]),points:p.filter((_,i)=>[10,33,133,263,362,234,454,1,2,152,172,397,61,291,159,145,386,374].includes(i)).map(v=>({x:v.x/image.width,y:v.y/image.height})),regions:Object.values(centers).map(v=>({x:v.x/image.width,y:v.y/image.height}))};
  }
  function summarize(samples) {
    if(samples.length<24)throw new Error('insufficient_reference');
    if(samples.some(sample=>metrics.some(metric=>!Number.isFinite(sample.metrics?.[metric.key])||metric.relative&&sample.metrics[metric.key]<=0)))throw new Error('invalid_reference_sample');
    const summary={version:2,count:samples.length,metrics:{},light:{},pose:{},distance:median(samples.map(s=>s.distance))};
    for(const metric of metrics){const values=samples.map(s=>s.metrics[metric.key]),center=median(values);summary.metrics[metric.key]={center,noise:Math.max(metric.floor,1.4826*median(values.map(v=>Math.abs(v-center))))};}
    for(const key of ['l','a','b','side'])summary.light[key]=median(samples.map(s=>s.light[key]));
    for(const key of ['yaw','pitch','roll'])summary.pose[key]=median(samples.map(s=>s.pose[key]));
    return summary;
  }
  function referenceValid(value) {
    return value?.version===2&&Number.isFinite(value.distance)&&value.distance>0&&value.distance<1&&Number.isInteger(value.count)&&value.count>=24&&metrics.every(m=>Number.isFinite(value.metrics?.[m.key]?.center)&&Number.isFinite(value.metrics[m.key].noise)&&value.metrics[m.key].noise>=m.floor&&(!m.relative||value.metrics[m.key].center>0))&&['l','a','b','side'].every(k=>Number.isFinite(value.light?.[k]))&&['yaw','pitch','roll'].every(k=>Number.isFinite(value.pose?.[k]));
  }
  function comparison(sample,reference) {
    if(!sample.valid||!referenceValid(reference)||metrics.some(m=>!Number.isFinite(sample.metrics?.[m.key])||m.relative&&sample.metrics[m.key]<=0))return {valid:false,reason:sample.reason||'A complete frame and new baseline are required'};
    if(Math.abs(sample.distance/reference.distance-1)>.15)return {valid:false,reason:'Match the baseline distance from the camera'};
    if(['yaw','pitch','roll'].some(k=>Math.abs(sample.pose[k]-reference.pose[k])>5))return {valid:false,reason:'Match the baseline angle'};
    const colorOk=Math.abs(sample.light.l-reference.light.l)<=7&&Math.abs(sample.light.a-reference.light.a)<=4&&Math.abs(sample.light.b-reference.light.b)<=4&&Math.abs(sample.light.side-reference.light.side)<=5;
    const values={};
    for(const m of metrics){const ref=reference.metrics[m.key],delta=sample.metrics[m.key]-ref.center;values[m.key]={valid:!m.color||colorOk,delta:m.relative?100*delta/ref.center:delta,z:Math.abs(delta)/ref.noise};}
    return {valid:true,colorOk,values};
  }
  function smooth(samples) {
    const s=samples.at(-1),copy={...s,metrics:{}};
    for(const m of metrics)copy.metrics[m.key]=median(samples.map(v=>v.metrics[m.key]));
    return copy;
  }
  // Color indicates a technical difference from the baseline, not disease probability.
  function level(z,persistentMs=0){return z>=3&&persistentMs>=3000?'red':z>=2?'amber':'green';}
  globalThis.MissionAppearanceCore={metrics,median,lab,measure,summarize,referenceValid,comparison,smooth,level};
})();
