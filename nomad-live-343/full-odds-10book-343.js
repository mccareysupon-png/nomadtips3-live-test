(()=>{
'use strict';
const VERSION='343-full-odds-10book-central-cache-v5';
const API='/api/full-market/cache-snapshot';
const POLL_MS=30_000;
const cache=new Map();
let baseRender=null,busy=false,lastLoadedAt=0;
const fixtureId=card=>String(card?.dataset?.matchId||'').trim();
function enrich(f,row){if(!f||!row)return f;return {...f,providerOdds:row.fullOdds,providerOddsUpdatedAt:row.fetchedAt??null}}
function paintMeta(card,row){if(!card)return;const host=card.querySelector('[data-full-odds-main]');if(!host)return;const head=host.querySelector('.fom-head b'),small=host.querySelector('.fom-head small'),badge=host.querySelector('.fom-count'),note=card.querySelector('.details-note');if(row){const count=Array.isArray(row.availableBookmakers)&&row.availableBookmakers.length?row.availableBookmakers.length:10;if(head)head.textContent='FULL MARKET · CENTRAL 10-BOOK CACHE';if(small)small.textContent='อ่านจาก cache กลางที่ Server เตรียมไว้ · ผู้ชมไม่เรียก 5USD';if(badge)badge.textContent=`${count}/10 BOOKS · SERVER CACHE`;if(note)note.textContent='การกดการ์ดไม่เรียก Full Market API และไม่สามารถสั่ง 5USD · อ่านจาก cache กลางเท่านั้น'}else{if(small)small.textContent='Server cache ยังไม่มีชุด 10 bookmaker สำหรับคู่นี้ · แสดงข้อมูล Bulk ที่มีอยู่ก่อน';if(badge)badge.textContent='CENTRAL CACHE PENDING · 0 PROVIDER REQUEST';if(note)note.textContent='ผู้ชมไม่มีสิทธิ์สั่ง 5USD · รอ Central Scheduler เติม Full Market เข้าคลังกลาง'}}
function render(card,f){if(!baseRender||!card||!f)return;const row=cache.get(fixtureId(card))||null;baseRender(card,row?enrich(f,row):f);paintMeta(card,row)}
function install(){const api=window.NOMAD343_FULL_ODDS_BULK;if(!api||typeof api.renderCard!=='function'||api.__centralCacheInstalled)return false;baseRender=api.renderCard.bind(api);api.renderCard=(card,f)=>render(card,f);api.__centralCacheInstalled=true;api.mode='CENTRAL_SERVER_CACHE_ZERO_PROVIDER_REQUESTS';return true}
function repaintExpanded(){document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]').forEach(card=>{const id=fixtureId(card),f=window.NOMAD343_LIVE?.getFixture?.(id);if(f)render(card,f)})}
function livePriceSnapshot(){const out=new Map();document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]').forEach(card=>out.set(fixtureId(card),[...card.querySelectorAll('.fom-price-row.live .fom-price')].map(el=>el.textContent.trim())));return out}
function pulseLivePrices(before){document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]').forEach(card=>{const old=before.get(fixtureId(card))||[],cells=[...card.querySelectorAll('.fom-price-row.live .fom-price')];cells.forEach((cell,i)=>{cell.classList.remove('fom-price-refresh','fom-price-change');void cell.offsetWidth;cell.classList.add(old[i]!==undefined&&old[i]!==cell.textContent.trim()?'fom-price-change':'fom-price-refresh')})})}
async function load(){if(busy||document.visibilityState==='hidden')return;busy=true;try{install();const r=await fetch(`${API}?_=${Date.now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true||!Array.isArray(j.fixtures))return;const before=livePriceSnapshot();cache.clear();for(const row of j.fixtures){const id=String(row?.fixtureId||'').trim();if(id&&row?.fullOdds)cache.set(id,row)}lastLoadedAt=Date.now();repaintExpanded();pulseLivePrices(before)}catch{}finally{busy=false}}
function boot(){install();load();let tries=0;const t=setInterval(()=>{install();tries++;if(tries>=20)clearInterval(t)},250);setInterval(load,POLL_MS);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastLoadedAt>10_000)load()})}
queueMicrotask(boot);
window.NOMAD343_FULL_ODDS_10BOOK={version:VERSION,refresh:load,has:id=>cache.has(String(id)),cacheSize:()=>cache.size,mode:'CENTRAL_SERVER_CACHE_ZERO_PROVIDER_REQUESTS'};
})();
