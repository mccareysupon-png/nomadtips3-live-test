(()=>{
'use strict';
const VERSION='343-dashboard-v2-stage3-schema-accurate';
const API='/api/engine/board';
const SIGNALS_API='/api/engine/signals';
const POLL_MS=30_000;
const COLLAPSED_LIMIT=12;
const THEME_KEY='nomad343_dashboard_theme_v1';
const BOOKS=[
  {slug:'bet365',name:'Bet365'},{slug:'pinnacle',name:'Pinnacle'},{slug:'crown',name:'Crown'},
  {slug:'1xbet',name:'1xBet'},{slug:'12bet',name:'12Bet'},{slug:'interwetten',name:'Interwetten'},
  {slug:'macauslot',name:'Macau Slot'},{slug:'18bet',name:'18Bet'},{slug:'vcbet',name:'VCBet'},{slug:'easybets',name:'Easybets'}
];
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const show=(v,d=0)=>num(v)===null?'—':Number(v).toFixed(d).replace(/\.0+$/,'');
const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};
const dateMs=v=>{const n=num(v);if(n!==null)return n>1e10?n:n*1000;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:null};
const norm=v=>String(v??'').toLowerCase().replace(/[\s_-]/g,'');
const timeZone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}})();
let fixtures=[];
let signalMap=new Map();
let signalMirror={};
let boardMeta={};
let selectedId=null;
let statusFilter='all';
let leagueFilter='all';
let query='';
const expandedGroups=new Set();
let loading=false;

function fixtureKey(f){return String(f?.fixtureId??[f?.home?.name,f?.away?.name,f?.kickoffAt??f?.kickoffUtc].join('|'))}
function leagueName(f){return [f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')||'Other'}
function rawStatus(f){return [f?.status,f?.statusCode,f?.statusReason].filter(Boolean).join(' ').toLowerCase()}
function classify(f){
  const raw=rawStatus(f),board=String(f?.boardState||'').toLowerCase();
  if(/unknown|postpon|cancel|canceled|abandon|suspend|delay|delayed/.test(raw))return'unknown';
  if(['live','scheduled','finished','unknown'].includes(board))return board;
  if(/finished|full_time|full time|\bft\b|ended|after extra|\baet\b|penalties|\bpen\b/.test(raw))return'finished';
  if(/live|in_play|in play|playing|first half|second half|\b1h\b|\b2h\b|half.?time|\bht\b/.test(raw)||/^\d+$/.test(String(f?.statusCode??'')))return'live';
  return'scheduled';
}
function kickoffLabel(f){const ms=dateMs(f?.kickoffAt??f?.kickoffUtc);if(ms===null)return'—';return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms))}
function clockLabel(f){const code=String(f?.statusCode??'').trim().toUpperCase();if(code==='HT'||code.includes('HALF'))return'HT';const m=num(f?.minute);if(m!==null)return`${Math.round(m)}'`;const hit=code.match(/\d+/);return hit?`${hit[0]}'`:'LIVE'}
function detailedStatus(f){
  const raw=rawStatus(f).toUpperCase(),kind=classify(f),reason=String(f?.statusReason??'').trim();
  if(kind==='live')return clockLabel(f);
  if(kind==='finished')return'FT';
  if(kind==='scheduled')return kickoffLabel(f);
  if(/POST/.test(raw))return reason||'POSTPONED';
  if(/SUSP/.test(raw))return reason||'SUSPENDED';
  if(/CANCEL/.test(raw))return reason||'CANCELLED';
  if(/ABAND/.test(raw))return reason||'ABANDONED';
  if(/DELAY/.test(raw))return reason||'DELAYED';
  return reason||'UNCONFIRMED';
}
function scorePair(f){return pair(f?.goals)}
function scoreLabel(f){if(classify(f)==='scheduled')return'—';const p=scorePair(f);return p.home===null||p.away===null?'—':`${show(p.home)}–${show(p.away)}`}
function scoreStack(f){const kind=classify(f),p=scorePair(f);if(kind==='scheduled')return'<strong>—</strong><strong>—</strong>';return `<strong>${esc(p.home===null?'—':show(p.home))}</strong><strong>${esc(p.away===null?'—':show(p.away))}</strong>`}
function halfScoreLabel(f){const h=num(f?.goals?.halfHome),a=num(f?.goals?.halfAway);return h===null||a===null?'':`HT ${show(h)}–${show(a)}`}
function signalFor(f){return signalMap.get(fixtureKey(f))||null}
function signalSummary(s){
  if(!s)return'No active signal';
  const selection=String(s?.selection||'').trim().toUpperCase(),market=String(s?.marketLabel||s?.market||'SIGNAL').trim(),line=num(s?.line??s?.selectionLine),odds=num(s?.odds),book=String(s?.bookmaker||'').trim();
  const top=[selection,market].filter(Boolean).join(' · ');
  const detail=[];if(line!==null)detail.push(`Line ${line>0?'+':''}${show(line,2)}`);if(odds!==null)detail.push(`Odds ${odds.toFixed(2)}`);if(book)detail.push(book);
  return [top,detail.join(' · ')].filter(Boolean).join(' | ');
}
function signalDetailsHtml(s){
  if(!s)return'No active signal';
  const selection=String(s?.selection||'—').toUpperCase(),market=String(s?.marketLabel||s?.market||'SIGNAL'),line=num(s?.line??s?.selectionLine),odds=num(s?.odds),book=String(s?.bookmaker||'—'),entryMin=num(s?.entryMinute??s?.minute),liveMin=num(s?.mirrorMinute),entry=pair(s?.entryScore??s?.scoreAt),live=pair(s?.mirrorScore),lineText=line===null?'—':`${line>0?'+':''}${show(line,2)}`;
  const entryScore=entry.home===null||entry.away===null?'—':`${show(entry.home)}–${show(entry.away)}`;
  const liveScore=live.home===null||live.away===null?'—':`${show(live.home)}–${show(live.away)}`;
  return `<div class="feature-signal-main"><b>${esc(selection)}</b><span>${esc(market)}</span></div><div class="feature-signal-meta"><span>Line ${esc(lineText)}</span><span>Odds ${esc(odds===null?'—':odds.toFixed(2))}</span><span>${esc(book)}</span></div><div class="feature-signal-meta"><span>Signal ${esc(entryMin===null?'—':`${Math.round(entryMin)}'`)}</span><span>Entry ${esc(entryScore)}</span><span>Live ${esc(liveMin===null?'—':`${Math.round(liveMin)}'`)} · ${esc(liveScore)}</span></div>`;
}
function looksLikeMarketRoot(v){return Boolean(v)&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).some(k=>/^(1x2|asian[_ -]?handicap|goal[_ -]?line)$/i.test(k))}
function providerBooks(f){
  const payload=f?.providerOdds;if(!payload||typeof payload!=='object')return[];
  const full=payload?.data??payload;
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
  if(!raw.length&&full?.odds&&looksLikeMarketRoot(full.odds))raw=[{slug:'bet365',name:'Bet365',odds:full.odds}];
  if(!raw.length&&full?.markets&&looksLikeMarketRoot(full.markets))raw=[{slug:'bet365',name:'Bet365',odds:full.markets}];
  const out=[];
  for(const book of BOOKS){
    const target=norm(book.slug),row=raw.find(x=>{const key=norm(x?.slug??x?.bookmaker?.slug??x?.name??x?.bookmaker?.name);return key===target||key.includes(target)||target.includes(key)});
    if(!row)continue;
    const odds=row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row;
    if(odds&&typeof odds==='object'&&!Array.isArray(odds))out.push({...book,odds});
  }
  return out;
}
function exactMarket(odds,target){if(!odds||typeof odds!=='object')return null;const wanted=target==='1X2'?'1x2':target==='AH'?'asian_handicap':'goal_line';for(const [raw,value] of Object.entries(odds)){const key=String(raw).toLowerCase().replace(/[\s-]+/g,'_');if(key===wanted&&value&&typeof value==='object')return value}return null}
function stagePick(market,kind){
  if(!market||typeof market!=='object')return null;
  const live=['LIVE',market.inplay??market.in_play??market.live],close=['CLOSE',market.closing??market.close],open=['OPEN',market.opening??market.open];
  const order=kind==='live'||kind==='finished'?[live,close,open]:[close,open];
  return order.find(([,v])=>v&&typeof v==='object')||null;
}
function marketValue(target,value){
  if(target==='1X2'){const h=num(value?.home),d=num(value?.draw),a=num(value?.away);if(h===null&&d===null&&a===null)return null;return [h,d,a].map(x=>x===null?'—':x.toFixed(2)).join('/')}
  const line=num(value?.line??value?.hdp??value?.handicap??value?.total);
  if(target==='AH'){const h=num(value?.home??value?.home_odds??value?.homeOdds),a=num(value?.away??value?.away_odds??value?.awayOdds);if(line===null&&h===null&&a===null)return null;const l=line===null?'—':`${line>0?'+':''}${show(line,2)}`,prices=h===null&&a===null?'':[h,a].map(x=>x===null?'—':x.toFixed(2)).join('/');return [l,prices].filter(Boolean).join(' · ')}
  const o=num(value?.over??value?.over_odds??value?.overOdds),u=num(value?.under??value?.under_odds??value?.underOdds);if(line===null&&o===null&&u===null)return null;const l=line===null?'—':show(line,2),prices=o===null&&u===null?'':[o,u].map(x=>x===null?'—':x.toFixed(2)).join('/');return [l,prices].filter(Boolean).join(' · ');
}
function marketCompact(f,target){const kind=classify(f);for(const book of providerBooks(f)){const market=exactMarket(book.odds,target),stage=stagePick(market,kind);if(!stage)continue;const value=marketValue(target,stage[1]);if(value)return{stage:stage[0],value,book:book.name}}return{stage:'',value:'—',book:''}}
function metricRows(f){const st=f?.statistics||{};return [['Shots on target',pair(st.shotsOnTarget),false],['Shots off target',pair(st.shotsOffTarget),false],['Corners',pair(f?.corners),false],['Attacks',pair(st.attacks),false],['Dangerous attacks',pair(st.dangerousAttacks),false],['Possession',pair(st.possession),true]]}
function statHtml(f){return metricRows(f).map(([label,p,pct])=>{const h=p.home,a=p.away,max=pct?100:Math.max(h??0,a??0,1),hw=h===null?0:Math.min(100,(h/max)*100),aw=a===null?0:Math.min(100,(a/max)*100),hv=h===null?'—':`${show(h,pct?1:0)}${pct?'%':''}`,av=a===null?'—':`${show(a,pct?1:0)}${pct?'%':''}`;return `<div class="stat-row"><b>${esc(hv)}</b><div class="stat-track home"><i style="width:${hw}%"></i></div><span>${esc(label)}</span><div class="stat-track away"><i style="width:${aw}%"></i></div><b>${esc(av)}</b></div>`}).join('')}
function eventMinute(e){return num(e?.minute??e?.elapsed??e?.time?.elapsed)}
function eventTeam(e){const t=e?.team??e?.team_name;return typeof t==='object'?String(t?.name??''):String(t??'')}
function eventType(e){return String(e?.type??e?.event??e?.name??e?.detail??'Match event')}
function eventsHtml(f){const events=Array.isArray(f?.events)?f.events.slice():[];if(!events.length)return'<div class="feature-empty">No recent events in the current snapshot.</div>';events.sort((a,b)=>(eventMinute(b)??0)-(eventMinute(a)??0));return `<div class="event-title">RECENT EVENTS</div>${events.slice(0,5).map(e=>{const m=eventMinute(e),team=eventTeam(e);return `<div class="event-item"><time>${esc(m===null?'—':`${Math.round(m)}'`)}</time><span>${esc(eventType(e))}${team?` · ${esc(team)}`:''}</span></div>`}).join('')}`}
function cardsLabel(f){const h=f?.cards?.home||{},a=f?.cards?.away||{};const hy=num(h.yellow),hr=num(h.red),ay=num(a.yellow),ar=num(a.red);if([hy,hr,ay,ar].every(x=>x===null))return'—';return `${hy??0}Y/${hr??0}R · ${ay??0}Y/${ar??0}R`}
function cornersLabel(f){const p=pair(f?.corners);return p.home===null||p.away===null?'—':`${show(p.home)}–${show(p.away)}`}
function oddsAgeLabel(f){const at=dateMs(f?.providerOddsUpdatedAt);if(at===null)return'—';const sec=Math.max(0,Math.round((Date.now()-at)/1000));return sec<60?`${sec}s`:`${Math.floor(sec/60)}m`}
function featureFactsHtml(f){return `<div><span>HALF-TIME</span><b>${esc(halfScoreLabel(f)||'—')}</b></div><div><span>CORNERS</span><b>${esc(cornersLabel(f))}</b></div><div><span>CARDS H · A</span><b>${esc(cardsLabel(f))}</b></div><div><span>ODDS AGE</span><b>${esc(oddsAgeLabel(f))}</b></div>`}
function statusLabel(key){return key==='live'?'LIVE MATCHES':key==='scheduled'?'UPCOMING MATCHES':key==='unknown'?'WAITING':'FINISHED MATCHES'}
function statusDotClass(key){return key==='live'?'live':key==='scheduled'?'upcoming':key==='unknown'?'waiting':'finished'}
function visibleRows(){return fixtures.filter(f=>{if(statusFilter!=='all'&&classify(f)!==statusFilter)return false;if(leagueFilter!=='all'&&leagueName(f)!==leagueFilter)return false;if(query){const hay=[leagueName(f),f?.home?.name,f?.away?.name].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(query))return false}return true})}
function groupByLeague(rows){const map=new Map();for(const f of rows){const key=leagueName(f);if(!map.has(key))map.set(key,[]);map.get(key).push(f)}return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))}
function marketCell(label,data){const title=[data.book,data.stage].filter(Boolean).join(' · ');return `<div class="market-cell"${title?` title="${esc(title)}"`:''}><span>${esc(label)}${data.stage?` · ${esc(data.stage)}`:''}</span><b>${esc(data.value)}</b>${data.book?`<small>${esc(data.book)}</small>`:''}</div>`}
function rowHtml(f){const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f),m1=marketCompact(f,'1X2'),mah=marketCompact(f,'AH'),mou=marketCompact(f,'OU'),half=halfScoreLabel(f);return `<article class="match-row ${active?'active':''}" data-match-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(f?.home?.name||'Home')} versus ${esc(f?.away?.name||'Away')}"><div class="teams-cell"><b>${esc(f?.home?.name||'—')}</b><b>${esc(f?.away?.name||'—')}</b><small>${esc(detailedStatus(f))}</small></div><div class="score-cell">${scoreStack(f)}<small>${esc(kind==='live'?clockLabel(f):kind==='finished'?'FT':kickoffLabel(f))}</small>${half?`<small class="half-score">${esc(half)}</small>`:''}</div>${marketCell('1X2',m1)}${marketCell('AH',mah)}${marketCell('O/U',mou)}<div class="signal-cell ${sig?'locked':''}">${sig?'SIGNAL':'WATCH'}</div></article>`}
function renderBoard(){const host=$('[data-board-sections]');if(!host)return;const rows=visibleRows(),order=['live','scheduled','unknown','finished'],html=[];for(const key of order){const all=rows.filter(f=>classify(f)===key);if(!all.length)continue;const open=expandedGroups.has(key),shown=open?all:all.slice(0,COLLAPSED_LIMIT),leagueGroups=groupByLeague(shown);html.push(`<section class="status-section" data-status-section="${key}"><header class="status-head"><div><i class="status-dot ${statusDotClass(key)}"></i><h2>${statusLabel(key)}</h2></div><b>${all.length}</b></header>${leagueGroups.map(([league,list])=>`<section class="league-block"><header class="league-head"><strong>${esc(league)}</strong><span>${list.length} match${list.length===1?'':'es'}</span></header>${list.map(rowHtml).join('')}</section>`).join('')}${all.length>COLLAPSED_LIMIT?`<div class="show-more"><button type="button" data-expand-group="${key}">${open?'Show less':`View all ${all.length}`}</button></div>`:''}</section>`)}host.innerHTML=html.length?html.join(''):'<div class="board-empty">No matches match the current filters.</div>';$$('[data-match-id]').forEach(el=>{const choose=()=>{selectedId=el.dataset.matchId;renderBoard();renderFeatured()};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}})});$$('[data-expand-group]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.expandGroup;expandedGroups.has(k)?expandedGroups.delete(k):expandedGroups.add(k);renderBoard()}))}
function setText(sel,v){const el=$(sel);if(el)el.textContent=String(v??'—')}
function renderCounts(){const counts={live:0,scheduled:0,unknown:0,finished:0};fixtures.forEach(f=>counts[classify(f)]++);for(const [k,v] of Object.entries(counts)){const a=$(`[data-filter-count="${k}"]`),b=$(`[data-overview="${k}"]`);if(a)a.textContent=v;if(b)b.textContent=v}const all=$('[data-filter-count="all"]');if(all)all.textContent=fixtures.length;const activeSignals=num(signalMirror?.activeSignals)??signalMap.size,activeMatches=num(signalMirror?.activeMatches)??new Set(signalMap.keys()).size;setText('[data-signal-count]',activeSignals);setText('[data-active-match-count]',activeMatches);const age=num(boardMeta?.hubAgeMs);setText('[data-bulk-age]',age===null?'—':`${Math.max(0,Math.round(age/1000))}s`)}
function renderLeagueFilters(){const host=$('[data-league-filters]');if(!host)return;const map=new Map();for(const f of fixtures){const l=leagueName(f);map.set(l,(map.get(l)||0)+1)}host.innerHTML=[...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,count])=>`<button class="league-filter ${leagueFilter===name?'active':''}" data-league-filter="${esc(name)}"><span>${esc(name)}</span><b>${count}</b></button>`).join('')||'<div class="rail-empty">No leagues available</div>';$$('[data-league-filter]').forEach(btn=>btn.addEventListener('click',()=>{leagueFilter=leagueFilter===btn.dataset.leagueFilter?'all':btn.dataset.leagueFilter;renderLeagueFilters();renderBoard()}))}
function renderFeatured(){let f=fixtures.find(x=>fixtureKey(x)===selectedId);if(!f)f=fixtures.find(x=>classify(x)==='live')||fixtures.find(x=>classify(x)==='scheduled')||fixtures[0];if(!f)return;selectedId=fixtureKey(f);setText('[data-featured-league]',leagueName(f));setText('[data-featured-status]',detailedStatus(f));setText('[data-featured-home]',f?.home?.name||'—');setText('[data-featured-away]',f?.away?.name||'—');setText('[data-featured-score]',scoreLabel(f));const signal=$('[data-featured-signal]'),s=signalFor(f);if(signal){signal.innerHTML=signalDetailsHtml(s);signal.classList.toggle('locked',Boolean(s));signal.title=s?signalSummary(s):''}const facts=$('[data-featured-facts]');if(facts)facts.innerHTML=featureFactsHtml(f);const stats=$('[data-featured-stats]');if(stats)stats.innerHTML=statHtml(f);const events=$('[data-featured-events]');if(events)events.innerHTML=eventsHtml(f)}
function setState(ok,payload){const el=$('[data-state]');if(!el)return;el.classList.remove('live','warn');if(!ok){el.classList.add('warn');el.querySelector('span').textContent='Live data unavailable';return}const age=num(payload?.hubAgeMs??payload?.ageMs),stale=Boolean(payload?.stale);el.classList.add(stale?'warn':'live');const seconds=age===null?null:Math.max(0,Math.round(age/1000));el.querySelector('span').textContent=stale?`Bulk data stale${seconds===null?'':` · ${seconds}s`}`:`Bulk data${seconds===null?' connected':` · ${seconds}s`}`;el.title=[payload?.hubVersion,payload?.version].filter(Boolean).join(' · ')}
async function fetchJson(url){const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);return r.json()}
async function loadSignals(){try{const j=await fetchJson(SIGNALS_API),rows=Array.isArray(j?.signals)?j.signals:[],next=new Map();rows.sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));for(const s of rows){const id=String(s?.fixtureId??'').trim();if(id&&!next.has(id))next.set(id,s)}signalMap=next;signalMirror=j?.mirror&&typeof j.mirror==='object'?j.mirror:{}}catch{signalMap=new Map();signalMirror={}}}
async function load(){if(loading||document.visibilityState==='hidden')return;loading=true;try{const [board]=await Promise.all([fetchJson(API),loadSignals()]);if(board?.ok!==true)throw new Error(board?.error||'BOARD_NOT_READY');const rows=Array.isArray(board?.fixtures)?board.fixtures:[];boardMeta=board;fixtures=rows.slice().sort((a,b)=>(dateMs(a?.kickoffAt??a?.kickoffUtc)??0)-(dateMs(b?.kickoffAt??b?.kickoffUtc)??0));if(selectedId&&!fixtures.some(f=>fixtureKey(f)===selectedId))selectedId=null;renderCounts();renderLeagueFilters();renderBoard();renderFeatured();setState(true,board)}catch(err){console.warn('Dashboard V2 refresh failed',err);setState(false,null)}finally{loading=false}}
function setTheme(theme){const next=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=next;const btn=$('[data-theme-toggle]');if(btn)btn.textContent=next==='light'?'☾ Dark':'☀ Light';try{localStorage.setItem(THEME_KEY,next)}catch{}}
function initControls(){const tz=$('[data-timezone]');if(tz)tz.textContent=timeZone;const stored=(()=>{try{return localStorage.getItem(THEME_KEY)}catch{return null}})();setTheme(stored==='dark'?'dark':'light');$('[data-theme-toggle]')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));$$('[data-status-filter]').forEach(btn=>btn.addEventListener('click',()=>{statusFilter=btn.dataset.statusFilter;$$('[data-status-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderBoard()}));$('[data-search]')?.addEventListener('input',e=>{query=String(e.target.value||'').trim().toLowerCase();renderBoard()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()})}
function start(){initControls();load();setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_SNAPSHOT_ONLY'}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
