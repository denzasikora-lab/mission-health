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
  window.missionGauge={markup};
})();
