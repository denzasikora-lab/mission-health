importScripts('/camera-engine/vision-1.2.0.js','/appearance-core.js?v=20261030-dense12');
let detector,canvas,context;
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
      self.postMessage({type:'measurement',measurement,timestamp});
    }
  }catch{self.postMessage({type:'error'});}
  finally{bitmap?.close();}
};
