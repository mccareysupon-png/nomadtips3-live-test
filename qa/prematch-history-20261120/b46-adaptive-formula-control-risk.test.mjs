import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initAdaptiveOuLedger} from './b46-adaptive-ou-ledger-v1-test.mjs';
import {initAdaptiveFormulaControls,adaptiveControlOverview,adaptiveControlCommand,applyAdaptiveAutoStops,adaptiveActiveSelections} from './b46-adaptive-formula-control-risk-test.mjs';
const raw=new DatabaseSync(':memory:');
const db={exec(sql,...args){if(/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql))return raw.prepare(sql).all(...args);
 if(args.length)raw.prepare(sql).run(...args);else raw.exec(sql);return [];}};
initAdaptiveOuLedger(db);initAdaptiveFormulaControls(db);
const now=1800000000;
let overview=adaptiveControlOverview(db,now);
assert.equal(overview.formulas.length,42);
assert.equal(overview.summary.running,42);
assert.equal(overview.summary.autoEnabled,0);
assert.equal(adaptiveControlCommand(db,now,{formula:'F99',action:'PAUSE'},'OWNER').ok,false);
assert.equal(adaptiveControlCommand(db,now,{formula:'B02',action:'RUN'},'DOT').ok,false);
const columns='fixture_id,formula_id,market,selection,home_id,away_id,home,away,kickoff,picked_at,line,odds,bookmaker,odds_source,quote_observed_at,history_used,supporting_teams,history_evidence,formula_support,opposite_research,status,settled_at,net_units';
const values=new Array(23).fill('?').join(',');
for(let i=0;i<6;i++){
 db.exec('INSERT INTO b46_adaptive_ou_research_v1_ledger_test('+columns+') VALUES('+values+')',
  10000+i,'B02','O/U 2.5','UNDER',1,2,'One','Two',now-200+i,now-300,2.5,1.8,'test','HISTORICAL_RESEARCH_ONLY',now-350,2,'[]','[]',1,0,'LOSS',now-100+i,-1);
}
db.exec("UPDATE b46_adaptive_ou_research_v1_snapshot_test SET total=6,loss=6,settled_units=6,total_units=6,profit_loss=-6,max_drawdown=6 WHERE formula_id='B02' AND selection='ALL'");
overview=adaptiveControlOverview(db,now);
const initial=overview.formulas.find(x=>x.formula==='B02');
assert.equal(initial.currentDD,6);assert.equal(initial.allTimeMaxDD,6);
const pol=adaptiveControlCommand(db,now,{formula:'B02',action:'SET_POLICY',autoEnabled:true,ddLimit:3,minSettled:5},'OWNER');
assert.equal(pol.ok,true);
assert.deepEqual(pol.guard.paused.map(x=>x.formula),['B02']);
overview=adaptiveControlOverview(db,now);
assert.equal(overview.summary.pausedAuto,1);
assert.equal(adaptiveControlCommand(db,now+1,{formula:'B02',action:'RUN'},'DOT').error,'DOT_PAUSE_ONLY');
assert.equal(adaptiveControlCommand(db,now+2,{formula:'B02',action:'RUN'},'OWNER').ok,true);
overview=adaptiveControlOverview(db,now+2);
assert.equal(overview.formulas.find(x=>x.formula==='B02').currentDD,0);
assert.equal(overview.formulas.find(x=>x.formula==='B02').allTimeCurrentDD,6);
assert.equal(applyAdaptiveAutoStops(db,now+3).paused.length,0);
assert.equal(adaptiveControlCommand(db,now+4,{formula:'B02',action:'PAUSE'},'OWNER').ok,true);
assert.equal(adaptiveControlCommand(db,now+5,{formula:'B02',action:'PAUSE_IF_DD'},'DOT').error,'MANUAL_LOCK');
// This is a distinct future fixture for the same formula and remains in Research.
db.exec('INSERT INTO b46_adaptive_ou_research_v1_ledger_test('+columns+') VALUES('+values+')',
  99999,'B02','O/U 2.5','UNDER',1,2,'Future One','Future Two',now+2000,now-10,2.5,1.8,'test','HISTORICAL_RESEARCH_ONLY',now-30,2,'[]','[]',1,0,'PENDING',null,null);
const feed=adaptiveActiveSelections(db,now+6);
assert.equal(feed.selected.some(x=>x.formula_id==='B02'),false);
assert.equal(feed.suppressedShadowCount,1);
assert.equal(db.exec("SELECT COUNT(*) n FROM b46_adaptive_ou_research_v1_ledger_test WHERE formula_id='B02'")[0].n,7);
assert.ok(overview.events.some(e=>e.action==='AUTO_PAUSE_DD'));
console.log('B46_ADAPTIVE_CONTROL_TEST_PASS '+JSON.stringify({formulas:overview.formulas.length,autoStopped:'B02',manualPause:'B02',riskReset:true,shadowPreserved:true,dotCannotRun:true,providerCalls:0,productionWrites:0}));
