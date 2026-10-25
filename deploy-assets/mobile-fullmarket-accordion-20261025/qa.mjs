import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const load=async name=>readFile(new URL(name,import.meta.url),'utf8');
const source=await load('./audit/public/full-market-bookmaker-343.js');
const mobile=await load('./mobile-accordion.js');
const marketFixture={
 fixtureId:'202207202',
 providerOdds:{bookmakers:[
  {slug:'bet365',name:'Bet365',odds:{
   '1x2':{opening:{home:1.95,draw:3.60,away:3.50},closing:{home:2.25,draw:3.60,away:2.90},inplay:{home:5.50,draw:3.40,away:1.73}},
   asian_handicap:{opening:{line:-0.5,home:1.98,away:1.82},closing:{line:-0.25,home:1.98,away:1.82},inplay:{line:-0.25,home:1.75,away:2.05}},
   goal_line:{opening:{line:2.75,over:1.98,under:1.82},closing:{line:3,over:2.02,under:1.77},inplay:{line:2.5,over:2.02,under:1.77}}
  }},
  {slug:'pinnacle',name:'Pinnacle',odds:{
   '1x2':{opening:{home:2.11,draw:3.25,away:3.01},inplay:{home:4.20,draw:2.90,away:1.91}}
  }}
 ]}
};
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setTimeout(resolve,0));};
function makeDom(isMobile){
 const d=new JSDOM('<!doctype html><html><head></head><body><div class="match-expanded" data-expanded-match="202207202"><section class="expand-full-market-card" data-full-market-card><div class="fmb-tabs"><button data-fmb-book="bet365" aria-pressed="true">Bet365</button><button data-fmb-book="pinnacle" aria-pressed="false">Pinnacle</button></div><div class="fmb-panel"></div></section></div></body></html>',{url:'https://ball46.com/',runScripts:'outside-only',pretendToBeVisual:true});
 d.window.matchMedia=()=>({matches:isMobile,media:'(max-width:760px)',addEventListener(){}});
 let requests=0;
 d.window.fetch=()=>{requests++;throw Error('UNEXPECTED_FETCH')};
 d.window.eval(source);
 d.window.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
 const provider=d.window.NOMAD343_FULL_MARKET_BOOKMAKER;
 assert(provider&&provider.networkMode==='NONE','LIVE_MARKET_RENDERER_MISSING');
 const root=d.window.document.querySelector('[data-full-market-card]');
 const panel=root.querySelector('.fmb-panel');
 panel.innerHTML=provider.renderBookHtml(marketFixture,'bet365');
 return {d,root,panel,provider,requests:()=>requests};
}
const mobileTest=makeDom(true);
mobileTest.d.window.eval(mobile);
await flush();
const cards=[...mobileTest.panel.querySelectorAll('.fmb-market')];
assert(cards.length>=3,'MISSING_MARKET_CARDS');
assert(cards.every(c=>c.getAttribute('data-b46-fm-open')==='false'),'NOT_INITIALLY_COLLAPSED');
assert(cards.every(c=>c.querySelector('.b46-mobile-fm-toggle')),'TOGGLE_MISSING');
const row=cards.find(c=>c.dataset.market==='1x2');
assert(row,'1X2_NOT_FOUND');
assert(row.querySelector('.b46-mobile-fm-summary').textContent.includes('5.50'),'LIVE_PRICE_NOT_IN_SUMMARY');
row.querySelector('.b46-mobile-fm-toggle').click();
assert.equal(row.dataset.b46FmOpen,'true');
const other=cards.find(c=>c.dataset.market==='asian_handicap');
other.querySelector('.b46-mobile-fm-toggle').click();
assert.equal(row.dataset.b46FmOpen,'false','MULTIPLE_MARKETS_OPEN');
assert.equal(other.dataset.b46FmOpen,'true');
assert.equal(mobileTest.requests(),0,'ACCORDION_FETCHED_API');
// A renderer refresh replaces the bookmaker panel. Accordion re-hydrates using current DOM only.
mobileTest.panel.innerHTML=mobileTest.provider.renderBookHtml(marketFixture,'bet365');
await flush();
const restored=mobileTest.panel.querySelector('.fmb-market[data-market="asian_handicap"]');
assert.equal(restored.dataset.b46FmOpen,'true','LOST_OPEN_MARKET_ON_REFRESH');
// Switching bookmakers must never mix prices or markets.
mobileTest.root.querySelector('[data-fmb-book="bet365"]').setAttribute('aria-pressed','false');
mobileTest.root.querySelector('[data-fmb-book="pinnacle"]').setAttribute('aria-pressed','true');
mobileTest.panel.innerHTML=mobileTest.provider.renderBookHtml(marketFixture,'pinnacle');
await flush();
const pinn=mobileTest.panel.querySelector('.fmb-market[data-market="1x2"]');
assert(pinn.querySelector('.b46-mobile-fm-summary').textContent.includes('4.20'),'STALE_BOOKMAKER_SUMMARY');
assert.equal(pinn.dataset.b46FmOpen,'false','BOOKMAKER_DEFAULT_NOT_COLLAPSED');
assert.equal(mobileTest.requests(),0,'BOOK_SWITCH_ACCORDION_FETCHED');
const pc=makeDom(false);
pc.d.window.eval(mobile);
await flush();
assert.equal(pc.panel.querySelectorAll('.b46-mobile-fm-toggle').length,0,'PC_DOM_MODIFIED');
assert.equal(pc.requests(),0);
console.log('PASS: verified live FMB markup, mobile collapse/expand, snapshot LIVE prices, refresh state, bookmaker isolation, no click GET, desktop untouched');
