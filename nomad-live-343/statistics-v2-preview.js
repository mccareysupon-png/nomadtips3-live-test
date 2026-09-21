(()=>{
'use strict';
const STAT_API='/api/engine/statistics';
const SIGNAL_API='/api/engine/signals';
const BOARD_API='/api/engine/board';
const POLL_MS=45000;
const PAGE_SIZE=25;
const TZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}})();
const LOCALE=(()=>{try{return navigator.language||'en-GB'}catch{return'en-GB'}})();
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const show=v=>v===null||v===undefined||v===''?'—':String(v);
const score=v=>{if(typeof v==='string'&&v.trim())return v;if(Array.isArray(v))return`${show(v[0])}-${show(v[1])}`;if(v&&typeof v==='object')return`${show(v.home??v.h)}-${show(v.away??v.a)}`;return'—'};
const when=v=>{const n=num(v);if(n===null)return'—';const ms=n<1e12?n*1000:n;try{return new Intl.DateTimeFormat(LOCALE,{timeZone:TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms))}catch{return'—'}};

const REGISTRY=[
  {id:'all',label:'Total',title:'Total · All Markets',description:'All settled Ball46 signals across every tracked market.'},
  {id:'1x2',label:'1X2',title:'1X2 · Match Result',description:'Settled home, draw and away match-result signals.'},
  {id:'ah',label:'Asian Handicap',title:'AH · Asian Handicap',description:'Settled Asian Handicap signals grouped by side and line.'},
  {id:'ou',label:'Over / Under',title:'Over / Under · Totals',description:'Settled goal-total signals grouped by direction and line.'},
  {id:'btts',label:'BTTS',title:'BTTS · Both Teams To Score',description:'Settled Yes / No both-teams-to-score signals.'},
  {id:'corners',label:'Corners',title:'Corners · Market Results',description:'Settled corner markets and corner handicaps.'},
  {id:'cards',label:'Cards',title:'Cards · Market Results',description:'Settled card markets and card handicaps.'},
  {id:'other',label:'Other',title:'Other · Remaining Markets',description:'Settled markets outside the primary Ball46 groups.'}
];
const state={market:'all',filter:'all',page:1,stats:null,rows:[],signals:[],board:null,lastUpdated:0,usingFallback:false};

function marketKey(row){
  const raw=String(row?.marketLabel||row?.market||row?.providerMarket||'').toLowerCase().replace(/[·/\\-]+/g,'_');
  if(/corner/.test(raw))return'corners';
  if(/card/.test(raw))return'cards';
  if(/btts|both_teams|both teams/.test(raw))return'btts';
  if(/asian|handicap|(^|_)ah(_|$)/.test(raw))return'ah';
  if(/over|under|total|o_u|ou/.test(raw))return'ou';
  if(/1x2|moneyline|match_result|match winner|winner|three_way|3way/.test(raw))return'1x2';
  return'other';
}
function selectionKey(row){
  const x=String(row?.selection||row?.pick||'').trim().toUpperCase();
  if(x.includes('HOME'))return'home';
  if(x.includes('AWAY'))return'away';
  if(x.includes('DRAW')||x==='X')return'draw';
  if(x.includes('OVER'))return'over';
  if(x.includes('UNDER'))return'under';
  if(x==='YES'||x.includes('BTTS YES'))return'yes';
  if(x==='NO'||x.includes('BTTS NO'))return'no';
  return x.toLowerCase().replace(/[^a-z0-9]+/g,'_')||'other';
}
function outcome(row){return String(row?.result||row?.settlement||row?.outcome||'').toUpperCase()}
function outcomeClass(x){return x==='WIN'||x==='HALF_WIN'?'win':x==='LOSS'||x==='HALF_LOSS'?'loss':'push'}
function outcomeWeight(x){if(x==='WIN')return 1;if(x==='HALF_WIN')return .5;if(x==='LOSS')return-1;if(x==='HALF_LOSS')return-.5;return 0}
function marketLabel(row){return show(row?.marketLabel||row?.market||row?.providerMarket)}
function selectionLabel(row){
  const x=String(row?.selection||'').toUpperCase();
  if(x==='HOME')return row?.home?.name||'HOME';
  if(x==='AWAY')return row?.away?.name||'AWAY';
  if(x==='DRAW')return'DRAW';
  return show(row?.selection||row?.pick).toUpperCase();
}
function lineLabel(row){const n=num(row?.line);if(n===null)return'—';const txt=Number.isInteger(n)?String(n):String(Math.round(n*100)/100);return marketKey(row)==='ah'&&n>0?`+${txt}`:txt}
function fixtureId(row){return String(row?.fixtureId??row?.matchId??row?.id??'')}
function createdAt(row){return num(row?.settledAt??row?.createdAt??row?.timestamp??0)||0}

function parseRoute(){
  const q=new URLSearchParams(location.search);const m=q.get('market');const f=q.get('filter');
  if(REGISTRY.some(x=>x.id===m))state.market=m;
  if(f)state.filter=f;
}
function writeRoute(){
  const q=new URLSearchParams();if(state.market!=='all')q.set('market',state.market);if(state.filter!=='all')q.set('filter',state.filter);
  const next=`${location.pathname}${q.toString()?`?${q}`:''}`;history.replaceState(null,'',next);
}
function marketRows(id){return id==='all'?state.rows:state.rows.filter(r=>marketKey(r)===id)}
function filteredRows(){
  let rows=marketRows(state.market);
  if(state.filter!=='all')rows=rows.filter(r=>selectionKey(r)===state.filter);
  return rows.sort((a,b)=>createdAt(b)-createdAt(a));
}
function countsByMarket(){const out=Object.fromEntries(REGISTRY.map(x=>[x.id,0]));out.all=state.rows.length;for(const r of state.rows){out[marketKey(r)]++}return out}
function filtersForMarket(id){
  if(id==='all')return[{id:'all',label:'All results'}];
  const rows=marketRows(id);const map=new Map();map.set('all','All');
  const preferred={home:'Home',draw:'Draw',away:'Away',over:'Over',under:'Under',yes:'Yes',no:'No'};
  for(const r of rows){const k=selectionKey(r);if(!map.has(k))map.set(k,preferred[k]||String(r?.selection||k).toUpperCase())}
  const order=['all','home','draw','away','over','under','yes','no'];
  return [...map.entries()].map(([id,label])=>({id,label,count:id==='all'?rows.length:rows.filter(r=>selectionKey(r)===id).length})).sort((a,b)=>{
    const ai=order.indexOf(a.id),bi=order.indexOf(b.id);if(ai!==-1||bi!==-1)return(ai===-1?99:ai)-(bi===-1?99:bi);return b.count-a.count;
  });
}
function activeRegistry(){return REGISTRY.find(x=>x.id===state.market)||REGISTRY[0]}

function renderNavigation(){
  const nav=$('[data-market-nav]');if(!nav)return;const counts=countsByMarket();
  nav.innerHTML=REGISTRY.map(item=>`<button class="market-btn ${state.market===item.id?'active':''}" type="button" data-market="${item.id}"><span>${esc(item.label)}</span><i class="caret">›</i><b>${esc(counts[item.id]||0)}</b></button>`).join('');
  $$('[data-market]').forEach(btn=>btn.addEventListener('click',()=>{state.market=btn.dataset.market;state.filter='all';state.page=1;writeRoute();renderAll()}));
  renderSubnav();
}
function renderSubnav(){
  const slot=$('[data-subnav-slot]');if(!slot)return;const filters=filtersForMarket(state.market);const label=activeRegistry().label;
  if(!filters.some(x=>x.id===state.filter))state.filter='all';
  slot.innerHTML=`<div class="subnav-caption">${esc(label.toUpperCase())} FILTERS</div>${filters.slice(0,7).map(f=>`<button class="subnav-btn ${state.filter===f.id?'active':''}" type="button" data-subfilter="${esc(f.id)}"><span>${esc(f.label)}</span><b>${esc(f.count??marketRows(state.market).length)}</b></button>`).join('')}`;
  $$('[data-subfilter]').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.subfilter;state.page=1;writeRoute();renderAll()}));
}
function renderHero(){const r=activeRegistry();$('[data-view-title]').textContent=r.title;$('[data-view-subtitle]').textContent=r.description;const f=filtersForMarket(state.market).find(x=>x.id===state.filter);$('[data-filter-label]').textContent=f?.label||'All results';$('[data-results-title]').textContent=state.filter==='all'?`${r.label} settled signals`:`${r.label} · ${f?.label||state.filter}`}
function renderKpis(rows){
  let win=0,loss=0,push=0;for(const r of rows){const c=outcomeClass(outcome(r));if(c==='win')win++;else if(c==='loss')loss++;else push++}
  const rate=(win+loss)?(win/(win+loss)*100):null;const odds=rows.map(r=>num(r?.odds)).filter(v=>v!==null&&v>1);const avg=odds.length?odds.reduce((a,b)=>a+b,0)/odds.length:null;
  const vals={total:rows.length,win,loss,push,rate:rate===null?'—':`${rate.toFixed(1)}%`,odds:avg===null?'—':avg.toFixed(2)};for(const[k,v]of Object.entries(vals)){const el=$(`[data-kpi="${k}"]`);if(el)el.textContent=v}
}
function renderGraph(rows){
  const path=$('[data-spark-path]');if(!path)return;const data=[...rows].sort((a,b)=>createdAt(a)-createdAt(b)).slice(-30);$('[data-range-note]').textContent=data.length?`Last ${data.length} settled signals`:'No settled signals';
  if(!data.length){path.setAttribute('d','M0 36 L1000 36');return}
  let total=0;const pts=data.map((r,i)=>{total+=outcomeWeight(outcome(r));return{x:i,y:total}});const ys=pts.map(p=>p.y);const min=Math.min(0,...ys),max=Math.max(0,...ys),span=Math.max(1,max-min);const d=pts.map((p,i)=>{const x=pts.length===1?500:(p.x/(pts.length-1))*1000;const y=64-((p.y-min)/span)*56;return`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`}).join(' ');path.setAttribute('d',d)
}
function renderFilterChips(){const wrap=$('[data-filter-chips]');if(!wrap)return;const filters=filtersForMarket(state.market);wrap.innerHTML=filters.map(f=>`<button type="button" class="filter-chip ${state.filter===f.id?'active':''}" data-chip="${esc(f.id)}">${esc(f.label)}${f.count===undefined?'':` · ${f.count}`}</button>`).join('');$$('[data-chip]').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.chip;state.page=1;writeRoute();renderAll()}))}
function renderTable(rows){
  const body=$('[data-results-body]');if(!body)return;const total=rows.length;const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));if(state.page>pages)state.page=pages;const start=(state.page-1)*PAGE_SIZE;const pageRows=rows.slice(start,start+PAGE_SIZE);$('[data-record-count]').textContent=`${total} record${total===1?'':'s'}`;
  body.innerHTML=pageRows.length?pageRows.map(r=>{const league=[r?.league?.country,r?.league?.name].filter(Boolean).join(' · ');const result=outcome(r)||'PUSH';return`<tr><td>${esc(when(createdAt(r)))}</td><td><div class="match-cell"><strong>${esc(r?.home?.name||'—')} — ${esc(r?.away?.name||'—')}</strong><small>${esc(league||`Match ${fixtureId(r)||'—'}`)}</small></div></td><td>${esc(marketLabel(r))}</td><td>${esc(selectionLabel(r))}</td><td>${esc(lineLabel(r))}</td><td class="odds">${esc(show(r?.odds))}</td><td>${esc(score(r?.entryScore??r?.scoreAt))}</td><td>${esc(score(r?.finalScore))}</td><td><span class="result-pill ${outcomeClass(result)}">${esc(result)}</span></td></tr>`}).join(''):'<tr><td colspan="9"><div class="table-empty">No settled results in this view.</div></td></tr>';
  renderPager(pages)
}
function renderPager(pages){const el=$('[data-pager]');if(!el)return;if(pages<=1){el.innerHTML='';return}const nums=[];for(let p=1;p<=pages;p++){if(p===1||p===pages||Math.abs(p-state.page)<=1)nums.push(p)}let last=0;const html=[];html.push(`<button class="page-btn" data-page="${Math.max(1,state.page-1)}" ${state.page===1?'disabled':''}>‹</button>`);for(const p of nums){if(last&&p-last>1)html.push('<span>…</span>');html.push(`<button class="page-btn ${p===state.page?'active':''}" data-page="${p}">${p}</button>`);last=p}html.push(`<button class="page-btn" data-page="${Math.min(pages,state.page+1)}" ${state.page===pages?'disabled':''}>›</button>`);el.innerHTML=html.join('');$$('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{state.page=Number(btn.dataset.page)||1;renderTable(filteredRows())}))}
function renderBoardCounts(){
  const fixtures=Array.isArray(state.board?.fixtures)?state.board.fixtures:[];const c={all:fixtures.length,live:0,scheduled:0,unknown:0,finished:0};for(const f of fixtures){const x=String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase();if(/finish|full.?time|ended|\bft\b/.test(x))c.finished++;else if(/live|in.?play|playing|\b1h\b|\b2h\b/.test(x))c.live++;else if(/schedule|upcoming|not.?started|\bns\b/.test(x))c.scheduled++;else c.unknown++}for(const[k,v]of Object.entries(c)){const el=$(`[data-board-count="${k}"]`);if(el)el.textContent=v}const sig=$('[data-signal-count]');if(sig)sig.textContent=state.signals.length}
function renderAll(){const rows=filteredRows();renderNavigation();renderHero();renderKpis(rows);renderGraph(rows);renderFilterChips();renderTable(rows);renderBoardCounts();$('[data-last-sync]').textContent=state.lastUpdated?when(state.lastUpdated):'—'}
function setFeed(type,text){const el=$('[data-feed-state]');if(!el)return;el.className=`feed-state ${type||''}`;el.innerHTML=`<i></i><span>${esc(text)}</span>`}

function fallbackRows(){
  const teams=[['Arsenal','Everton'],['Inter','Torino'],['Sevilla','Valencia'],['Dortmund','Mainz'],['Lyon','Nantes'],['Benfica','Braga'],['Ajax','Utrecht'],['Celtic','Hearts'],['Porto','Boavista'],['Milan','Udinese'],['Roma','Genoa'],['PSV','Twente']];
  const defs=[['AH','HOME',-.5,'WIN'],['O/U','OVER',2.5,'WIN'],['1X2','HOME',null,'LOSS'],['AH','AWAY',.25,'PUSH'],['O/U','UNDER',3.5,'WIN'],['1X2','AWAY',null,'WIN'],['BTTS','YES',null,'LOSS']];const now=Date.now();const rows=[];for(let i=0;i<42;i++){const t=teams[i%teams.length],d=defs[i%defs.length];rows.push({fixtureId:`P${1000+i}`,createdAt:now-i*5.6e6,home:{name:t[0]},away:{name:t[1]},league:{country:'Preview',name:'Ball46 League'},market:d[0],marketLabel:d[0],selection:d[1],line:d[2],odds:(1.62+(i%8)*.07).toFixed(2),entryScore:{home:i%2,away:0},finalScore:{home:1+(i%3),away:i%2},result:d[3]})}return rows
}
async function load(){
  try{
    const stamp=Date.now();const [sr,lr,br]=await Promise.all([
      fetch(`${STAT_API}?_=${stamp}`,{cache:'no-store'}),fetch(`${SIGNAL_API}?_=${stamp}`,{cache:'no-store'}),fetch(`${BOARD_API}?_=${stamp}`,{cache:'no-store'})
    ]);const sj=await sr.json();if(!sr.ok||sj?.ok!==true||!Array.isArray(sj?.rows))throw new Error('statistics unavailable');state.stats=sj;state.rows=sj.rows;state.signals=lr.ok?(await lr.json().catch(()=>({signals:[]})))?.signals||[]:[];state.board=br.ok?await br.json().catch(()=>null):null;state.lastUpdated=Date.now();state.usingFallback=false;setFeed('live',`Statistics online · ${state.rows.length} settled`);renderAll()
  }catch(err){console.warn('Statistics V2 preview feed error',err);if(!state.rows.length){state.rows=fallbackRows();state.signals=[];state.board={fixtures:[]};state.lastUpdated=Date.now();state.usingFallback=true;setFeed('warn','Preview mode · live feed unavailable');renderAll()}else setFeed('warn','Using last successful statistics snapshot')}
}
parseRoute();load();setInterval(load,POLL_MS);window.addEventListener('popstate',()=>{parseRoute();renderAll()});
})();
