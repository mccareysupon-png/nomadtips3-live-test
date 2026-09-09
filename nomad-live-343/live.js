(()=>{
'use strict';
const VERSION='343-today-board-v1';
const HUB_URL=window.NOMAD343_HUB_URL||'https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev';
const POLL_MS=30_000;
const boards={
  live:document.querySelector('[data-board="live"]'),
  scheduled:document.querySelector('[data-board="scheduled"]'),
  finished:document.querySelector('[data-board="finished"]')
};
const counts={
  live:document.querySelector('[data-count="live"]'),
  scheduled:document.querySelector('[data-count="scheduled"]'),
  finished:document.querySelector('[data-count="finished"]')
};
const stateEl=document.querySelector('[data-hub-state]');
let openedId=null;
let busy=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const show=v=>num(v)===null?'—':String(Number(v));
const pair=(v)=>v&&typeof v==='object'?`${show(v.home)} - ${show(v.away)}`:'—';
const dateMs=v=>{const n=num(v);if(n!==null)return n>10_000_000_000?n:n*1000;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:null};
function kickoffLabel(f){
  if(classify(f)==='live')return f.statusCode&&/^\d+$/.test(String(f.statusCode))?`${f.statusCode}'`:(f.minute!==null&&f.minute!==undefined?`${f.minute}'`:'LIVE');
  const ms=dateMs(f.kickoffAt??f.kickoffUtc);if(ms===null)return '—';
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));
}
function classify(f){
  const s=String(f.boardState??f.status??'').toLowerCase();
  if(['live','in_play','inplay','playing','half'].some(x=>s.includes(x)))return 'live';
  if(['finished','full_time','ft','ended'].some(x=>s.includes(x)))return 'finished';
  if(s==='unknown')return 'finished';
  return 'scheduled';
}
function statusTag(f){
  const k=classify(f);
  if(k==='live')return '<span class="tag pass">LIVE</span>';
  if(k==='finished')return '<span class="tag wait">FINISHED</span>';
  return '<span class="tag wait">WAITING</span>';
}
function oddsText(f){
  const o=f.providerOdds;
  if(o===null||o===undefined)return '—';
  if(typeof o==='string')return esc(o);
  try{return esc(JSON.stringify(o))}catch{return '—'}
}
function card(f){
  const id=String(f.fixtureId??'');
  const expanded=id&&id===openedId;
  const league=[f.league?.country,f.league?.name].filter(Boolean).join(' · ')||'—';
  const gh=show(f.goals?.home),ga=show(f.goals?.away);
  const score=classify(f)==='scheduled'?'—':`${gh} - ${ga}`;
  const st=f.statistics;
  const detail=[
    ['ยิงเข้ากรอบ',pair(st?.shotsOnTarget),'ครั้ง'],
    ['ยิงไม่เข้ากรอบ',pair(st?.shotsOffTarget),'ครั้ง'],
    ['เตะมุม',pair(f.corners),'ครั้ง'],
    ['การบุก',pair(st?.attacks),'ค่าดิบจาก 5USD'],
    ['การบุกอันตราย',pair(st?.dangerousAttacks),'ค่าดิบจาก 5USD'],
    ['การครองบอล',pair(st?.possession),'เปอร์เซ็นต์']
  ].map(x=>`<div class="detail-item"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('');
  return `<article class="match-card event-compact${expanded?' expanded':''}" data-match-row data-match-id="${esc(id)}" tabindex="0" role="button" aria-expanded="${expanded?'true':'false'}">
    <div class="match-row">
      <div class="kickoff ${classify(f)==='live'?'live':''}">${esc(kickoffLabel(f))}</div>
      <div><div class="league">${esc(league)}</div><div class="teams"><span>${esc(f.home?.name||'—')}</span><span>${esc(f.away?.name||'—')}</span></div></div>
      <div class="score-box">${esc(score)}<small>${esc(f.statusCode||'')}</small></div>
      <div class="match-state">${statusTag(f)}</div>
    </div>
    <span class="expand-cue" aria-hidden="true">▼</span>
    <div class="event-details"${expanded?'':' hidden'}>
      <div class="detail-grid">${detail}</div>
      <div class="odds-panel"><div class="odds-panel-head"><b>Bet365 จาก 5USD</b><span>Fixture ID ${esc(id||'—')}</span></div><div class="odds-raw">${oddsText(f)}</div></div>
      <div class="details-note">เมื่อ Engine ต่อจริง: ยิง/เตะมุมจะคำนวณตาม Rolling Window · การบุก/การบุกอันตรายจะแปลงเป็นเปอร์เซ็นต์ก่อนตรวจเงื่อนไข</div>
    </div>
  </article>`;
}
function setHubState(snapshot,error){
  if(!stateEl)return;
  if(error){stateEl.innerHTML='<span class="pill"><i class="dot warn"></i>HUB ยังไม่พร้อม</span>';return}
  const stale=Boolean(snapshot?.stale),age=Math.round(Number(snapshot?.ageMs||0)/1000);
  stateEl.innerHTML=`<span class="pill"><i class="dot ${stale?'warn':'live'}"></i>${stale?'STALE':'5USD HUB'} · ${age}s</span>`;
}
function render(snapshot){
  const fixtures=Array.isArray(snapshot?.fixtures)?snapshot.fixtures.slice():[];
  fixtures.sort((a,b)=>(dateMs(a.kickoffAt??a.kickoffUtc)??0)-(dateMs(b.kickoffAt??b.kickoffUtc)??0));
  for(const key of Object.keys(boards)){
    const rows=fixtures.filter(f=>classify(f)===key);
    if(counts[key])counts[key].textContent=String(rows.length);
    if(boards[key])boards[key].innerHTML=rows.length?rows.map(card).join(''):`<div class="empty compact-empty">${key==='live'?'ยังไม่มีคู่กำลังแข่งขัน':key==='scheduled'?'ไม่มีคู่รอเตะเพิ่มเติม':'ยังไม่มีคู่จบการแข่งขัน'}</div>`;
  }
}
async function load(){
  if(busy)return;busy=true;
  try{
    const r=await fetch(`${HUB_URL}/snapshot?_=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP_${r.status}`);
    const j=await r.json();
    if(j?.ok!==true)throw new Error(j?.error||'HUB_NOT_READY');
    setHubState(j,null);render(j);
  }catch(error){setHubState(null,error)}finally{busy=false}
}
function toggle(el){
  const id=String(el.dataset.matchId||'');
  openedId=openedId===id?null:id;
  document.querySelectorAll('.match-card[data-match-id]').forEach(card=>{
    const on=String(card.dataset.matchId||'')===openedId;
    card.classList.toggle('expanded',on);card.setAttribute('aria-expanded',String(on));
    const detail=card.querySelector('.event-details');if(detail)detail.hidden=!on;
  });
  if(openedId){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',behavior:'smooth'})}
}
document.addEventListener('click',e=>{const card=e.target.closest('.match-card[data-match-id]');if(card)toggle(card)});
document.addEventListener('keydown',e=>{const card=e.target.closest('.match-card[data-match-id]');if(!card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(card)}});
load();setInterval(load,POLL_MS);
window.NOMAD343_LIVE={version:VERSION,hubUrl:HUB_URL,reload:load};
})();
