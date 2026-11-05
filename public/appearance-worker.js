importScripts('/camera-engine/vision-1.2.0.js','/appearance-core.js?v=20261030-dense12');
let detector,canvas,context,lastAgeFrame=0;
self.onmessage=async({data})=>{
  const {type,bitmap,timestamp}=data;
  try{
    if(type==='init'){
      detector=await Vision.FaceLandmarker.createFromOptions({wasmLoaderPath:'/camera-engine/vision_wasm_nosimd_internal.js',wasmBinaryPath:'/camera-engine/vision_wasm_nosimd_internal.wasm?v=20261029-gzip2'},{baseOptions:{modelAssetPath:'/camera-engine/face-landmarker-v1.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:2,minFaceDetectionConfidence:.7,minFacePresenceConfidence:.7,minTrackingConfidence:.7,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true});
      canvas=new OffscreenCanvas(960,540);context=canvas.getContext('2d',{willReadFrequently:true});
      self.postMessage({type:'ready'});
    }else if(type==='frame'&&detector){
      if(canvas.width!==bitmap.width||canvas.height!==bitmap.height){canvas.width=bitmap.width;canvas.height=bitmap.height;}
      context.drawImage(bitmap,0,0);
      const result=detector.detectForVideo(canvas,timestamp);
      const measurement=MissionAppearanceCore.measure(context.getImageData(0,0,canvas.width,canvas.height),result);
      let ageFrame=null;
      if(measurement.valid&&timestamp-lastAgeFrame>=1000){
        try{
        const points=result.faceLandmarks[0],xs=points.map(p=>p.x*canvas.width),ys=points.map(p=>p.y*canvas.height);
        const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),width=right-left,height=bottom-top;
        const x=Math.max(0,left-width*.08),y=Math.max(0,top-height*.12),w=Math.min(canvas.width-x,width*1.16),h=Math.min(canvas.height-y,height*1.16),scale=Math.min(1,384/Math.max(w,h));
        const crop=new OffscreenCanvas(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
        crop.getContext('2d').drawImage(canvas,x,y,w,h,0,0,crop.width,crop.height);
        ageFrame=await crop.convertToBlob({type:'image/jpeg',quality:.9});lastAgeFrame=timestamp;
        }catch{ageFrame=null;}
      }
      self.postMessage({type:'measurement',measurement,timestamp,ageFrame});
    }
  }catch{self.postMessage({type:'error'});}
  finally{bitmap?.close();}
};
