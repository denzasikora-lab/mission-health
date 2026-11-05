/* Видимый возраст: экспериментальная классификация по сходству, без оценки биологического старения. */
(() => {
  const method='embeddinggemma2-text-age-v1';
  const bands=Array.from({length:9},(_,i)=>({min:i*10,max:i===8?null:i*10+9}));
  const prompts=bands.flatMap((band,i)=>[
    'A close-up portrait of a person who looks about '+(i===8?'85':i*10+5)+' years old.',
    'A human face with the appearance of someone '+(i===8?'in their eighties or older':i===0?'under ten years old':'in their '+['','','twenties','thirties','forties','fifties','sixties','seventies'][i]+'')+'.'
  ]);
  prompts[3]='A human face with the appearance of a teenager.';
  const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;};
  function unit(vector){if(!vector?.length||vector.some(v=>!Number.isFinite(v)))throw new Error('invalid_age_vector');const norm=Math.hypot(...vector);if(!norm)throw new Error('invalid_age_vector');return Array.from(vector,v=>v/norm);}
  function unavailable(reason='need_frames',samples=0){return{method,status:'unavailable',reason,samples,range:null,scores:[],votes:[]};}
  function estimate(faceVectors,textVectors){
    if(faceVectors.length<2)return unavailable('need_frames',faceVectors.length);
    if(faceVectors.length>3||textVectors.length!==prompts.length)throw new Error('invalid_age_inputs');
    const faces=faceVectors.map(unit),texts=textVectors.map(unit),dimension=faces[0].length;
    if([...faces,...texts].some(v=>v.length!==dimension))throw new Error('invalid_age_dimensions');
    const matrix=faces.map(face=>texts.map(text=>face.reduce((sum,v,i)=>sum+v*text[i],0)));
    const votes=[];
    for(const row of matrix)for(let variant=0;variant<2;variant++){
      const ranked=bands.map((_,band)=>({band,score:row[band*2+variant]})).sort((a,b)=>b.score-a.score);
      if(ranked[0].score-ranked[1].score<1e-6)return{...unavailable('unstable',faces.length),status:'uncertain'};
      votes.push(ranked[0].band);
    }
    const low=Math.min(...votes),high=Math.max(...votes);
    const scores=bands.map((_,band)=>({band,similarity:median(matrix.map(row=>(row[band*2]+row[band*2+1])/2))}));
    // Разброс более чем на две соседние группы запрещает вывод числового диапазона.
    const stable=high-low<=1;
    return{method,status:stable?'estimated':'uncertain',reason:stable?'consensus':'unstable',samples:faces.length,range:stable?{min:bands[low].min,max:bands[high].max}:null,scores,votes};
  }
  function rangeValid(range){return range&&bands.some(b=>b.min===range.min)&&bands.some(b=>b.max===range.max)&&(range.max===null||range.min<=range.max)&&((range.max===null?8:(range.max-9)/10)-range.min/10)<=1;}
  function compare(report,reference,conditions){
    if(report.status!=='estimated')return 'unavailable';
    if(!reference)return 'no_reference';
    if(!conditions||!reference.conditions||Math.abs(conditions.light-reference.conditions.light)>8||Math.abs(conditions.distance/reference.conditions.distance-1)>.2)return 'conditions_changed';
    if(report.range.min>(reference.range.max??Infinity))return 'higher';
    if((report.range.max??Infinity)<reference.range.min)return 'lower';
    return 'overlap';
  }
  function validate(value){
    if(!value||value.method!==method||!['estimated','uncertain','unavailable'].includes(value.status)||!Number.isInteger(value.samples)||value.samples<0||value.samples>3||!['need_frames','unstable','consensus','model_unavailable'].includes(value.reason))return null;
    if(!Array.isArray(value.scores)||![0,9].includes(value.scores.length)||value.scores.some((v,i)=>v.band!==i||!Number.isFinite(v.similarity)||Math.abs(v.similarity)>1.00001)||!Array.isArray(value.votes)||value.votes.length>6||value.votes.some(v=>!Number.isInteger(v)||v<0||v>8))return null;
    if(value.status==='estimated'){
      if(value.samples<2||value.scores.length!==9||value.votes.length!==value.samples*2||value.reason!=='consensus'||!rangeValid(value.range))return null;
      const low=Math.min(...value.votes),high=Math.max(...value.votes);
      if(high-low>1||value.range.min!==bands[low].min||value.range.max!==bands[high].max)return null;
    }else if(value.range!==null)return null;
    const result={method,status:value.status,reason:value.reason,samples:value.samples,range:value.range?{min:value.range.min,max:value.range.max}:null,scores:value.scores.map(v=>({band:v.band,similarity:v.similarity})),votes:[...value.votes]};
    if(value.reference){if(!rangeValid(value.reference.range)||!Number.isFinite(Date.parse(value.reference.at))||Date.parse(value.reference.at)>Date.now()+300000)return null;result.reference={range:{min:value.reference.range.min,max:value.reference.range.max},at:value.reference.at};}
    if(value.comparison){if(!['unavailable','no_reference','conditions_changed','higher','lower','overlap'].includes(value.comparison))return null;result.comparison=value.comparison;if(['higher','lower','overlap'].includes(value.comparison)&&(!result.reference||result.status!=='estimated'))return null;}
    return result;
  }
  globalThis.MissionApparentAgeCore={method,bands,prompts,estimate,unavailable,compare,validate,rangeValid};
})();
