import React from 'react';
import {createRoot} from 'react-dom/client';
import {KonstaProvider, Chip} from 'konsta/react';

const roots=new WeakMap(),mounted=new Set();
function paint(record){
  const {host,root,options}=record,{label,value,unit,source,onClick,onDelete,selected}=options,dark=document.documentElement.dataset.theme==='dark';
  root.render(<KonstaProvider theme="ios" dark={dark} autoThemeDetection={false}>
    <Chip component={onClick?'button':'div'} className="story-metric-chip" deleteButton={Boolean(onDelete)}
      {...(onClick?{type:'button','aria-pressed':Boolean(selected),'aria-label':'Add '+label+' widget',onClick}:{})}
      ref={element=>{const button=element?.querySelector('[role="button"]');if(button)button.setAttribute('aria-label','Remove '+label+' widget');}}
      onDelete={event=>{event.stopPropagation();onDelete?.();}}
      onKeyDown={event=>{if(event.target.getAttribute('role')==='button'&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();onDelete?.();}}}>
      <span className="metric-label">{label}</span><span className="metric-value">{value}<small>{unit}</small></span><span className="metric-source">{source}</span>
    </Chip>
  </KonstaProvider>);
}
window.missionKonstaChip={
  mount(host,options){let record=roots.get(host);if(!record){const shadow=host.attachShadow({mode:'open'}),style=document.createElement('link'),content=document.createElement('div');style.rel='stylesheet';style.href='/vendor/story-widgets.css?v=20261114-stickers1';shadow.append(style,content);record={host,root:createRoot(content),options};roots.set(host,record);mounted.add(record);}record.options=options;paint(record);},
  unmount(host){const record=roots.get(host);if(!record)return;mounted.delete(record);roots.delete(host);queueMicrotask(()=>record.root.unmount());}
};
new MutationObserver(()=>{for(const record of mounted)if(record.host.isConnected)paint(record);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
