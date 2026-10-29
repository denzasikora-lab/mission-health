(() => {
  function chunks(text,limit=1050){
    const words=String(text||'').match(/\S+\s*/gu)||[],parts=[];let part='';
    for(let word of words){while(word.length>limit){if(part){parts.push(part.trim());part=''}parts.push(word.slice(0,limit));word=word.slice(limit)}if(part.length+word.length>limit){parts.push(part.trim());part=''}part+=word}if(part.trim())parts.push(part.trim());return parts.length?parts:[''];
  }
  function pages(entries){return [...entries].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).flatMap(entry=>chunks(entry.content).map((content,part)=>({entry,content,part})));}
  function unit(vector){const values=Array.from(vector).slice(0,256),norm=Math.hypot(...values);if(values.length!==256||!Number.isFinite(norm)||norm<.01)throw new Error('invalid_vector');return values.map(n=>n/norm)}
  function rank(query,entries){return entries.map(entry=>({...entry,score:Math.max(...entry.vectors.map(vector=>vector.reduce((sum,n,i)=>sum+n*query[i],0)))})).sort((a,b)=>b.score-a.score).slice(0,6)}
  window.missionBookTools={chunks,pages,unit,rank};
})();
