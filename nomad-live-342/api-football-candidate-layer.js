(()=>{
'use strict';
const runtime=window.NOMAD342_MARKET_RUNTIME||{};
const ledgerRuntime=window.NOMAD342_LEDGER_RUNTIME||{};
const STORE_KEY='nomad342ApiFootballPredictionsV1';
const LEDGER_OUTBOX_KEY='nomad342LedgerOutboxV1';
const PICK_GATE_KEY='nomad342PickGateV1';
const PICK_GATE_DEFAULTS=Object.freeze({
  minuteFrom:0,minuteTo:120,
  priceFreshnessEnabled:false,maximumPriceAgeSeconds:90,
  allowHome:true,allowDraw:true,allowAway:true,
  oneXtwoMinProbability:0,oneXtwoMinLead:0,oneXtwoMinEdge:-100,
  oneXtwoOddsMin:1.01,oneXtwoOddsMax:6,
  oneXtwoPressureConfirm:false,oneXtwoSidePressureMin:0,oneXtwoDrawBalanceMax:50,
  oneXtwoRejectSelectedSideIfTrailing:false,
  allowOver:true,allowUnder:true,
  totalsMinProbability:0,totalsMinLead:0,totalsMinEdge:-100,
  totalsOddsMin:1.01,totalsOddsMax:6,
  totalsActivityConfirm:false,overMinRecentShots:0,overMinRecentSot:0,
  underMaxRecentShots:99,underMaxRecentSot:99
});
const MAX_ATTEMPTS=3;
const RETRY_DELAYS=[0,45000,120000];
const LEDGER_RETRY_DELAYS=[0,15000,45000,120000,300000];
const GATE_RECHECK_MS=15000;
const state=new Map();
let busy=false,ledgerBusy=false;

function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function load(){try{return JSON.parse(sessionStorage.getItem(STORE_KEY)||'{}')||{}}catch{return {}}}
function save(store){try{sessionStorage.setItem(STORE_KEY,JSON.stringify(store))}catch{}}
function loadOutbox(){try{return JSON.parse(localStorage.getItem(LEDGER_OUTBOX_KEY)||'{}')||{}}catch{return {}}}
function saveOutbox(store){try{localStorage.setItem(LEDGER_OUTBOX_KEY,JSON.stringify(store));return true}catch{return false}}
function pickGateSettings(){try{return {...PICK_GATE_DEFAULTS,...JSON.parse(localStorage.getItem(PICK_GATE_KEY)||'{}')}}catch{return {...PICK_GATE_DEFAULTS}}}
function lockedFor(id){const row=load()[String(id)];return row?.status==='PREDICTED'?row:null}
function remember(id,row){const store=load();store[String(id)]={...row,status:'PREDICTED',ledgerStatus:row?.ledgerStatus||'PENDING',savedAt:Date.now()};save(store)}
function setLedgerStatus(id,status,extra={}){const store=load(),key=String(id),row=store[key];if(!row)return;store[key]={...row,ledgerStatus:status,...extra};save(store)}
function implied(values){const raw=values.map(v=>1/Math.max(1.001,Number(v)||999)),sum=raw.reduce((a,b)=>a+b,0);return raw.map(v=>sum>0?v/sum:0)}
function normalize3(a,b,c){const sum=a+b+c||1;const raw=[a/sum*100,b/sum*100,c/sum*100],rounded=raw.map(Math.round);let diff=100-rounded.reduce((x,y)=>x+y,0);for(let i=0;diff!==0;i=(i+1)%3){rounded[i]+=diff>0?1:-1;diff+=diff>0?-1:1}return rounded}
function normalize2(a,b){const sum=a+b||1,aa=Math.round(a/sum*100);return [aa,100-aa]}
function prediction(r,market){
  const one=market.oneXtwo,tot=market.totals,em=r?.event?.metrics||{},m=r?.m||{};
  const [mh,md,ma]=implied([one.home,one.draw,one.away]);
  const pressure=clamp((finite(em.pressureShare)??50)/100,.35,.80),trend=clamp((finite(em.trendPass)??0)/3,0,1),scoreH=finite(m?.score?.[0])??0,scoreA=finite(m?.score?.[1])??0;
  const homeBoost=clamp((pressure-.5)*.45+trend*.035+(scoreH-scoreA)*.025,0,.18);
  const drawBoost=scoreH===scoreA ? .018 : 0;
  const [homePct,drawPct,awayPct]=normalize3(mh+homeBoost,md+drawBoost,ma);
  const onePick=[['HOME',homePct],['DRAW',drawPct],['AWAY',awayPct]].sort((a,b)=>b[1]-a[1])[0][0];

  const [mo,mu]=implied([tot.over,tot.under]);
  const hSot=finite(em.hSot)??0,aSot=finite(em.aSot)??0,hOff=finite(em.hOff)??0,aOff=finite(em.aOff)??0,hD=finite(em.hD)??0,aD=finite(em.aD)??0,hC=finite(em.hCorner)??0,aC=finite(em.aCorner)??0;
  const activity=clamp((hSot+aSot+hOff+aOff)*.018+(hD+aD)*.005+(hC+aC)*.01,0,.16),minute=finite(m.minute)??60,currentGoals=scoreH+scoreA,line=finite(tot.line)??2.5;
  let over=mo,under=mu;
  if(currentGoals>line){over=.99;under=.01}else{
    const remaining=clamp((95-minute)/40,0,1),near=currentGoals>=line-.5 ? .055 : 0;
    over=clamp(mo+activity*remaining+near,.05,.95);under=clamp(mu-activity*remaining-near,.05,.95);
  }
  const [overPct,underPct]=normalize2(over,under),ouPick=overPct>=underPct?'OVER':'UNDER';
  return {oneXtwo:{pick:onePick,home:homePct,draw:drawPct,away:awayPct},totals:{pick:ouPick,line,over:overPct,under:underPct}};
}
function selectedOddsOne(market,pick){return finite(pick==='HOME'?market?.oneXtwo?.home:pick==='DRAW'?market?.oneXtwo?.draw:market?.oneXtwo?.away)}
function selectedOddsTotals(market,pick){return finite(pick==='OVER'?market?.totals?.over:market?.totals?.under)}
function selectedProbabilityOne(pred,pick){return finite(pick==='HOME'?pred?.home:pick==='DRAW'?pred?.draw:pred?.away)}
function selectedProbabilityTotals(pred,pick){return finite(pick==='OVER'?pred?.over:pred?.under)}
function oddsWithin(value,min,max){return value!==null&&value>=Number(min)&&value<=Number(max)}
function evaluatePickGate(r,row){
  const c=pickGateSettings(),m=r?.m||{},em=r?.event?.metrics||{},market=row?.market||{},p=row?.prediction||{},globalReasons=[];
  const minute=finite(m.minute),observedAt=finite(market.observedAt);
  if(minute===null||minute<c.minuteFrom||minute>c.minuteTo)globalReasons.push(`minute outside ${c.minuteFrom}-${c.minuteTo}`);
  if(c.priceFreshnessEnabled){if(observedAt===null)globalReasons.push('market timestamp missing');else if(Date.now()-observedAt>Number(c.maximumPriceAgeSeconds)*1000)globalReasons.push('market price stale')}

  const onePick=String(p?.oneXtwo?.pick||'').toUpperCase(),oneProb=selectedProbabilityOne(p.oneXtwo,onePick),oneOdds=selectedOddsOne(market,onePick);
  const oneValues=[finite(p?.oneXtwo?.home),finite(p?.oneXtwo?.draw),finite(p?.oneXtwo?.away)].filter(v=>v!==null).sort((a,b)=>b-a),oneLead=oneValues.length>1?oneValues[0]-oneValues[1]:0;
  const [ih,id,ia]=implied([market?.oneXtwo?.home,market?.oneXtwo?.draw,market?.oneXtwo?.away]),impliedOne=(onePick==='HOME'?ih:onePick==='DRAW'?id:ia)*100,oneEdge=oneProb===null?null:oneProb-impliedOne;
  const oneReasons=[];
  if((onePick==='HOME'&&!c.allowHome)||(onePick==='DRAW'&&!c.allowDraw)||(onePick==='AWAY'&&!c.allowAway)||!['HOME','DRAW','AWAY'].includes(onePick))oneReasons.push(`${onePick||'1X2'} disabled`);
  if(oneProb===null||oneProb<Number(c.oneXtwoMinProbability))oneReasons.push('1X2 probability below minimum');
  if(oneLead<Number(c.oneXtwoMinLead))oneReasons.push('1X2 lead below minimum');
  if(oneEdge===null||oneEdge<Number(c.oneXtwoMinEdge))oneReasons.push('1X2 edge below minimum');
  if(!oddsWithin(oneOdds,c.oneXtwoOddsMin,c.oneXtwoOddsMax))oneReasons.push('1X2 odds outside range');
  if(c.oneXtwoPressureConfirm){const hp=finite(em.pressureShare);if(hp===null)oneReasons.push('pressure unavailable');else if(onePick==='HOME'&&hp<Number(c.oneXtwoSidePressureMin))oneReasons.push('HOME pressure below minimum');else if(onePick==='AWAY'&&(100-hp)<Number(c.oneXtwoSidePressureMin))oneReasons.push('AWAY pressure below minimum');else if(onePick==='DRAW'&&Math.abs(hp-50)>Number(c.oneXtwoDrawBalanceMax))oneReasons.push('DRAW pressure imbalance too high')}
  if(c.oneXtwoRejectSelectedSideIfTrailing){const sh=finite(m?.score?.[0]),sa=finite(m?.score?.[1]);if(sh===null||sa===null)oneReasons.push('score unavailable');else if(onePick==='HOME'&&sh<sa)oneReasons.push('HOME currently trailing');else if(onePick==='AWAY'&&sa<sh)oneReasons.push('AWAY currently trailing')}

  const totPick=String(p?.totals?.pick||'').toUpperCase(),totProb=selectedProbabilityTotals(p.totals,totPick),totOdds=selectedOddsTotals(market,totPick),totOther=totPick==='OVER'?finite(p?.totals?.under):finite(p?.totals?.over),totLead=totProb===null||totOther===null?0:totProb-totOther;
  const [io,iu]=implied([market?.totals?.over,market?.totals?.under]),impliedTot=(totPick==='OVER'?io:iu)*100,totEdge=totProb===null?null:totProb-impliedTot;
  const totalShots=(finite(em.hSot)??0)+(finite(em.aSot)??0)+(finite(em.hOff)??0)+(finite(em.aOff)??0),totalSot=(finite(em.hSot)??0)+(finite(em.aSot)??0),totReasons=[];
  if((totPick==='OVER'&&!c.allowOver)||(totPick==='UNDER'&&!c.allowUnder)||!['OVER','UNDER'].includes(totPick))totReasons.push(`${totPick||'O/U'} disabled`);
  if(totProb===null||totProb<Number(c.totalsMinProbability))totReasons.push('O/U probability below minimum');
  if(totLead<Number(c.totalsMinLead))totReasons.push('O/U lead below minimum');
  if(totEdge===null||totEdge<Number(c.totalsMinEdge))totReasons.push('O/U edge below minimum');
  if(!oddsWithin(totOdds,c.totalsOddsMin,c.totalsOddsMax))totReasons.push('O/U odds outside range');
  if(c.totalsActivityConfirm){if(totPick==='OVER'&&(totalShots<Number(c.overMinRecentShots)||totalSot<Number(c.overMinRecentSot)))totReasons.push('OVER activity below minimum');if(totPick==='UNDER'&&(totalShots>Number(c.underMaxRecentShots)||totalSot>Number(c.underMaxRecentSot)))totReasons.push('UNDER activity above maximum')}

  const globalPass=globalReasons.length===0,onePass=oneReasons.length===0,totalsPass=totReasons.length===0;
  return {pass:globalPass&&onePass&&totalsPass,global:{pass:globalPass,reasons:globalReasons},oneXtwo:{pass:onePass,pick:onePick,probability:oneProb,lead:Number(oneLead.toFixed(1)),edge:oneEdge===null?null:Number(oneEdge.toFixed(1)),odds:oneOdds,reasons:oneReasons},totals:{pass:totalsPass,pick:totPick,probability:totProb,lead:Number(totLead.toFixed(1)),edge:totEdge===null?null:Number(totEdge.toFixed(1)),odds:totOdds,totalShots,totalSot,reasons:totReasons}};
}
function fmt(v){const n=finite(v);return n===null?'—':n.toFixed(2)}
function panelHtml(row){const m=row.market,p=row.prediction;return `<section class="api-football-candidate-card"><div class="afc-head"><div><span>API-FOOTBALL · ONE-SHOT REFEREE</span><small>K Default passed → 1X2 + OVER/UNDER</small></div><strong>PREDICTION LOCKED</strong></div><div class="afc-grid"><article><span>1X2</span><strong>${esc(p.oneXtwo.pick)}</strong><small>H ${p.oneXtwo.home}% · X ${p.oneXtwo.draw}% · A ${p.oneXtwo.away}%</small><div>1 @ ${esc(fmt(m.oneXtwo.home))} · X @ ${esc(fmt(m.oneXtwo.draw))} · 2 @ ${esc(fmt(m.oneXtwo.away))}</div></article><article><span>OVER / UNDER ${esc(String(p.totals.line))}</span><strong>${esc(p.totals.pick)}</strong><small>OVER ${p.totals.over}% · UNDER ${p.totals.under}%</small><div>O @ ${esc(fmt(m.totals.over))} · U @ ${esc(fmt(m.totals.under))}</div></article></div><div class="afc-foot">API STOPPED FOR THIS MATCH · ${esc(m.fixture?.home||'')} vs ${esc(m.fixture?.away||'')} · upstream requests ${esc(m.requestsUsed??'—')} · fixture cache ${esc(m.fixtureCache||'—')}</div></section>`}
function remove(card){card?.querySelectorAll('.api-football-candidate-card,.api-candidate-mini').forEach(n=>n.remove())}
function hydrateCard(card,row){if(!card||!row)return;remove(card);const badge=document.createElement('span');badge.className='api-candidate-mini';badge.textContent='1X2 · O/U LOCK';card.querySelector('.card-topline')?.appendChild(badge);if(!card.classList.contains('expanded'))return;const details=card.querySelector('.event-details');if(!details)return;const wrap=document.createElement('div');wrap.innerHTML=panelHtml(row);const node=wrap.firstElementChild;if(!node)return;const predictionNode=details.querySelector(':scope > .nomad-live-prediction');if(predictionNode)predictionNode.after(node);else details.prepend(node)}
function hydrateAll(){const store=load();document.querySelectorAll('.event-compact').forEach(card=>{const row=store[String(card.dataset.matchId)];if(row?.status==='PREDICTED')hydrateCard(card,row)})}
function resultById(){const rows=window.__nomad342EventResults;return new Map(Array.isArray(rows)?rows.map(r=>[String(r?.m?.id),r]):[])}
async function fetchCandidate(r){const base=String(runtime.base||'').replace(/\/$/,'');if(!base)throw new Error('market_base_missing');const m=r.m,url=new URL(`${base}/candidate`);url.searchParams.set('home',m.home||'');url.searchParams.set('away',m.away||'');url.searchParams.set('minute',String(m.minute??''));if(Array.isArray(m.score)){url.searchParams.set('scoreHome',String(m.score[0]??''));url.searchParams.set('scoreAway',String(m.score[1]??''))}const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),7000);try{const response=await fetch(url.toString(),{cache:'no-store',signal:ac.signal});let data={};try{data=await response.json()}catch{}if(!response.ok||!data?.ok)throw Object.assign(new Error(data?.error||`candidate_http_${response.status}`),{data});return data}finally{clearTimeout(timer)}}
function ledgerPayload(id,r,row){
  const m=r?.m||{},event=r?.event||{},market=row?.market||{};
  return {
    schemaVersion:1,matchId:String(id),fixtureId:String(market?.fixture?.id||''),league:m.league||'',home:m.home||'',away:m.away||'',minute:m.minute,entryScore:m.score,eventPass:event.pass===true,eventMetrics:event.metrics||null,
    configVersion:window.NOMAD342_CONFIG?.version||null,presetVersion:window.NOMAD342_K_LIVE_PRESET?.version||null,prediction:row.prediction,
    market:{provider:market.provider||'API-Football',observedAt:market.observedAt||Date.now(),oneXtwo:market.oneXtwo||null,totals:market.totals||null}
  };
}
function postLedger(payload){
  const id=String(payload?.matchId||'');if(!id||!payload?.fixtureId)return false;
  const outbox=loadOutbox(),existing=outbox[id];
  outbox[id]={payload,createdAt:existing?.createdAt||Date.now(),attempts:existing?.attempts||0,nextAt:0,lastError:null};
  saveOutbox(outbox);setLedgerStatus(id,'PENDING',{ledgerQueuedAt:Date.now()});
  setTimeout(flushLedgerOutbox,0);return true;
}
async function sendLedger(payload){
  const base=String(ledgerRuntime.base||'').replace(/\/$/,'');if(!base||!payload?.fixtureId)throw new Error('ledger_target_missing');
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),Number(ledgerRuntime.timeoutMs)||6500);
  try{
    const response=await fetch(`${base}${ledgerRuntime.lockPath||'/lock'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:ac.signal});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok||data?.ok===false||data?.locked!==true)throw new Error(data?.error||`ledger_http_${response.status}`);
    return data;
  }finally{clearTimeout(timer)}
}
async function flushLedgerOutbox(){
  if(ledgerBusy)return;const outbox=loadOutbox(),now=Date.now();
  const next=Object.entries(outbox).filter(([,item])=>item?.payload&&Number(item.nextAt||0)<=now).sort((a,b)=>Number(a[1]?.createdAt||0)-Number(b[1]?.createdAt||0))[0];
  if(!next)return;ledgerBusy=true;
  const [id,item]=next;
  try{
    const ack=await sendLedger(item.payload),fresh=loadOutbox();delete fresh[id];saveOutbox(fresh);
    setLedgerStatus(id,'SYNCED',{ledgerSyncedAt:Date.now(),ledgerDuplicate:ack?.duplicate===true});
    document.dispatchEvent(new CustomEvent('nomad342:ledgerlocked',{detail:{matchId:id,duplicate:ack?.duplicate===true}}));
  }catch(error){
    const fresh=loadOutbox(),current=fresh[id]||item,attempts=Number(current.attempts||0)+1,delay=LEDGER_RETRY_DELAYS[Math.min(attempts,LEDGER_RETRY_DELAYS.length-1)];
    fresh[id]={...current,attempts,nextAt:Date.now()+delay,lastError:String(error?.message||error),lastAttemptAt:Date.now()};saveOutbox(fresh);
    setLedgerStatus(id,'PENDING',{ledgerLastError:String(error?.message||error),ledgerLastAttemptAt:Date.now()});
  }finally{ledgerBusy=false;setTimeout(flushLedgerOutbox,250)}
}
function recoverLockedRows(){
  const store=load(),byId=resultById(),outbox=loadOutbox();
  for(const [id,row] of Object.entries(store)){
    if(row?.status!=='PREDICTED'||row?.ledgerStatus==='SYNCED'||outbox[id])continue;
    const r=byId.get(String(id));if(!r)continue;
    const payload=ledgerPayload(id,r,row);if(payload.fixtureId)postLedger(payload);
  }
}
function scheduleFailure(id,error){const current=state.get(id)||{attempts:0,nextAt:0},attempts=current.attempts+1;state.set(id,{attempts,nextAt:attempts>=MAX_ATTEMPTS?Infinity:Date.now()+RETRY_DELAYS[Math.min(attempts,RETRY_DELAYS.length-1)],error:String(error?.message||error)})}
async function runOne(id,r){busy=true;try{const market=await fetchCandidate(r);if(!market.oneXtwo||!market.totals)throw new Error('markets_incomplete');const row={market,prediction:prediction(r,market)},gate=evaluatePickGate(r,row);if(!gate.pass){state.set(id,{attempts:0,nextAt:Date.now()+GATE_RECHECK_MS,gate});return;}row.pickGate=gate;remember(id,row);state.set(id,{attempts:0,nextAt:Infinity,done:true,gate});hydrateAll();postLedger(ledgerPayload(id,r,row))}catch(error){scheduleFailure(id,error)}finally{busy=false;setTimeout(scan,900)}}
function scan(){hydrateAll();recoverLockedRows();flushLedgerOutbox();if(busy)return;const byId=resultById(),now=Date.now(),c=pickGateSettings();for(const [id,r] of byId){if(!r?.event?.metrics||lockedFor(id))continue;const minute=finite(r?.m?.minute);if(minute===null||minute<c.minuteFrom||minute>c.minuteTo)continue;const s=state.get(id)||{attempts:0,nextAt:0};if(s.attempts>=MAX_ATTEMPTS||now<s.nextAt)continue;runOne(id,r);return}}
function start(){if(document.body?.dataset?.page!=='live')return;const list=document.getElementById('matchList');if(!list)return;let queued=false;const queue=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan()})};new MutationObserver(queue).observe(list,{childList:true});list.addEventListener('click',()=>setTimeout(hydrateAll,0));setInterval(scan,15000);setInterval(flushLedgerOutbox,15000);window.addEventListener('storage',event=>{if(event.key===PICK_GATE_KEY){state.clear();queue();}});document.addEventListener('nomad342:pickgatesaved',()=>{state.clear();queue();});queue();flushLedgerOutbox();window.__nomad342ApiFootballCandidate={scan,storeKey:STORE_KEY,outboxKey:LEDGER_OUTBOX_KEY,pickGateKey:PICK_GATE_KEY,maxAttempts:MAX_ATTEMPTS,flushLedgerOutbox,evaluatePickGate}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
