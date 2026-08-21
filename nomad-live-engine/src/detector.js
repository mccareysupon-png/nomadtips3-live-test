import {HARD_ODDS_MINIMUM,HARD_ODDS_MAXIMUM} from './config.js';

const finite = value => Number.isFinite(Number(value));
const number = value => finite(value)?Number(value):null;
const METRICS = ['attacks','dangerousAttack','shotsOn','shotsOff','corners'];

function metricDelta(end,start,key){
  const result={home:null,away:null};
  for(const side of ['home','away']){
    const a=number(end?.stats?.[key]?.[side]);
    const b=number(start?.stats?.[key]?.[side]);
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

export function buildRollingAnalysis(snapshots=[],config){
  const ordered=[...snapshots].filter(item=>finite(item?.minute)).sort((a,b)=>a.minute-b.minute||a.observedAt-b.observedAt);
  const current=ordered.at(-1);
  if(!current) return {available:false,reason:'no_current_snapshot'};
  const window=config.rollingWindowMinutes;
  const recentStart=nearestSnapshot(ordered,current.minute-window);
  const previousStart=nearestSnapshot(ordered,current.minute-(2*window));
  if(!recentStart||!previousStart) return {available:false,reason:'insufficient_snapshot_history',currentMinute:current.minute};
  const recent=windowDelta(current,recentStart,config);
  const previous=windowDelta(recentStart,previousStart,config);
  if([recent.homePressure,recent.awayPressure,recent.tempo,previous.homePressure,previous.awayPressure,previous.tempo].some(value=>value==null)){
    return {available:false,reason:'incomplete_pressure_metrics',currentMinute:current.minute};
  }
  const pressureTotal=recent.homePressure+recent.awayPressure;
  const homePressureShare=pressureTotal>0?recent.homePressure/pressureTotal*100:0;
  const conditions={
    homePressureTrend:recent.homePressure>previous.homePressure,
    homePressureShare:homePressureShare>=config.homePressureShareMinimum,
    matchTempoTrend:recent.tempo>previous.tempo,
  };
  const passedCount=Object.values(conditions).filter(Boolean).length;
  return {
    available:true,currentMinute:current.minute,windowMinutes:window,
    baselines:{previousMinute:previousStart.minute,recentMinute:recentStart.minute,currentMinute:current.minute},
    recent,previous,homePressureShare,conditions,passedCount,
  };
}

function evidenceResult(rolling,config){
  const checks={
    sot:config.sotEvidenceEnabled?number(rolling?.recent?.delta?.shotsOn?.home)>=config.sotDeltaMinimum:null,
    shotOff:config.shotOffEvidenceEnabled?number(rolling?.recent?.delta?.shotsOff?.home)>=config.shotOffDeltaMinimum:null,
    corner:config.cornerEvidenceEnabled?number(rolling?.recent?.delta?.corners?.home)>=config.cornerDeltaMinimum:null,
  };
  const enabled=Object.values(checks).filter(value=>value!==null);
  const passed=config.evidenceMode==='ALL'?enabled.length>0&&enabled.every(Boolean):enabled.some(Boolean);
  return {mode:config.evidenceMode,checks,passed,passedCount:enabled.filter(Boolean).length,total:enabled.length};
}

const quarterGoal = value => finite(value)&&Math.abs(Number(value)*4-Math.round(Number(value)*4))<1e-9;

export function assessHomeMarket(market,config,observedAt=Date.now()){
  if(!market) return {status:'AH CHECKING',passed:false,reason:'waiting_price_check',ageSeconds:null};
  if(market.status&&market.status!=='AH READY') return {status:market.status,passed:false,reason:market.reason||null,ageSeconds:null};
  const line=number(market.line),homeOdds=number(market.homeOdds),awayOdds=number(market.awayOdds);
  if(!quarterGoal(line)||homeOdds==null||awayOdds==null||homeOdds<HARD_ODDS_MINIMUM||homeOdds>HARD_ODDS_MAXIMUM||awayOdds<HARD_ODDS_MINIMUM||awayOdds>HARD_ODDS_MAXIMUM){
    return {status:'AH INVALID',passed:false,reason:'invalid_line_or_odds',line,homeOdds,awayOdds,ageSeconds:null};
  }
  const updatedAt=number(market.sourceUpdatedAt);
  if(updatedAt==null) return {status:'AH INVALID',passed:false,reason:'missing_source_updated_time',line,homeOdds,awayOdds,ageSeconds:null};
  const ageSeconds=Math.max(0,(observedAt-updatedAt)/1000);
  if(ageSeconds>config.maximumPriceAgeSeconds) return {status:'AH STALE',passed:false,reason:'price_too_old',line,homeOdds,awayOdds,ageSeconds};
  if(config.allowedLinesMode==='SELECTED'&&!config.allowedSelectionLines.some(value=>Math.abs(value-line)<1e-9)){
    return {status:'AH LINE FAIL',passed:false,reason:'home_line_not_allowed',line,homeOdds,awayOdds,ageSeconds};
  }
  if(homeOdds<config.oddsMinimum||(config.oddsMaximumEnabled&&homeOdds>config.oddsMaximum)){
    return {status:'AH ODDS FAIL',passed:false,reason:'home_odds_outside_configured_range',line,homeOdds,awayOdds,ageSeconds};
  }
  return {status:'AH READY',passed:true,reason:null,line,homeOdds,awayOdds,ageSeconds};
}

export function evaluate(match,config,market=null,observedAt=Date.now()){
  const rolling=match.rolling||{available:false,reason:'missing_rolling_analysis'};
  const hunger={
    available:rolling.available===true,
    required:config.trendConditionsRequired,
    passedCount:rolling.passedCount||0,
    total:3,
    checks:rolling.conditions||{homePressureTrend:false,homePressureShare:false,matchTempoTrend:false},
  };
  hunger.passed=hunger.available&&hunger.passedCount>=hunger.required;
  const evidence=evidenceResult(rolling,config);
  const scoreDifference=finite(match?.score?.home)&&finite(match?.score?.away)?Math.abs(match.score.home-match.score.away):null;
  const checks={
    homeOnly:true,
    minute:finite(match.minute)&&match.minute>=config.minuteFrom&&match.minute<=config.minuteTo,
    score:config.scoreDifferenceFilterEnabled===false||(scoreDifference!=null&&scoreDifference<=config.maxScoreDifference),
    hunger:hunger.passed,
    evidence:evidence.passed,
  };
  const detectionPassed=Object.values(checks).every(Boolean);
  const marketCheck=market?assessHomeMarket(market,config,observedAt):{status:'AH CHECKING',passed:false,reason:'waiting_price_check',ageSeconds:null};
  const allChecks={...checks,market:marketCheck.passed};
  const state=detectionPassed?(marketCheck.passed?'SIGNAL':'NEAR SIGNAL'):'WATCHING';
  return {
    state,side:'home',detectionPassed,hunger,evidence,rolling,marketCheck,
    priceStatus:marketCheck.status,selectionLine:marketCheck.line??null,selectionOdds:marketCheck.homeOdds??null,
    checks:allChecks,passed:Object.values(allChecks).filter(Boolean).length,total:Object.keys(allChecks).length,
    momentum:rolling.available?Math.round(rolling.homePressureShare):null,
  };
}
