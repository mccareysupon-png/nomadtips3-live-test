// BALL46 TEST-ONLY adaptive 42-formula result revision journal.
// Prediction, selection, bookmaker and locked odds are NEVER altered.
// Reconcile only newer, verified FT. Reverse old settled deltas, apply corrected
// deltas to isolated persisted formula snapshots and original settlement day.
import {londonAccountingWindow} from './london-cutoff.mjs';
const all=(db,q,...a)=>Array.from(db.exec(q,...a));
const money=n=>Math.round(n*100000000)/100000000;
export function initAdaptiveEventJournal(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_adaptive_ou_research_v1_event_test(fixture_id INTEGER NOT NULL,formula_id TEXT NOT NULL,market TEXT NOT NULL,selection TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('WIN','LOSS')),hg INTEGER NOT NULL,ag INTEGER NOT NULL,settled_at INTEGER NOT NULL,result_observed_at INTEGER NOT NULL,result_source TEXT NOT NULL,net_units REAL NOT NULL,revision INTEGER NOT NULL DEFAULT 1,indexed_at INTEGER NOT NULL,PRIMARY KEY(fixture_id,formula_id,market,selection))");
 db.exec("CREATE TABLE IF NOT EXISTS b46_adaptive_ou_research_v1_event_log_test(id INTEGER PRIMARY KEY AUTOINCREMENT,fixture_id INTEGER NOT NULL,formula_id TEXT NOT NULL,market TEXT NOT NULL,selection TEXT NOT NULL,revision INTEGER NOT NULL,old_score TEXT,old_status TEXT,old_units REAL,new_score TEXT NOT NULL,new_status TEXT NOT NULL,new_units REAL NOT NULL,observed_at INTEGER NOT NULL,indexed_at INTEGER NOT NULL,UNIQUE(fixture_id,formula_id,market,selection,revision))");
 db.exec("CREATE INDEX IF NOT EXISTS b46_adaptive_ou_research_v1_event_revision_idx ON b46_adaptive_ou_research_v1_event_test(indexed_at,revision)");
 // Backfill only the journal for pre-existing settled rows (one-time,
 // idempotent). Snapshots were already applied by the previous engine.
 db.exec("INSERT OR IGNORE INTO b46_adaptive_ou_research_v1_event_test(fixture_id,formula_id,market,selection,status,hg,ag,settled_at,result_observed_at,result_source,net_units,revision,indexed_at) SELECT fixture_id,formula_id,market,selection,status,hg,ag,settled_at,result_observed_at,result_source,net_units,1,settled_at FROM b46_adaptive_ou_research_v1_ledger_test WHERE status IN ('WIN','LOSS') AND hg>=0 AND ag>=0 AND settled_at IS NOT NULL");
}
export function recordAdaptiveFirstOutcome(db,p,ft,status,net,now){
 db.exec("INSERT INTO b46_adaptive_ou_research_v1_event_test(fixture_id,formula_id,market,selection,status,hg,ag,settled_at,result_observed_at,result_source,net_units,revision,indexed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
  p.fixture_id,p.formula_id,p.market,p.selection,status,ft.hg,ft.ag,now,ft.observed,ft.source,net,1,now);
 db.exec("INSERT INTO b46_adaptive_ou_research_v1_event_log_test(fixture_id,formula_id,market,selection,revision,old_score,old_status,old_units,new_score,new_status,new_units,observed_at,indexed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
  p.fixture_id,p.formula_id,p.market,p.selection,1,null,null,null,ft.hg+'-'+ft.ag,status,net,ft.observed,now);
}
function correctedSnapshot(db,formula,side,oldStatus,newStatus,delta,now){
 const row=all(db,"SELECT win,loss,profit_loss FROM b46_adaptive_ou_research_v1_snapshot_test WHERE formula_id=? AND selection=?",formula,side)[0];
 if(!row)throw Error('ADAPTIVE_REVISION_MISSING_SNAPSHOT');
 const win=Number(row.win)+Number(newStatus==='WIN')-Number(oldStatus==='WIN');
 const loss=Number(row.loss)+Number(newStatus==='LOSS')-Number(oldStatus==='LOSS');
 if(win<0||loss<0)throw Error('ADAPTIVE_REVISION_NEGATIVE_SNAPSHOT');
 db.exec("UPDATE b46_adaptive_ou_research_v1_snapshot_test SET win=?,loss=?,profit_loss=?,updated_at=? WHERE formula_id=? AND selection=?",
  win,loss,money(Number(row.profit_loss)+delta),now,formula,side);
}
function correctedDay(db,p,oldStatus,nextStatus,delta){
 const day=londonAccountingWindow(p.settled_at).businessDay;
 const row=all(db,"SELECT win,loss,net_units FROM b46_adaptive_ou_research_v1_daily_test WHERE formula_id=? AND business_day=?",p.formula_id,day)[0];
 if(!row)throw Error('ADAPTIVE_REVISION_MISSING_SETTLEMENT_DAY');
 const win=Number(row.win)+Number(nextStatus==='WIN')-Number(oldStatus==='WIN');
 const loss=Number(row.loss)+Number(nextStatus==='LOSS')-Number(oldStatus==='LOSS');
 if(win<0||loss<0)throw Error('ADAPTIVE_REVISION_DAILY_NEGATIVE');
 db.exec("UPDATE b46_adaptive_ou_research_v1_daily_test SET win=?,loss=?,net_units=? WHERE formula_id=? AND business_day=?",
  win,loss,money(Number(row.net_units)+delta),p.formula_id,day);
}
function rebuildDrawdown(db,formula,side,now){
 const wh=side==='ALL'?'':" AND selection=?";
 const args=side==='ALL'?[formula]:[formula,side];
 const ordered=all(db,"SELECT net_units FROM b46_adaptive_ou_research_v1_ledger_test WHERE formula_id=? AND status IN ('WIN','LOSS')"+wh+
  " ORDER BY settled_at ASC,fixture_id ASC,selection ASC",...args);
 let equity=0,peak=0,maxDD=0;
 for(const {net_units} of ordered){
  equity=money(equity+Number(net_units));
  peak=Math.max(peak,equity);
  maxDD=Math.max(maxDD,peak-equity);
 }
 const row=all(db,"SELECT profit_loss,settled_units FROM b46_adaptive_ou_research_v1_snapshot_test WHERE formula_id=? AND selection=?",formula,side)[0];
 if(Math.abs(Number(row.profit_loss)-equity)>1e-6||Number(row.settled_units)!==ordered.length)
  throw Error('ADAPTIVE_REVISION_EQUITY_LEDGER_DRIFT_'+formula+'_'+side);
 db.exec("UPDATE b46_adaptive_ou_research_v1_snapshot_test SET peak_units=?,max_drawdown=?,updated_at=? WHERE formula_id=? AND selection=?",
  money(peak),money(maxDD),now,formula,side);
}
export function reconcileAdaptiveFtRevisions(db,now,{snapshot=null,verifyFt,windowDays=90,limit=4500}={}){
 if(!Number.isSafeInteger(now)||typeof verifyFt!=='function'||!Number.isInteger(windowDays)||windowDays<1)
  throw Error('ADAPTIVE_REVISION_BAD_PARAMS');
 const rows=all(db,"SELECT * FROM b46_adaptive_ou_research_v1_ledger_test WHERE status IN ('WIN','LOSS') AND kickoff>=? AND kickoff<? ORDER BY result_observed_at DESC LIMIT ?",now-windowDays*86400,now,limit);
 let checked=0,corrections=0,changedOutcomes=0,unverified=0;
 const dirty=new Set();
 const verifiedByFixture=new Map();
 db.transaction(()=>{
  for(const p of rows){
   checked++;
   let ft=verifiedByFixture.get(p.fixture_id);
   if(ft===undefined){
    ft=verifyFt(db,p,now,snapshot)??null;
    verifiedByFixture.set(p.fixture_id,ft);
   }
   if(!ft){unverified++;continue}
   if(!Number.isSafeInteger(p.result_observed_at)||ft.observed<=p.result_observed_at)continue;
   if(ft.hg===p.hg&&ft.ag===p.ag)continue;
   const nextStatus=p.selection==='OVER'?
    (ft.hg+ft.ag>=3?'WIN':'LOSS'):(ft.hg+ft.ag<=2?'WIN':'LOSS');
   const nextUnits=money(nextStatus==='WIN'?p.odds-1:-1);
   const delta=money(nextUnits-Number(p.net_units));
   const oldStatus=p.status,oldScore=p.hg+'-'+p.ag;
   const journal=all(db,"SELECT * FROM b46_adaptive_ou_research_v1_event_test WHERE fixture_id=? AND formula_id=? AND market=? AND selection=?",p.fixture_id,p.formula_id,p.market,p.selection)[0];
   if(!journal||journal.status!==oldStatus||journal.hg!==p.hg||journal.ag!==p.ag||
    Math.abs(Number(journal.net_units)-Number(p.net_units))>1e-7)
    throw Error('ADAPTIVE_REVISION_JOURNAL_SOURCE_MISMATCH');
   db.exec("UPDATE b46_adaptive_ou_research_v1_ledger_test SET status=?,hg=?,ag=?,net_units=?,result_observed_at=?,result_source=? WHERE fixture_id=? AND formula_id=? AND market=? AND selection=? AND status=? AND result_observed_at=?",
    nextStatus,ft.hg,ft.ag,nextUnits,ft.observed,ft.source,p.fixture_id,p.formula_id,p.market,p.selection,oldStatus,p.result_observed_at);
   if(Number(all(db,"SELECT changes() AS n")[0].n)!==1)
    throw Error('ADAPTIVE_REVISION_CONCURRENT_SOURCE');
   for(const side of ['ALL',p.selection]){
    correctedSnapshot(db,p.formula_id,side,oldStatus,nextStatus,delta,now);
    dirty.add(p.formula_id+'|'+side);
   }
   correctedDay(db,p,oldStatus,nextStatus,delta);
   const revision=Number(journal.revision)+1;
   db.exec("UPDATE b46_adaptive_ou_research_v1_event_test SET status=?,hg=?,ag=?,result_observed_at=?,result_source=?,net_units=?,revision=?,indexed_at=? WHERE fixture_id=? AND formula_id=? AND market=? AND selection=? AND revision=?",
    nextStatus,ft.hg,ft.ag,ft.observed,ft.source,nextUnits,revision,now,p.fixture_id,p.formula_id,p.market,p.selection,journal.revision);
   if(Number(all(db,'SELECT changes() AS n')[0].n)!==1)throw Error('ADAPTIVE_REVISION_JOURNAL_CONFLICT');
   db.exec("INSERT INTO b46_adaptive_ou_research_v1_event_log_test(fixture_id,formula_id,market,selection,revision,old_score,old_status,old_units,new_score,new_status,new_units,observed_at,indexed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    p.fixture_id,p.formula_id,p.market,p.selection,revision,oldScore,oldStatus,p.net_units,ft.hg+'-'+ft.ag,nextStatus,nextUnits,ft.observed,now);
   corrections++;if(nextStatus!==oldStatus)changedOutcomes++;
  }
  for(const entry of dirty){
   const [f,side]=entry.split('|');rebuildDrawdown(db,f,side,now);
  }
 });
 return {checked,corrections,changedOutcomes,unverified,
  sourceCorrectionsOnly:true,predictionDataMutated:false,
  last90DaysOnly:windowDays===90,providerCalls:0,productionWrites:0};
}
export function readAdaptiveEventJournal(db){
 const rows=all(db,"SELECT COUNT(*) events,COALESCE(SUM(revision-1),0) revisions FROM b46_adaptive_ou_research_v1_event_test")[0];
 const log=all(db,"SELECT fixture_id,formula_id,selection,revision,old_score,new_score,old_status,new_status,old_units,new_units,observed_at,indexed_at FROM b46_adaptive_ou_research_v1_event_log_test ORDER BY id DESC LIMIT 30");
 return {events:Number(rows.events),revisions:Number(rows.revisions),log,providerCalls:0};
}
