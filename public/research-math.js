const researchMath={
  median(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length?(sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2):null},
  valid(value,key){return Number.isFinite(value)&&value>0&&(key!=='spo2'||value<=100)},
  reference(rows,key,column){
    const start=rows[0]?.[0]??0,values=rows.filter(row=>row[0]>=start&&row[0]<start+60&&this.valid(row[column],key)).map(row=>row[column]);
    if(values.length<30)return null;
    const median=this.median(values),mad=this.median(values.map(value=>Math.abs(value-median))),halfWidth=Math.max(4*1.4826*mad,{hr:10,pulse:10,rr:5,spo2:3}[key]);
    return {median,mad,halfWidth,count:values.length};
  },
  deviations(rows,key,column,reference){
    if(!reference)return [];
    const events=[],calibratedAt=(rows[0]?.[0]??0)+60;let start=null,last=null,count=0;
    const finish=()=>{if(count>=5)events.push({start,end:last,count});start=null;last=null;count=0};
    for(const row of rows){const outside=row[0]>=calibratedAt&&this.valid(row[column],key)&&Math.abs(row[column]-reference.median)>reference.halfWidth;if(outside){if(last!==null&&row[0]!==last+1)finish();if(start===null)start=row[0];last=row[0];count++}else finish()}
    finish();return events;
  },
  preflightMean(rows,key){const values=rows.filter(row=>row.phase==='preflight'&&Number.isFinite(row[key])).map(row=>row[key]);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null}
};
