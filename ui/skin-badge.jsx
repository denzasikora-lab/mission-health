import React from 'react';
import {createRoot} from 'react-dom/client';
import {KonstaProvider, Badge} from 'konsta/react';

const mounted=new Map();
function paint(record){
  const dark=document.documentElement.dataset.theme==='dark';
  record.root.render(<div className={dark?'k-ios dark':'k-ios'}><KonstaProvider theme="ios" dark={dark} autoThemeDetection={false}>
    <Badge small colors={{bg:'bg-amber-100 dark:bg-amber-900',text:'text-amber-950 dark:text-amber-100'}}>{record.label}</Badge>
  </KonstaProvider></div>);
}
window.missionKonstaBadge={mount(host,label){
  let record=mounted.get(host);if(!label){if(record&&record.label){record.label='';record.root.render(null);}return;}
  if(!record){const shadow=host.attachShadow({mode:'open'}),style=document.createElement('link'),content=document.createElement('div');style.rel='stylesheet';style.href='/vendor/skin-badge.css?v=20261115-skin-alert1';shadow.append(style,content);record={host,root:createRoot(content),label:null};mounted.set(host,record);}
  if(record.label===label)return;record.label=label;paint(record);
}};
new MutationObserver(()=>{for(const record of mounted.values())if(record.host.isConnected&&record.label)paint(record);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
window.dispatchEvent(new Event('mission-badges-ready'));
