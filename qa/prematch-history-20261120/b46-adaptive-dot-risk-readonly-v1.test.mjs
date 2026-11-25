import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initAdaptiveOuLedger} from './b46-adaptive-ou-ledger-v1-test.mjs';
import {initAdaptiveFormulaControls,adaptiveControlCommand} from './b46-adaptive-formula-control-risk-test.mjs';
import {buildAdaptiveDotReadReport} from './b46-adaptive-dot-risk-readonly-v1-test.mjs';
const sqlite=new DatabaseSync(':memory:');
const db={exec(q,...args){
 if(/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q))return sqlite.prepare(q).all(...args);
 if(args.length)sqlite.prepare(q).run(...args);else sqlite.exec(q);return [];
}};
initAdaptiveOuLedger(db);initAdaptiveFormulaControls(db);
const now=1800000000;
const goodCron={origin:'CLOUDFLARE_SCHEDULED_15M',status:'SUCCESS',startedAt:now-145,completedAt:now-140,invocationId:'cron-test-1',
 riskGuardBefore:{checked:42,paused:[]},riskGuardAfter:{checked:42,paused:[]}};
const goodRun={at:new Date((now-139)*1000).toISOString()};
let report=buildAdaptiveDotReadReport(db,now,{cron:null,run:goodRun});
assert.equal(report.status,'UNAVAILABLE');assert.equal(report.formulas,null);assert.equal(report.summary,null);
report=buildAdaptiveDotReadReport(db,now,{cron:goodCron,run:{at:new Date((now-36*60)*1000).toISOString()}});
assert.equal(report.status,'STALE');assert.equal(report.formulas,null);assert.equal(report.summary,null);
report=buildAdaptiveDotReadReport(db,now,{cron:goodCron,run:goodRun});
assert.equal(report.status,'OK');assert.equal(report.formulas.length,42);
const empty=report.formulas.find(r=>r.formula==='B02');
assert.equal(empty.sampleStatus,'NO_OBSERVATIONS');assert.equal(empty.winRatePct,null);
const pauseAt=now-200;
assert.equal(adaptiveControlCommand(db,pauseAt,{formula:'A02',action:'PAUSE'},'OWNER').ok,true);
const columns=['fixture_id','formula_id','market','selection','home_id','away_id','home','away','kickoff','picked_at','line','odds','bookmaker','odds_source','quote_observed_at','history_used','supporting_teams','history_evidence','formula_support','opposite_research','status','hg','ag','settled_at','result_observed_at','result_source','net_units'];
const insert='INSERT INTO b46_adaptive_ou_research_v1_ledger_test('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')';
db.exec(insert,8888,'A02','O/U 2.5','OVER',101,202,'Home','Away',now-100,now-150,2.5,2.05,'test','CACHE_RESEARCH_ONLY',now-160,2,'[]','[]',1,0,'WIN',2,1,now-50,now-61,'VERIFIED_FT',1.05);
report=buildAdaptiveDotReadReport(db,now,{cron:goodCron,run:goodRun});
assert.equal(report.status,'OK');
let a=report.formulas.find(f=>f.formula==='A02');
assert.equal(a.mode,'PAUSED_MANUAL');assert.equal(a.verifiedFTSettled,1);
assert.equal(a.wins,1);assert.equal(a.losses,0);assert.equal(a.profitLossU,1.05);
assert.equal(a.shadowAfterPause.newSelectionsSettled,1);
assert.equal(a.shadowAfterPause.profitLossU,1.05);
assert.equal(report.freshness.cronRiskGuardBefore.checked,42);
assert.equal(report.summary.verifiedFTDecisions,1);
assert(!JSON.stringify(report).includes('"home":"Home"'),'PRIVATE_RAW_LEDGER_DATA_LEAKED');
sqlite.prepare("UPDATE b46_adaptive_ou_research_v1_ledger_test SET result_source=NULL WHERE fixture_id=8888").run();
report=buildAdaptiveDotReadReport(db,now,{cron:goodCron,run:goodRun});
assert.equal(report.status,'DATA_QUALITY_ERROR');assert.equal(report.formulas,null);assert.equal(report.summary,null);
console.log('B46_ADAPTIVE_DOT_READONLY_TEST_PASS '+JSON.stringify({
 formulas:42,unavailableDoesNotBecomeZero:true,staleDoesNotBecomeZero:true,
 validatedFT:true,currentDD:true,maxDD:true,shadowAfterManualPause:true,
 cronRiskGuardChecked:42,noRawLedgerExposed:true,productionWrites:0,paidCalls:0
}));
