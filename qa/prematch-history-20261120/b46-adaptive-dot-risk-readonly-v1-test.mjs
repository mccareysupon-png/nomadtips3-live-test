// BALL46 TEST ONLY - Dot Adaptive Risk Supervisor read projection.
// This module has no credential, external fetch, order, payment, or mutation operation.
// DB / DO instance must be handed in by the already authenticated Worker.
import {FORMULAS} from './b46-adaptive-ou-patterns-v1-test.mjs';
const n=v=>Number(v),round=v=>Math.round(v*100000000)/100000000;
const query=(db,s,...a)=>Array.from(db.exec(s,...a));
const MAX_AGE_SEC=35*60;
const statusOf=r=>r?.status==='WIN'?'WIN':r?.status==='LOSS'?'LOSS':null;
function verified(r){
 return statusOf(r)!==null&&Number.isInteger(n(r.hg))&&n(r.hg)>=0&&
 Number.isInteger(n(r.ag))&&n(r.ag)>=0&&n(r.result_observed_at)>0&&
 n(r.settled_at)>0&&typeof r.result_source==='string'&&r.result_source.trim().length>0&&
 Number.isFinite(n(r.net_units));
}
function equity(rows,since=0){
 let profit=0,peak=0,maxDD=0,wins=0,losses=0;
 for(const r of rows){
  if(n(r.settled_at)<since)continue;
  profit=round(profit+n(r.net_units));peak=Math.max(peak,profit);
  maxDD=Math.max(maxDD,round(peak-profit));
  if(r.status==='WIN')wins++;else if(r.status==='LOSS')losses++;
 }
 return {wins,losses,settled:wins+losses,profitLoss:profit,currentDD:round(Math.max(0,peak-profit)),maxDD:round(maxDD)};
}
function unavailable(code,now,cron,run,why){
 return {code:'B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST',status:code,readOnly:true,
  asOf:new Date(now*1000).toISOString(),reason:why,formulas:null,summary:null,
  freshness:{workerLastRunAt:run?.at??null,cronCompletedAt:cron?.completedAt??null,
   maxAgeSeconds:MAX_AGE_SEC},source:'TEST_WORKER_DURABLE_OBJECT',productionWrites:0};
}
export function buildAdaptiveDotReadReport(db,now,{cron,run}={}){
 if(!cron||cron.origin!=='CLOUDFLARE_SCHEDULED_15M'||cron.status!=='SUCCESS'||
    cron.riskGuardBefore?.checked!==42||cron.riskGuardAfter?.checked!==42)
  return unavailable('UNAVAILABLE',now,cron,run,'CRON_RISK_GUARD_EXECUTION_UNVERIFIED');
 if(!run||!Number.isFinite(Date.parse(run.at)))
  return unavailable('UNAVAILABLE',now,cron,run,'WORKER_RUN_TIMESTAMP_MISSING');
 const lastRun=Math.floor(Date.parse(run.at)/1000);
 const cronAt=n(cron.completedAt);
 if(!Number.isFinite(cronAt)||cronAt<=0||lastRun<=0||cronAt>now+60||lastRun>now+60)
  return unavailable('UNAVAILABLE',now,cron,run,'INVALID_RUNTIME_TIMESTAMPS');
 if(now-cronAt>MAX_AGE_SEC||now-lastRun>MAX_AGE_SEC)
  return unavailable('STALE',now,cron,run,'CRON_OR_WORKER_EXCEEDED_FRESHNESS_WINDOW');
 const policies=query(db,"SELECT formula_id,mode,auto_enabled,dd_limit,min_settled,risk_started_at,updated_at FROM b46_adaptive_formula_control_test ORDER BY formula_id");
 if(policies.length!==FORMULAS.length||policies.some(p=>!FORMULAS.includes(p.formula_id)))
  return unavailable('UNAVAILABLE',now,cron,run,'FORMULA_POLICY_COUNT_OR_ID_INVALID');
 const all=query(db,"SELECT formula_id,selection,status,hg,ag,net_units,picked_at,settled_at,result_observed_at,result_source FROM b46_adaptive_ou_research_v1_ledger_test ORDER BY settled_at ASC,picked_at ASC,formula_id ASC,selection ASC");
 const groups=new Map(FORMULAS.map(f=>[f,[]]));
 for(const r of all){if(!groups.has(r.formula_id))return unavailable('UNAVAILABLE',now,cron,run,'UNKNOWN_FORMULA_IN_LEDGER');groups.get(r.formula_id).push(r)}
 const pauses=query(db,"SELECT formula_id,at,from_mode,to_mode FROM b46_adaptive_formula_control_audit_test WHERE to_mode IN ('PAUSED_MANUAL','PAUSED_AUTO') AND from_mode<>to_mode ORDER BY at DESC,id DESC");
 const lastPause=new Map();for(const p of pauses){if(!lastPause.has(p.formula_id))lastPause.set(p.formula_id,p)}
 const formulas=[];
 for(const p of policies){
  const rows=groups.get(p.formula_id),allSettled=rows.filter(r=>statusOf(r)),bad=allSettled.filter(r=>!verified(r));
  const good=allSettled.filter(verified);
  const allTime=equity(good);
  const risk=equity(good,n(p.risk_started_at));
  const paused=p.mode!=='RUN';
  const pauseAt=paused?n(lastPause.get(p.formula_id)?.at)||null:null;
  const shadow=(paused&&pauseAt!==null)?equity(good.filter(r=>n(r.picked_at)>=pauseAt)) : null;
  const lastSourceAt=Math.max(0,...rows.map(r=>Math.max(n(r.picked_at)||0,n(r.result_observed_at)||0)));
  const quality=bad.length?'FT_EVIDENCE_INCOMPLETE':allSettled.length?'VERIFIED_FT':'NO_SETTLED_RESULTS';
  formulas.push({
   formula:p.formula_id,mode:p.mode,autoStopEnabled:!!n(p.auto_enabled),
   ddLimitU:n(p.dd_limit),minSettled:n(p.min_settled),riskEpochAt:n(p.risk_started_at)||null,
   wins:bad.length?null:allTime.wins,losses:bad.length?null:allTime.losses,
   verifiedFTSettled:good.length,pending:rows.filter(r=>r.status==='PENDING').length,
   totalRecorded:rows.length,winRatePct:bad.length||!good.length?null:round(100*allTime.wins/good.length),
   profitLossU:bad.length?null:allTime.profitLoss,
   currentDDU:bad.length?null:risk.currentDD,
   maxDDU:bad.length?null:allTime.maxDD,
   currentRiskEpochMaxDDU:bad.length?null:risk.maxDD,
   settledInRiskEpoch:bad.length?null:risk.settled,
   shadowAfterPause:paused?(pauseAt===null?null:{
      since:new Date(pauseAt*1000).toISOString(),
      newSelectionsSettled:bad.length?null:shadow.settled,
      wins:bad.length?null:shadow.wins,losses:bad.length?null:shadow.losses,
      profitLossU:bad.length?null:shadow.profitLoss,
      note:'ONLY_RESEARCH_SELECTIONS_PICKED_WHILE_PAUSED'}):null,
   lastEvidenceAt:lastSourceAt?new Date(lastSourceAt*1000).toISOString():null,
   dataQuality:quality,unverifiedFTRecords:bad.length,
   sampleStatus:rows.length?'HAS_OBSERVATIONS':'NO_OBSERVATIONS'
  });
 }
 const badFormulas=formulas.filter(f=>f.unverifiedFTRecords>0);
 if(badFormulas.length){
  const response=unavailable('DATA_QUALITY_ERROR',now,cron,run,'FT_EVIDENCE_INCOMPLETE');
  response.affectedFormulas=badFormulas.map(f=>({formula:f.formula,unverifiedFTRecords:f.unverifiedFTRecords}));
  return response;
 }
 const age=now-cronAt,runAge=now-lastRun;
 return {code:'B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST',status:'OK',readOnly:true,
  asOf:new Date(now*1000).toISOString(),source:'TEST_WORKER_DURABLE_OBJECT',
  freshness:{workerLastRunAt:run.at,workerAgeSeconds:runAge,
   cronStartedAt:new Date(n(cron.startedAt)*1000).toISOString(),
   cronCompletedAt:new Date(cronAt*1000).toISOString(),
   cronAgeSeconds:age,cronSource:cron.origin,maxAgeSeconds:MAX_AGE_SEC,
   cronRiskGuardBefore:cron.riskGuardBefore,cronRiskGuardAfter:cron.riskGuardAfter,
   cronInvocationId:cron.invocationId},
  summary:{totalFormulas:formulas.length,running:formulas.filter(f=>f.mode==='RUN').length,
   pausedManual:formulas.filter(f=>f.mode==='PAUSED_MANUAL').length,
   pausedAuto:formulas.filter(f=>f.mode==='PAUSED_AUTO').length,
   autoStopEnabled:formulas.filter(f=>f.autoStopEnabled).length,
   verifiedFTDecisions:formulas.reduce((a,f)=>a+f.verifiedFTSettled,0),
   recordedObservations:formulas.reduce((a,f)=>a+f.totalRecorded,0),
   shadowSelectionSettled:formulas.filter(f=>f.shadowAfterPause).reduce((a,f)=>a+f.shadowAfterPause.newSelectionsSettled,0)},
  formulas,providerCalls:0,productionWrites:0,
  limitations:'RESEARCH_RESULTS_PER_FORMULA_CORRELATED_NOT_REAL_PORTFOLIO_PL'};
}
export const DOT_READ_MAX_AGE_SEC=MAX_AGE_SEC;
