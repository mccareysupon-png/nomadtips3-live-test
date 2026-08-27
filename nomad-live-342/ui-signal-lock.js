(()=>{
'use strict';
const LEDGER_KEY='nomadLedger342';
const ARCHIVE_KEY='nomadSignalArchive342';
const FILTER_KEY='nomad342LiveFilterV1';
const PAGE_SIZE=50;
let selectedFilter='ALL';
let currentStatsPage=1;
let rendering=false;

function readRows(key){try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function writeRows(key,rows){try{localStorage.setItem(key,JSON.stringify(rows))}catch{}}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function fmtLine(v){const n=finite(v);if(n===null)return '—';const x=Number(n.toFixed(2));return `${x>0?'+':''}${x}`}
function fmtOdds(v){const n=finite(v);return n===null?'—':n.toFixed(2)}
function signalClock(ts){const d=new Date(ts);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}
function signalDateTime(ts){const d=new Date(ts);return Number.isNaN(d.getTime())?'—':d.toLocaleString()}
function phase(minute){const n=finite(minute);return n!==null&&n<=45?'1ST HALF':'2ND HALF'}
function rowId(row){return String(row?.id||'')}
function derivePick(row){if(row?.pick)return row.pick;const m=String(row?.match||'');return m.includes(' — ')?m.split(' — ')[0]:(m.split(' - ')[0]||'—')}

function fallbackLock(r){
  if(!r?.signal||!r?.m)return null;
  const o=r.price?.obs||{};
  return {id:String(r.m.id),ts:new Date().toISOString(),match:`${r.m.home} — ${r.m.away}`,pick:r.m.home,minute:r.m.minute,score:Array.isArray(r.m.score)?r.m.score.join('–'):'—',line:fmtLine(o.decodedHomeLine),rawLine:o.rawHomeLine||'',odds:o.homeOddsDecimal??null,rawOdds:o.homeOddsRaw??null,oddsFormat:o.oddsFormat||'HK',source:'M88',result:'PENDING',eventSource:'TotalCorner',reason:'TOTALCORNER EVENT PASS + M88 PRICE CONFIRMED'};
}
function normalizeRecord(row){return {...row,id:rowId(row),pick:derivePick(row),result:String(row?.result||'PENDING').toUpperCase()}}
function mergeSignalRows(extra=[]){
  const archive=readRows(ARCHIVE_KEY).map(normalizeRecord);
  const ledger=readRows(LEDGER_KEY).map(normalizeRecord);
  const byId=new Map();
  for(const raw of [...archive,...ledger,...extra.map(normalizeRecord)]){
    const id=rowId(raw);if(!id)continue;
    const current=byId.get(id);
    if(!current){byId.set(id,{...raw});continue;}
    const ct=Date.parse(current.ts||'')||Number.MAX_SAFE_INTEGER;
    const rt=Date.parse(raw.ts||'')||Number.MAX_SAFE_INTEGER;
    const entry=rt<ct?raw:current;
    const settledRaw=raw.result&&raw.result!=='PENDING';
    const settledCurrent=current.result&&current.result!=='PENDING';
    byId.set(id,{...current,...raw,ts:entry.ts,minute:entry.minute,score:entry.score,line:entry.line,rawLine:entry.rawLine,odds:entry.odds,rawOdds:entry.rawOdds,oddsFormat:entry.oddsFormat,source:entry.source||'M88',pick:entry.pick||current.pick||raw.pick,result:settledRaw?raw.result:settledCurrent?current.result:(raw.result||current.result||'PENDING'),finalScore:raw.finalScore??current.finalScore,pl:raw.pl??current.pl});
  }
  const rows=[...byId.values()].sort((a,b)=>(Date.parse(b.ts||'')||0)-(Date.parse(a.ts||'')||0));
  writeRows(ARCHIVE_KEY,rows);
  return rows;
}
function syncLiveArchive(results){
  const existing=mergeSignalRows();
  const map=new Map(existing.map(r=>[rowId(r),r]));
  const ledger=new Map(readRows(LEDGER_KEY).map(r=>[rowId(r),normalizeRecord(r)]));
  const extras=[];
  for(const r of results){
    if(!r?.signal||!r?.m)continue;
    const id=String(r.m.id);
    if(map.has(id))continue;
    const base=ledger.get(id)||fallbackLock(r);
    if(base)extras.push({...base,pick:r.m.home,match:`${r.m.home} — ${r.m.away}`});
  }
  return extras.length?mergeSignalRows(extras):existing;
}
function eventMetric(r,key,fallback='—'){const v=r?.event?.metrics?.[key];return v===null||v===undefined?fallback:v}
function currentLine(r){return fmtLine(r?.price?.obs?.decodedHomeLine)}
function currentOdds(r){return fmtOdds(r?.price?.obs?.homeOddsDecimal)}
function stateFor(r,lock){if(lock)return 'SIGNAL';return r?.candidate?'NEAR SIGNAL':'WATCHING'}
function stateClass(state){return state==='SIGNAL'?'signal':state==='NEAR SIGNAL'?'near':'watch'}
function metricText(value){return value===null||value===undefined||value===''?'—':String(value)}
function proofValue(lock,r,key){if(!lock)return key==='line'?currentLine(r):key==='odds'?currentOdds(r):'—';return key==='line'?(lock.line??'—'):key==='odds'?fmtOdds(lock.odds):(lock[key]??'—')}

function cardHtml(r,lock){
  const m=r.m||{};
  const state=stateFor(r,lock);
  const cls=stateClass(state);
  const score=Array.isArray(m.score)?m.score.join('–'):'—';
  const minute=metricText(m.minute);
  const pressure=eventMetric(r,'pressureShare',null);
  const attacks=eventMetric(r,'attacks');
  const dangerous=eventMetric(r,'dangerous');
  const sot=eventMetric(r,'sotDelta');
  const off=eventMetric(r,'offDelta');
  const corner=eventMetric(r,'cornerDelta');
  const line=proofValue(lock,r,'line');
  const odds=proofValue(lock,r,'odds');
  const entryScore=lock?.score||'—';
  const entryMinute=lock?.minute??'—';
  const sigTime=lock?signalClock(lock.ts):'—';
  const pick=lock?.pick||m.home||'—';
  const marketStatus=lock?'LOCKED':r.candidate?(r.price?.reason||'M88 WAIT'):'WAIT EVENT';
  const gateText=lock?'PASS':r.candidate?'NEAR':'WATCH';
  const reasons=(r.event?.reasons||[]).join(' · ')||'Waiting for live conditions';
  const search=`${m.home||''} ${m.away||''} ${m.league||''}`.toLowerCase();
  return `<details class="match-wrap ${lock?'signal':''}" data-match-id="${esc(m.id||'')}" data-state="${esc(state)}" data-signal-status="${lock?'LOCKED':''}" data-search="${esc(search)}">
    <summary class="match-row">
      <div class="statebox"><span class="state ${cls}">${esc(state)}</span><span class="minute">${esc(minute)}'</span>${state==='WATCHING'?'<span class="watch-pulse" aria-hidden="true"></span>':''}</div>
      <div class="match-main"><span class="league">${esc(m.league||'—')}</span><span class="teams">${esc(m.home||'—')} — ${esc(m.away||'—')}</span></div>
      <div class="score score-live-stack"><span class="score-live-head">● LIVE · ${esc(phase(m.minute))}</span><span class="score-live-value">${esc(score)}</span><span class="score-live-time">◷ ${esc(minute)}′</span>${lock?`<span class="entry-score">ENTRY ${esc(entryScore)}</span><span class="signal-time">SIGNAL ${esc(sigTime)}</span>`:''}</div>
      <div class="quick"><div class="q"><span>PRESSURE</span><b>${pressure===null?'—':esc(pressure)+'%'}</b></div><div class="q"><span>ATT Δ H/A</span><b>${esc(attacks)}</b></div><div class="q"><span>DANGER Δ</span><b>${esc(dangerous)}</b></div></div>
      <div class="market"><div class="market-label"><span>PRICE JUDGE</span><b>M88</b></div><div class="price-selected-row"><span class="price-selected-name">${lock?'LOCKED':'CURRENT'}</span><span class="price-selected-value">${esc(pick)} · HOME AH ${esc(line)} @ ${esc(odds)}</span></div></div>
      <div class="cond"><span>CONDITION</span><strong class="${lock?'pass':'warn'}">${esc(gateText)}</strong></div>
    </summary>
    <div class="match-detail">
      <section class="detail-card"><h3>TOTALCORNER EVENT</h3><div class="kv"><span>Rolling Window</span><b>${r.event?.metrics?`${esc(eventMetric(r,'from'))}'–${esc(eventMetric(r,'to'))}'`:'—'}</b></div><div class="kv"><span>HOME Pressure</span><b>${pressure===null?'—':esc(pressure)+'%'}</b></div><div class="kv"><span>Attack Δ H/A</span><b>${esc(attacks)}</b></div><div class="kv"><span>Dangerous Δ H/A</span><b>${esc(dangerous)}</b></div><div class="kv"><span>SOT / OFF / COR</span><b>${esc(sot)} / ${esc(off)} / ${esc(corner)}</b></div><div class="kv"><span>Event Gate</span><b class="${r.event?.pass?'oktxt':'waittxt'}">${r.event?.pass?'PASS':'WAIT'}</b></div></section>
      <section class="detail-card"><h3>M88 · DECISION</h3><div class="kv"><span>Price Status</span><b>${esc(r.price?.obs?.status||'WAIT')}</b></div><div class="kv"><span>HOME AH</span><b>${esc(line)}</b></div><div class="kv"><span>Odds</span><b>${esc(odds)}</b></div><div class="kv"><span>Verdict</span><b>${esc(marketStatus)}</b></div><div class="detail-proof"><div><span>ENTRY MIN</span><b>${lock?esc(entryMinute)+"'":'—'}</b></div><div><span>ENTRY SCORE</span><b>${esc(entryScore)}</b></div><div><span>SIGNAL TIME</span><b>${esc(sigTime)}</b></div></div>${lock?`<div class="signal-lock-line"><strong>SIGNAL LOCKED</strong> · ${esc(pick)} · HOME AH ${esc(line)} @ ${esc(odds)} · Entry ${esc(entryMinute)}' ${esc(entryScore)}</div>`:''}</section>
      <div class="reason-line" style="grid-column:1/-1">${esc(reasons)}</div>
    </div>
  </details>`;
}

function loadFilter(){try{const v=String(localStorage.getItem(FILTER_KEY)||'ALL').toUpperCase();selectedFilter=['ALL','SIGNAL','NEAR','WATCHING'].includes(v)?v:'ALL'}catch{selectedFilter='ALL'}}
function syncTabs(){document.querySelectorAll('.tabs .tab').forEach(tab=>{const active=String(tab.textContent||'').trim().toUpperCase()===selectedFilter;tab.dataset.active=active?'1':'0';tab.setAttribute('aria-pressed',active?'true':'false')})}
function applyFilters(){
  const list=document.getElementById('matchList');if(!list)return;
  syncTabs();
  const q=String(document.querySelector('.search input')?.value||'').trim().toLowerCase();
  [...list.querySelectorAll('.match-wrap')].forEach(row=>{
    const state=String(row.dataset.state||'').toUpperCase();
    const stateOk=selectedFilter==='ALL'||selectedFilter===state||(selectedFilter==='NEAR'&&state==='NEAR SIGNAL');
    const searchOk=!q||String(row.dataset.search||'').includes(q);
    row.style.display=stateOk&&searchOk?'':'none';
  });
}
function updateMetrics(results,locks){
  const states=results.map(r=>stateFor(r,locks.get(String(r.m?.id||''))));
  const values={liveCount:results.length,watchCount:states.filter(x=>x==='WATCHING').length,candidateCount:states.filter(x=>x==='NEAR SIGNAL').length,signalCount:states.filter(x=>x==='SIGNAL').length};
  Object.entries(values).forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.textContent=String(v)});
}
function renderLiveShell(){
  if(rendering||document.body?.dataset?.page!=='live')return;
  const list=document.getElementById('matchList');if(!list)return;
  const rawCards=[...list.querySelectorAll(':scope > .signal-card')];
  if(!rawCards.length)return;
  const results=Array.isArray(window.__nomad342LiveResults)?window.__nomad342LiveResults:[];
  if(!results.length)return;
  rendering=true;
  try{
    const archive=syncLiveArchive(results);
    const locks=new Map(archive.map(row=>[rowId(row),row]));
    list.innerHTML=results.map(r=>cardHtml(r,locks.get(String(r.m?.id||'')))).join('');
    updateMetrics(results,locks);
    applyFilters();
  }finally{rendering=false}
}
function bindLiveControls(){
  loadFilter();syncTabs();
  document.querySelectorAll('.tabs .tab').forEach(tab=>tab.addEventListener('click',()=>{const name=String(tab.textContent||'').trim().toUpperCase();const next=name==='NEAR'?'NEAR':name;if(['ALL','SIGNAL','NEAR','WATCHING'].includes(next)){selectedFilter=next;try{localStorage.setItem(FILTER_KEY,next)}catch{}applyFilters()}}));
  document.querySelector('.search input')?.addEventListener('input',()=>requestAnimationFrame(applyFilters));
  const list=document.getElementById('matchList');
  if(list)new MutationObserver(()=>requestAnimationFrame(renderLiveShell)).observe(list,{childList:true,subtree:false});
  requestAnimationFrame(renderLiveShell);
}

function resultPl(row){
  const explicit=finite(row?.pl);if(explicit!==null)return explicit;
  const result=String(row?.result||'PENDING').toUpperCase();const odds=finite(row?.odds);
  if(result==='WIN'&&odds!==null)return odds-1;if(result==='LOSS')return -1;if(result==='PUSH'||result==='DRAW')return 0;return null;
}
function pageSequence(total,current){if(total<=7)return Array.from({length:total},(_,i)=>i+1);const keep=new Set([1,total,current,current-1,current+1]);if(current<=3)[2,3,4].forEach(x=>keep.add(x));if(current>=total-2)[total-3,total-2,total-1].forEach(x=>keep.add(x));const pages=[...keep].filter(x=>x>=1&&x<=total).sort((a,b)=>a-b);const out=[];pages.forEach((p,i)=>{if(i&&p-pages[i-1]>1)out.push('…');out.push(p)});return out}
function statsButton(label,page,{active=false,disabled=false}={}){return `<button type="button" class="stats-page-button${active?' is-active':''}" data-page="${page}"${disabled?' disabled':''}${active?' aria-current="page"':''}>${label}</button>`}
function updateStatsSummary(rows){
  const settled=rows.filter(r=>['WIN','LOSS','PUSH','DRAW'].includes(String(r.result||'').toUpperCase()));
  const wins=settled.filter(r=>String(r.result).toUpperCase()==='WIN').length;
  const losses=settled.filter(r=>String(r.result).toUpperCase()==='LOSS').length;
  const pushes=settled.filter(r=>['PUSH','DRAW'].includes(String(r.result).toUpperCase())).length;
  const decisive=wins+losses;const winRate=decisive?wins/decisive*100:0;
  const priced=rows.map(r=>finite(r.odds)).filter(v=>v!==null);const avg=priced.length?priced.reduce((a,b)=>a+b,0)/priced.length:null;
  const pls=rows.map(resultPl).filter(v=>v!==null);const roi=pls.length?pls.reduce((a,b)=>a+b,0)/pls.length*100:0;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  set('totalSignals',String(rows.length));set('winRate',`${winRate.toFixed(1)}%`);set('avgOdds',avg===null?'—':avg.toFixed(2));set('roi',`${roi>=0?'+':''}${roi.toFixed(1)}%`);
  const ledgerMeta=document.getElementById('ledgerMeta');if(ledgerMeta)ledgerMeta.textContent=`WIN ${wins} · LOSS ${losses} · PUSH ${pushes}`;
}
function renderStats(){
  if(document.body?.dataset?.page!=='statistics')return;
  const tbody=document.getElementById('statsBody');const pager=document.querySelector('[data-stats-pagination]');if(!tbody||!pager)return;
  const rows=mergeSignalRows();updateStatsSummary(rows);
  const params=new URL(window.location.href).searchParams;const fromUrl=Number(params.get('page'));if(Number.isInteger(fromUrl)&&fromUrl>0)currentStatsPage=fromUrl;
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));currentStatsPage=Math.min(Math.max(1,currentStatsPage),totalPages);
  const start=(currentStatsPage-1)*PAGE_SIZE;const pageRows=rows.slice(start,start+PAGE_SIZE);
  tbody.innerHTML=pageRows.length?pageRows.map(r=>{const pl=resultPl(r);const res=String(r.result||'PENDING').toUpperCase();const cls=res==='WIN'?'win':res==='LOSS'?'loss':'waittxt';return `<tr><td>${esc(signalDateTime(r.ts))}</td><td>${esc(r.match||'—')}</td><td>${esc(r.pick||derivePick(r)||'—')}</td><td>HOME ${esc(r.line??'—')}</td><td>${esc(fmtOdds(r.odds))}</td><td>${esc(r.source||'M88')}</td><td>${esc(r.minute??'—')}' · ${esc(r.score||'—')}</td><td>${esc(r.finalScore||r.final||'—')}</td><td class="${cls}">${esc(res)}</td><td>${pl===null?'—':`${pl>=0?'+':''}${pl.toFixed(2)}`}</td></tr>`}).join(''):'<tr><td colspan="10">No locked signals yet.</td></tr>';
  if(totalPages<=1){pager.hidden=true;pager.innerHTML='';return}
  pager.hidden=false;const from=rows.length?start+1:0;const to=Math.min(start+PAGE_SIZE,rows.length);
  const numbered=pageSequence(totalPages,currentStatsPage).map(x=>x==='…'?'<span class="stats-page-ellipsis">…</span>':statsButton(String(x),x,{active:x===currentStatsPage})).join('');
  pager.innerHTML=`<span class="stats-page-summary">${from}–${to} / ${rows.length} · 50 per page</span><span class="stats-page-controls">${statsButton('Previous',currentStatsPage-1,{disabled:currentStatsPage===1})}${numbered}${statsButton('Next',currentStatsPage+1,{disabled:currentStatsPage===totalPages})}</span>`;
  pager.querySelectorAll('button[data-page]:not([disabled])').forEach(btn=>btn.addEventListener('click',()=>{currentStatsPage=Number(btn.dataset.page)||1;const url=new URL(window.location.href);if(currentStatsPage<=1)url.searchParams.delete('page');else url.searchParams.set('page',String(currentStatsPage));history.pushState({page:currentStatsPage},'',`${url.pathname}${url.search}${url.hash}`);renderStats();window.scrollTo({top:0,behavior:'smooth'})}));
}
function start(){const page=document.body?.dataset?.page;if(page==='live')bindLiveControls();if(page==='statistics'){renderStats();window.addEventListener('popstate',()=>{currentStatsPage=1;renderStats()})}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
