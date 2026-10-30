(() => {
  const toolbar=document.querySelector('.toolbar');
  const country=document.createElement('span');country.className='mission-title-country';country.setAttribute('role','img');document.querySelector('.brand').append(country);
  function renderCountry(){const info=languageInfo[state.language],flag=info?.flag||'';const letters=Array.from(flag).map(char=>char.codePointAt(0)-0x1f1e6);const code=letters.length===2&&letters.every(n=>n>=0&&n<26)?letters.map(n=>String.fromCharCode(65+n)).join(''):{ru:'RU',en:'GB',ur:'PK'}[state.language]||'RU';country.style.maskImage='url("assets/country-outlines/'+code.toLowerCase()+'.svg")';country.style.webkitMaskImage=country.style.maskImage;const name=new Intl.DisplayNames(['ru'],{type:'region'}).of(code)||code;country.setAttribute('aria-label',name);country.title=name;savePreference('mission-health-country',code);}
  new MutationObserver(renderCountry).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});renderCountry();
  const monitor='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>';
  const devices=document.createElement('div');devices.className='mission-popover-control';
  devices.innerHTML='<button type="button" id="mission-device-button" class="mission-tool" aria-label="Вид экрана" aria-haspopup="menu" aria-expanded="false">'+monitor+'</button><div class="mission-popover" id="mission-device-menu" role="menu" aria-label="Вид экрана" hidden><h2>Вид экрана</h2>'+[['desktop','Компьютер'],['tablet','Планшет'],['duo','iPhone Duo'],['phone','Телефон']].map(([key,label])=>`<button type="button" role="menuitemradio" data-display-mode="${key}" aria-checked="false"><span>${label}</span><i aria-hidden="true">✓</i></button>`).join('')+'</div>';
  toolbar.append(devices);
  const deviceButton=document.getElementById('mission-device-button'),deviceMenu=document.getElementById('mission-device-menu');
  let mode='auto';
  try{mode=localStorage.getItem('mission-health-display')||'auto';}catch{}
  if(!['auto','desktop','tablet','duo','phone'].includes(mode))mode='auto';
  function closePanels(focus){deviceMenu.hidden=true;deviceButton.setAttribute('aria-expanded','false');if(focus)focus.focus();}
  function setMode(value){mode=value;document.body.dataset.display=value;savePreference('mission-health-display',value);deviceMenu.querySelectorAll('[data-display-mode]').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.displayMode===value)));deviceButton.title=value==='auto'?'Вид экрана':'Вид экрана: '+{desktop:'компьютер',tablet:'планшет',duo:'iPhone Duo',phone:'телефон'}[value];}
  deviceButton.addEventListener('click',()=>{const open=deviceMenu.hidden;closePanels();deviceMenu.hidden=!open;deviceButton.setAttribute('aria-expanded',String(open));if(open)(deviceMenu.querySelector(`[data-display-mode="${mode}"]`)||deviceMenu.querySelector('[data-display-mode]')).focus();});
  deviceMenu.addEventListener('click',event=>{const button=event.target.closest('[data-display-mode]');if(button){setMode(button.dataset.displayMode);closePanels(deviceButton);}});
  deviceMenu.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...deviceMenu.querySelectorAll('[data-display-mode]')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.mission-popover-control'))closePanels();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!deviceMenu.hidden){event.preventDefault();closePanels(deviceButton);}});
  setMode(mode);
})();
