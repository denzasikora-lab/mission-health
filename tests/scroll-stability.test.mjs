import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Use an existing Playwright installation and browser; no browser download is required.
const require=createRequire(import.meta.url);
let webkit;
try{({webkit}=require(process.env.MISSION_PLAYWRIGHT_MODULE||'playwright'));}catch{}
const root=fileURLToPath(new URL('../public/',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.woff2':'font/woff2'};

for(const width of [1440,390])test(`WebKit keeps filters, analysis and wellbeing at the current page position (${width}px)`,{skip:!webkit,timeout:60000},async t=>{
  const errors=[];
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/')){
      res.setHeader('content-type','application/json');
      const value=path==='/api/me'?{name:'Cdr. Sara Khan',storageScope:'a'.repeat(64)}:{photos:[],messages:[],entries:[],events:[],records:[],items:[],tasks:[],jobs:[],total:0,hasMore:false,latest:null,item:null,generation:0,capabilities:{history:true,memory:true,assistant:true,assistantState:'ready'}};
      if(path==='/api/research-analysis'&&req.method==='POST'){
        await new Promise(done=>setTimeout(done,250));
        Object.assign(value,{content:'Sleep observations are stable. Review NASA sources and record changes.',references:[],retrieval:'qdrant',saved:true});
      }
      if(path==='/api/health-analysis'&&req.method==='POST'){
        let payload='';for await(const chunk of req)payload+=chunk;
        const request=JSON.parse(payload);await new Promise(done=>setTimeout(done,250));
        Object.assign(value,{id:request.id,snapshot:request.snapshot,createdAt:new Date().toISOString(),rules:{status:'NORMAL',complete:true,isDemo:true},result:{summary:'The supplied preflight readings remain stable.',alerts:[],status:'NORMAL',agentAvailable:true}});
      }
      res.end(JSON.stringify(value));return;
    }
    try{
      const file=resolve(root,'.'+(path==='/'?'/index.html':decodeURIComponent(path)));
      if(!file.startsWith(root))throw Error('invalid_path');
      const content=await readFile(file);res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(content);
    }catch{res.statusCode=404;res.end('Not found');}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  let browser;
  try{
    browser=await webkit.launch({headless:true,...(process.env.MISSION_WEBKIT_EXECUTABLE?{executablePath:process.env.MISSION_WEBKIT_EXECUTABLE}:{})});
    const page=await browser.newPage({viewport:{width,height:850}});
    page.setDefaultTimeout(4000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});
    await page.waitForFunction(()=>window.missionCheckin&&window.missionProfileName?.identity?.storageScope);
    await page.evaluate(()=>window.missionDesign.navigate('sources'));
    await page.waitForFunction(()=>document.querySelector('#research-participant'));

    const position=async selector=>{
      await page.locator(selector).evaluate(el=>{window.scrollTo({top:scrollY+el.getBoundingClientRect().top-250,behavior:'instant'});el.focus({preventScroll:true});window.__testedControl=el;});
      await page.waitForTimeout(60);
      return page.evaluate(()=>scrollY);
    };
    const stable=async(selector,before,focus=true)=>{
      const after=await page.locator(selector).evaluate(el=>({y:scrollY,same:el===window.__testedControl,focused:document.activeElement===el}));
      assert.ok(Math.abs(after.y-before)<=1,`${selector}: page moved from ${before} to ${after.y}`);
      assert.ok(after.same,`${selector}: active control was replaced`);
      if(focus)assert.ok(after.focused,`${selector}: focus was lost`);
    };
    await t.test('research selectors keep their nodes, focus and viewport',async()=>{
      for(const [selector,value]of [['#research-participant','C1G0002'],['#research-study-metric','efficiency_percent'],['#research-personal-metric','heart_rate'],['#research-period','30'],['#research-source','cbc'],['#research-participant','C003'],['#research-study-metric','hemoglobin_g_dl']]){
        const before=await position(selector);await page.locator(selector).selectOption(value);await page.waitForTimeout(60);await stable(selector,before);
      }
      const details=page.locator('.research-method');await details.evaluate(el=>el.open=true);
      const before=await position('#research-participant');await page.locator('#research-participant').selectOption('C002');await page.waitForTimeout(60);await stable('#research-participant',before);assert.ok(await details.evaluate(el=>el.open));
    });
    await t.test('analysis pending and completion preserve the button and viewport',async()=>{
      const before=await position('#research-analyze');await page.locator('#research-analyze').evaluate(el=>el.click());
      assert.equal(await page.locator('[data-research-block=analysis]').getAttribute('aria-busy'),'true');await stable('#research-analyze',before);
      await page.waitForFunction(()=>document.querySelector('[data-research-block=analysis]').getAttribute('aria-busy')==='false');
      await stable('#research-analyze',before);assert.match(await page.locator('.research-answer').textContent(),/Sleep observations are stable/);
    });
    await page.evaluate(()=>window.missionDesign.navigate('observations'));
    await page.waitForTimeout(150);
    await t.test('health analysis keeps page position during the request and result',async()=>{
      const before=await position('.health-analysis-button');await page.locator('.health-analysis-button').evaluate(el=>el.click());
      assert.equal(await page.locator('#health-analysis').getAttribute('aria-busy'),'true');
      assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<=1,'Starting health analysis moved the page');
      await page.waitForFunction(()=>document.querySelector('#health-analysis').getAttribute('aria-busy')==='false');
      assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<=1,'Completing health analysis moved the page');
      assert.match(await page.locator('.health-analysis-summary').textContent(),/supplied preflight readings remain stable/);
    });
    await t.test('slider dragging, saving and resetting keep the page bottom reachable',async()=>{
      const selector='#mission-home input[type=range]';const before=await position(selector);
      for(const value of [78,20,95,1,100]){
        await page.locator(selector).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
        await page.waitForTimeout(80);await stable(selector,before);
      }
      const box=await page.locator(selector).boundingBox();await page.mouse.move(box.x+box.width*.8,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height/2,{steps:6});await page.mouse.up();await page.waitForTimeout(100);
      // Native WebKit pointer interactions may blur a range; the page and node must stay stable.
      await stable(selector,before,false);assert.ok(Number(await page.locator(selector).inputValue())<50,'The native range did not move');
      await page.locator('.home-checkin .wellbeing-reset').evaluate(el=>el.click());await page.waitForTimeout(80);
      assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<=1,'Reset moved the page');
      await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
      assert.ok(await page.locator('.home-checkin .wellbeing-time').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),'The bottom of the check-in is unreachable');
    });
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(done=>server.close(done));}
});
