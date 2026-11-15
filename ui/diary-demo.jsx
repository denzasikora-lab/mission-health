import React from 'react';
import {createRoot} from 'react-dom/client';
import {KonstaProvider, Button} from 'konsta/react';

let mounted;
function paint(){
  if(!mounted)return;
  const {root,options}=mounted,dark=document.documentElement.dataset.theme==='dark';
  root.render(<KonstaProvider theme="ios" dark={dark} autoThemeDetection={false}>
    <Button small outline inline type="button" className="diary-demo-button" disabled={options.disabled}
      aria-label={options.title} title={options.title} aria-pressed={options.playing} onClick={options.onClick}>
      {options.label}
    </Button>
  </KonstaProvider>);
}
window.missionKonstaDiaryDemo={mount(host,options){
  if(!mounted){
    const shadow=host.attachShadow({mode:'open'}),style=document.createElement('link'),content=document.createElement('div');
    style.rel='stylesheet';style.href='/vendor/diary-demo.css?v=20261115-nasa-demo1';shadow.append(style,content);
    mounted={root:createRoot(content),options};
  }
  mounted.options=options;paint();
}};
new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
window.dispatchEvent(new Event('mission-diary-demo-ready'));
