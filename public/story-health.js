(() => {
  function snapshot(){
    const person=crew[state.crew];
    // Значения принадлежат демонстрационному профилю, а не автору публикации.
    return {version:1,source:'demo_dashboard',profileId:person.id,profileName:person.name,capturedAt:new Date().toISOString(),metrics:{...person.metrics}};
  }
  function render(node,health,{legacy=false}={}){
    node.replaceChildren();node.hidden=!health&&!legacy;
    if(!health){if(legacy){const text=document.createElement('small');text.textContent='Показатели к этой сториз не прикреплены.';node.append(text);}return;}
    const header=document.createElement('header'),title=document.createElement('strong'),badge=document.createElement('small');title.textContent='Показатели здоровья';badge.textContent='Демо';header.append(title,badge);
    const meta=document.createElement('p');meta.className='story-health-meta';meta.textContent='Профиль '+health.profileName+' / '+new Intl.DateTimeFormat('ru',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(health.capturedAt));
    const readings=document.createElement('div');readings.className='story-health-readings';
    for(const [key,label,unit]of [['hr','Пульс','уд/мин'],['spo2','SpO₂','%'],['temp','Температура','°C'],['fatigue','Усталость','/ 10']]){
      const cell=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong'),suffix=document.createElement('small');name.textContent=label;value.textContent=new Intl.NumberFormat('ru',{maximumFractionDigits:1}).format(health.metrics[key]);suffix.textContent=unit;value.append(suffix);cell.append(name,value);readings.append(cell);
    }
    const note=document.createElement('small');note.className='story-health-source';note.textContent='Демонстрация / не медицинские данные астронавта';node.append(header,meta,readings,note);
  }
  window.missionStoryHealth=Object.freeze({snapshot,render});
})();
