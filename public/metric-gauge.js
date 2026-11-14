(() => {
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function markup({value,max=100,label='',unit,maxLabel,reverse=false,compact=false,digits=0}){
    const valid=Number.isFinite(value)&&Number.isFinite(max)&&max>0&&value>=0&&value<=max;
    const fraction=valid?value/max:0,hue=valid?(reverse?1-fraction:fraction)*145:0;
    const number=valid?new Intl.NumberFormat('en',{maximumFractionDigits:digits}).format(value):'-';
    const suffix=unit||maxLabel||'/ '+max;
    const accessible=label+': '+(valid?number+(unit?' '+unit:' from '+max):'No data');
    return `<span class="metric-gauge${compact?' metric-gauge-compact':''}${valid?'':' metric-gauge-empty'}${fraction===0?' metric-gauge-zero':''}" style="--gauge-color:hsl(${hue.toFixed(1)} 62% 62%)" ${valid?`role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"`:'role="img"'} aria-label="${escape(accessible)}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="metric-gauge-track" cx="50" cy="50" r="43"/><circle class="metric-gauge-fill" cx="50" cy="50" r="43" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${(100-fraction*100).toFixed(3)}"/></svg><span class="metric-gauge-reading" aria-hidden="true"><b>${number}</b><small>${escape(suffix)}</small></span></span>`;
  }
  function update(host,options){
    if(!host.firstElementChild){host.innerHTML=markup(options);return;}
    const meter=host.querySelector('.metric-gauge');if(!meter){host.innerHTML=markup(options);return;}
    const {value,max=100,label='',unit,maxLabel,reverse=false,compact=false,digits=0}=options,valid=Number.isFinite(value)&&Number.isFinite(max)&&max>0&&value>=0&&value<=max,fraction=valid?value/max:0,number=valid?new Intl.NumberFormat('en',{maximumFractionDigits:digits}).format(value):'-';
    meter.classList.toggle('metric-gauge-compact',compact);meter.classList.toggle('metric-gauge-empty',!valid);meter.classList.toggle('metric-gauge-zero',fraction===0);meter.style.setProperty('--gauge-color','hsl('+((reverse?1-fraction:fraction)*145).toFixed(1)+' 62% 62%)');meter.setAttribute('role',valid?'meter':'img');meter.setAttribute('aria-label',label+': '+(valid?number+(unit?' '+unit:' from '+max):'No data'));
    for(const [key,data]of Object.entries({'aria-valuemin':0,'aria-valuemax':max,'aria-valuenow':value}))if(valid)meter.setAttribute(key,String(data));else meter.removeAttribute(key);
    meter.querySelector('.metric-gauge-fill').setAttribute('stroke-dashoffset',(100-fraction*100).toFixed(3));meter.querySelector('b').textContent=number;meter.querySelector('small').textContent=unit||maxLabel||'/ '+max;
  }
  window.missionGauge={markup,update};
})();
