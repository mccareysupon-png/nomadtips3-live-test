(()=>{
'use strict';
const SETTINGS_KEY='nomad342.condition2.settings.v1';
const TELEMETRY_KEY='nomad342.condition2.telemetry.v1';
const DEFAULTS={
  targetMode:'BOTH',minuteFrom:55,minuteTo:88,rollingWindowMinutes:5,
  attackWeight:1,dangerousAttackWeight:1,pressureShareMinimum:55,
  evidenceMode:'ANY',sotEvidenceEnabled:true,sotDeltaMinimum:1,
  shotOffEvidenceEnabled:true,shotOffDeltaMinimum:1,
  cornerEvidenceEnabled:true,cornerDeltaMinimum:1,
  priceGateEnabled:false,oddsMinimum:1.80,oddsMaximumEnabled:false,oddsMaximum:2.40,
  observeOnly:true
};
function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function at(pair,index){return Array.isArray(pair)?finite(pair[index]):null}
function delta(first,last,key,index){const a=at(first?.[key],index),b=at(last?.[key],index);return a===null||b===null?null:b-a}
function settings(){try{return {...DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch{return {...DEFAULTS}}}
function readTelemetry(){try{const x=JSON.parse(localStorage.getItem(TELEMETRY_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function sides(mode){return mode==='HOME'?['HOME']:mode==='AWAY'?['AWAY']:['HOME','AWAY']}
function snapRows(m){return [...(m?.event?.snapshots||[])].filter(s=>finite(s?.minute)!==null).sort((a,b)=>Number(a.minute)-Number(b.minute)||Number(a.observedAt||0)-Number(b.observedAt||0))}
function windowPair(rows,endMinute,minutes){
  const eligible=rows.filter(s=>Number(s.minute)>=endMinute-minutes&&Number(s.minute)<=endMinute);
  if(eligible.length<2)return null;
  const first=eligible[0],last=eligible[eligible.length-1];
  if(Number(first.minute)>=Number(last.minute))return null;
  return {first,last,duration:Number(last.minute)-Number(first.minute)};
}
function windowMetrics(rows,endMinute,minutes,targetIndex){
  const pair=windowPair(rows,endMinute,minutes);if(!pair)return null;
  const opponentIndex=targetIndex===0?1:0;
  const metric=(key)=>({target:delta(pair.first,pair.last,key,targetIndex),opponent:delta(pair.first,pair.last,key,opponentIndex)});
  const attacks=metric('attacks'),dangerous=metric('dangerous'),sot=metric('sot'),off=metric('off'),corner=metric('corner');
  return {from:Number(pair.first.minute),to:Number(pair.last.minute),duration:pair.duration,attacks,dangerous,sot,off,corner};
}
function evaluateSide(m,side,c){
  const targetIndex=side==='HOME'?0:1,opponentIndex=targetIndex===0?1:0;
  const rows=snapRows(m);const cur=windowMetrics(rows,Number(m.minute),c.rollingWindowMinutes,targetIndex);
  const previousEnd=Number(m.minute)-c.rollingWindowMinutes;
  const prev=windowMetrics(rows,previousEnd,c.rollingWindowMinutes,targetIndex);
  const targetTeam=side==='HOME'?m.home:m.away;
  const opponentTeam=side==='HOME'?m.away:m.home;
  if(!cur)return {matchId:String(m.id),side,targetTeam,opponentTeam,minute:m.minute,status:'WAIT_DATA',reason:'rolling window not ready'};
  const vals=[cur.attacks.target,cur.attacks.opponent,cur.dangerous.target,cur.dangerous.opponent];
  if(vals.some(v=>v===null))return {matchId:String(m.id),side,targetTeam,opponentTeam,minute:m.minute,status:'WAIT_DATA',reason:'attack metrics incomplete'};
  const weightedTarget=Math.max(0,cur.attacks.target*c.attackWeight+cur.dangerous.target*c.dangerousAttackWeight);
  const weightedOpponent=Math.max(0,cur.attacks.opponent*c.attackWeight+cur.dangerous.opponent*c.dangerousAttackWeight);
  const weightedTotal=weightedTarget+weightedOpponent;
  const pressureShare=weightedTotal>0?weightedTarget/weightedTotal*100:0;
  const perMin=(v)=>v===null||!cur.duration?null:v/cur.duration;
  const currentRate=perMin(cur.dangerous.target);
  let previousRate=null,acceleration=null;
  if(prev&&prev.dangerous.target!==null&&prev.duration){previousRate=prev.dangerous.target/prev.duration;acceleration=currentRate-previousRate}
  const evidence=[];
  if(c.sotEvidenceEnabled)evidence.push(cur.sot.target!==null&&cur.sot.target>=c.sotDeltaMinimum);
  if(c.shotOffEvidenceEnabled)evidence.push(cur.off.target!==null&&cur.off.target>=c.shotOffDeltaMinimum);
  if(c.cornerEvidenceEnabled)evidence.push(cur.corner.target!==null&&cur.corner.target>=c.cornerDeltaMinimum);
  const eventPass=evidence.length===0?true:(c.evidenceMode==='ALL'?evidence.every(Boolean):evidence.some(Boolean));
  const minutePass=Number(m.minute)>=c.minuteFrom&&Number(m.minute)<=c.minuteTo;
  const fieldPass=minutePass&&pressureShare>=c.pressureShareMinimum&&eventPass;
  const latest=rows[rows.length-1]||{};
  return {
    matchId:String(m.id),match:`${m.home} — ${m.away}`,home:m.home,away:m.away,league:m.league||'',side,targetIndex,opponentIndex,
    targetTeam,opponentTeam,minute:Number(m.minute),score:Array.isArray(m.score)?m.score.join('–'):'—',observedAt:Date.now(),
    sourceObservedAt:finite(latest.observedAt),window:{from:cur.from,to:cur.to,duration:cur.duration,minutes:c.rollingWindowMinutes},
    raw:{attacks:cur.attacks,dangerous:cur.dangerous,sot:cur.sot,off:cur.off,corner:cur.corner},
    rates:{dangerousPerMinTarget:currentRate,dangerousPerMinOpponent:perMin(cur.dangerous.opponent),attackPerMinTarget:perMin(cur.attacks.target),attackPerMinOpponent:perMin(cur.attacks.opponent)},
    acceleration:{dangerousPerMin:acceleration,previousDangerousPerMin:previousRate},
    pressure:{targetWeighted:weightedTarget,opponentWeighted:weightedOpponent,share:pressureShare},
    gates:{minute:minutePass,pressure:pressureShare>=c.pressureShareMinimum,evidence:eventPass,field:fieldPass,price:false},
    state:fieldPass?'FIELD_READY':'WATCH',decision:'OBSERVE_ONLY',normalizedScore:null,normalizedStatus:'CALIBRATION_PENDING',
    price:{enabled:false,status:'BLOCKED_UNTIL_AWAY_HOME_AH_INVARIANT_VERIFIED'}
  };
}
function sampleKey(x){return `${x.matchId}|${x.side}|${x.minute}|${x.window?.from}|${x.window?.to}`}
function persist(samples){
  const existing=readTelemetry();const byKey=new Map(existing.map(x=>[sampleKey(x),x]));
  samples.forEach(x=>byKey.set(sampleKey(x),x));
  const rows=[...byKey.values()].sort((a,b)=>Number(b.observedAt||0)-Number(a.observedAt||0)).slice(0,1200);
  try{localStorage.setItem(TELEMETRY_KEY,JSON.stringify(rows))}catch{}
  window.__nomad342Condition2Telemetry=rows;
}
function cycle(){
  const c=settings();
  const results=Array.isArray(window.__nomad342LiveResults)?window.__nomad342LiveResults:[];
  if(!results.length)return;
  const out=[];
  for(const r of results){if(!r?.m)continue;for(const side of sides(c.targetMode))out.push(evaluateSide(r.m,side,c))}
  persist(out.filter(x=>x&&x.matchId));
  window.NOMAD_C2={settings:()=>settings(),telemetry:()=>readTelemetry(),evaluateSide};
}
function start(){if(document.body?.dataset?.page!=='live')return;cycle();setInterval(cycle,2500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();