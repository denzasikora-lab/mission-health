(() => {
  const toolbar=document.querySelector('.toolbar');
  const country=document.createElement('label');country.className='mission-tool mission-country-control';
  const shape=document.createElement('span');shape.className='mission-country-shape';shape.setAttribute('aria-hidden','true');
  const countryChoice=document.createElement('select');countryChoice.setAttribute('aria-label','Страна');country.append(shape,countryChoice);
  toolbar.insertBefore(country,document.getElementById('mission-theme-toggle'));
  let countryCode='';try{countryCode=localStorage.getItem('mission-health-country')||'';}catch{}
  if(!/^[A-Z]{2}$/.test(countryCode)){const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;countryCode=zone==='Europe/Istanbul'?'TR':{ru:'RU',en:'GB',ur:'PK'}[state.language]||'RU';}
  function renderCountry(){shape.style.maskImage='url("assets/country-outlines/'+countryCode.toLowerCase()+'.svg")';shape.style.webkitMaskImage=shape.style.maskImage;country.title=new Intl.DisplayNames(['ru'],{type:'region'}).of(countryCode)||countryCode;countryChoice.title=country.title;countryChoice.value=countryCode;}
  const initial=document.createElement('option');initial.value=countryCode;initial.textContent=countryCode;countryChoice.append(initial);renderCountry();
  fetch('/data/country-codes.json').then(response=>response.json()).then(codes=>{const names=new Intl.DisplayNames(['ru'],{type:'region'});countryChoice.replaceChildren();for(const code of codes.sort((a,b)=>(names.of(a)||a).localeCompare(names.of(b)||b,'ru'))){const option=document.createElement('option');option.value=code;option.textContent=names.of(code)||code;countryChoice.append(option);}renderCountry();}).catch(()=>{});
  countryChoice.addEventListener('change',()=>{countryCode=countryChoice.value;savePreference('mission-health-country',countryCode);renderCountry();});
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
