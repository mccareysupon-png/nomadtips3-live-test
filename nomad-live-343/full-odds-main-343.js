(()=>{
'use strict';
const VERSION='343-full-odds-main-v5-ultra-10book';
const API='/api/full-market/fixture-odds';
const FALLBACK_API='/api/engine/fixture-odds';
const POLL_MS=15_000;
const CACHE_MS=12_000;
const BOOKS=[
  {slug:'bet365',name:'Bet365',role:'MAIN'},
  {slug:'pinnacle',name:'Pinnacle',role:'REFEREE'},
  {slug:'crown',name:'Crown',role:'REFEREE ASIA'},
  {slug:'1xbet',name:'1xBet',role:'GLOBAL MASS'},
  {slug:'12bet',name:'12Bet',role:'ASIA'},
  {slug:'interwetten',name:'Interwetten',role:'EUROPE'},
  {slug:'macauslot',name:'Macau Slot',role:'EAST ASIA'},
  {slug:'18bet',name:'18Bet',role:'ASIA #2'},
  {slug:'vcbet',name:'VCBet',role:'RESERVE'},
  {slug:'easybets',name:'Easybets',role:'RESERVE'}
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
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').toLowerCase().replace(/[\s_-]/g,'');
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const fmt=v=>{const n=num(v);if(n===null)return v===null||v===undefined||v===''?'—':String(v);return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)};
const signed=v=>{const n=num(v);if(n!==null){if(Object.is(n,-0)||n===0)return'0';return n>0?`+${fmt(n)}`:fmt(n)}const s=String(v??'').trim();if(!s)return'—';return s};
function invertLine(v){
  const n=num(v);if(n!==null)return n===0?0:-n;
  const s=String(v??'').trim();if(!s)return null;
  if(s.includes('/'))return s.split('/').map(x=>{const q=num(x.trim());return q===null?x.trim():signed(-q)}).join('/');
  return s.startsWith('+')?`-${s.slice(1)}`:s.startsWith('-')?`+${s.slice(1)}`:s;
}
function team(card,side){const n=card.querySelectorAll('.team-name');return side==='home'?(n[0]?.textContent?.trim()||'HOME'):(n[1]?.textContent?.trim()||'AWAY')}
function looksLikeMarketRoot(v){if(!v||typeof v!=='object'||Array.isArray(v))return false;return Object.keys(v).some(k=>/1x2|asian|goal|corner|card|btts/i.test(k))}
function providerBooks(payload){
  const full=payload?.fullOdds??payload?.data??payload;
  const candidates=[full?.data?.bookmakers,full?.bookmakers,payload?.bookmakers,payload?.data?.bookmakers];
  let raw=candidates.find(Array.isArray)||[];
  if(!raw.length){
    const roots=[full?.data,full,payload?.data,payload].filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
    for(const root of roots){
      const keyed=[];
      for(const book of BOOKS){const hit=root[book.slug]??root[book.name]??root[book.name.toLowerCase()];if(hit&&typeof hit==='object')keyed.push({slug:book.slug,name:book.name,...hit})}
      if(keyed.length){raw=keyed;break}
    }
  }
  if(!raw.length&&looksLikeMarketRoot(full))raw=[{slug:'bet365',name:'Bet365',odds:full}];
  const found=[];
  for(const book of BOOKS){
    const target=norm(book.slug),row=raw.find(x=>{const key=norm(x?.slug??x?.bookmaker?.slug??x?.name??x?.bookmaker?.name);return key===target||key.includes(target)||target.includes(key)});
    if(!row)continue;
    const odds=row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row;
    if(!odds||typeof odds!=='object'||Array.isArray(odds))continue;
    found.push({...book,odds});
  }
  return found;
}
function canonicalMarket(key){
  const k=String(key??'').toLowerCase().replace(/[\s-]+/g,'_');
  const half=/(half|1st)/.test(k);
  if(k==='corner_asian'||k==='corners_asian'||k==='corner_handicap'||k==='corner_asian_handicap')return half?'corner_asian_half':'corner_asian';
  if(k==='card_asian'||k==='cards_asian'||k==='card_handicap'||k==='card_asian_handicap')return half?'card_asian_half':'card_asian';
  if(k.startsWith('corner')&&!k.includes('asian'))return half?'corner_line_half':'corner_line';
  if((k.startsWith('card')||k.startsWith('cards'))&&!k.includes('asian'))return half?'card_line_half':'card_line';
  if(k.startsWith('1x2'))return half?'1x2_half':'1x2';
  if(k==='asian'||k.startsWith('asian_handicap')||k==='handicap')return half?'asian_handicap_half':'asian_handicap';
  if(k.startsWith('goal')||k==='goalline'||k==='total_goals'||k==='goals_over_under')return half?'goal_line_half':'goal_line';
  if(k==='btts'||k.includes('both_teams_to_score'))return'btts';
  return k;
}
function marketKind(key){if(key==='btts')return'BTTS';if(key.startsWith('1x2'))return'1X2';if(key.includes('asian'))return'AH';if(key.includes('goal_line')||key.includes('corner_line')||key.includes('card_line'))return'TOTAL';return'UNKNOWN'}
function rank(key){
  const half=key.includes('_half');
  let base=90;
  if(key==='asian_handicap')base=0;else if(key==='goal_line')base=10;else if(key==='1x2')base=20;
  else if(key==='corner_line')base=30;else if(key==='corner_asian')base=31;else if(key==='card_line')base=40;else if(key==='card_asian')base=41;
  else if(half){const bare=key.replace('_half','');if(bare==='asian_handicap')base=50;else if(bare==='goal_line')base=51;else if(bare==='1x2')base=52;else if(bare==='corner_line')base=53;else if(bare==='corner_asian')base=54;else if(bare==='card_line')base=55;else if(bare==='card_asian')base=56}
  else if(key==='btts')base=80;
  return base;
}
function mergeMarket(a,b){if(!a)return b;if(!b)return a;if(typeof a!=='object'||typeof b!=='object')return b;return {...a,...b}}
function collectMarkets(books){
  const map=new Map();
  for(const book of books){
    for(const [rawKey,value] of Object.entries(book.odds||{})){
      if(!value||typeof value!=='object')continue;
      const key=canonicalMarket(rawKey);if(marketKind(key)==='UNKNOWN')continue;
      if(!map.has(key))map.set(key,new Map());
      const rows=map.get(key);rows.set(book.slug,mergeMarket(rows.get(book.slug),value));
    }
  }
  return [...map.entries()].sort((a,b)=>rank(a[0])-rank(b[0]));
}
function stages(market){
  if(!market||typeof market!=='object')return[];
  const rows=[['opening','OPEN',market.opening],['closing','CLOSE',market.closing],['inplay','LIVE',market.inplay??market.in_play??market.live]];
  return rows.filter(([, ,v])=>v&&typeof v==='object');
}
function ensureHost(card){
  const details=card?.querySelector('.event-details');if(!details)return null;
  let host=details.querySelector('[data-full-odds-main]');if(host)return host;
  host=document.createElement('div');host.dataset.fullOddsMain='1';host.className='fom-addon';
  const flow=details.querySelector('.nomad-event-flow-card'),stats=details.querySelector('.evidence-card');
  if(flow)flow.insertAdjacentElement('afterend',host);else if(stats)stats.insertAdjacentElement('afterend',host);else details.appendChild(host);
  return host;
}
function stageValueClass(stage,fixtureId,key,value,prev,next){
  if(stage!=='LIVE')return'';
  const text=String(value??'');next.set(key,text);
  const before=prev?.get(key);
  return ` fom-live-value${before!==undefined&&before!==text?' is-changed':''}`;
}
function priceText(line,price){const p=num(price);if(p===null)return'—';return `${line===null||line===undefined||line===''?'':`${fmt(line)} @ `}${fmt(p)}`}
function ahText(line,price,away=false){const p=num(price);if(p===null)return'—';const own=away?invertLine(line):line;return `${own===null||own===undefined||own===''?'':`${signed(own)} @ `}${fmt(p)}`}
function stageRowHtml(kind,stageLabel,value,fixtureId,bookSlug,marketKey,prev,next){
  const live=stageLabel==='LIVE',stageKey=live?'live':stageLabel.toLowerCase();
  const stageCell=`<span class="fom-stage-label${live?' live':''}">${live?'<i></i> LIVE':esc(stageLabel)}</span>`;
  if(kind==='AH'){
    const line=value.line??value.hdp??value.handicap;
    const home=ahText(line,value.home??value.home_odds??value.homeOdds,false),away=ahText(line,value.away??value.away_odds??value.awayOdds,true);
    if(home==='—'&&away==='—')return'';
    const hc=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|home`,home,prev,next),ac=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|away`,away,prev,next);
    return `<div class="fom-price-row cols-ah">${stageCell}<strong class="fom-price${hc}">${esc(home)}</strong><strong class="fom-price${ac}">${esc(away)}</strong></div>`;
  }
  if(kind==='1X2'){
    const h=fmt(value.home),d=fmt(value.draw),a=fmt(value.away);if(h==='—'&&d==='—'&&a==='—')return'';
    const hc=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|home`,h,prev,next),dc=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|draw`,d,prev,next),ac=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|away`,a,prev,next);
    return `<div class="fom-price-row cols-1x2">${stageCell}<strong class="fom-price${hc}">${esc(h)}</strong><strong class="fom-price${dc}">${esc(d)}</strong><strong class="fom-price${ac}">${esc(a)}</strong></div>`;
  }
  if(kind==='TOTAL'){
    const line=value.line??value.total;
    const over=priceText(line,value.over??value.over_odds??value.overOdds),under=priceText(line,value.under??value.under_odds??value.underOdds);if(over==='—'&&under==='—')return'';
    const oc=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|over`,over,prev,next),uc=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|under`,under,prev,next);
    return `<div class="fom-price-row cols-total">${stageCell}<strong class="fom-price${oc}">${esc(over)}</strong><strong class="fom-price${uc}">${esc(under)}</strong></div>`;
  }
  if(kind==='BTTS'){
    const yes=fmt(value.yes),no=fmt(value.no);if(yes==='—'&&no==='—')return'';
    const yc=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|yes`,yes,prev,next),nc=stageValueClass(stageLabel,fixtureId,`${bookSlug}|${marketKey}|no`,no,prev,next);
    return `<div class="fom-price-row cols-total">${stageCell}<strong class="fom-price${yc}">${esc(yes)}</strong><strong class="fom-price${nc}">${esc(no)}</strong></div>`;
  }
  return'';
}
function columnHead(kind,home,away){
  if(kind==='AH')return `<div class="fom-colhead cols-ah"><span>STAGE</span><b title="${esc(home)}">${esc(home)}</b><b title="${esc(away)}">${esc(away)}</b></div>`;
  if(kind==='1X2')return `<div class="fom-colhead cols-1x2"><span>STAGE</span><b title="${esc(home)}">${esc(home)}</b><b>DRAW</b><b title="${esc(away)}">${esc(away)}</b></div>`;
  if(kind==='BTTS')return `<div class="fom-colhead cols-total"><span>STAGE</span><b>YES</b><b>NO</b></div>`;
  return `<div class="fom-colhead cols-total"><span>STAGE</span><b>OVER</b><b>UNDER</b></div>`;
}
function marketHtml(marketKey,bookMarkets,card,fixtureId,prev,next){
  const kind=marketKind(marketKey),home=team(card,'home'),away=team(card,'away'),bookRows=[];
  for(const book of BOOKS){
    const market=bookMarkets.get(book.slug);if(!market)continue;
    const priceRows=stages(market).map(([,label,value])=>stageRowHtml(kind,label,value,fixtureId,book.slug,marketKey,prev,next)).filter(Boolean);
    if(!priceRows.length)continue;
    bookRows.push(`<section class="fom-book" data-book="${esc(book.slug)}"><header><b>${esc(book.name)}</b><small>${esc(book.role)}</small></header>${priceRows.join('')}</section>`);
  }
  if(!bookRows.length)return'';
  const title=LABELS[marketKey]||String(marketKey).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  return `<section class="fom-market"><header class="fom-market-head"><div><b>${esc(title)}</b><small>${kind==='AH'?'Signed handicap shown on each team side':kind==='1X2'?'Home · Draw · Away':'Line + decimal price'}</small></div><span>${bookRows.length} BOOKS</span></header>${columnHead(kind,home,away)}<div class="fom-books">${bookRows.join('')}</div></section>`;
}
function sourceText(payload,books){if(payload?.fallbackOnly)return'BET365 FALLBACK';if(payload?.stale)return`${books.length}/10 BOOKS · STALE CACHE`;return`${books.length}/10 BOOKS · LIVE FEED`}
function render(card,payload){
  const host=ensureHost(card);if(!host)return;
  const id=String(card?.dataset?.matchId||''),books=providerBooks(payload),markets=collectMarkets(books),home=team(card,'home'),away=team(card,'away');
  const prev=liveSnapshots.get(id)||new Map(),next=new Map();
  const rows=markets.map(([k,v])=>marketHtml(k,v,card,id,prev,next)).filter(Boolean);
  if(next.size)liveSnapshots.set(id,next);
  const meta=sourceText(payload,books),count=rows.length?`${meta} · ${rows.length} MARKETS`:'ODDS —';
  if(!rows.length){host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 10 BOOKS</b><small>${esc(home)} vs ${esc(away)} · 5USD ULTRA</small></div><span class="fom-count muted">${esc(count)}</span></div><div class="fom-team-strip"><div class="home"><small>HOME · LEFT</small><strong>${esc(home)}</strong></div><i>VS</i><div class="away"><small>AWAY · RIGHT</small><strong>${esc(away)}</strong></div></div><div class="fom-empty">Full market prices unavailable for this fixture</div></section>`;return}
  host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 10 BOOKS</b><small>Fixed sides: home left · away right · LIVE prices refresh while expanded</small></div><span class="fom-count${payload?.stale?' muted':''}">${esc(count)}</span></div><div class="fom-team-strip"><div class="home"><small>HOME · LEFT</small><strong title="${esc(home)}">${esc(home)}</strong></div><i>VS</i><div class="away"><small>AWAY · RIGHT</small><strong title="${esc(away)}">${esc(away)}</strong></div></div><div class="fom-grid">${rows.join('')}</div></section>`;
}
function loading(card){const host=ensureHost(card);if(host)host.innerHTML='<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 10 BOOKS</b><small>กำลังโหลดราคาจาก 10 bookmaker</small></div><span class="fom-count muted">LOADING</span></div></section>'}
async function fetchPayload(id){
  try{
    const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${Date.now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);
    if(!r.ok||j?.ok!==true)throw Object.assign(new Error(j?.error||`HTTP_${r.status}`),{status:r.status});
    return j;
  }catch(primaryError){
    const r=await fetch(`${FALLBACK_API}?fixtureId=${encodeURIComponent(id)}&_=${Date.now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);
    if(!r.ok||j?.ok!==true)throw primaryError;
    return {...j,fallbackOnly:true,fullMarketError:String(primaryError?.message||primaryError)};
  }
}
async function load(card,force=false){
  const id=String(card?.dataset?.matchId||'');if(!id||busy.has(id))return;
  const hit=cache.get(id);if(!force&&hit&&Date.now()-hit.at<CACHE_MS){render(card,hit.data);return}
  busy.add(id);if(!hit)loading(card);
  try{const j=await fetchPayload(id);cache.set(id,{at:Date.now(),data:j});if(card?.isConnected)render(card,j)}
  catch(e){
    if(hit?.data){render(card,hit.data);return}
    const host=ensureHost(card);if(host)host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 10 BOOKS</b><small>${esc(String(e?.message||e))}</small></div><span class="fom-count muted">ODDS —</span></div><div class="fom-empty">ไม่มีราคาน้ำเต็มจากต้นทางในรอบนี้</div></section>`;
  }finally{busy.delete(id)}
}
function afterToggle(card){setTimeout(()=>{if(card?.getAttribute('aria-expanded')==='true')load(card)},0)}
function hydrateAdded(node){if(node?.nodeType!==1)return;if(node.matches?.('.match-card[data-match-id][aria-expanded="true"]'))load(node);node.querySelectorAll?.('.match-card[data-match-id][aria-expanded="true"]').forEach(load)}
function pollExpanded(){if(document.visibilityState!=='visible')return;document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]').forEach(card=>load(card,true))}
function injectStyle(){
  if(document.getElementById('nomad343-full-odds-main'))return;
  const s=document.createElement('style');s.id='nomad343-full-odds-main';
  s.textContent=`.fom-addon{display:grid;gap:8px;margin:8px 0 9px}.fom-board{background:#0b120e;border:1px solid #2b3a30;min-width:0}.fom-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border-bottom:1px solid #28362c}.fom-head>div{display:grid;gap:2px;min-width:0}.fom-head b{font-size:11px;letter-spacing:.055em;color:#eef7f0}.fom-head small{font-size:8px;color:#7f8d83;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fom-count{font-size:8px;font-weight:900;color:#7dff9d;border:1px solid #295a38;padding:3px 6px;background:#0d2014;white-space:nowrap}.fom-count.muted{color:#8c978f;border-color:#344039;background:#111713}.fom-team-strip{position:sticky;top:0;z-index:3;display:grid;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr);align-items:stretch;background:#101a13;border-bottom:1px solid #304137}.fom-team-strip>div{display:grid;gap:2px;padding:8px 10px;min-width:0}.fom-team-strip .home{text-align:left}.fom-team-strip .away{text-align:right}.fom-team-strip small{font-size:7px;color:#718078;letter-spacing:.05em}.fom-team-strip strong{font-size:10px;color:#edf6ef;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fom-team-strip>i{display:grid;place-items:center;font-style:normal;font-size:7px;color:#617067;border-left:1px solid #243229;border-right:1px solid #243229}.fom-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(520px,1fr));gap:8px;padding:8px}.fom-market{border:1px solid #26352b;background:#101813;min-width:0}.fom-market-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 9px;border-bottom:1px solid #26352b;background:#111b15}.fom-market-head>div{display:grid;gap:1px;min-width:0}.fom-market-head b{font-size:9px;color:#e5eee8}.fom-market-head small{font-size:7px;color:#6f7f75}.fom-market-head>span{font-size:7px;color:#f1c75b;font-weight:900;white-space:nowrap}.fom-colhead,.fom-price-row{display:grid;align-items:center;min-width:0}.cols-ah{grid-template-columns:52px minmax(0,1fr) minmax(0,1fr)}.cols-total{grid-template-columns:52px minmax(0,1fr) minmax(0,1fr)}.cols-1x2{grid-template-columns:52px minmax(0,1fr) minmax(48px,.58fr) minmax(0,1fr)}.fom-colhead{min-height:32px;border-bottom:1px solid #26352b;background:#0d1510}.fom-colhead>*{padding:5px 7px;min-width:0;border-right:1px solid rgba(255,255,255,.04)}.fom-colhead>*:last-child{border-right:0}.fom-colhead span{font-size:6px;color:#65736a}.fom-colhead b{font-size:7px;color:#aab7ae;text-align:center;white-space:normal;line-height:1.2;overflow-wrap:anywhere}.fom-colhead.cols-ah b:first-of-type{text-align:left}.fom-colhead.cols-ah b:last-child{text-align:right}.fom-book{border-bottom:1px solid #25332a}.fom-book:last-child{border-bottom:0}.fom-book>header{display:flex;align-items:center;gap:7px;padding:5px 7px;background:#121c16}.fom-book>header b{font-size:8px;color:#f0f5f1}.fom-book>header small{font-size:6px;color:#8f9b93;border:1px solid #35443a;padding:1px 4px}.fom-book[data-book="bet365"]>header b{color:#f1c75b}.fom-book[data-book="pinnacle"]>header b,.fom-book[data-book="crown"]>header b{color:#d7e9dc}.fom-price-row{min-height:30px;border-top:1px solid rgba(255,255,255,.035)}.fom-price-row>*{padding:5px 7px;min-width:0;border-right:1px solid rgba(255,255,255,.035)}.fom-price-row>*:last-child{border-right:0}.fom-stage-label{font-size:6px;font-weight:800;color:#68766d;letter-spacing:.035em}.fom-stage-label.live{display:flex;align-items:center;gap:4px;color:#6dff92}.fom-stage-label.live i{width:5px;height:5px;border-radius:50%;background:#56ef7b;box-shadow:0 0 7px rgba(86,239,123,.65);animation:fom-live-pulse 2.6s ease-in-out infinite}.fom-price{font-size:9px;color:#e7efe9;font-variant-numeric:tabular-nums;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cols-ah .fom-price:nth-child(2){text-align:left}.cols-ah .fom-price:nth-child(3){text-align:right}.fom-live-value{color:#72ff98;text-shadow:0 0 8px rgba(72,255,125,.18);animation:fom-live-text 2.8s ease-in-out infinite}.fom-live-value.is-changed{animation:fom-live-flash .85s ease-out 1,fom-live-text 2.8s ease-in-out .85s infinite}.fom-empty{padding:14px;text-align:center;color:#7d8981;font-size:9px}@keyframes fom-live-pulse{0%,100%{opacity:.5;transform:scale(.88)}50%{opacity:1;transform:scale(1.08)}}@keyframes fom-live-text{0%,100%{filter:brightness(.9)}50%{filter:brightness(1.18)}}@keyframes fom-live-flash{0%{background:rgba(83,255,128,.32);box-shadow:inset 0 0 14px rgba(83,255,128,.2)}100%{background:transparent;box-shadow:none}}@media(max-width:1120px){.fom-grid{grid-template-columns:1fr}}@media(max-width:760px){.fom-grid{grid-template-columns:1fr;padding:6px;gap:6px}.fom-head{padding:9px 8px}.fom-head small{white-space:normal;line-height:1.25}.fom-count{font-size:7px}.fom-team-strip{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)}.fom-team-strip>div{padding:7px 7px}.fom-team-strip strong{font-size:9px;white-space:normal;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.cols-ah,.cols-total{grid-template-columns:43px minmax(0,1fr) minmax(0,1fr)}.cols-1x2{grid-template-columns:43px minmax(0,1fr) 42px minmax(0,1fr)}.fom-colhead>*,.fom-price-row>*{padding:5px 4px}.fom-price{font-size:8px}.fom-colhead b{font-size:6.5px}.fom-market-head small{display:none}.fom-book>header{padding:5px 5px}}@media(max-width:390px){.fom-price{font-size:7.5px}.cols-ah,.cols-total{grid-template-columns:40px minmax(0,1fr) minmax(0,1fr)}.cols-1x2{grid-template-columns:40px minmax(0,1fr) 38px minmax(0,1fr)}.fom-stage-label{font-size:5.8px}}@media(prefers-reduced-motion:reduce){.fom-stage-label.live i,.fom-live-value,.fom-live-value.is-changed{animation:none}}`;
  document.head.appendChild(s)
}
function start(){
  injectStyle();
  document.addEventListener('click',e=>{const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  const mo=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)hydrateAdded(n)});
  document.querySelectorAll('.match-stack').forEach(root=>mo.observe(root,{childList:true,subtree:true}));
  document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]').forEach(load);
  setInterval(pollExpanded,POLL_MS);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pollExpanded()});
  window.NOMAD343_FULL_ODDS_MAIN={version:VERSION,books:BOOKS.map(x=>({...x})),reload:id=>{cache.delete(String(id));const card=document.querySelector(`.match-card[data-match-id="${CSS.escape(String(id))}"]`);if(card)load(card,true)}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
