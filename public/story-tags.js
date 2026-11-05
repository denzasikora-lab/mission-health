(() => {
  const core=window.MissionStoryTagsCore,cache=new Map();
  const key=value=>core.normalize(value).trim();
  function generate(value){const caption=key(value),saved=cache.get(caption);return saved&&saved.until>Date.now()?[...saved.tags]:core.generate(caption);}
  async function suggest(value,{signal}={}){
    const caption=key(value);if(!core.meaningful(caption))return [];
    const saved=cache.get(caption);if(saved&&saved.until>Date.now())return [...saved.tags];
    try{
      const result=await journalApi('/api/story-tags',{method:'POST',body:JSON.stringify({caption}),signal});
      if(signal?.aborted)throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
      const tags=core.finalize(core.parse(JSON.stringify(result.tags)));
      cache.delete(caption);cache.set(caption,{tags,until:Date.now()+(result.source==='model'?600000:20000)});if(cache.size>64)cache.delete(cache.keys().next().value);return [...tags];
    }catch(error){if(error.name==='AbortError'||signal?.aborted)throw error;return core.generate(caption);}
  }
  function blackHole(){return '<svg viewBox="0 0 180 120" class="tag-black-hole"><defs><radialGradient id="tag-hole-glow"><stop stop-color="#000"/><stop offset=".48" stop-color="#030307"/><stop offset=".58" stop-color="#ffe3a6"/><stop offset=".64" stop-color="#f1a54a" stop-opacity=".8"/><stop offset="1" stop-color="#d47c26" stop-opacity="0"/></radialGradient><linearGradient id="tag-hole-disk"><stop stop-color="#a55c25" stop-opacity="0"/><stop offset=".27" stop-color="#ffb650"/><stop offset=".5" stop-color="#fff2c5"/><stop offset=".74" stop-color="#ffb650"/><stop offset="1" stop-color="#a55c25" stop-opacity="0"/></linearGradient></defs><ellipse cx="90" cy="61" rx="82" ry="30" fill="#eaa74b" opacity=".07"/><g class="tag-hole-rings"><ellipse cx="90" cy="61" rx="77" ry="15" fill="none" stroke="url(#tag-hole-disk)" stroke-width="4"/><ellipse cx="90" cy="61" rx="66" ry="10" fill="none" stroke="#ffcd7e" stroke-width="1" opacity=".6"/></g><circle cx="90" cy="59" r="45" fill="url(#tag-hole-glow)"/><circle cx="90" cy="59" r="24" fill="#010204"/><path d="M22 62Q90 91 159 62" fill="none" stroke="url(#tag-hole-disk)" stroke-width="3"/><path d="M55 53C61 14 117 14 125 53" fill="none" stroke="#ffe2a1" stroke-width="2" opacity=".8"/></svg>';}
  function gauntlet(){return '<svg viewBox="0 0 150 160" class="tag-gauntlet"><defs><linearGradient id="tag-gold" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#6f421c"/><stop offset=".3" stop-color="#f2cf7c"/><stop offset=".55" stop-color="#a77732"/><stop offset=".8" stop-color="#dfbb65"/><stop offset="1" stop-color="#684119"/></linearGradient><radialGradient id="tag-stone-aura"><stop stop-color="#d9a8ff" stop-opacity=".8"/><stop offset="1" stop-color="#9e64ff" stop-opacity="0"/></radialGradient></defs><circle class="tag-stone-aura" cx="75" cy="69" r="60" fill="url(#tag-stone-aura)"/><g stroke="#6a461e" stroke-width="1.8" stroke-linejoin="round"><path d="M44 137L42 109Q30 93 35 70L43 57L107 61L116 86L106 116L105 139Z" fill="url(#tag-gold)"/><path d="M44 128L105 126L110 151L40 153Z" fill="url(#tag-gold)"/><path d="M49 135L100 133M48 143L102 141M53 109L94 113L98 91L56 86Z" fill="none" stroke="#f0d28b"/><g class="tag-gauntlet-fingers"><path d="M43 66L35 40Q35 31 43 29Q51 28 54 37L60 62Z" fill="url(#tag-gold)"/><path d="M58 64L52 24Q52 13 60 13Q69 13 70 23L75 61Z" fill="url(#tag-gold)"/><path d="M76 63L75 17Q77 8 85 11Q92 13 92 22L93 66Z" fill="url(#tag-gold)"/><path d="M94 66L96 30Q99 21 106 25Q112 28 111 37L110 77Z" fill="url(#tag-gold)"/><path d="M37 45L52 42M54 32L70 30M77 31L91 31M96 43L110 45" fill="none" stroke="#ffe2a0"/></g><path class="tag-gauntlet-thumb" d="M42 96L25 70Q22 63 28 59Q34 55 41 64L58 83L64 91" fill="url(#tag-gold)"/><path d="M48 72L65 67L91 72L101 89L77 105L54 92Z" fill="#b5893d"/><path d="M54 76L73 70L94 79L90 93L74 100L57 89Z" fill="none" stroke="#f4d78f"/></g><g class="tag-infinity-stones"><ellipse cx="45" cy="57" rx="6" ry="7" fill="#8e5aff"/><ellipse cx="64" cy="53" rx="6" ry="7" fill="#4389ff"/><ellipse cx="84" cy="54" rx="6" ry="7" fill="#ed594f"/><ellipse cx="103" cy="61" rx="5" ry="6" fill="#f2b54b"/><ellipse cx="36" cy="78" rx="5" ry="6" fill="#6ee8a7"/><path d="M73 77L82 83L80 92L71 95L64 87L66 80Z" fill="#ffe57e"/></g><path class="tag-snap-star" d="M40 24L44 39L59 43L44 47L40 63L36 47L21 43L36 39Z" fill="#f1d9ff"/></svg>';}
  function mount(input){
    input.setAttribute('aria-label','Подпись к сториз');
    const field=document.createElement('span');field.className='story-caption-field';input.before(field);field.append(input);
    const clear=document.createElement('button');clear.type='button';clear.className='story-caption-clear';clear.setAttribute('aria-label','Очистить подпись');clear.title='Очистить подпись';clear.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';field.append(clear);
    const syncClear=()=>{clear.hidden=!input.value;clear.disabled=input.disabled;};syncClear();new MutationObserver(syncClear).observe(input,{attributes:true,attributeFilter:['disabled']});
    const section=document.createElement('section');section.className='story-tags';section.setAttribute('aria-label','Хэштеги по подписи');
    section.innerHTML='<div class="story-tags-zone"><div class="story-tag-list" aria-label="Предложенные хэштеги"></div><div class="story-tags-fx" aria-hidden="true"></div></div><span class="sr-only story-tags-status" role="status" aria-live="polite"></span>';
    section.hidden=true;input.closest('label').after(section);
    const list=section.querySelector('.story-tag-list'),zone=section.querySelector('.story-tags-zone'),fx=section.querySelector('.story-tags-fx'),status=section.querySelector('.story-tags-status');
    let modelTimer,controller,requestVersion=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');let previous=input.value,tags=[],typingTimer,finishTimer,active=false,queue=[],effectIndex=0,composing=false,deleted=false;
    const animations=new Set();
    const animate=(node,frames,options)=>{if(!node.animate||reduced.matches)return;const animation=node.animate(frames,options);animations.add(animation);animation.finished.then(()=>animations.delete(animation),()=>animations.delete(animation));return animation;};
    function finish(){clearTimeout(finishTimer);for(const animation of animations)animation.cancel();animations.clear();fx.replaceChildren();active=false;delete section.dataset.effect;if(queue.length)play(queue.shift());}
    function play(ghosts){
      if(reduced.matches||!ghosts.length)return;
      if(active){if(queue.length)queue[0]=[...queue[0],...ghosts].slice(-12);else queue.push(ghosts);return;}
      active=true;const type=effectIndex++%2===0?'black-hole':'snap';section.dataset.effect=type;section.dataset.lastEffect=type;
      const bounds=zone.getBoundingClientRect(),center={x:bounds.width-68,y:Math.min(bounds.height/2,50)};
      const scene=document.createElement('div');scene.className='story-tag-scene';scene.style.left=(center.x-90+3)+'px';scene.style.top=(center.y-60+8)+'px';scene.innerHTML=type==='black-hole'?blackHole():gauntlet();fx.append(scene);
      animate(scene,[{opacity:0,transform:'scale(.35)'},{opacity:1,transform:'scale(1)',offset:.22},{opacity:1,transform:'scale(1)',offset:.8},{opacity:0,transform:'scale(.7)'}],{duration:1250,easing:'ease-out',fill:'forwards'});
      ghosts.slice(0,12).forEach((ghost,index)=>{
        const chip=document.createElement('span');chip.className='story-tag story-tag-ghost';chip.textContent=ghost.tag;chip.style.left=ghost.x+'px';chip.style.top=ghost.y+'px';chip.style.width=ghost.width+'px';fx.append(chip);
        const delay=Math.min(index*38,220);
        if(type==='black-hole'){
          const dx=center.x-ghost.x-ghost.width/2,dy=center.y-ghost.y-14;
          animate(chip,[{transform:'translate(0,0) scale(1)',opacity:1,filter:'blur(0)'},{transform:`translate(${dx*.25}px,${dy-25}px) rotate(-14deg) scale(.96)`,opacity:1,offset:.35},{transform:`translate(${dx}px,${dy}px) rotate(125deg) scale(0)`,opacity:0,filter:'blur(3px)'}],{duration:850,delay,easing:'cubic-bezier(.5,0,.85,.45)',fill:'forwards'});
        }else{
          animate(chip,[{opacity:1,clipPath:'inset(0 0 0 0)',filter:'blur(0)',transform:'translate(0,0)'},{opacity:1,clipPath:'inset(0 0 0 0)',offset:.3},{opacity:0,clipPath:'inset(0 0 0 100%)',filter:'blur(2px)',transform:'translate(12px,-8px)'}],{duration:920,delay:100+delay,easing:'ease-out',fill:'forwards'});
          for(let p=0;p<12;p++){
            const dust=document.createElement('i');dust.className='story-tag-dust';dust.style.left=ghost.x+Math.random()*ghost.width+'px';dust.style.top=ghost.y+Math.random()*25+'px';dust.style.setProperty('--dust-color',['#c4d7b0','#a78dcb','#d2b36b','#95a9a3'][p%4]);fx.append(dust);
            const dx=30+Math.random()*75,dy=-20-Math.random()*60;
            animate(dust,[{transform:'translate(0,0) scale(.3)',opacity:0},{opacity:.9,offset:.18},{transform:`translate(${dx}px,${dy}px) rotate(${p*47}deg) scale(.1)`,opacity:0}],{duration:700+Math.random()*260,delay:350+delay+Math.random()*120,easing:'ease-out',fill:'forwards'});
          }
        }
      });
      finishTimer=setTimeout(finish,1450);
    }
    function update(suggested){
      syncClear();clearTimeout(typingTimer);if(composing)return;
      const next=Array.isArray(suggested)?suggested:generate(input.value),same=next.join('|')===tags.join('|'),wasDelete=deleted;deleted=false;
      if(same){section.hidden=!next.length;return;}
      if(!next.length){tags=[];list.replaceChildren();section.hidden=true;status.textContent='Хэштеги очищены.';queue=[];finish();return;}
      section.hidden=false;
      const zoneBox=zone.getBoundingClientRect(),oldNodes=new Map([...list.children].map(node=>[node.textContent,node])),oldBoxes=new Map([...oldNodes].map(([tag,node])=>[tag,node.getBoundingClientRect()]));
      const leaving=[...oldNodes].filter(([tag])=>!next.includes(tag));
      const ghosts=leaving.map(([tag,node])=>{const rect=node.getBoundingClientRect();return {tag,x:rect.left-zoneBox.left,y:rect.top-zoneBox.top,width:rect.width};});
      list.replaceChildren(...next.map((tag,index)=>{
        const chip=oldNodes.get(tag)||document.createElement('span');chip.className='story-tag';chip.textContent=tag;
        if(!oldNodes.has(tag))animate(chip,[{opacity:0,transform:'translateY(9px) scale(.87)',filter:'blur(3px)'},{opacity:1,transform:'translateY(0) scale(1)',filter:'blur(0)'}],{duration:360,delay:index*35,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
        return chip;
      }));
      for(const chip of list.children){const old=oldBoxes.get(chip.textContent);if(!old)continue;const rect=chip.getBoundingClientRect(),x=old.left-rect.left,y=old.top-rect.top;if(x||y)animate(chip,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:280,easing:'ease-out'});}
      tags=next;status.textContent=tags.length?'Хэштеги: '+tags.join(', '):'Хэштеги очищены.';
      if(wasDelete&&ghosts.length)play(ghosts);
      else for(const ghost of ghosts){const node=document.createElement('span');node.className='story-tag story-tag-ghost';node.textContent=ghost.tag;node.style.left=ghost.x+'px';node.style.top=ghost.y+'px';fx.append(node);const animation=animate(node,[{opacity:.6},{opacity:0,transform:'translateY(-7px) scale(.9)'}],{duration:180,fill:'forwards'});if(animation)animation.finished.then(()=>node.remove(),()=>node.remove());else node.remove();}
    }
    function cancel(){clearTimeout(modelTimer);controller?.abort();controller=null;requestVersion++;zone.removeAttribute('aria-busy');}
    function refine(){
      cancel();if(composing||!core.meaningful(input.value))return;
      const version=requestVersion,caption=input.value;
      modelTimer=setTimeout(async()=>{
        if(version!==requestVersion||caption!==input.value)return;
        const current=new AbortController();controller=current;zone.setAttribute('aria-busy','true');
        try{const tags=await suggest(caption,{signal:current.signal});if(version===requestVersion&&caption===input.value)update(tags);}catch{}
        finally{if(version===requestVersion){controller=null;zone.removeAttribute('aria-busy');}}
      },650);
    }
    input.addEventListener('input',event=>{deleted ||= event.inputType?.startsWith('delete')||input.value.length<previous.length;previous=input.value;syncClear();clearTimeout(typingTimer);refine();if(!composing)typingTimer=setTimeout(update,140);});
    input.addEventListener('compositionstart',()=>{composing=true;cancel();clearTimeout(typingTimer);});input.addEventListener('compositionend',()=>{composing=false;update();refine();});
    clear.addEventListener('click',()=>{if(input.disabled)return;composing=false;input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));update();input.focus();});
    function reset(){cancel();clearTimeout(typingTimer);queue=[];finish();tags=[];previous=input.value;deleted=false;list.replaceChildren();section.hidden=true;status.textContent='';delete section.dataset.lastEffect;update();}
    const dialog=input.closest('dialog');dialog.addEventListener('close',()=>{cancel();queue=[];clearTimeout(typingTimer);finish();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){queue=[];finish();}});
    return {reset,flush:update};
  }
  window.missionStoryTags=Object.freeze({generate,suggest,mount});
})();
