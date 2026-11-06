import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/archive-content.js',import.meta.url),'utf8');
function helper(){const window={};vm.runInNewContext(source,{window,Intl,Date});return window.missionArchiveContent;}
const a={level:-24.3,quiet:.2,clipping:.001,seconds:12};
const observation=(kind='video')=>({kind,duration:12,mediaUrl:'/api/media-analysis/12345678-1234-1234-1234-123456789abc/media',transcript:'Сегодня отдохнул.',analysis:'В записи есть речь и паузы.',status:'analyzed',features:{acoustic:a,model:'embeddinggemma-2:test',tone:[{label:'neutral',similarity:.72}],apparentAge:{status:'estimated',range:{min:30,max:39},comparison:'no_reference'},skin:{status:'compared',newCount:1,changedCount:0,items:[{region:'forehead',diameterPixels:8.4,areaPixels:55.4,areaChangePercent:25,deltaE:7.2}]}}});
const item=(id='real',value=observation())=>({id,createdAt:'2026-11-06T10:00:00Z',content:'Исходный текст не изменяется',observation:value});

test('Медиа отображается русскими разделами, числами и транскриптом без JSON и вероятности эмоций',()=>{
  const api=helper(),entry=item(),before=JSON.stringify(entry),view=api.presentation(entry);
  assert.equal(JSON.stringify(entry),before);assert.equal(view.media.kind,'video');assert.ok(view.content.includes('Средний уровень: -24,3 dBFS'));assert.ok(view.content.includes('Тихие участки: 20%'));assert.ok(view.content.includes('Нейтральная / сходство с описанием 0,72'));assert.ok(!view.content.includes('72%'));assert.ok(view.content.includes('30-39 лет'));assert.ok(view.content.includes('8,4 px'));assert.ok(view.content.includes('55,4 px²'));assert.ok(view.content.includes('7,2 ΔE'));assert.ok(!view.content.includes('{'));assert.ok(!view.content.includes('embeddinggemma-2:test'));assert.ok(!view.content.includes('no_reference'));assert.ok(view.content.includes('Сегодня отдохнул.'));
});
test('Технический образец не получает выдуманный возраст или эмоции, ссылка на произвольный медиасервер отклоняется',()=>{
  const api=helper(),entry={...item('sample',{kind:'audio',duration:10,mediaUrl:'/assets/archive/audio.mp3',features:{acoustic:a},transcript:'Проверка.',analysis:'Сигнал измерен.',status:'measured'}),archiveSample:true,title:'Проверка звука'},view=api.presentation(entry);
  assert.equal(view.source,'sample');assert.ok(view.content.includes('Предзагруженная запись'));assert.ok(view.content.includes('Сигнал измерен.'));assert.ok(!view.content.includes('Видимый возраст'));assert.ok(!view.content.includes('Окраска голоса'));assert.equal(api.presentation(item('bad',{...observation(),mediaUrl:'https://outside.test/clip.mp4'})).media,null);
});
test('Старый текст с результатами разбирается без eval, сохраненные JSON и исходная запись остаются прежними',()=>{
  const api=helper(),tone=JSON.stringify([{label:'tense',similarity:.4}]),age=JSON.stringify({status:'unavailable',reason:'need_frames'}),content='Видеонаблюдение / 2026-11-06T10:00:00Z / 12 с\nРаспознанная речь: Устал после работы.\nПризнаки исходного звука, вычисленные в браузере: средний уровень -25.0 dBFS; тихие окна ниже -40 dBFS 10%; отсчеты с перегрузкой 0.0%.\nEmbeddingGemma 2: '+tone+'.\nВидимый возраст / экспериментальное сходство: '+age+'.',entry={id:'legacy',content},view=api.presentation(entry);
  assert.equal(entry.content,content);assert.ok(view.content.includes('Устал после работы.'));assert.ok(view.content.includes('Напряженная / сходство с описанием 0,4'));assert.ok(view.content.includes('Недостаточно кадров'));assert.ok(!view.content.includes('need_frames'));assert.ok(!view.content.includes('['));assert.ok(!view.content.includes('{'));
});
test('Текущие результаты берут последние реальные записи, исключают образцы и не подставляют демонстрационные числа',()=>{
  const api=helper(),real=item('real'),sample={...item('sample'),archiveSample:true,createdAt:'2027-01-01T10:00:00Z',observation:{...observation(),transcript:'Это пример, не пользователь'}},current=api.currentEntry([real,sample],{wellbeing:{score:80,label:'Хорошо'},visual:[{title:'Контур лица',value:'Нет сравнения',status:'Нужна запись'}]});
  assert.equal(current.archiveCurrent,true);assert.ok(current.content.includes('80/100'));assert.ok(current.content.includes('Сегодня отдохнул.'));assert.ok(!current.content.includes('Это пример, не пользователь'));assert.ok(current.content.includes('Контур лица: Нет сравнения'));assert.ok(!current.content.includes('Пульс:'));assert.equal(api.latest([sample]).video,undefined);
});
test('Пятнадцать визуальных признаков исключают контрольные карточки и используют только сохраненные возраст и кожу',()=>{
  const api=helper(),cards=api.visualTitles.map(title=>({dataset:{resultSource:'sample'},querySelector(selector){return {textContent:selector==='.appearance-metric-title'?title:selector==='strong'?'999':'Контрольный пример'};},closest(){return null;}})),view=api.captureVisual({querySelectorAll:()=>cards},[item()]);
  assert.equal(view.length,15);assert.equal(view[0].value,'Нет сравнения');assert.equal(view.find(row=>row.title==='Видимый возраст').value,'30-39 лет');assert.equal(view.find(row=>row.title==='Новые участки кожи').value,'1');assert.equal(view.find(row=>row.title==='Изменения пигментации').value,'0');assert.ok(view.every(row=>row.value!=='999'));assert.equal(view[0].source,'missing');
});
test('Неустойчивые возраст и кожа показывают причину словами, неизвестные JSON не раскрывают векторы и идентификаторы',()=>{
  const api=helper(),view=api.presentation(item('missing',{...observation(),features:{apparentAge:{status:'unavailable',reason:'model_unavailable'},skin:{status:'unavailable',reason:'conditions_changed'}}}));
  assert.ok(view.content.includes('Модель недоступна'));assert.ok(view.content.includes('Условия съемки изменились'));assert.ok(!view.content.includes('model_unavailable'));const text=api.readableText('Данные: {"audioVector":[1,2],"owner_id":"secret-owner"}');assert.ok(!text.includes('secret-owner'));assert.ok(!text.includes('audioVector'));
});

test('Заголовок раздела переносится с начала расшифровки и не создает пустую секцию',()=>{
  const api=helper(),tail=api.splitTrailingHeading('Средний уровень: -25 dBFS\n\nРаспознанная речь');assert.equal(tail.body,'Средний уровень: -25 dBFS');assert.equal(tail.heading,'Распознанная речь');assert.equal(api.splitTrailingHeading('Распознанная речь\nМоя первая фраза.'),null);
  const root={children:[],append(node){this.children.push(node);}},create=(tag,className,text)=>({tag,className,text,children:[],append(...nodes){this.children.push(...nodes);}});api.renderText(root,'Распознанная речь',create);assert.equal(root.children.length,0);api.renderText(root,'Распознанная речь\nМоя первая фраза.',create);assert.equal(root.children[0].children[1].text,'Моя первая фраза.');
});
test('Текущий визуальный показатель не дублирует одинаковый статус',()=>{
  const current=helper().currentEntry([],{visual:[{title:'Контур лица',value:'Нет сравнения',status:'Нет сравнения'}]});assert.ok(current.content.includes('Контур лица: Нет сравнения'));assert.ok(!current.content.includes('Нет сравнения / Нет сравнения'));
});

test('NASA постер относится только к предзагруженному видео, личная запись не получает чужой снимок',()=>{
  const api=helper();assert.equal(api.presentation({...item('sample'),archiveSample:true}).media.poster,'/assets/stories/iss075e0003980.jpg');assert.equal(api.presentation(item()).media.poster,undefined);assert.equal(api.presentation({...item('audio',observation('audio')),archiveSample:true}).media.poster,undefined);
});
