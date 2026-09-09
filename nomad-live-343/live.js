(()=>{
'use strict';
const VERSION='343-public-v1';
const API='/api/engine/board';
const POLL_MS=30_000;
const boards={live:document.querySelector('[data-board="live"]'),scheduled:document.querySelector('[data-board="scheduled"]'),finished:document.querySelector('[data-board="finished"]')};
const counts={live:document.querySelector('[data-count="live"]'),scheduled:document.querySelector('[data-count="scheduled"]'),finished:document.querySelector('[data-count="finished"]')};
const stateEl=document.querySelector('[data-hub-state]');let openedId=null,busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const show=(v,d=0)=>num(v)===null?'—':Number(v).toFixed(d).replace(/\.0+$/,'');
const pair=v=>v&&typeof v==='object'?`${show(v.home)} - ${show(v.away)}`:'—';
const pairPct=v=>v&&typeof v==='object'?`${show(v.home,1)}% - ${show(v.away,1)}%`:'—';
const dateMs=v=>{const n=num(v);if(n!==null)return n>1e10?n:n*1000;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:null};
function classify(f){const s=String(f.boardState??f.status??'').toLowerCase();if(['live','in_play','inplay','playing','half'].some(x=>s.includes(x)))return'live';if(['finished','full_time','ft','ended'].some(x=>s.includes(x)))return'finished';return'scheduled'}
function kickoffLabel(f){if(classify(f)==='live')return f.statusCode&&/^\d+$/.test(String(f.statusCode))?`${f.statusCode}'`:(f.minute!==null&&f.minute!==undefined?`${f.minute}'`:'LIVE');const ms=dateMs(f.kickoffAt??f.kickoffUtc);if(ms===null)return'—';return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms))}
function statusTag(f){const k=classify(f);if(k==='live')return'<span class="tag pass">LIVE</span>';if(k==='finished')return'<span class="tag wait">FINISHED</span>';return'<span class="tag wait">WAITING</span>'}
function card(f){
  const id=String(f.fixtureId??''),expanded=id&&id===openedId;
  const league=[f.league?.country,f.league?.name].filter(Boolean).join(' · ')||'—';
  const gh=show(f.goals?.home),ga=show(f.goals?.away),score=classify(f)==='scheduled'?'—':`${gh} - ${ga}`;
  const st=f.statistics||{};
  const detail=[
    ['ยิงเข้ากรอบ',pair(st.shotsOnTarget),'ครั้ง'],
    ['ยิงไม่เข้ากรอบ',pair(st.shotsOffTarget),'ครั้ง'],
    ['เตะมุม',pair(f.corners??st.corners),'ครั้ง'],
    ['การบุก',pair(st.attacks),''],
    ['การบุกอันตราย',pair(st.dangerousAttacks),''],
    ['การครองบอล',pairPct(st.possession),'']
  ].map(x=>`<div class="detail-item"><span>${x[0]}</span><strong>${x[1]}</strong>${x[2]?`<small>${x[2]}</small>`:''}</div>`).join('');
  return `<article class="match-card event-compact${expanded?' expanded':''}" data-match-row data-match-id="${esc(id)}" tabindex="0" role="button" aria-expanded="${expanded?'true':'false'}"><div class="match-row"><div class="kickoff ${classify(f)==='live'?'live':''}">${esc(kickoffLabel(f))}</div><div><div class="league">${esc(league)}</div><div class="teams"><span>${esc(f.home?.name||'—')}</span><span>${esc(f.away?.name||'—')}</span></div></div><div class="score-box">${esc(score)}<small>${esc(f.statusCode||'')}</small></div><div class="match-state">${statusTag(f)}</div></div><span class="expand-cue" aria-hidden="true">▼</span><div class="event-details"${expanded?'':' hidden'}><div class="detail-grid">${detail}</div><div class="details-note">ข้อมูลสถิติแสดงตาม Snapshot ที่ตรวจพบจริง · ค่าที่ยังไม่มีจะแสดงเป็น —</div></div></article>`
}
function setState(snapshot,error){if(!stateEl)return;if(error){stateEl.innerHTML='<span class="pill"><i class="dot warn"></i>ข้อมูลสดไม่พร้อม</span>';return}const stale=Boolean(snapshot?.stale),age=Math.round(Number(snapshot?.hubAgeMs||0)/1000);stateEl.innerHTML=`<span class="pill"><i class="dot ${stale?'warn':'live'}"></i>${stale?'ข้อมูลล่าช้า':'Live data'} · ${age}s</span>`}
function render(snapshot){const fixtures=Array.isArray(snapshot?.fixtures)?snapshot.fixtures.slice():[];fixtures.sort((a,b)=>(dateMs(a.kickoffAt??a.kickoffUtc)??0)-(dateMs(b.kickoffAt??b.kickoffUtc)??0));for(const key of Object.keys(boards)){const rows=fixtures.filter(f=>classify(f)===key);if(counts[key])counts[key].textContent=String(rows.length);if(boards[key])boards[key].innerHTML=rows.length?rows.map(card).join(''):`<div class="empty compact-empty">${key==='live'?'ยังไม่มีคู่กำลังแข่งขัน':key==='scheduled'?'ไม่มีคู่รอเตะเพิ่มเติม':'ยังไม่มีคู่จบการแข่งขัน'}</div>`}}
async function load(){if(busy)return;busy=true;try{const r=await fetch(`${API}?_=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);const j=await r.json();if(j?.ok!==true)throw new Error('DATA_NOT_READY');setState(j,null);render(j)}catch(error){setState(null,error)}finally{busy=false}}
function toggle(el){const id=String(el.dataset.matchId||'');openedId=openedId===id?null:id;document.querySelectorAll('.match-card[data-match-id]').forEach(card=>{const on=String(card.dataset.matchId||'')===openedId;card.classList.toggle('expanded',on);card.setAttribute('aria-expanded',String(on));const detail=card.querySelector('.event-details');if(detail)detail.hidden=!on});if(openedId){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',behavior:'smooth'})}}
document.addEventListener('click',e=>{const card=e.target.closest('.match-card[data-match-id]');if(card)toggle(card)});document.addEventListener('keydown',e=>{const card=e.target.closest('.match-card[data-match-id]');if(!card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(card)}});load();setInterval(load,POLL_MS);window.NOMAD343_LIVE={version:VERSION,reload:load};
})();
