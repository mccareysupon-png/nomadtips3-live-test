(()=>{
'use strict';
const VERSION='343-bet365-board-v1';
const API='/api/engine/board';
const POLL_MS=30_000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const text=v=>v===null||v===undefined?'':String(v);
const MARKET_LABELS={
  '1x2':'1X2 · Full Time',
  '1x2_half':'1X2 · 1st Half',
  asian_handicap:'Asian Handicap · Full Time',
  asian:'Asian Handicap · Full Time',
  asian_handicap_half:'Asian Handicap · 1st Half',
  asian_half:'Asian Handicap · 1st Half',
  goal_line:'Goals O/U · Full Time',
  goalline:'Goals O/U · Full Time',
  goal_line_half:'Goals O/U · 1st Half',
  goalline_half:'Goals O/U · 1st Half',
  corner_line:'Corners O/U · Full Time',
  corner:'Corners O/U · Full Time',
  corner_line_half:'Corners O/U · 1st Half',
  corner_half:'Corners O/U · 1st Half',
  corner_asian:'Corner Asian Handicap',
  card_line:'Cards O/U · Full Time',
  cards:'Cards O/U · Full Time',
  card_asian:'Card Asian Handicap',
  cards_asian:'Card Asian Handicap',
  btts:'Both Teams To Score'
};
const KEY_LABELS={line:'Line',home:'Home',draw:'Draw',away:'Away',over:'Over',under:'Under',yes:'Yes',no:'No'};
const STAGE_LABELS={opening:'OPENING',closing:'PRE-MATCH',inplay:'IN-PLAY',in_play:'IN-PLAY',current:'CURRENT'};
let lastSnapshot=null,busy=false;

function fixtureKey(f){return String(f?.fixtureId??[f?.home?.name,f?.away?.name,f?.kickoffAt??f?.kickoffUtc].join('|'))}
function classify(f){const s=String(f?.boardState??f?.status??'').toLowerCase();if(['live','in_play','inplay','playing','half'].some(x=>s.includes(x)))return'live';if(['finished','full_time','ft','ended'].some(x=>s.includes(x)))return'finished';return'scheduled'}
function isBet365(value){return String(value??'').toLowerCase().replace(/[\s_-]/g,'').includes('bet365')}
function bet365Root(raw){
  if(!raw||typeof raw!=='object')return null;
  if(Array.isArray(raw.bookmakers)){
    const b=raw.bookmakers.find(x=>isBet365(x?.slug)||isBet365(x?.name)||isBet365(x?.bookmaker?.slug)||isBet365(x?.bookmaker?.name));
    return b?.odds??b?.markets??null;
  }
  if(raw.data&&typeof raw.data==='object'){
    const nested=bet365Root(raw.data);
    if(nested)return nested;
  }
  if(raw.bet365&&typeof raw.bet365==='object')return raw.bet365.odds??raw.bet365.markets??raw.bet365;
  if(raw.odds&&typeof raw.odds==='object'&&!('opening' in raw)&&!('closing' in raw)&&!('inplay' in raw))return raw.odds;
  const keys=Object.keys(raw);
  if(keys.some(k=>MARKET_LABELS[k]||/^(1x2|asian|goal|corner|card|btts)/i.test(k)))return raw;
  return null;
}
function primitiveEntries(obj){
  if(obj===null||obj===undefined)return[];
  if(typeof obj!=='object')return [['line',obj]];
  const preferred=['line','home','draw','away','over','under','yes','no'];
  const out=[];
  for(const k of preferred){if(obj[k]!==null&&obj[k]!==undefined&&typeof obj[k]!=='object')out.push([k,obj[k]])}
  for(const [k,v] of Object.entries(obj)){if(preferred.includes(k)||v===null||v===undefined||typeof v==='object')continue;out.push([k,v])}
  return out;
}
function priceValue(v){const n=num(v);if(n!==null)return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000);return text(v)||'—'}
function stageBlock(name,value){
  if(value===null||value===undefined)return `<div class="b365-stage is-empty"><b>${esc(STAGE_LABELS[name]||name)}</b><span>—</span></div>`;
  const entries=primitiveEntries(value);
  if(!entries.length)return `<div class="b365-stage is-empty"><b>${esc(STAGE_LABELS[name]||name)}</b><span>—</span></div>`;
  const chips=entries.map(([k,v])=>`<span class="b365-chip"><small>${esc(KEY_LABELS[k]||k.replaceAll('_',' '))}</small><strong>${esc(priceValue(v))}</strong></span>`).join('');
  return `<div class="b365-stage${name==='inplay'||name==='in_play'?' live-stage':''}"><b>${esc(STAGE_LABELS[name]||name)}</b><div class="b365-chips">${chips}</div></div>`;
}
function marketBlock(key,value){
  const label=MARKET_LABELS[key]||key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  if(value===null||value===undefined)return `<section class="b365-market"><header><b>${esc(label)}</b><span>NO PRICE</span></header><div class="b365-stage is-empty"><span>—</span></div></section>`;
  let stages=[];
  if(typeof value==='object'&&!Array.isArray(value)){
    const known=['opening','closing','inplay','in_play'];
    stages=known.filter(k=>Object.prototype.hasOwnProperty.call(value,k)).map(k=>[k,value[k]]);
    if(!stages.length)stages=[['current',value]];
  }else stages=[['current',value]];
  return `<section class="b365-market"><header><b>${esc(label)}</b><span>BET365</span></header>${stages.map(([k,v])=>stageBlock(k,v)).join('')}</section>`;
}
function oddsPanel(f){
  const root=bet365Root(f?.providerOdds??f?.odds);
  const state=classify(f);
  const title=state==='scheduled'?'BET365 · PRE-MATCH MARKETS':state==='live'?'BET365 · ALL MARKETS':'BET365 · MARKET SNAPSHOT';
  if(!root||typeof root!=='object')return `<section class="b365-board"><div class="b365-head"><div><b>${title}</b><small>5DollarFootballAPI</small></div><span class="b365-count">0 ตลาด</span></div><div class="b365-empty">ยังไม่มีราคา Bet365 สำหรับคู่นี้</div></section>`;
  const markets=Object.entries(root).filter(([k,v])=>!['fixture_id','bookmaker','slug','name','updated_at','recorded_at'].includes(k)&&v!==undefined);
  return `<section class="b365-board"><div class="b365-head"><div><b>${title}</b><small>Opening · Pre-match · In-play จาก 5USD</small></div><span class="b365-count">${markets.length} ตลาด</span></div><div class="b365-grid">${markets.map(([k,v])=>marketBlock(k,v)).join('')}</div></section>`;
}
function pair(v){return v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null}}
function hasStats(f){const st=f?.statistics||{};return ['shotsOnTarget','shotsOffTarget','attacks','dangerousAttacks','possession'].some(k=>{const p=pair(st[k]);return p.home!==null||p.away!==null})||(pair(f?.corners).home!==null||pair(f?.corners).away!==null)}
function scheduledStats(f){
  if(classify(f)!=='scheduled')return'';
  if(!hasStats(f))return `<section class="b365-stats"><div class="b365-head"><div><b>5USD STATISTICS</b><small>ข้อมูลที่ผู้ให้บริการส่งมากับ fixture</small></div></div><div class="b365-empty">ยังไม่มี match statistics ก่อนเริ่มแข่งสำหรับคู่นี้</div></section>`;
  const st=f.statistics||{};
  const rows=[['SOT',pair(st.shotsOnTarget)],['SOFF',pair(st.shotsOffTarget)],['Corners',pair(f.corners)],['Attacks',pair(st.attacks)],['Dangerous',pair(st.dangerousAttacks)],['Possession',pair(st.possession)]];
  return `<section class="b365-stats"><div class="b365-head"><div><b>5USD STATISTICS</b><small>ข้อมูลที่ผู้ให้บริการส่งมากับ fixture</small></div></div><div class="b365-stat-grid">${rows.map(([label,p])=>`<div><small>${esc(label)}</small><b>${esc(p.home??'—')} : ${esc(p.away??'—')}</b></div>`).join('')}</div></section>`;
}
function decorate(snapshot){
  const fixtures=Array.isArray(snapshot?.fixtures)?snapshot.fixtures:[];
  const map=new Map(fixtures.map(f=>[fixtureKey(f),f]));
  document.querySelectorAll('.match-card[data-match-id]').forEach(card=>{
    const f=map.get(String(card.dataset.matchId||''));
    if(!f)return;
    const details=card.querySelector('.event-details');
    if(!details)return;
    details.querySelectorAll('[data-b365-addon]').forEach(el=>el.remove());
    const wrap=document.createElement('div');
    wrap.dataset.b365Addon='1';
    wrap.className='b365-addon';
    wrap.innerHTML=`${scheduledStats(f)}${oddsPanel(f)}`;
    details.prepend(wrap);
  });
}
function injectStyle(){
  if(document.getElementById('nomad343-bet365-board'))return;
  const s=document.createElement('style');s.id='nomad343-bet365-board';s.textContent=`
  .b365-addon{display:grid;gap:9px;margin-bottom:9px}.b365-board,.b365-stats{background:#111914;border:1px solid #2c3b30}.b365-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border-bottom:1px solid #29372d}.b365-head>div{display:grid;gap:2px}.b365-head b{font-size:11px;letter-spacing:.05em;color:#eef7f0}.b365-head small{font-size:8px;color:#819087}.b365-count{font-size:9px;color:#f2ca61;border:1px solid #5d512c;padding:3px 6px;background:#1e1b10}.b365-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:9px}.b365-market{min-width:0;background:#0d120f;border:1px solid #26332a}.b365-market>header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 8px;border-bottom:1px solid #222e26}.b365-market>header b{font-size:9px;color:#dce9df}.b365-market>header span{font-size:7px;color:#e7bb4b}.b365-stage{display:grid;grid-template-columns:64px 1fr;gap:7px;align-items:start;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.035)}.b365-stage:last-child{border-bottom:0}.b365-stage>b{font-size:7px;color:#77857b;padding-top:5px}.b365-stage.live-stage>b{color:#74d99a}.b365-chips{display:flex;flex-wrap:wrap;gap:5px}.b365-chip{display:inline-grid;grid-template-columns:auto auto;align-items:center;gap:5px;background:#151e18;border:1px solid #2b3a30;padding:4px 6px;min-width:58px}.b365-chip small{font-size:7px;color:#89978d;text-transform:capitalize}.b365-chip strong{font-size:10px;color:#f1f7f2}.b365-stage.live-stage .b365-chip{border-color:#376848;background:#142219}.b365-stage.live-stage .b365-chip strong{color:#8ee4ad}.b365-stage.is-empty span{color:#657169;font-size:9px;padding:3px}.b365-empty{padding:16px 10px;text-align:center;color:#738078;font-size:9px}.b365-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#263229}.b365-stat-grid>div{display:grid;gap:3px;padding:9px;background:#101712;text-align:center}.b365-stat-grid small{font-size:7px;color:#829087}.b365-stat-grid b{font-size:10px;color:#e4eee6}@media(max-width:760px){.b365-grid{grid-template-columns:1fr}.b365-stage{grid-template-columns:56px 1fr}.b365-stat-grid{grid-template-columns:repeat(2,1fr)}}`;
  document.head.appendChild(s);
}
async function load(){if(busy)return;busy=true;try{const r=await fetch(`${API}?bet365=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);const j=await r.json();if(j?.ok!==true)throw new Error('DATA_NOT_READY');lastSnapshot=j;decorate(j)}catch(e){console.warn('[NOMAD343 BET365]',e)}finally{busy=false}}
const mo=new MutationObserver(records=>{if(!lastSnapshot)return;const hasMatch=records.some(r=>[...r.addedNodes].some(n=>n?.nodeType===1&&(n.matches?.('.match-card[data-match-id]')||n.querySelector?.('.match-card[data-match-id]'))));if(hasMatch)setTimeout(()=>decorate(lastSnapshot),0)});
function start(){injectStyle();mo.observe(document.body,{childList:true,subtree:true});load();setInterval(load,POLL_MS);window.NOMAD343_BET365={version:VERSION,reload:load}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();