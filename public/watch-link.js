(() => {
  const home=document.getElementById('mission-home'),panel=home?.querySelector('.home-body-panel'),figure=panel?.querySelector('.home-human'),image=figure?.querySelector('img');
  if(!image)return;
  const definitions=[
    {key:'respiration',point:[75,125],side:'top',lane:0},
    {key:'pressure',point:[39,150],side:'top',lane:1},
    {key:'recovery',point:[100,214],side:'top',lane:2},
    {key:'hr',point:[87,128],side:'left',lane:0},
    {key:'temp',point:[22,224],side:'left',lane:1},
    {key:'sleep',point:[84,40],side:'left',lane:2},
    {key:'spo2',point:[153,262],side:'right',lane:0},
    {key:'wellbeing',point:[84,40],side:'right',lane:1},
    {key:'hrv',point:[87,128],side:'right',lane:2},
    {key:'steps',point:[105,403],side:'bottom',lane:0},
    {key:'activity',point:[149,231],side:'bottom',lane:1},
    {key:'light',point:[115,95],side:'bottom',lane:2}
  ];
  const target=panel.querySelector('[data-home-metric=activity]');
  if(!target)return;
  const watch=document.createElement('button');watch.type='button';watch.className='home-body-watch';watch.setAttribute('aria-label','Посмотреть движение / Actiwatch');watch.title='Actiwatch';
  watch.innerHTML='<svg viewBox="0 0 20 34" aria-hidden="true"><path class="watch-band" d="M6 1h8l1 10v12l-1 10H6L5 23V11Z"/><rect class="watch-case" x="2" y="9" width="16" height="16" rx="4"/><rect class="watch-screen" x="4.5" y="12" width="11" height="10" rx="2"/><path class="watch-pulse" d="m6 18 2-2 2 3 2-3h2"/></svg>';figure.append(watch);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('body-connections');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  const connections=definitions.flatMap(definition=>{
    const card=panel.querySelector('[data-home-metric='+definition.key+']');if(!card)return [];
    const group=document.createElementNS(ns,'g');group.classList.add('body-link');group.dataset.metric=definition.key;
    const path=document.createElementNS(ns,'path'),flow=document.createElementNS(ns,'path'),start=document.createElementNS(ns,'circle'),end=document.createElementNS(ns,'circle');
    path.classList.add('body-link-path');flow.classList.add('body-link-flow');start.classList.add('body-link-start');end.classList.add('body-link-end');start.setAttribute('r','2.2');end.setAttribute('r','2.8');
    group.append(path,flow,start,end);svg.append(group);return [{...definition,card,group,path,flow,start,end}];
  });
  panel.append(svg);
  let frame=0,highlight;
  function draw(){
    frame=0;const area=panel.getBoundingClientRect(),img=image.getBoundingClientRect(),human=figure.getBoundingClientRect();
    if(home.hidden||!area.width||!img.height){svg.setAttribute('hidden','');watch.hidden=true;return;}
    const scale=Math.min(img.width/170,img.height/450),originX=img.left+(img.width-170*scale)/2,originY=img.top+(img.height-450*scale)/2;
    const point=([x,y])=>[originX+x*scale-area.left,originY+y*scale-area.top];
    const wrist=point([149,231]);watch.hidden=false;watch.style.left=wrist[0]+area.left-human.left+'px';watch.style.top=wrist[1]+area.top-human.top+'px';
    const rectangles=new Map(connections.map(connection=>[connection.key,connection.card.getBoundingClientRect()]));
    const top=connections.filter(connection=>connection.side==='top').map(connection=>rectangles.get(connection.key));
    const middle=connections.filter(connection=>['left','right'].includes(connection.side)).map(connection=>rectangles.get(connection.key));
    const bottom=connections.filter(connection=>connection.side==='bottom').map(connection=>rectangles.get(connection.key));
    const middleTop=Math.min(...middle.map(rect=>rect.top)),middleBottom=Math.max(...middle.map(rect=>rect.bottom));
    const topBottom=Math.max(...top.map(rect=>rect.bottom)),bottomTop=Math.min(...bottom.map(rect=>rect.top));
    const leftEdge=Math.max(...connections.filter(connection=>connection.side==='left').map(connection=>rectangles.get(connection.key).right));
    const rightEdge=Math.min(...connections.filter(connection=>connection.side==='right').map(connection=>rectangles.get(connection.key).left));
    const centralLeft=human.left,centralRight=human.right,centralWidth=human.width;
    for(const connection of connections){
      const {side,lane,card,group,path,flow,start,end}=connection,box=rectangles.get(connection.key),[sx,sy]=point(connection.point),fraction=(lane+1)/4;
      let tx,ty,route;
      if(side==='left'||side==='right'){
        tx=(side==='left'?box.right:box.left)-area.left;ty=box.top+box.height/2-area.top;
        const laneX=(side==='left'?leftEdge+(centralLeft-leftEdge)*fraction:centralRight+(rightEdge-centralRight)*fraction)-area.left;
        route=[[sx,sy],[laneX,sy],[laneX,ty],[tx,ty]];
      }else{
        tx=box.left+box.width/2-area.left;ty=(side==='top'?box.bottom:box.top)-area.top;
        // Горизонтальные участки проходят между рядами, вертикальные остаются в колонке фигуры.
        const laneX=centralLeft+centralWidth*((side==='top'?.18:.3)+lane*.24)-area.left;
        const laneY=(side==='top'?topBottom+(middleTop-topBottom)*fraction:middleBottom+(bottomTop-middleBottom)*fraction)-area.top;
        route=[[sx,sy],[laneX,sy],[laneX,laneY],[tx,laneY],[tx,ty]];
      }
      const d=route.map(([x,y],index)=>(index?'L':'M')+' '+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
      const level=['green','amber','red','neutral'].includes(card.dataset.trendLevel)?card.dataset.trendLevel:'neutral';
      group.dataset.level=level;group.dataset.selected=String(card.getAttribute('aria-pressed')==='true');
      path.setAttribute('d',d);flow.setAttribute('d',d);start.setAttribute('cx',sx);start.setAttribute('cy',sy);end.setAttribute('cx',tx);end.setAttribute('cy',ty);
    }
    svg.removeAttribute('hidden');svg.setAttribute('viewBox',`0 0 ${area.width} ${area.height}`);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
  watch.addEventListener('click',()=>{target.click();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});target.classList.add('watch-focused');clearTimeout(highlight);highlight=setTimeout(()=>target.classList.remove('watch-focused'),1800);});
  const resize=new ResizeObserver(schedule);resize.observe(home);resize.observe(panel);resize.observe(image);for(const connection of connections)resize.observe(connection.card);
  const mutations=new MutationObserver(schedule);mutations.observe(home,{attributes:true,attributeFilter:['hidden']});for(const connection of connections)mutations.observe(connection.card,{attributes:true,attributeFilter:['data-trend-level','aria-pressed']});
  image.addEventListener('load',schedule);window.addEventListener('resize',schedule);
  window.addEventListener('pagehide',event=>{cancelAnimationFrame(frame);frame=0;clearTimeout(highlight);if(!event.persisted){resize.disconnect();mutations.disconnect();}});window.addEventListener('pageshow',schedule);schedule();
})();
