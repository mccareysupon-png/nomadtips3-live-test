import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initBttsHistory} from './btts-history-private.mjs';
import {initOuTargetHistoryFT} from './ou-target-history-ft-v1-test.mjs';
import {FORMULAS,normalizedHistory,evaluateAdaptiveFormulas,screenAdaptiveResearch}
 from './b46-adaptive-ou-patterns-v1-test.mjs';
import {initAdaptiveOuLedger,recordAdaptiveOu,settleAdaptiveOu,readAdaptiveStats,runAdaptiveOu}
 from './b46-adaptive-ou-ledger-v1-test.mjs';
const NOW=1800000000,KO=NOW+7200;
function mk(){
 const raw=new DatabaseSync(':memory:');
 const db={exec(q,...a){if(!a.length&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(q)){raw.exec(q);return []}
  const s=raw.prepare(q);if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return s.all(...a);
  s.run(...a);return []},
  transaction(fn){raw.exec('BEGIN IMMEDIATE');try{const x=fn();raw.exec('COMMIT');return x}
   catch(e){raw.exec('ROLLBACK');throw e}}};
 initBttsHistory(db);initOuTargetHistoryFT(db);
 db.exec("CREATE TABLE result_version(fixture_id INTEGER NOT NULL,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,observed INTEGER NOT NULL,status TEXT NOT NULL)");
 function add(fid,team,hg,ag,time=NOW-50000+fid){
  db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',
   fid,8,time,team,9000+fid,hg,ag,time+50,'finished');
 }
 function fixture(id=7001,home=501,away=502){
  return {id,status:'scheduled',kickoff_ts:KO,league:{id:8,name:'League'},
   teams:{home:{id:home,name:'Alpha'},away:{id:away,name:'Beta'}}}
 }
 return {db,raw,add,fixture};
}
const match=(fid,total,kickoff=NOW-10000-fid)=>({
 fixtureId:fid,kickoff,gf:total,ga:0
});
test('exact 42 registered formulas A02-A10 B02-B10 C03-C10 D03-D10 E03-E10',()=>{
 assert.equal(FORMULAS.length,42);
 assert.equal(new Set(FORMULAS).size,42);
 for(const [group,len,minimum] of [['A',9,2],['B',9,2],['C',8,3],['D',8,3],['E',8,3]]){
  assert.equal(FORMULAS.filter(f=>f.startsWith(group)).length,len);
  assert(FORMULAS.includes(group+String(minimum).padStart(2,'0')));
 }
});
test('two-match opposing streaks, majority tie, alternation, 2-10 scale exactly',()=>{
 const high=normalizedHistory(Array.from({length:10},(_,i)=>match(100+i,3)),KO,NOW);
 assert.equal(evaluateAdaptiveFormulas(high).length,34);
 for(const n of [2,3,4,5,6,7,8,9,10]){
  const f=evaluateAdaptiveFormulas(high.slice(0,n));
  assert(f.some(x=>x.formula==='A'+String(n).padStart(2,'0')&&x.selection==='UNDER'));
  assert(f.some(x=>x.formula==='B'+String(n).padStart(2,'0')&&x.selection==='OVER'));
  assert(f.every(x=>x.historyUsed<=n));
 }
 const low=normalizedHistory(Array.from({length:10},(_,i)=>match(120+i,1)),KO,NOW);
 assert(evaluateAdaptiveFormulas(low).some(x=>x.formula==='A10'&&x.selection==='OVER'));
 assert(evaluateAdaptiveFormulas(low).some(x=>x.formula==='D10'&&x.selection==='UNDER'));
 const alt=normalizedHistory(Array.from({length:10},(_,i)=>match(140+i,i%2?3:1)),KO,NOW);
 for(let n=3;n<=10;n++)assert(evaluateAdaptiveFormulas(alt).some(x=>x.formula==='E'+String(n).padStart(2,'0')));
 const tie=normalizedHistory([match(11,1),match(12,3),match(13,1),match(14,3)],KO,NOW);
 assert(!evaluateAdaptiveFormulas(tie).some(x=>['C04','D04'].includes(x.formula)));
 assert.deepEqual(evaluateAdaptiveFormulas([]),[]);
 assert.deepEqual(evaluateAdaptiveFormulas([match(1,4)]),[]);
});
test('dedup fixture and sort actual FT by kickoff, reject future and bad scores',()=>{
 const r=normalizedHistory([
  match(1,3,NOW-2000),match(1,0,NOW-2000),
  match(2,1,NOW-9000),match(3,10,NOW+500),
  {...match(4,3,NOW-1000),gf:-1}
 ],KO,NOW);
 assert.deepEqual(r.map(x=>x.fixtureId),[1,2]);
 assert.deepEqual(r.map(x=>x.form),['OVER','UNDER']);
});
test('separate team histories never concatenated to fake two-match streak',()=>{
 const {db,raw,add,fixture}=mk();
 try{
  add(101,501,3,0);add(102,502,0,0);
  const s=screenAdaptiveResearch(db,[fixture()],NOW);
  assert.equal(s.counts.historyEligibleFixtures,0);
  assert.equal(s.counts.formulasTriggered,0);
 }finally{raw.close()}
});
test('live real-style 2.5 quote + separate immutable per-formula ledger, snapshot, ROI and drawdown',async()=>{
 const {db,raw,add,fixture}=mk();
 try{
  add(101,501,2,2);add(102,501,3,1);
  add(103,502,1,0);add(104,502,0,2);
  let calls=0;
  const market=async(path,opts)=>{
   calls++;
   assert.equal(path,'/board-cache');
   assert.equal(opts.method,'POST');
   assert.deepEqual(opts.body.fixtureIds,['7001']);
   return {ok:true,externalRequestsAdded:0,entries:{
    '7001':{fullOdds:{fixture_id:7001,bookmakers:[{
     slug:'bet365',odds:{goal_line_fixed:[{
      line:2.5,opening:{over:2,under:1.8},closing:{over:2.05,under:1.85}
     }]}
    }]},fetchedAt:NOW*1000-5000,ageMs:5000,stale:false}
   }};
  };
  const rawPatterns=screenAdaptiveResearch(db,[fixture()],NOW);
  assert.equal(rawPatterns.counts.formulasTriggered,4);
  assert.equal(rawPatterns.counts.conflictingDirectionFixtures,1);
  assert.equal(rawPatterns.formulaCounts.A02.fixtureCount,1);
  assert.equal(rawPatterns.formulaCounts.B02.fixtureCount,1);
  assert.deepEqual(rawPatterns.candidates.map(x=>[x.formula,x.selection]),
   [['A02','OVER'],['A02','UNDER'],['B02','OVER'],['B02','UNDER']]);
  const first=await runAdaptiveOu(db,{fixtures:[fixture()],now:NOW,market});
  assert.equal(calls,1);
  assert.equal(first.priced.fixtures,1);
  assert.equal(first.priced.matchedFormulaSelections,4);
  assert.equal(first.record.added,4);
  assert.equal(first.record.unitsSimulated,4);
  assert.equal(first.record.providerCalls,0);
  assert.equal(first.stats.formulas.length,42);
  const a=first.stats.formulas.find(x=>x.formula==='A02');
  assert.equal(a.totalPredictions,2);
  assert.equal(a.pending,2);
  assert.equal(a.averageOdds,1.95);
  assert.equal(a.profitLoss,0);
  assert.equal(a.roi,null);
  assert.equal(a.maximumDrawdown,0);
  const duplicate=await runAdaptiveOu(db,{fixtures:[fixture()],now:NOW+20,
   market:async()=>({ok:true,externalRequestsAdded:0,entries:{
    '7001':{fullOdds:{fixture_id:7001,bookmakers:[{slug:'bet365',odds:{goal_line_fixed:[
     {line:2.5,opening:{over:2,under:1.8},closing:{over:2.5,under:1.7}}
    ]}}]},fetchedAt:(NOW+20)*1000-5000,ageMs:5000,stale:false}}})});
  assert.equal(duplicate.record.added,0);
  assert.equal(duplicate.record.duplicate,4);
  assert.equal(readAdaptiveStats(db,NOW).records.length,4);
  const immut=readAdaptiveStats(db,NOW).records.find(x=>x.formula_id==='A02'&&x.selection==='OVER');
  assert.equal(immut.odds,2.05);
  db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',7001,8,KO,501,502,1,1,KO+200,'finished');
  const done=settleAdaptiveOu(db,KO+500);
  assert.deepEqual({settled:done.settled,win:done.win,loss:done.loss},{settled:4,win:2,loss:2});
  const after=readAdaptiveStats(db,KO+500);
  const a2=after.formulas.find(x=>x.formula==='A02');
  assert.deepEqual({total:a2.totalPredictions,pending:a2.pending,win:a2.win,loss:a2.loss,
   rate:a2.winRate,avg:a2.averageOdds,units:a2.totalUnits,pnl:a2.profitLoss,roi:a2.roi,drawdown:a2.maximumDrawdown},
   {total:2,pending:0,win:1,loss:1,rate:50,avg:1.95,units:2,pnl:-0.15,roi:-7.5,drawdown:1});
  const over=after.bySelection.find(x=>x.formula==='A02'&&x.selection==='OVER');
  assert.equal(over.win,0);assert.equal(over.loss,1);assert.equal(over.profitLoss,-1);
  assert.equal(settleAdaptiveOu(db,KO+800).settled,0);
  assert.equal(readAdaptiveStats(db,KO+800).formulas.find(x=>x.formula==='A02').settled,2);
  const isolated=raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'b46_adaptive_ou_research_v1_%'").all();
  assert.equal(isolated.length,3);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='b46_ou_v2_snapshot_test'").get().n,0);
 }finally{raw.close()}
});
test('no quote, older than 6h odds, incorrect line or outside 1.40-10 => no price and no pick',async()=>{
 const {db,raw,add,fixture}=mk();
 try{
  add(101,501,2,2);add(102,501,3,1);
  const outputs=[];
  for(const entry of [null,
   {fullOdds:{fixture_id:7001,bookmakers:[{slug:'bet365',odds:{
    goal_line_fixed:[{line:2.5,opening:{over:1.6,under:1.7},closing:{over:1.6,under:1.7}}]
   }}]},fetchedAt:NOW*1000-25200000,ageMs:25200000,stale:true},
   {fullOdds:{fixture_id:7001,bookmakers:[{slug:'bet365',odds:{
    goal_line_fixed:[{line:3.5,opening:{over:1.6,under:1.7},closing:{over:1.6,under:1.7}}]
   }}]},fetchedAt:NOW*1000-5000,ageMs:5000,stale:false},
   {fullOdds:{fixture_id:7001,bookmakers:[{slug:'bet365',odds:{
    goal_line_fixed:[{line:2.5,opening:{over:1.3,under:1.2},closing:{over:1.39,under:10.01}}]
   }}]},fetchedAt:NOW*1000-5000,ageMs:5000,stale:false}]){
   const result=await runAdaptiveOu(db,{fixtures:[fixture()],now:NOW,
    market:async()=>({ok:true,externalRequestsAdded:0,entries:entry?{'7001':entry}:{}})});
   outputs.push(result.record.added);
  }
  assert.deepEqual(outputs,[0,0,0,0]);
  assert.equal(readAdaptiveStats(db,NOW).records.length,0);
 }finally{raw.close()}
});

test('FT via already cached HUB settles the independent research ledger without waiting for HCR cargo',()=>{
 const {db,raw,add,fixture}=mk();
 try{
  add(101,501,2,2);add(102,501,3,1);
  add(103,502,1,0);add(104,502,0,2);
  const cand=screenAdaptiveResearch(db,[fixture()],NOW).candidates;
  assert.equal(cand.length,4);
  const issued=recordAdaptiveOu(db,cand.map(x=>({...x,
   odds:x.selection==='OVER'?1.8:1.7,bookmaker:'bet365',
   oddsSource:'FULL_MARKET_CACHE_GOAL_LINE_FIXED_CLOSING',
   quoteObservedAt:NOW-10})),NOW);
  assert.equal(issued.added,4);
  const ft={fixtureId:7001,home:{id:501},away:{id:502},
   status:'finished',boardState:'finished',statusCode:'full',
   kickoffUtc:new Date(KO*1000).toISOString(),
   goals:{home:2,away:1}};
  const fresh={ok:true,cacheOnly:true,stale:false,
   fetchedAt:(KO+200)*1000,fixtures:[ft]};
  assert.equal(settleAdaptiveOu(db,KO+400,{snapshot:{...fresh,stale:true}}).settled,0);
  assert.equal(settleAdaptiveOu(db,KO+400,{snapshot:{
   ...fresh,fixtures:[{...ft,status:'live'}]}}).settled,0);
  assert.equal(settleAdaptiveOu(db,KO+400,{snapshot:{
   ...fresh,fixtures:[{...ft,away:{id:503}}]}}).settled,0);
  assert.equal(settleAdaptiveOu(db,KO+400,{snapshot:{
   ...fresh,fixtures:[{...ft,kickoffUtc:new Date((KO+60)*1000).toISOString()}]}}).settled,0);
  const settled=settleAdaptiveOu(db,KO+400,{snapshot:fresh});
  assert.equal(settled.settled,4);
  assert.equal(settled.win,2);
  assert.equal(settled.loss,2);
  assert.equal(settled.providerCalls,0);
  const stats=readAdaptiveStats(db,KO+400);
  assert.equal(stats.records.length,4);
  assert(stats.records.every(x=>x.result_source==='HUB_FINISHED_CACHED_VERIFIED'));
  assert.equal(stats.formulas.find(x=>x.formula==='A02').winRate,50);
  assert.equal(stats.formulas.find(x=>x.formula==='A02').profitLoss,-.2);
  assert.equal(stats.formulas.find(x=>x.formula==='A02').roi,-10);
  assert.equal(settleAdaptiveOu(db,KO+500,{snapshot:fresh}).settled,0);
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='b46_ou_v2_snapshot_test'").get().n,0);
 }finally{raw.close()}
});

test('raw O/U 2.5 provider cache from 39 min ago is genuine historical research quote, not a live price',async()=>{
 const {db,raw,add,fixture}=mk();
 try{
  add(101,501,2,2);add(102,501,3,1);add(103,502,1,0);add(104,502,0,2);
  const oldQuoteAt=NOW-2340;
  const payload={fullOdds:{data:{fixture_id:7001,bookmakers:[{
   name:'Bet 365',slug:'bet365',odds:{goal_line_fixed:[{
    line:2.5,opening:{over:1.40,under:2.75},
    closing:{over:2.00,under:1.80}
   }]}
  }]}},stale:true,ageMs:2340000,fetchedAt:oldQuoteAt*1000};
  const out=await runAdaptiveOu(db,{fixtures:[fixture()],now:NOW,
   market:async()=>({ok:true,externalRequestsAdded:0,entries:{'7001':payload}})});
  assert.equal(out.raw.counts.uniqueFixturesWithPatterns,1);
  assert.equal(out.priced.fixtures,1);
  assert.equal(out.record.added,4);
  const entries=readAdaptiveStats(db,NOW).records;
  assert.equal(entries.length,4);
  assert(entries.every(p=>p.odds_source.endsWith('_HISTORICAL_RESEARCH_ONLY')));
  assert(entries.every(p=>p.quote_observed_at===oldQuoteAt));
  assert(entries.every(p=>p.odds>=1.40));
  assert(entries.every(p=>p.status==='PENDING'));
  const oldPrice=await runAdaptiveOu(db,{fixtures:[fixture(7002,501,502)],now:NOW,
   market:async()=>({ok:true,externalRequestsAdded:0,entries:{
    '7002':{...payload,ageMs:7*3600000,fetchedAt:(NOW-7*3600)*1000,
     fullOdds:{data:{...payload.fullOdds.data,fixture_id:7002}}}}})});
  assert.equal(oldPrice.record.added,0);
 }finally{raw.close()}
});
