export const ENGINE3_BASE_DEFAULTS = Object.freeze({
  side: 'HOME', minuteMin: 60, minuteMax: 80, market: 'WIN',
  oddsMin: 1.70, oddsMax: null, ahMin: 0.25, ahMax: null,
  momentumMin: 60, attackEvidenceEnabled: true,
  attackEvidenceDetailedConfigured: true,
  attackEvidenceDangerousAttacksEnabled: true, attackEvidenceDangerousAttacksMin: 1,
  attackEvidenceShotsEnabled: true, attackEvidenceShotsMin: 1,
  attackEvidenceShotsOnTargetEnabled: true, attackEvidenceShotsOnTargetMin: 1,
  attackEvidenceCornersEnabled: true, attackEvidenceCornersMin: 1,
  attackEvidenceRequirement: '1', goalGapLimited: false, maxGoalGap: 1,
  confirmationRounds: 2, signalLimitEnabled: false, maxSignalsPerDay: 10
});

// Public branding is NOMADTIPS3. Upstream transport details stay internal to the collector.
export const CAR31_SOURCE_MODE = Object.freeze({
  locked: true,
  primary: 'NOMADTIPS3',
  fallback: 'OFF',
  backup: 'OFF',
  apiVerifyPolicy: 'OFF',
  dataConflictPolicy: 'PASS'
});

export const CAR31_DEFAULT_CONFIG = Object.freeze({
  ...ENGINE3_BASE_DEFAULTS,
  engineMode: 'SHADOW',
  sourcePrimary: CAR31_SOURCE_MODE.primary,
  sourceFallback: CAR31_SOURCE_MODE.fallback,
  sourceBackup: CAR31_SOURCE_MODE.backup,
  sourceRefreshSeconds: 30,
  sourceFreshnessMaxSeconds: 90,
  matchConfidenceMin: 85,
  requireCoreStats: true,
  apiVerifyPolicy: CAR31_SOURCE_MODE.apiVerifyPolicy,
  dataConflictPolicy: CAR31_SOURCE_MODE.dataConflictPolicy,
  ouDirection: 'OVER', ouLine: 2.5,
  trendWindowMinutes: 15, chartHistoryMinutes: 30,
  pressureSpikeEnabled: false, pressureSpikeMin: 12,
  redCardPolicy: 'ALLOW', maxSourceMismatchPercent: 25,
  momentumWeights: Object.freeze({ attacks:0.16, dangerous_attacks:0.52, shots:2, shots_on_target:4, corners:1.25, possession:0.07 })
});

const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
function bounded(value,fallback,min,max,step=null){
  const parsed=num(value); let result=parsed===null?fallback:Math.max(min,Math.min(max,parsed));
  if(step) result=Math.round(result/step)*step;
  return Number(result.toFixed(6));
}
const integer=(value,fallback,min,max)=>Math.round(bounded(value,fallback,min,max));
function bool(value,fallback=false){
  if(typeof value==='boolean') return value;
  if(value==='true'||value===1||value==='1') return true;
  if(value==='false'||value===0||value==='0') return false;
  return fallback;
}
function enumValue(value,allowed,fallback){
  const v=String(value??fallback).trim().toUpperCase();
  return allowed.includes(v)?v:fallback;
}
function optional(value,min,max,step=null){ const parsed=num(value); return parsed===null?null:bounded(parsed,parsed,min,max,step); }
function normalizeWeights(input={}){
  const d=CAR31_DEFAULT_CONFIG.momentumWeights;
  return {
    attacks:bounded(input.attacks,d.attacks,0,20,.01), dangerous_attacks:bounded(input.dangerous_attacks,d.dangerous_attacks,0,20,.01),
    shots:bounded(input.shots,d.shots,0,20,.01), shots_on_target:bounded(input.shots_on_target,d.shots_on_target,0,20,.01),
    corners:bounded(input.corners,d.corners,0,20,.01), possession:bounded(input.possession,d.possession,0,2,.01)
  };
}

export function normalizeCar31Config(input={}){
  const s=input&&typeof input==='object'?input:{};
  const minuteMin=integer(s.minuteMin,CAR31_DEFAULT_CONFIG.minuteMin,1,119);
  const minuteMax=integer(s.minuteMax,CAR31_DEFAULT_CONFIG.minuteMax,minuteMin,120);
  const oddsMin=bounded(s.oddsMin,CAR31_DEFAULT_CONFIG.oddsMin,1.01,100,.01);
  const ahMin=bounded(s.ahMin,CAR31_DEFAULT_CONFIG.ahMin,-5,5,.25);
  return {
    engineMode:'SHADOW', side:enumValue(s.side,['HOME','AWAY','BOTH'],CAR31_DEFAULT_CONFIG.side), minuteMin, minuteMax,
    market:enumValue(s.market,['WIN','AH','OU'],CAR31_DEFAULT_CONFIG.market), oddsMin, oddsMax:optional(s.oddsMax,oddsMin,100,.01),
    ahMin, ahMax:optional(s.ahMax,ahMin,5,.25), ouDirection:enumValue(s.ouDirection,['OVER','UNDER'],CAR31_DEFAULT_CONFIG.ouDirection),
    ouLine:bounded(s.ouLine,CAR31_DEFAULT_CONFIG.ouLine,.5,8.5,.25), momentumMin:integer(s.momentumMin,CAR31_DEFAULT_CONFIG.momentumMin,1,99),
    momentumWeights:normalizeWeights(s.momentumWeights||{}),
    attackEvidenceEnabled:bool(s.attackEvidenceEnabled,CAR31_DEFAULT_CONFIG.attackEvidenceEnabled), attackEvidenceDetailedConfigured:true,
    attackEvidenceDangerousAttacksEnabled:bool(s.attackEvidenceDangerousAttacksEnabled,true), attackEvidenceDangerousAttacksMin:integer(s.attackEvidenceDangerousAttacksMin,1,1,999),
    attackEvidenceShotsEnabled:bool(s.attackEvidenceShotsEnabled,true), attackEvidenceShotsMin:integer(s.attackEvidenceShotsMin,1,1,999),
    attackEvidenceShotsOnTargetEnabled:bool(s.attackEvidenceShotsOnTargetEnabled,true), attackEvidenceShotsOnTargetMin:integer(s.attackEvidenceShotsOnTargetMin,1,1,999),
    attackEvidenceCornersEnabled:bool(s.attackEvidenceCornersEnabled,true), attackEvidenceCornersMin:integer(s.attackEvidenceCornersMin,1,1,999),
    attackEvidenceRequirement:enumValue(s.attackEvidenceRequirement,['1','2','3','ALL'],'1'),
    goalGapLimited:bool(s.goalGapLimited,CAR31_DEFAULT_CONFIG.goalGapLimited), maxGoalGap:integer(s.maxGoalGap,CAR31_DEFAULT_CONFIG.maxGoalGap,0,20),
    confirmationRounds:integer(s.confirmationRounds,CAR31_DEFAULT_CONFIG.confirmationRounds,1,10), signalLimitEnabled:bool(s.signalLimitEnabled,CAR31_DEFAULT_CONFIG.signalLimitEnabled),
    maxSignalsPerDay:integer(s.maxSignalsPerDay,CAR31_DEFAULT_CONFIG.maxSignalsPerDay,1,100),
    sourcePrimary:CAR31_SOURCE_MODE.primary, sourceFallback:'OFF', sourceBackup:'OFF',
    sourceRefreshSeconds:integer(s.sourceRefreshSeconds,CAR31_DEFAULT_CONFIG.sourceRefreshSeconds,10,300), sourceFreshnessMaxSeconds:integer(s.sourceFreshnessMaxSeconds,CAR31_DEFAULT_CONFIG.sourceFreshnessMaxSeconds,15,600),
    matchConfidenceMin:integer(s.matchConfidenceMin,CAR31_DEFAULT_CONFIG.matchConfidenceMin,50,100), requireCoreStats:bool(s.requireCoreStats,CAR31_DEFAULT_CONFIG.requireCoreStats),
    apiVerifyPolicy:'OFF', dataConflictPolicy:'PASS', trendWindowMinutes:integer(s.trendWindowMinutes,CAR31_DEFAULT_CONFIG.trendWindowMinutes,3,60),
    chartHistoryMinutes:integer(s.chartHistoryMinutes,CAR31_DEFAULT_CONFIG.chartHistoryMinutes,5,120), pressureSpikeEnabled:bool(s.pressureSpikeEnabled,CAR31_DEFAULT_CONFIG.pressureSpikeEnabled),
    pressureSpikeMin:integer(s.pressureSpikeMin,CAR31_DEFAULT_CONFIG.pressureSpikeMin,1,100), redCardPolicy:enumValue(s.redCardPolicy,['ALLOW','REJECT_SELECTED','REJECT_ANY'],CAR31_DEFAULT_CONFIG.redCardPolicy),
    maxSourceMismatchPercent:integer(s.maxSourceMismatchPercent,CAR31_DEFAULT_CONFIG.maxSourceMismatchPercent,0,100)
  };
}

export function enabledEvidenceRules(config){
  return [
    ['dangerous_attacks',config.attackEvidenceDangerousAttacksEnabled,config.attackEvidenceDangerousAttacksMin],
    ['shots',config.attackEvidenceShotsEnabled,config.attackEvidenceShotsMin],
    ['shots_on_target',config.attackEvidenceShotsOnTargetEnabled,config.attackEvidenceShotsOnTargetMin],
    ['corners',config.attackEvidenceCornersEnabled,config.attackEvidenceCornersMin]
  ].filter(([,on])=>Boolean(on)).map(([key,,minimum])=>({key,minimum}));
}
export function validateCar31Config(input={}){
  const config=normalizeCar31Config(input), errors=[], warnings=[], enabled=enabledEvidenceRules(config);
  if(config.attackEvidenceEnabled&&enabled.length===0) errors.push('Attack Evidence เปิดอยู่ แต่ไม่มี Evidence sub-condition เปิดใช้งาน');
  if(config.attackEvidenceEnabled&&config.attackEvidenceRequirement!=='ALL'&&Number(config.attackEvidenceRequirement)>enabled.length) errors.push(`Evidence ต้องผ่าน ${config.attackEvidenceRequirement} เงื่อนไข แต่เปิดอยู่เพียง ${enabled.length} เงื่อนไข`);
  if(config.sourceRefreshSeconds<20) warnings.push('Refresh ต่ำกว่า 20 วินาทีเป็นโหมดทดลอง ต้องตรวจ load ก่อนใช้งานจริง');
  if(config.market==='AH'&&config.ahMax!==null&&config.ahMax<config.ahMin) errors.push('AH Line สูงสุดต้องไม่น้อยกว่าค่าขั้นต่ำ');
  if(config.oddsMax!==null&&config.oddsMax<config.oddsMin) errors.push('Odds สูงสุดต้องไม่น้อยกว่าค่าขั้นต่ำ');
  return {ok:errors.length===0,errors,warnings,config};
}
export function configSummary(input={}){
  const c=normalizeCar31Config(input), e=enabledEvidenceRules(c);
  const ev=!c.attackEvidenceEnabled?'Evidence OFF':`${c.attackEvidenceRequirement==='ALL'?'ALL':`≥${c.attackEvidenceRequirement}`} of ${e.length} evidence rules`;
  const market=c.market==='OU'?`${c.ouDirection} ${c.ouLine}`:c.market;
  return `${c.side} · ${c.minuteMin}-${c.minuteMax}' · ${market} · odds ≥${c.oddsMin.toFixed(2)} · Momentum ≥${c.momentumMin}% · ${ev}`;
}
