// Read-only pre-Candidate browser simulation OR actual Candidate/live HTML QA.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sanitizeStatsPage,CSS_OLD,CSS_NEW} from './remove-obsolete-stats-ui.mjs';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url));
const {chromium}=require('playwright');
const host=process.env.B46_OBSOLETE_UI_HOST||'https://ball46-production.mccarey-supon.workers.dev';
const simulate=process.env.B46_OBSOLETE_UI_MODE!=='real';
function stripTag(source,tag,id){
 const start='<'+tag+' id="'+id+'">',i=source.indexOf(start);
 assert(i>=0,'SIMULATED_TAG_NOT_FOUND_'+id);
 const end=source.indexOf('</'+tag+'>',i);
 assert(end>i,'SIMULATED_TAG_UNTERMINATED_'+id);
 return source.slice(0,i)+source.slice(end+tag.length+3);
}
const browser=await chromium.launch({headless:true});
try{
 for(const test of [
  {name:'pc-total',path:'/?view=statistics',width:1366,height:900},
  {name:'pc-1x2',path:'/?view=statistics&market=1x2',width:1366,height:900,filtered:true},
  {name:'mobile-total',path:'/?view=statistics',width:390,height:844,mobile:true}
 ]){
 const ctx=await browser.newContext({viewport:{width:test.width,height:test.height},
  isMobile:!!test.mobile,hasTouch:!!test.mobile,timezoneId:'Asia/Bangkok'});
 const page=await ctx.newPage(),errors=[],api=[],rawHTML=[];
 page.on('pageerror',e=>errors.push(e.message.slice(0,220)));
 page.on('response',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')api.push(r.status())});
 await page.addInitScript(()=>{
   window.__B46_OBSOLETE_INSERTIONS=0;
   window.__B46_OLD_UI_VISIBLE_FRAMES=0;
   const watch=()=>{
    new MutationObserver(rows=>{
      for(const row of rows)for(const n of row.addedNodes){
        if(n.nodeType===1&&(n.matches?.('.b46-stats-loader')||n.querySelector?.('.b46-stats-loader')))
          window.__B46_OBSOLETE_INSERTIONS++;
      }
    }).observe(document.documentElement,{subtree:true,childList:true});
    let frames=0;
    const probe=()=>{
      if(++frames>450)return;
      if(document.body?.dataset.workspaceView==='statistics'){
       const section=document.querySelector('.sp-stats-content');
       const box=section&&getComputedStyle(section);
       const visible=box&&box.visibility!=='hidden'&&box.display!=='none';
       const hasFinal=!!document.querySelector('#b46-fast-v1-preview')||
         !!document.querySelector('#b46-finance-chart-card svg.f46-svg');
       if(visible&&!hasFinal&&
         document.documentElement.getAttribute('data-b46-statistics-render-error')!=='1')
         window.__B46_OLD_UI_VISIBLE_FRAMES++;
      }
      requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
   };
   if(document.documentElement)watch();
   else document.addEventListener('DOMContentLoaded',watch,{once:true});
 });
 if(simulate)await page.route(/\/(?:index\.html)?\?view=statistics/,async route=>{
   const original=await route.fetch();
   let body=await original.text();
   body=stripTag(body,'style','b46-statistics-visuals-20261114');
   body=stripTag(body,'script','b46-statistics-visuals-20261114-runtime');
   body=sanitizeStatsPage(body);
   return route.fulfill({response:original,body});
 });
 const started=Date.now();
 const resp=await page.goto(host+test.path,{waitUntil:'domcontentloaded',timeout:65000});
 assert.equal(resp?.status(),200,test.name+':ENTRY_HTTP');
 rawHTML.push(await resp.text());
 assert(!rawHTML[0].includes('id="b46-statistics-visuals-20261114"'),test.name+':LOADER_STYLE_STILL_IN_HTML');
 assert(!rawHTML[0].includes('id="b46-statistics-visuals-20261114-runtime"'),test.name+':LOADER_SCRIPT_STILL_IN_HTML');
 assert(!rawHTML[0].includes('id="'+CSS_OLD+'"'),test.name+':OLD_HYDRATION_STYLE_STILL_IN_HTML');
 assert(rawHTML[0].includes('id="'+CSS_NEW+'"'),test.name+':NEW_HYDRATION_STYLE_MISSING');
 if(test.filtered){
   await page.waitForFunction(()=>{
    const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
    return d?.ok===true && d.ledgerRows?.length===d.ledgerTotal &&
      !!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length;
   },null,{timeout:110000});
 }else{
   await page.waitForFunction(()=>window.__B46_FAST_V1_DIAG?.status==='fast-preview-visible',
     null,{timeout:20000});
   await page.waitForTimeout(600);
 }
 const inspected=await page.evaluate(()=>{
   const panel=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]');
   const pseudo=panel?getComputedStyle(panel,'::after').content:null;
   return{
    insertions:window.__B46_OBSOLETE_INSERTIONS,
    oldUiVisibleFrames:window.__B46_OLD_UI_VISIBLE_FRAMES,
    oldLoaderDom:document.querySelectorAll('.b46-stats-loader').length,
    oldLoaderStyle:!!document.querySelector('#b46-statistics-visuals-20261114'),
    oldLoaderScript:!!document.querySelector('#b46-statistics-visuals-20261114-runtime'),
    oldHydrationStyle:!!document.querySelector('#b46-statistics-no-old-flash-20261022'),
    newHydrationStyle:!!document.querySelector('#b46-stats-v1-no-legacy-firstpaint-20261116'),
    pseudo,fast:!!document.querySelector('#b46-fast-v1-preview')?.getClientRects().length,
    finance:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,
    overflow:document.documentElement.scrollWidth>innerWidth+2
   }
 });
 assert(inspected.insertions===0&&inspected.oldLoaderDom===0&&!inspected.oldLoaderStyle&&
  !inspected.oldLoaderScript&&!inspected.oldHydrationStyle&&inspected.newHydrationStyle,
  test.name+':OBSOLETE_COMPONENT_REAPPEARED_'+JSON.stringify(inspected));
 assert.equal(inspected.oldUiVisibleFrames,0,test.name+':OLD_UI_FLASHED_'+JSON.stringify(inspected));
 assert(!inspected.overflow,test.name+':HORIZONTAL_OVERFLOW');
 assert.equal(errors.length,0,test.name+':JS_ERRORS_'+JSON.stringify(errors));
 if(!test.filtered)assert.equal(api.length,0,test.name+':FULL_HISTORY_FETCHED_BEFORE_REQUEST');
 if(!test.filtered&&!test.mobile){
  await page.locator('#b46-fast-v1-preview .b46-fast-details').click();
  await page.waitForFunction(()=>{
   const d=window.BALL46_STATISTICS_DATA?.getSnapshot?.();
   return d?.ok===true&&d.ledgerRows?.length===d.ledgerTotal&&
     !document.querySelector('#b46-fast-v1-preview') &&
     !!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length;
  },null,{timeout:115000});
  const after=await page.evaluate(()=>({
    oldLoader:document.querySelectorAll('.b46-stats-loader').length,
    finance:!!document.querySelector('#b46-finance-chart-card svg.f46-svg')?.getClientRects().length,
    updated:window.BALL46_STATISTICS_DATA?.getSnapshot?.()?.ledgerTotal
  }));
  assert(after.oldLoader===0&&after.finance&&after.updated>15000,'NATIVE_TAKEOVER_WITH_LEGACY_UI');
 }
 console.log('B46_REMOVE_OBSOLETE_UI_BROWSER='+JSON.stringify({profile:test.name,mode:simulate?'simulated-html':'real-candidate',
  elapsedMs:Date.now()-started,check:inspected,errors,fullStatsAPIRequests:api.length,pass:true}));
 await ctx.close();
 }
}finally{await browser.close()}
