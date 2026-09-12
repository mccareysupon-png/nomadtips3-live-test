(()=>{
'use strict';
const VERSION='343-bet365-board-v4-market-language';
const SIGNAL_ODDS_REVISION='v5-signal-odds-merge';
const API='/api/engine/board';
const SIGNALS_API='/api/engine/signals';
const POLL_MS=30_000;
const QA_AUDIT='SOURCE RAW HOME LINE';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const text=v=>v===null||v===undefined?'':String(v);
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
const STAGE_LABELS={opening:'OPENING',closing:'PRE-MATCH',current:'CURRENT',inplay:'IN-PLAY',in_play:'IN-PLAY'};
let lastSnapshot=null,lastSignals=[],busy=false;
function fixtureKey(f){return String(f?.fixtureId??[f?.home?.name,f?.away?.name,f?.kickoffAt??f?.kickoffUtc].join('|'))}
function classify(f){const s=String(f?.boardState??f?.status??'').toLowerCase();if(s.includes('unknown'))return'unknown';if(['live','in_play','inplay','playing','half'].some(x=>s.includes(x)))return'live';if(['finished','full_time','ft','ended'].some(x=>s.includes(x)))return'finished';return'scheduled'}
function teamName(f,side){return f?.[side]?.name||side.toUpperCase()}
function isBet365(v){return String(v??'').toLowerCase().replace(/[\s_-]/g,'').includes('bet365')}
function oddsRoot(raw){
  if(!raw||typeof raw!=='object')return null;
  if(Array.isArray(raw.bookmakers)){
    const b=raw.bookmakers.find(x=>isBet365(x?.slug)||isBet365(x?.name)||isBet365(x?.bookmaker?.slug)||isBet365(x?.bookmaker?.name));
    return b?.odds??b?.markets??null;
  }
  if(raw.data&&typeof raw.data==='object'){const x=oddsRoot(raw.data);if(x)return x}
  if(raw.bet365&&typeof raw.bet365==='object')return raw.bet365.odds??raw.bet365.markets??raw.bet365;
  if(raw.odds&&typeof raw.odds==='object'&&!('opening' in raw)&&!('closing' in raw)&&!('inplay' in raw))return raw.odds;
  const keys=Object.keys(raw);return keys.some(k=>LABELS[k]||/^(1x2|asian|goal|corner|card|btts)/i.test(k))?raw:null;
}
function price(v){const n=num(v);if(n===null)return text(v)||'—';return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000)}
function signed(v){const n=num(v);if(n===null)return'—';return n>0?`+${price(n)}`:price(n)}
function chip(label,value){return `<span class="b365-chip"><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`}
function isAsian(key){const k=String(key||'').toLowerCase();return k==='asian'||k.includes('asian_handicap')||k==='corner_asian'||k==='card_asian'||k==='cards_asian'}
function isOneXtwo(key){return String(key||'').toLowerCase().startsWith('1x2')}
function stageOrder(value,state){
  if(!value||typeof value!=='object'||Array.isArray(value))return[['current',value]];
  const keys=state==='live'?['inplay','in_play','current','closing','opening']:['closing','current','opening','inplay','in_play'];
  const out=[],seen=new Set();for(const k of keys){if(seen.has(k)||!Object.prototype.hasOwnProperty.call(value,k)||value[k]===null||value[k]===undefined)continue;seen.add(k);out.push([k,value[k]])}return out.length?out:[['current',value]];
}
function primitiveEntries(obj){
  if(obj===null||obj===undefined)return[];
  if(typeof obj!=='object')return[['line',obj]];
  const preferred=['line','home','draw','away','over','under','yes','no'],out=[];
  for(const k of preferred){if(obj[k]!==null&&obj[k]!==undefined&&typeof obj[k]!=='object')out.push([k,obj[k]])}
  for(const [k,v] of Object.entries(obj)){if(preferred.includes(k)||v===null||v===undefined||typeof v==='object')continue;out.push([k,v])}
  return out;
}
function stageBlock(stage,value,key,f){
  const label=STAGE_LABELS[stage]||stage.toUpperCase(),live=stage==='inplay'||stage==='in_play';
  if(value===null||value===undefined)return'';
  if(isOneXtwo(key)&&value&&typeof value==='object'){
    const rows=[];if(value.home!==undefined)rows.push(chip(teamName(f,'home'),price(value.home)));if(value.draw!==undefined)rows.push(chip('DRAW',price(value.draw)));if(value.away!==undefined)rows.push(chip(teamName(f,'away'),price(value.away)));
    if(rows.length)return `<div class="b365-stage${live?' live-stage':''}"><b>${label}</b><div class="b365-chips">${rows.join('')}</div></div>`;
  }
  if(isAsian(key)){
    if(typeof value!=='object')return `<div class="b365-stage${live?' live-stage':''}"><b>${label}</b><div class="b365-chips">${chip('HOME LINE',signed(value))}</div></div>`;
    const line=num(value.line??value.hdp??value.handicap);if(line!==null){const h=num(value.home??value.home_odds??value.homeOdds),a=num(value.away??value.away_odds??value.awayOdds);const rows=[chip(teamName(f,'home'),`${signed(line)}${h===null?'':` @ ${price(h)}`}`),chip(teamName(f,'away'),`${signed(-line)}${a===null?'':` @ ${price(a)}`}`)];return `<div class="b365-stage${live?' live-stage':''}"><b>${label}</b><div class="b365-chips">${rows.join('')}</div></div>`}
  }
  if(typeof value!=='object')return `<div class="b365-stage${live?' live-stage':''}"><b>${label}</b><div class="b365-chips">${chip('LINE',price(value))}</div></div>`;
  const entries=primitiveEntries(value);if(!entries.length)return'';
  const rows=entries.map(([k,v])=>{const name=k==='home'?teamName(f,'home'):k==='away'?teamName(f,'away'):k==='draw'?'DRAW':k.toUpperCase();return chip(name,price(v))}).join('');
  return `<div class="b365-stage${live?' live-stage':''}"><b>${label}</b><div class="b365-chips">${rows}</div></div>`;
}
function rank(key){const k=String(key||'').toLowerCase(),half=/(half|1st)/.test(k)?1:0;let family=9;if(/^1x2/.test(k))family=0;else if(k==='asian'||/^asian_handicap/.test(k)||/^asian_/.test(k))family=1;else if(/^goal_line/.test(k)||/^goalline/.test(k))family=2;else if(/^corner/.test(k))family=3;else if(/^card/.test(k)||/^cards/.test(k))family=4;else if(/^btts/.test(k))family=5;return family*10+half}
function marketBlock(key,value,f,state){const title=LABELS[key]||key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());const stages=stageOrder(value,state).map(([s,v])=>stageBlock(s,v,key,f)).filter(Boolean).join('');if(!stages)return'';return `<section class="b365-market"><header><b>${esc(title)}</b><span>BET365</span></header>${stages}</section>`}
function selectionText(s,f){const sel=String(s?.selection||'').toUpperCase();if(sel==='HOME')return teamName(f,'home');if(sel==='AWAY')return teamName(f,'away');if(sel==='DRAW')return'DRAW';return sel||'PICK'}
function signalLineText(s){const line=num(s?.line);if(line===null)return'';const market=String(s?.market??s?.providerMarket??'').toLowerCase();const asian=market.includes('ah')||market.includes('asian')||market.includes('handicap');return asian?signed(line):price(line)}
function signalEntries(rows,f){
  if(!rows.length)return'';
  return `<section class="b365-signal-odds"><div class="b365-signal-head"><b>SIGNAL ODDS</b><span>ENGINE VERIFIED</span></div><div class="b365-signal-list">${rows.map(s=>{
    const market=s?.marketLabel??s?.market??s?.providerMarket??'SIGNAL',pick=selectionText(s,f),line=signalLineText(s),odds=price(s?.odds),book=s?.bookmaker||'Bet365';
    return `<div class="b365-signal-row"><span class="b365-signal-market">${esc(market)}</span><strong>${esc(`${pick}${line?` ${line}`:''}`)}</strong><span class="b365-signal-price">@ ${esc(odds)}</span><small>${esc(book)}</small></div>`;
  }).join('')}</div></section>`;
}
function oddsPanel(f,snapshot,signalRows=[]){
  const root=oddsRoot(f?.providerOdds??f?.odds),state=classify(f),title=state==='live'?'BET365 · LIVE MARKETS':state==='scheduled'?'BET365 · PRE-MATCH MARKETS':'BET365 · MARKET SNAPSHOT';
  const age=Math.max(0,Math.round(Number(snapshot?.hubAgeMs||0)/1000)),sub=`${teamName(f,'home')} vs ${teamName(f,'away')} · bulk feed${Number.isFinite(age)?` · ${age}s`:''}`,signalHtml=signalEntries(signalRows,f);
  if(!root||typeof root!=='object')return `<section class="b365-board"><div class="b365-head"><div><b>${title}</b><small>${esc(sub)}</small></div><span class="b365-count muted">ODDS —</span></div>${signalHtml}<div class="b365-empty">Bulk odds unavailable for this fixture</div></section>`;
  const markets=Object.entries(root).filter(([k,v])=>!['fixture_id','bookmaker','slug','name','updated_at','recorded_at'].includes(k)&&v!==undefined&&v!==null).sort((a,b)=>rank(a[0])-rank(b[0])||a[0].localeCompare(b[0]));
  const body=markets.map(([k,v])=>marketBlock(k,v,f,state)).filter(Boolean).join('');
  if(!body)return `<section class="b365-board"><div class="b365-head"><div><b>${title}</b><small>${esc(sub)}</small></div><span class="b365-count muted">ODDS —</span></div>${signalHtml}<div class="b365-empty">Bulk odds unavailable for this fixture</div></section>`;
  return `<section class="b365-board"><div class="b365-head"><div><b>${title}</b><small>${esc(sub)}</small></div><span class="b365-count">${markets.length} MARKETS</span></div>${signalHtml}<div class="b365-grid">${body}</div></section>`;
}
function signalsForFixture(signals,id){return (Array.isArray(signals)?signals:[]).filter(s=>String(s?.fixtureId??'')===String(id??''))}
function placeAddon(details,wrap){
  const flow=details.querySelector('.nomad-event-flow-card');
  if(flow){flow.insertAdjacentElement('afterend',wrap);return}
  const stats=details.querySelector('.evidence-card');
  if(stats){stats.insertAdjacentElement('afterend',wrap);return}
  details.append(wrap);
}
function decorate(snapshot,signals=lastSignals){
  const fixtures=Array.isArray(snapshot?.fixtures)?snapshot.fixtures:[],map=new Map(fixtures.map(f=>[fixtureKey(f),f]));
  document.querySelectorAll('.match-card[data-match-id]').forEach(card=>{
    const id=String(card.dataset.matchId||''),f=map.get(id);if(!f)return;
    const details=card.querySelector('.event-details');if(!details)return;
    details.querySelectorAll('[data-b365-addon]').forEach(el=>el.remove());
    const wrap=document.createElement('div');wrap.dataset.b365Addon='1';wrap.className='b365-addon';wrap.innerHTML=oddsPanel(f,snapshot,signalsForFixture(signals,id));placeAddon(details,wrap);
  });
}
function injectStyle(){if(document.getElementById('nomad343-bet365-board'))return;const s=document.createElement('style');s.id='nomad343-bet365-board';s.textContent=`.b365-addon{display:grid;gap:8px;margin:8px 0 9px}.b365-board{background:#0e1511;border:1px solid #2b3a30}.b365-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border-bottom:1px solid #28362c}.b365-head>div{display:grid;gap:2px;min-width:0}.b365-head b{font-size:11px;letter-spacing:.05em;color:#eef7f0}.b365-head small{font-size:8px;color:#7f8d83;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.b365-count{font-size:8px;font-weight:900;color:#f1c75b;border:1px solid #5b4e29;padding:3px 6px;background:#1c190f;white-space:nowrap}.b365-count.muted{color:#7c8980;border-color:#344039;background:#111713}.b365-signal-odds{margin:8px;border:1px solid #315e40;background:#101b14}.b365-signal-head{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #294b35}.b365-signal-head b{font-size:9px;color:#8de1ab}.b365-signal-head span{font-size:7px;font-weight:900;color:#f1c75b}.b365-signal-list{display:grid}.b365-signal-row{display:grid;grid-template-columns:minmax(90px,1fr) minmax(90px,1.4fr) auto auto;gap:8px;align-items:center;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.04)}.b365-signal-row:last-child{border-bottom:0}.b365-signal-market{font-size:8px;color:#95a198;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.b365-signal-row strong{font-size:10px;color:#eef7f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.b365-signal-price{font-size:11px;font-weight:900;color:#8de1ab;font-variant-numeric:tabular-nums;white-space:nowrap}.b365-signal-row small{font-size:7px;color:#d6b95f;white-space:nowrap}.b365-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:8px}.b365-market{min-width:0;background:#0a0f0c;border:1px solid #243128}.b365-market>header{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 8px;border-bottom:1px solid #202b24}.b365-market>header b{font-size:9px;color:#dce8df}.b365-market>header span{font-size:7px;font-weight:900;color:#e5b94d}.b365-stage{display:grid;grid-template-columns:62px minmax(0,1fr);gap:7px;align-items:start;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.035)}.b365-stage:last-child{border-bottom:0}.b365-stage>b{font-size:7px;color:#728077;padding-top:5px}.b365-stage.live-stage{background:#101c14}.b365-stage.live-stage>b{color:#70d698}.b365-chips{display:flex;flex-wrap:wrap;gap:5px}.b365-chip{display:inline-grid;grid-template-columns:auto auto;gap:5px;align-items:center;background:#141d17;border:1px solid #2b3930;padding:4px 6px;min-width:60px}.b365-chip small{font-size:7px;color:#89968d}.b365-chip strong{font-size:10px;color:#f0f6f1;font-variant-numeric:tabular-nums}.b365-stage.live-stage .b365-chip{border-color:#356445;background:#132117}.b365-stage.live-stage .b365-chip strong{color:#8de1ab}.b365-empty{padding:14px 10px;text-align:center;color:#6f7c74;font-size:9px}@media(max-width:760px){.b365-grid{grid-template-columns:1fr}.b365-stage{grid-template-columns:54px minmax(0,1fr)}.b365-head{align-items:flex-start}.b365-head small{white-space:normal}.b365-signal-row{grid-template-columns:minmax(70px,1fr) minmax(80px,1.2fr) auto}.b365-signal-row small{display:none}}`;document.head.appendChild(s)}
async function load(){
  if(busy)return;busy=true;
  try{
    const stamp=Date.now(),[r,sr]=await Promise.all([fetch(`${API}?bet365=${stamp}`,{cache:'no-store'}),fetch(`${SIGNALS_API}?bet365=${stamp}`,{cache:'no-store'}).catch(()=>null)]);
    if(!r.ok)throw new Error(`HTTP_${r.status}`);
    const j=await r.json();if(j?.ok!==true)throw new Error('DATA_NOT_READY');
    let signals=[];
    if(sr?.ok){const sj=await sr.json().catch(()=>null);if(sj?.ok===true&&Array.isArray(sj.signals))signals=sj.signals}
    lastSnapshot=j;lastSignals=signals;decorate(j,signals);
  }catch(e){console.warn('[NOMAD343 BET365]',e)}finally{busy=false}
}
const mo=new MutationObserver(records=>{if(!lastSnapshot)return;const changed=records.some(r=>[...r.addedNodes].some(n=>n?.nodeType===1&&(n.matches?.('.match-card[data-match-id]')||n.querySelector?.('.match-card[data-match-id]'))));if(changed)setTimeout(()=>decorate(lastSnapshot,lastSignals),0)});
function start(){injectStyle();mo.observe(document.body,{childList:true,subtree:true});load();setInterval(load,POLL_MS);window.NOMAD343_BET365={version:VERSION,reload:load}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
