(() => {
  const home=document.getElementById('mission-home'),panel=home?.querySelector('.home-body-panel'),figure=panel?.querySelector('.home-human'),image=figure?.querySelector('img'),target=panel?.querySelector('[data-home-metric=activity]');
  if(!image||!target)return;
  const watch=document.createElement('button');watch.type='button';watch.className='home-body-watch';watch.setAttribute('aria-label','Посмотреть данные Actiwatch');watch.title='Actiwatch';
  watch.innerHTML='<svg viewBox="0 0 32 40" aria-hidden="true"><rect x="10" y="1" width="12" height="38" rx="4"/><rect x="3" y="10" width="26" height="20" rx="7"/><path d="m8 21 4-4 4 7 3-5h5"/></svg>';figure.append(watch);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('watch-connection');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(ns,'path'),flow=document.createElementNS(ns,'path'),start=document.createElementNS(ns,'circle'),end=document.createElementNS(ns,'circle');flow.classList.add('watch-connection-flow');start.setAttribute('r','3');end.setAttribute('r','4');svg.append(path,flow,start,end);panel.append(svg);
  let frame=0,highlight;
  function draw(){
    frame=0;const area=panel.getBoundingClientRect(),img=image.getBoundingClientRect(),human=figure.getBoundingClientRect();
    if(home.hidden||!area.width||!img.height){svg.setAttribute('hidden','');watch.hidden=true;return;}
    const scale=Math.min(img.width/170,img.height/450),x=img.left+(img.width-170*scale)/2+147.5*scale,y=img.top+(img.height-450*scale)/2+223*scale;
    watch.hidden=false;watch.style.left=x-human.left+'px';watch.style.top=y-human.top+'px';
    const box=target.getBoundingClientRect(),sx=x-area.left,sy=y-area.top,tx=box.left+box.width/2-area.left,ty=box.top-area.top+1,turnY=box.top-area.top-8;
    const d=`M ${sx} ${sy} L ${sx} ${sy+17} L ${sx} ${turnY} L ${tx} ${turnY} L ${tx} ${ty}`;
    svg.removeAttribute('hidden');svg.setAttribute('viewBox',`0 0 ${area.width} ${area.height}`);path.setAttribute('d',d);flow.setAttribute('d',d);start.setAttribute('cx',sx);start.setAttribute('cy',sy);end.setAttribute('cx',tx);end.setAttribute('cy',ty);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
  watch.addEventListener('click',()=>{target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});target.classList.add('watch-focused');clearTimeout(highlight);highlight=setTimeout(()=>target.classList.remove('watch-focused'),1800);});
  const resize=new ResizeObserver(schedule);resize.observe(home);resize.observe(image);resize.observe(panel);resize.observe(target);image.addEventListener('load',schedule);window.addEventListener('resize',schedule);new MutationObserver(schedule).observe(home,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);clearTimeout(highlight);});schedule();
})();
