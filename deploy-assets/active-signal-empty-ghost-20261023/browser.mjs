import assert from'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{chromium}from'playwright';
import{NEW_TAG,JS_PATH}from'./patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8'));assert(c.ok&&!c.trafficChanged&&c.preview);
const [hr,jr]=await Promise.all([fetch(c.preview+'/?ghostQa='+Date.now()),fetch(c.preview+JS_PATH+'?ghostQa='+Date.now())]);
assert.equal(hr.status,200);assert.equal(jr.status,200);
const html=await hr.text(),js=await jr.text();
assert(html.includes(NEW_TAG),'VERSIONED_JS_NOT_LOADED');
assert(js.includes("if(signal){signal.replaceChildren();signal.classList.remove('locked');signal.title=''}"),'CLEAR_FEATURED_PLACEHOLDER_STILL_EXISTS');
assert(js.includes("node.textContent.trim().toLowerCase()==='no active signal'"),'ORPHAN_REMOVAL_MISSING');
const a=js.indexOf('function featureSignalKey(s,i)'),b=js.indexOf('function looksLikeMarketRoot(v)',a);assert(a>=0&&b>a,'LIVE_RENDER_FUNCTIONS_MISSING');
const renderer=js.slice(a,b);
const stub=String.raw`
function signalDetailsHtml(s){
 return '<div class="feature-signal-main"><b>'+s.selection+'</b><span>Asian Handicap · Full Time</span></div>'+
 '<div class="feature-signal-meta"><span>Line '+s.line+'</span><span>Odds '+Number(s.odds).toFixed(2)+'</span><span>'+s.book+'</span></div>'+
 '<div class="feature-signal-meta"><span>Signal 30</span><span>Entry 0-0</span><span>Live 66 · 0-1</span></div>';
}
`;
const styleIdx=html.indexOf('<style id="b46-featured-approved-sections-v10-20261021">'),styleEnd=html.indexOf('</style>',styleIdx);
assert(styleIdx>0&&styleEnd>styleIdx);
const css=html.slice(styleIdx,styleEnd).replace(/^<style[^>]*>/,'');
const browser=await chromium.launch({headless:true}),cases=[];let error=false;
for(const mobile of [false,true])for(const theme of ['dark','light']){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,colorScheme:theme});
 const page=await ctx.newPage();let result={mobile,theme};
 try{
  const resp=await page.goto(c.preview+'/?ghostQaLive='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});assert.equal(resp.status(),200);
  const scriptUrl=await page.locator('script[src*="featured-facts-20261013a.js"]').first().getAttribute('src');
  assert(scriptUrl.includes('no-empty-ghost'),'PAGE_USING_OLD_SCRIPT');
  const fixture=await ctx.newPage();
  const section=mobile?'<div id="b46gn-detail"><div class="b46gn-featured"><div class="featured-card" data-featured><div class="feature-signal" data-featured-signal></div></div></div></div>':'<div class="workspace singlepage"><div class="live-stage-grid"><aside class="right-rail"><section class="featured-card" data-featured><div class="feature-signal" data-featured-signal></div></section></aside></div></div>';
  await fixture.setContent('<!doctype html><html data-theme="'+theme+'"><head><style>'+css+'</style></head><body>'+section+'</body></html>');
  await fixture.addScriptTag({content:stub+renderer+'\nwindow.__b46RenderGhostFix=patchFeatureSignalHost;'});
  const qa=await fixture.evaluate(async()=>{
   const host=document.querySelector('[data-featured-signal]');
   const messages=[],observe=new MutationObserver(()=>{if([...host.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().toLowerCase()==='no active signal'))messages.push('GHOST_AFTER_MUTATION')});
   observe.observe(host,{childList:true,subtree:true});
   host.textContent='No active signal';
   const data=[{id:'a',selection:'HOME',line:'+0.50',odds:1.91,book:'12bet'},{id:'b',selection:'HOME',line:'—',odds:3.50,book:'Bet 365'}];
   window.__b46RenderGhostFix(host,data,'');await Promise.resolve();
   const snapshot=()=>({textNodes:[...host.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent.trim()).filter(Boolean),count:host.dataset.v11Count,main:host.querySelectorAll(':scope > .feature-signal-main').length,metrics:host.querySelectorAll(':scope > .feature-signal-meta[data-v11-kind="metrics"]').length});
   const first=snapshot(),els=[...host.children];
   window.__b46RenderGhostFix(host,data,'');const stable=els.every((n,i)=>host.children[i]===n);
   for(let i=0;i<20;i++){data[0]={...data[0],odds:1.91+i/100};window.__b46RenderGhostFix(host,data,'');await Promise.resolve();}
   const refreshed=snapshot();
   window.__b46RenderGhostFix(host,[],'');const empty=snapshot();
   window.__b46RenderGhostFix(host,data,'');const repopulated=snapshot();
   observe.disconnect();return{first,stable,refreshed,empty,repopulated,genericTextPresent:host.textContent.includes('No active signal'),errorMessages:messages.filter(x=>x!=='GHOST_AFTER_MUTATION')};
  });
  assert.deepEqual(qa.first.textNodes,[],'STALE_NO_ACTIVE_SIGNAL_TEXT_NOT_REMOVED');
  assert.equal(qa.first.main,2);assert.equal(qa.first.metrics,2);assert.equal(qa.first.count,'2');
  assert(qa.stable,'UNMODIFIED_KEYED_ROWS_REBUILT');
  assert.deepEqual(qa.refreshed.textNodes,[]);assert.equal(qa.refreshed.count,'2');
  assert.equal(qa.empty.count,'0');assert.equal(qa.empty.main,0);
  assert.deepEqual(qa.repopulated.textNodes,[]);assert.equal(qa.repopulated.count,'2');assert.equal(qa.genericTextPresent,false);
  result={...result,pass:true,qa};await fixture.close();
 }catch(e){result={...result,pass:false,error:e.message};error=true;}
 cases.push(result);await ctx.close();
}
await browser.close();
const report={at:new Date().toISOString(),ok:!error,preview:c.preview,cases};
await writeFile('audit/browser.json',JSON.stringify(report,null,2));
console.log('B46_GHOST_BROWSER='+JSON.stringify({ok:report.ok,cases:cases.map(x=>({mobile:x.mobile,theme:x.theme,pass:x.pass,error:x.error,first:x.qa?.first,refreshed:x.qa?.refreshed,repopulated:x.qa?.repopulated}))}));
if(error)process.exitCode=1;
