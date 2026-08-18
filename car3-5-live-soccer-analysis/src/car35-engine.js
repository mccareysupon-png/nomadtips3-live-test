import {num} from './goaloo-direct.js';

export const DEFAULT_CONFIG={
  side:'HOME',minuteMin:60,minuteMax:80,market:'WIN',oddsMin:1.70,oddsMax:null,
  ahMin:.25,ahMax:null,ouDirection:'OVER',ouLine:2.5,momentumMin:60,confirmationRounds:2,
  attackEvidenceEnabled:true,
  attackEvidenceDangerousAttacksEnabled:true,attackEvidenceDangerousAttacksMin:1,
  attackEvidenceShotsEnabled:true,attackEvidenceShotsMin:1,
  attackEvidenceShotsOnTargetEnabled:true,attackEvidenceShotsOnTargetMin:1,
  attackEvidenceCornersEnabled:true,attackEvidenceCornersMin:1,attackEvidenceRequirement:'1',
  goalGapLimited:false,maxGoalGap:1,signalLimitEnabled:false,maxSignalsPerDay:10,
  sourceFreshnessMaxSeconds:90,matchConfidenceMin:85,requireCoreStats:true,redCardPolicy:'ALLOW',
  bookmakerCompanyId:8,
  momentumWeights:{attacks:.16,dangerous_attacks:.52,shots:2,shots_on_target:4,corners:1.25,possession:.07}
};

const bool=(v,f=false)=>typeof v==='boolean'?v:v==='true'||v===1||v==='1'?true:v==='false'||v===0||v==='0'?false:f;
const clamp=(v,f,min,max)=>{const n=num(v);return n===null?f:Math.max(min,Math.min(max,n))};
const nullableClamp=(v,min,max)=>{const n=num(v);return n===null?null:Math.max(min,Math.min(max,n))};
const enumv=(v,a,f)=>{v=String(v??f).toUpperCase();return a.includes(v)?v:f};

export function normConfig(s={}){
  const minuteMin=Math.round(clamp(s.minuteMin,DEFAULT_CONFIG.minuteMin,1,119));
  const minuteMax=Math.round(clamp(s.minuteMax,DEFAULT_CONFIG.minuteMax,minuteMin,120));
  const company=[8,50].includes(Number(s.bookmakerCompanyId))?Number(s.bookmakerCompanyId):8;
  return{
    ...DEFAULT_CONFIG,...s,
    bookmakerCompanyId:company,
    side:enumv(s.side,['HOME','AWAY','BOTH'],'HOME'),
    minuteMin,minuteMax,
    market:enumv(s.market,['WIN','AH','OU'],'WIN'),
    oddsMin:clamp(s.oddsMin,DEFAULT_CONFIG.oddsMin,1.01,100),
    oddsMax:nullableClamp(s.oddsMax,1.01,100),
    ahMin:clamp(s.ahMin,DEFAULT_CONFIG.ahMin,-5,5),
    ahMax:nullableClamp(s.ahMax,-5,5),
    ouDirection:enumv(s.ouDirection,['OVER','UNDER'],'OVER'),
    ouLine:clamp(s.ouLine,DEFAULT_CONFIG.ouLine,.5,8.5),
    momentumMin:Math.round(clamp(s.momentumMin,DEFAULT_CONFIG.momentumMin,1,99)),
    confirmationRounds:Math.round(clamp(s.confirmationRounds,DEFAULT_CONFIG.confirmationRounds,1,10)),
    attackEvidenceEnabled:bool(s.attackEvidenceEnabled,true),
    attackEvidenceDangerousAttacksEnabled:bool(s.attackEvidenceDangerousAttacksEnabled,true),
    attackEvidenceDangerousAttacksMin:Math.round(clamp(s.attackEvidenceDangerousAttacksMin,1,0,999)),
    attackEvidenceShotsEnabled:bool(s.attackEvidenceShotsEnabled,true),
    attackEvidenceShotsMin:Math.round(clamp(s.attackEvidenceShotsMin,1,0,999)),
    attackEvidenceShotsOnTargetEnabled:bool(s.attackEvidenceShotsOnTargetEnabled,true),
    attackEvidenceShotsOnTargetMin:Math.round(clamp(s.attackEvidenceShotsOnTargetMin,1,0,999)),
    attackEvidenceCornersEnabled:bool(s.attackEvidenceCornersEnabled,true),
    attackEvidenceCornersMin:Math.round(clamp(s.attackEvidenceCornersMin,1,0,999)),
    attackEvidenceRequirement:enumv(s.attackEvidenceRequirement,['1','2','3','ALL'],'1'),
    goalGapLimited:bool(s.goalGapLimited,false),
    maxGoalGap:Math.round(clamp(s.maxGoalGap,1,0,20)),
    signalLimitEnabled:bool(s.signalLimitEnabled,false),
    maxSignalsPerDay:Math.round(clamp(s.maxSignalsPerDay,10,1,100)),
    sourceFreshnessMaxSeconds:Math.round(clamp(s.sourceFreshnessMaxSeconds,90,1,600)),
    matchConfidenceMin:Math.round(clamp(s.matchConfidenceMin,85,50,100)),
    requireCoreStats:bool(s.requireCoreStats,true),
    redCardPolicy:enumv(s.redCardPolicy,['ALLOW','REJECT_SELECTED','REJECT_ANY'],'ALLOW'),
    momentumWeights:{
      attacks:clamp(s.momentumWeights?.attacks,.16,0,20),
      dangerous_attacks:clamp(s.momentumWeights?.dangerous_attacks,.52,0,20),
      shots:clamp(s.momentumWeights?.shots,2,0,20),
      shots_on_target:clamp(s.momentumWeights?.shots_on_target,4,0,20),
      corners:clamp(s.momentumWeights?.corners,1.25,0,20),
      possession:clamp(s.momentumWeights?.possession,.07,0,2)
    }
  };
}

export function validateConfig(input={}){
  const c=normConfig(input),errors=[];
  if(![8,50].includes(c.bookmakerCompanyId))errors.push('BOOKMAKER_INVALID');
  if(c.minuteMin>c.minuteMax)errors.push('MINUTE_RANGE_INVALID');
  if(c.oddsMax!==null&&c.oddsMax<c.oddsMin)errors.push('ODDS_RANGE_INVALID');
  if(c.market==='AH'&&c.ahMax!==null&&c.ahMax<c.ahMin)errors.push('AH_RANGE_INVALID');
  if(c.market==='OU'&&!Number.isFinite(c.ouLine))errors.push('OU_LINE_INVALID');
  if(c.attackEvidenceEnabled){
    const enabled=[c.attackEvidenceDangerousAttacksEnabled,c.attackEvidenceShotsEnabled,c.attackEvidenceShotsOnTargetEnabled,c.attackEvidenceCornersEnabled].filter(Boolean).length;
    const required=c.attackEvidenceRequirement==='ALL'?enabled:Number(c.attackEvidenceRequirement);
    if(!enabled)errors.push('ATTACK_EVIDENCE_EMPTY');
    if(required>enabled)errors.push('ATTACK_EVIDENCE_REQUIREMENT_INVALID');
  }
  return{ok:errors.length===0,errors,config:c};
}

function pressure(stats,w){
  let h=0,a=0;
  for(const [k,wt] of Object.entries(w||{})){
    h+=(num(stats?.[k]?.home)||0)*wt;
    a+=(num(stats?.[k]?.away)||0)*wt;
  }
  const t=Math.max(.0001,h+a);
  return{home:Math.round(h/t*100),away:Math.round(a/t*100)};
}
const sidePair=(obj,side)=>side==='AWAY'?{selected:num(obj?.away)||0,opponent:num(obj?.home)||0}:{selected:num(obj?.home)||0,opponent:num(obj?.away)||0};
function chooseSide(c,p){if(c.side==='HOME')return'HOME';if(c.side==='AWAY')return'AWAY';return p.away>p.home?'AWAY':'HOME'}
function baselineFor(match,side,snapshots,c){
  for(const snap of snapshots||[]){
    const old=(snap.matches||[]).find(x=>String(x.sourceMatchId||x.id)===String(match.sourceMatchId));
    if(!old||Number(old.minute)<c.minuteMin||!old.coreStatsComplete)continue;
    return{
      dangerous:sidePair(old.stats?.dangerous_attacks,side).selected,
      shots:sidePair(old.stats?.shots,side).selected,
      sot:sidePair(old.stats?.shots_on_target,side).selected,
      corners:sidePair(old.stats?.corners,side).selected
    };
  }
  return{
    dangerous:sidePair(match.stats?.dangerous_attacks,side).selected,
    shots:sidePair(match.stats?.shots,side).selected,
    sot:sidePair(match.stats?.shots_on_target,side).selected,
    corners:sidePair(match.stats?.corners,side).selected
  };
}

export function evaluate(match,config,snapshots=[]){
  const c=normConfig(config),p=pressure(match.stats,c.momentumWeights),side=chooseSide(c,p),momentum=side==='AWAY'?p.away:p.home;
  const base=baselineFor(match,side,snapshots,c),cur={
    dangerous:sidePair(match.stats?.dangerous_attacks,side).selected,
    shots:sidePair(match.stats?.shots,side).selected,
    sot:sidePair(match.stats?.shots_on_target,side).selected,
    corners:sidePair(match.stats?.corners,side).selected
  };
  const evidence={dangerous:cur.dangerous-base.dangerous,shots:cur.shots-base.shots,sot:cur.sot-base.sot,corners:cur.corners-base.corners};
  const rules=[
    [c.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,c.attackEvidenceDangerousAttacksMin],
    [c.attackEvidenceShotsEnabled,evidence.shots,c.attackEvidenceShotsMin],
    [c.attackEvidenceShotsOnTargetEnabled,evidence.sot,c.attackEvidenceShotsOnTargetMin],
    [c.attackEvidenceCornersEnabled,evidence.corners,c.attackEvidenceCornersMin]
  ].filter(x=>x[0]);
  const passed=rules.filter(x=>x[1]>=x[2]).length,required=c.attackEvidenceRequirement==='ALL'?rules.length:Number(c.attackEvidenceRequirement);
  const score=sidePair(match.score,side),red=sidePair(match.stats?.red_cards,side),gap=Math.abs(score.selected-score.opponent);
  let odds=null,line=null,selectedLine=null;
  if(c.market==='WIN'){
    odds=match.odds?.oneXtwo?.[side==='AWAY'?'away':'home']??null;
  }else if(c.market==='AH'){
    line=num(match.odds?.asianHandicap?.line);
    selectedLine=line===null?null:(side==='AWAY'?-line:line);
    odds=match.odds?.asianHandicap?.[side==='AWAY'?'away':'home']??null;
  }else{
    line=num(match.odds?.overUnder?.line);
    selectedLine=line===null?c.ouLine:line;
    odds=match.odds?.overUnder?.[c.ouDirection==='OVER'?'over':'under']??null;
  }
  const lineOk=c.market==='AH'
    ? selectedLine!==null&&selectedLine>=c.ahMin&&(c.ahMax===null||selectedLine<=c.ahMax)
    : c.market==='OU'
      ? selectedLine!==null&&Math.abs(selectedLine-c.ouLine)<.001
      : true;
  const checks={
    minute:Number(match.minute)>=c.minuteMin&&Number(match.minute)<=c.minuteMax,
    core:!c.requireCoreStats||Boolean(match.coreStatsComplete),
    fresh:num(match.sourceFreshnessSeconds)!==null&&num(match.sourceFreshnessSeconds)<=c.sourceFreshnessMaxSeconds,
    confidence:(num(match.matchConfidence)||0)>=c.matchConfidenceMin,
    momentum:momentum>=c.momentumMin,
    evidence:!c.attackEvidenceEnabled||passed>=required,
    goalGap:!c.goalGapLimited||gap<=c.maxGoalGap,
    red:c.redCardPolicy==='ALLOW'||(c.redCardPolicy==='REJECT_SELECTED'?red.selected===0:(red.selected===0&&red.opponent===0)),
    odds:num(odds)!==null&&num(odds)>=c.oddsMin&&(c.oddsMax===null||num(odds)<=c.oddsMax),
    line:lineOk
  };
  const all=Object.values(checks).every(Boolean);
  const near=checks.minute&&checks.core&&checks.fresh&&checks.confidence&&(momentum>=Math.max(50,c.momentumMin-7));
  return{
    decision:all?'SIGNAL':near?'NEAR':'WATCH',selectedSide:side,selectedTeam:side==='HOME'?match.home:match.away,
    market:c.market,ouDirection:c.ouDirection,line:selectedLine,selectedLine,odds:num(odds),lockedOdds:num(odds),
    momentum,confidence:momentum,matchConfidence:num(match.matchConfidence),pressure:p,evidence,checks,
    bookmakerCompanyId:c.bookmakerCompanyId
  };
}

export function makeRecord(match,engine){
  const selectedAt=new Date().toISOString();
  const recordKey=`${match.sourceMatchId}:${engine.market}:${engine.selectedSide}:${selectedAt}`;
  return{
    recordKey,id:String(match.sourceMatchId),sourceMatchId:String(match.sourceMatchId),league:match.league,
    home:match.home,away:match.away,selectedSide:engine.selectedSide,selectedTeam:engine.selectedTeam,
    market:engine.market,ouDirection:engine.ouDirection,selectedLine:engine.selectedLine,line:engine.selectedLine,
    odds:engine.odds,momentum:engine.momentum,matchConfidence:engine.matchConfidence,bookmakerCompanyId:engine.bookmakerCompanyId,
    sourceFreshnessSeconds:match.sourceFreshnessSeconds,entryMinute:match.minute,entryScore:{...match.score},selectedAt,
    result:'PENDING',resultGroup:'PENDING',netUnits:null,settledAt:null,source:'GOALOO_DIRECT'
  };
}
function quarterComponents(line){const q=Math.round(line*4)/4;if(Math.abs(q*2-Math.round(q*2))<1e-9)return[q,q];return[q<0?Math.ceil(q*2)/2:Math.floor(q*2)/2,q<0?Math.floor(q*2)/2:Math.ceil(q*2)/2]}
const leg=d=>d>0?'W':d<0?'L':'P';
function settleLegs(diffs,odds){
  const r=diffs.map(leg),w=r.filter(x=>x==='W').length,l=r.filter(x=>x==='L').length,p=r.filter(x=>x==='P').length;
  const profit=(w*((odds||1)-1)-l)/2;
  const result=w===2?'WIN':l===2?'LOSS':p===2?'PUSH':w===1&&p===1?'HALF_WIN':l===1&&p===1?'HALF_LOSS':'PUSH';
  return{result,resultGroup:profit>0?'W':profit<0?'L':'D',netUnits:Number(profit.toFixed(3))};
}
export function settleRecord(record,finalMatch){
  if(record.settledAt)return record;
  const hs=num(finalMatch.score?.home)||0,as=num(finalMatch.score?.away)||0,sel=record.selectedSide==='AWAY'?as:hs,opp=record.selectedSide==='AWAY'?hs:as;
  let out;
  if(record.market==='WIN'){
    out=sel>opp?{result:'WIN',resultGroup:'W',netUnits:Number(((record.odds||1)-1).toFixed(3))}:sel<opp?{result:'LOSS',resultGroup:'L',netUnits:-1}:{result:'PUSH',resultGroup:'D',netUnits:0};
  }else if(record.market==='AH'){
    const line=num(record.selectedLine)||0,outcome=sel-opp;
    out=settleLegs(quarterComponents(line).map(x=>outcome+x),record.odds);
  }else{
    const line=num(record.selectedLine)||2.5,total=hs+as,dir=record.ouDirection==='UNDER'?-1:1;
    out=settleLegs(quarterComponents(line).map(x=>dir*(total-x)),record.odds);
  }
  return{...record,...out,finalScore:{home:hs,away:as},settledAt:new Date().toISOString()};
}
