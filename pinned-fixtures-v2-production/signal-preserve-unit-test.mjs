import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){
 const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result;
}
const dep=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const av=dep.deployments?.[0]?.versions;assert(av?.length===1&&Number(av[0].percentage)===100,'ACTIVE_NOT_SINGLE');
const active=av[0].version_id;
const v=await api('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
const dash=v.modules.find(x=>x.name==='screen-refresh-5s-20261104.txt');assert(dash,'DASH_MODULE_MISSING');
const src=Buffer.from(dash.content_base64,'base64').toString('utf8');

const old="if(pinned.length){structure.push(['pinned',pinned.length,1,pinned.map(fixtureKey)]);html.push('<section class=\"status-section b46-pin-v2-section\" data-status-section=\"pinned\"><header class=\"status-head\"><div><i class=\"status-dot upcoming\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header><section class=\"league-block\">'+pinned.map(rowHtml).join('')+'</section></section>')}";
const neu="if(pinned.length){const pinnedGroups=groupByLeague(pinned);structure.push(['pinned',pinned.length,1,pinnedGroups.map(([league,list])=>[league,list.map(fixtureKey)])]);html.push('<section class=\"status-section b46-pin-v2-section\" data-status-section=\"pinned\"><header class=\"status-head\"><div><i class=\"status-dot upcoming\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header>'+pinnedGroups.map(([league,list])=>'<section class=\"league-block\"><header class=\"league-head\"><strong>'+esc(league)+'</strong><span>'+list.length+' match'+(list.length===1?'':'es')+'</span></header>'+list.map(rowHtml).join('')+'</section>').join('')+'</section>')}";

assert.equal(src.split(old).length-1,1,'ACTIVE_PINNED_RENDER_ANCHOR_COUNT');
const patched=src.replace(old,neu);
assert.notEqual(patched,src,'NO_PATCH_CHANGE');
assert(patched.includes('const pinnedGroups=groupByLeague(pinned)'),'GROUPED_PIN_MARKER_MISSING');
assert(!patched.includes("<section class=\"league-block\">'+pinned.map(rowHtml).join('')"),'FLAT_PIN_BLOCK_STILL_PRESENT');
new Function(patched);

// This hotfix is markup/order only: no network behavior changes.
const fetchBefore=(src.match(/fetch\s*\(/g)||[]).length;
const fetchAfter=(patched.match(/fetch\s*\(/g)||[]).length;
assert.equal(fetchAfter,fetchBefore,'FETCH_CALL_SITE_COUNT_CHANGED');

// Exact current badge-render behavior that caused the bug.
function renderLeagueSignalBadges(window){
 const board=window.document.querySelector('.board-sections');
 for(const block of board.querySelectorAll('.league-block')){
   const row=block.querySelector(':scope > .match-row'),head=block.querySelector(':scope > .league-head');
   if(!row||!head)continue;
   const box=row.getBoundingClientRect();if(!box.width||!box.height)continue;
   const cs=window.getComputedStyle(row);
   if(!head.dataset.b46MarketHeaderHeight)head.dataset.b46MarketHeaderHeight=String(head.getBoundingClientRect().height);
   head.style.setProperty('--b46-league-market-columns',cs.gridTemplateColumns);
   head.style.setProperty('--b46-league-market-gap',cs.columnGap);
   head.style.setProperty('--b46-league-market-inset',cs.paddingLeft);
   head.style.setProperty('--b46-league-market-header-height',head.dataset.b46MarketHeaderHeight+'px');
   head.classList.add('b46-league-market-header');
   for(const r of block.querySelectorAll(':scope > .match-row')){
     if(r.dataset.b46MarketCompact!=='1'){
       const h=r.getBoundingClientRect().height;if(!h)continue;
       r.style.setProperty('--b46-league-market-row-height',h+'px');r.dataset.b46MarketCompact='1';
     }
     const host=r.querySelector('.signal-inline-stack');if(!host)continue;
     const n=Number(host.dataset.inlineSignalCount);
     let badge=host.querySelector(':scope > .b46-league-market-signal-count');
     if(!Number.isInteger(n)||n<=0){badge?.remove();continue;}
     if(!badge){badge=window.document.createElement('span');badge.className='b46-league-market-signal-count';badge.innerHTML='<i aria-hidden="true"></i><b></b><span></span>';host.append(badge);}
     const number=String(n),label=n===1?'Signal':'Signals';
     if(badge.children[1].textContent!==number)badge.children[1].textContent=number;
     if(badge.children[2].textContent!==label)badge.children[2].textContent=label;
     const accessible=number+' active '+label.toLowerCase();
     if(badge.getAttribute('aria-label')!==accessible)badge.setAttribute('aria-label',accessible);
   }
 }
}

function makeDom(grouped){
 const leagueHead=grouped?'<header class="league-head"><strong>Premier League</strong><span>1 match</span></header>':'';
 const html='<div class="board-sections"><section class="status-section b46-pin-v2-section" data-status-section="pinned"><header class="status-head"><h2>PINNED MATCHES</h2></header><section class="league-block">'+leagueHead+'<article class="match-row" data-match-id="fixture-123"><div class="signal-inline-stack" data-inline-signal-count="2"><div class="signal-cell prediction-live">AH HOME</div></div></article></section></section></div>';
 const dom=new JSDOM(html,{pretendToBeVisual:true});
 Object.defineProperty(dom.window.HTMLElement.prototype,'getBoundingClientRect',{configurable:true,value(){return {x:0,y:0,left:0,top:0,right:600,bottom:48,width:600,height:48}}});
 return dom;
}

function model(dom){
 const el=dom.window.document.querySelector('.match-row');
 const raw=el.querySelector('.signal-inline-stack[data-inline-signal-count]')?.getAttribute('data-inline-signal-count');
 const n=Number(raw);
 return {
   id:el.getAttribute('data-match-id'),
   league:el.closest('.league-block')?.querySelector('.league-head strong')?.textContent?.trim()||'Football',
   signalCount:Number.isSafeInteger(n)&&n>0?n:0
 };
}

// Reproduce current bug.
const oldDom=makeDom(false);
renderLeagueSignalBadges(oldDom.window);
assert.equal(oldDom.window.document.querySelector('.b46-league-market-signal-count'),null,'OLD_BUG_NOT_REPRODUCED');
const oldModel=model(oldDom);
assert.equal(oldModel.signalCount,2,'OLD_SIGNAL_DATA_SHOULD_STILL_EXIST');
assert.equal(oldModel.league,'Football','OLD_MISSING_LEAGUE_HEAD_NOT_REPRODUCED');

// Verify proposed grouped pinned structure with the unchanged native badge renderer.
const newDom=makeDom(true);
renderLeagueSignalBadges(newDom.window);
const badge=newDom.window.document.querySelector('.b46-league-market-signal-count');
assert(badge,'NEW_BADGE_NOT_CREATED');
assert.equal(badge.children[1].textContent,'2','NEW_BADGE_COUNT');
assert.equal(badge.children[2].textContent,'Signals','NEW_BADGE_LABEL');
assert.equal(badge.getAttribute('aria-label'),'2 active signals','NEW_BADGE_ARIA');
const newModel=model(newDom);
assert.equal(newModel.id,oldModel.id,'FIXTURE_ID_CHANGED');
assert.equal(newModel.signalCount,oldModel.signalCount,'SIGNAL_COUNT_CHANGED');
assert.equal(newModel.league,'Premier League','LEAGUE_NOT_PRESERVED');
assert.equal(newDom.window.document.querySelectorAll('.match-row[data-match-id="fixture-123"]').length,1,'DUPLICATE_CARD_CREATED');

console.log('ACTIVE_VERSION='+active);
console.log('CURRENT_BUG_REPRODUCED=1');
console.log('PATCH_SYNTAX_PASS=1');
console.log('FETCH_CALL_SITES_UNCHANGED=1');
console.log('SAME_FIXTURE_ID=1');
console.log('NO_DUPLICATE_CARD=1');
console.log('SIGNAL_COUNT_PRESERVED=1');
console.log('SIGNAL_BADGE_PRESERVED=1');
console.log('LEAGUE_CONTEXT_PRESERVED=1');
console.log('PIN_V2_SIGNAL_FIX_TEST_PASS=1');
