export const SPECIAL341_DEFAULT = Object.freeze({
  targetSideMode:'HOME',
  minuteFrom:55,
  minuteTo:88,
  rollingWindowMinutes:5,
  scoreDifferenceFilterEnabled:false,
  maxScoreDifference:1,
  attackWeight:1,
  dangerousAttackWeight:1,
  homePressureShareMinimum:54,
  trendConditionsRequired:2,
  homeEventRequired:true,
  sotEvidenceEnabled:true,
  sotDeltaMinimum:1,
  shotOffEvidenceEnabled:true,
  shotOffDeltaMinimum:1,
  cornerEvidenceEnabled:true,
  cornerDeltaMinimum:1,
  evidenceMode:'ANY',
  allowedLinesMode:'ANY',
  allowedSelectionLines:[],
  oddsMinimum:1.50,
  oddsMaximumEnabled:false,
  oddsMaximum:6,
  maximumPriceAgeSeconds:90,
  oneSignalPerMatch:true
});

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>finite(v)?Number(v):null;
const sideValue=(pair,side)=>num(side==='HOME'?pair?.home:pair?.away);
const deltaPair=(a,b)=>{const d=(x,y)=>x===null||y===null?null:Math.max(0,x-y);return {home:d(num(a?.home),num(b?.home)),away:d(num(a?.away),num(b?.away))}};

function nearestAtOrBefore(rows,target,floor){
  let out=null;
  for(const row of rows){const m=num(row?.minute);if(m===null||m<floor||m>target)continue;if(!out||m>Number(out.minute))out=row}
  return out;
}
function windowDelta(end,start,cfg){
  const attacks=deltaPair(end?.attacks,start?.attacks),dangerous=deltaPair(end?.dangerousAttacks,start?.dangerousAttacks);
  const shotsOn=deltaPair(end?.shotsOnTarget,start?.shotsOnTarget),shotsOff=deltaPair(end?.shotsOffTarget,start?.shotsOffTarget),corners=deltaPair(end?.corners,start?.corners);
  const pressure=side=>{const a=sideValue(attacks,side),d=sideValue(dangerous,side);return a===null||d===null?null:Number(cfg.attackWeight)*a+Number(cfg.dangerousAttackWeight)*d};
  const homePressure=pressure('HOME'),awayPressure=pressure('AWAY');
  return {attacks,dangerousAttacks:dangerous,shotsOnTarget:shotsOn,shotsOffTarget:shotsOff,corners,homePressure,awayPressure,tempo:homePressure===null||awayPressure===null?null:homePressure+awayPressure};
}
export function special341Rolling(rows,current,cfg){
  if(!Array.isArray(rows)||rows.length<3||!current)return null;
  const currentMinute=num(current.minute),window=Number(cfg.rollingWindowMinutes||5);if(currentMinute===null||!Number.isFinite(window)||window<=0)return null;
  const floor=currentMinute>=45?45:0;
  const recentStart=nearestAtOrBefore(rows,currentMinute-window,floor);if(!recentStart)return null;
  const previousStart=nearestAtOrBefore(rows,Number(recentStart.minute)-window,floor);if(!previousStart)return null;
  const recentDuration=currentMinute-Number(recentStart.minute),previousDuration=Number(recentStart.minute)-Number(previousStart.minute);if(recentDuration<=0||previousDuration<=0)return null;
  const recent=windowDelta(current,recentStart,cfg),previous=windowDelta(recentStart,previousStart,cfg);
  if([recent.homePressure,recent.awayPressure,recent.tempo,previous.homePressure,previous.awayPressure,previous.tempo].some(v=>v===null))return null;
  return {recent,previous,recentDuration,previousDuration,currentMinute,baselines:{previousMinute:Number(previousStart.minute),recentMinute:Number(recentStart.minute),currentMinute}};
}
export function special341Sides(cfg){const mode=String(cfg?.targetSideMode||'HOME').toUpperCase();return mode==='AWAY'?['AWAY']:mode==='BOTH'?['HOME','AWAY']:['HOME']}
function sideState(roll,side,cfg){
  if(!roll)return {available:false,pressureShare:null,passedCount:0,conditions:{pressureTrend:false,pressureShare:false,matchTempoTrend:false}};
  const key=side==='HOME'?'homePressure':'awayPressure',recentRate=roll.recent[key]/roll.recentDuration,previousRate=roll.previous[key]/roll.previousDuration;
  const recentTempoRate=roll.recent.tempo/roll.recentDuration,previousTempoRate=roll.previous.tempo/roll.previousDuration,total=roll.recent.homePressure+roll.recent.awayPressure;
  const pressureShare=total>0?roll.recent[key]/total*100:0;
  const conditions={pressureTrend:recentRate>previousRate,pressureShare:pressureShare>=Number(cfg.homePressureShareMinimum),matchTempoTrend:recentTempoRate>previousTempoRate};
  return {available:true,pressureShare,conditions,passedCount:Object.values(conditions).filter(Boolean).length};
}
function eventEvidence(roll,side,cfg){
  const checks=[];
  if(cfg.sotEvidenceEnabled)checks.push({name:'SOT',value:sideValue(roll?.recent?.shotsOnTarget,side),minimum:Number(cfg.sotDeltaMinimum)});
  if(cfg.shotOffEvidenceEnabled)checks.push({name:'SHOT_OFF',value:sideValue(roll?.recent?.shotsOffTarget,side),minimum:Number(cfg.shotOffDeltaMinimum)});
  if(cfg.cornerEvidenceEnabled)checks.push({name:'CORNER',value:sideValue(roll?.recent?.corners,side),minimum:Number(cfg.cornerDeltaMinimum)});
  const items=checks.map(x=>({...x,pass:x.value!==null&&x.value>=x.minimum}));
  const required=cfg.homeEventRequired!==false,mode=String(cfg.evidenceMode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
  const eventPassed=mode==='ALL'?items.length>0&&items.every(x=>x.pass):items.some(x=>x.pass);
  return {required,mode,items,passed:!required||eventPassed,passedCount:items.filter(x=>x.pass).length,total:items.length};
}
function lineAllowed(line,cfg){
  if(line===null)return false;if(String(cfg.allowedLinesMode||'ANY').toUpperCase()!=='SELECTED')return true;
  const list=Array.isArray(cfg.allowedSelectionLines)?cfg.allowedSelectionLines.map(Number).filter(Number.isFinite):[];return list.some(v=>Math.abs(v-line)<1e-9);
}
export function special341PreEvaluate(cfg,fixture,roll,side,line){
  const minute=num(fixture?.minute);if(minute===null||minute<Number(cfg.minuteFrom)||minute>Number(cfg.minuteTo))return {pass:false,stage:'MINUTE',side};
  if(!roll)return {pass:false,stage:'ROLLING_NOT_READY',side,evidence:{strength:0}};
  const h=num(fixture?.goals?.home),a=num(fixture?.goals?.away),scoreDiff=h===null||a===null?null:Math.abs(h-a);
  if(cfg.scoreDifferenceFilterEnabled!==false&&(scoreDiff===null||scoreDiff>Number(cfg.maxScoreDifference)))return {pass:false,stage:'SCORE',side,scoreDifference:scoreDiff,evidence:{strength:0}};
  const state=sideState(roll,side,cfg),hunger={required:Number(cfg.trendConditionsRequired||2),passedCount:state.passedCount,total:3,checks:state.conditions,pressureShare:state.pressureShare};hunger.passed=state.passedCount>=hunger.required;
  if(!hunger.passed)return {pass:false,stage:'HUNGER',side,hunger,evidence:{strength:state.passedCount*100+(state.pressureShare||0)}};
  const ev=eventEvidence(roll,side,cfg);if(!ev.passed)return {pass:false,stage:'EVENT',side,hunger,eventEvidence:ev,evidence:{strength:state.passedCount*100+(state.pressureShare||0)}};
  if(!lineAllowed(line,cfg))return {pass:false,stage:line===null?'LINE_UNAVAILABLE':'LINE_NOT_ALLOWED',side,hunger,eventEvidence:ev,line,evidence:{strength:state.passedCount*100+ev.passedCount*10+(state.pressureShare||0)}};
  return {pass:true,stage:'PREPASS',side,hunger,eventEvidence:ev,line,evidence:{strength:state.passedCount*100+ev.passedCount*10+(state.pressureShare||0),pressureShare:state.pressureShare,hunger,eventEvidence:ev}};
}
export function special341PricePass(cfg,price,ageSeconds=0){
  const odds=num(price?.odds),line=num(price?.line);if(odds===null||line===null)return false;
  if(odds<Number(cfg.oddsMinimum))return false;if(cfg.oddsMaximumEnabled&&odds>Number(cfg.oddsMaximum))return false;
  if(Number.isFinite(Number(ageSeconds))&&ageSeconds>Number(cfg.maximumPriceAgeSeconds||90))return false;
  return lineAllowed(line,cfg);
}
