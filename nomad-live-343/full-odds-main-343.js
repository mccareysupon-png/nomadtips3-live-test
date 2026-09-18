(()=>{
'use strict';
const VERSION='343-full-odds-main-v8-ultra-19book';
const API='/api/full-market/fixture-odds';
const POLL_MS=15_000;
const CACHE_MS=12_000;
const STAGGER_MS=2_000;
const BOOKS=[
  {slug:'bet365',name:'Bet365',role:'MAIN'},
  {slug:'pinnacle',name:'Pinnacle',role:'REFEREE'},
  {slug:'williamhill',name:'William Hill',role:'EUROPE'},
  {slug:'ladbrokes',name:'Ladbrokes',role:'EUROPE'},
  {slug:'vcbet',name:'VCBet',role:'ASIA'},
  {slug:'1xbet',name:'1xBet',role:'GLOBAL'},
  {slug:'bwin',name:'Bwin',role:'EUROPE'},
  {slug:'easybets',name:'Easybets',role:'RESERVE'},
  {slug:'interwetten',name:'Interwetten',role:'EUROPE'},
  {slug:'betfair',name:'Betfair',role:'EXCHANGE'},
  {slug:'snai',name:'SNAI',role:'ITALY'},
  {slug:'macauslot',name:'Macau Slot',role:'EAST ASIA'},
  {slug:'betsson',name:'Betsson',role:'EUROPE'},
  {slug:'betathome',name:'Bet-at-home',role:'EUROPE'},
  {slug:'18bet',name:'18Bet',role:'ASIA'},
  {slug:'10bet',name:'10Bet',role:'GLOBAL'},
  {slug:'12bet',name:'12Bet',role:'ASIA'},
  {slug:'coral',name:'Coral',role:'EUROPE'},
  {slug:'crown',name:'Crown',role:'REFEREE ASIA'}
];
const LABELS={
  'asian_handicap':'Asian Handicap · Full Time','goal_line':'Goals O/U · Full Time','1x2':'1X2 · Full Time',
  'corner_line':'Corners O/U · Full Time','corner_asian':'Corner Asian Handicap',
  'card_line':'Cards O/U · Full Time','card_asian':'Card Asian Handicap','btts':'Both Teams To Score',
  'asian_handicap_half':'Asian Handicap · 1st Half','goal_line_half':'Goals O/U · 1st Half','1x2_half':'1X2 · 1st Half',
  'corner_line_half':'Corners O/U · 1st Half','corner_asian_half':'Corner Asian Handicap · 1st Half',
  'card_line_half':'Cards O/U · 1st Half','card_asian_half':'Card Asian Handicap · 1st Half'
};
const cache=new Map(),busy=new Set(),liveSnapshots=new Map();
let polling=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const norm=v=>String(v??'').toLowerCase().replace(/[\s_-]/g,'');
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const fmt=v=>{const n=num(v);if(n===null)return v===null||v===undefined||v===''?'—':String(v);return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)};
const signed=v=>{const n=num(v);if(n!==null){if(Object.is(n,-0)||n===0)return'0';return n>0?`+${fmt(n)}`:fmt(n)}const s=String(v??'').trim();if(!s)return'—';return s};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function invertLine(v){const n=num(v);if(n!==null)return n===0?0:-n;const s=String(v??'').trim();if(!s)return null;return s.startsWith('+')?`-${s.slice(1)}`:s.startsWith('-')?`+${s.slice(1)}`:s}
function team(card,side){const n=card.querySelectorAll('.team-name');return side==='home'?(n[0]?.textContent?.trim()||'HOME'):(n[1]?.textContent?.trim()||'AWAY')}
function providerBooks(payload){
  const full=payload?.fullOdds??payload?.data??payload;
  const raw=Array.isArray(full?.bookmakers)?full.bookmakers:Array.isArray(full?.data?.bookmakers)?full.data.bookmakers:[];
  const found=[];
  for(const book of BOOKS){
    const target=norm(book.slug),row=raw.find(x=>{const key=norm(x?.slug??x?.name??x?.bookmaker?.slug??x?.bookmaker?.name);return key===target||key.includes(target)||target.includes(key)});
    if(!row)continue;
    const odds=row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??{};
    if(!odds||typeof odds!=='object'||Array.isArray(odds))continue;
    found.push({...book,odds});
  }
  return found;
}
function canonicalMarket(key){
  const k=String(key??'').toLowerCase().replace(/[\s-]+/g,'_'),half=/(half|1st)/.test(k);
  if(k.startsWith('1x2'))return half?'1x2_half':'1x2';
  if(k.includes('corner')&&k.includes('asian'))return half?'corner_asian_half':'corner_asian';
  if(k.includes('card')&&k.includes('asian'))return half?'card_asian_half':'card_asian';
  if(k.includes('corner'))return half?'corner_line_half':'corner_line';
  if(k.includes('card'))return half?'card_line_half':'card_line';
  if(k.includes('asian')||k.includes('handicap'))return half?'asian_handicap_half':'asian_handicap';
  if(k.includes('goal')||k.includes('total')||k.includes('over_under'))return half?'goal_line_half':'goal_line';
  if(k==='btts'||k.includes('both_teams'))return'btts';
  return k;
}
function marketKind(key){if(key==='btts')return'BTTS';if(key.startsWith('1x2'))return'1X2';if(key.includes('asian'))return'AH';if(key.includes('goal_line')||key.includes('corner_line')||key.includes('card_line'))return'TOTAL';return'UNKNOWN'}
function rank(key){const order=['asian_handicap','goal_line','1x2','corner_line','corner_asian','card_line','card_asian','asian_handicap_half','goal_line_half','1x2_half','corner_line_half','corner_asian_half','card_line_half','card_asian_half','btts'];const i=order.indexOf(key);return i<0?99:i}
function collectMarkets(books){
  const map=new Map();
  for(const book of books)for(const [rawKey,value] of Object.entries(book.odds||{})){
    if(!value||typeof value!=='object')continue;
    const key=canonicalMarket(rawKey);if(marketKind(key)==='UNKNOWN')continue;
    if(!map.has(key))map.set(key,new Map());
    map.get(key).set(book.slug,value);
  }
  return [...map.entries()].sort((a,b)=>rank(a[0])-rank(b[0]));
}
function stages(market){if(!market||typeof market!=='object')return[];return [['OPEN',market.opening],['CLOSE',market.closing],['LIVE',market.inplay??market.in_play??market.live]].filter(([,v])=>v&&typeof v==='object')}
function ensureHost(card){const details=card?.querySelector('.event-details');if(!details)return null;let host=details.querySelector('[data-full-odds-main]');if(host)return host;host=document.createElement('div');host.dataset.fullOddsMain='1';host.className='fom-addon';const flow=details.querySelector('.nomad-event-flow-card'),stats=details.querySelector('.evidence-card');if(flow)flow.insertAdjacentElement('afterend',host);else if(stats)stats.insertAdjacentElement('afterend',host);else details.appendChild(host);return host}
function stageValueClass(stage,id,key,value,prev,next){if(stage!=='LIVE')return'';const text=String(value??'');next.set(key,text);const before=prev?.get(key);return ` fom-live-value${before!==undefined&&before!==text?' is-changed':''}`}
function priceText(line,price){const p=num(price);if(p===null||p<=0)return'—';return `${line===null||line===undefined||line===''?'':`${fmt(line)} @ `}${fmt(p)}`}
function ahText(line,price,away=false){const p=num(price);if(p===null||p<=0)return'—';const own=away?invertLine(line):line;return `${own===null||own===undefined||own===''?'':`${signed(own)} @ `}${fmt(p)}`}
function stageRowHtml(kind,stage,value,id,bookSlug,marketKey,prev,next){
  const stageCell=`<span class="fom-stage-label${stage==='LIVE'?' live':''}">${stage==='LIVE'?'<i></i> LIVE':esc(stage)}</span>`;
  if(kind==='AH'){
    const line=value.line??value.hdp??value.handicap,home=ahText(line,value.home??value.home_odds??value.homeOdds,false),away=ahText(line,value.away??value.away_odds??value.awayOdds,true);if(home==='—'&&away==='—')return'';
    return `<div class="fom-price-row cols-ah">${stageCell}<strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|home`,home,prev,next)}">${esc(home)}</strong><strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|away`,away,prev,next)}">${esc(away)}</strong></div>`;
  }
  if(kind==='1X2'){
    const h=num(value.home)>0?fmt(value.home):'—',d=num(value.draw)>0?fmt(value.draw):'—',a=num(value.away)>0?fmt(value.away):'—';if(h==='—'&&d==='—'&&a==='—')return'';
    return `<div class="fom-price-row cols-1x2">${stageCell}<strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|home`,h,prev,next)}">${esc(h)}</strong><strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|draw`,d,prev,next)}">${esc(d)}</strong><strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|away`,a,prev,next)}">${esc(a)}</strong></div>`;
  }
  if(kind==='TOTAL'){
    const line=value.line??value.total,over=priceText(line,value.over??value.over_odds??value.overOdds),under=priceText(line,value.under??value.under_odds??value.underOdds);if(over==='—'&&under==='—')return'';
    return `<div class="fom-price-row cols-total">${stageCell}<strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|over`,over,prev,next)}">${esc(over)}</strong><strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|under`,under,prev,next)}">${esc(under)}</strong></div>`;
  }
  if(kind==='BTTS'){
    const yes=num(value.yes)>0?fmt(value.yes):'—',no=num(value.no)>0?fmt(value.no):'—';if(yes==='—'&&no==='—')return'';
    return `<div class="fom-price-row cols-total">${stageCell}<strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|yes`,yes,prev,next)}">${esc(yes)}</strong><strong class="fom-price${stageValueClass(stage,id,`${bookSlug}|${marketKey}|no`,no,prev,next)}">${esc(no)}</strong></div>`;
  }
  return'';
}
function columnHead(kind,home,away){if(kind==='AH')return `<div class="fom-colhead cols-ah"><span>STAGE</span><b>${esc(home)}</b><b>${esc(away)}</b></div>`;if(kind==='1X2')return `<div class="fom-colhead cols-1x2"><span>STAGE</span><b>${esc(home)}</b><b>DRAW</b><b>${esc(away)}</b></div>`;if(kind==='BTTS')return `<div class="fom-colhead cols-total"><span>STAGE</span><b>YES</b><b>NO</b></div>`;return `<div class="fom-colhead cols-total"><span>STAGE</span><b>OVER</b><b>UNDER</b></div>`}
function marketHtml(marketKey,bookMarkets,card,id,prev,next){
  const kind=marketKind(marketKey),home=team(card,'home'),away=team(card,'away'),bookRows=[];
  for(const book of BOOKS){const market=bookMarkets.get(book.slug);if(!market)continue;const rows=stages(market).map(([stage,value])=>stageRowHtml(kind,stage,value,id,book.slug,marketKey,prev,next)).filter(Boolean);if(!rows.length)continue;bookRows.push(`<section class="fom-book" data-book="${esc(book.slug)}"><header><b>${esc(book.name)}</b><small>${esc(book.role)}</small></header>${rows.join('')}</section>`)}
  if(!bookRows.length)return'';
  const title=LABELS[marketKey]||marketKey.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  return `<section class="fom-market"><header class="fom-market-head"><div><b>${esc(title)}</b><small>${kind==='AH'?'Signed handicap shown on each team side':kind==='1X2'?'Home · Draw · Away':'Line + decimal price'}</small></div><span>${bookRows.length} BOOKS</span></header>${columnHead(kind,home,away)}<div class="fom-books">${bookRows.join('')}</div></section>`;
}
function sourceText(payload,books){const active=books.filter(b=>Object.keys(b.odds||{}).length).length;const state=payload?.stale?'STALE CACHE':'LIVE FEED';return `${active}/${BOOKS.length} BOOKS · ${state}`}
function render(card,payload){
  const host=ensureHost(card);if(!host)return;
  const id=String(card?.dataset?.matchId||''),books=providerBooks(payload),markets=collectMarkets(books),home=team(card,'home'),away=team(card,'away'),prev=liveSnapshots.get(id)||new Map(),next=new Map();
  const rows=markets.map(([k,v])=>marketHtml(k,v,card,id,prev,next)).filter(Boolean);if(next.size)liveSnapshots.set(id,next);
  const count=rows.length?`${sourceText(payload,books)} · ${rows.length} MARKETS`:'ODDS —';
  if(!rows.length){host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 19 BOOKS</b><small>${esc(home)} vs ${esc(away)} · 5USD ULTRA</small></div><span class="fom-count muted">${esc(count)}</span></div><div class="fom-empty">Full market prices unavailable for this fixture</div></section>`;return}
  host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 19 BOOKS</b><small>Home left · away right · prices refresh while expanded</small></div><span class="fom-count${payload?.stale?' muted':''}">${esc(count)}</span></div><div class="fom-grid">${rows.join('')}</div></section>`;
}
function loading(card){const host=ensureHost(card);if(host)host.innerHTML='<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 19 BOOKS</b><small>Loading live full-market prices</small></div><span class="fom-count muted">LOADING</span></div></section>'}
async function fetchPayload(id){const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${Date.now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true)throw Object.assign(new Error(j?.error||`HTTP_${r.status}`),{status:r.status,retryAfter:j?.retryAfterSec});return j}
async function load(card,force=false){
  const id=String(card?.dataset?.matchId||'');if(!id||busy.has(id))return;
  const hit=cache.get(id);if(!force&&hit&&Date.now()-hit.at<CACHE_MS){render(card,hit.data);return}
  busy.add(id);if(!hit)loading(card);
  try{const data=await fetchPayload(id);cache.set(id,{at:Date.now(),data});if(card?.isConnected)render(card,data)}
  catch(e){if(hit?.data){if(card?.isConnected)render(card,{...hit.data,stale:true,clientStale:true});return}const host=ensureHost(card);if(host)host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 19 BOOKS</b><small>${esc(String(e?.message||e))}</small></div><span class="fom-count muted">ODDS —</span></div><div class="fom-empty">Waiting for full-market prices; partial bulk odds are not substituted.</div></section>`}
  finally{busy.delete(id)}
}
function afterToggle(card){setTimeout(()=>{if(card?.getAttribute('aria-expanded')==='true')load(card)},0)}
function hydrateAdded(node){if(node?.nodeType!==1)return;if(node.matches?.('.match-card[data-match-id][aria-expanded="true"]'))load(node);node.querySelectorAll?.('.match-card[data-match-id][aria-expanded="true"]').forEach(load)}
async function pollExpanded(){if(document.visibilityState!=='visible'||polling)return;polling=true;try{const cards=[...document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]')];for(let i=0;i<cards.length;i++){await load(cards[i],true);if(i<cards.length-1)await sleep(STAGGER_MS)}}finally{polling=false}}
function injectStyle(){
  if(document.getElementById('nomad343-full-odds-main'))return;
  const s=document.createElement('style');s.id='nomad343-full-odds-main';
  s.textContent=`.fom-addon{display:grid;gap:8px;margin:8px 0 9px}.fom-board{background:#0b120e;border:1px solid #2b3a30;min-width:0}.fom-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border-bottom:1px solid #28362c}.fom-head>div{display:grid;gap:2px;min-width:0}.fom-head b{font-size:11px;color:#eef7f0}.fom-head small{font-size:8px;color:#7f8d83}.fom-count{font-size:8px;font-weight:900;color:#7dff9d;border:1px solid #295a38;padding:3px 6px;background:#0d2014;white-space:nowrap}.fom-count.muted{color:#8c978f;border-color:#344039;background:#111713}.fom-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:8px;padding:8px}.fom-market{border:1px solid #26352b;background:#101813;min-width:0}.fom-market-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 9px;border-bottom:1px solid #26352b;background:#111b15}.fom-market-head>div{display:grid;gap:1px}.fom-market-head b{font-size:9px;color:#e5eee8}.fom-market-head small{font-size:7px;color:#6f7f75}.fom-market-head>span{font-size:7px;color:#f1c75b;font-weight:900}.fom-colhead,.fom-price-row{display:grid;align-items:center}.cols-ah,.cols-total{grid-template-columns:52px minmax(0,1fr) minmax(0,1fr)}.cols-1x2{grid-template-columns:52px minmax(0,1fr) minmax(48px,.58fr) minmax(0,1fr)}.fom-colhead{min-height:32px;border-bottom:1px solid #26352b;background:#0d1510}.fom-colhead>*{padding:5px 7px}.fom-colhead span{font-size:6px;color:#65736a}.fom-colhead b{font-size:7px;color:#aab7ae;text-align:center}.fom-book{border-bottom:1px solid #25332a}.fom-book>header{display:flex;align-items:center;gap:7px;padding:5px 7px;background:#121c16}.fom-book>header b{font-size:8px;color:#f0f5f1}.fom-book>header small{font-size:6px;color:#8f9b93;border:1px solid #35443a;padding:1px 4px}.fom-book[data-book="bet365"]>header b{color:#f1c75b}.fom-price-row{min-height:30px;border-top:1px solid rgba(255,255,255,.035)}.fom-price-row>*{padding:5px 7px}.fom-stage-label{font-size:6px;font-weight:800;color:#68766d}.fom-stage-label.live{display:flex;align-items:center;gap:4px;color:#6dff92}.fom-stage-label.live i{width:5px;height:5px;border-radius:50%;background:#56ef7b}.fom-price{font-size:9px;color:#e7efe9;font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fom-live-value{color:#72ff98}.fom-live-value.is-changed{background:rgba(83,255,128,.18)}.fom-empty{padding:14px;text-align:center;color:#7d8981;font-size:9px}@media(max-width:1120px){.fom-grid{grid-template-columns:1fr}}@media(max-width:760px){.fom-grid{grid-template-columns:1fr;padding:6px}.fom-head{padding:9px 8px}.cols-ah,.cols-total{grid-template-columns:43px minmax(0,1fr) minmax(0,1fr)}.cols-1x2{grid-template-columns:43px minmax(0,1fr) 42px minmax(0,1fr)}.fom-price{font-size:8px}.fom-market-head small{display:none}}`;
  document.head.appendChild(s)
}
function start(){
  injectStyle();
  document.addEventListener('click',e=>{const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  const mo=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)hydrateAdded(n)});
  document.querySelectorAll('.match-stack').forEach(root=>mo.observe(root,{childList:true,subtree:true}));
  pollExpanded();
  setInterval(pollExpanded,POLL_MS);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pollExpanded()});
  window.NOMAD343_FULL_ODDS_MAIN={version:VERSION,books:BOOKS.map(x=>({...x})),reload:id=>{cache.delete(String(id));const card=document.querySelector(`.match-card[data-match-id="${CSS.escape(String(id))}"]`);if(card)load(card,true)}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
