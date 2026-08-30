import {HARD_ODDS_MINIMUM,HARD_ODDS_MAXIMUM} from './config.js';

const finite = value => Number.isFinite(Number(value));
const METRICS = ['attacks','dangerousAttack','shotsOn','shotsOff','corners'];
const HARD_AH_LINE_MINIMUM=-10;
const HARD_AH_LINE_MAXIMUM=10;
const SECOND_HALF_START_MINUTE=45;

const normalizedSide=side=>String(side||'home').toLowerCase()==='away'?'away':'home';
export const configuredSides=config=>{
  const mode=String(config?.targetSideMode||'HOME').toUpperCase();
  return mode==='AWAY'?['away']:mode==='BOTH'?['home','away']:['home'];
};

function metricNumber(value){
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='object') return null;
  if(typeof value==='string'&&!value.trim()) return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

function metricDelta(end,start,key){
  const result={home:null,away:null};
  for(const side of ['home','away']){
    const a=metricNumber(end?.stats?.[key]?.[side]);
    const b=metricNumber(start?.stats?.[key]?.[side]);
    result[side]=a!=null&&b!=null&&a>=b?a-b:null;
  }
  return result;
}

function nearestSnapshot(snapshots,targetMinute,tolerance=2){
  const candidates=snapshots.filter(item=>finite(item?.minute)&&item.minute<=targetMinute&&item.minute>=targetMinute-tolerance);
  return candidates.sort((a,b)=>b.minute-a.minute||b.observedAt-a.observedAt)[0]||null;
}

function windowDelta(end,start,config){
  const delta=Object.fromEntries(METRICS.map(key=>[key,metricDelta(end,start,key)]));
  const pressure=side=>{
    const attack=delta.attacks[side],danger=delta.dangerousAttack[side];
    if(attack==null||danger==null) return null;
    return config.attackWeight*attack+config.dangerousAttackWeight*danger;
  };
  const homePressure=pressure('home'),awayPressure=pressure('away');
  return {delta,homePressure,awayPressure,tempo:homePressure!=null&&awayPressure!=null?homePressure+awayPressure:null};
}

function sideRollingState(side,rates,recent,pressureTotal,config){
  const key=side==='home'?'homePressure':'awayPressure';
  const pressureShare=pressureTotal>0?recent[key]/pressureTotal*100:0;
  const conditions={
    pressureTrend:rates.recent[key]>rates.previous[key],
    pressureShare:pressureShare>=config.homePressureShareMinimum,
    matchTempoTrend:rates.recent.tempo>rates.previous.tempo,
  };
  return {pressureShare,conditions,passedCount:Object.values(conditions).filter(Boolean).length};
}

export function buildRollingAnalysis(snapshots=[],config){
  const ordered=[...snapshots].filter(item=>finite(item?.minute)).sort((a,b)=>a.minute-b.minute||a.observedAt-b.observedAt);
  const current=ordered.at(-1);
  if(!current) return {available:false,reason:'no_current_snapshot'};
  const currentMinute=Number(current.minute);
  const window=Number(config.rollingWindowMinutes);
  if(!Number.isFinite(window)||window<=0) return {available:false,reason:'invalid_rolling_window',currentMinute};
  const periodFloor=currentMinute>=SECOND_HALF_START_MINUTE?SECOND_HALF_START_MINUTE:0;
  const periodSnapshots=ordered.filter(item=>Number(item.minute)>=periodFloor&&Number(item.minute)<=currentMinute);
  const recentStart=nearestSnapshot(periodSnapshots,currentMinute-window);
  const previousStart=recentStart?nearestSnapshot(periodSnapshots,Number(recentStart.minute)-window):null;
  if(!recentStart||!previousStart) return {available:false,reason:'insufficient_snapshot_history',currentMinute};
  const recentDuration=currentMinute-Number(recentStart.minute);
  const previousDuration=Number(recentStart.minute)-Number(previousStart.minute);
  if(recentDuration<=0||previousDuration<=0) return {available:false,reason:'invalid_window_duration',currentMinute};
  const recent=windowDelta(current,recentStart,config);
  const previous=windowDelta(recentStart,previousStart,config);
  if([recent.homePressure,recent.awayPressure,recent.tempo,previous.homePressure,previous.awayPressure,previous.tempo].some(value=>value==null)){
    return {available:false,reason:'incomplete_pressure_metrics',currentMinute};
  }
  const rates={
    previous:{homePressure:previous.homePressure/previousDuration,awayPressure:previous.awayPressure/previousDuration,tempo:previous.tempo/previousDuration},
    recent:{homePressure:recent.homePressure/recentDuration,awayPressure:recent.awayPressure/recentDuration,tempo:recent.tempo/recentDuration},
  };
  const pressureTotal=recent.homePressure+recent.awayPressure;
  const sides={
    home:sideRollingState('home',rates,recent,pressureTotal,config),
    away:sideRollingState('away',rates,recent,pressureTotal,config),
  };
  const conditions={
    homePressureTrend:sides.home.conditions.pressureTrend,
    homePressureShare:sides.home.conditions.pressureShare,
    matchTempoTrend:sides.home.conditions.matchTempoTrend,
  };
  return {
    available:true,currentMinute,windowMinutes:window,
    baselines:{previousMinute:Number(previousStart.minute),recentMinute:Number(recentStart.minute),currentMinute},
    durations:{previousMinutes:previousDuration,recentMinutes:recentDuration},
    rates,recent,previous,sides,
    homePressureShare:sides.home.pressureShare,awayPressureShare:sides.away.pressureShare,
    conditions,passedCount:sides.home.passedCount,
  };
}

function sideRolling(rolling,side,config){
  side=normalizedSide(side);
  if(rolling?.sides?.[side]) return rolling.sides[side];
  if(!rolling?.available) return {pressureShare:null,conditions:{pressureTrend:false,pressureShare:false,matchTempoTrend:false},passedCount:0};
  const recentPressure=metricNumber(rolling?.recent?.[side==='home'?'homePressure':'awayPressure']);
  const otherPressure=metricNumber(rolling?.recent?.[side==='home'?'awayPressure':'homePressure']);
  const previousRate=metricNumber(rolling?.rates?.previous?.[side==='home'?'homePressure':'awayPressure']);
  const recentRate=metricNumber(rolling?.rates?.recent?.[side==='home'?'homePressure':'awayPressure']);
  const previousTempo=metricNumber(rolling?.rates?.previous?.tempo),recentTempo=metricNumber(rolling?.rates?.recent?.tempo);
  const total=(recentPressure??0)+(otherPressure??0);
  const pressureShare=total>0?(recentPressure??0)/total*100:0;
  const conditions={
    pressureTrend:recentRate!=null&&previousRate!=null&&recentRate>previousRate,
    pressureShare:pressureShare>=config.homePressureShareMinimum,
    matchTempoTrend:recentTempo!=null&&previousTempo!=null&&recentTempo>previousTempo,
  };
  return {pressureShare,conditions,passedCount:Object.values(conditions).filter(Boolean).length};
}

function evidenceResult(rolling,config,side='home'){
  side=normalizedSide(side);
  const required=config.homeEventRequired!==false;
  const evidenceCheck=(value,minimum)=>{
    const delta=metricNumber(value);
    return delta!=null&&delta>=minimum;
  };
  const checks={
    sot:config.sotEvidenceEnabled?evidenceCheck(rolling?.recent?.delta?.shotsOn?.[side],config.sotDeltaMinimum):null,
    shotOff:config.shotOffEvidenceEnabled?evidenceCheck(rolling?.recent?.delta?.shotsOff?.[side],config.shotOffDeltaMinimum):null,
    corner:config.cornerEvidenceEnabled?evidenceCheck(rolling?.recent?.delta?.corners?.[side],config.cornerDeltaMinimum):null,
  };
  const enabled=Object.values(checks).filter(value=>value!==null);
  const eventPassed=config.evidenceMode==='ALL'?enabled.length>0&&enabled.every(Boolean):enabled.some(Boolean);
  return {required,bypassed:!required,mode:config.evidenceMode,side,checks,passed:!required||eventPassed,passedCount:enabled.filter(Boolean).length,total:enabled.length};
}

function marketNumber(value){
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='object') return null;
  if(typeof value==='string'&&!value.trim()) return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}
const quarterGoal = value => value!=null&&Math.abs(value*4-Math.round(value*4))<1e-9;
const marketForSide=(market,side)=>market?.sideMarkets?.[side]||market;

export function assessSideMarket(inputMarket,config,observedAt=Date.now(),side='home'){
  side=normalizedSide(side);
  const market=marketForSide(inputMarket,side);
  if(!market) return {status:'AH CHECKING',passed:false,reason:'waiting_price_check',ageSeconds:null,side};
  if(market.status!=='AH READY'){
    if(market.status) return {status:market.status,passed:false,reason:market.reason||null,ageSeconds:null,side};
    return {status:'AH INVALID',passed:false,reason:'missing_market_status',ageSeconds:null,side};
  }
  const homeLine=marketNumber(market.line),homeOdds=marketNumber(market.homeOdds),awayOdds=marketNumber(market.awayOdds);
  const awayLine=marketNumber(market.awayLine);
  const line=side==='home'?homeLine:(awayLine!=null?awayLine:(homeLine!=null?-homeLine:null));
  const selectionOdds=side==='home'?homeOdds:awayOdds;
  if(homeLine==null||homeLine<HARD_AH_LINE_MINIMUM||homeLine>HARD_AH_LINE_MAXIMUM||!quarterGoal(homeLine)||line==null||line<HARD_AH_LINE_MINIMUM||line>HARD_AH_LINE_MAXIMUM||!quarterGoal(line)||homeOdds==null||awayOdds==null||homeOdds<HARD_ODDS_MINIMUM||homeOdds>HARD_ODDS_MAXIMUM||awayOdds<HARD_ODDS_MINIMUM||awayOdds>HARD_ODDS_MAXIMUM){
    return {status:'AH INVALID',passed:false,reason:'invalid_line_or_odds',line,homeLine,homeOdds,awayOdds,selectionOdds,ageSeconds:null,side};
  }
  const updatedAt=marketNumber(market.sourceUpdatedAt);
  if(updatedAt==null) return {status:'AH INVALID',passed:false,reason:'missing_source_updated_time',line,homeLine,homeOdds,awayOdds,selectionOdds,ageSeconds:null,side};
  const ageSeconds=Math.max(0,(observedAt-updatedAt)/1000);
  if(ageSeconds>config.maximumPriceAgeSeconds) return {status:'AH STALE',passed:false,reason:'price_too_old',line,homeLine,homeOdds,awayOdds,selectionOdds,ageSeconds,side};
  if(config.allowedLinesMode==='SELECTED'&&!config.allowedSelectionLines.some(value=>Math.abs(value-line)<1e-9)){
    return {status:'AH LINE FAIL',passed:false,reason:`${side}_line_not_allowed`,line,homeLine,homeOdds,awayOdds,selectionOdds,ageSeconds,side};
  }
  if(selectionOdds<config.oddsMinimum||(config.oddsMaximumEnabled&&selectionOdds>config.oddsMaximum)){
    return {status:'AH ODDS FAIL',passed:false,reason:`${side}_odds_outside_configured_range`,line,homeLine,homeOdds,awayOdds,selectionOdds,ageSeconds,side};
  }
  return {status:'AH READY',passed:true,reason:null,line,selectionLine:line,homeLine,homeOdds,awayOdds,selectionOdds,ageSeconds,side};
}

export function assessConfiguredMarket(market,config,observedAt=Date.now()){
  const sides=configuredSides(config);
  const assessments=sides.map(side=>assessSideMarket(market,config,observedAt,side));
  const passing=assessments.filter(item=>item.passed);
  const pool=passing.length?passing:assessments;
  return [...pool].sort((a,b)=>{
    if(Number(b.passed)!==Number(a.passed)) return Number(b.passed)-Number(a.passed);
    const aAge=Number.isFinite(Number(a.ageSeconds))?Number(a.ageSeconds):Infinity;
    const bAge=Number.isFinite(Number(b.ageSeconds))?Number(b.ageSeconds):Infinity;
    if(aAge!==bAge) return aAge-bAge;
    return Number(b.selectionOdds||0)-Number(a.selectionOdds||0);
  })[0]||{status:'AH CHECKING',passed:false,reason:'waiting_price_check',ageSeconds:null,side:sides[0]||'home'};
}

export function assessHomeMarket(market,config,observedAt=Date.now()){
  return assessConfiguredMarket(market,config,observedAt);
}

export function assessAwayMarket(market,config,observedAt=Date.now()){
  return assessSideMarket(market,config,observedAt,'away');
}

function publicSideSelection(selection){
  if(!selection) return null;
  return {
    id:selection.id,position:selection.position,source:selection.source,bookmaker:selection.bookmaker,
    status:selection.status,line:selection.line,odds:selection.odds,sourceUpdatedAt:selection.sourceUpdatedAt,
    priceAgeSeconds:selection.priceAgeSeconds,side:selection.side,
  };
}

export function evaluateSide(match,config,market=null,observedAt=Date.now(),side='home'){
  side=normalizedSide(side);
  const rolling=match.rolling||{available:false,reason:'missing_rolling_analysis'};
  const sideState=sideRolling(rolling,side,config);
  const hunger={available:rolling.available===true,required:config.trendConditionsRequired,passedCount:sideState.passedCount||0,total:3,checks:sideState.conditions,side};
  hunger.passed=hunger.available&&hunger.passedCount>=hunger.required;
  const evidence=evidenceResult(rolling,config,side);
  const scoreDifference=finite(match?.score?.home)&&finite(match?.score?.away)?Math.abs(match.score.home-match.score.away):null;
  const checks={
    [side==='home'?'homeOnly':'awayOnly']:true,
    minute:finite(match.minute)&&match.minute>=config.minuteFrom&&match.minute<=config.minuteTo,
    score:config.scoreDifferenceFilterEnabled===false||(scoreDifference!=null&&scoreDifference<=config.maxScoreDifference),
    hunger:hunger.passed,
    evidence:evidence.passed,
  };
  const detectionPassed=Object.values(checks).every(Boolean);
  const marketCheck=market?assessSideMarket(market,config,observedAt,side):{status:'AH CHECKING',passed:false,reason:'waiting_price_check',ageSeconds:null,side};
  const allChecks={...checks,market:marketCheck.passed};
  const state=detectionPassed?(marketCheck.passed?'SIGNAL':'NEAR SIGNAL'):'WATCHING';
  const selectedSide=market?.sideSelections?.[side]||null;
  const sideMarket=marketForSide(market,side);
  return {
    state,side,detectionPassed,hunger,evidence,rolling,marketCheck,
    sidePressureShare:sideState.pressureShare,
    priceStatus:marketCheck.status,selectionLine:marketCheck.line??null,selectionOdds:marketCheck.selectionOdds??null,
    checks:allChecks,passed:Object.values(allChecks).filter(Boolean).length,total:Object.keys(allChecks).length,
    momentum:rolling.available?Math.round(sideState.pressureShare):null,
    ...(selectedSide?{selectedPrice:publicSideSelection(selectedSide),market:sideMarket}:{}),
  };
}

function candidateRank(candidate){
  const stateRank=candidate.state==='SIGNAL'?3:candidate.state==='NEAR SIGNAL'?2:1;
  const age=Number.isFinite(Number(candidate.marketCheck?.ageSeconds))?Number(candidate.marketCheck.ageSeconds):Number.POSITIVE_INFINITY;
  const odds=Number.isFinite(Number(candidate.selectionOdds))?Number(candidate.selectionOdds):0;
  return [stateRank,Number(candidate.detectionPassed),Number(candidate.hunger?.passedCount||0),Number(candidate.sidePressureShare||0),-age,odds,candidate.side==='home'?1:0];
}
function betterCandidate(left,right){
  const a=candidateRank(left),b=candidateRank(right);
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return a[i]>b[i]?left:right;
  return left;
}

export function evaluate(match,config,market=null,observedAt=Date.now()){
  const sides=configuredSides(config);
  const candidates=sides.map(side=>evaluateSide(match,config,market,observedAt,side));
  const best=candidates.reduce((selected,candidate)=>selected?betterCandidate(selected,candidate):candidate,null);
  return {...best,sideMode:String(config?.targetSideMode||'HOME').toUpperCase(),sideCandidates:Object.fromEntries(candidates.map(candidate=>[candidate.side,candidate]))};
}
