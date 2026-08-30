(()=>{
'use strict';

const MODEL_END_MINUTE=95;
const BASE_HOME_GOALS=1.45;
const BASE_AWAY_GOALS=1.15;

function finite(v){
  if(v===null||v===undefined||v===''||typeof v==='boolean')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function at(pair,index){return Array.isArray(pair)?finite(pair[index]):null}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function sortedSnapshots(m){
  return [...(m?.event?.snapshots||[])]
    .filter(s=>Number.isFinite(Number(s?.minute)))
    .sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0));
}
function latestSnapshot(m){
  const rows=sortedSnapshots(m);
  return rows[rows.length-1]||null;
}
function pairShare(pair){
  const h=Math.max(0,at(pair,0)??0),a=Math.max(0,at(pair,1)??0);
  return (h+1)/(h+a+2);
}
function phase(m){
  const s=latestSnapshot(m);
  const values=[m?.status,m?.matchStatus,m?.match_status,m?.fixtureStatus,m?.fixture_status,m?.phase,m?.period,m?.state,m?.event?.status,m?.event?.phase,m?.event?.period,s?.status,s?.phase,s?.period];
  for(const raw of values){
    if(raw===null||raw===undefined||raw==='')continue;
    const value=String(raw).trim().toUpperCase().replace(/_/g,' ').replace(/\s+/g,' ');
    if(['FT','FULL TIME','FULLTIME','FULL-TIME','FINISHED','FINAL','ENDED','MATCH ENDED'].includes(value))return 'FT';
  }
  return '';
}
function poisson(lambda,k){
  if(k===0)return Math.exp(-lambda);
  let p=Math.exp(-lambda);
  for(let i=1;i<=k;i++)p*=lambda/i;
  return p;
}
function normalizeOutcome(home,draw,away){
  const total=home+draw+away;
  if(!(total>0))return {home:0,draw:100,away:0};
  const raw=[home/total*100,draw/total*100,away/total*100];
  const rounded=raw.map(Math.round);
  let diff=100-rounded.reduce((a,b)=>a+b,0);
  if(diff!==0){
    const order=raw.map((v,i)=>({i,f:v-Math.floor(v)})).sort((a,b)=>diff>0?b.f-a.f:a.f-b.f);
    for(let n=0;n<Math.abs(diff);n++)rounded[order[n%order.length].i]+=diff>0?1:-1;
  }
  return {home:rounded[0],draw:rounded[1],away:rounded[2]};
}
function deterministic(score){
  if(score[0]>score[1])return {home:100,draw:0,away:0};
  if(score[0]<score[1])return {home:0,draw:0,away:100};
  return {home:0,draw:100,away:0};
}
function model(r){
  const m=r?.m;
  if(!m)return null;
  const homeScore=at(m.score,0),awayScore=at(m.score,1),minute=finite(m.minute);
  if(homeScore===null||awayScore===null||minute===null)return null;
  if(phase(m)==='FT')return {...deterministic([homeScore,awayScore]),quality:'FINAL',stale:Boolean(m?.freshness?.stale)};

  const latest=latestSnapshot(m);
  const em=r?.event?.metrics||null;
  const pressureShare=em?clamp((finite(em.pressureShare)??50)/100,0,1):0.5;
  const sotShare=pairShare(latest?.sot);
  const dangerShare=pairShare(latest?.dangerous);
  const attackShare=pairShare(latest?.attacks);
  const cornerShare=pairShare(latest?.corner);

  // Convert live evidence into a bounded scoring-rate adjustment. This is
  // intentionally separate from Event Gate / signal logic and is never fed
  // back into NOMAD selection or referee decisions.
  const edge=
    1.30*(pressureShare-0.5)+
    0.80*(sotShare-0.5)+
    0.45*(dangerShare-0.5)+
    0.25*(attackShare-0.5)+
    0.15*(cornerShare-0.5);
  const homeMultiplier=clamp(Math.exp(edge),0.48,2.10);
  const awayMultiplier=clamp(Math.exp(-edge),0.48,2.10);
  const remaining=clamp(MODEL_END_MINUTE-minute,0,MODEL_END_MINUTE);
  const timeFactor=remaining/MODEL_END_MINUTE;
  const homeLambda=clamp(BASE_HOME_GOALS*timeFactor*homeMultiplier,0,3.5);
  const awayLambda=clamp(BASE_AWAY_GOALS*timeFactor*awayMultiplier,0,3.5);

  if(remaining<=0)return {...deterministic([homeScore,awayScore]),quality:'LIVE',stale:Boolean(m?.freshness?.stale)};

  let home=0,draw=0,away=0;
  const maxGoals=10;
  for(let h=0;h<=maxGoals;h++){
    const hp=poisson(homeLambda,h);
    for(let a=0;a<=maxGoals;a++){
      const p=hp*poisson(awayLambda,a);
      const finalHome=homeScore+h,finalAway=awayScore+a;
      if(finalHome>finalAway)home+=p;
      else if(finalHome===finalAway)draw+=p;
      else away+=p;
    }
  }
  const probs=normalizeOutcome(home,draw,away);
  const available=[em,latest?.sot,latest?.dangerous,latest?.attacks,latest?.corner].filter(Boolean).length;
  const quality=available>=5?'STRONG':available>=3?'MODERATE':'BASIC';
  return {...probs,quality,stale:Boolean(m?.freshness?.stale)};
}
function predictionHtml(r){
  const p=model(r);
  if(!p){
    return `<section class="nomad-live-prediction is-building"><div class="nlp-head"><div><span>NOMAD LIVE PREDICTION</span><small>real-time outcome model</small></div><strong>BUILDING</strong></div><div class="nlp-empty">Waiting for score and live match time…</div></section>`;
  }
  const state=p.stale?'STALE INPUT':p.quality;
  return `<section class="nomad-live-prediction${p.stale?' is-stale':''}"><div class="nlp-head"><div><span>NOMAD LIVE PREDICTION</span><small>score + time + pressure + live events</small></div><strong>${state}</strong></div><div class="nlp-values"><div class="nlp-home"><span>HOME WIN</span><b>${p.home}%</b></div><div class="nlp-draw"><span>DRAW</span><b>${p.draw}%</b></div><div class="nlp-away"><span>AWAY WIN</span><b>${p.away}%</b></div></div><div class="nlp-track" role="img" aria-label="Home win ${p.home} percent, draw ${p.draw} percent, away win ${p.away} percent"><i class="nlp-track-home" style="width:${p.home}%"></i><i class="nlp-track-draw" style="width:${p.draw}%"></i><i class="nlp-track-away" style="width:${p.away}%"></i></div><div class="nlp-note">LIVE MODEL ESTIMATE · HOME + DRAW + AWAY = 100%</div></section>`;
}
function hydrateCard(card,r){
  if(!card||!r||!card.classList.contains('expanded'))return;
  const details=card.querySelector('.event-details');
  if(!details)return;
  const old=details.querySelector(':scope > .nomad-live-prediction');
  if(old)old.remove();
  const wrap=document.createElement('div');
  wrap.innerHTML=predictionHtml(r);
  const node=wrap.firstElementChild;
  if(!node)return;
  const analyticsTop=details.querySelector(':scope > .nomad-analytics-top');
  if(analyticsTop)details.insertBefore(node,analyticsTop);else details.append(node);
}
function hydrateAll(){
  const results=window.__nomad342EventResults;
  if(!Array.isArray(results))return;
  const byId=new Map(results.map(r=>[String(r?.m?.id),r]));
  document.querySelectorAll('.event-compact.expanded').forEach(card=>hydrateCard(card,byId.get(String(card.dataset.matchId))));
}
function start(){
  if(document.body?.dataset?.page!=='live')return;
  const list=document.getElementById('matchList');
  if(!list)return;
  let queued=false;
  const queue=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;hydrateAll()});
  };
  new MutationObserver(queue).observe(list,{childList:true});
  list.addEventListener('click',()=>setTimeout(queue,0));
  list.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')setTimeout(queue,0)});
  queue();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();