(()=>{
'use strict';
const HISTORY_KEY='nomadEventHistory342';
const SETTINGS_KEY='nomadSettings342';
const DEFAULT_MAX_PRICE_AGE=30;
const runtime=window.NOMAD342_RUNTIME||{};
let running=false;
let timer=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const statusClass=status=>status==='OK'||status==='READY'||status==='VALID'?'oktxt':status==='ERROR'||status==='BLOCKED'?'redtxt':'waittxt';
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};

function settings(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{};}catch{return {};}
}

function historySummary(){
  try{
    const raw=JSON.parse(localStorage.getItem(HISTORY_KEY)||'{}');
    const cutoff=Date.now()-15*60*1000;
    let matches=0,ready=0,maxSnapshots=0;
    for(const rows of Object.values(raw||{})){
      if(!Array.isArray(rows)) continue;
      const valid=rows.filter(s=>finite(s?.minute)!==null&&finite(s?.observedAt)!==null&&Number(s.observedAt)>=cutoff);
      if(!valid.length) continue;
      matches+=1;
      const minutes=new Set(valid.map(s=>Number(s.minute)));
      if(minutes.size>=2) ready+=1;
      maxSnapshots=Math.max(maxSnapshots,minutes.size);
    }
    return {matches,ready,maxSnapshots};
  }catch{return {matches:0,ready:0,maxSnapshots:0};}
}

async function jsonFetch(url){
  const ac=new AbortController();
  const timeout=setTimeout(()=>ac.abort(),Number(runtime.requestTimeoutMs)||9000);
  try{
    const response=await fetch(url,{cache:'no-store',signal:ac.signal,headers:{accept:'application/json'}});
    if(!response.ok) throw new Error(`http_${response.status}`);
    return await response.json();
  }finally{clearTimeout(timeout);}
}

function card(name,status,detail,extra=''){
  return `<article class="health-item"><header><span>${esc(name)}</span><b class="${statusClass(status)}">${esc(status)}</b></header><div class="note">${esc(detail)}</div>${extra?`<div class="reason-line">${extra}</div>`:''}</article>`;
}

function render(items,summary){
  const grid=document.getElementById('healthGrid');
  if(grid) grid.innerHTML=items.join('');
  const current=document.getElementById('healthCurrentState');
  if(current) current.textContent=summary;
}

function m88State(){
  const api=window.NOMADM88;
  if(!api) return {status:'ERROR',detail:'M88 observer module is missing.',extra:'Final judge remains fail-closed.'};
  const raw=api.read();
  if(!raw) return {status:'WAIT',detail:'Observer is ready, but no live M88 observation has been ingested.',extra:'No M88 feeder/transport observation is present in this browser.'};
  const maxAge=finite(settings().maximumPriceAgeSeconds)??DEFAULT_MAX_PRICE_AGE;
  const obs=api.normalizeObservation(raw,maxAge);
  return {
    status:obs.status==='VALID'?'VALID':'WAIT',
    detail:`${obs.home||'—'} vs ${obs.away||'—'} · HOME ${obs.rawHomeLine||'—'} · ${obs.homeOddsDecimal??'—'} decimal`,
    extra:`Observation status ${obs.status}; age ${obs.ageSeconds??'—'}s; transport ${obs.transport||'—'}.`,
  };
}

async function cycle(){
  if(running) return;
  running=true;
  try{
    if(!runtime.engineBase) throw new Error('3.42 engine base not configured');
    const feed=await jsonFetch(`${runtime.engineBase}${runtime.feedPath||'/feed'}`);
    const health=await jsonFetch(`${runtime.engineBase}/health`);
    const source=feed.source||health.source||{};
    const caps=source.capabilities||{};
    const counts=feed.counts||{};
    const history=historySummary();
    const m88=m88State();
    const items=[];

    items.push(card('3.42 Worker / Feed',feed.ok===true&&health.ok===true?'OK':'ERROR',
      `Version ${feed.version||health.version||'—'} · ${Number(counts.live||0)} live · ${Number(counts.stale||0)} stale`,
      `Updated ${feed.updatedAt||health.lastSuccessAt||'—'} · lastError ${feed.lastError||health.lastError||'none'}.`));

    items.push(card('TotalCorner Today Inlet',caps.today?'OK':'ERROR',
      caps.today?'Today page is supplying live match/event rows.':'Today inlet is unavailable.',
      `Mode ${source.detailMode||'—'} · Attack ${caps.attacks?'YES':'NO'} · Dangerous ${caps.dangerous?'YES':'NO'} · Corner ${caps.corner?'YES':'NO'}.`));

    const limitedDetail=!caps.detail||!caps.sot||!caps.off;
    items.push(card('TotalCorner Deep Detail',limitedDetail?'LIMITED':'OK',
      limitedDetail?'Stats/Live detail is not used; no SOT/Shot Off is fabricated.':'Deep detail is available.',
      `Reason ${source.detailUnavailableReason||'none'} · skipped ${Number(counts.detailSkipped||0)} · attempts ${Number(counts.detailAttempts||0)}.`));

    items.push(card('Rolling Event History',history.ready>0?'READY':'WAIT',
      history.ready>0?`${history.ready} match(es) have at least 2 real match-minute snapshots in this browser.`:'Need at least 2 real distinct match-minute snapshots before rolling metrics can pass.',
      `Stored matches ${history.matches} · maximum distinct minutes ${history.maxSnapshots} · TTL 15 minutes.`));

    const c=settings();
    const unavailableEnabled=Boolean(c.sotEvidenceEnabled)||Boolean(c.shotOffEvidenceEnabled);
    const allMode=String(c.evidenceMode||'ANY').toUpperCase()==='ALL';
    items.push(card('Event Evidence Contract',allMode&&unavailableEnabled?'LIMITED':'READY',
      allMode&&unavailableEnabled?'ALL evidence cannot pass while enabled SOT/Shot Off inputs are unavailable.':'Available Today metrics remain fail-closed and settings are not silently weakened.',
      `Evidence mode ${String(c.evidenceMode||'ANY').toUpperCase()} · SOT ${c.sotEvidenceEnabled===false?'OFF':'ON'} · Shot Off ${c.shotOffEvidenceEnabled===false?'OFF':'ON'} · Corner ${c.cornerEvidenceEnabled===false?'OFF':'ON'}.`));

    items.push(card('M88 Price Observer',m88.status,m88.detail,m88.extra));
    items.push(card('HDP Decode / Odds Normalize',window.NOMADM88?'READY':'ERROR',
      window.NOMADM88?'Decoder and odds normalizer module is loaded; invalid/unknown prices fail closed.':'Decoder module is unavailable.',
      'Unsigned non-zero HDP remains UNKNOWN unless side sign is proven.'));

    const finalReady=feed.ok===true&&health.ok===true&&m88.status==='VALID';
    items.push(card('Final Judge',finalReady?'READY':'WAIT',
      finalReady?'Event feed and a valid M88 observation are available to the judge.':'Final signal remains fail-closed until event conditions pass and a valid fresh M88 observation exists.',
      `Feed ${feed.ok===true?'OK':'WAIT'} · M88 ${m88.status}.`));

    render(items,`LIVE · ${Number(counts.live||0)} matches · ${Number(counts.stale||0)} stale · ${new Date().toLocaleTimeString()}`);
    window.__nomad342Health={feed,health,history,m88};
  }catch(error){
    render([card('3.42 Worker / Feed','ERROR','Unable to read the isolated 3.42 TEST engine.',String(error?.message||error))],`ERROR · ${new Date().toLocaleTimeString()}`);
  }finally{running=false;}
}

function start(){
  if(document.body?.dataset?.page!=='health') return;
  cycle();
  timer=setInterval(cycle,10000);
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer);},{once:true});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
