import {AutoConfig,AutoModel,AutoTokenizer,env} from './vendor/transformers-4.3.1.bundle.min.js';
const modelId='onnx-community/embeddinggemma-2-ONNX',revision='daa72c51243991dfcaf9f9137d2c573d8f7790c0';
env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
let loading,queue=Promise.resolve();
async function load(id){
  if(!loading)loading=(async()=>{
    const config=await AutoConfig.from_pretrained(modelId,{revision});config.vision_config=config.audio_config=null;
    let device='wasm';try{if(await navigator.gpu?.requestAdapter())device='webgpu'}catch{}
    const files=new Map();
    const model=await AutoModel.from_pretrained(modelId,{config,revision,device,dtype:'q4',progress_callback:item=>{if(item.status==='progress'){files.set(item.file,{loaded:item.loaded||0,total:item.total||0});self.postMessage({id,type:'progress',loaded:[...files.values()].reduce((s,v)=>s+v.loaded,0),total:[...files.values()].reduce((s,v)=>s+v.total,0)})}}});
    return {model,tokenizer:await AutoTokenizer.from_pretrained(modelId,{revision}),device};
  })().catch(error=>{loading=null;throw error});return loading;
}
self.onmessage=event=>{queue=queue.catch(()=>{}).then(async()=>{
  const {id,text}=event.data;
  try{
    if(typeof text!=='string'||text.length>8000)throw new Error('invalid_input');
    const {model,tokenizer,device}=await load(id);self.postMessage({id,type:'encoding'});
    const output=await model(await tokenizer(text,{truncation:true,max_length:768}));
    const vector=Array.from(output.sentence_embedding.data).slice(0,256),norm=Math.hypot(...vector);
    if(vector.length!==256||!Number.isFinite(norm)||norm<.01)throw new Error('invalid_vector');
    self.postMessage({id,type:'result',vector:vector.map(n=>n/norm),device});
  }catch(error){self.postMessage({id,type:'error',reason:String(error.message).slice(0,250)})}
})};
