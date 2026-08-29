(()=>{
'use strict';
const SETTINGS_KEY='nomadSettings342';
const LEDGER_KEY='nomadLedger342';
const DEFAULT_PRICE_BASE='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
const MAX_PRICE_BATCH=7;
const DEFAULTS={minuteFrom:55,minuteTo:88,rollingWindowMinutes:5,scoreDifferenceFilterEnabled:true,maxScoreDifference:1,attackWeight:1,dangerousAttackWeight:2,homePressureShareMinimum:55,trendConditionsRequired:2,homeEventRequired:true,sotEvidenceEnabled:true,sotDeltaMinimum:1,shotOffEvidenceEnabled:true,shotOffDeltaMinimum:1,cornerEvidenceEnabled:true,cornerDeltaMinimum:1,evidenceMode:'ANY',allowedLinesMode:'ANY',allowedSelectionLines:[],oddsMinimum:1.80,oddsMaximumEnabled:false,oddsMaximum:2.40,maximumPriceAgeSeconds:30,oneSignalPerMatch:true};
const runtime=window.NOMAD342_RUNTIME||{};
const browserHistory=new Map();
let timer=null;
let running=false;

function settings(){
  try{
    const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
    return {...DEFAULTS,...saved,allowedSelectionLines:Array.isArray(saved.allowedSelectionLines)?saved.allowedSelectionLines:[]};
  }catch{return {...DEFAULTS,allowedSelectionLines:[]};}
}
function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function fmtLine(n){const x=finite(n);if(x===null)return '—';const v=Number(x.toFixed(2));return `${v>0?'+':''}${v}`;}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function at(pair,index){return Array.isArray(pair)?finite(pair[index]):null;}
function delta(first,last,key,index){const a=at(first?.[key],index),b=at(last?.[key],index);return a===null||b===null?null:b-a;}
function addKnown(...values){return values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;}
function quarterGoal(v){const n=finite(v);return n!==null&&Math.abs(n*4-Math.round(n*4))<1e-9;}

function mergeFeedHistory(match){
  const id=String(match.id),incoming=Array.isArray(match.event?.snapshots)?match.event.snapshots:[],previous=browserHistory.get(id)||[],byMinute=new Map();
  for(const snapshot of [...previous,...incoming]){
    const minute=finite(snapshot?.minute);if(minute===null)continue;
    const next={...snapshot,minute,observedAt:finite(snapshot?.observedAt)||Date.now()},current=byMinute.get(minute);
    if(!current||next.observedAt>=current.observedAt)byMinute.set(minute,next);
  }
  const cutoff=Date.now()-15*60*1000;
  const rows=[...byMinute.values()].filter(s=>s.observedAt>=cutoff).sort((a,b)=>a.minute-b.minute||a.observedAt-b.observedAt).slice(-40);
  browserHistory.set(id,rows);
  return {...match,event:{...match.event,snapshots:rows}};
}
function eventMetrics(m,c){
  const snaps=[...(m.event?.snapshots||[])].filter(s=>Number.isFinite(Number(s.minute))).sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
  const eligible=snaps.filter(s=>s.minute>=m.minute-c.rollingWindowMinutes&&s.minute<=m.minute),first=eligible[0],last=eligible[eligible.length-1];
  if(!first||!last||first===last||Number(first.minute)>=Number(last.minute))return null;
  const hA=delta(first,last,'attacks',0),aA=delta(first,last,'attacks',1),hD=delta(first,last,'dangerous',0),aD=delta(first,last,'dangerous',1);
  if([hA,aA,hD,aD].some(v=>v===null))return null;
  const hWeighted=hA*c.attackWeight+hD*c.dangerousAttackWeight,aWeighted=aA*c.attackWeight+aD*c.dangerousAttackWeight,total=Math.max(0,hWeighted)+Math.max(0,aWeighted),pressureShare=total>0?(Math.max(0,hWeighted)/total)*100:0;
  const sotDelta=delta(first,last,'sot',0),awaySotDelta=delta(first,last,'sot',1),offDelta=delta(first,last,'off',0),awayOffDelta=delta(first,last,'off',1),cornerDelta=delta(first,last,'corner',0),awayCornerDelta=delta(first,last,'corner',1),homeShots=addKnown(sotDelta,offDelta),awayShots=addKnown(awaySotDelta,awayOffDelta),trend=[hWeighted>aWeighted,hD>aD,homeShots!==null&&awayShots!==null&&homeShots>awayShots];
  return {from:first.minute,to:last.minute,pressureShare:Number(pressureShare.toFixed(1)),trendPass:trend.filter(Boolean).length,sotDelta,offDelta,cornerDelta,attacks:`+${hA} / +${aA}`,dangerous:`+${hD} / +${aD}`};
}
function eventCheck(m,c){
  const reasons=[];let pass=true;const metrics=eventMetrics(m,c);
  if(m.freshness?.stale){pass=false;reasons.push('TotalCorner source stale');}
  if(m.minute<c.minuteFrom||m.minute>c.minuteTo){pass=false;reasons.push(`minute ${m.minute} outside ${c.minuteFrom}–${c.minuteTo}`);}else reasons.push(`minute ${m.minute} in window`);
  if(c.scoreDifferenceFilterEnabled&&Math.abs(Number(m.score?.[0])-Number(m.score?.[1]))>c.maxScoreDifference){pass=false;reasons.push('score gap rejected');}else reasons.push('score gate pass');
  if(!metrics){pass=false;reasons.push('rolling event window not ready');return {pass,reasons,metrics:null};}
  if(metrics.pressureShare<c.homePressureShareMinimum){pass=false;reasons.push(`HOME pressure ${metrics.pressureShare}% < ${c.homePressureShareMinimum}%`);}else reasons.push(`HOME pressure ${metrics.pressureShare}% pass`);
  if(metrics.trendPass<c.trendConditionsRequired){pass=false;reasons.push(`trend ${metrics.trendPass}/3 < ${c.trendConditionsRequired}/3`);}else reasons.push(`trend ${metrics.trendPass}/3 pass`);
  const evidence=[];
  if(c.sotEvidenceEnabled)evidence.push(metrics.sotDelta!==null&&metrics.sotDelta>=c.sotDeltaMinimum);
  if(c.shotOffEvidenceEnabled)evidence.push(metrics.offDelta!==null&&metrics.offDelta>=c.shotOffDeltaMinimum);
  if(c.cornerEvidenceEnabled)evidence.push(metrics.cornerDelta!==null&&metrics.cornerDelta>=c.cornerDeltaMinimum);
  if(c.homeEventRequired){const ep=c.evidenceMode==='ALL'?evidence.length>0&&evidence.every(Boolean):evidence.some(Boolean);if(!ep){pass=false;reasons.push(`new HOME event ${c.evidenceMode} rejected`);}else reasons.push(`new HOME event ${c.evidenceMode} pass`);}
  return {pass,reasons,metrics};
}
function lineAllowed(line,c){if(c.allowedLinesMode!=='SELECTED')return true;const selected=(c.allowedSelectionLines||[]).map(Number).filter(Number.isFinite);return selected.some(v=>Math.abs(v-line)<0.001);}

function unavailableObservation(m,reason,extra={}){
  return {status:'UNAVAILABLE',reason,matchId:String(m.id),home:m.home,away:m.away,decodedHomeLine:null,rawHomeLine:null,homeOddsDecimal:null,awayOddsDecimal:null,homeOddsRaw:null,awayOddsRaw:null,oddsFormat:'DECIMAL',source:'5DollarFootballAPI',bookmaker:'Bet365',ageSeconds:null,...extra};
}
function marketObservation(m,item){
  const market=item?.market||null;
  const line=finite(market?.line),homeOdds=finite(market?.homeOdds),awayOdds=finite(market?.awayOdds);
  if(market?.status!=='AH READY'||!quarterGoal(line)||homeOdds===null||awayOdds===null||homeOdds<=1||awayOdds<=1){
    return unavailableObservation(m,market?.reason||item?.mapping?.reason||'NO LIVE BET365 AH',{fixtureId:item?.fixtureId??market?.fixtureId??null,mapping:item?.mapping??null});
  }
  const sourceUpdatedAt=finite(market?.sourceUpdatedAt)||finite(market?.observedAt)||Date.now();
  return {
    status:'VALID',reason:null,matchId:String(m.id),home:m.home,away:m.away,
    decodedHomeLine:line,rawHomeLine:String(line),homeOddsDecimal:homeOdds,awayOddsDecimal:awayOdds,
    homeOddsRaw:homeOdds,awayOddsRaw:awayOdds,oddsFormat:'DECIMAL',source:'5DollarFootballAPI',bookmaker:'Bet365',
    observedAt:sourceUpdatedAt,ageSeconds:Math.max(0,(Date.now()-sourceUpdatedAt)/1000),fixtureId:item?.fixtureId??market?.fixtureId??null,mapping:item?.mapping??null,
    sourceTimestampSemantics:market?.sourceTimestampSemantics||'adapter_observed_at'
  };
}
async function fetchFiveDollarPrices(matches){
  const batch=matches.slice(0,MAX_PRICE_BATCH);
  const out=new Map();
  if(!batch.length)return {byId:out,status:'NOT_NEEDED',checked:0,ready:0,error:null,upstream:null};
  const priceBase=String(runtime.priceBase||DEFAULT_PRICE_BASE).replace(/\/$/,'');
  const path=runtime.pricePath||'/quotes';
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Math.max(2000,Number(runtime.priceTimeoutMs)||8000));
  try{
    const response=await fetch(`${priceBase}${path}`,{method:'POST',cache:'no-store',signal:ac.signal,headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({matches:batch.map(m=>({clientId:String(m.id),home:m.home,away:m.away,league:m.league,score:{home:Number(m.score?.[0]),away:Number(m.score?.[1])}}))})});
    if(!response.ok)throw new Error(`5dollar_http_${response.status}`);
    const payload=await response.json();
    const rows=Array.isArray(payload?.results)?payload.results:[];
    const byClient=new Map(rows.map(row=>[String(row?.clientId??''),row]));
    for(const m of batch){const item=byClient.get(String(m.id));out.set(String(m.id),item?marketObservation(m,item):unavailableObservation(m,'ADAPTER RESULT MISSING'));}
    for(const m of matches.slice(MAX_PRICE_BATCH))out.set(String(m.id),unavailableObservation(m,'ADAPTER BATCH BUDGET'));
    return {byId:out,status:payload?.ok===false?'DEGRADED':'READY',checked:batch.length,ready:[...out.values()].filter(o=>o.status==='VALID').length,error:payload?.error??null,upstream:payload?.upstream??null};
  }catch(error){
    const reason=error?.name==='AbortError'?'5DOLLAR TIMEOUT':String(error?.message||error);
    for(const m of matches)out.set(String(m.id),unavailableObservation(m,reason));
    return {byId:out,status:'ERROR',checked:batch.length,ready:0,error:reason,upstream:null};
  }finally{clearTimeout(timeout);}
}
function priceCheck(m,c,obs){
  if(!obs)return {pass:false,obs:null,reason:'5DOLLAR BET365 WAIT'};
  if(obs.status!=='VALID')return {pass:false,obs,reason:`5DOLLAR BET365 ${obs.reason||obs.status} — WAIT`};
  if(!lineAllowed(obs.decodedHomeLine,c))return {pass:false,obs,reason:`HOME AH ${fmtLine(obs.decodedHomeLine)} NOT SELECTED`};
  if(obs.homeOddsDecimal<c.oddsMinimum)return {pass:false,obs,reason:`BET365 PRICE ${obs.homeOddsDecimal.toFixed(2)} BELOW ${Number(c.oddsMinimum).toFixed(2)}`};
  if(c.oddsMaximumEnabled&&obs.homeOddsDecimal>c.oddsMaximum)return {pass:false,obs,reason:`BET365 PRICE ${obs.homeOddsDecimal.toFixed(2)} ABOVE ${Number(c.oddsMaximum).toFixed(2)}`};
  if(Number.isFinite(obs.ageSeconds)&&obs.ageSeconds>c.maximumPriceAgeSeconds)return {pass:false,obs:{...obs,status:'STALE'},reason:`5DOLLAR BET365 STALE ${obs.ageSeconds.toFixed(1)}s — WAIT`};
  return {pass:true,obs,reason:'5DOLLAR / BET365 PRICE CONFIRMED'};
}
function saveLedger(r,c){
  if(!r.signal)return;let rows=[];try{rows=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]');}catch{}
  if(c.oneSignalPerMatch&&rows.some(x=>String(x.id)===String(r.m.id)))return;
  const o=r.price.obs;
  rows.unshift({id:String(r.m.id),ts:new Date().toISOString(),match:`${r.m.home} — ${r.m.away}`,pick:r.m.home,minute:r.m.minute,score:r.m.score.join('–'),line:fmtLine(o.decodedHomeLine),rawLine:o.rawHomeLine,odds:o.homeOddsDecimal,rawOdds:o.homeOddsRaw,oddsFormat:'DECIMAL',source:'Bet365',priceProvider:'5DollarFootballAPI',result:'PENDING',eventSource:'TotalCorner',reason:'TOTALCORNER EVENT PASS + 5DOLLAR BET365 PRICE CONFIRMED'});
  localStorage.setItem(LEDGER_KEY,JSON.stringify(rows.slice(0,100)));
}
function detailValue(v){return v===null||v===undefined?'—':v;}
function priceDetail(r){const o=r.price.obs;if(!o)return '<div class="kv"><span>Status</span><b>WAIT</b></div>';return `<div class="kv"><span>Status</span><b>${esc(o.status)}</b></div><div class="kv"><span>Provider</span><b>5DollarFootballAPI</b></div><div class="kv"><span>Bookmaker</span><b>Bet365</b></div><div class="kv"><span>HOME AH</span><b>${esc(fmtLine(o.decodedHomeLine))}</b></div><div class="kv"><span>Decimal odds</span><b>${esc(detailValue(o.homeOddsDecimal))} / ${esc(detailValue(o.awayOddsDecimal))}</b></div><div class="kv"><span>Adapter age</span><b>${o.ageSeconds===null?'—':esc(Number(o.ageSeconds).toFixed(1))+'s'}</b></div>`;}
function matchCard(r){
  const m=r.m,em=r.event.metrics,o=r.price.obs,line=o?.decodedHomeLine,odds=o?.homeOddsDecimal,pick=r.signal?m.home:r.candidate?'WAIT':'WATCH',summary=r.signal?`${esc(m.home)} · HOME AH ${fmtLine(line)} @ ${Number(odds).toFixed(2)} · Bet365 via 5Dollar`:r.candidate?esc(r.price.reason):'Waiting for NOMAD event conditions',badge=r.signal?'signal':'wait';
  return `<article class="signal-card ${r.signal?'signal-card-pass':r.candidate?'signal-card-wait':'signal-card-watch'}"><div class="card-topline"><span>${esc(m.league||'—')}</span><span class="live-minute">${esc(m.minute)}'</span><span class="live-score">${esc(m.score.join('–'))}</span><span class="badge ${badge}">${esc(r.decision)}</span></div><div class="teams-line"><strong>${esc(m.home)}</strong><span>vs</span><strong>${esc(m.away)}</strong></div><div class="pick-strip"><div><span>PICK</span><strong>${esc(pick)}</strong></div><div><span>AH</span><strong>${esc(fmtLine(line))}</strong></div><div><span>ODDS</span><strong>${odds?Number(odds).toFixed(2):'—'}</strong></div><div><span>ENTRY</span><strong>${esc(m.minute)}' · ${esc(m.score.join('–'))}</strong></div></div><div class="signal-summary">${summary}</div><div class="details"><div class="box"><h3>TOTALCORNER EVENT</h3><div class="kv"><span>Window</span><b>${em?`${esc(em.from)}'–${esc(em.to)}'`:'—'}</b></div><div class="kv"><span>Pressure</span><b>${em?esc(em.pressureShare)+'%':'—'}</b></div><div class="kv"><span>Attack Δ H/A</span><b>${esc(em?.attacks||'—')}</b></div><div class="kv"><span>Dangerous Δ H/A</span><b>${esc(em?.dangerous||'—')}</b></div><div class="kv"><span>SOT / OFF / COR</span><b>${em?`${esc(detailValue(em.sotDelta))} / ${esc(detailValue(em.offDelta))} / ${esc(detailValue(em.cornerDelta))}`:'—'}</b></div><div class="kv"><span>Gate</span><b class="${r.event.pass?'oktxt':'redtxt'}">${r.event.pass?'PASS':'WAIT'}</b></div></div><div class="box"><h3>5DOLLAR · BET365 PRICE</h3>${priceDetail(r)}</div><div class="box"><h3>DECISION</h3><div class="kv"><span>Candidate</span><b>${r.candidate?'YES':'NO'}</b></div><div class="kv"><span>Verdict</span><b>${esc(r.price.reason)}</b></div><div class="kv"><span>Final</span><b class="${r.signal?'oktxt':'waittxt'}">${r.signal?'SIGNAL':'NO SIGNAL'}</b></div></div></div><div class="reason-line">${r.event.reasons.map(esc).join(' · ')}</div></article>`;
}
function setMetric(id,value){const el=document.getElementById(id);if(el)el.textContent=value;}
function clearFakeOutput(message){setMetric('liveCount','—');setMetric('watchCount','—');setMetric('candidateCount','—');setMetric('signalCount','—');const list=document.getElementById('matchList');if(list)list.innerHTML=`<div class="note">${esc(message)}</div>`;document.querySelectorAll('[data-pipe]').forEach(x=>x.classList.remove('ok'));}
async function getFeed(){
  if(!runtime.engineBase)throw new Error('3.42 engine base not configured');
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.requestTimeoutMs)||9000);
  try{const response=await fetch(`${runtime.engineBase}${runtime.feedPath||'/feed'}`,{cache:'no-store',signal:ac.signal});if(!response.ok)throw new Error(`engine_http_${response.status}`);const data=await response.json();if(String(data.version)!=='3.42'||!Array.isArray(data.matches))throw new Error('invalid_342_feed_contract');if(data.ok===false)throw new Error(data.lastError||'342_feed_not_ok');return data;}finally{clearTimeout(timeout);}
}
async function cycle(){
  if(running)return;running=true;const runStatus=document.getElementById('runStatus');
  try{
    const feed=await getFeed(),c=settings(),live=feed.matches.filter(m=>!m.freshness?.stale).map(mergeFeedHistory);
    const base=live.map(m=>{const event=eventCheck(m,c);return {m,event,candidate:event.pass};});
    const candidates=base.filter(x=>x.candidate).map(x=>x.m);
    const priceFetch=await fetchFiveDollarPrices(candidates);
    const results=base.map(x=>{const price=x.candidate?priceCheck(x.m,c,priceFetch.byId.get(String(x.m.id))):{pass:false,obs:null,reason:'EVENT GATE NOT PASSED'};const signal=x.candidate&&price.pass;return {...x,price,signal,decision:signal?'SIGNAL':x.candidate?'WAIT':'WATCH'};});
    results.forEach(r=>saveLedger(r,c));
    window.__nomad342LiveResults=results;window.__nomad342Feed=feed;window.__nomad342PriceSource={provider:'5DollarFootballAPI',bookmaker:'Bet365',...priceFetch};
    const list=document.getElementById('matchList');if(list)list.innerHTML=results.length?results.map(matchCard).join(''):'<div class="note">No live TotalCorner matches right now.</div>';
    setMetric('liveCount',results.length);setMetric('watchCount',results.filter(x=>!x.candidate).length);setMetric('candidateCount',results.filter(x=>x.candidate&&!x.signal).length);setMetric('signalCount',results.filter(x=>x.signal).length);
    const pipes=[...document.querySelectorAll('[data-pipe]')];pipes.forEach((x,i)=>x.classList.toggle('ok',i<=2||(results.some(r=>r.candidate)&&i<=6)||results.some(r=>r.signal)));
    if(runStatus)runStatus.textContent=`TotalCorner LIVE · 5Dollar / Bet365 · cycle ${feed.cycle??'—'} · ${results.length} matches · ${priceFetch.ready} price ready · ${results.filter(r=>r.signal).length} signal · ${new Date().toLocaleTimeString()}`;
  }catch(error){clearFakeOutput('Waiting for isolated 3.42 TotalCorner engine / 5Dollar price adapter.');if(runStatus)runStatus.textContent=`3.42 FEED WAIT · ${String(error?.message||error)}`;}finally{running=false;}
}
function start(){
  if(document.body?.dataset?.page!=='live')return;
  clearFakeOutput('Connecting to TotalCorner live feed and 5Dollar Bet365 price adapter…');
  document.addEventListener('click',event=>{const target=event.target?.closest?.('#runCheck');if(!target)return;event.preventDefault();event.stopImmediatePropagation();cycle();},true);
  cycle();timer=setInterval(cycle,Math.max(5000,Number(runtime.pollMs)||10000));
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer);},{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
