(()=>{
'use strict';
const VERSION='343-bet365-board-v5-detected-markets-only';
const SIGNALS_API='/api/engine/signals';
const POLL_MS=30_000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const text=v=>v===null||v===undefined?'':String(v);
const MARKET_LABELS={
  ft_1x2:'1X2 · Full Time',ft_ah:'Asian Handicap · Full Time',ft_over:'Goals OVER · Full Time',ft_under:'Goals UNDER · Full Time',
  ht_1x2:'1X2 · 1st Half',ht_ah:'Asian Handicap · 1st Half',ht_over:'Goals OVER · 1st Half',ht_under:'Goals UNDER · 1st Half',
  ft_corner_over:'Corners OVER · Full Time',ft_corner_under:'Corners UNDER · Full Time',ht_corner_over:'Corners OVER · 1st Half',ht_corner_under:'Corners UNDER · 1st Half',
  ft_corner_ah:'Corner Asian Handicap',ft_cards_over:'Cards OVER · Full Time',ft_cards_under:'Cards UNDER · Full Time',ft_cards_ah:'Card Asian Handicap',
  ft_btts_yes:'BTTS · YES',ft_btts_no:'BTTS · NO'
};
const KEY_LABELS={line:'Line',draw:'Draw',over:'Over',under:'Under',yes:'Yes',no:'No',home:'Home',away:'Away'};
const STAGES=[['openingPrice','OPENING'],['closingPrice','PRE-MATCH'],['inplayPrice','IN-PLAY']];
let lastSignals=[],busy=false;

function fixtureKey(v){return String(v?.fixtureId??'')}
function teamName(s,side){return s?.[side]?.name||side.toUpperCase()}
function priceValue(v){const n=num(v);if(n!==null)return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000);return text(v)||'—'}
function lineValue(v){const n=num(v);if(n===null)return'—';const t=priceValue(n);return n>0?`+${t}`:t}
function isAsian(s){return /(^|_)ah$|asian/i.test(String(s?.market??s?.providerMarket??''))}
function oppositeLine(v){const n=num(v);return n===null?null:(Object.is(n,-0)?0:-n)}
function chip(label,value){return `<span class="b365-chip"><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`}
function primitiveEntries(obj){
  if(obj===null||obj===undefined)return[];
  if(typeof obj!=='object')return[['line',obj]];
  const preferred=['line','home','draw','away','over','under','yes','no'],out=[];
  for(const k of preferred){if(obj[k]!==null&&obj[k]!==undefined&&typeof obj[k]!=='object')out.push([k,obj[k]])}
  for(const [k,v] of Object.entries(obj)){if(preferred.includes(k)||v===null||v===undefined||typeof v==='object')continue;out.push([k,v])}
  return out;
}
function stageBlock(label,value,s){
  if(value===null||value===undefined)return'';
  if(isAsian(s)&&value&&typeof value==='object'){
    const line=num(value.line??value.hdp??value.handicap),homeOdds=num(value.home??value.home_odds??value.homeOdds),awayOdds=num(value.away??value.away_odds??value.awayOdds);
    if(line!==null){
      const homeText=`${lineValue(line)}${homeOdds===null?'':` @ ${priceValue(homeOdds)}`}`;
      const awayText=`${lineValue(oppositeLine(line))}${awayOdds===null?'':` @ ${priceValue(awayOdds)}`}`;
      return `<div class="b365-stage${label==='IN-PLAY'?' live-stage':''}"><b>${label}</b><div class="b365-chips">${chip(teamName(s,'home'),homeText)}${chip(teamName(s,'away'),awayText)}</div></div>`;
    }
  }
  const entries=primitiveEntries(value);if(!entries.length)return'';
  const chips=entries.map(([k,v])=>{const labelText=k==='home'?teamName(s,'home'):k==='away'?teamName(s,'away'):(KEY_LABELS[k]||k.replaceAll('_',' '));const rendered=k==='line'?lineValue(v):priceValue(v);return chip(labelText,rendered)}).join('');
  return `<div class="b365-stage${label==='IN-PLAY'?' live-stage':''}"><b>${label}</b><div class="b365-chips">${chips}</div></div>`;
}
function detectedStrip(s){
  const parts=[];if(s.selection)parts.push(String(s.selection).toUpperCase());if(num(s.line)!==null)parts.push(`LINE ${lineValue(s.line)}`);if(num(s.odds)!==null)parts.push(`ODDS ${priceValue(s.odds)}`);
  return `<div class="b365-detected"><span>DETECTED</span><strong>${esc(parts.join(' · ')||'BET365 PRICE CHECKED')}</strong></div>`;
}
function marketBlock(s){
  const stages=STAGES.map(([key,label])=>stageBlock(label,s?.[key],s)).filter(Boolean).join('');
  const title=s?.marketLabel||MARKET_LABELS[s?.market]||String(s?.market||'BET365 MARKET').replaceAll('_',' ').toUpperCase();
  return `<section class="b365-market"><header><b>${esc(title)}</b><span>BET365</span></header>${detectedStrip(s)}${stages}</section>`;
}
function boardFor(signals){
  if(!signals.length)return'';
  return `<section class="b365-board"><div class="b365-head"><div><b>BET365 · DETECTED MARKET PRICE</b><small>แสดงเฉพาะตลาดที่ Engine ตรวจจับและตรวจราคาจริง</small></div><span class="b365-count">${signals.length} ตลาด</span></div><div class="b365-grid">${signals.map(marketBlock).join('')}</div></section>`;
}
function placeAddon(details,wrap){const flow=details.querySelector('.nomad-event-flow-card');if(flow){flow.insertAdjacentElement('afterend',wrap);return}const stats=details.querySelector('.evidence-card');if(stats){stats.insertAdjacentElement('afterend',wrap);return}details.prepend(wrap)}
function decorate(signals){
  const grouped=new Map();for(const s of Array.isArray(signals)?signals:[]){const id=fixtureKey(s);if(!id)continue;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(s)}
  document.querySelectorAll('.match-card[data-match-id]').forEach(card=>{
    const details=card.querySelector('.event-details');if(!details)return;details.querySelectorAll('[data-b365-addon]').forEach(el=>el.remove());
    const rows=grouped.get(String(card.dataset.matchId||''))||[];if(!rows.length)return;
    const html=boardFor(rows);if(!html)return;const wrap=document.createElement('div');wrap.dataset.b365Addon='1';wrap.className='b365-addon';wrap.innerHTML=html;placeAddon(details,wrap);
  });
}
function injectStyle(){
  if(document.getElementById('nomad343-bet365-board'))return;
  const s=document.createElement('style');s.id='nomad343-bet365-board';s.textContent=`
  .b365-addon{display:grid;gap:9px;margin:9px 0}.b365-board{background:#111914;border:1px solid #2c3b30}.b365-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border-bottom:1px solid #29372d}.b365-head>div{display:grid;gap:2px}.b365-head b{font-size:11px;letter-spacing:.05em;color:#eef7f0}.b365-head small{font-size:8px;color:#819087}.b365-count{font-size:9px;color:#f2ca61;border:1px solid #5d512c;padding:3px 6px;background:#1e1b10}.b365-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:9px}.b365-market{min-width:0;background:#0d120f;border:1px solid #26332a}.b365-market>header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 8px;border-bottom:1px solid #222e26}.b365-market>header b{font-size:9px;color:#dce9df}.b365-market>header span{font-size:7px;color:#e7bb4b}.b365-detected{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 8px;background:#121d15;border-bottom:1px solid #294232}.b365-detected span{font-size:7px;font-weight:900;color:#71d997}.b365-detected strong{font-size:9px;color:#eef7f0;text-align:right}.b365-stage{display:grid;grid-template-columns:64px 1fr;gap:7px;align-items:start;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.035)}.b365-stage:last-child{border-bottom:0}.b365-stage>b{font-size:7px;color:#77857b;padding-top:5px}.b365-stage.live-stage>b{color:#74d99a}.b365-chips{display:flex;flex-wrap:wrap;gap:5px}.b365-chip{display:inline-grid;grid-template-columns:auto auto;align-items:center;gap:5px;background:#151e18;border:1px solid #2b3a30;padding:4px 6px;min-width:58px}.b365-chip small{font-size:7px;color:#89978d;text-transform:none}.b365-chip strong{font-size:10px;color:#f1f7f2}.b365-stage.live-stage .b365-chip{border-color:#376848;background:#142219}.b365-stage.live-stage .b365-chip strong{color:#8ee4ad}@media(max-width:760px){.b365-grid{grid-template-columns:1fr}.b365-stage{grid-template-columns:56px 1fr}.b365-detected{align-items:flex-start}.b365-detected strong{font-size:8px}}`;
  document.head.appendChild(s);
}
async function load(){if(busy)return;busy=true;try{const r=await fetch(`${SIGNALS_API}?bet365=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);const j=await r.json();if(j?.ok!==true)throw new Error('DATA_NOT_READY');lastSignals=Array.isArray(j.signals)?j.signals:[];decorate(lastSignals)}catch(e){console.warn('[NOMAD343 BET365]',e)}finally{busy=false}}
const mo=new MutationObserver(records=>{if(!lastSignals.length)return;const hasMatch=records.some(r=>[...r.addedNodes].some(n=>n?.nodeType===1&&(n.matches?.('.match-card[data-match-id]')||n.querySelector?.('.match-card[data-match-id]'))));if(hasMatch)setTimeout(()=>decorate(lastSignals),0)});
function start(){injectStyle();mo.observe(document.body,{childList:true,subtree:true});load();setInterval(load,POLL_MS);window.NOMAD343_BET365={version:VERSION,reload:load}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
