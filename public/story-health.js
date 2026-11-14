(() => {
  const definitions=[['hr','heart_rate','Pulse','bpm',72,20,250],['spo2','spo2','SpO₂','%',98,50,100],['temp','body_temperature','Temperature','°C',36.8,30,45],['fatigue','fatigue_index','Fatigue','/100',24,0,100],['wellbeing','wellbeing','Wellbeing','/100',80,1,100],['recovery','recovery','Recovery','/100',86,0,100],['skin','skin_temperature','Skin temperature','°C',33.8,20,45],['respiration','respiratory_rate','Respiration','/min',14,4,60]];
  const WIDTH=96,HEIGHT=56,clone=value=>JSON.parse(JSON.stringify(value)),clamp=value=>Math.max(0,Math.min(1,value));
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const format=value=>new Intl.NumberFormat('en',{maximumFractionDigits:1,useGrouping:false}).format(value);
  const sourceName=reading=>reading.source==='demo'?'Sample':reading.source==='import'?'Imported':reading.key==='wellbeing'?'Self-report':'Manual';
  function snapshot(){
    const current=window.missionHome?.snapshot?.()||window.missionHealth?.snapshot?.()||window.missionReadings?.current?.(),report=window.missionCheckin?.current?.(),readings={};
    for(const [key,field,,unit,example,min,max]of definitions){
      let reading=current?.profileId&&current.profileId!=='personal'?null:current?.readings?.[field];if(key==='wellbeing'&&report)reading={value:report.score*(report.wellbeingScale===100?1:10),source:'manual',observedAt:new Date().toISOString()};
      const valid=Number.isFinite(reading?.value)&&reading.value>=min&&reading.value<=max;
      readings[key]={key,value:valid?reading.value:example,unit,source:valid&&['manual','import','demo'].includes(reading.source)?reading.source:'demo',observedAt:valid&&reading.source!=='demo'&&Number.isFinite(Date.parse(reading.observedAt))?reading.observedAt:null};
    }
    return {version:3,source:'personal_dashboard',profileId:'personal',capturedAt:new Date().toISOString(),wellbeing:report||null,readings,widgets:[]};
  }
  function chip(host,key,reading,options={}){
    const definition=definitions.find(item=>item[0]===key);if(!definition||!reading)return;
    window.missionKonstaChip.mount(host,{label:definition[2],value:format(reading.value),unit:definition[3],source:sourceName({...reading,key}),...options});
  }
  function overlay(parent,health,{editable=false,onChange=()=>{},mediaSize=null}={}){
    const layer=make('div','story-widget-layer'),nodes=new Map();layer.setAttribute('aria-label',editable?'Move story health widgets':'Story health widgets');parent.append(layer);let size=mediaSize,drag=null,disabled=false;
    function box(){const bounds=parent.getBoundingClientRect(),scale=size?.width>0&&size?.height>0?Math.min(bounds.width/size.width,bounds.height/size.height):0;return {width:scale?size.width*scale:bounds.width,height:scale?size.height*scale:bounds.height,left:scale?(bounds.width-size.width*scale)/2:0,top:scale?(bounds.height-size.height*scale)/2:0};}
    function place(){const bounds=box();Object.assign(layer.style,{width:bounds.width+'px',height:bounds.height+'px',left:bounds.left+'px',top:bounds.top+'px'});for(const item of health.widgets){const node=nodes.get(item.key);if(node){node.style.left=clamp(item.x)*Math.max(0,bounds.width-WIDTH)+'px';node.style.top=clamp(item.y)*Math.max(0,bounds.height-HEIGHT)+'px';}}}
    function remove(key){if(disabled)return;const node=nodes.get(key);if(!node)return;window.missionKonstaChip.unmount(node);node.remove();nodes.delete(key);health.widgets=health.widgets.filter(item=>item.key!==key);onChange();}
    function paint(){
      for(const node of nodes.values()){window.missionKonstaChip.unmount(node);node.remove();}nodes.clear();
      for(const item of health.widgets){const node=make('div','story-health-widget');node.dataset.widgetKey=item.key;nodes.set(item.key,node);if(editable){node.tabIndex=0;node.setAttribute('role','group');node.setAttribute('aria-label',definitions.find(d=>d[0]===item.key)[2]+' widget / drag or use arrow keys');}
        chip(node,item.key,health.readings[item.key],editable?{onDelete:()=>remove(item.key)}:{});layer.append(node);
        if(editable){
          node.addEventListener('pointerdown',event=>{if(disabled||event.button!==undefined&&event.button!==0||event.composedPath?.().some(target=>target.getAttribute?.('role')==='button'))return;event.preventDefault();event.stopPropagation();const bounds=box();drag={key:item.key,id:event.pointerId,x:event.clientX,y:event.clientY,left:item.x*Math.max(0,bounds.width-WIDTH),top:item.y*Math.max(0,bounds.height-HEIGHT)};node.setPointerCapture?.(event.pointerId);});
          node.addEventListener('pointermove',event=>{if(!drag||drag.key!==item.key||drag.id!==event.pointerId)return;const bounds=box();item.x=clamp((drag.left+event.clientX-drag.x)/Math.max(1,bounds.width-WIDTH));item.y=clamp((drag.top+event.clientY-drag.y)/Math.max(1,bounds.height-HEIGHT));place();});
          const end=event=>{if(!drag||drag.key!==item.key||drag.id!==event.pointerId)return;drag=null;node.releasePointerCapture?.(event.pointerId);onChange();};node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);node.addEventListener('lostpointercapture',end);
          node.addEventListener('keydown',event=>{if(disabled||event.target!==node)return;if(['Delete','Backspace'].includes(event.key)){event.preventDefault();remove(item.key);return;}const offsets={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=offsets[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();const bounds=box(),step=event.shiftKey?10:2;item.x=clamp(item.x+delta[0]*step/Math.max(1,bounds.width-WIDTH));item.y=clamp(item.y+delta[1]*step/Math.max(1,bounds.height-HEIGHT));place();onChange();});
        }
      }place();
    }
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(place):null;observer?.observe(parent);paint();
    return {paint,place,remove,setMedia(value){size=value;place();},setDisabled(value){disabled=Boolean(value);},destroy(){observer?.disconnect();for(const node of nodes.values())window.missionKonstaChip.unmount(node);nodes.clear();layer.remove();}};
  }
  function mount(palette,stage,onChange=()=>{}){
    let health=snapshot(),view,disabled=false;const chips=[];
    function refreshPalette(){for(const [key,node]of chips)chip(node,key,health.readings[key],{selected:health.widgets.some(item=>item.key===key),onClick:()=>add(key)});}
    function changed(){refreshPalette();onChange();}
    function add(key){if(disabled||health.widgets.some(item=>item.key===key))return;const n=health.widgets.length;health.widgets.push({key,x:n%2?.68:.08,y:Math.min(.8,.12+Math.floor(n/2)*.2)});view.paint();changed();}
    palette.replaceChildren();palette.className='story-health-palette';const title=make('header');title.append(make('strong','','Health widgets'),make('small','','Tap to add'));palette.append(title);const list=make('div','story-health-picker');palette.append(list);
    for(const [key]of definitions){const node=make('div','story-health-choice');chips.push([key,node]);list.append(node);}view=overlay(stage,health,{editable:true,onChange:changed});refreshPalette();
    return {add,reset(value=snapshot()){health=clone(value);health.widgets=[];view.destroy();view=overlay(stage,health,{editable:true,onChange:changed});refreshPalette();},setMedia(value){view.setMedia(value);},setDisabled(value){disabled=Boolean(value);view.setDisabled(value);palette.inert=disabled;},value(){const result=clone(health);result.readings=Object.fromEntries(result.widgets.map(item=>[item.key,result.readings[item.key]]));if(!result.widgets.some(item=>item.key==='wellbeing'))result.wellbeing=null;return result;},destroy(){view.destroy();for(const [,node]of chips)window.missionKonstaChip.unmount(node);palette.replaceChildren();}};
  }
  function render(node,health,{legacy=false}={}){
    node.replaceChildren();node.hidden=!health||health.version===3;if(node.hidden)return;
    const title=make('strong','','Saved health snapshot');node.append(title);
    if(health.wellbeing){const scale=health.wellbeing.wellbeingScale===100?100:10;node.append(make('p','story-health-meta','Wellbeing: '+health.wellbeing.score+' / '+scale+' · self-report'));}
    if(health.version===1){const line=make('p','story-health-meta');line.textContent='Demo / '+definitions.slice(0,4).map(([key,,label,unit])=>label+' '+health.metrics[key]+' '+unit).join(' · ');node.append(line);}
  }
  function show(parent,health,size){if(health?.version!==3||!Array.isArray(health.widgets)||!health.widgets.length)return null;return overlay(parent,clone(health),{mediaSize:size});}
  async function photoFile(image,health){
    const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height)throw Error('photo_unavailable');const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.drawImage(image,0,0,width,height);
    const display=image.getBoundingClientRect(),scale=Math.min(display.width/width,display.height/height),factor=scale>0?1/scale:width/460,w=WIDTH*factor,h=HEIGHT*factor;
    for(const item of health?.version===3?health.widgets:[]){const reading=health.readings[item.key],definition=definitions.find(d=>d[0]===item.key);if(!reading||!definition)continue;const x=clamp(item.x)*Math.max(0,width-w),y=clamp(item.y)*Math.max(0,height-h);context.save();context.translate(x,y);context.scale(factor,factor);context.fillStyle='#09271fee';context.beginPath();if(typeof context.roundRect==='function')context.roundRect(0,0,WIDTH,HEIGHT,10);else context.rect(0,0,WIDTH,HEIGHT);context.fill();context.strokeStyle='#a3efbb88';context.lineWidth=1;context.stroke();context.fillStyle='#dcf9ea';context.font='10px sans-serif';context.fillText(definition[2],8,14,80);context.font='600 16px sans-serif';context.fillText(format(reading.value)+' '+definition[3],8,33,80);context.font='8px sans-serif';context.fillText(sourceName({...reading,key:item.key}),8,47,80);context.restore();}
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob)throw Error('photo_unavailable');return new File([blob],'mission-health-story.jpg',{type:'image/jpeg'});
  }
  window.missionStoryHealth=Object.freeze({snapshot,render,mount,show,photoFile,definitions:definitions.map(item=>item.slice(0,4))});
})();
