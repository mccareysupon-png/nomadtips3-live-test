(()=>{
'use strict';
const VERSION='343-full-odds-main-v7-bulk-snapshot-only';
const BOARD_API='/api/engine/board';
const CACHE_MS=30_000;
const BOOKS=[
  {slug:'bet365',name:'Bet365',role:'MAIN',aliases:['bet365','bet 365','bet365.com']},
  {slug:'pinnacle',name:'Pinnacle',role:'REFEREE',aliases:['pinnacle','pinnacle sports','pinnaclesports']},
  {slug:'crown',name:'Crown',role:'REFEREE ASIA',aliases:['crown','crown sports','crownsports']},
  {slug:'1xbet',name:'1xBet',role:'GLOBAL MASS',aliases:['1xbet','1x bet','1xbet.com']},
  {slug:'12bet',name:'12Bet',role:'ASIA',aliases:['12bet','12 bet','12bet.com']},
  {slug:'interwetten',name:'Interwetten',role:'EUROPE',aliases:['interwetten']},
  {slug:'macauslot',name:'Macau Slot',role:'EAST ASIA',aliases:['macauslot','macau slot']},
  {slug:'18bet',name:'18Bet',role:'ASIA #2',aliases:['18bet','18 bet','18bet.com']},
  {slug:'vcbet',name:'VCBet',role:'RESERVE',aliases:['vcbet','vc bet']},
  {slug:'easybets',name:'Easybets',role:'RESERVE',aliases:['easybets','easy bets']}
];
const LABELS={asian_handicap:'Asian Handicap',goal_line:'Goals O/U','1x2':'1X2',corner_line:'Corners O/U',corner_asian:'Corner Asian',card_line:'Cards O/U',card_asian:'Card Asian',btts:'Both Teams To Score'};
const cache=new Map(),busy=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const fmt=v=>{const n=num(v);if(n===null)return v===null||v===undefined||v===''?'--':String(v);return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)};
function team(card,side){const n=card.querySelectorAll('.team-name');return side==='home'?(n[0]?.textContent?.trim()||'HOME'):(n[1]?.textContent?.trim()||'AWAY')}
function idOf(f){return String(f?.fixtureId??f?.id??f?.fixture?.id??'')}
function fullRoot(f){return f?.providerOdds??f?.fullOdds??f?.odds??f?.data?.providerOdds??f?.data?.fullOdds??null}
function looksLikeMarketRoot(v){return obj(v)&&Object.keys(v).some(k=>/1x2|asian|goal|corner|card|btts|over|under|handicap/i.test(k))}
function canonicalMarket(key){
  const k=String(key??'').toLowerCase().replace(/[\s-]+/g,'_');
  const half=/(half|1st)/.test(k);
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
function bookKey(row){return norm(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name??row?.book??row?.provider?.name)}
function oddsFrom(row){return row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row}
function collectBooks(root){
  const full=root?.fullOdds??root?.providerOdds??root?.odds??root?.data??root;
  const arrays=[full?.data?.bookmakers,full?.bookmakers,root?.bookmakers,root?.data?.bookmakers].filter(Array.isArray);
  const raw=arrays[0]||[];
  const out=[];
  const push=(book,odds)=>{if(!obj(odds))return;if(out.some(x=>x.slug===book.slug))return;out.push({...book,odds})};
  for(const book of BOOKS){
    const keys=[book.slug,book.name,...(book.aliases||[])].map(norm);
    const row=raw.find(x=>keys.some(k=>bookKey(x)===k||bookKey(x).includes(k)||k.includes(bookKey(x))));
    if(row)push(book,oddsFrom(row));
  }
  const roots=[full?.data,full,root?.data,root].filter(obj);
  for(const parent of roots){
    for(const book of BOOKS){
      const keys=[book.slug,book.name,...(book.aliases||[])];
      const hit=keys.map(k=>parent[k]??parent[String(k).toLowerCase()]??parent[norm(k)]).find(obj);
      if(hit)push(book,oddsFrom(hit));
    }
  }
  if(!out.length&&looksLikeMarketRoot(full))push(BOOKS[0],full);
  return out;
}
function stages(market){
  if(!obj(market))return[];
  const rows=[['OPEN',market.opening],['CLOSE',market.closing],['LIVE',market.inplay??market.in_play??market.live??market.current]];
  const filtered=rows.filter(([,v])=>obj(v));
  return filtered.length?filtered:[[null,market]];
}
function valueText(value){
  if(!obj(value))return esc(fmt(value));
  const keys=['line','hdp','handicap','home','draw','away','over','under','yes','no','price','odds','value'];
  const parts=[];
  for(const key of keys){if(value[key]!==undefined&&value[key]!==null&&value[key]!=='')parts.push(`${key}: ${fmt(value[key])}`)}
  if(parts.length)return esc(parts.join(' | '));
  const shallow=Object.entries(value).filter(([,v])=>v===null||typeof v!=='object').slice(0,8).map(([k,v])=>`${k}: ${fmt(v)}`);
  return esc(shallow.length?shallow.join(' | '):'snapshot object');
}
function marketHtml(key,market){
  const label=LABELS[key.replace('_half','')]||key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const rows=stages(market).map(([stage,v])=>`<div class="fom-row"><span>${esc(stage||'SNAP')}</span><b>${valueText(v)}</b></div>`).join('');
  return `<section class="fom-market"><header><b>${esc(label)}</b><small>${key.includes('_half')?'1st half':'full time'}</small></header>${rows}</section>`;
}
function renderBook(book){
  const entries=Object.entries(book.odds||{}).filter(([,v])=>obj(v)).map(([k,v])=>[canonicalMarket(k),v]);
  if(!entries.length)return'';
  return `<section class="fom-book" data-book="${esc(book.slug)}"><header><b>${esc(book.name)}</b><small>${esc(book.role)}</small></header><div class="fom-markets">${entries.map(([k,v])=>marketHtml(k,v)).join('')}</div></section>`;
}
function ensureHost(card){
  const details=card?.querySelector('.event-details');if(!details)return null;
  let host=details.querySelector('[data-full-odds-main]');if(host)return host;
  host=document.createElement('div');host.dataset.fullOddsMain='1';host.className='fom-addon';
  const flow=details.querySelector('.nomad-event-flow-card'),stats=details.querySelector('.evidence-card');
  if(flow)flow.insertAdjacentElement('afterend',host);else if(stats)stats.insertAdjacentElement('afterend',host);else details.appendChild(host);
  return host;
}
function loading(card){const host=ensureHost(card);if(host)host.innerHTML='<section class="fom-board"><div class="fom-head"><b>FULL MARKET</b><span>BULK SNAPSHOT</span></div><div class="fom-empty">Loading snapshot...</div></section>'}
function render(card,payload){
  const host=ensureHost(card);if(!host)return;
  const books=collectBooks(payload?.fullOdds),home=team(card,'home'),away=team(card,'away');
  const body=books.map(renderBook).filter(Boolean).join('');
  const count=books.length?`${books.length}/10 BOOKS`:'ODDS --';
  host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · BULK SNAPSHOT ONLY</b><small>${esc(home)} vs ${esc(away)} · no direct provider request</small></div><span>${esc(count)}</span></div>${body||'<div class="fom-empty">Bulk snapshot has no full market prices for this fixture</div>'}</section>`;
}
async function fetchPayload(id){
  const r=await fetch(`${BOARD_API}?_=${Date.now()}`,{cache:'no-store'});
  const j=await r.json().catch(()=>null);
  if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);
  const fixture=(Array.isArray(j.fixtures)?j.fixtures:[]).find(f=>idOf(f)===String(id));
  if(!fixture)throw new Error('FIXTURE_NOT_IN_BULK_SNAPSHOT');
  return {ok:true,source:'BULK_SNAPSHOT',dataMode:j.dataMode||'BULK_SNAPSHOT_ONLY',stale:Boolean(j.stale),fullOdds:fullRoot(fixture)};
}
async function load(card,force=false){
  const id=String(card?.dataset?.matchId||'');if(!id||busy.has(id))return;
  const hit=cache.get(id);if(!force&&hit&&Date.now()-hit.at<CACHE_MS){render(card,hit.data);return}
  busy.add(id);if(!hit)loading(card);
  try{const data=await fetchPayload(id);cache.set(id,{at:Date.now(),data});if(card?.isConnected)render(card,data)}
  catch(e){const host=ensureHost(card);if(host)host.innerHTML=`<section class="fom-board"><div class="fom-head"><b>FULL MARKET · BULK SNAPSHOT ONLY</b><span>ODDS --</span></div><div class="fom-empty">${esc(String(e?.message||e))}</div></section>`}
  finally{busy.delete(id)}
}
function afterToggle(card){setTimeout(()=>{if(card?.getAttribute('aria-expanded')==='true')load(card)},0)}
function hydrateAdded(node){if(node?.nodeType!==1)return;if(node.matches?.('.match-card[data-match-id][aria-expanded="true"]'))load(node);node.querySelectorAll?.('.match-card[data-match-id][aria-expanded="true"]').forEach(load)}
function injectStyle(){
  if(document.getElementById('nomad343-full-odds-main'))return;
  const s=document.createElement('style');s.id='nomad343-full-odds-main';
  s.textContent=`.fom-addon{display:grid;gap:8px;margin:8px 0 9px}.fom-board{background:#0b120e;border:1px solid #2b3a30;min-width:0}.fom-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border-bottom:1px solid #28362c}.fom-head>div{display:grid;gap:2px;min-width:0}.fom-head b{font-size:11px;color:#eef7f0}.fom-head small{font-size:8px;color:#7f8d83;white-space:normal}.fom-head span{font-size:8px;font-weight:900;color:#7dff9d;border:1px solid #295a38;padding:3px 6px;background:#0d2014;white-space:nowrap}.fom-book{border-top:1px solid #26352b}.fom-book>header{display:flex;gap:7px;align-items:center;padding:8px 9px;background:#111b15}.fom-book>header b{font-size:10px;color:#f0f5f1}.fom-book>header small{font-size:7px;color:#8f9b93;border:1px solid #35443a;padding:1px 4px}.fom-markets{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:7px;padding:7px}.fom-market{border:1px solid #26352b;background:#101813;min-width:0}.fom-market header{display:flex;justify-content:space-between;gap:8px;padding:7px 8px;border-bottom:1px solid #26352b;background:#0d1510}.fom-market header b{font-size:9px;color:#e5eee8}.fom-market header small{font-size:7px;color:#6f7f75}.fom-row{display:grid;grid-template-columns:50px minmax(0,1fr);gap:6px;align-items:center;min-height:28px;padding:5px 7px;border-top:1px solid rgba(255,255,255,.035)}.fom-row:first-of-type{border-top:0}.fom-row span{font-size:7px;font-weight:900;color:#6dff92}.fom-row b{font-size:8px;color:#e7efe9;font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere}.fom-empty{padding:14px;text-align:center;color:#7d8981;font-size:9px}@media(max-width:760px){.fom-head{padding:9px 8px}.fom-markets{grid-template-columns:1fr;padding:6px}.fom-row{grid-template-columns:44px minmax(0,1fr)}}`;
  document.head.appendChild(s);
}
function start(){
  injectStyle();
  document.addEventListener('click',e=>{const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  const mo=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)hydrateAdded(n)});
  document.querySelectorAll('.match-stack').forEach(root=>mo.observe(root,{childList:true,subtree:true}));
  document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]').forEach(load);
  window.NOMAD343_FULL_ODDS_MAIN={version:VERSION,dataMode:'BULK_SNAPSHOT_ONLY',reload:id=>{cache.delete(String(id));const card=document.querySelector(`.match-card[data-match-id="${CSS.escape(String(id))}"]`);if(card)load(card,true)}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
