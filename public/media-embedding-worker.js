import {AutoConfig,AutoModel,AutoProcessor,RawImage,env} from './vendor/transformers-4.3.1.bundle.min.js';
import './apparent-age-core.js';
import './skin-spots-core.js';
import './appearance-core.js';
import './face-session-core.js';
const modelId='onnx-community/embeddinggemma-2-ONNX',revision='daa72c51243991dfcaf9f9137d2c573d8f7790c0';
// The tokenizer loader reads the service configuration without revision; pin paths for all model files.
env.remotePathTemplate='{model}/resolve/'+revision+'/';
env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
const descriptions=[['neutral','A person speaking in a calm, neutral tone.'],['happy','A person speaking with a happy, cheerful tone.'],['sad','A person speaking in a sad, subdued tone.'],['angry','A person speaking with an angry, irritated tone.'],['tense','A person speaking with a tense, anxious tone.']];
function normalized(values){const norm=Math.hypot(...values);if(!norm||values.some(v=>!Number.isFinite(v)))throw new Error('invalid_vector');return values.map(v=>v/norm);}
self.onmessage=async event=>{
  const {id,audio,frames=[],ageFrames=[],skin=null}=event.data;let model;
  try{
    const config=await AutoConfig.from_pretrained(modelId,{revision});if(!frames.length&&!ageFrames.length&&!skin?.crops?.length)config.vision_config=null;if(!audio?.length)config.audio_config=null;
    let device='wasm';try{if(await navigator.gpu?.requestAdapter())device='webgpu';}catch{}
    const files=new Map(),progress=item=>{if(item.status==='progress'){files.set(item.file,{loaded:item.loaded||0,total:item.total||0});self.postMessage({id,type:'progress',loaded:[...files.values()].reduce((sum,v)=>sum+v.loaded,0),total:[...files.values()].reduce((sum,v)=>sum+v.total,0)});}};
    model=await AutoModel.from_pretrained(modelId,{config,revision,device,dtype:'q4',progress_callback:progress});const processor=await AutoProcessor.from_pretrained(modelId,{revision});
    const result={model:'embeddinggemma-2:'+revision+':q4:768',audioVector:null,videoVector:null,tone:[],seconds:(audio?.length||0)/16000};
    if(audio?.length){
      const vectors=[];for(let at=0;at<audio.length;at+=30*16000){self.postMessage({id,type:'encoding',part:1+Math.floor(at/(30*16000)),parts:Math.ceil(audio.length/(30*16000))});const input=audio.slice(at,at+30*16000);if(input.length<8000&&vectors.length)break;const output=await model(await processor(null,null,input));vectors.push(Array.from(output.sentence_embedding.data));}
      result.audioVector=normalized(Array.from({length:768},(_,i)=>vectors.reduce((sum,v)=>sum+v[i],0)/vectors.length));
      const output=await model(await processor(descriptions.map(([,text])=>'task: classification | query: '+text))),data=output.sentence_embedding.data;
      result.tone=descriptions.map(([label],i)=>({label,similarity:result.audioVector.reduce((sum,v,k)=>sum+v*data[i*768+k],0)})).sort((a,b)=>b.similarity-a.similarity);
    }
    if(frames.length){processor.image_processor.max_soft_tokens=140;const images=await Promise.all(frames.map(frame=>RawImage.fromBlob(frame)));const output=await model(await processor(null,images));result.videoVector=normalized(Array.from(output.sentence_embedding.data));}
    if(frames.length){
      const core=globalThis.MissionApparentAgeCore;result.apparentAge=core.unavailable('need_frames',ageFrames.length);
      if(ageFrames.length>=2&&ageFrames.length<=3){
        try{
          self.postMessage({id,type:'age_encoding'});
          const vectors=[];processor.image_processor.max_soft_tokens=140;
          for(const blob of ageFrames){const face=await RawImage.fromBlob(blob),output=await model(await processor(null,[face]));vectors.push(Array.from(output.sentence_embedding.data));}
          result.faceVector=globalThis.MissionFaceSessionCore.average(vectors);
          const textOutput=await model(await processor(core.prompts.map(text=>'task: classification | query: '+text))),data=textOutput.sentence_embedding.data;
          const textVectors=core.prompts.map((_,i)=>Array.from(data.slice(i*768,(i+1)*768)));
          result.apparentAge=core.estimate(vectors,textVectors);
        }catch{result.apparentAge=core.unavailable('model_unavailable');}
      }
    }
    if(skin?.report){
      const clean=globalThis.MissionSkinSpotsCore.validate(skin.report);
      if(clean){result.skin=clean;if(clean.status==='compared'){processor.image_processor.max_soft_tokens=280;for(const crop of (skin.crops||[]).slice(0,4)){const item=clean.items.find(v=>v.id===crop.id);if(!item)continue;try{self.postMessage({id,type:'skin_encoding'});const image=await RawImage.fromBlob(crop.blob),output=await model(await processor(null,[image]));item.vector=normalized(Array.from(output.sentence_embedding.data));}catch{}}}}
    }
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',reason:String(error.message).slice(0,300)});}finally{await model?.dispose();}
};
