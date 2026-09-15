(()=>{
'use strict';
const VERSION='343-dashboard-v2-stage1';
const API='/api/engine/board';
const SIGNALS_API='/api/engine/signals';
const POLL_MS=30_000;
const COLLAPSED_LIMIT=12;
const THEME_KEY='nomad343_dashboard_theme_v1';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const show=(v,d=0)=>num(v)===null?'—':Number(v).toFixed(d).replace(/\.0+$/,'');
const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};
const dateMs=v=>{const n=num(v);if(n!==null)return n>1e10?n:n*1000;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:null};
const timeZone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}})();

let fixtures=[];
let signalMap=new Map();
let selectedId=null;
let statusFilter='all';
let leagueFilter='all';
let query='';
const expandedGroups=new Set();
let loading=false;

function fixtureKey(f){return String(f?.fixtureId??f?.id??[f?.home?.name,f?.away?.name,f?.kickoffAt??f?.kickoffUtc].join('|'))}
function leagueName(f){return [f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')||String(f?.leagueName||'Other')}
function classify(f){
  const s=String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase();
  if(/unknown|postpon|cancel|canceled|abandon|suspend/.test(s))return'unknown';
  if(/finished|full_time|full time|\bft\b|ended|after extra|\baet\b|penalties|\bpen\b/.test(s))return'finished';
  if(/live|in_play|in play|playing|first half|second half|\b1h\b|\b2h\b|half.?time|\bht\b/.test(s)||/^\d+$/.test(String(f?.statusCode??'')))return'live';
  return'scheduled';
}
function detailedStatus(f){
  const raw=String(f?.statusCode??f?.status??f?.boardState??'').trim().toUpperCase();
  const kind=classify(f);
  if(kind==='live')return clockLabel(f);
  if(kind==='finished')return'FT';
  if(kind==='scheduled')return kickoffLabel(f);
  if(/POST/.test(raw))return'POSTPONED';
  if(/SUSP/.test(raw))return'SUSPENDED';
  if(/CANCEL/.test(raw))return'CANCELLED';
  if(/ABAND/.test(raw))return'ABANDONED';
  return'UNCONFIRMED';
}
function kickoffLabel(f){
  const ms=dateMs(f?.kickoffAt??f?.kickoffUtc);if(ms===null)return'—';
  return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));
}
function clockLabel(f){
  const code=String(f?.statusCode??'').trim().toUpperCase();
  if(code==='HT'||code.includes('HALF'))return'HT';
  const m=num(f?.minute);if(m!==null)return`${Math.round(m)}'`;
  const hit=code.match(/\d+/);return hit?`${hit[0]}'`:'LIVE';
}
function scoreLabel(f){
  if(classify(f)==='scheduled')return'—';
  const h=num(f?.goals?.home??f?.score?.home),a=num(f?.goals?.away??f?.score?.away);
  return h===null||a===null?'—':`${show(h)}–${show(a)}`;
}
function scoreStack(f){
  const kind=classify(f),h=num(f?.goals?.home??f?.score?.home),a=num(f?.goals?.away??f?.score?.away);
  if(kind==='scheduled')return'<strong>—</strong><strong>—</strong>';
  return `<strong>${esc(h===null?'—':show(h))}</strong><strong>${esc(a===null?'—':show(a))}</strong>`;
}
function signalFor(f){return signalMap.get(fixtureKey(f))||null}
function signalText(f){
  const s=signalFor(f);if(!s)return'NO SIGNAL';
  const market=String(s?.marketLabel||s?.market||'SIGNAL').toUpperCase();
  const selection=String(s?.selection||s?.selectedTeam||s?.selectedSide||'').trim();
  const odds=num(s?.odds);
  return [selection,market,odds!==null?Number(odds).toFixed(2):''].filter(Boolean).join(' · ');
}
function marketCompact(f,target){
  const roots=[f?.providerOdds,f?.odds,f?.markets].filter(Boolean);
  const aliases=target==='1X2'?['1x2','match winner','full time result','moneyline']:target==='AH'?['asian handicap','handicap','ah']:['over under','over/under','goals','total'];
  const seen=new Set();
  function walk(v,key='',depth=0){
    if(depth>6||v==null)return null;
    if(typeof v!=='object')return null;
    if(seen.has(v))return null;seen.add(v);
    const descriptor=[key,v.market,v.marketName,v.name,v.label,v.type].filter(Boolean).join(' ').toLowerCase();
    const hit=aliases.some(a=>descriptor.includes(a));
    if(hit){
      if(target==='1X2'){
        const h=num(v.home??v.homeOdds??v.h),d=num(v.draw??v.drawOdds??v.x),a=num(v.away??v.awayOdds??v.a);
        if(h!==null||d!==null||a!==null)return [h,d,a].map(x=>x===null?'—':x.toFixed(2)).join(' / ');
      }else{
        const line=num(v.line??v.handicap??v.total??v.value);
        const first=num(v.home??v.over??v.homeOdds??v.overOdds??v.priceHome??v.priceOver);
        const second=num(v.away??v.under??v.awayOdds??v.underOdds??v.priceAway??v.priceUnder);
        if(line!==null||first!==null||second!==null){
          const l=line===null?'':`${line>0&&target==='AH'?'+':''}${show(line,2)}`;
          const prices=[first,second].filter(x=>x!==null).map(x=>x.toFixed(2)).join('/');
          return [l,prices].filter(Boolean).join(' · ');
        }
      }
    }
    if(Array.isArray(v)){for(const x of v){const r=walk(x,key,depth+1);if(r)return r}}
    else{for(const [k,x] of Object.entries(v)){if(x&&typeof x==='object'){const r=walk(x,k,depth+1);if(r)return r}}}
    return null;
  }
  for(const root of roots){seen.clear();const found=walk(root);if(found)return found}
  return'—';
}
function metricRows(f){
  const st=f?.statistics||{};
  return [
    ['Shots on target',pair(st.shotsOnTarget),false],
    ['Shots off target',pair(st.shotsOffTarget),false],
    ['Corners',pair(f?.corners??st.corners),false],
    ['Attacks',pair(st.attacks),false],
    ['Dangerous attacks',pair(st.dangerousAttacks),false],
    ['Possession',pair(st.possession),true]
  ];
}
function statHtml(f){
  return metricRows(f).map(([label,p,pct])=>{
    const h=p.home,a=p.away,max=pct?100:Math.max(h??0,a??0,1),hw=h===null?0:Math.min(100,(h/max)*100),aw=a===null?0:Math.min(100,(a/max)*100);
    const hv=h===null?'—':`${show(h,pct?1:0)}${pct?'%':''}`,av=a===null?'—':`${show(a,pct?1:0)}${pct?'%':''}`;
    return `<div class="stat-row"><b>${esc(hv)}</b><div class="stat-track home"><i style="width:${hw}%"></i></div><span>${esc(label)}</span><div class="stat-track away"><i style="width:${aw}%"></i></div><b>${esc(av)}</b></div>`;
  }).join('');
}
function eventsHtml(f){
  const events=Array.isArray(f?.events)?f.events.slice():[];
  if(!events.length)return'';
  events.sort((a,b)=>(num(b?.minute)??0)-(num(a?.minute)??0));
  return `<div class="event-title">RECENT EVENTS</div>${events.slice(0,5).map(e=>`<div class="event-item"><time>${esc(num(e?.minute)!==null?`${Math.round(num(e.minute))}'`:'—')}</time><span>${esc(e?.type||e?.event||e?.name||'Match event')} ${e?.team?`· ${esc(e.team)}`:''}</span></div>`).join('')}`;
}
function statusLabel(key){return key==='live'?'LIVE MATCHES':key==='scheduled'?'UPCOMING MATCHES':key==='unknown'?'WAITING':'FINISHED MATCHES'}
function statusDotClass(key){return key==='live'?'live':key==='scheduled'?'upcoming':key==='unknown'?'waiting':'finished'}
function visibleRows(){
  return fixtures.filter(f=>{
    if(statusFilter!=='all'&&classify(f)!==statusFilter)return false;
    if(leagueFilter!=='all'&&leagueName(f)!==leagueFilter)return false;
    if(query){const hay=[leagueName(f),f?.home?.name,f?.away?.name].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(query))return false}
    return true;
  });
}
function groupByLeague(rows){
  const map=new Map();
  for(const f of rows){const key=leagueName(f);if(!map.has(key))map.set(key,[]);map.get(key).push(f)}
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}
function rowHtml(f){
  const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f);
  return `<article class="match-row ${active?'active':''}" data-match-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(f?.home?.name||'Home')} versus ${esc(f?.away?.name||'Away')}">
    <div class="teams-cell"><b>${esc(f?.home?.name||'—')}</b><b>${esc(f?.away?.name||'—')}</b><small>${esc(detailedStatus(f))}</small></div>
    <div class="score-cell">${scoreStack(f)}<small>${esc(kind==='live'?clockLabel(f):kind==='finished'?'FT':kickoffLabel(f))}</small></div>
    <div class="market-cell"><span>1X2</span><b>${esc(marketCompact(f,'1X2'))}</b></div>
    <div class="market-cell"><span>AH</span><b>${esc(marketCompact(f,'AH'))}</b></div>
    <div class="market-cell"><span>O/U</span><b>${esc(marketCompact(f,'OU'))}</b></div>
    <div class="signal-cell ${sig?'locked':''}">${sig?'SIGNAL':'WATCH'}</div>
  </article>`;
}
function renderBoard(){
  const host=$('[data-board-sections]');if(!host)return;
  const rows=visibleRows(),order=['live','scheduled','unknown','finished'];
  const html=[];
  for(const key of order){
    const all=rows.filter(f=>classify(f)===key);if(!all.length)continue;
    const open=expandedGroups.has(key),shown=open?all:all.slice(0,COLLAPSED_LIMIT),leagueGroups=groupByLeague(shown);
    html.push(`<section class="status-section" data-status-section="${key}"><header class="status-head"><div><i class="status-dot ${statusDotClass(key)}"></i><h2>${statusLabel(key)}</h2></div><b>${all.length}</b></header>${leagueGroups.map(([league,list])=>`<section class="league-block"><header class="league-head"><strong>${esc(league)}</strong><span>${list.length} match${list.length===1?'':'es'}</span></header>${list.map(rowHtml).join('')}</section>`).join('')}${all.length>COLLAPSED_LIMIT?`<div class="show-more"><button type="button" data-expand-group="${key}">${open?'Show less':`View all ${all.length}`}</button></div>`:''}</section>`);
  }
  host.innerHTML=html.length?html.join(''):'<div class="board-empty">No matches match the current filters.</div>';
  $$('[data-match-id]').forEach(el=>{
    const choose=()=>{selectedId=el.dataset.matchId;renderBoard();renderFeatured()};
    el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}});
  });
  $$('[data-expand-group]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.expandGroup;expandedGroups.has(k)?expandedGroups.delete(k):expandedGroups.add(k);renderBoard()}));
}
function renderCounts(){
  const counts={live:0,scheduled:0,unknown:0,finished:0};
  fixtures.forEach(f=>counts[classify(f)]++);
  for(const [k,v] of Object.entries(counts)){
    const a=$(`[data-filter-count="${k}"]`),b=$(`[data-overview="${k}"]`);if(a)a.textContent=v;if(b)b.textContent=v;
  }
  const all=$('[data-filter-count="all"]');if(all)all.textContent=fixtures.length;
  const sig=$('[data-signal-count]');if(sig)sig.textContent=signalMap.size;
}
function renderLeagueFilters(){
  const host=$('[data-league-filters]');if(!host)return;
  const map=new Map();for(const f of fixtures){const l=leagueName(f);map.set(l,(map.get(l)||0)+1)}
  host.innerHTML=[...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,count])=>`<button class="league-filter ${leagueFilter===name?'active':''}" data-league-filter="${esc(name)}"><span>${esc(name)}</span><b>${count}</b></button>`).join('')||'<div class="rail-empty">No leagues available</div>';
  $$('[data-league-filter]').forEach(btn=>btn.addEventListener('click',()=>{leagueFilter=leagueFilter===btn.dataset.leagueFilter?'all':btn.dataset.leagueFilter;renderLeagueFilters();renderBoard()}));
}
function renderFeatured(){
  let f=fixtures.find(x=>fixtureKey(x)===selectedId);
  if(!f)f=fixtures.find(x=>classify(x)==='live')||fixtures.find(x=>classify(x)==='scheduled')||fixtures[0];
  if(!f)return;
  selectedId=fixtureKey(f);
  const set=(sel,v)=>{const el=$(sel);if(el)el.textContent=v};
  set('[data-featured-league]',leagueName(f));set('[data-featured-status]',detailedStatus(f));set('[data-featured-home]',f?.home?.name||'—');set('[data-featured-away]',f?.away?.name||'—');set('[data-featured-score]',scoreLabel(f));
  const signal=$('[data-featured-signal]'),s=signalFor(f);if(signal){signal.textContent=s?signalText(f):'No active signal';signal.classList.toggle('locked',Boolean(s))}
  const stats=$('[data-featured-stats]');if(stats)stats.innerHTML=statHtml(f);
  const events=$('[data-featured-events]');if(events)events.innerHTML=eventsHtml(f);
}
function setState(ok,payload){
  const el=$('[data-state]');if(!el)return;el.classList.remove('live','warn');
  if(!ok){el.classList.add('warn');el.querySelector('span').textContent='Live data unavailable';return}
  el.classList.add('live');
  const age=num(payload?.ageMs),txt=age!==null?`Live data · ${Math.max(0,Math.round(age/1000))}s`:'Live data connected';
  el.querySelector('span').textContent=txt;
}
async function fetchJson(url){const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);return r.json()}
async function loadSignals(){
  try{
    const j=await fetchJson(SIGNALS_API),rows=Array.isArray(j?.signals)?j.signals:Array.isArray(j)?j:[];const next=new Map();
    rows.sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));
    for(const s of rows){const id=String(s?.fixtureId??s?.id??'').trim();if(id&&!next.has(id))next.set(id,s)}signalMap=next;
  }catch{signalMap=new Map()}
}
async function load(){
  if(loading||document.visibilityState==='hidden')return;loading=true;
  try{
    const [board]=await Promise.all([fetchJson(API),loadSignals()]);
    const rows=Array.isArray(board?.fixtures)?board.fixtures:Array.isArray(board?.matches)?board.matches:Array.isArray(board)?board:[];
    fixtures=rows.slice().sort((a,b)=>(dateMs(a?.kickoffAt??a?.kickoffUtc)??0)-(dateMs(b?.kickoffAt??b?.kickoffUtc)??0));
    if(selectedId&&!fixtures.some(f=>fixtureKey(f)===selectedId))selectedId=null;
    renderCounts();renderLeagueFilters();renderBoard();renderFeatured();setState(true,board);
  }catch(err){console.warn('Dashboard V2 refresh failed',err);setState(false,null)}finally{loading=false}
}
function setTheme(theme){
  const next=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=next;
  const btn=$('[data-theme-toggle]');if(btn)btn.textContent=next==='light'?'☾ Dark':'☀ Light';
  try{localStorage.setItem(THEME_KEY,next)}catch{}
}
function initControls(){
  $('[data-timezone]').textContent=timeZone;
  const stored=(()=>{try{return localStorage.getItem(THEME_KEY)}catch{return null}})();setTheme(stored==='dark'?'dark':'light');
  $('[data-theme-toggle]')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
  $$('[data-status-filter]').forEach(btn=>btn.addEventListener('click',()=>{statusFilter=btn.dataset.statusFilter;$$('[data-status-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderBoard()}));
  $('[data-search]')?.addEventListener('input',e=>{query=String(e.target.value||'').trim().toLowerCase();renderBoard()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
}
function start(){initControls();load();setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
