(() => {
  const states=new WeakMap(),active=new Set(),selector='.personal-composer textarea';
  let sequence=0;
  const styleKeys=['fontFamily','fontSize','fontWeight','fontStyle','fontVariant','fontStretch','lineHeight','letterSpacing','wordSpacing','textIndent','textTransform','textAlign','direction','tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','boxSizing','wordBreak','overflowWrap'];
  function eligible(state){
    const input=state.input;
    return !document.hidden&&input.isConnected&&input.dataset.activityArea==='chat'&&!input.disabled&&!input.readOnly&&!state.form.hidden&&!input.closest('[hidden]')&&input.getClientRects().length>0&&input.getAttribute('aria-busy')!=='true'&&state.form.getAttribute('aria-busy')!=='true'&&document.activeElement===input&&!state.composing&&input.selectionStart===input.value.length&&input.selectionEnd===input.value.length;
  }
  function sync(state){
    const computed=getComputedStyle(state.input);
    for(const key of styleKeys)state.layer.style[key]=computed[key];
    state.layer.style.width=state.input.clientWidth+'px';state.layer.style.height=state.input.clientHeight+'px';
    state.layer.scrollTop=state.input.scrollTop;state.layer.scrollLeft=state.input.scrollLeft;
  }
  function clear(state){
    clearTimeout(state.timer);state.timer=null;state.controller?.abort();state.controller=null;state.version++;
    state.completion='';state.prefix='';state.prefixNode.textContent='';state.suffixNode.textContent='';if(!state.layer.hidden)state.layer.hidden=true;if(!state.hint.hidden)state.hint.hidden=true;
  }
  function show(state,prefix,completion){
    state.prefix=prefix;state.completion=completion;state.prefixNode.textContent=prefix;state.suffixNode.textContent=completion;state.layer.hidden=false;state.hint.hidden=false;sync(state);
  }
  function schedule(state){
    clear(state);
    const prefix=state.input.value;
    if(!eligible(state)||prefix.trim().length<3||prefix.length>=state.input.maxLength||prefix===state.dismissed)return;
    const body=JSON.stringify({prefix});
    if(new TextEncoder().encode(body).length>20000)return;
    const version=state.version;
    state.timer=setTimeout(async()=>{
      state.timer=null;
      if(version!==state.version||!eligible(state)||state.input.value!==prefix)return;
      const controller=new AbortController();state.controller=controller;
      const timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const data=await journalApi('/api/compose',{method:'POST',body,signal:controller.signal});
        if(controller.signal.aborted||version!==state.version||!eligible(state)||state.input.value!==prefix)return;
        if(typeof data.completion!=='string'||!data.completion.trim()||data.completion.length>300)return;
        const available=state.input.maxLength-prefix.length,completion=data.completion.slice(0,available);
        if(completion.trim())show(state,prefix,completion);
      }catch{
        if(version===state.version)clear(state);
      }finally{
        clearTimeout(timeout);if(state.controller===controller)state.controller=null;
      }
    },700);
  }
  function attach(input){
    if(states.has(input))return states.get(input);
    const form=input.closest('form.personal-composer');if(!form)return null;
    const wrapper=document.createElement('div'),layer=document.createElement('div'),prefixNode=document.createElement('span'),suffixNode=document.createElement('span'),hint=document.createElement('span');
    wrapper.className='compose-ghost-wrap';layer.className='compose-ghost-layer';layer.setAttribute('aria-hidden','true');layer.hidden=true;
    prefixNode.className='compose-ghost-prefix';suffixNode.className='compose-ghost-suffix';layer.append(prefixNode,suffixNode);
    hint.className='compose-tab-hint';hint.id='compose-tab-hint-'+(++sequence);hint.textContent='Tab - принять';hint.hidden=true;
    input.before(wrapper);wrapper.append(layer,input);form.querySelector('footer').append(hint);
    const described=input.getAttribute('aria-describedby');input.setAttribute('aria-describedby',[described,hint.id].filter(Boolean).join(' '));
    const state={input,form,wrapper,layer,prefixNode,suffixNode,hint,version:0,completion:'',prefix:'',controller:null,timer:null,composing:false,dismissed:null};states.set(input,state);active.add(state);
    input.addEventListener('input',()=>{state.dismissed=null;schedule(state);});
    input.addEventListener('focus',()=>schedule(state));
    input.addEventListener('blur',()=>clear(state));
    input.addEventListener('compositionstart',()=>{state.composing=true;clear(state);});
    input.addEventListener('compositionend',()=>{state.composing=false;state.dismissed=null;schedule(state);});
    input.addEventListener('scroll',()=>{if(state.completion)sync(state);},{passive:true});
    input.addEventListener('click',()=>{if(!eligible(state))clear(state);else if(!state.completion)schedule(state);});
    input.addEventListener('keydown',event=>{
      if(event.isComposing||state.composing){clear(state);return;}
      if(event.key==='Escape'){
        if(state.completion||state.timer||state.controller)event.preventDefault();state.dismissed=input.value;clear(state);return;
      }
      if(event.key==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&state.completion&&state.prefix===input.value&&eligible(state)){
        const completion=state.completion;event.preventDefault();clear(state);input.value+=completion;input.setSelectionRange(input.value.length,input.value.length);input.dispatchEvent(new Event('input',{bubbles:true}));return;
      }
      if(event.key==='Enter'){state.dismissed=input.value;clear(state);return;}
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))clear(state);
    },true);
    input.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))schedule(state);});
    if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(state.completion)sync(state);}).observe(input);
    return state;
  }
  function scan(){for(const input of document.querySelectorAll(selector))attach(input);}
  function refresh(input){const state=states.get(input)||attach(input);if(state)clear(state);}
  new MutationObserver(records=>{
    if(records.some(record=>record.type==='childList'&&[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.(selector)||node.querySelector?.(selector)))))scan();
    for(const state of active)if(!eligible(state)||state.prefix&&state.prefix!==state.input.value)clear(state);
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','hidden','data-activity-area','aria-busy']});
  document.addEventListener('selectionchange',()=>{for(const state of active)if(state.completion&&!eligible(state))clear(state);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const state of active)clear(state);});
  window.addEventListener('resize',()=>{for(const state of active)if(state.completion)sync(state);});
  window.addEventListener('pagehide',()=>{for(const state of active)clear(state);});
  window.missionCompose={attach,refresh};scan();
})();
