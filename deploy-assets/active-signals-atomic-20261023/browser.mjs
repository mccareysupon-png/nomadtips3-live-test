import assert from'node:assert/strict';
import {chromium}from'playwright';
import{readFile,writeFile}from'node:fs/promises';
import{JS_ROUTE,NEW_TAG}from'./patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8'));assert(c.ok&&c.preview&&!c.trafficChanged,'ISOLATED_CANDIDATE_NOT_VERIFIED');
const html=await(await fetch(c.preview+'/?signalBrowserQA='+Date.now())).text();
const js=await(await fetch(c.preview+JS_ROUTE+'?signalBrowserQA='+Date.now())).text();
assert(html.includes(NEW_TAG),'VERSIONED_SCRIPT_TAG_NOT_IN_PREVIEW');
assert(js.includes("metrics.dataset.v11Kind='metrics'")&&js.includes('host.dataset.v11Count=String(rows.length)'),'PATCHED_JS_NOT_LIVE');
const styleStart=html.indexOf('<style id="b46-featured-approved-sections-v10-20261021">');
assert(styleStart>=0,'APPROVED_STYLE_MISSING');
const styleEnd=html.indexOf('</style>',styleStart);assert(styleEnd>styleStart);
const css=html.slice(styleStart,styleEnd).replace(/^<style[^>]*>/,'');
const fnStart=js.indexOf('function featureSignalKey(s,i)'),fnEnd=js.indexOf('function looksLikeMarketRoot(v)',fnStart);
assert(fnStart>=0&&fnEnd>fnStart,'EXACT_SIGNAL_DOM_RENDERER_NOT_FOUND');
const funcs=js.slice(fnStart,fnEnd);
const shim=String.raw`
function signalDetailsHtml(s){
 const line=String(s.line),odds=Number(s.odds).toFixed(2);
 return '<div class="feature-signal-main"><b>AWAY</b><span>1X2 · Full Time</span></div>'+
 '<div class="feature-signal-meta"><span>Line '+line+'</span><span>Odds '+odds+'</span><span>'+String(s.bookmaker)+'</span></div>'+
 '<div class="feature-signal-meta"><span>Signal 44&#39;</span><span>Entry 0-0</span><span>Live 60&#39; · 0-1</span></div>';
}
`;
const browser=await chromium.launch({headless:true}),cases=[];
let bad=false;
for(const mobile of [false,true])for(const dark of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,colorScheme:dark?'dark':'light'});
 const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 let o={mobile,dark};
 try{
  const resp=await p.goto(c.preview+'/?signalLiveSmoke='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(resp.status(),200,'ACTUAL_PREVIEW_NOT_200');
  const loaded=await p.locator('script[src*="featured-facts-20261013a.js"]').getAttribute('src');
  assert(loaded?.includes('atomic-v11-20261023'),'LIVE_PAGE_JS_VERSION_NOT_BUMPED');
  const fixture=await ctx.newPage();
  const fixtureHtml=mobile?'<div id="b46gn-detail"><div class="b46gn-featured"><div class="featured-card" data-featured><div class="feature-signal" data-featured-signal></div></div></div></div>':'<section class="workspace singlepage"><div class="live-stage-grid"><aside class="right-rail"><section class="featured-card" data-featured><div class="feature-signal" data-featured-signal></div></section></aside></div></section>';
  await fixture.setContent('<!doctype html><html data-theme="'+(dark?'dark':'light')+'"><head><style>'+css+'</style></head><body>'+fixtureHtml+'</body></html>',{waitUntil:'load'});
  await fixture.addScriptTag({content:shim+funcs+'\nwindow.__b46AtomicPatchHost=patchFeatureSignalHost;'});
  const metrics=await fixture.evaluate(async()=>{
   const host=document.querySelector('[data-featured-signal]'),events=[],mutations=[];
   const scan=(kind)=>{
    for(const node of host.querySelectorAll(':scope > .feature-signal-meta[data-v11-kind="metrics"]')){
     const spans=[...node.children];if(spans.some(s=>!s.dataset.v11Label||!s.dataset.v11Value))events.push('UNDECORATED_'+kind);
    }
    for(const node of host.querySelectorAll(':scope > .feature-signal-meta:not([data-v11-kind])'))events.push('OLD_META_VISIBLE_'+kind);
   };
   const observer=new MutationObserver(()=>scan('mutation'));observer.observe(host,{childList:true,subtree:true});
   const signals=[{id:'44',line:'-',odds:3.25,bookmaker:'Bet 365'},{id:'45',line:'+0.25',odds:1.76,bookmaker:'Easybets'}];
   for(let i=0;i<30;i++){
    if(i>0)signals[0]={...signals[0],odds:3.25+i/100};
    window.__b46AtomicPatchHost(host,signals,'');
    scan('after_update_'+i);
    await Promise.resolve();
   }
   const decorated=[...host.querySelectorAll(':scope > .feature-signal-meta[data-v11-kind="metrics"]')];
   const spanValues=decorated.map(x=>[...x.querySelectorAll(':scope > span')].map(y=>({label:y.dataset.v11Label,value:y.dataset.v11Value})));
   const nodesBefore=[...host.children];window.__b46AtomicPatchHost(host,signals,'');const unchangedNodes=nodesBefore.every((n,i)=>host.children[i]===n);
   window.__b46AtomicPatchHost(host,[signals[0]],'');
   const afterShrink={count:host.dataset.v11Count,main:host.querySelectorAll(':scope > .feature-signal-main').length};
   window.__b46AtomicPatchHost(host,[],'');
   const empty={count:host.dataset.v11Count,stableState:host.dataset.b46StableSignalState,main:host.querySelectorAll(':scope > .feature-signal-main').length};
   observer.disconnect();
   return{events,mutations:mutations.length,spanValues,unchangedNodes,afterShrink,empty,cssDisplay:decorated[0]?getComputedStyle(decorated[0]).display:null};
  });
  o={...o,metrics,pageErrors:errors};
  assert.deepEqual(metrics.events,[],'STALE_UI_APPEARED_DURING_UPDATES');
  assert(metrics.unchangedNodes,'KEYED_ELEMENTS_RECREATED_WITHOUT_DATA_CHANGE');
  assert.equal(metrics.afterShrink.count,'1');assert.equal(metrics.empty.count,'0');
  assert.equal(metrics.empty.main,0);
  assert.equal(metrics.spanValues[0][0].label,'LINE');
  assert.equal(metrics.spanValues[0][1].label,'ODDS');
  assert.equal(metrics.spanValues[0][2].label,'BOOKMAKER');
  assert.equal(metrics.cssDisplay,'grid','V11_CSS_NOT_APPLIED_IMMEDIATELY');
  assert.equal(errors.length,0,'PREVIEW_BROWSER_ERRORS');
  o.pass=true;await fixture.close();
 }catch(e){o.pass=false;o.error=e.message;bad=true;}
 cases.push(o);await ctx.close();
}
await browser.close();const result={at:new Date().toISOString(),preview:c.preview,ok:!bad,cases};await writeFile('audit/browser.json',JSON.stringify(result,null,2));
console.log('BALL46_SIGNALS_BROWSER='+JSON.stringify({ok:result.ok,cases:cases.map(x=>({mobile:x.mobile,dark:x.dark,pass:x.pass,error:x.error,metrics:x.metrics&&{errors:x.metrics.events,stable:x.metrics.unchangedNodes,afterShrink:x.metrics.afterShrink,empty:x.metrics.empty,display:x.metrics.cssDisplay}}))}));
if(bad)process.exitCode=1;
