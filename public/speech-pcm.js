(() => {
  function wav(blocks, sampleRate) {
    const length=blocks.reduce((sum,block)=>sum+block.length,0),input=new Float32Array(length);
    let offset=0;for(const block of blocks){input.set(block,offset);offset+=block.length;}
    const rate=16000,ratio=sampleRate/rate,count=Math.floor(length/ratio),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);
    const label=(position,text)=>{for(let i=0;i<text.length;i++)view.setUint8(position+i,text.charCodeAt(i));};
    label(0,'RIFF');view.setUint32(4,36+count*2,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,count*2,true);
    for(let i=0;i<count;i++){
      const from=Math.floor(i*ratio),to=Math.max(from+1,Math.floor((i+1)*ratio));let sum=0;
      for(let j=from;j<Math.min(to,input.length);j++)sum+=input[j];
      const sample=Math.max(-1,Math.min(1,sum/(to-from)));view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);
    }
    return new Blob([buffer],{type:'audio/wav'});
  }
  function segmenter(sampleRate, emit) {
    let blocks=[],frames=0,voiced=0,silence=0,pre=[],preFrames=0;
    function clear(){blocks=[];frames=voiced=silence=0;pre=[];preFrames=0;}
    function flush(){if(voiced>=sampleRate*.2)emit(wav(blocks,sampleRate));clear();}
    function push(input){
      const block=new Float32Array(input);let power=0;for(const value of block)power+=value*value;
      const speech=Math.sqrt(power/block.length)>.008;
      if(!blocks.length&&!speech){pre.push(block);preFrames+=block.length;while(preFrames>sampleRate*.24&&pre.length>1)preFrames-=pre.shift().length;return;}
      if(!blocks.length){blocks=pre;frames=preFrames;pre=[];preFrames=0;}
      blocks.push(block);frames+=block.length;if(speech){voiced+=block.length;silence=0;}else silence+=block.length;
      // Each request contains a complete WAV, without container splits MediaRecorder.
      if(frames>=sampleRate*6||silence>=sampleRate*.65&&frames>=sampleRate*.8)flush();
    }
    return {push,flush,clear};
  }
  window.missionSpeechPcm=Object.freeze({wav,segmenter});
})();
