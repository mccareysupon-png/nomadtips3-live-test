(()=>{
'use strict';
const VERSION='343-live-prediction-inline-v2-v2rows-resilient';
const API='/api/engine/signals';
const POLL_MS=30000;
let groups=new Map();
let ready=false;
let busy=false;
let lastGoodAt=0;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const show=v=>v===null||v===undefined||v===''?'—':String(v);
const marketKey=s=>String(s?.market||s?.providerMarket||'').toLowerCase();
function numberText(v){const n=num(v);if(n===null)return'—';return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function signed(v){const n=num(v);if(n===null)return'';const t=numberText(n);return n>0?`+${t}`:t}
function marketShort(s){const k=marketKey(s);if(k==='ft_1x2')return'1X2';if(k==='ft_ah')return'AH';if(k==='ft_over'||k==='ft_under')return'O/U';if(k==='ht_1x2')return'HT 1X2';if(k==='ht_ah')return'HT AH';if(k==='ht_over'||k==='ht_under')return'HT O/U';if(k.includes('corner'))return k.includes('ah')?'COR AH':'COR O/U';if(k.includes('card'))return k.includes('ah')?'CARDS AH':'CARDS O/U';if(k.includes('btts'))return'BTTS';return String(s?.marketLabel||s?.market||'SIGNAL').trim().slice(0,14)||'SIGNAL'}
function isAsian(s){const k=marketKey(s);return k.includes('ah')||k.includes('asian')||k.includes('handicap')}
function isTotal(s){const k=marketKey(s),sel=String(s?.selection||'').toUpperCase();return sel==='OVER'||sel==='UNDER'||k.includes('over')||k.includes('under')||k.includes('goal_line')||k.includes('corner_line')||k.includes('card_line')}
function pickText(s){const sel=String(s?.selection||'').trim().toUpperCase()||'—';const line=num(s?.line);if(line===null)return sel;return`${sel} ${isAsian(s)?signed(line):numberText(line)}`}
function group(rows){const map=new Map();for(const s of rows){const id=String(s?.fixtureId??'').trim();if(!id)continue;const a=map.get(id)||[];a.push(s);map.set(id,a)}for(const a of map.values())a.sort((x,y)=>Number(y?.createdAt||0)-Number(x?.createdAt||0));return map}
function style(){if(document.getElementById('nomad343-live-prediction-inline-style'))return;const s=document.createElement('style');s.id='nomad343-live-prediction-inline-style';s.textContent=`.signal-cell.prediction-live{display:flex!important;flex-direction:column;align-items:flex-end;justify-content:center;gap:2px;min-width:0}.signal-cell.prediction-live .pred-main{font-size:8px;font-weight:900;line-height:1;color:#15945f;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}.signal-cell.prediction-live .pred-sub{font-size:7px;font-weight:700;line-height:1;color:var(--muted);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}.signal-cell.prediction-live.no-pick .pred-main{color:var(--muted)}@media(max-width:760px){.signal-cell.prediction-live .pred-main{font-size:6.8px}.signal-cell.prediction-live .pred-sub{font-size:6px}}`;document.head.appendChild(s)}
function decorateRow(row){const id=String(row?.dataset?.matchId||'').trim(),cell=row?.querySelector?.('.signal-cell');if(!id||!cell)return;const rows=groups.get(id)||[];cell.classList.add('prediction-live');if(rows.length){const s=rows[0],odds=num(s?.odds),count=rows.length;cell.classList.add('locked');cell.classList.remove('no-pick');cell.innerHTML=`<span class="pred-main">${esc(marketShort(s))} · ${esc(pickText(s))}</span><span class="pred-sub">${odds===null?'LIVE':`@ ${odds.toFixed(2)}`}${count>1?` · +${count-1}`:''}</span>`;cell.title=`Live prediction · ${marketShort(s)} · ${pickText(s)}${odds===null?'':` @ ${odds.toFixed(2)}`}`;return}cell.classList.remove('locked');cell.classList.add('no-pick');cell.innerHTML='<span class="pred-main">WATCH</span><span class="pred-sub">NO LIVE PICK</span>';cell.title=ready?'No active live prediction':'Waiting for signal feed'}
function decorate(){document.querySelectorAll('.match-row[data-match-id]').forEach(decorateRow)}
async function load(){if(busy)return;busy=true;try{const r=await fetch(`${API}?_=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);const j=await r.json();if(j?.ok!==true||!Array.isArray(j.signals))throw new Error('SIGNALS_NOT_READY');groups=group(j.signals);ready=true;lastGoodAt=Date.now();decorate()}catch(err){
  // Never blank a last-good live prediction because of one transient signals request.
  if(!lastGoodAt)ready=false;
  decorate();
  console.warn('Live prediction refresh unavailable',err);
}finally{busy=false}}
function start(){style();const host=document.querySelector('[data-board-sections]');if(host)new MutationObserver(()=>decorate()).observe(host,{childList:true,subtree:true});load();setInterval(load,POLL_MS);window.NOMAD343_LIVE_PREDICTION_INLINE={version:VERSION,source:'ENGINE_SIGNALS',pollMs:POLL_MS,lastGoodAt:()=>lastGoodAt,reload:load,decorate}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
