import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {init,ingest} from './history.mjs';import {dryRunStored,BASELINE_SHADOW,ACCUMULATION_SHADOW,TRIAL_SHADOW,rejectionStage} from './stored-signal-adapter.mjs';
import {evaluateBttsSignal} from './evaluate-btts-signal.mjs';import {evaluate1x2Signal} from './evaluate-1x2-signal.mjs';
// Synthetic contract test only. Actual archive is tested independently.
const sql=new DatabaseSync(':memory:');const db={exec:(q,...a)=>{const s=sql.prepare(q);return /^\s*SELECT/i.test(q)?s.all(...a):(s.run(...a),[])},transaction:f=>{sql.exec('BEGIN');try{const r=f();sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};init(db);
const fixtures=Array.from({length:20},(_,i)=>({id:100+i,league:{id:1},teams:{home:{id:i<10?1:2},away:{id:1000+i}},kickoff_ts:100+i,status:'finished',status_code:'full',goals:{home:i<10?3:1,away:i<10?1:2}}));ingest(db,fixtures,200);
const f={id:999,status:'scheduled',kickoff_ts:400,teams:{home:{id:1},away:{id:2}},storedBet365:{bookmaker:'bet365',observed:250,prices:{BTTS_YES:1.85,BTTS_NO:2.1,'1X2_HOME':1.85,'1X2_DRAW':3.4,'1X2_AWAY':4.2}}};
test('both models receive actual SQL shape',()=>{const r=dryRunStored(db,[f],300);assert.equal(r.counts.bothReady,1);assert.equal(r.rows[0].btts.signal,'BTTS_YES');assert.equal(r.rows[0].oneX2.signal,'HOME_WIN');assert.equal(r.published,0)});
test('missing market does not block other market',()=>{const g=structuredClone(f);delete g.storedBet365.prices.BTTS_NO;const r=dryRunStored(db,[g],300);assert.equal(r.rows[0].btts.reason,'NO_STORED_BET365_PRICE');assert.ok(r.rows[0].oneX2.metrics);assert.equal(r.counts.bothReady,0)});
test('real history shortage is never padded',()=>{const r=dryRunStored(db,[{...f,teams:{home:{id:1},away:{id:1000}}}],300);assert.equal(r.rows[0].awayCount,1);assert.equal(r.rows[0].oneX2.reason,'INSUFFICIENT_HISTORY');assert.equal(r.rows[0].btts.metrics,null)});
test('future odds and started matches rejected',()=>{const g=structuredClone(f);g.storedBet365.observed=310;assert.equal(dryRunStored(db,[g],300).counts.bttsPrices,0);assert.equal(dryRunStored(db,[f],400).counts.upcoming,0)});

const bcfg={...ACCUMULATION_SHADOW.btts,minHistory:5,enabled:true};
const xcfg={...ACCUMULATION_SHADOW.oneX2,minHistory:5,enabled:true};
const form5=(scores,base)=>scores.map(([gf,ga],i)=>({fixtureId:base+i,kickoff:100+i,gf,ga}));
const input5=(home,away,odds)=>({homeLast10:form5(home,500),awayLast10:form5(away,600),odds:{bookmaker:'bet365',observed:250,...odds},asOf:300,kickoff:400});
test('five matches use real denominator, four are rejected, baseline still requires ten',()=>{
 const q=input5([[2,1],[1,2],[1,1],[2,2],[0,0]],[[1,1],[1,1],[2,1],[1,2],[1,0]],{yes:1.85,no:2.1});
 const r=evaluateBttsSignal(q,bcfg);assert.equal(r.metrics.home.btts,.8);assert.equal(r.metrics.home.blank,.2);assert.equal(r.signal,'BTTS_YES');assert.equal(evaluateBttsSignal({...q,homeLast10:q.homeLast10.slice(1)},bcfg).reason,'INVALID_OR_INCOMPLETE_HISTORY');assert.equal(evaluateBttsSignal(q,{enabled:true}).reason,'INVALID_OR_INCOMPLETE_HISTORY');
});
test('oneX2 accepts 50 percent win side with its own threshold',()=>{
 const q=input5([[2,0],[2,0],[2,0],[0,1],[0,1]],[[0,2],[0,2],[0,0],[0,0],[0,0]],{home:2.2,draw:3.4,away:3.5});
 const r=evaluate1x2Signal(q,xcfg);assert.equal(r.metrics.sides[0].model,.5);assert.equal(r.signal,'HOME_WIN');
});
test('draw uses separate 33 percent threshold',()=>{
 const q=input5([[1,1],[0,0],[2,0],[0,2],[2,1]],[[1,1],[0,0],[0,2],[2,0],[0,1]],{home:1.8,draw:3.4,away:3.5});
 const r=evaluate1x2Signal(q,xcfg);assert.equal(r.metrics.sides[1].model,.4);assert.equal(r.signal,'DRAW');
});
test('actual SQLite contract selects five and never pads or publishes; zero prices fail closed',()=>{
 const samples=Array.from({length:10},(_,i)=>({id:200+i,league:{id:1},teams:{home:{id:i<5?3:4},away:{id:2000+i}},kickoff_ts:100+i,status:'finished',status_code:'full',goals:{home:i<5?3:1,away:i<5?1:2}}));
 ingest(db,samples,200);
 const q={...f,id:998,teams:{home:{id:3},away:{id:4}}};
 const base=dryRunStored(db,[q],300,10,BASELINE_SHADOW),next=dryRunStored(db,[q],300,10,ACCUMULATION_SHADOW);
 assert.equal(base.rows[0].btts.reason,'INSUFFICIENT_HISTORY');assert.equal(next.rows[0].homeCount,5);assert.equal(next.rows[0].awayCount,5);assert.equal(next.counts.bothReady,1);assert.equal(next.rows[0].btts.signal,'BTTS_YES');assert.equal(next.rows[0].oneX2.signal,'HOME_WIN');assert.equal(next.published,0);
 const z=structuredClone(q);for(const k of Object.keys(z.storedBet365.prices))z.storedBet365.prices[k]=0;const blocked=dryRunStored(db,[z],300);
 assert.equal(blocked.rows[0].btts.reason,'NO_STORED_BET365_PRICE');assert.equal(blocked.rows[0].oneX2.reason,'NO_STORED_BET365_PRICE');assert.equal(blocked.outcomes.btts.NO_SIGNAL,1);assert.equal(blocked.outcomes.oneX2.NO_SIGNAL,1);
});

test('trial accepts exactly three real rows and rejects two',()=>{
 const q=input5([[2,1],[2,1],[2,1]],[[1,2],[1,2],[1,2]],{yes:1.85,no:2.1});
 const cfg={...TRIAL_SHADOW.btts,minHistory:3,enabled:true};
 assert.equal(evaluateBttsSignal(q,cfg).signal,'BTTS_YES');
 assert.equal(evaluateBttsSignal({...q,homeLast10:q.homeLast10.slice(1)},cfg).reason,'INVALID_OR_INCOMPLETE_HISTORY');
 assert.equal(evaluateBttsSignal(q,bcfg).reason,'INVALID_OR_INCOMPLETE_HISTORY');
});
test('trial rejection counter classifies first failed stage without double counting',()=>{
 const cfg=TRIAL_SHADOW.btts, mk=(sides)=>({signal:'NO_SIGNAL',reason:'FILTERS_NOT_MET',metrics:{sides}});
 const row={signal:'BTTS_YES',model:.6,price:1.9,edge:.06,ev:.14};
 assert.equal(rejectionStage(mk([{...row,model:.5}]),cfg,'btts'),'PROBABILITY_BELOW');
 assert.equal(rejectionStage(mk([{...row,price:1.3}]),cfg,'btts'),'PRICE_RANGE');
 assert.equal(rejectionStage(mk([{...row,edge:.005}]),cfg,'btts'),'EDGE_EV_BELOW');
 assert.equal(rejectionStage(mk([{...row,ev:.005}]),cfg,'btts'),'EDGE_EV_BELOW');
 assert.equal(rejectionStage({signal:'NO_SIGNAL',reason:'NO_STORED_BET365_PRICE'},cfg,'btts'),'NO_STORED_BET365_PRICE');
 assert.equal(rejectionStage({signal:'NO_SIGNAL',reason:'INSUFFICIENT_HISTORY'},cfg,'btts'),'INSUFFICIENT_HISTORY');
 assert.equal(rejectionStage({signal:'BTTS_YES'},cfg,'btts'),'PASSED');
});
test('three-match shadow both markets and independent missing-input counters',()=>{
 const samples=Array.from({length:6},(_,i)=>({id:300+i,league:{id:1},teams:{home:{id:i<3?5:6},away:{id:3000+i}},kickoff_ts:100+i,status:'finished',status_code:'full',goals:{home:i<3?3:1,away:i<3?1:2}}));
 ingest(db,samples,200);
 const q={...f,id:997,teams:{home:{id:5},away:{id:6}}};
 const base=dryRunStored(db,[q],300,10,ACCUMULATION_SHADOW),next=dryRunStored(db,[q],300);
 assert.equal(base.diagnostics.btts.INSUFFICIENT_HISTORY,1);assert.equal(next.profile.minHistory,3);assert.equal(next.diagnostics.btts.PASSED,1);assert.equal(next.diagnostics.oneX2.PASSED,1);
 const missing={...q,id:996,storedBet365:undefined},short={...missing,id:995,teams:{home:{id:5},away:{id:3000}}};
 const r=dryRunStored(db,[q,missing,short],300);
 assert.deepEqual(r.diagnostics.missingInputs,{history:1,bttsOdds:2,oneX2Odds:2});
 for(const market of ['btts','oneX2']){assert.equal(r.diagnostics[market].PASSED,1);assert.equal(r.diagnostics[market].NO_STORED_BET365_PRICE,1);assert.equal(r.diagnostics[market].INSUFFICIENT_HISTORY,1);assert.equal(Object.values(r.diagnostics[market]).reduce((a,b)=>a+b,0),3)}
 assert.equal(r.published,0);
});

test('probability available without Bet365 and matches result with Bet365',()=>{
 const q={...f,id:990,teams:{home:{id:5},away:{id:6}}};
 const missing={...q,storedBet365:undefined};
 const a=dryRunStored(db,[q],300),b=dryRunStored(db,[missing],300);
 for(const market of ['btts','oneX2']){
 const x=a.rows[0][market],y=b.rows[0][market];assert.deepEqual(x.metrics.sides.map(s=>s.model),y.metrics.sides.map(s=>s.model));assert.equal(y.signal,'NO_SIGNAL');assert.equal(y.reason,'NO_STORED_BET365_PRICE');assert.ok(y.metrics.sides.every(s=>s.price===null&&s.edge===null&&s.ev===null));assert.deepEqual(b.probability[market],{computed:1,passed:1,below:0,waitingOdds:1});
 }
 assert.equal(b.published,0);
});
test('without odds, model probability below threshold is still counted before price gate',()=>{
 const samples=Array.from({length:6},(_,i)=>({id:400+i,league:{id:1},teams:{home:{id:i<3?7:8},away:{id:4000+i}},kickoff_ts:100+i,status:'finished',status_code:'full',goals:[{home:1,away:1},{home:1,away:0},{home:0,away:1},{home:1,away:1},{home:1,away:0},{home:0,away:1}][i]}));
 ingest(db,samples,200);
 const q={...f,id:991,teams:{home:{id:7},away:{id:8}},storedBet365:undefined};const a=dryRunStored(db,[q],300);
 assert.equal(a.rows[0].btts.reason,'PROBABILITY_BELOW');assert.equal(a.probability.btts.below,1);assert.equal(a.diagnostics.missingInputs.bttsOdds,1);assert.equal(a.rows[0].oneX2.reason,'NO_STORED_BET365_PRICE');assert.equal(a.probability.oneX2.waitingOdds,1);assert.equal(a.published,0);
});
