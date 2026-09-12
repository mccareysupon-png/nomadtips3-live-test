(()=>{
'use strict';
const VERSION='343-full-odds-main-v1';
const API='/api/engine/fixture-odds';
const CACHE_MS=60_000;
const cache=new Map(),busy=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const fmt=v=>{const n=num(v);return n===null?'—':(Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000))};
const signed=v=>{const n=num(v);return n===null?'—':n>0?`+${fmt(n)}`:fmt(n)};
const LABELS={
  '1x2':'1X2 · Full Time','1x2_half':'1X2 · 1st Half',
  asian_handicap:'Asian Handicap · Full Time',asian:'Asian Handicap · Full Time',
  asian_handicap_half:'Asian Handicap · 1st Half',asian_half:'Asian Handicap · 1st Half',
  goal_line:'Goals O/U · Full Time',goalline:'Goals O/U · Full Time',
  goal_line_half:'Goals O/U · 1st Half',goalline_half:'Goals O/U · 1st Half',
  corner_line:'Corners O/U · Full Time',corner:'Corners O/U · Full Time',
  corner_line_half:'Corners O/U · 1st Half',corner_half:'Corners O/U · 1st Half',
  corner_asian:'Corner Asian Handicap',card_line:'Cards O/U · Full Time',cards:'Cards O/U · Full Time',
  card_asian:'Card Asian Handicap',cards_asian:'Card Asian Handicap',btts:'Both Teams To Score'
};
const STAGES=[['inplay','IN-PLAY'],['in_play','IN-PLAY'],['closing','PRE-MATCH'],['opening','OPENING']];
function team(card,side){const n=card.querySelectorAll('.team-name');return side==='home'?(n[0]?.textContent?.trim()||'HOME'):(n[1]?.textContent?.trim()||'AWAY')}
function oddsRoot(raw){
  const root=raw?.fullOdds??raw?.data??raw;if(!root||typeof root!=='object')return null;
  if(Array.isArray(root.bookmakers)){
    const b=root.bookmakers.find(x=>String(x?.slug??x?.name??x?.bookmaker?.slug??x?.bookmaker?.name??'').toLowerCase().replace(/[\s_-]/g,'').includes('bet365'))||root.bookmakers[0];
    if(b?.odds&&typeof b.odds==='object')return b.odds;
    if(b?.markets&&typeof b.markets==='object')return b.markets;
  }
  if(root.bet365&&typeof root.bet365==='object')return root.bet365.odds??root.bet365.markets??root.bet365;
  if(root.odds&&typeof root.odds==='object'&&!('opening' in root)&&!('closing' in root)&&!('inplay' in root))return root.odds;
  return root;
}
function chip(label,value){return `<span class="fom-chip"><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`}
function stageHtml(key,label,v,card){
  if(v===null||v===undefined)return'';
  const home=team(card,'home'),away=team(card,'away'),k=String(key).toLowerCase();
  if(k.startsWith('1x2')){
    if(typeof v!=='object')return'';const rows=[];
    if(v.home!==undefined)rows.push(chip(home,fmt(v.home)));
    if(v.draw!==undefined)rows.push(chip('DRAW',fmt(v.draw)));
    if(v.away!==undefined)rows.push(chip(away,fmt(v.away)));
    return rows.length?`<div class="fom-stage"><b>${label}</b><div class="fom-chips">${rows.join('')}</div></div>`:'';
  }
  const asian=k==='asian'||k.includes('asian_handicap')||k==='corner_asian'||k==='card_asian'||k==='cards_asian';
  if(asian){
    if(typeof v!=='object')return'';
    const line=num(v.line??v.hdp??v.handicap),h=num(v.home??v.home_odds??v.homeOdds),a=num(v.away??v.away_odds??v.awayOdds);
    if(line===null&&h===null&&a===null)return'';
    const rows=[];
    if(line!==null||h!==null)rows.push(chip(home,`${line===null?'':signed(line)}${h===null?'':`${line===null?'':' @ '}${fmt(h)}`}`));
    if(line!==null||a!==null)rows.push(chip(away,`${line===null?'':signed(-line)}${a===null?'':`${line===null?'':' @ '}${fmt(a)}`}`));
    return `<div class="fom-stage"><b>${label}</b><div class="fom-chips">${rows.join('')}</div></div>`;
  }
  const total=/goal|corner_line|card_line|cards$/.test(k);
  if(total){
    if(typeof v!=='object')return'';
    const line=num(v.line),over=num(v.over??v.over_odds??v.overOdds),under=num(v.under??v.under_odds??v.underOdds);
    if(line===null&&over===null&&under===null)return'';
    const rows=[];
    if(line!==null||over!==null)rows.push(chip('OVER',`${line===null?'':fmt(line)}${over===null?'':`${line===null?'':' @ '}${fmt(over)}`}`));
    if(line!==null||under!==null)rows.push(chip('UNDER',`${line===null?'':fmt(line)}${under===null?'':`${line===null?'':' @ '}${fmt(under)}`}`));
    return `<div class="fom-stage"><b>${label}</b><div class="fom-chips">${rows.join('')}</div></div>`;
  }
  if(k==='btts'&&typeof v==='object'){
    const rows=[];if(v.yes!==undefined)rows.push(chip('YES',fmt(v.yes)));if(v.no!==undefined)rows.push(chip('NO',fmt(v.no)));
    return rows.length?`<div class="fom-stage"><b>${label}</b><div class="fom-chips">${rows.join('')}</div></div>`:'';
  }
  return'';
}
function marketHtml(key,value,card){
  if(!value||typeof value!=='object')return'';
  const seen=new Set(),stages=[];
  for(const [stage,label] of STAGES){if(seen.has(label)||value[stage]===undefined||value[stage]===null)continue;const html=stageHtml(key,label,value[stage],card);if(html){seen.add(label);stages.push(html)}}
  if(!stages.length)return'';
  const title=LABELS[key]||String(key).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  return `<section class="fom-market"><header><b>${esc(title)}</b><span>BET365</span></header>${stages.join('')}</section>`;
}
function rank(key){const k=String(key).toLowerCase(),half=/(half|1st)/.test(k)?1:0;let f=9;if(k.startsWith('1x2'))f=0;else if(k==='asian'||k.startsWith('asian_'))f=1;else if(k.startsWith('goal'))f=2;else if(k.startsWith('corner'))f=3;else if(k.startsWith('card')||k.startsWith('cards'))f=4;else if(k.startsWith('btts'))f=5;return f*10+half}
function ensureHost(card){
  let host=card.querySelector('[data-full-odds-main]');if(host)return host;
  const details=card.querySelector('.event-details');if(!details)return null;
  host=document.createElement('div');host.dataset.fullOddsMain='1';host.className='fom-addon';
  const flow=details.querySelector('.nomad-event-flow-card'),stats=details.querySelector('.evidence-card');
  if(flow)flow.insertAdjacentElement('afterend',host);else if(stats)stats.insertAdjacentElement('afterend',host);else details.prepend(host);
  return host;
}
function render(card,payload){
  const host=ensureHost(card);if(!host)return;
  const root=oddsRoot(payload),entries=root&&typeof root==='object'?Object.entries(root).filter(([k,v])=>v&&typeof v==='object').sort((a,b)=>rank(a[0])-rank(b[0])):[];
  const rows=entries.map(([k,v])=>marketHtml(k,v,card)).filter(Boolean);
  const home=team(card,'home'),away=team(card,'away');
  if(!rows.length){host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>BET365 · LIVE MARKETS</b><small>${esc(home)} vs ${esc(away)} · FULL ODDS</small></div><span class="fom-count muted">ODDS —</span></div><div class="fom-empty">Full odds unavailable for this fixture</div></section>`;return}
  host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>BET365 · LIVE MARKETS</b><small>${esc(home)} vs ${esc(away)} · 5USD FULL ODDS</small></div><span class="fom-count">${rows.length} MARKETS</span></div><div class="fom-grid">${rows.join('')}</div></section>`;
}
function loading(card){const host=ensureHost(card);if(host)host.innerHTML='<section class="fom-board"><div class="fom-head"><div><b>BET365 · LIVE MARKETS</b><small>กำลังโหลด Line + Odds เต็ม</small></div><span class="fom-count muted">LOADING</span></div></section>'}
async function load(card){
  const id=String(card?.dataset?.matchId||'');if(!id||busy.has(id))return;
  const hit=cache.get(id);if(hit&&Date.now()-hit.at<CACHE_MS){render(card,hit.data);return}
  busy.add(id);loading(card);
  try{
    const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&_=${Date.now()}`,{cache:'no-store'}),j=await r.json().catch(()=>null);
    if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HTTP_${r.status}`);
    cache.set(id,{at:Date.now(),data:j});render(card,j);
  }catch(e){const host=ensureHost(card);if(host)host.innerHTML=`<section class="fom-board"><div class="fom-head"><div><b>BET365 · LIVE MARKETS</b><small>${esc(String(e?.message||e))}</small></div><span class="fom-count muted">ODDS —</span></div></section>`}
  finally{busy.delete(id)}
}
function afterToggle(card){queueMicrotask(()=>{if(card?.getAttribute('aria-expanded')==='true')load(card)})}
function hydrateExpanded(root=document){root.querySelectorAll?.('.match-card[data-match-id][aria-expanded="true"]').forEach(load)}
function injectStyle(){if(document.getElementById('nomad343-full-odds-main'))return;const s=document.createElement('style');s.id='nomad343-full-odds-main';s.textContent=`.fom-addon{display:grid;gap:8px;margin:8px 0 9px}.fom-board{background:#0e1511;border:1px solid #2b3a30}.fom-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border-bottom:1px solid #28362c}.fom-head>div{display:grid;gap:2px;min-width:0}.fom-head b{font-size:11px;letter-spacing:.05em;color:#eef7f0}.fom-head small{font-size:8px;color:#7f8d83;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fom-count{font-size:8px;font-weight:900;color:#f1c75b;border:1px solid #5b4e29;padding:3px 6px;background:#1c190f;white-space:nowrap}.fom-count.muted{color:#7c8980;border-color:#344039;background:#111713}.fom-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px}.fom-market{border:1px solid #26352b;background:#111914;min-width:0}.fom-market>header{display:flex;justify-content:space-between;gap:8px;padding:7px 8px;border-bottom:1px solid #26352b}.fom-market>header b{font-size:9px;color:#dfeae2}.fom-market>header span{font-size:7px;color:#f1c75b;font-weight:900}.fom-stage{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.04)}.fom-stage:last-child{border-bottom:0}.fom-stage>b{display:block;margin-bottom:5px;font-size:7px;color:#7f8c83}.fom-chips{display:flex;gap:6px;flex-wrap:wrap}.fom-chip{display:grid;gap:2px;min-width:78px;padding:5px 7px;border:1px solid #2d3b31;background:#0c120e}.fom-chip small{font-size:7px;color:#88958c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fom-chip strong{font-size:10px;color:#edf6ef;font-variant-numeric:tabular-nums}.fom-empty{padding:14px;text-align:center;color:#7d8981;font-size:9px}@media(max-width:760px){.fom-grid{grid-template-columns:1fr}.fom-chip{min-width:72px}}`;document.head.appendChild(s)}
function start(){
  injectStyle();
  document.addEventListener('click',e=>{const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  const mo=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){if(n?.nodeType!==1)continue;if(n.matches?.('.match-card[data-match-id][aria-expanded="true"]'))load(n);hydrateExpanded(n)}});mo.observe(document.body,{childList:true,subtree:true});
  hydrateExpanded();
  window.NOMAD343_FULL_ODDS_MAIN={version:VERSION,reload:id=>{cache.delete(String(id));const card=document.querySelector(`.match-card[data-match-id="${CSS.escape(String(id))}"]`);if(card)load(card)}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
