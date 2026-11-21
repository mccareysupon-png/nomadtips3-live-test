import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='https://ball46-fullmarket-odds-v3-test-20261121.mccarey-supon.workers.dev';
const b=await chromium.launch();
try {
 const p=await b.newPage({viewport:{width:1440,height:850},serviceWorkers:'block'});
 await p.addInitScript(()=>localStorage.setItem('nomad343_dashboard_theme_v1','dark'));
 p.on('pageerror',e=>console.log('B46_SCROLL_PAGE_ERROR '+String(e).slice(0,300)));
 await p.goto(base+'/?view=live&scrollQa='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
 await p.waitForFunction(()=>document.querySelectorAll('.status-section[data-status-section="live"] .match-row').length>=5&&window.__b46OddsMovementStats?.ready,null,{timeout:55000});
 const status=await p.evaluate(()=>{
  const board=document.querySelector('.board-sections');
  return {overscroll:getComputedStyle(board).overscrollBehaviorY,boardHeight:board.clientHeight,boardScrollHeight:board.scrollHeight,docHeight:document.scrollingElement.scrollHeight,windowHeight:innerHeight,fullmarketV3:!!window.__b46FullMarketOddsV3Stats};
 });
 console.log('B46_SCROLL_ANCHOR_CSS '+JSON.stringify(status));
 assert.equal(status.overscroll,'contain','NESTED_SCROLL_CHAINING_NOT_CONTAINED');
 assert(status.boardScrollHeight>status.boardHeight+500,'NOT_ENOUGH_BOARD_ROWS');
 const read=()=>p.evaluate(()=>({doc:document.scrollingElement.scrollTop,board:document.querySelector('.board-sections').scrollTop,active:document.querySelector('.match-row.active')?.dataset.matchId,opened:document.querySelector('.match-expanded')?.getAttribute('data-expanded-match')||null}));
 await p.evaluate(()=>{document.scrollingElement.scrollTop=0;const board=document.querySelector('.board-sections');board.scrollTop=board.scrollHeight-board.clientHeight});
 await p.waitForTimeout(180);
 const before=await read();
 const rect=await p.locator('.board-sections').boundingBox();
 assert(rect?.width>300&&rect.height>200,'NO_VISIBLE_BOARD');
 await p.mouse.move(rect.x+rect.width/2,Math.max(4,rect.y)+Math.min(260,rect.height/2));
 await p.mouse.wheel(0,530);
 await p.waitForTimeout(240);
 const after=await read();
 console.log('B46_SCROLL_WHEEL_CONTAINMENT '+JSON.stringify({before,after}));
 assert(Math.abs(after.doc-before.doc)<3,'BOARD_WHEEL_CHAINED_TO_OUTER_PAGE');
 // Read-only DOM price mutation. Native odds V3 must update price and decoration without scroll displacement.
 await p.evaluate(()=>{document.scrollingElement.scrollTop=0;document.querySelector('.board-sections').scrollTop=340});
 await p.waitForTimeout(160);
 const movement=await p.evaluate(()=>{
  const options=[...document.querySelectorAll('.status-section[data-status-section="live"] .b46-v3-quote strong[data-nomad-odds-raw]')].filter(e=>Number(e.getAttribute('data-nomad-odds-raw'))>1.2);
  const el=options[0];if(!el)return null;
  const old=el.getAttribute('data-nomad-odds-raw'),next=(Number(old)+0.07).toFixed(2);
  const board=document.querySelector('.board-sections'),doc=document.scrollingElement,prior={doc:doc.scrollTop,board:board.scrollTop};
  el.setAttribute('data-nomad-odds-raw',next);el.textContent=next;
  return {old,next,id:el.closest('.match-row')?.dataset.matchId,prior};
 });
 assert(movement,'NO_REAL_DEFAULT_QUOTE');
 await p.waitForTimeout(450);
 const afterPrice=await read();
 console.log('B46_SCROLL_ODDS_ANCHOR '+JSON.stringify({movement,afterPrice,defaultStats:await p.evaluate(()=>window.__b46OddsMovementStats)}));
 assert(Math.abs(afterPrice.doc-movement.prior.doc)<3&&Math.abs(afterPrice.board-movement.prior.board)<3,'DEFAULT_PRICE_UPDATE_MOVED_VIEWPORT');
 // Use native DOM click, NOT Playwright locator.click (which auto-scrolls and gave a false jump in earlier investigation).
 const clicked=await p.evaluate(()=>{
  const board=document.querySelector('.board-sections'),rect=board.getBoundingClientRect();
  const row=[...board.querySelectorAll('.status-section[data-status-section="live"] .match-row')].find(e=>{
   const r=e.getBoundingClientRect();return r.top>rect.top+40&&r.bottom<rect.bottom-65
  });
  if(!row)return null;
  const prior={doc:document.scrollingElement.scrollTop,board:board.scrollTop};
  row.click();
  return {id:row.dataset.matchId,prior};
 });
 assert(clicked,'NO_VISIBLE_ROW_FOR_NATIVE_EXPAND');
 await p.waitForFunction(()=>document.querySelector('.expand-full-market-card .fmb-tab.has-data[data-fmb-book]'),null,{timeout:25000});
 await p.waitForTimeout(500);
 const expanded=await read();
 const selected=await p.evaluate(()=>{
  const board=document.querySelector('.board-sections'),doc=document.scrollingElement;
  const btn=document.querySelector('.expand-full-market-card .fmb-tab.has-data[data-fmb-book]');
  if(!btn)return null;
  const before={doc:doc.scrollTop,board:board.scrollTop};
  btn.click();return {book:btn.dataset.fmbBook,before};
 });
 assert(selected?.book,'NO_BOOKMAKER_TAB');
 await p.waitForFunction(()=>document.querySelector('.expand-full-market-card .fmb-panel:not([hidden]) .fmb-market'),null,{timeout:9000});
 await p.waitForTimeout(500);
 const opened=await read();
 const fullHeight=await p.evaluate(()=>document.querySelector('.expand-full-market-card')?.getBoundingClientRect().height);
 console.log('B46_SCROLL_FULLMARKET_ANCHOR '+JSON.stringify({clicked,expanded,selected,opened,fullHeight}));
 assert(fullHeight>200,'FULL_MARKET_NOT_RENDERED');
 assert(Math.abs(opened.doc-selected.before.doc)<3&&Math.abs(opened.board-selected.before.board)<3,'NATIVE_BOOKMAKER_CLICK_MOVED_SCROLL');
 console.log('B46_SCROLL_JITTER_GUARD_PASS '+JSON.stringify({overscroll:status.overscroll,outerWheelStayedPut:true,defaultOddsNoScrollJump:true,nativeBookmakerClickNoScrollJump:true,fullHeight,scope:'ISOLATED_TEST_ONLY'}));
 await p.screenshot({path:'qa-fullmarket-scroll-anchor.png'});
 await p.close();
} finally { await b.close() }