import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const cases=[
 ['production','https://ball46.com/?view=live'],
 ['isolated-test','https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev/?view=live']
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const grab=()=>({
 doc:document.scrollingElement.scrollTop,
 board:document.querySelector('.board-sections')?.scrollTop,
 scrollMax:(()=>{const e=document.querySelector('.board-sections');return e?e.scrollHeight-e.clientHeight:0})(),
 rows:document.querySelectorAll('.status-section[data-status-section="live"] .match-row').length,
 active:document.querySelector('.match-row.active')?.dataset.matchId||'',
 expand:document.querySelector('.match-expanded')?.getAttribute('data-expanded-match')||'',
 expandedHeight:document.querySelector('.match-expanded')?.getBoundingClientRect().height||0,
 fullHeight:document.querySelector('.expand-full-market-card')?.getBoundingClientRect().height||0,
 flowHeight:document.querySelector('.expand-flow-card')?.getBoundingClientRect().height||0,
 flashes:document.querySelectorAll('.b46-v3-quote[data-b46-odds-move]').length,
 testFlashes:document.querySelectorAll('td[data-b46-fmb-odds-move]').length
});
const near=(a,b,tol=2)=>Math.abs(a-b)<=tol;
const results=[];
try{
 for(const [name,url] of cases){
   const p=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
   const errors=[];
   p.on('pageerror',e=>errors.push(String(e).slice(0,400)));
   await p.addInitScript(()=>{
     try{localStorage.setItem('nomad343_dashboard_theme_v1','dark')}catch{}
     window.__b46Stress={longs:[],shifts:[],frames:[],start:performance.now(),previous:0};
     try{new PerformanceObserver(l=>{for(const x of l.getEntries())window.__b46Stress.longs.push({time:Math.round(x.startTime),duration:Math.round(x.duration)})}).observe({type:'longtask',buffered:true})}catch{}
     try{new PerformanceObserver(l=>{for(const x of l.getEntries())if(!x.hadRecentInput)window.__b46Stress.shifts.push({time:Math.round(x.startTime),value:x.value})}).observe({type:'layout-shift',buffered:true})}catch{}
     requestAnimationFrame(function frame(t){const s=window.__b46Stress;if(s.previous>0&&t-s.previous>85)s.frames.push({time:Math.round(t),gap:Math.round(t-s.previous)});s.previous=t;requestAnimationFrame(frame)});
   });
   await p.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
   const nav=await p.goto(url+'&scrollStress='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
   assert(nav?.ok(),'PAGE_LOAD_FAILED_'+name);
   await p.waitForFunction(()=>document.querySelectorAll('.status-section[data-status-section="live"] .match-row').length>6&&window.__b46OddsMovementStats?.ready,null,{timeout:52000});
   await p.evaluate(()=>{document.scrollingElement.scrollTop=0;document.querySelector('.board-sections').scrollTop=340});
   await sleep(250);
   const baseline=await p.evaluate(grab);
   const rowsBefore=await p.evaluate(()=>[...document.querySelectorAll('.status-section[data-status-section="live"] .match-row')].slice(0,12).map(e=>({id:e.dataset.matchId,height:e.getBoundingClientRect().height})));
   const movements=[];
   for(let wave=0;wave<4;wave++){
     const changed=await p.evaluate(i=>{
       const nodes=[...document.querySelectorAll('.status-section[data-status-section="live"] .b46-v3-quote strong[data-nomad-odds-raw]')].filter(e=>Number(e.getAttribute('data-nomad-odds-raw'))>1.2&&Number(e.getAttribute('data-nomad-odds-raw'))<100);
       const pick=nodes.slice(0,Math.min(9,nodes.length));
       for(const el of pick){const from=Number(el.getAttribute('data-nomad-odds-raw'));const next=(from+(i%2===0?.07:-.07)).toFixed(2);el.setAttribute('data-nomad-odds-raw',next);el.textContent=next}
       return {sample:pick.length,origin:i};
     },wave);
     await sleep(230);
     movements.push({changed,scroll:await p.evaluate(grab)});
   }
   const afterMoves=await p.evaluate(grab);
   const rowsAfter=await p.evaluate(()=>[...document.querySelectorAll('.status-section[data-status-section="live"] .match-row')].slice(0,12).map(e=>({id:e.dataset.matchId,height:e.getBoundingClientRect().height})));
   const maxRowChange=Math.max(0,...rowsBefore.filter(x=>rowsAfter.some(y=>y.id===x.id)).map(x=>Math.abs(x.height-rowsAfter.find(y=>y.id===x.id).height)));
   const scrollUnexpected=movements.some(x=>!near(x.scroll.doc,baseline.doc,2)||!near(x.scroll.board,baseline.board,2));
   // Native DOM click to avoid Playwright locator auto-scroll; trigger the same click event as a user.
   const clicked=await p.evaluate(()=>{
     const board=document.querySelector('.board-sections'),br=board.getBoundingClientRect();
     let row=[...board.querySelectorAll('.status-section[data-status-section="live"] .match-row')].find(e=>{const r=e.getBoundingClientRect();return r.top>br.top+40&&r.bottom<br.bottom-80});
     if(!row)return null;const prior={doc:document.scrollingElement.scrollTop,board:board.scrollTop};
     row.click();return {id:row.dataset.matchId,prior};
   });
   assert(clicked,'NO_VISIBLE_MATCH_FOR_EXPAND_'+name);
   await p.waitForFunction(()=>document.querySelector('.match-expanded'),null,{timeout:20000});
   await p.waitForTimeout(650);
   const opened=await p.evaluate(grab);
   const flow=await p.evaluate(()=>{
     const root=document.querySelector('.match-expanded');
     const ids=[...root.querySelectorAll('button,[role=button],a')].filter(e=>e.getBoundingClientRect().width>10).slice(0,15).map(e=>({name:e.textContent.trim().slice(0,40),tag:e.tagName,cls:String(e.className).slice(0,90)}));
     const chart=root.querySelector('.expand-flow-chart svg');
     return {root:!!root,fixture:!!root?._nomadFixture,icons:root.querySelectorAll('[data-b46-event-icon]').length,chart:!!chart,controls:ids};
   });
   let eventFlowRenders=0;
   if(flow.fixture&&flow.chart){
     eventFlowRenders=await p.evaluate(()=>{
       const root=document.querySelector('.match-expanded'),fixture=root._nomadFixture;
       for(let i=0;i<4;i++)root.dispatchEvent(new CustomEvent('nomad343:fixture-ready',{bubbles:true,detail:{fixtureId:root.dataset.expandedMatch,fixture}}));
       return 4;
     });
     await sleep(280);
   }
   const afterFlow=await p.evaluate(grab);
   await p.waitForFunction(()=>document.querySelector('.expand-full-market-card .fmb-tab.has-data[data-fmb-book]'),null,{timeout:16000});
   const tabStates=[];
   for(let i=0;i<4;i++){
     const switched=await p.evaluate(i=>{
       const tabs=[...document.querySelectorAll('.expand-full-market-card .fmb-tab.has-data[data-fmb-book]')];
       const selected=tabs[i%Math.min(2,tabs.length)];
       if(!selected)return null;
       const board=document.querySelector('.board-sections'),doc=document.scrollingElement;
       const before={doc:doc.scrollTop,board:board.scrollTop};
       selected.click();
       return {book:selected.dataset.fmbBook,before};
     },i);
     await sleep(220);
     const after=await p.evaluate(grab);tabStates.push({switched,after});
   }
   const end=await p.evaluate(grab);
   const perf=await p.evaluate(()=>{
     const d=window.__b46Stress,t=d.start;
     return {longs:d.longs.filter(x=>x.time>=t),frames:d.frames.filter(x=>x.time>=t),shifts:d.shifts.filter(x=>x.time>=t),flashes:window.__b46OddsMovementStats?.flashes,scans:window.__b46FullMarketOddsV3Stats?.scans||0};
   });
   const explain={
     name,baseline,movements,afterMoves,maxRowChange,clicked,opened,flow,eventFlowRenders,afterFlow,tabStates,end,errors,
     stats:{longs:perf.longs.length,longMs:perf.longs.reduce((a,b)=>a+b.duration,0),maxLongMs:Math.max(0,...perf.longs.map(x=>x.duration)),frameSpikes:perf.frames.length,maxFrameGapMs:Math.max(0,...perf.frames.map(x=>x.gap)),layoutShifts:perf.shifts.slice(-10),defaultFlashes:perf.flashes,fullScans:perf.scans},
     constraints:{defaultScrollStable:!scrollUnexpected,rowsFixed:maxRowChange<1,expandWindowStable:near(clicked.prior.doc,opened.doc,2),expandedBoardStable:near(clicked.prior.board,opened.board,3),flowScrollStable:near(opened.doc,afterFlow.doc,2)&&near(opened.board,afterFlow.board,3),bookmakerScrollStable:tabStates.every(x=>x.switched&&near(x.switched.before.doc,x.after.doc,2)&&near(x.switched.before.board,x.after.board,3))}
   };
   console.log('B46_FULLMARKET_STRESS_COMPARE '+JSON.stringify(explain).slice(0,40000));
   results.push(explain);
   await p.close();
 }
}finally{await browser.close()}
const test=results.find(x=>x.name==='isolated-test');
assert(test,'TEST_COMPARE_MISSING');
assert(test.constraints.defaultScrollStable,'DEFAULT_V3_BULK_PRICE_SCROLL_JUMP');
assert(test.constraints.rowsFixed,'DEFAULT_V3_ROW_HEIGHT_CHANGED');
assert(test.constraints.expandWindowStable,'EXPAND_OUTER_PAGE_JUMP');
assert(test.constraints.flowScrollStable,'EVENT_FLOW_REFRESH_SCROLL_JUMP');
assert(test.constraints.bookmakerScrollStable,'BOOKMAKER_SWITCH_SCROLL_JUMP');
assert.deepEqual(test.errors,[],'ISOLATED_TEST_JS_ERROR');
console.log('B46_FULLMARKET_STRESS_PASS '+JSON.stringify({scopes:results.map(x=>({name:x.name,constraints:x.constraints,longTasks:x.stats.longs,maxLongMs:x.stats.maxLongMs,frameSpikes:x.stats.frameSpikes})),productionUntouched:true}));