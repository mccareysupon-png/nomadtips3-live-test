(()=>{
'use strict';
const runtime=window.NOMAD342_MARKET_RUNTIME||{};
const preset=window.NOMAD342_K_LIVE_PRESET||{};
const kMarket=preset.market||{};
const list=()=>document.getElementById('matchList');
let timer=null,running=false,lastPayload=null,lastError=null;

function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function norm(v=''){return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim()}
function compact(v=''){return norm(v).replace(/\s/g,'')}
function teamScore(a,b){const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;if(compact(x)===compact(y))return .99;if(x.length>=5&&y.length>=5&&(x.includes(y)||y.includes(x)))return .9;const aa=new Set(x.split(' ').filter(Boolean)),bb=new Set(y.split(' ').filter(Boolean));let hit=0;for(const t of aa)if(bb.has(t))hit++;const union=aa.size+bb.size-hit;return union?hit/union:0}
function fmtOdds(v){const n=finite(v);return n===null?'—':n.toFixed(2)}
function fmtLine(v){const n=finite(v);if(n===null)return '—';return `${n>0?'+':''}${Number.isInteger(n)?n.toFixed(1):n.toFixed(2)}`}
function observedAt(m){const rows=Array.isArray(m?.bookmakers)?m.bookmakers:[];const values=rows.map(b=>Number(b?.observedAt)).filter(Number.isFinite);const direct=Number(m?.observedAt);if(Number.isFinite(direct))values.push(direct);return values.length?Math.max(...values):null}
function ageText(ms){if(!Number.isFinite(ms)||ms<0)return '—';if(ms<1000)return '<1s';if(ms<60000)return `${Math.floor(ms/1000)}s`;return `${Math.floor(ms/60000)}m`}

function mapMarket(eventMatch,marketMatches){
  const candidates=[];
  for(const market of marketMatches||[]){
    const h=teamScore(eventMatch?.home,market?.home),a=teamScore(eventMatch?.away,market?.away);
    if(h<.62||a<.62)continue;
    let score=(h+a)/2;
    const em=finite(eventMatch?.minute),mm=finite(market?.minute);
    if(em!==null&&mm!==null&&Math.abs(em-mm)<=8)score+=.03;
    if(Array.isArray(eventMatch?.score)&&Array.isArray(market?.score)&&Number(eventMatch.score[0])===Number(market.score[0])&&Number(eventMatch.score[1])===Number(market.score[1]))score+=.04;
    candidates.push({market,score});
  }
  candidates.sort((x,y)=>y.score-x.score);
  const best=candidates[0],second=candidates[1];
  if(!best||best.score<.72)return null;
  if(second&&best.score-second.score<.05)return null;
  return best.market;
}

function historyStore(){try{return JSON.parse(localStorage.getItem(runtime.historyKey)||'{}')||{}}catch{return {}}}
function historyKey(m){return `${norm(m?.home)}__${norm(m?.away)}`}
function snapshot(m){return {at:Number(m?.observedAt)||Date.now(),oneXtwo:m?.main?.oneXtwo||null,totals:m?.main?.totals||null}}
function remember(payload){
  if(!runtime.historyKey)return;
  const store=historyStore(),cutoff=Date.now()-2*60*60*1000,max=Math.max(4,Number(runtime.historyMaxRows)||24);
  for(const m of payload?.matches||[]){
    const key=historyKey(m),row=snapshot(m),rows=Array.isArray(store[key])?store[key].filter(x=>Number(x?.at)>=cutoff):[];
    if(!rows.some(x=>Number(x.at)===Number(row.at)))rows.push(row);
    store[key]=rows.sort((a,b)=>a.at-b.at).slice(-max);
  }
  try{localStorage.setItem(runtime.historyKey,JSON.stringify(store))}catch{}
}
function previousSnapshot(m){const rows=historyStore()[historyKey(m)]||[];if(rows.length<2)return null;return rows[rows.length-2]||null}
function movement(current,previous){const a=finite(current),b=finite(previous);if(a===null||b===null)return {arrow:'',label:''};const d=a-b;if(Math.abs(d)<.005)return {arrow:'→',label:'steady'};return d<0?{arrow:'↓',label:`${b.toFixed(2)} → ${a.toFixed(2)}`}:{arrow:'↑',label:`${b.toFixed(2)} → ${a.toFixed(2)}`}}
function moveHtml(label,current,previous){const m=movement(current,previous);return !m.arrow?'':`<span class="market-move"><b>${esc(label)}</b> ${esc(m.label||fmtOdds(current))} <i class="${m.arrow==='↓'?'down':m.arrow==='↑'?'up':'flat'}">${m.arrow}</i></span>`}

function marketHtml(m){
  const main=m?.main||{},prev=previousSnapshot(m),age=Date.now()-(observedAt(m)||Date.now()),books=Array.isArray(m?.bookmakers)?m.bookmakers:[];
  const one=main.oneXtwo,tot=main.totals,provider=String(lastPayload?.provider||'Nowgoal');
  const oneMove=moveHtml('HOME 1X2',one?.home,prev?.oneXtwo?.home);
  const ouMove=moveHtml('OVER',tot?.overOdds,prev?.totals?.line===tot?.line?prev?.totals?.overOdds:null);
  return `<section class="nomad-market-card market-reference-only" data-market-match="${esc(m.matchKey||historyKey(m))}" data-market-source="${esc(provider)}">
    <div class="market-head"><div><span>PRICE REFERENCE</span><small>SOURCE · ${esc(provider)} · 1X2 + OVER/UNDER</small></div><div class="market-health"><strong>${books.length}</strong><span>BOOKS</span><small>${esc(ageText(age))} old</small></div></div>
    <div class="market-grid">
      <article class="market-tile market-1x2"><div class="market-title"><span>1X2</span><b>MATCH RESULT</b></div>${one?`<div class="market-triple"><div><small>1</small><strong>${esc(fmtOdds(one.home))}</strong></div><div><small>X</small><strong>${esc(fmtOdds(one.draw))}</strong></div><div><small>2</small><strong>${esc(fmtOdds(one.away))}</strong></div></div>${oneMove}`:'<div class="market-empty">NO FRESH 1X2</div>'}</article>
      <article class="market-tile market-ou"><div class="market-title"><span>O/U</span><b>TOTAL ${esc(fmtLine(tot?.line))}</b></div>${tot?`<div class="market-pair"><div><small>OVER</small><strong>${esc(fmtLine(tot.line))}</strong><b>@ ${esc(fmtOdds(tot.overOdds))}</b></div><div><small>UNDER</small><strong>${esc(fmtLine(tot.line))}</strong><b>@ ${esc(fmtOdds(tot.underOdds))}</b></div></div>${ouMove}`:'<div class="market-empty">NO FRESH TOTAL</div>'}</article>
    </div>
    <div class="market-bookmakers"><span>BOOKMAKER REFERENCE</span>${books.slice(0,12).map(b=>`<b>${esc(b.name)}</b>`).join('')}${books.length>12?`<i>+${books.length-12}</i>`:''}</div>
  </section>`;
}

function removeMarket(card){card?.querySelectorAll('.nomad-market-card,.market-mini-badge').forEach(n=>n.remove())}
function hydrateCard(card,r,marketMatches){
  if(!card||!r)return;
  removeMarket(card);
  const market=mapMarket(r.m,marketMatches);
  if(!market)return;
  const at=observedAt(market),maxAge=Math.min(Number(runtime.maxDisplayAgeMs)||30000,Number(kMarket.maxAgeMs)||30000);
  if(!Number.isFinite(at)||Date.now()-at>maxAge)return;
  const details=card.querySelector('.event-details');
  if(!details)return;
  const wrap=document.createElement('div');wrap.innerHTML=marketHtml(market);const node=wrap.firstElementChild;if(!node)return;
  details.insertBefore(node,details.firstChild);
  const provider=String(lastPayload?.provider||'Nowgoal').toUpperCase();
  const badge=document.createElement('span');badge.className='market-mini-badge';badge.textContent=`${provider} · ${market.refereesOnline||market.bookmakers?.length||0} BOOKS`;
  const topline=card.querySelector('.card-topline');if(topline)topline.appendChild(badge);
}
function hydrateAll(){
  const results=window.__nomad342EventResults;if(!Array.isArray(results)||!lastPayload?.matches)return;
  const byId=new Map(results.map(r=>[String(r?.m?.id),r]));
  document.querySelectorAll('.event-compact').forEach(card=>hydrateCard(card,byId.get(String(card.dataset.matchId)),lastPayload.matches));
}
function clearAll(){document.querySelectorAll('.event-compact').forEach(removeMarket)}

async function fetchMarkets(){
  if(!runtime.base||String(runtime.mode).toUpperCase()==='OFF')return null;
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.timeoutMs)||6500);
  try{
    const response=await fetch(`${runtime.base}${runtime.path||'/markets'}`,{cache:'no-store',signal:ac.signal});
    if(!response.ok)throw new Error(`market_http_${response.status}`);
    const data=await response.json();
    if(String(data?.version)!=='market-v1'||!Array.isArray(data?.matches)||data?.ok===false)throw new Error(data?.error||'invalid_market_contract');
    return data;
  }finally{clearTimeout(timeout)}
}
async function cycle(){
  if(running)return;running=true;
  try{
    const data=await fetchMarkets();
    if(!data){lastPayload=null;lastError=runtime.base?'market_off':'market_unconfigured';clearAll();return}
    lastPayload=data;lastError=null;remember(data);hydrateAll();
  }catch(error){lastError=String(error?.message||error);lastPayload=null;clearAll()}finally{
    window.__nomad342MarketState={ok:Boolean(lastPayload),error:lastError,mode:runtime.mode,provider:lastPayload?.provider||null,updatedAt:Date.now(),preset:preset.version||null};
    running=false;
  }
}
function start(){
  if(document.body?.dataset?.page!=='live')return;
  const target=list();if(!target)return;
  let queued=false;const queue=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(lastPayload)hydrateAll()})};
  new MutationObserver(queue).observe(target,{childList:true});
  cycle();timer=setInterval(cycle,Math.max(10000,Number(runtime.pollMs)||15000));
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
