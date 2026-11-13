import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/archive-content.js',import.meta.url),'utf8');
function helper(){const window={};vm.runInNewContext(source,{window,Intl,Date});return window.missionArchiveContent;}
const a={level:-24.3,quiet:.2,clipping:.001,seconds:12};
const observation=(kind='video')=>({kind,duration:12,mediaUrl:'/api/media-analysis/12345678-1234-1234-1234-123456789abc/media',transcript:'I rested today.',analysis:'The recording contains speech and pauses.',status:'analyzed',features:{acoustic:a,model:'embeddinggemma-2:test',tone:[{label:'neutral',similarity:.72}],apparentAge:{status:'estimated',range:{min:30,max:39},comparison:'no_reference'},skin:{status:'compared',newCount:1,changedCount:0,items:[{region:'forehead',diameterPixels:8.4,areaPixels:55.4,areaChangePercent:25,deltaE:7.2}]}}});
const item=(id='real',value=observation())=>({id,createdAt:'2026-11-06T10:00:00Z',content:'Original text is unchanged',observation:value});

test('Media is rendered in English sections, numbers and transcript without JSON or emotion probabilities',()=>{
  const api=helper(),entry=item(),before=JSON.stringify(entry),view=api.presentation(entry);
  assert.equal(JSON.stringify(entry),before);assert.equal(view.media.kind,'video');assert.ok(view.content.includes('Average level: -24.3 dBFS'));assert.ok(view.content.includes('Quiet intervals: 20%'));assert.ok(view.content.includes('Neutral / description similarity 0.72'));assert.ok(!view.content.includes('72%'));assert.ok(view.content.includes('30-39 years'));assert.ok(view.content.includes('8.4 px'));assert.ok(view.content.includes('55.4 px²'));assert.ok(view.content.includes('7.2 ΔE'));assert.ok(!view.content.includes('{'));assert.ok(!view.content.includes('embeddinggemma-2:test'));assert.ok(!view.content.includes('no_reference'));assert.ok(view.content.includes('I rested today.'));
});
test('A technical sample receives no invented age or emotions, arbitrary media server URLs are rejected',()=>{
  const api=helper(),entry={...item('sample',{kind:'audio',duration:10,mediaUrl:'/assets/archive/audio.mp3',features:{acoustic:a},transcript:'Check.',analysis:'Signal measured.',status:'measured'}),archiveSample:true,title:'Audio check'},view=api.presentation(entry);
  assert.equal(view.source,'sample');assert.ok(view.content.includes('Preloaded recording'));assert.ok(view.content.includes('Signal measured.'));assert.ok(!view.content.includes('Apparent age'));assert.ok(!view.content.includes('Voice tone'));assert.equal(api.presentation(item('bad',{...observation(),mediaUrl:'https://outside.test/clip.mp4'})).media,null);
});
test('Legacy result text is parsed without eval, saved JSON and original recording remain unchanged',()=>{
  const api=helper(),tone=JSON.stringify([{label:'tense',similarity:.4}]),age=JSON.stringify({status:'unavailable',reason:'need_frames'}),content='Video observation / 2026-11-06T10:00:00Z / 12 s\nRecognized speech: Tired after work.\nOriginal audio features, computed in the browser: average level -25.0 dBFS; quiet windows below -40 dBFS 10%; clipped samples 0.0%.\nEmbeddingGemma 2: '+tone+'.\nApparent age / experimental similarity: '+age+'.',entry={id:'legacy',content},view=api.presentation(entry);
  assert.equal(entry.content,content);assert.ok(view.content.includes('Tired after work.'));assert.ok(view.content.includes('Tense / description similarity 0.4'));assert.ok(view.content.includes('Insufficient frames'));assert.ok(!view.content.includes('need_frames'));assert.ok(!view.content.includes('['));assert.ok(!view.content.includes('{'));
});
test('Current results use the latest real recordings, exclude samples and never substitute demonstration values',()=>{
  const api=helper(),real=item('real'),sample={...item('sample'),archiveSample:true,createdAt:'2027-01-01T10:00:00Z',observation:{...observation(),transcript:'This is a sample, not the user'}},current=api.currentEntry([real,sample],{wellbeing:{score:80,label:'Good'},visual:[{title:'Face contour',value:'No comparison',status:'Recording required'}]});
  assert.equal(current.archiveCurrent,true);assert.ok(current.content.includes('80/100'));assert.ok(current.content.includes('I rested today.'));assert.ok(!current.content.includes('This is a sample, not the user'));assert.ok(current.content.includes('Face contour: No comparison'));assert.ok(!current.content.includes('Pulse:'));assert.equal(api.latest([sample]).video,undefined);
});
test('Fifteen visual features exclude reference cards and use saved age and skin results only',()=>{
  const api=helper(),cards=api.visualTitles.map(title=>({dataset:{resultSource:'sample'},querySelector(selector){return {textContent:selector==='.appearance-metric-title'?title:selector==='strong'?'999':'Reference sample'};},closest(){return null;}})),view=api.captureVisual({querySelectorAll:()=>cards},[item()]);
  assert.equal(view.length,15);assert.equal(view[0].value,'No comparison');assert.equal(view.find(row=>row.title==='Apparent age').value,'30-39 years');assert.equal(view.find(row=>row.title==='New skin areas').value,'1');assert.equal(view.find(row=>row.title==='Pigmentation changes').value,'0');assert.ok(view.every(row=>row.value!=='999'));assert.equal(view[0].source,'missing');
});
test('Unstable age and skin results explain the reason in words, unknown JSON do not reveal vectors or identifiers',()=>{
  const api=helper(),view=api.presentation(item('missing',{...observation(),features:{apparentAge:{status:'unavailable',reason:'model_unavailable'},skin:{status:'unavailable',reason:'conditions_changed'}}}));
  assert.ok(view.content.includes('Model unavailable'));assert.ok(view.content.includes('Capture conditions changed'));assert.ok(!view.content.includes('model_unavailable'));const text=api.readableText('Data: {"audioVector":[1,2],"owner_id":"secret-owner"}');assert.ok(!text.includes('secret-owner'));assert.ok(!text.includes('audioVector'));
});

test('Section headings move with the transcript start without creating empty sections',()=>{
  const api=helper(),tail=api.splitTrailingHeading('Average level: -25 dBFS\n\nRecognized speech');assert.equal(tail.body,'Average level: -25 dBFS');assert.equal(tail.heading,'Recognized speech');assert.equal(api.splitTrailingHeading('Recognized speech\nMy first sentence.'),null);
  const root={children:[],append(node){this.children.push(node);}},create=(tag,className,text)=>({tag,className,text,children:[],append(...nodes){this.children.push(...nodes);}});api.renderText(root,'Recognized speech',create);assert.equal(root.children.length,0);api.renderText(root,'Recognized speech\nMy first sentence.',create);assert.equal(root.children[0].children[1].text,'My first sentence.');
});
test('Current visual readings do not duplicate identical statuses',()=>{
  const current=helper().currentEntry([],{visual:[{title:'Face contour',value:'No comparison',status:'No comparison'}]});assert.ok(current.content.includes('Face contour: No comparison'));assert.ok(!current.content.includes('No comparison / No comparison'));
});

test('NASA the poster belongs only to preloaded video, personal recordings receive no unrelated image',()=>{
  const api=helper();assert.equal(api.presentation({...item('sample'),archiveSample:true}).media.poster,'/assets/stories/iss075e0003980.jpg');assert.equal(api.presentation(item()).media.poster,undefined);assert.equal(api.presentation({...item('audio',observation('audio')),archiveSample:true}).media.poster,undefined);
});
