import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch(process.env.B46_CHROMIUM_PATH ? {
 executablePath:process.env.B46_CHROMIUM_PATH,headless:true
} : {});
const base=process.env.B46_RELEASE_ORIGIN;
const cases=['native-flow','optimized-flow'];
const reports=[];
try{
 for(const name of cases){
  const p=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block',ignoreHTTPSErrors:!!process.env.B46_CHROMIUM_PATH});
  const errors=[];
  p.on('pageerror',e=>errors.push(String(e).slice(0,250)));
  await p.addInitScript(()=>{
    try{localStorage.setItem('nomad343_dashboard_theme_v1','dark')}catch{}
    window.__b46FlowStress={calls:0,pointCalls:0,timeMs:0,pointMs:0,longs:[],frames:[],lastFrame:0};
    const proto=SVGPathElement.prototype;
    const length=proto.getTotalLength,point=proto.getPointAtLength;
    proto.getTotalLength=function(){const t=performance.now();try{return length.call(this)}finally{const s=window.__b46FlowStress;s.calls++;s.timeMs+=performance.now()-t}};
    proto.getPointAtLength=function(x){const t=performance.now();try{return point.call(this,x)}finally{const s=window.__b46FlowStress;s.pointCalls++;s.pointMs+=performance.now()-t}};
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__b46FlowStress.longs.push({at:Math.round(e.startTime),ms:Math.round(e.duration)})}).observe({type:'longtask',buffered:true})}catch{}
    requestAnimationFrame(function tick(t){const s=window.__b46FlowStress;if(s.lastFrame&&t-s.lastFrame>90)s.frames.push({at:Math.round(t),ms:Math.round(t-s.lastFrame)});s.lastFrame=t;requestAnimationFrame(tick)});
  });
  await p.route('**/*',async r=>{
    if(!['GET','HEAD'].includes(r.request().method()))return r.abort();
    const u=new URL(r.request().url());
    if(name==='native-flow'&&u.pathname==='/ui-sync-fixes-343-v2.js'){
      const content=await readFile(process.env.B46_NATIVE_FLOW_SOURCE,'utf8');
      assert(!content.includes('b46FlowPolylineCache'),'ORIGINAL_FLOW_ASSET_ABLATION_FAILED');
      return r.fulfill({contentType:'application/javascript',body:content});
    }
    return r.continue();
  });
  await p.goto(base+'/?view=live&flowStress='+name,{waitUntil:'domcontentloaded',timeout:70000});
  await p.waitForFunction(()=>document.querySelectorAll('.status-section[data-status-section="live"] .match-row').length>4,null,{timeout:50000});
  await p.evaluate(()=>{document.scrollingElement.scrollTop=0;document.querySelector('.board-sections').scrollTop=300});
  let fixture=null;
  for(let i=0;i<Math.min(7,await p.locator('.status-section[data-status-section="live"] .match-row').count());i++){
    const next=await p.evaluate(i=>{
      const rows=[...document.querySelectorAll('.status-section[data-status-section="live"] .match-row')],row=rows[i];
      if(!row)return null;row.click();return row.dataset.matchId;
    },i);
    try{
      await p.waitForFunction(()=>{const r=document.querySelector('.match-expanded');return !!r?._nomadFixture&&!!r?.querySelector('.expand-flow-chart svg path.expand-flow-line')&&r.querySelectorAll('[data-b46-event-icon]').length>0},null,{timeout:4200});
      fixture=next;break;
    }catch{}
  }
  assert(fixture,'NO_EVENTFLOW_FIXTURE_WITH_EVENTS_'+name);
  await p.waitForTimeout(250);
  const baseline=await p.evaluate(()=>{
    const r=document.querySelector('.match-expanded'),svg=r.querySelector('.expand-flow-chart svg');
    return {doc:document.scrollingElement.scrollTop,board:document.querySelector('.board-sections').scrollTop,fixture:r.dataset.expandedMatch,icons:svg.querySelectorAll('[data-b46-event-icon]').length,keys:[...svg.querySelectorAll('[data-b46-event-icon]')].map(e=>e.getAttribute('transform')),nativeSource:!!r._nomadFixture,minute:r._nomadFixture?.minute??r._nomadFixture?.elapsed??null,pathD:[...svg.querySelectorAll('path.expand-flow-line')].map(e=>e.getAttribute('d'))};
  });
  await p.evaluate(()=>{const s=window.__b46FlowStress;s.calls=0;s.pointCalls=0;s.timeMs=0;s.pointMs=0;s.longs=[];s.frames=[]});
  const repeat=12;
  const refresh=await p.evaluate(async n=>{
    const r=document.querySelector('.match-expanded');
    const fixture=r._nomadFixture;
    const steps=[],begin=performance.now();
    for(let i=0;i<n;i++){
      const t=performance.now();
      r.dispatchEvent(new CustomEvent('nomad343:fixture-ready',{bubbles:true,detail:{fixtureId:r.dataset.expandedMatch,fixture}}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      steps.push(Math.round(performance.now()-t));
    }
    return {durationMs:Math.round(performance.now()-begin),steps};
  },repeat);
  const after=await p.evaluate(()=>{
    const r=document.querySelector('.match-expanded'),svg=r.querySelector('.expand-flow-chart svg'),s=window.__b46FlowStress;
    return {doc:document.scrollingElement.scrollTop,board:document.querySelector('.board-sections').scrollTop,fixture:r.dataset.expandedMatch,icons:svg.querySelectorAll('[data-b46-event-icon]').length,keys:[...svg.querySelectorAll('[data-b46-event-icon]')].map(e=>e.getAttribute('transform')),minute:r._nomadFixture?.minute??r._nomadFixture?.elapsed??null,pathD:[...svg.querySelectorAll('path.expand-flow-line')].map(e=>e.getAttribute('d')),perf:{lengthCalls:s.calls,pointCalls:s.pointCalls,lengthMs:+s.timeMs.toFixed(1),pointMs:+s.pointMs.toFixed(1),longs:s.longs.slice(-16),longsCount:s.longs.length,maxLongTask:Math.max(0,...s.longs.map(e=>e.ms)),frameSpikes:s.frames.length,maxFrameSpike:Math.max(0,...s.frames.map(e=>e.ms))}};
  });
  const iconDifferences=baseline.keys.map((x,i)=>x===after.keys[i]?null:{i,from:x,to:after.keys[i]}).filter(Boolean);
  const dataChanged=baseline.minute!==after.minute||JSON.stringify(baseline.pathD)!==JSON.stringify(after.pathD);
  const stable=baseline.fixture===after.fixture&&Math.abs(baseline.doc-after.doc)<3&&Math.abs(baseline.board-after.board)<3&&baseline.icons===after.icons&&(iconDifferences.length===0||dataChanged);
  reports.push({name,baseline:{...baseline,keys:undefined,pathD:undefined},refresh,after:{...after,keys:undefined,pathD:undefined},stable,dataChanged,iconDifferences:iconDifferences.slice(0,20),errors});
  console.log('B46_EVENTFLOW_REPEAT_STRESS '+JSON.stringify(reports.at(-1)));
  assert(stable,'EVENTFLOW_SCROLL_OR_ICON_DRIFT_'+name);
  assert.deepEqual(errors,[],'BROWSER_ERRORS_'+name);
  await p.close();
 }
}finally{await browser.close()}
const original=reports.find(r=>r.name==='native-flow'),optimized=reports.find(r=>r.name==='optimized-flow');
assert(original&&optimized,'MISSING_COMPARISON');
assert(optimized.after.perf.lengthCalls<original.after.perf.lengthCalls,'SVG_LENGTH_CALLS_NOT_REDUCED');
assert(optimized.after.perf.pointCalls<original.after.perf.pointCalls,'SVG_POINT_CALLS_NOT_REDUCED');
console.log('B46_EVENTFLOW_REPEAT_STRESS_PASS '+JSON.stringify({refreshes:12,flowDataSame:original.stable&&optimized.stable,originalMs:original.refresh.durationMs,optimizedMs:optimized.refresh.durationMs,originalLengthCalls:original.after.perf.lengthCalls,testLengthCalls:optimized.after.perf.lengthCalls,originalPointCalls:original.after.perf.pointCalls,testPointCalls:optimized.after.perf.pointCalls}));
