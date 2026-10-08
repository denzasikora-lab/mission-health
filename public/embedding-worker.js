import {AutoConfig,AutoModel,AutoProcessor,RawImage,RawVideo,RawVideoFrame,env} from './vendor/transformers-4.3.1.bundle.min.js';
const modelId='onnx-community/embeddinggemma-2-ONNX';
const revision='daa72c51243991dfcaf9f9137d2c573d8f7790c0';
const modelTag='embeddinggemma-2-onnx:'+revision+':q4:768:280';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
let loading;
async function load(progress){
  if(!loading)loading=(async()=>{
    const config=await AutoConfig.from_pretrained(modelId,{revision});config.audio_config=null;
    const processor=await AutoProcessor.from_pretrained(modelId,{revision});processor.image_processor.max_soft_tokens=280;
    let device='wasm';try{if(await navigator.gpu?.requestAdapter())device='webgpu'}catch{}
    const model=await AutoModel.from_pretrained(modelId,{config,revision,device,dtype:'q4',progress_callback:progress});
    return {processor,model,device};
  })().catch(error=>{loading=null;throw error});
  return loading;
}
let queue=Promise.resolve();
self.onmessage=event=>{queue=queue.catch(()=>{}).then(async()=>{
  const {id,blob,frames,duration,kind}=event.data;
  try{
    const files=new Map(),progress=item=>{if(item.status==='progress'){files.set(item.file,{loaded:item.loaded||0,total:item.total||0});const values=[...files.values()];self.postMessage({id,type:'progress',loaded:values.reduce((s,x)=>s+x.loaded,0),total:values.reduce((s,x)=>s+x.total,0)})}else if(item.status==='ready')self.postMessage({id,type:'encoding'})};
    const {processor,model,device}=await load(progress);self.postMessage({id,type:'encoding'});
    let inputs;if(kind==='video'){const decoded=[];for(const frame of frames)decoded.push(new RawVideoFrame(await RawImage.fromBlob(frame.blob),frame.timestamp));processor.video_processor.frame_processor.max_soft_tokens=140;processor.video_processor.max_frames=12;inputs=await processor(null,null,null,new RawVideo(decoded,duration))}else inputs=await processor(null,await RawImage.fromBlob(blob));const output=await model(inputs);
    const vector=Array.from(output.sentence_embedding.data);if(vector.length!==768||vector.some(n=>!Number.isFinite(n)))throw new Error('invalid_vector');
    self.postMessage({id,type:'result',vector,model:kind==='video'?modelTag.replace(':280',':140-video:1fps:12'):modelTag,device});
  }catch(error){self.postMessage({id,type:'error',reason:String(error.message).slice(0,500)})}
})};
