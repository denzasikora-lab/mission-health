const metricIcons={hr:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',spo2:'M12 3v9m0-3-3-3c-3 1-6 5-6 11 0 3 5 3 7 1V9m2 0 3-3c3 1 6 5 6 11 0 3-5 3-7 1V9',temp:'M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Zm3-7v10',fatigue:'M8 9h.01M16 9h.01M8 15q4 4 8 0 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'};
const metricInfo={hr:{unit:"bpm"},spo2:{unit:"%"},temp:{unit:"°C"},fatigue:{unit:"/ 10"}};
const languageInfo={ru:{flag:"🇷🇺",name:"Русский"},en:{flag:"🇬🇧",name:"English"},ur:{flag:"🇵🇰",name:"اردو"}};
const sourceUrls=["https://www.nasa.gov/hrp/risks/","https://www.nasa.gov/hrp/risks/","https://www.nasa.gov/hrp/"];
const sourceKeywords=[
  ["health","risk","oxygen","hypoxia","fatigue","temperature","monitoring","baseline","健康","风险","血氧","氧气","疲劳","体温","الصحة","صحة","خطر","مخاطر","أكسجين","الأكسجين","تعب","حرارة","salud","riesgo","oxígeno","fatiga","temperatura"],
  ["heart","cardiovascular","pulse","circulation","心率","心血管","心脏","循环","القلب","قلب","نبض","الدورة","corazón","cardiovascular","pulso","circulación"],
  ["research","astronaut","medicine","performance","sleep","研究","航天员","医学","表现","睡眠","بحث","أبحاث","رائد","طب","نوم","investigación","astronauta","medicina","rendimiento","sueño"]
];
const personalProfileId='personal';
const state={visiting:false,crew:0,metric:"hr",period:"24h",view:"health",workspace:"research",language:"ru",theme:document.documentElement.dataset.theme,query:""};
try{const language=localStorage.getItem("mission-health-language");if(languageInfo[language])state.language=language}catch{}
const $=id=>document.getElementById(id);
const text=()=>translations[state.language];
const format=(value,key)=>new Intl.NumberFormat(text().locale,{maximumFractionDigits:key==="temp"?1:0,minimumFractionDigits:key==="temp"?1:0}).format(value);
const unit=key=>key==="hr"?text().units.hr:metricInfo[key].unit;
function savePreference(key,value){try{localStorage.setItem(key,value)}catch{}}
function renderStatic(){
  const t=text();document.documentElement.lang=state.language;document.documentElement.dir=["ar","ur"].includes(state.language)?"rtl":"ltr";document.documentElement.dataset.theme=state.theme;
  document.querySelectorAll("[data-i18n]").forEach(node=>node.textContent=t[node.dataset.i18n]);
  document.querySelectorAll("[data-i18n-aria]").forEach(node=>node.setAttribute("aria-label",t[node.dataset.i18nAria]));
  document.querySelectorAll("[data-theme-choice]").forEach(button=>{const label=button.dataset.themeChoice==="light"?t.lightTheme:t.darkTheme;button.setAttribute("aria-pressed",String(button.dataset.themeChoice===state.theme));button.setAttribute("aria-label",label);button.title=label});
  document.querySelectorAll("[data-language]").forEach(button=>button.setAttribute("aria-checked",String(button.dataset.language===state.language)));
  $("current-flag").textContent=languageInfo[state.language].flag;$("language-button").setAttribute("aria-label",`${t.language}: ${languageInfo[state.language].name}`);$("language-button").title=t.language;
  $("lookup-input").placeholder=t.placeholder;document.title=`Mission Health | ${t.headline}`;document.querySelector('meta[name="description"]').content=t.metaDescription;document.querySelector('meta[name="theme-color"]').content=state.theme==="dark"?"#030d0a":"#eaf5f0";
}
function renderCrew(){
  const t=text();$("crew-list").innerHTML=crew.map((person,index)=>`<button class="crew-button" type="button" data-crew="${index}" aria-pressed="${state.visiting&&index===state.crew}"><img class="avatar-photo" src="${person.photo}" alt="" title="${person.credit}"><span><span class="crew-name">${t.people[index].name}</span><span class="crew-role">${t.people[index].role}</span></span><span class="crew-state ${person.status}" aria-hidden="true"></span></button>`).join("");
}
function renderMetrics(person){
  const t=text();const labels=state.language==='ru'?{hr:'Пульс',spo2:'SpO₂',temp:'Температура',fatigue:'Усталость'}:t.metrics;
  const spark=key=>{const values=person.history[key],low=Math.min(...values),range=Math.max(1,Math.max(...values)-low);return key==='hr'?`<svg viewBox="0 0 160 20" preserveAspectRatio="none" aria-hidden="true"><path d="${values.map((value,index)=>`${index?'L':'M'}${index*160/(values.length-1)} ${17-(value-low)*14/range}`).join(' ')}"/></svg>`:`<span class="metric-spark-bars" aria-hidden="true">${values.slice(-7).map(value=>`<i style="height:${7+(value-low)*11/range}px"></i>`).join('')}</span>`};
  $("metrics").innerHTML=Object.keys(metricInfo).map(key=>{const current=person.metrics[key],base=person.baseline[key],delta=Math.abs(current-base),flag=key==="hr"?delta>=12:key==="spo2"?delta>=3:key==="temp"?delta>=.8:delta>=3;return `<button class="metric-card glass" type="button" data-metric="${key}" aria-pressed="${state.metric===key}"><span class="metric-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${metricIcons[key]}"/></svg>${labels[key]}</span><span class="metric-value"><bdi>${format(current,key)}</bdi><span class="metric-unit">${unit(key)}</span></span><span class="metric-spark">${spark(key)}</span><span class="metric-trend ${flag?"flag":""}">${flag?t.changed:t.near} · <bdi>${format(base,key)} ${unit(key)}</bdi></span></button>`}).join("");
}
function seriesFor(person,key,period){
  if(period==='24h')return person.history[key];
  const count={'1m':30,'1h':24,'7d':28,'1mo':30,'1y':52}[period],base=person.baseline[key],current=person.metrics[key],scale=key==='temp'?.12:key==='spo2'?.45:key==='fatigue'?.7:2.5;
  return Array.from({length:count},(_,index)=>{const fraction=index/(count-1),trend=period==='1m'?current+(base-current)*.04*(1-fraction):period==='1h'?base+(current-base)*(.82+.18*fraction):base+(current-base)*Math.pow(fraction,period==='1y'?2.3:1.4),noise=index===count-1?0:Math.sin(index*1.75+state.crew)*scale*(period==='1m'?.3:1);let value=trend+noise;if(key==='spo2')value=Math.min(100,Math.max(0,value));if(key==='fatigue')value=Math.min(10,Math.max(0,value));return key==='temp'?Number(value.toFixed(1)):Math.round(value)});
}
function renderChart(person){
  const t=text(),key=state.metric,values=seriesFor(person,key,state.period),low=Math.min(...values,person.baseline[key]),high=Math.max(...values,person.baseline[key]),range=Math.max(high-low,key==="temp"?.6:2),min=low-range*.18,max=high+range*.18,style=getComputedStyle(document.documentElement),color=style.getPropertyValue("--accent").trim(),grid=style.getPropertyValue("--grid").trim(),baseline=style.getPropertyValue("--baseline").trim(),bg=style.getPropertyValue("--bg").trim();
  const x=index=>24+index*(592/(values.length-1)),y=value=>178-(value-min)/(max-min)*148,line=values.map((value,index)=>`${index?"L":"M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" "),area=`${line} L616 178 L24 178 Z`,baselineY=y(person.baseline[key]).toFixed(1);
  $("trend-chart").innerHTML=`<defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="M24 30 H616 M24 104 H616 M24 178 H616" fill="none" stroke="${grid}" stroke-width="1"/><path d="M24 ${baselineY} H616" fill="none" stroke="${baseline}" stroke-width="1.4" stroke-dasharray="5 6"/><path d="${area}" fill="url(#area-fill)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(values.length-1).toFixed(1)}" cy="${y(values.at(-1)).toFixed(1)}" r="5" fill="${color}" stroke="${bg}" stroke-width="3"/>`;
  $("trend-chart").setAttribute("aria-label",`${t.trend}: ${t.people[state.crew].name}, ${t.metrics[key]}, ${t.periods[state.period]}: ${values.map(value=>format(value,key)).join(", ")} ${unit(key)}`);
  $("chart-subtitle").textContent=`${t.metrics[key]} · ${t.people[state.crew].name}`;$("chart-axis").innerHTML=t.axes[state.period].map(label=>`<span>${label}</span>`).join("");
  $("baseline-caption").innerHTML=`<strong>${key==="hr"?t.restingBaseline:key==="fatigue"?t.reportedBaseline:t.baseline}:</strong> <bdi>${format(person.baseline[key],key)} ${unit(key)}</bdi>`;
  document.querySelectorAll("[data-period]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.period===state.period)));
}
function renderAssessment(person){
  const t=text(),p=t.people[state.crew],activityTimes=["07:10 UTC","06:35 UTC","07:50 UTC"],sleepMinutes=[378,425,405],sleep=sleepMinutes[state.crew];
  $("profile-photo").src=person.photo;$("profile-photo").alt=p.name;$("profile-photo").title=person.credit;$("profile-bio").href=person.bio;$("profile-name").textContent=p.name;$("profile-meta").innerHTML=`${p.role} · ${t.deepSpace} · ${t.sampleAt} <bdi dir="ltr">${person.events[0][1]}</bdi>`;
  $("profile-state").className=`profile-state ${person.status}`;$("profile-state").textContent=t.status[person.status];$("assessment-heading").textContent=p.assessment;$("assessment-desc").textContent=p.description;$("signal-list").className=`signal-list ${person.status==="normal"?"stable":""}`;$("signal-list").innerHTML=p.signals.map(signal=>`<li>${signal}</li>`).join("");$("next-step").textContent=p.next;
  const context=[`${t.activities[state.crew]} · <bdi dir="ltr">${activityTimes[state.crew]}</bdi>`,`${format(Math.floor(sleep/60),"hr")} ${t.hoursShort} ${format(sleep%60,"hr")} ${t.minutesShort}`,format(142,"hr"),t.good];
  $("context-list").innerHTML=t.contextLabels.map((label,index)=>`<li><span>${label}</span><span>${context[index]}</span></li>`).join("");
  const events=[t.events[state.crew],t.activityLogged,t.previousSample];$("event-list").innerHTML=events.map((label,index)=>`<li><span class="event-marker" aria-hidden="true"></span><p>${label}<time>${index===2?t.yesterday:`<bdi dir="ltr">${person.events[index][1]}</bdi>`}</time></p></li>`).join("");
}
function renderSources(){
  const t=text(),indices=state.metric==="hr"?[1,0]:[0,2];$("source-list").innerHTML=indices.map(index=>`<a class="source-card" href="${sourceUrls[index]}" target="_blank" rel="noopener noreferrer"><span class="source-tag">NASA / HRP</span><span class="source-title">${t.sourceTitles[index]}</span><span class="source-desc">${t.sourceDescriptions[index]}</span></a>`).join("");
}
function normalizeQuery(value){return value.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim()}
function renderLookup(){
  const t=text(),result=$("lookup-result"),query=normalizeQuery(state.query);if(!query){result.classList.remove("visible");return}
  const tokens=query.split(/[\s\p{P}]+/u).filter(token=>token.length>=2),ranked=sourceKeywords.map((keywords,index)=>{const haystack=normalizeQuery(`${keywords.join(" ")} ${t.sourceTitles[index]} ${t.sourceDescriptions[index]}`),score=tokens.reduce((count,token)=>count+Number(haystack.includes(token)),0)+keywords.reduce((count,keyword)=>count+Number(query.includes(normalizeQuery(keyword))),0);return {index,score}}).sort((a,b)=>b.score-a.score),match=ranked[0],title=document.createElement("strong"),description=document.createElement("p");result.replaceChildren();
  if(match.score){title.textContent=t.sourceTitles[match.index];description.textContent=t.sourceDescriptions[match.index];const link=document.createElement("a");link.href=sourceUrls[match.index];link.target="_blank";link.rel="noopener noreferrer";link.textContent=t.openSource;result.append(title,description,link)}else{title.textContent=t.noMatch;description.textContent=t.searchHint;result.append(title,description)}result.classList.add("visible");
}
function render(){renderStatic();const person=crew[state.crew];renderCrew();renderMetrics(person);renderChart(person);renderAssessment(person);renderSources();renderLookup();window.journal?.onProfileChange();window.research?.render()}
function closeLanguageMenu(returnFocus=false){$("language-menu").hidden=true;$("language-button").setAttribute("aria-expanded","false");if(returnFocus)$("language-button").focus()}
function openLanguageMenu(focusItem=false){$("language-menu").hidden=false;$("language-button").setAttribute("aria-expanded","true");if(focusItem)document.querySelector(`[data-language="${state.language}"]`).focus()}
$("crew-list").addEventListener("click",event=>{const button=event.target.closest("[data-crew]");if(button){state.crew=Number(button.dataset.crew);state.visiting=true;state.workspace='crew';state.view='health';render();void window.missionActivity?.record('friend_visit',{profile:crew[state.crew].id})}});
$("metrics").addEventListener("click",event=>{const button=event.target.closest("[data-metric]");if(button){state.metric=button.dataset.metric;render()}});
document.querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",()=>{state.period=button.dataset.period;renderChart(crew[state.crew])}));
document.querySelectorAll("[data-theme-choice]").forEach(button=>button.addEventListener("click",()=>{state.theme=button.dataset.themeChoice;savePreference("mission-health-theme",state.theme);render()}));
$("language-button").addEventListener("click",()=>$("language-menu").hidden?openLanguageMenu():closeLanguageMenu());
$("language-button").addEventListener("keydown",event=>{if(["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();openLanguageMenu(true)}});
$("language-menu").addEventListener("click",event=>{const button=event.target.closest("[data-language]");if(button){state.language=button.dataset.language;savePreference("mission-health-language",state.language);render();closeLanguageMenu(true)}});
$("language-menu").addEventListener("keydown",event=>{const buttons=[...document.querySelectorAll("[data-language]")],index=buttons.indexOf(document.activeElement);if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();buttons[(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length].focus()}else if(event.key==="Home"||event.key==="End"){event.preventDefault();buttons[event.key==="Home"?0:buttons.length-1].focus()}});
document.addEventListener("pointerdown",event=>{if(!event.target.closest(".language-control"))closeLanguageMenu()});document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("language-menu").hidden){event.preventDefault();closeLanguageMenu(true)}});
$("lookup-form").addEventListener("submit",event=>{event.preventDefault();state.query=$("lookup-input").value;renderLookup()});
render();
if(document.modelContext?.registerTool){
  const toolController=new AbortController();
  try{void Promise.resolve(document.modelContext.registerTool({name:"select_crew_health_view",title:"Показать показатели члена экипажа",description:"Открывает показатели выбранного члена экипажа и нужный график в текущем прототипе.",inputSchema:{type:"object",properties:{crewName:{type:"string",enum:crew.map(person=>person.name)},metric:{type:"string",enum:Object.keys(metricInfo)},period:{type:"string",enum:["1m","1h","24h","7d","1mo","1y"]}},required:["crewName"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){const index=crew.findIndex(person=>person.name===input?.crewName);if(index<0||input?.metric!==undefined&&!metricInfo[input.metric]||input?.period!==undefined&&!["1m","1h","24h","7d","1mo","1y"].includes(input.period))throw new Error("Недопустимый выбор экипажа или графика.");state.workspace='crew';state.view='health';state.visiting=true;state.crew=index;if(input.metric)state.metric=input.metric;if(input.period)state.period=input.period;render();return {crewName:crew[index].name,metric:state.metric,period:state.period,status:crew[index].statusText,reading:crew[index].metrics[state.metric],language:state.language,theme:state.theme}}},{signal:toolController.signal})).catch(()=>{});}catch{}
}
