(()=>{
'use strict';
const LEDGER_KEY='nomadLedger342';
const ARCHIVE_KEY='nomadSignalArchive342';
const PAGE_SIZE=50;
let statsPage=1;

function readRows(key){
  try{
    const rows=JSON.parse(localStorage.getItem(key)||'[]');
    return Array.isArray(rows)?rows:[];
  }catch{return [];}
}
function writeRows(key,rows){
  try{localStorage.setItem(key,JSON.stringify(rows));}catch{}
}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));}
function rowId(row){return String(row?.id||'');}
function signalTime(ts){
  const d=new Date(ts);
  if(Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function signalDateTime(ts){
  const d=new Date(ts);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString();
}
function mergeArchive(extra=[]){
  const archive=readRows(ARCHIVE_KEY);
  const ledger=readRows(LEDGER_KEY);
  const byId=new Map();
  for(const row of [...archive,...ledger,...extra]){
    const id=rowId(row);
    if(!id) continue;
    const current=byId.get(id);
    if(!current||new Date(row.ts||0).getTime()<new Date(current.ts||0).getTime()) byId.set(id,{...current,...row,id});
  }
  const rows=[...byId.values()].sort((a,b)=>new Date(b.ts||0)-new Date(a.ts||0));
  writeRows(ARCHIVE_KEY,rows);
  return rows;
}
function fallbackLock(r){
  const o=r?.price?.obs;
  if(!r?.signal||!r?.m) return null;
  return {
    id:String(r.m.id),
    ts:new Date().toISOString(),
    match:`${r.m.home} — ${r.m.away}`,
    pick:r.m.home,
    minute:r.m.minute,
    score:Array.isArray(r.m.score)?r.m.score.join('–'):'—',
    line:o?.decodedHomeLine==null?'—':`${Number(o.decodedHomeLine)>0?'+':''}${Number(o.decodedHomeLine)}`,
    rawLine:o?.rawHomeLine??'',
    odds:o?.homeOddsDecimal??null,
    rawOdds:o?.homeOddsRaw??null,
    oddsFormat:o?.oddsFormat||'HK',
    source:'M88',
    result:'PENDING',
    eventSource:'TotalCorner',
    reason:'TOTALCORNER EVENT PASS + M88 PRICE CONFIRMED'
  };
}
function syncLiveArchive(results){
  const ledger=readRows(LEDGER_KEY);
  const ledgerById=new Map(ledger.map(x=>[rowId(x),x]));
  const extras=[];
  for(const r of results){
    if(!r?.signal) continue;
    extras.push(ledgerById.get(String(r.m.id))||fallbackLock(r));
  }
  return mergeArchive(extras.filter(Boolean));
}
function currentLine(r){
  const n=r?.price?.obs?.decodedHomeLine;
  if(n==null||!Number.isFinite(Number(n))) return '—';
  const x=Number(Number(n).toFixed(2));
  return `${x>0?'+':''}${x}`;
}
function currentOdds(r){
  const n=Number(r?.price?.obs?.homeOddsDecimal);
  return Number.isFinite(n)?n.toFixed(2):'—';
}
function setLiveLabels(card,r){
  const minute=card.querySelector('.live-minute');
  const score=card.querySelector('.live-score');
  if(minute) minute.innerHTML=`<small>LIVE MIN</small><b>${esc(r.m.minute)}'</b>`;
  if(score) score.innerHTML=`<small>LIVE SCORE</small><b>${esc(Array.isArray(r.m.score)?r.m.score.join('–'):'—')}</b>`;
}
function applyProofStrip(card,r,lock){
  const strip=card.querySelector('.pick-strip');
  if(!strip) return;
  const locked=Boolean(lock);
  const pick=locked?(lock.pick||r.m.home):(r.signal?r.m.home:r.candidate?'WAIT':'WATCH');
  const line=locked?(lock.line??'—'):currentLine(r);
  const odds=locked?(Number.isFinite(Number(lock.odds))?Number(lock.odds).toFixed(2):'—'):currentOdds(r);
  const entryMinute=locked?`${esc(lock.minute)}'`:'—';
  const entryScore=locked?esc(lock.score||'—'):'—';
  const time=locked?esc(signalTime(lock.ts)):'—';
  strip.classList.add('signal-proof-grid');
  strip.innerHTML=`<div><span>PICK</span><strong>${esc(pick)}</strong></div><div><span>AH</span><strong>${esc(line)}</strong></div><div><span>ODDS</span><strong>${esc(odds)}</strong></div><div><span>ENTRY MIN</span><strong>${entryMinute}</strong></div><div><span>ENTRY SCORE</span><strong>${entryScore}</strong></div><div><span>SIGNAL TIME</span><strong>${time}</strong></div>`;
}
function applyLockedState(card,r,lock){
  if(!lock) return;
  card.classList.remove('signal-card-wait','signal-card-watch');
  card.classList.add('signal-card-pass','signal-card-locked');
  let banner=card.querySelector('.locked-signal-banner');
  if(!banner){
    banner=document.createElement('div');
    banner.className='locked-signal-banner';
    card.insertBefore(banner,card.firstChild);
  }
  banner.innerHTML=`<strong>SIGNAL LOCKED</strong><span>Entry ${esc(lock.minute)}' · ${esc(lock.score||'—')} · ${esc(signalTime(lock.ts))}</span>`;
  const badge=card.querySelector('.badge');
  if(badge){badge.className='badge signal';badge.textContent='SIGNAL · LOCKED';}
  const summary=card.querySelector('.signal-summary');
  if(summary) summary.textContent=`LOCKED · ${lock.pick||r.m.home} · HOME AH ${lock.line??'—'} @ ${Number.isFinite(Number(lock.odds))?Number(lock.odds).toFixed(2):'—'} · M88`;
}
function enhanceLive(){
  if(document.body?.dataset?.page!=='live') return;
  const results=Array.isArray(window.__nomad342LiveResults)?window.__nomad342LiveResults:[];
  if(!results.length) return;
  const archive=syncLiveArchive(results);
  const locks=new Map(archive.map(x=>[rowId(x),x]));
  const cards=[...document.querySelectorAll('#matchList .signal-card')];
  let lockedCount=0;
  results.forEach((r,i)=>{
    const card=cards[i];
    if(!card||!r?.m) return;
    const lock=locks.get(String(r.m.id));
    if(lock) lockedCount++;
    setLiveLabels(card,r);
    applyProofStrip(card,r,lock);
    applyLockedState(card,r,lock);
  });
  const signalCount=document.getElementById('signalCount');
  if(signalCount) signalCount.textContent=String(lockedCount);
}
function ensurePager(){
  let pager=document.getElementById('statsPager342');
  if(pager) return pager;
  const wrap=document.querySelector('.table-wrap');
  if(!wrap) return null;
  pager=document.createElement('div');
  pager.id='statsPager342';
  pager.className='stats-pager';
  wrap.insertAdjacentElement('afterend',pager);
  return pager;
}
function renderStatsPage(){
  if(document.body?.dataset?.page!=='statistics') return;
  const tbody=document.getElementById('statsBody');
  if(!tbody) return;
  const rows=mergeArchive();
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  statsPage=Math.min(Math.max(1,statsPage),totalPages);
  const start=(statsPage-1)*PAGE_SIZE;
  const pageRows=rows.slice(start,start+PAGE_SIZE);
  tbody.innerHTML=pageRows.length?pageRows.map(r=>`<tr><td>${esc(signalDateTime(r.ts))}</td><td>${esc(r.match||'—')}</td><td>${esc(r.minute??'—')}'</td><td>${esc(r.score||'—')}</td><td>HOME ${esc(r.line??'—')}<br><small>RAW ${esc(r.rawLine??'—')}</small></td><td>${Number.isFinite(Number(r.odds))?Number(r.odds).toFixed(2):'—'}<br><small>${esc(r.rawOdds??'—')} ${esc(r.oddsFormat||'')}</small></td><td>${esc(r.source||'M88')}</td><td class="${String(r.result||'PENDING').toUpperCase()==='LOSS'?'redtxt':String(r.result||'PENDING').toUpperCase()==='WIN'?'oktxt':'waittxt'}">${esc(r.result||'PENDING')}</td><td>${esc(r.reason||'SIGNAL LOCKED')}</td></tr>`).join(''):`<tr><td colspan="9">No signal snapshot yet.</td></tr>`;
  const pager=ensurePager();
  if(!pager) return;
  const from=rows.length?start+1:0;
  const to=Math.min(start+PAGE_SIZE,rows.length);
  const buttons=[];
  if(totalPages>1){
    buttons.push(`<button type="button" data-page="${Math.max(1,statsPage-1)}" ${statsPage===1?'disabled':''}>‹</button>`);
    for(let p=1;p<=totalPages;p++) buttons.push(`<button type="button" data-page="${p}" class="${p===statsPage?'active':''}">${p}</button>`);
    buttons.push(`<button type="button" data-page="${Math.min(totalPages,statsPage+1)}" ${statsPage===totalPages?'disabled':''}>›</button>`);
  }
  pager.innerHTML=`<span>Showing ${from}–${to} of ${rows.length} · 50 per page</span><div>${buttons.join('')}</div>`;
  pager.querySelectorAll('button[data-page]').forEach(btn=>btn.addEventListener('click',()=>{statsPage=Number(btn.dataset.page)||1;renderStatsPage();window.scrollTo({top:0,behavior:'smooth'});}));
}
function start(){
  const page=document.body?.dataset?.page;
  if(page==='live'){
    enhanceLive();
    setInterval(enhanceLive,1000);
  }
  if(page==='statistics') renderStatsPage();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();