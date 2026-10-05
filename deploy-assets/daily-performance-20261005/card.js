/* B46_DAILY_PERFORMANCE_20261005
 * Presentation-only Daily Performance card.
 * Reads existing Signal + Statistics APIs. No engine, settlement, scorebar, routing or board mutation.
 */
(()=>{
'use strict';
const ID='ball46-daily-performance';
const TZ='Europe/London';
const CUTOFF_HOUR=6;
const REFRESH_MS=300000;
let timer=0,lastGood=null,busy=false;
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ensureCard(){
  let root=document.getElementById(ID); if(root)return root;
  const toolbar=document.querySelector('.main-board .board-toolbar'); if(!toolbar)return null;
  root=document.createElement('section'); root.id=ID; root.setAttribute('aria-label','Daily performance');
  root.innerHTML=`<div class="b46-perf-grid">
    <section class="b46-perf-side today" data-b46-day="today">
      <div class="b46-perf-head"><div class="b46-perf-title"><span class="b46-perf-kicker">TODAY'S PERFORMANCE</span><span class="b46-perf-sub" data-b46-label="today">Live Summary</span></div><div class="b46-perf-rate"><span>WIN RATE</span><strong data-b46-rate="today">—</strong></div></div>
      <div class="b46-perf-stats"><div class="b46-perf-stat win"><span>WIN</span><strong data-b46-stat="today-win">—</strong></div><div class="b46-perf-stat loss"><span>LOSS</span><strong data-b46-stat="today-loss">—</strong></div><div class="b46-perf-stat push"><span>PUSH</span><strong data-b46-stat="today-push">—</strong></div><div class="b46-perf-stat pending"><span>PENDING</span><strong data-b46-stat="today-pending">—</strong></div></div>
      <div class="b46-perf-foot"><span class="b46-perf-total">TOTAL PICKS <b data-b46-total="today">—</b></span><div class="b46-market-row" data-b46-markets="today"></div></div>
      <span class="b46-perf-state" data-b46-state="today">LONDON DAY · 06:00</span>
    </section>
    <section class="b46-perf-side yesterday" data-b46-day="yesterday">
      <div class="b46-perf-head"><div class="b46-perf-title"><span class="b46-perf-kicker">YESTERDAY'S PERFORMANCE</span><span class="b46-perf-sub" data-b46-label="yesterday">Final Summary</span></div><div class="b46-perf-rate"><span>WIN RATE</span><strong data-b46-rate="yesterday">—</strong></div></div>
      <div class="b46-perf-stats"><div class="b46-perf-stat win"><span>WIN</span><strong data-b46-stat="yesterday-win">—</strong></div><div class="b46-perf-stat loss"><span>LOSS</span><strong data-b46-stat="yesterday-loss">—</strong></div><div class="b46-perf-stat push"><span>PUSH</span><strong data-b46-stat="yesterday-push">—</strong></div></div>
      <div class="b46-perf-foot"><span class="b46-perf-total">TOTAL PICKS <b data-b46-total="yesterday">—</b></span><div class="b46-market-row" data-b46-markets="yesterday"></div></div>
      <span class="b46-perf-state" data-b46-state="yesterday">FINAL · SETTLED ONLY</span>
    </section>
  </div>`;
  toolbar.insertAdjacentElement('afterend',root); return root;
}
function parts(ms){const p={};for(const x of new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)))if(x.type!=='literal')p[x.type]=x.value;return p}
function previousDate(key){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)-86400000).toISOString().slice(0,10)}
function sportsDay(ms){const p=parts(ms);let key=`${p.year}-${p.month}-${p.day}`;if(Number(p.hour)<CUTOFF_HOUR)key=previousDate(key);return key}
function parseMs(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='number'||/^\d+(?:\.\d+)?$/.test(String(v))){const n=Number(v);if(!Number.isFinite(n))return null;return n>1e12?n:n>1e9?n*1000:null}const n=Date.parse(String(v));return Number.isFinite(n)?n:null}
function stamp(row){for(const k of ['settledAt','settled_at','resolvedAt','resolved_at','updatedAt','updated_at','createdAt','created_at','timestamp','time','detectedAt','lockedAt','entryAt']){const n=parseMs(row?.[k]);if(n!==null)return n}return null}
function outcome(row){const raw=String(row?.result??row?.settlement??row?.outcome??row?.status??'').trim().toLowerCase();if(/(^|\b)win(n(er|ing)?)?(\b|$)/.test(raw))return'win';if(/(^|\b)loss|lose|lost(\b|$)/.test(raw))return'loss';if(/push|draw|refund|void|neutral|cancel/.test(raw))return'push';return null}
function market(row){const raw=String(row?.marketLabel??row?.market??row?.marketType??'').toLowerCase().replace(/[_-]+/g,' ');if(/asian|handicap|\bah\b/.test(raw))return'AH';if(/over\s*\/?\s*under|o\s*\/?\s*u|goal line|total/.test(raw))return'O/U';if(/1x2|match result|moneyline/.test(raw))return'1X2';return null}
function rowId(row){return String(row?.signalId??row?.id??[row?.fixtureId,row?.market,row?.selection].filter(Boolean).join('|')||'')}
function bucket(){return{win:0,loss:0,push:0,pending:0,markets:{'AH':{win:0,loss:0,push:0},'O/U':{win:0,loss:0,push:0},'1X2':{win:0,loss:0,push:0}}}}
function addSettled(b,row){const o=outcome(row);if(!o)return false;b[o]++;const m=market(row);if(m)b.markets[m][o]++;return true}
function finalStatus(row){return Boolean(outcome(row))||/settled|finished|final|closed|resolved/i.test(String(row?.status??''))}
function aggregate(stats,signals){const todayKey=sportsDay(Date.now()),yesterdayKey=previousDate(todayKey),today=bucket(),yesterday=bucket(),settledIds=new Set();
  for(const row of stats){const ms=stamp(row);if(ms===null)continue;const key=sportsDay(ms);if(key!==todayKey&&key!==yesterdayKey)continue;if(addSettled(key===todayKey?today:yesterday,row)){const id=rowId(row);if(id)settledIds.add(id)}}
  const seen=new Set();for(const s of signals){const id=rowId(s);if(id&&settledIds.has(id))continue;if(id&&seen.has(id))continue;if(id)seen.add(id);if(finalStatus(s))continue;const ms=stamp(s);if(ms!==null&&sportsDay(ms)!==todayKey)continue;today.pending++}
  return{today,yesterday,todayKey,yesterdayKey};
}
function winRate(b){const d=b.win+b.loss;return d?`${(b.win/d*100).toFixed(1).replace(/\.0$/,'')}%`:'—'}
function labelDate(key){const [y,m,d]=key.split('-').map(Number);return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'2-digit',month:'short'}).format(new Date(Date.UTC(y,m-1,d))).toUpperCase()}
function marketHtml(b){return['AH','O/U','1X2'].map(m=>`<span class="b46-market"><b>${m}</b><span>W ${b.markets[m].win} · L ${b.markets[m].loss} · P ${b.markets[m].push}</span></span>`).join('')}
function text(root,sel,value){const el=$(sel,root);if(el&&el.textContent!==String(value))el.textContent=String(value)}
function render(data){const root=ensureCard();if(!root)return;for(const [day,b] of [['today',data.today],['yesterday',data.yesterday]]){for(const o of ['win','loss','push'])text(root,`[data-b46-stat="${day}-${o}"]`,b[o]);if(day==='today')text(root,'[data-b46-stat="today-pending"]',b.pending);text(root,`[data-b46-rate="${day}"]`,winRate(b));text(root,`[data-b46-total="${day}"]`,b.win+b.loss+b.push+(day==='today'?b.pending:0));const box=$(`[data-b46-markets="${day}"]`,root),html=marketHtml(b);if(box&&box.innerHTML!==html)box.innerHTML=html}text(root,'[data-b46-label="today"]',`Live Summary · ${labelDate(data.todayKey)}`);text(root,'[data-b46-label="yesterday"]',`Final Summary · ${labelDate(data.yesterdayKey)}`)}
async function getJson(url){const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`${url}:${r.status}`);return r.json()}
async function refresh(){if(busy)return;busy=true;try{const [st,sg]=await Promise.all([getJson('/api/engine/statistics'),getJson('/api/engine/signals')]);if(st?.ok!==true||!Array.isArray(st?.rows))throw new Error('STATISTICS_SHAPE');if(!Array.isArray(sg?.signals))throw new Error('SIGNALS_SHAPE');lastGood=aggregate(st.rows,sg.signals);render(lastGood)}catch(e){if(lastGood)render(lastGood);console.warn('B46 Daily Performance refresh skipped:',e?.message||e)}finally{busy=false}}
function boot(){ensureCard();refresh();timer=setInterval(refresh,REFRESH_MS);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
