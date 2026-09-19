(()=>{
'use strict';
/*
  Ball46 LIVE PREDICTION v1
  Read-only presentation helper.
  - NO network requests
  - NO Odds / bookmaker access
  - NO Signal creation
  - NO Settings / Statistics writes
  - Reads only the already-loaded dashboard fixture and paints [data-prediction-content]
*/
const VERSION='343-live-prediction-v1-read-only';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const pair=v=>v&&typeof v==='object'?{home:num(v.home??v.h??v[0]),away:num(v.away??v.a??v[1])}:{home:null,away:null};
const sumPair=p=>(p.home??0)+(p.away??0);

function fixtureMinute(f){
  const direct=num(f?.minute??f?.elapsed);
  if(direct!==null)return clamp(Math.round(direct),0,130);
  const code=String(f?.statusCode??'').toUpperCase();
  if(code==='HT'||code.includes('HALF'))return 45;
  const m=code.match(/\d+/);
  return m?clamp(Number(m[0]),0,130):null;
}
function fixtureState(f){
  const raw=[f?.boardState,f?.status,f?.statusCode,f?.statusReason].filter(Boolean).join(' ').toLowerCase();
  if(/finished|full.?time|\bft\b|ended|after extra|\baet\b|penalties|\bpen\b/.test(raw))return'finished';
  if(/live|in.?play|playing|first half|second half|\b1h\b|\b2h\b|half.?time|\bht\b/.test(raw)||fixtureMinute(f)!==null)return'live';
  if(/postpon|cancel|abandon|suspend|delay|unknown/.test(raw))return'unknown';
  return'scheduled';
}
function scorePair(f){return pair(f?.goals??f?.score)}
function statPair(f,keys){
  const roots=[f?.statistics,f?.stats,f].filter(Boolean);
  for(const root of roots){
    for(const key of keys){
      const v=root?.[key];
      if(Array.isArray(v)){
        const p={home:num(v[0]),away:num(v[1])};
        if(p.home!==null||p.away!==null)return p;
      }
      if(v&&typeof v==='object'){
        const p=pair(v);
        if(p.home!==null||p.away!==null)return p;
      }
    }
  }
  return{home:null,away:null};
}
function cardRedPair(f){
  const cards=f?.cards;
  if(!cards||typeof cards!=='object')return{home:null,away:null};
  const side=v=>v&&typeof v==='object'?num(v.red??v.redCards??v.red_cards):null;
  return{home:side(cards.home),away:side(cards.away)};
}
function edgeContribution(p,w){
  if(p.home===null&&p.away===null)return{value:0,available:false};
  const h=p.home??0,a=p.away??0,total=h+a;
  return{value:total>0?w*((h-a)/(total+0.5)):0,available:true};
}
function analyze(f){
  const state=fixtureState(f),minute=fixtureMinute(f),score=scorePair(f);
  const hScore=score.home??0,aScore=score.away??0;
  if(state==='scheduled')return{state,headline:'PRE-MATCH',outlook:'Live prediction will begin after kick-off.',goal:'Waiting for live match evidence.',range:'—',confidence:'LOW',evidence:0,minute,score};
  if(state==='finished')return{state,headline:'MATCH FINISHED',outlook:'Live prediction has ended for this match.',goal:'Final state only.',range:`${hScore}–${aScore}`,confidence:'—',evidence:0,minute,score};
  if(state==='unknown')return{state,headline:'MATCH STATUS UNCLEAR',outlook:'Live outlook is paused until the match feed is reliable.',goal:'No directional call.',range:'—',confidence:'LOW',evidence:0,minute,score};

  const sot=statPair(f,['shotsOnTarget','shots_on_target','shotOnTarget','sot']);
  const soff=statPair(f,['shotsOffTarget','shots_off_target','shotsOff','shotOff','soff']);
  const danger=statPair(f,['dangerousAttacks','dangerous_attacks','dangerousAttack','dangerous']);
  const attacks=statPair(f,['attacks','attack']);
  const corners=statPair(f,['corners','corner']);
  const possession=statPair(f,['possession','possessionPct','possession_percent']);
  const reds=cardRedPair(f);
  const metrics=[
    edgeContribution(sot,4.0),
    edgeContribution(danger,2.4),
    edgeContribution(attacks,1.1),
    edgeContribution(soff,1.0),
    edgeContribution(corners,1.4),
    edgeContribution(possession,0.7)
  ];
  const evidence=metrics.filter(x=>x.available).length;
  let edge=metrics.reduce((a,x)=>a+x.value,0);
  if(reds.home!==null||reds.away!==null)edge+=((reds.away??0)-(reds.home??0))*2.8;
  edge+=clamp((hScore-aScore)*0.45,-1.35,1.35);

  const m=Math.max(10,minute??10);
  const activity=(sumPair(sot)*2.0)+(sumPair(soff)*0.55)+(sumPair(corners)*0.45)+(sumPair(danger)*0.055);
  const activity90=activity*90/m;
  const strong=Math.abs(edge)>=4.1,moderate=Math.abs(edge)>=2.0;
  let headline='BALANCED';
  let outlook='The live indicators remain fairly balanced.';
  if(edge>=4.1){headline='HOME PRESSURE';outlook='Home side is controlling the stronger live indicators.'}
  else if(edge>=2.0){headline='HOME EDGE';outlook='Home side has a slight live edge.'}
  else if(edge<=-4.1){headline='AWAY PRESSURE';outlook='Away side is controlling the stronger live indicators.'}
  else if(edge<=-2.0){headline='AWAY EDGE';outlook='Away side has a slight live edge.'}

  let goal='Scoring pressure is modest at the moment.';
  if((minute??0)<12)goal='Early phase — the goal outlook is still forming.';
  else if(activity90>=19&&((minute??0)<84))goal='Another goal looks possible if the current tempo continues.';
  else if(activity90>=12)goal='Goal threat is present, but not dominant.';
  else if((minute??0)>=70)goal='Current pattern points to a tighter finish unless momentum changes.';

  let range='Too early for a reliable finish range.';
  if((minute??0)>=15){
    const highTempo=activity90>=17;
    const late=(minute??0)>=78;
    const candidates=[];
    const add=(h,a)=>{const t=`${Math.max(0,h)}–${Math.max(0,a)}`;if(!candidates.includes(t))candidates.push(t)};
    if(late)add(hScore,aScore);
    if(edge>=2){
      add(hScore+1,aScore);
      if(highTempo)add(hScore+1,aScore+1);
      else add(hScore,aScore);
      if(strong&&highTempo)add(hScore+2,aScore);
    }else if(edge<=-2){
      add(hScore,aScore+1);
      if(highTempo)add(hScore+1,aScore+1);
      else add(hScore,aScore);
      if(strong&&highTempo)add(hScore,aScore+2);
    }else{
      add(hScore,aScore);
      if(highTempo){add(hScore+1,aScore);add(hScore,aScore+1);add(hScore+1,aScore+1)}
      else{add(hScore+1,aScore);add(hScore,aScore+1)}
    }
    range=candidates.slice(0,3).join(' / ');
  }

  let confidence='LOW';
  if((minute??0)>=20&&evidence>=3)confidence='MEDIUM';
  if((minute??0)>=30&&evidence>=5&&(strong||activity90>=18))confidence='HIGH';
  if((minute??0)<15||evidence<2)confidence='LOW';
  return{state,headline,outlook,goal,range,confidence,evidence,minute,score,edge,activity90,moderate};
}
function featuredMatchId(){
  const active=$('.match-row.active[data-match-id]');
  if(active?.dataset?.matchId)return active.dataset.matchId;
  const home=String($('[data-featured-home]')?.textContent||'').trim();
  const away=String($('[data-featured-away]')?.textContent||'').trim();
  if(home&&away&&home!=='—'&&away!=='—'){
    for(const row of $$('.match-row[data-match-id]')){
      const names=[...row.querySelectorAll('.teams-cell>b')].map(x=>String(x.textContent||'').trim());
      if(names[0]===home&&names[1]===away)return row.dataset.matchId;
    }
  }
  return $('.match-row[data-match-id]')?.dataset?.matchId||'';
}
function paint(){
  const host=$('[data-prediction-content]'),dash=window.NOMAD343_DASHBOARD_V2;
  if(!host||!dash?.getFixture)return;
  const id=featuredMatchId(),f=id?dash.getFixture(id):null;
  const card=$('[data-prediction-card]');
  const title=card?.querySelector('.card-title h2');
  if(title)title.textContent='Live match outlook';
  if(!f){
    host.classList.remove('locked');
    host.innerHTML='<div class="feature-empty">Waiting for live match data…</div>';
    host.dataset.predictionOwner='live-prediction-v1';
    return;
  }
  const a=analyze(f),minute=a.minute===null?'LIVE':`${a.minute}'`,score=a.score.home===null||a.score.away===null?'—':`${a.score.home}–${a.score.away}`;
  host.classList.remove('locked');
  host.dataset.predictionOwner='live-prediction-v1';
  host.title='Informational live outlook only · independent from Signals · not recorded in Statistics';
  host.innerHTML=`<div class="feature-signal-main"><b>${esc(a.headline)}</b><span>${esc(minute)} · ${esc(score)}</span></div><div class="feature-signal-meta"><span>${esc(a.outlook)}</span></div><div class="feature-signal-meta"><span>Goal outlook: ${esc(a.goal)}</span></div><div class="feature-signal-meta"><span>Possible finish: ${esc(a.range)}</span></div><div class="feature-signal-meta"><span>Confidence: ${esc(a.confidence)}</span><span>Evidence: ${esc(a.evidence)}/6</span></div>`;
}
let queued=false;
function queuePaint(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;paint()})}
function start(){
  const board=$('[data-board-sections]'),featured=$('[data-featured]');
  if(board)new MutationObserver(queuePaint).observe(board,{childList:true,subtree:true});
  if(featured)new MutationObserver(queuePaint).observe(featured,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',e=>{if(e.target.closest?.('.match-row[data-match-id]'))setTimeout(paint,0)});
  paint();
  window.NOMAD343_LIVE_PREDICTION={version:VERSION,mode:'READ_ONLY_NO_ODDS_NO_SIGNAL_NO_STATS',refresh:paint,analyze};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
