/* Локальные признаки изображения. Пороги качества и цвета шкал не являются клиническими нормами. */
(() => {
  const metrics = [
    {key:'width', title:'Контур лица', unit:'%', relative:true, floor:.015, description:'Ширина скул относительно расстояния между внешними уголками глаз. Это не объем отека.'},
    {key:'balance', title:'Симметрия контура', unit:'п.п.', floor:.8, description:'Разница расстояний от носа до левой и правой скулы, в процентных пунктах.'},
    {key:'underEye', title:'Зона под глазами', unit:'L*', floor:1.2, color:true, description:'Контраст светлоты между зоной под глазами и щеками. Это не оценка усталости или мешков.'},
    {key:'redness', title:'Оттенок щек', unit:'a*', floor:1, color:true, description:'Красно-зеленая компонента CIELAB щек относительно лба. Это не диагноз воспаления.'},
    {key:'height', title:'Высота лица', unit:'%', relative:true, floor:.015, description:'Расстояние от верхней точки контура до подбородка относительно расстояния между внешними уголками глаз.'},
    {key:'jawWidth', title:'Линия челюсти', unit:'%', relative:true, floor:.015, description:'Ширина нижнего контура лица, нормированная по расстоянию между внешними уголками глаз.'},
    {key:'lowerFace', title:'Нижняя часть лица', unit:'%', relative:true, floor:.012, description:'Расстояние от основания носа до подбородка относительно расстояния между внешними уголками глаз.'},
    {key:'eyeOpening', title:'Раскрытие глаз', unit:'п.п.', floor:.8, description:'Среднее отношение высоты глазной щели к ее ширине. Моргание и выражение лица меняют этот признак.'},
    {key:'eyeBalance', title:'Симметрия глаз', unit:'п.п.', floor:.8, description:'Разница относительного раскрытия глаз между двумя сторонами кадра.'},
    {key:'mouthWidth', title:'Ширина губ', unit:'%', relative:true, floor:.012, description:'Расстояние между уголками губ относительно расстояния между внешними уголками глаз.'},
    {key:'toneBalance', title:'Разница тона щек', unit:'a*', floor:1, color:true, description:'Разница красно-зеленой компоненты CIELAB между щеками.'},
    {key:'underEyeBalance', title:'Тон под глазами', unit:'L*', floor:1.2, color:true, description:'Разница контраста светлоты под глазами относительно щек между двумя сторонами кадра.'}
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
    if(faces.length!==1)return reject(faces.length?'В кадре должно быть одно лицо':'Расположи лицо по центру');
    const p=faces[0].map(v=>({x:v.x*image.width,y:v.y*image.height,z:v.z*image.width}));
    if(p.length<455||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)||!Number.isFinite(v.z)))return reject('Лицо не удалось измерить');
    const d=dist(p[33],p[263]),width=dist(p[234],p[454]);
    if(d<110||width<200)return reject('Приблизь лицо к камере');
    if(p.some(v=>v.x<5||v.y<5||v.x>image.width-5||v.y>image.height-5))return reject('Лицо должно полностью помещаться в кадр');
    const ex={x:(p[263].x-p[33].x)/d,y:(p[263].y-p[33].y)/d},ey={x:-ex.y,y:ex.x};
    const roll=Math.atan2(ex.y,ex.x)*180/Math.PI;
    const m=result.facialTransformationMatrixes?.[0]?.data;
    const yaw=m?Math.atan2(m[8],m[10])*180/Math.PI:Math.atan2(p[234].z-p[454].z,width)*180/Math.PI;
    const pitch=m?Math.atan2(-m[9],Math.hypot(m[8],m[10]))*180/Math.PI:0;
    if(Math.abs(roll)>7||Math.abs(yaw)>12||Math.abs(pitch)>12)return reject('Смотри прямо, держи голову ровно');
    const shapes=result.faceBlendshapes?.[0]?.categories||[];
    if(dist(p[13],p[14])/d>.045||shapes.some(s=>/^(mouthSmile|jawOpen|browInnerUp|browOuterUp)/.test(s.categoryName)&&s.score>.3))return reject('Для сравнения сделай паузу в речи, расслабь лицо');
    const eyeL=mix(p[33],p[133]),eyeR=mix(p[362],p[263]);
    const offset=(point,x,y)=>({x:point.x+ex.x*d*x+ey.x*d*y,y:point.y+ex.y*d*x+ey.y*d*y});
    const centers={cheekL:offset(eyeL,-.025,.34),cheekR:offset(eyeR,.025,.34),underL:offset(eyeL,0,.105),underR:offset(eyeR,0,.105),forehead:mix(p[10],p[9],.55)};
    const patches=Object.fromEntries(Object.entries(centers).map(([k,c])=>[k,patch(image,c,ex,ey,d*(k.startsWith('under')?.10:.12),d*(k.startsWith('under')?.045:.075))]));
    if(Object.values(patches).some(v=>!v))return reject('Кадр обрезает область измерения');
    const cL=patches.cheekL,cR=patches.cheekR,f=patches.forehead;
    const light={l:(cL.l+cR.l)/2,a:f.a,b:f.b,side:cL.l-cR.l};
    if(Object.values(patches).some(v=>v.clip>.08)||light.l<18||light.l>92)return reject('Нужен мягкий свет без пересвета и глубоких теней');
    if(Math.abs(light.side)>10)return reject('Освети лицо равномерно с двух сторон');
    // Резкость измеряется на глазах, поскольку ровная кожа сама по себе может не иметь текстуры.
    const eyeSharp=[eyeL,eyeR].map(c=>patch(image,c,ex,ey,d*.13,d*.055)?.sharp||0);
    if(Math.max(...eyeSharp)<12)return reject('Подожди фокус камеры, не двигайся');
    const a=dist(p[234],p[1]),b=dist(p[454],p[1]),eyeWidthL=dist(p[33],p[133]),eyeWidthR=dist(p[362],p[263]);
    if(eyeWidthL<1||eyeWidthR<1)return reject('Глаза не удалось измерить');
    const openL=dist(p[159],p[145])/eyeWidthL,openR=dist(p[386],p[374])/eyeWidthR;
    const values={width:width/d,balance:100*(a-b)/(a+b),underEye:light.l-(patches.underL.l+patches.underR.l)/2,redness:(cL.a+cR.a)/2-f.a,height:dist(p[10],p[152])/d,jawWidth:dist(p[172],p[397])/d,lowerFace:dist(p[2],p[152])/d,eyeOpening:50*(openL+openR),eyeBalance:100*(openL-openR),mouthWidth:dist(p[61],p[291])/d,toneBalance:cL.a-cR.a,underEyeBalance:(cL.l-patches.underL.l)-(cR.l-patches.underR.l)};
    if(metrics.some(metric=>!Number.isFinite(values[metric.key])||metric.relative&&values[metric.key]<=0))return reject('Контур лица не удалось измерить');
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
    if(!sample.valid||!referenceValid(reference)||metrics.some(m=>!Number.isFinite(sample.metrics?.[m.key])||m.relative&&sample.metrics[m.key]<=0))return {valid:false,reason:sample.reason||'Нужен полный кадр и новый эталон'};
    if(Math.abs(sample.distance/reference.distance-1)>.15)return {valid:false,reason:'Верни расстояние до камеры как в эталоне'};
    if(['yaw','pitch','roll'].some(k=>Math.abs(sample.pose[k]-reference.pose[k])>5))return {valid:false,reason:'Повтори ракурс эталона'};
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
  // Цвет показывает техническое отличие от эталона, а не вероятность заболевания.
  function level(z,persistentMs=0){return z>=3&&persistentMs>=3000?'red':z>=2?'amber':'green';}
  globalThis.MissionAppearanceCore={metrics,median,lab,measure,summarize,referenceValid,comparison,smooth,level};
})();
