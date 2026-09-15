(()=>{
'use strict';

const VERSION='343-live-stable-v9';
const API='/api/engine/board';
const SIGNALS_API='/api/engine/signals';
const POLL_MS=30_000;
const BOARD_TIMEOUT_MS=8_000;
const SIGNAL_TIMEOUT_MS=4_000;
const MAX_POINTS=72;
const HOME=['#35b96b','#3ebf76','#48c581','#55ca8b','#62cf95','#70d49f'];
const AWAY=['#e7d354','#dfc84c','#d8bd45','#d1b13f','#c8a539','#be9934'];
const BOOK=['#f0c95b','#dc8c62','#9f8ce7','#62c9bf','#d979a4','#9fc967','#76a7e8','#d09b68'];

const boards={
  live:document.querySelector('[data-board="live"]'),
  scheduled:document.querySelector('[data-board="scheduled"]'),
  finished:document.querySelector('[data-board="finished"]'),
  unknown:document.querySelector('[data-board="unknown"]')
};
const counts={
  live:document.querySelector('[data-count="live"]'),
  scheduled:document.querySelector('[data-count="scheduled"]'),
  finished:document.querySelector('[data-count="finished"]'),
  unknown:document.querySelector('[data-count="unknown"]')
};
const stateEl=document.querySelector('[data-hub-state]');
const history=new Map();
const currentFixtures=new Map();
const renderKeys=new Map();
let openedId=null;
let busy=false;
let lockedSignals=new Set();
let signalsReady=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const show=(v,d=0)=>num(v)===null?'—':Number(v).toFixed(d).replace(/\.0+$/,'');
const dateMs=v=>{const n=num(v);if(n!==null)return n>1e10?n:n*1000;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:null};
const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};

function classify(f){
  const s=String(f?.boardState??f?.status??'').toLowerCase();
  if(s.includes('unknown'))return'unknown';
  if(['live','in_play','inplay','playing','half'].some(x=>s.includes(x)))return'live';
  if(['finished','full_time','ft','ended'].some(x=>s.includes(x)))return'finished';
  return'scheduled';
}
function fixtureKey(f){return String(f?.fixtureId??[f?.home?.name,f?.away?.name,f?.kickoffAt??f?.kickoffUtc].join('|'))}
function minuteOf(f){const m=num(f?.minute);if(m!==null)return m;const s=String(f?.statusCode??'').match(/\d+/);return s?Number(s[0]):null}
function fixtureTimeZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}}
function fixtureDateLabel(f){const ms=dateMs(f?.kickoffAt??f?.kickoffUtc);if(ms===null)return'—';const p=new Intl.DateTimeFormat('en-GB',{timeZone:fixtureTimeZone(),month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));const m=p.find(x=>x.type==='month')?.value,d=p.find(x=>x.type==='day')?.value;return m&&d?`${m}-${d}`:'—'}
function kickoffLabel(f){const ms=dateMs(f?.kickoffAt??f?.kickoffUtc);if(ms===null)return'—';return new Intl.DateTimeFormat('en-GB',{timeZone:fixtureTimeZone(),hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms))}
function clockLabel(f){const kind=classify(f),code=String(f?.statusCode??'').trim().toUpperCase();if(kind==='live'){if(code==='HT'||code.includes('HALF'))return'HT';const m=minuteOf(f);return m!==null?`${m}'`:'LIVE'}if(kind==='finished')return'FT';if(kind==='unknown')return'UNCONFIRMED';return kickoffLabel(f)}
function halfScore(f){const h=num(f?.goals?.halfHome),a=num(f?.goals?.halfAway);return h===null||a===null?'':`${show(h)}-${show(a)}`}
function signalState(f){if(!signalsReady)return{key:'unknown',text:'SIGNAL —'};return lockedSignals.has(fixtureKey(f))?{key:'locked',text:'SIGNAL LOCKED'}:{key:'none',text:'NO SIGNAL'}}

async function fetchJson(url,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{cache:'no-store',signal:controller.signal});
    if(!r.ok)throw new Error(`HTTP_${r.status}`);
    return await r.json();
  }catch(error){
    if(error?.name==='AbortError')throw new Error('REQUEST_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer)}
}

function metricRows(f){const st=f?.statistics||{};return[
  ['ยิงเข้ากรอบ',pair(st.shotsOnTarget),false],
  ['ยิงไม่เข้ากรอบ',pair(st.shotsOffTarget),false],
  ['เตะมุม',pair(f?.corners??st.corners),false],
  ['การบุก',pair(st.attacks),false],
  ['การบุกอันตราย',pair(st.dangerousAttacks),false],
  ['ครองบอล',pair(st.possession),true]
]}
function mirroredBars(f){
  const rows=metricRows(f),homeName=f?.home?.name||'HOME',awayName=f?.away?.name||'AWAY';
  const body=rows.map((r,i)=>{const[label,p,pct]=r,h=p.home,a=p.away,max=pct?100:Math.max(h??0,a??0,1),hw=h===null?0:Math.min(100,h/max*100),aw=a===null?0:Math.min(100,a/max*100);return`<div class="mirror-row"><b class="mirror-num home-num">${esc(h===null?'—':`${show(h,pct?1:0)}${pct?'%':''}`)}</b><div class="mirror-track home-track"><i style="width:${hw}%;background:${HOME[i]}"></i></div><span>${esc(label)}</span><div class="mirror-track away-track"><i style="width:${aw}%;background:${AWAY[i]}"></i></div><b class="mirror-num away-num">${esc(a===null?'—':`${show(a,pct?1:0)}${pct?'%':''}`)}</b></div>`}).join('');
  return`<section class="evidence-card"><div class="evidence-head"><b>Match Statistics</b><small>ข้อมูลล่าสุดที่ตรวจพบ</small></div><div class="team-axis"><b>${esc(homeName)}</b><span></span><b>${esc(awayName)}</b></div><div class="mirror-bars">${body}</div></section>`;
}
function eventValue(f){const st=f?.statistics||{},parts=[pair(st.shotsOnTarget),pair(st.shotsOffTarget),pair(f?.corners??st.corners)];let h=0,a=0,seen=false;for(const p of parts){if(p.home!==null){h+=p.home;seen=true}if(p.away!==null){a+=p.away;seen=true}}return seen?{home:h,away:a}:null}
function addPoint(arr,p,key){const last=arr[arr.length-1];if(last&&last[key]===p[key])arr[arr.length-1]=p;else arr.push(p);if(arr.length>MAX_POINTS)arr.splice(0,arr.length-MAX_POINTS)}
function priceRecords(raw){
  const out=[],seen=new Set();
  const add=(book,price)=>{const p=num(price),b=typeof book==='string'?book.trim():'';if(!b||p===null||p<=1||p>=1000||out.length>=10)return;const k=`${b}|${p}`;if(seen.has(k))return;seen.add(k);out.push({book:b,price:p})};
  const walk=(v,key='',depth=0)=>{if(depth>4||v==null||out.length>=10)return;if(Array.isArray(v)){for(const x of v){walk(x,key,depth+1);if(out.length>=10)break}return}if(typeof v!=='object')return;const book=v.bookmaker?.name??v.bookmaker??v.book??v.provider?.name??v.provider??v.name??(/^bet365$/i.test(key)?'Bet365':null),price=v.odds??v.price??v.decimalOdds??v.decimal??v.value;if(book&&price!=null)add(String(book),price);for(const[k,x]of Object.entries(v)){if(x&&typeof x==='object')walk(x,k,depth+1);if(out.length>=10)break}};
  walk(raw);return out;
}
function observe(f){
  if(classify(f)!=='live')return;
  const id=fixtureKey(f),m=minuteOf(f),h=history.get(id)||{events:[],books:{}};
  const ev=eventValue(f);if(m!==null&&ev)addPoint(h.events,{minute:m,home:ev.home,away:ev.away,observedAt:Date.now()},'minute');
  if(id===openedId){for(const rec of priceRecords(f?.providerOdds??f?.odds)){const arr=h.books[rec.book]||(h.books[rec.book]=[]),p={minute:m,price:rec.price,observedAt:Date.now()},last=arr[arr.length-1];if(last&&last.price===p.price&&last.minute===p.minute)last.observedAt=p.observedAt;else{arr.push(p);if(arr.length>MAX_POINTS)arr.splice(0,arr.length-MAX_POINTS)}}}
  history.set(id,h);
}
function pruneHistory(fixtures){const live=new Set(fixtures.filter(f=>classify(f)==='live').map(fixtureKey));for(const id of history.keys())if(!live.has(id))history.delete(id)}
function poly(points,val,w=600,h=150,pad=14){if(points.length<2)return'';const xs=points.map((p,i)=>num(p.minute)??i),ys=points.map(p=>num(p[val])).filter(v=>v!==null);if(!ys.length)return'';let xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);if(xmax===xmin)xmax=xmin+1;if(ymax===ymin){ymin=Math.max(0,ymin-1);ymax+=1}return points.map((p,i)=>{const yv=num(p[val]);if(yv===null)return null;const xv=num(p.minute)??i,x=pad+(xv-xmin)/(xmax-xmin)*(w-pad*2),y=h-pad-(yv-ymin)/(ymax-ymin)*(h-pad*2);return`${x.toFixed(1)},${y.toFixed(1)}`}).filter(Boolean).join(' ')}
function eventChart(f){const pts=history.get(fixtureKey(f))?.events||[];if(pts.length<2)return'<div class="chart-empty">กำลังสะสม Event ที่ตรวจพบจริง</div>';const hp=poly(pts,'home'),ap=poly(pts,'away');return`<div class="chart-legend"><span><i class="home-dot"></i>${esc(f?.home?.name||'HOME')}</span><span><i class="away-dot"></i>${esc(f?.away?.name||'AWAY')}</span></div><svg class="flow-svg" viewBox="0 0 600 150" preserveAspectRatio="none" aria-label="Event Flow"><line x1="14" y1="136" x2="586" y2="136" class="chart-axis"/>${hp?`<polyline points="${hp}" class="event-home"/>`:''}${ap?`<polyline points="${ap}" class="event-away"/>`:''}</svg>`}
function bookSeriesPoints(arr,w=600,h=150,pad=14){if(arr.length<2)return'';const xs=arr.map((p,i)=>p.observedAt??i),ys=arr.map(p=>p.price),xmin=Math.min(...xs),xmax0=Math.max(...xs),xmax=xmax0===xmin?xmin+1:xmax0,ymin0=Math.min(...ys),ymax0=Math.max(...ys),ymin=ymin0===ymax0?Math.max(1,ymin0-.05):ymin0,ymax=ymin0===ymax0?ymax0+.05:ymax0;return arr.map((p,i)=>{const x=pad+((p.observedAt??i)-xmin)/(xmax-xmin)*(w-pad*2),y=h-pad-(p.price-ymin)/(ymax-ymin)*(h-pad*2);return`${x.toFixed(1)},${y.toFixed(1)}`}).join(' ')}
function bookChart(f){const books=history.get(fixtureKey(f))?.books||{},names=Object.keys(books).filter(n=>books[n].length).slice(0,8);if(!names.length)return'<div class="chart-empty">เปิดการ์ดคู่นี้ไว้เพื่อสะสมราคาจาก Bookmaker</div>';const lines=names.map((name,i)=>{const pts=bookSeriesPoints(books[name]);return pts?`<polyline points="${pts}" fill="none" stroke="${BOOK[i%BOOK.length]}" stroke-width="3" vector-effect="non-scaling-stroke"/>`:''}).join(''),legend=names.map((name,i)=>`<span><i style="background:${BOOK[i%BOOK.length]}"></i>${esc(name)}</span>`).join('');if(!lines)return`<div class="book-legend">${legend}</div><div class="chart-empty">กำลังสะสมการเปลี่ยนแปลงราคาที่ตรวจพบจริง</div>`;return`<div class="book-legend">${legend}</div><svg class="flow-svg" viewBox="0 0 600 150" preserveAspectRatio="none" aria-label="Bookmaker Price Flow"><line x1="14" y1="136" x2="586" y2="136" class="chart-axis"/>${lines}</svg>`}
function flowCard(f,id){return`<section class="nomad-event-flow-card" data-event-flow-fixture="${esc(id)}" data-home="${esc(f?.home?.name||'HOME')}" data-away="${esc(f?.away?.name||'AWAY')}"><div class="nomad-flow-loading">Event Flow · Engine history</div></section>`}
function detailHtml(f){const id=fixtureKey(f),kind=classify(f);if(kind==='scheduled')return'<div class="details-note">Match data will appear when the fixture goes live.</div>';return`${mirroredBars(f)}${flowCard(f,id)}<section class="flow-card book-flow-single"><div class="flow-head"><b>Bookmaker Price Flow</b><small>Actual observations</small></div><div class="flow-body">${bookChart(f)}</div></section><div class="details-note">Event Flow ใช้ประวัติกลางจาก Engine · ราคา Bookmaker แสดงเฉพาะข้อมูลที่ตรวจพบจริง${kind==='unknown'?' · ผลคู่นี้ยังไม่ยืนยัน จึงห้าม Settlement':''}</div>`}
function card(f){
  const id=fixtureKey(f),expanded=id===openedId,league=[f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')||'—',homeName=f?.home?.name||'—',awayName=f?.away?.name||'—',kind=classify(f),score=kind==='scheduled'?'—':`${show(f?.goals?.home)}-${show(f?.goals?.away)}`,date=fixtureDateLabel(f),clock=clockLabel(f),half=halfScore(f),sig=signalState(f);
  return`<article class="match-card event-compact${expanded?' expanded':''}" data-match-row data-match-id="${esc(id)}" tabindex="0" role="button" aria-expanded="${expanded?'true':'false'}"><div class="match-row scoreboard-default"><div class="league league-scoreboard">${esc(league)}</div><div class="fixture-scoreboard"><div class="fixture-meta ${kind}"><span class="fixture-date">${esc(date)}</span><span class="fixture-clock">${esc(clock)}</span></div><div class="team-slot home-slot"><span class="team-name">${esc(homeName)}</span></div><div class="score-core"><strong>${esc(score)}</strong>${half?`<small class="half-score">HT ${esc(half)}</small>`:''}</div><div class="team-slot away-slot"><span class="team-name">${esc(awayName)}</span></div><div class="fixture-side"><span class="signal-state ${sig.key}"><i aria-hidden="true"></i>${esc(sig.text)}</span></div></div></div><span class="expand-cue" aria-hidden="true">▼</span><div class="event-details"${expanded?'':' hidden'}>${expanded?detailHtml(f):''}</div></article>`;
}
function emptyText(key){if(key==='live')return'ยังไม่มีคู่กำลังแข่งขัน';if(key==='scheduled')return'ไม่มีคู่รอเตะเพิ่มเติม';if(key==='unknown')return'ไม่มีคู่ที่ผลหรือสถานะยังไม่ยืนยัน';return'ยังไม่มีคู่จบการแข่งขัน'}
function rowSignature(f){const id=fixtureKey(f),kind=classify(f),sig=signalState(f).key,base=[id,kind,minuteOf(f),f?.statusCode,f?.goals?.home,f?.goals?.away,f?.goals?.halfHome,f?.goals?.halfAway,sig];if(id===openedId)base.push(JSON.stringify(f?.statistics||{}),JSON.stringify(f?.corners||null));return base.join('|')}
function renderGroup(key,rows){if(counts[key])counts[key].textContent=String(rows.length);const signature=rows.map(rowSignature).join('~');if(renderKeys.get(key)===signature)return;renderKeys.set(key,signature);if(boards[key])boards[key].innerHTML=rows.length?rows.map(card).join(''):`<div class="empty compact-empty">${emptyText(key)}</div>`}
function render(snapshot){
  const fixtures=Array.isArray(snapshot?.fixtures)?snapshot.fixtures.slice():[];
  currentFixtures.clear();for(const f of fixtures){currentFixtures.set(fixtureKey(f),f);observe(f)}pruneHistory(fixtures);
  fixtures.sort((a,b)=>(dateMs(a?.kickoffAt??a?.kickoffUtc)??0)-(dateMs(b?.kickoffAt??b?.kickoffUtc)??0));
  for(const key of Object.keys(boards))renderGroup(key,fixtures.filter(f=>classify(f)===key));
  if(openedId){const el=document.querySelector(`.match-card[data-match-id="${CSS.escape(openedId)}"]`);if(el)window.NOMAD_EVENT_FLOW_343?.hydrate(el)}
}
function setState(snapshot,error){if(!stateEl)return;if(error){const timeout=String(error?.message||'').includes('TIMEOUT');stateEl.innerHTML=`<span class="pill"><i class="dot warn"></i>${timeout?'Live data timeout · retrying':'ข้อมูลสดไม่พร้อม · retrying'}</span>`;return}const stale=Boolean(snapshot?.stale),age=Math.round(Number(snapshot?.hubAgeMs||0)/1000);stateEl.innerHTML=`<span class="pill"><i class="dot ${stale?'warn':'live'}"></i>${stale?'ข้อมูลล่าช้า':'Live data'} · ${age}s</span>`}
async function load(){
  if(busy||document.hidden)return;
  busy=true;
  try{
    const stamp=Date.now();
    const signalPromise=fetchJson(`${SIGNALS_API}?_=${stamp}`,SIGNAL_TIMEOUT_MS).catch(()=>null);
    const board=await fetchJson(`${API}?_=${stamp}`,BOARD_TIMEOUT_MS);
    if(board?.ok!==true)throw new Error('DATA_NOT_READY');
    const signals=await signalPromise;
    if(signals?.ok===true&&Array.isArray(signals.signals)){lockedSignals=new Set(signals.signals.map(x=>String(x?.fixtureId??'')).filter(Boolean));signalsReady=true}
    setState(board,null);render(board);
  }catch(error){setState(null,error)}finally{busy=false}
}
function openDetail(el,id){const f=currentFixtures.get(id),detail=el.querySelector('.event-details');if(!detail||!f)return;if(!detail.innerHTML)detail.innerHTML=detailHtml(f);detail.hidden=false;window.NOMAD_EVENT_FLOW_343?.hydrate(el)}
function toggle(el){
  const id=String(el?.dataset?.matchId||'');if(!id)return;
  openedId=openedId===id?null:id;
  renderKeys.clear();
  document.querySelectorAll('.match-card[data-match-id]').forEach(node=>{const on=String(node.dataset.matchId||'')===openedId;node.classList.toggle('expanded',on);node.setAttribute('aria-expanded',String(on));const detail=node.querySelector('.event-details');if(detail)detail.hidden=!on;if(on)openDetail(node,id)});
  if(openedId)el.focus({preventScroll:true});
}
document.addEventListener('click',e=>{const el=e.target.closest('.match-card[data-match-id]');if(el)toggle(el)});
document.addEventListener('keydown',e=>{const el=e.target.closest('.match-card[data-match-id]');if(!el)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(el)}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
load();
setInterval(load,POLL_MS);
window.NOMAD343_LIVE={version:VERSION,reload:load};
})();
