// BALL46 TEST ONLY: manual and automatic risk controls for 42 Adaptive O/U 2.5 formulas.
// This controls active eligibility, NOT research sampling. No external API calls or production writes.
import {FORMULAS} from './b46-adaptive-ou-patterns-v1-test.mjs';
import {readAdaptiveStats} from './b46-adaptive-ou-ledger-v1-test.mjs';
const query=(db,q,...args)=>Array.from(db.exec(q,...args));
const money=n=>Math.round((Number(n)||0)*100000000)/100000000;
const validId=id=>typeof id==='string'&&FORMULAS.includes(id);
const LIMIT=50000;
export function initAdaptiveFormulaControls(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_adaptive_formula_control_test(formula_id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'RUN' CHECK(mode IN ('RUN','PAUSED_MANUAL','PAUSED_AUTO')), auto_enabled INTEGER NOT NULL DEFAULT 0, dd_limit REAL NOT NULL DEFAULT 3, min_settled INTEGER NOT NULL DEFAULT 5, risk_started_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL DEFAULT 'SYSTEM')");
 db.exec("CREATE TABLE IF NOT EXISTS b46_adaptive_formula_control_audit_test(id INTEGER PRIMARY KEY AUTOINCREMENT,formula_id TEXT NOT NULL,action TEXT NOT NULL,from_mode TEXT NOT NULL,to_mode TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,at INTEGER NOT NULL,dd_at_action REAL NOT NULL DEFAULT 0,UNIQUE(formula_id,action,at,actor))");
 for(const id of FORMULAS)db.exec("INSERT OR IGNORE INTO b46_adaptive_formula_control_test(formula_id) VALUES(?)",id);
}
function settledRows(db){
 const n=Number(query(db,"SELECT COUNT(*) n FROM b46_adaptive_ou_research_v1_ledger_test WHERE status IN ('WIN','LOSS')")[0]?.n||0);
 if(n>LIMIT)throw Error('RISK_HISTORY_CAPACITY_REVIEW_REQUIRED');
 return query(db,"SELECT formula_id,fixture_id,selection,settled_at,kickoff,net_units,status,home,away FROM b46_adaptive_ou_research_v1_ledger_test WHERE status IN ('WIN','LOSS') ORDER BY settled_at ASC,kickoff ASC,fixture_id ASC,formula_id ASC");
}
function seriesFromRows(records,startAt=0){
 let eq=0,peak=0,maxDD=0,win=0,loss=0;
 const pts=[{t:startAt||0,p:0,dd:0}];
 for(const row of records){
  if(Number(row.settled_at)<startAt)continue;
  const delta=money(row.net_units);
  eq=money(eq+delta);
  peak=Math.max(peak,eq);
  maxDD=Math.max(maxDD,money(peak-eq));
  win+=row.status==='WIN'?1:0;
  loss+=row.status==='LOSS'?1:0;
  pts.push({t:Number(row.settled_at),p:eq,dd:money(peak-eq),fixtureId:Number(row.fixture_id)});
 }
 return {currentDD:money(Math.max(0,peak-eq)),maxDD:money(maxDD),equity:eq,settled:win+loss,points:pts.slice(-181)};
}
function buildIndex(db){
 initAdaptiveFormulaControls(db);
 const saved=query(db,"SELECT * FROM b46_adaptive_formula_control_test ORDER BY formula_id");
 const all=settledRows(db);
 const byId=new Map(FORMULAS.map(id=>[id,[]]));
 for(const r of all)if(byId.has(r.formula_id))byId.get(r.formula_id).push(r);
 return {saved,byId};
}
function viewOf(row,records,summary){
 const lifetime=seriesFromRows(records,0),risk=seriesFromRows(records,Number(row.risk_started_at));
 return {formula:row.formula_id,mode:row.mode,autoEnabled:!!row.auto_enabled,ddLimit:Number(row.dd_limit),minSettled:Number(row.min_settled),riskStartedAt:Number(row.risk_started_at),updatedAt:Number(row.updated_at),updatedBy:row.updated_by,
  currentDD:risk.currentDD,periodMaxDD:risk.maxDD,periodSettled:risk.settled,allTimeCurrentDD:lifetime.currentDD,allTimeMaxDD:lifetime.maxDD,
  wins:summary?.win||0,losses:summary?.loss||0,pending:summary?.pending||0,settled:summary?.settled||0,winRate:summary?.winRate??null,roi:summary?.roi??null,profitLoss:summary?.profitLoss||0,
  eligible:row.mode==='RUN',points:lifetime.points,riskPoints:risk.points};
}
function audit(db,{formula,action,from,to,actor,reason,now,currentDD=0}){
 db.exec("INSERT OR IGNORE INTO b46_adaptive_formula_control_audit_test(formula_id,action,from_mode,to_mode,actor,reason,at,dd_at_action) VALUES(?,?,?,?,?,?,?,?)",
  formula,action,from,to,actor,reason,now,money(currentDD));
}
export function adaptiveControlOverview(db,now){
 const stats=readAdaptiveStats(db,now,{limit:150});
 const ix=buildIndex(db),map=new Map(stats.formulas.map(x=>[x.formula,x]));
 const formulas=ix.saved.map(r=>viewOf(r,ix.byId.get(r.formula_id),map.get(r.formula_id)));
 const events=query(db,"SELECT id,formula_id,action,from_mode,to_mode,actor,reason,at,dd_at_action FROM b46_adaptive_formula_control_audit_test ORDER BY id DESC LIMIT 80");
 const recent=query(db,"SELECT fixture_id,formula_id,selection,line,home,away,kickoff,picked_at,odds,bookmaker,odds_source,status,hg,ag FROM b46_adaptive_ou_research_v1_ledger_test ORDER BY picked_at DESC,fixture_id,formula_id,selection LIMIT 150");
 const latestPickedAt=recent.length?Number(recent[0].picked_at):null;
 const modeByFormula=new Map(formulas.map(f=>[f.formula,f.mode]));
 const latestSignals=recent.filter(r=>Number(r.picked_at)===latestPickedAt).map(r=>({...r,
   eligible:modeByFormula.get(r.formula_id)==='RUN',
   quoteResearchOnly:String(r.odds_source||'').includes('HISTORICAL_RESEARCH_ONLY')}));
 const latestConflicting=new Set(latestSignals.map(r=>r.selection)).size>1;
 return {code:'B46_ADAPTIVE_FORMULA_CONTROL_TEST_V1',testOnly:true,updatedAt:now,source:'ADAPTIVE_RESEARCH_IMMUTABLE_LEDGER',formulas,events,latestPickedAt,latestSignals,latestConflicting,
  summary:{total:formulas.length,running:formulas.filter(x=>x.mode==='RUN').length,pausedManual:formulas.filter(x=>x.mode==='PAUSED_MANUAL').length,pausedAuto:formulas.filter(x=>x.mode==='PAUSED_AUTO').length,autoEnabled:formulas.filter(x=>x.autoEnabled).length},
  activeFeedPolicy:'RUN_ONLY',shadowPolicy:'ALL_42_STILL_COLLECTED',dotConfigured:false,portfolioCombined:false,providerCalls:0,productionWrites:0};
}
export function applyAdaptiveAutoStops(db,now){
 const ix=buildIndex(db),tripped=[];
 for(const r of ix.saved){
  if(r.mode!=='RUN'||!Number(r.auto_enabled))continue;
  const risk=seriesFromRows(ix.byId.get(r.formula_id),Number(r.risk_started_at));
  if(risk.settled<Number(r.min_settled)||risk.currentDD+1e-8<Number(r.dd_limit))continue;
  db.exec("UPDATE b46_adaptive_formula_control_test SET mode='PAUSED_AUTO',updated_at=?,updated_by='RISK_GUARD' WHERE formula_id=? AND mode='RUN'",now,r.formula_id);
  audit(db,{formula:r.formula_id,action:'AUTO_PAUSE_DD',from:'RUN',to:'PAUSED_AUTO',actor:'RISK_GUARD',reason:'CURRENT_DD_LIMIT_REACHED',now,currentDD:risk.currentDD});
  tripped.push({formula:r.formula_id,currentDD:risk.currentDD,limit:Number(r.dd_limit)});
 }
 return {checked:ix.saved.length,paused:tripped,providerCalls:0,productionWrites:0};
}
export function adaptiveControlCommand(db,now,command,actor){
 initAdaptiveFormulaControls(db);
 if(!command||typeof command!=='object'||!validId(command.formula))return {ok:false,error:'INVALID_FORMULA'};
 const id=command.formula,action=command.action;
 const row=query(db,"SELECT * FROM b46_adaptive_formula_control_test WHERE formula_id=?",id)[0];
 if(!row)return {ok:false,error:'FORMULA_NOT_FOUND'};
 const records=settledRows(db).filter(x=>x.formula_id===id);
 const before=seriesFromRows(records,Number(row.risk_started_at));
 if(actor==='DOT'){
  if(action!=='PAUSE_IF_DD')return {ok:false,error:'DOT_PAUSE_ONLY'};
  if(row.mode==='PAUSED_MANUAL')return {ok:false,error:'MANUAL_LOCK'};
  if(!Number(row.auto_enabled))return {ok:false,error:'AUTO_DISABLED'};
  if(row.mode==='PAUSED_AUTO')return {ok:true,unchanged:true,mode:row.mode};
  if(before.settled<Number(row.min_settled)||before.currentDD+1e-8<Number(row.dd_limit))
   return {ok:false,error:'DD_NOT_TRIGGERED',currentDD:before.currentDD,limit:Number(row.dd_limit)};
  db.exec("UPDATE b46_adaptive_formula_control_test SET mode='PAUSED_AUTO',updated_at=?,updated_by='DOT' WHERE formula_id=?",now,id);
  audit(db,{formula:id,action,from:row.mode,to:'PAUSED_AUTO',actor,reason:'VERIFIED_DD_THRESHOLD',now,currentDD:before.currentDD});
 }else{
  if(!['RUN','PAUSE','SET_POLICY'].includes(action))return {ok:false,error:'UNKNOWN_ACTION'};
  if(action==='SET_POLICY'){
   if(typeof command.autoEnabled!=='boolean'||!Number.isFinite(command.ddLimit)||command.ddLimit<0.5||command.ddLimit>100||
     !Number.isInteger(command.minSettled)||command.minSettled<1||command.minSettled>100)
    return {ok:false,error:'INVALID_POLICY'};
   db.exec("UPDATE b46_adaptive_formula_control_test SET auto_enabled=?,dd_limit=?,min_settled=?,updated_at=?,updated_by='OWNER' WHERE formula_id=?",
     Number(command.autoEnabled),command.ddLimit,command.minSettled,now,id);
   audit(db,{formula:id,action,from:row.mode,to:row.mode,actor:'OWNER',reason:'POLICY_UPDATED',now,currentDD:before.currentDD});
   const guard=applyAdaptiveAutoStops(db,now);
   return {ok:true,action,formula:id,guard,providerCalls:0,productionWrites:0};
  }
  if(action==='PAUSE'){
   if(row.mode==='PAUSED_MANUAL')return {ok:true,unchanged:true,mode:row.mode};
   db.exec("UPDATE b46_adaptive_formula_control_test SET mode='PAUSED_MANUAL',updated_at=?,updated_by='OWNER' WHERE formula_id=?",now,id);
   audit(db,{formula:id,action,from:row.mode,to:'PAUSED_MANUAL',actor:'OWNER',reason:'OWNER_MANUAL_PAUSE',now,currentDD:before.currentDD});
  }
  if(action==='RUN'){
   if(row.mode==='RUN')return {ok:true,unchanged:true,mode:row.mode};
   db.exec("UPDATE b46_adaptive_formula_control_test SET mode='RUN',risk_started_at=?,updated_at=?,updated_by='OWNER' WHERE formula_id=?",now,now,id);
   audit(db,{formula:id,action,from:row.mode,to:'RUN',actor:'OWNER',reason:'OWNER_RESUME_NEW_RISK_EPOCH',now,currentDD:before.currentDD});
  }
 }
 return {ok:true,formula:id,action,mode:action==='RUN'?'RUN':actor==='DOT'?'PAUSED_AUTO':'PAUSED_MANUAL',
  providerCalls:0,productionWrites:0};
}
export function adaptiveActiveSelections(db,now){
 const ix=buildIndex(db);
 const modes=Object.fromEntries(ix.saved.map(x=>[x.formula_id,x.mode]));
 const picks=query(db,"SELECT fixture_id,formula_id,selection,home,away,kickoff,picked_at,odds,bookmaker,status FROM b46_adaptive_ou_research_v1_ledger_test WHERE kickoff>? AND status='PENDING' ORDER BY picked_at DESC LIMIT 200",now);
 return {code:'B46_ADAPTIVE_ACTIVE_ELIGIBLE_TEST',selected:picks.filter(x=>modes[x.formula_id]==='RUN'),
  suppressedShadowCount:picks.filter(x=>modes[x.formula_id]!=='RUN').length,
  source:'SHADOW_RESEARCH_LEDGER_CONTROL_FILTER',providerCalls:0,productionWrites:0};
}
