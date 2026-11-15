import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const context={crypto:webcrypto};
vm.runInNewContext((await readFile(new URL('../public/appearance-core.js',import.meta.url),'utf8'))+'\n'+(await readFile(new URL('../public/skin-spots-core.js',import.meta.url),'utf8')),context);
const core=context.MissionSkinSpotsCore,lab=context.MissionAppearanceCore.lab,clone=v=>JSON.parse(JSON.stringify(v));
function patch(spots=[],scale=1){
  const pixels=new Uint8ClampedArray(core.width*core.height*4);
  for(let y=0;y<core.height;y++)for(let x=0;x<core.width;x++){
    const color=spots.find(s=>(x-(s.x||64))**2+(y-(s.y||48))**2<=s.radius**2)?.color||[180,140,110];pixels.set([...color,255],(y*core.width+x)*4);
  }
  return core.describe({region:'forehead',pixels,sourceWidth:core.width*scale,sourceHeight:core.height*scale},lab);
}
const mole=(radius=7,color=[65,45,30],x=64)=>({radius,color,x});
function sample(spots=[],scale=1){return{valid:true,patches:core.regions.map(region=>({...patch(region==='forehead'?spots:[],scale),region})),distance:.3*scale,light:{l:60,a:10,b:20,side:0},pose:{yaw:0,pitch:0,roll:0}};}
const repeated=(s,n)=>Array.from({length:n},()=>s);
const reference=spots=>core.reference(repeated(sample(spots),5));
test('An empty comparable area yields zero candidates only after a real baseline',()=>{const ref=reference([]),report=core.compare(repeated(sample(),3),ref);assert.ok(core.referenceValid(ref));assert.equal(report.status,'compared');assert.equal(report.newCount,0);assert.equal(report.changedCount,0);assert.equal(core.compare(repeated(sample(),3),null).reason,'no_reference');assert.equal(core.reference(repeated(sample(),4)),null);});
test('A new dark, light or colored area must recur in three frames',()=>{
  for(const color of [[65,45,30],[240,225,210],[230,120,110]]){const current=sample([mole(7,color)]),report=core.compare(repeated(current,3),reference([]));assert.equal(report.status,'compared');assert.equal(report.newCount,1);assert.equal(report.items[0].change,'new');assert.ok(report.items[0].areaPixels>40);assert.ok(report.items[0].diameterPixels>=4);assert.equal(report.items[0].baseline,null);assert.ok(core.validate(report));}
});
test('One random frame or disappearing sample does not become a new spot',()=>{const report=core.compare([sample(),sample(),sample([mole()])],reference([]));assert.equal(report.newCount,0);assert.equal(report.items.length,0);});
test('Area growth and color changes are measured separately from embeddings',()=>{const ref=reference([mole(6)]),larger=core.compare(repeated(sample([mole(9)]),3),ref),color=core.compare(repeated(sample([mole(6,[100,65,40])]),3),ref);assert.equal(larger.items[0].change,'changed');assert.ok(larger.items[0].areaChangePercent>20);assert.ok(color.items[0].deltaE>6);assert.equal(color.items[0].newCount,undefined);assert.ok(core.validate(larger));assert.ok(core.validate(color));});
test('A shift of several pixels matches the existing region',()=>{const report=core.compare(repeated(sample([mole(7,undefined,66)]),3),reference([mole()]));assert.equal(report.newCount,0);assert.equal(report.items[0].change,'matched');});
test('Changing frame scale does not create false area growth',()=>{const report=core.compare(repeated(sample([mole()],1.08),3),reference([mole()]));assert.equal(report.items[0].change,'matched');assert.ok(Math.abs(report.items[0].areaChangePercent)<.01);assert.ok(report.items[0].diameterPixels>report.items[0].baseline.diameterPixels);});
test('New lighting, angle and distance prevent matching',()=>{for(const edit of [s=>s.light.l+=9,s=>s.light.a+=5,s=>s.pose.yaw=7,s=>s.distance=.5]){const s=sample([mole()]);edit(s);assert.equal(core.compare(repeated(s,3),reference([mole()])).reason,'conditions_changed');}});
test('An indistinguishable old region does not become a no-change result',()=>{assert.equal(core.compare(repeated(sample(),3),reference([mole()])).reason,'not_enough_detail');});
test('Signals below resolution and long thin stripes are not accepted as regions',()=>{assert.equal(patch([mole(1)]).spots.length,0);const p=patch();for(let y=45;y<48;y++)for(let x=30;x<98;x++)p.pixels.set([30,20,10,255],(y*core.width+x)*4);assert.equal(core.describe(p,lab).spots.length,0);assert.equal(core.describe({...p,sourceWidth:40},lab),null);});
test('Corrupt values and invented size, color or vectors are rejected by the server contract',()=>{
  const report=core.compare(repeated(sample([mole(9)]),3),reference([mole(6)]));
  for(const edit of [r=>r.items[0].areaChangePercent=999,r=>r.items[0].deltaE=999,r=>r.items[0].color.r=999,r=>r.items[0].diameterPixels=0,r=>r.items[0].vector=[1,0],r=>r.items[0].vector=Array(768).fill(1),r=>r.trackingKey='bad',r=>r.status='diagnosed']){const copy=clone(report);edit(copy);assert.equal(core.validate(copy),null);}
});
test('Sanitization preserves actual normalized vectors, removes unknown fields and stores no photographs',()=>{const report=clone(core.compare(repeated(sample([mole()]),3),reference([])));report.items[0].vector=Array.from({length:768},(_,i)=>i===0?1:0);report.owner='other';report.items[0].diagnosis='fake';report.items[0].pixels=[1,2,3];const clean=core.validate(report);assert.ok(clean);assert.equal(clean.items[0].vector.length,768);assert.equal(clean.owner,undefined);assert.equal(clean.items[0].diagnosis,undefined);assert.equal(clean.items[0].pixels,undefined);assert.equal(JSON.stringify(reference([mole()])).includes('pixels'),false);});
test('Unstable sequences do not create baselines',()=>{const values=[sample(),sample(),sample(),sample(),sample()];values[4].patches[0].background.l+=15;assert.equal(core.reference(values),null);assert.notEqual(reference([]).trackingKey,reference([]).trackingKey);});

test('Original frames are aligned using face landmarks, then a new forehead region is extracted',()=>{
  const width=960,height=720,data=new Uint8ClampedArray(width*height*4),points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([180,140,110,255],(y*width+x)*4);
  for(const [id,x,y]of [[10,480,100],[9,480,200],[33,300,260],[133,415,260],[362,545,260],[263,660,260]])points[id]={x:x/width,y:y/height,z:0};
  const measurement={valid:true,light:{l:60,a:10,b:20,side:0},pose:{yaw:0,pitch:0,roll:0},distance:360/width},image={width,height,data},before=core.extract(image,points,measurement,lab);
  assert.equal(before.valid,true);assert.equal(before.patches.length,3);const ref=core.reference(repeated(before,5));
  for(let y=145;y<=165;y++)for(let x=470;x<=490;x++)if((x-480)**2+(y-155)**2<49)data.set([65,45,30,255],(y*width+x)*4);
  const next=core.extract(image,points,measurement,lab),report=core.compare(repeated(next,3),ref);assert.equal(report.newCount,1);assert.equal(report.items[0].region,'forehead');assert.ok(report.items[0].diameterPixels>8);
  points[263].x=points[33].x+.1;assert.equal(core.extract(image,points,measurement,lab).reason,'need_closeup');
});

const uiSource=await readFile(new URL('../public/skin-spots.js',import.meta.url),'utf8');
const sampleScope={window:{},fetch:async()=>({ok:true,json:async()=>({items:[]})})};vm.runInNewContext(await readFile(new URL('../public/analysis-samples.js',import.meta.url),'utf8'),sampleScope);const controlSamples=sampleScope.window.missionAnalysisSamples;
function uiFixture(block=false,samples=null){
  class Node{constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events={};this.style={};this.textContent='';}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(k,v){this.attributes[k]=String(v);}querySelector(s){return node(s);}addEventListener(k,fn){this.events[k]=fn;}}
  const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,new Node('div'));return nodes.get(s);},storage=new Map();let now=0;const sandbox={window:{missionAnalysisSamples:samples},MissionSkinSpotsCore:core,document:{createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text}),querySelector:node},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(block)throw new Error('full');storage.set(k,v);}},Date,Intl,Set,Blob,Uint8Array,performance:{now:()=>now}};
  vm.runInNewContext(uiSource,sandbox);return{api:sandbox.window.missionSkinSpots,storage,node,observe(v){now+=1000;sandbox.window.missionSkinSpots.observe(v,now);},context:scope=>({scope,since:0}),advance(){now+=5000;}};
}
test('Synthetic preflight counters cannot become a personal skin baseline',()=>{
  const f=uiFixture(false,controlSamples),cards=f.node('#appearance-metrics').children;assert.equal(cards.length,2);assert.ok(cards.every(card=>card.attributes['data-result-source']==='preflight'));assert.equal(f.node('#skin-spots-new').textContent,1);assert.equal(f.node('#skin-spots-changed').textContent,0);assert.equal(f.node('#skin-spots-new-delta').textContent,'Δ +1');assert.equal(f.node('#skin-spots-new-badge').textContent,'Test');assert.equal(cards[0].attributes['data-level'],'amber');assert.equal(f.node('#skin-spots-changed-delta').textContent,'Δ 0');f.api.preflight(false);assert.equal(f.node('#skin-spots-new-badge').textContent,'Test');assert.equal(f.node('#skin-spots-reset').disabled,true);assert.equal(f.api.snapshot(f.context('owner/camera')).report.status,'unavailable');assert.equal(f.storage.size,0);
  f.api.setScope('owner/camera');assert.ok(cards.every(card=>card.attributes['data-result-source']==='missing'));assert.equal(f.node('#skin-spots-new').textContent,'-');for(let i=0;i<5;i++)f.observe(sample());assert.ok(cards.every(card=>card.attributes['data-result-source']==='current'));assert.equal(f.node('#skin-spots-new').textContent,0);assert.equal(f.api.snapshot(f.context('owner/camera')).report.status,'compared');
});
test('The controller preserves baselines by profile and camera, discards old frames and foreign contexts',()=>{
  const f=uiFixture();f.api.setScope('owner-a/camera-a');for(let i=0;i<5;i++)f.observe(sample());assert.equal(f.storage.size,1);for(let i=0;i<3;i++)f.observe(sample([mole()]));const snap=f.api.snapshot(f.context('owner-a/camera-a'));assert.equal(snap.report.newCount,1);assert.equal(f.api.snapshot(f.context('owner-b/camera-a')).report.status,'unavailable');
  f.api.pause();f.api.encoded(snap.report);assert.equal(f.node('#skin-spots-new').textContent,1);f.api.setScope('owner-b/camera-a');f.api.encoded(snap.report);assert.equal(f.node('#skin-spots-new').textContent,'-');
  f.api.setScope('owner-a/camera-a');for(let i=0;i<3;i++)f.observe(sample([mole()]));assert.equal(f.api.snapshot(f.context('owner-a/camera-a')).report.newCount,1);f.advance();assert.equal(f.api.snapshot(f.context('owner-a/camera-a')).report.status,'unavailable');
});
test('Storage failure shows a session baseline without promising persistence',()=>{const f=uiFixture(true);f.api.setScope('owner/camera');for(let i=0;i<5;i++)f.observe(sample());assert.equal(f.storage.size,0);assert.match(f.node('#skin-spots-reference').textContent,/this session only/);});

test('A measured new area shows the count, delta and review badge without the test label',()=>{
  const f=uiFixture(false,controlSamples),cards=f.node('#appearance-metrics').children;f.api.setScope('owner/camera');
  assert.equal(f.node('#skin-spots-new-badge').hidden,true);assert.equal(f.node('#skin-spots-new-delta').hidden,true);
  for(let i=0;i<5;i++)f.observe(sample());
  assert.equal(f.node('#skin-spots-new').textContent,0);assert.equal(f.node('#skin-spots-new-delta').textContent,'Δ 0');assert.equal(f.node('#skin-spots-new-badge').hidden,true);
  for(let i=0;i<3;i++)f.observe(sample([mole()]));
  assert.equal(f.node('#skin-spots-new').textContent,1);assert.equal(f.node('#skin-spots-new-delta').textContent,'Δ +1');assert.equal(f.node('#skin-spots-new-badge').textContent,'Review');assert.equal(f.node('#skin-spots-new-badge').hidden,false);assert.equal(cards[0].attributes['data-level'],'amber');
  assert.equal(f.node('#skin-spots-changed').textContent,0);assert.equal(cards[1].attributes['data-level'],'green');assert.equal(f.api.snapshot(f.context('owner/camera')).report.newCount,1);
});
