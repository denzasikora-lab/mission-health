(() => {
  const toolbar=document.querySelector('.toolbar');
  const monitor='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>';
  const country=document.createElement('div');country.className='mission-popover-control';
  country.innerHTML='<button type="button" id="mission-country-button" class="mission-tool" aria-label="Выбрать страну" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18 6-5 6-13 0-18Z"/></svg></button><div class="mission-popover" id="mission-country-panel" role="dialog" aria-label="Страна подключения" hidden><h2>Контур страны</h2><p id="mission-country-status">Страна пока не определена.</p><label for="mission-country-select">Выбрать вручную</label><select id="mission-country-select"><option value="">Автоматически</option></select><button type="button" id="mission-country-auto">Определить автоматически</button><small>Показывается страна сетевого подключения. VPN может изменить результат.</small></div>';
  const devices=document.createElement('div');devices.className='mission-popover-control';
  devices.innerHTML='<button type="button" id="mission-device-button" class="mission-tool" aria-label="Вид экрана и устройства" aria-haspopup="menu" aria-expanded="false">'+monitor+'<b class="mission-new-badge">NEW</b></button><div class="mission-popover" id="mission-device-menu" role="menu" aria-label="Вид экрана" hidden><h2>Вид экрана</h2>'+[['auto','Автоматически','По ширине окна'],['desktop','Компьютер','Полная ширина'],['tablet','Планшет','До 900 пикселей'],['duo','iPhone Duo','Раскрытый вид / до 768 пикселей'],['phone','Телефон','До 430 пикселей']].map(([key,label,hint])=>`<button type="button" role="menuitemradio" data-display-mode="${key}" aria-checked="false"><span>${label}${key==='duo'?'<b class="mission-new-inline">NEW</b>':''}<small>${hint}</small></span><i aria-hidden="true">✓</i></button>`).join('')+'<p>Меняется представление сайта. К устройствам и датчикам подключение не выполняется.</p></div>';
  toolbar.insertBefore(country,document.querySelector('.language-control'));toolbar.append(devices);
  const countryButton=document.getElementById('mission-country-button'),countryPanel=document.getElementById('mission-country-panel'),countrySelect=document.getElementById('mission-country-select'),countryStatus=document.getElementById('mission-country-status');
  const deviceButton=document.getElementById('mission-device-button'),deviceMenu=document.getElementById('mission-device-menu');
  let mode='auto',codes=[],automatic=null,selected='',source='';
  try{mode=localStorage.getItem('mission-health-display')||'auto';selected=localStorage.getItem('mission-health-country')||'';}catch{}
  if(!['auto','desktop','tablet','duo','phone'].includes(mode))mode='auto';
  const names=new Intl.DisplayNames(['ru'],{type:'region'});
  function closePanels(focus){countryPanel.hidden=true;deviceMenu.hidden=true;countryButton.setAttribute('aria-expanded','false');deviceButton.setAttribute('aria-expanded','false');if(focus)focus.focus();}
  function setMode(value){mode=value;document.body.dataset.display=value;savePreference('mission-health-display',value);deviceMenu.querySelectorAll('[data-display-mode]').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.displayMode===value)));deviceButton.title='Вид экрана: '+{auto:'автоматически',desktop:'компьютер',tablet:'планшет',duo:'iPhone Duo',phone:'телефон'}[value];}
  function renderCountry(){
    const code=selected||automatic;if(!codes.includes(code))return;
    const label=names.of(code)||code;const solid=['AE','AU','CN','ES','FR','GB','NZ','RU'].includes(code);
    countryButton.replaceChildren();const shape=document.createElement('span');shape.className='mission-country-shape';shape.style.maskImage=`url("assets/${solid?'country-solid':'country-outlines'}/${code.toLowerCase()}.svg")`;shape.style.webkitMaskImage=shape.style.maskImage;countryButton.append(shape);
    countryButton.setAttribute('aria-label','Контур страны: '+label);countryButton.title=label;countryStatus.textContent=label+' / '+(selected?'выбрана вручную':source);countrySelect.value=selected;
  }
  async function detectCountry(){
    countryStatus.textContent='Определение страны подключения...';
    try{const response=await fetch('/api/location');if(response.ok){const data=await response.json();if(codes.includes(data.country)){automatic=data.country;source='по сетевому подключению';}}}catch{}
    if(!automatic){const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;const zones={'Europe/Istanbul':'TR','Asia/Istanbul':'TR','Europe/Moscow':'RU','Europe/London':'GB','Asia/Dubai':'AE','Asia/Karachi':'PK','Asia/Shanghai':'CN','Europe/Paris':'FR'};automatic=zones[zone]||null;source='по часовому поясу устройства';}
    if(automatic)renderCountry();else countryStatus.textContent='Страну определить не удалось. Выбери ее вручную.';
  }
  countryButton.addEventListener('click',()=>{const open=countryPanel.hidden;closePanels();countryPanel.hidden=!open;countryButton.setAttribute('aria-expanded',String(open));if(open)countrySelect.focus();});
  countrySelect.addEventListener('change',()=>{selected=countrySelect.value;savePreference('mission-health-country',selected);if(selected)renderCountry();else void detectCountry();});
  document.getElementById('language-menu').addEventListener('click',event=>{
    const language=event.target.closest('[data-language]')?.dataset.language;
    const code={en:'GB',ru:'RU',ur:'PK'}[language];
    if(!code)return;
    selected=code;savePreference('mission-health-country',selected);renderCountry();
  });
  document.getElementById('mission-country-auto').addEventListener('click',()=>{selected='';savePreference('mission-health-country','');countrySelect.value='';automatic=null;void detectCountry();});
  deviceButton.addEventListener('click',()=>{const open=deviceMenu.hidden;closePanels();deviceMenu.hidden=!open;deviceButton.setAttribute('aria-expanded',String(open));if(open)deviceMenu.querySelector(`[data-display-mode="${mode}"]`).focus();});
  deviceMenu.addEventListener('click',event=>{const button=event.target.closest('[data-display-mode]');if(button){setMode(button.dataset.displayMode);closePanels(deviceButton);}});
  deviceMenu.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...deviceMenu.querySelectorAll('[data-display-mode]')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.mission-popover-control'))closePanels();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(!countryPanel.hidden||!deviceMenu.hidden)){event.preventDefault();closePanels(countryPanel.hidden?deviceButton:countryButton);}});
  setMode(mode);
  fetch('/data/country-codes.json').then(response=>{if(!response.ok)throw new Error();return response.json()}).then(values=>{codes=values;const options=codes.map(code=>({code,name:names.of(code)||code})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));for(const item of options){const option=document.createElement('option');option.value=item.code;option.textContent=item.name;countrySelect.append(option);}if(selected)renderCountry();else void detectCountry();}).catch(()=>{countryStatus.textContent='Список стран не загрузился. Обнови страницу.';});
})();
