(()=>{
'use strict';
const VERSION='343-full-odds-10book-prewarm-v3';
const API='/api/full-market/fixture-odds';
const CLIENT_CACHE_MS=120_000;
const PREFETCH_GAP_MS=4000;
const INITIAL_SCHEDULED_PREFETCH=12;
const cache=new Map();
const inflight=new Map();
const queued=new Set();
const queue=[];
let baseRender=null,pumping=false,observer=null;
const now=()=>Date.now();
const fixtureId=card=>String(card?.dataset?.matchId||'').trim();
function fresh(id){const row=cache.get(id);return row&&now()-row.at<CLIENT_CACHE_MS?row:null}
function enrich(f,row){if(!f||!row)return f;return {...f,providerOdds:row.fullOdds,providerOddsUpdatedAt:row.fetchedAt??row.at}}
function paintMeta(card,row){if(!card||!row)return;const count=Array.isArray(row.availableBookmakers)&&row.availableBookmakers.length?row.availableBookmakers.length:10;const head=card.querySelector('[data-full-odds-main] .fom-head b'),small=card.querySelector('[data-full-odds-main] .fom-head small'),badge=card.querySelector('[data-full-odds-main] .fom-count'),note=card.querySelector('.details-note');if(head)head.textContent='FULL MARKET · 10-BOOK BUNDLE';if(small)small.textContent='10 bookmaker ถูกเตรียมไว้ล่วงหน้าและใช้ cache กลางร่วมกัน';if(badge)badge.textContent=`${count}/10 BOOKS · PREWARMED`;if(note)note.textContent='การกดการ์ดไม่เรียก Full Market API · หน้านี้อ่านชุด 10 bookmaker ที่เตรียมไว้แล้ว'}
function renderWithRow(card,f,row){if(!baseRender)return;baseRender(card,enrich(f,row));paintMeta(card,row)}
function install(){const api=window.NOMAD343_FULL_ODDS_BULK;if(!api||typeof api.renderCard!=='function'||api.__tenBookInstalled)return false;baseRender=api.renderCard.bind(api);api.renderCard=(card,f)=>{const id=fixtureId(card),row=fresh(id);if(row)return renderWithRow(card,f,row);const result=baseRender(card,f);const host=card?.querySelector?.('[data-full-odds-main]');if(host){const small=host.querySelector('.fom-head small'),badge=host.querySelector('.fom-count');if(small)small.textContent='กำลังเตรียมชุด 10 bookmaker ล่วงหน้า · การกดการ์ดไม่ยิง request';if(badge)badge.textContent='PREWARMING · NO CLICK REQUEST'}return result};api.__tenBookInstalled=true;api.mode='PREWARMED_10BOOK_ZERO_CLICK_REQUESTS';return true}
async function fetch10(card){if(!card)return;const id=fixtureId(card);if(!id)return;install();const hit=fresh(id);if(hit)return hit;if(inflight.has(id))return inflight.get(id);const p=(async()=>{try{const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true||!j?.fullOdds)return null;const row={fullOdds:j.fullOdds,fetchedAt:j.fetchedAt??now(),at:now(),source:j.source??null,availableBookmakers:Array.isArray(j.availableBookmakers)?j.availableBookmakers:[]};cache.set(id,row);const current=document.querySelector(`.match-card[data-match-id="${CSS.escape(id)}"]`);if(current?.getAttribute('aria-expanded')==='true'){const f=window.NOMAD343_LIVE?.getFixture?.(id);if(f)renderWithRow(current,f,row)}return row}catch{return null}finally{inflight.delete(id)}})();inflight.set(id,p);return p}
function enqueue(card,front=false){const id=fixtureId(card);if(!id||fresh(id)||inflight.has(id)||queued.has(id))return;queued.add(id);front?queue.unshift(card):queue.push(card);pump()}
async function pump(){if(pumping)return;pumping=true;try{while(queue.length){const card=queue.shift(),id=fixtureId(card);queued.delete(id);if(id&&!fresh(id))await fetch10(card);if(queue.length)await new Promise(r=>setTimeout(r,PREFETCH_GAP_MS))}}finally{pumping=false}}
function cardsIn(group){return [...document.querySelectorAll(`.score-group[data-group="${group}"] .match-card[data-match-id]`)]}
function observeCards(){if(observer)return;observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)enqueue(e.target,true)},{rootMargin:'300px 0px'});document.querySelectorAll('.match-card[data-match-id]').forEach(c=>observer.observe(c))}
function scan(){install();const live=cardsIn('live'),scheduled=cardsIn('scheduled');live.forEach(c=>enqueue(c,true));scheduled.slice(0,INITIAL_SCHEDULED_PREFETCH).forEach(c=>enqueue(c));observeCards();if(observer)document.querySelectorAll('.match-card[data-match-id]').forEach(c=>observer.observe(c))}
function readyScan(){scan();let tries=0;const t=setInterval(()=>{scan();tries++;if(tries>=20)clearInterval(t)},1000)}
install();queueMicrotask(readyScan);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scan()});setInterval(scan,30000);
window.NOMAD343_FULL_ODDS_10BOOK={version:VERSION,prewarm:scan,fetch10,has:id=>Boolean(fresh(String(id))),cacheSize:()=>cache.size,mode:'PREWARMED_10BOOK_ZERO_CLICK_REQUESTS'};
})();
