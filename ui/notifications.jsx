import React from 'react';
import {createRoot} from 'react-dom/client';
import {KonstaProvider, Notification} from 'konsta/react';

let host,root,current=null;
function render(){
  if(!root)return;
  if(!current?.items.length){host.hidden=true;root.render(null);return;}
  host.hidden=false;
  const dark=document.documentElement.dataset.theme==='dark',{items,onClose}=current;
  root.render(<div className={dark?'k-ios dark':'k-ios'}><KonstaProvider theme="ios" dark={dark} autoThemeDetection={false}>
    <Notification opened button title="Mission Health" subtitle="Reminder" text={items[0].title}
      titleRightText={items.length>1?items.length+' due':'now'} role="status" aria-live="polite"
      ref={element=>{const close=element?.querySelector('[role="button"]');if(close)close.setAttribute('aria-label','Dismiss reminder');}}
      onClose={onClose} onClick={event=>{if(!event.target.closest('[role="button"]'))window.dispatchEvent(new Event('mission-tasks-open'));}}
      onKeyDown={event=>{if(['Enter',' '].includes(event.key)&&event.target.getAttribute('role')==='button'){event.preventDefault();onClose();}}}/>
  </KonstaProvider></div>);
}
window.missionNotifications={
  show(items,onClose){
    if(!host){host=document.createElement('div');host.id='mission-reminders';const shadow=host.attachShadow({mode:'open'}),style=document.createElement('link'),content=document.createElement('div');style.rel='stylesheet';style.href='/vendor/mission-notifications.css?v=20261114-konsta2';shadow.append(style,content);document.body.append(host);root=createRoot(content);new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}
    current={items,onClose};render();
  },
  hide(){current=null;render();}
};
