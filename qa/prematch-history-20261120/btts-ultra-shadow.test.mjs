import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init,ingest} from './history.mjs';
import {initBttsHistory} from './btts-history-private.mjs';
import {evaluateBttsUltra,mergeBet365BttsQuotes,parseBet365BttsOdds} from './btts-ultra-shadow.mjs';
const now=300,kickoff=400;
const fixture={id:'999',status:'scheduled',kickoff_ts:kickoff,league:{id:8,name:'Qatar Stars League'},
 teams:{home:{id:10,name:'Home'},away:{id:20,name:'Away'}}};
const raw={
 bookmakers:[{name:'Bet 365',slug:'bet365',
  odds:{btts:{opening:{yes:2.2,no:1.615},closing:{yes:2.5,no:1.5},inplay:null}}}]
};
const parsed=parseBet365BttsOdds(raw,{fixtureId:999,homeId:10,awayId:20,observed:290,kickoff,now});
test('John fixture odds Bet365 closing price selected without market guessing',()=>{
 assert.equal(parsed.state,'PRICED');assert.equal(parsed.sourceQuote,'closing');
 assert.deepEqual(parsed.prices,{BTTS_YES:2.5,BTTS_NO:1.5});
});
test('opening fallback supported but no inplay odds used',()=>{
 const x=parseBet365BttsOdds({bookmakers:[{slug:'bet365',odds:{btts:{opening:{yes:1.8,no:2.1},closing:null,inplay:{yes:4,no:1.2}}}}]},
 {fixtureId:999,homeId:10,awayId:20,observed:290,kickoff,now});
 assert.equal(x.sourceQuote,'opening');assert.equal(x.prices.BTTS_YES,1.8);
});
test('null BTTS means not offered, never zero prices or provider error',()=>{
 const x=parseBet365BttsOdds({bookmakers:[{slug:'bet365',odds:{btts:null}}]},
 {fixtureId:999,homeId:10,awayId:20,observed:290,kickoff,now});
 assert.equal(x.state,'NOT_OFFERED');assert.equal(x.prices,undefined);
});
test('wrong bookmaker and ambiguous duplicate Bet365 fail closed',()=>{
 const args={fixtureId:999,homeId:10,awayId:20,observed:290,kickoff,now};
 assert.equal(parseBet365BttsOdds({bookmakers:[{slug:'pinnacle',odds:raw.bookmakers[0].odds}]},args).state,'NO_BET365_BOOKMAKER');
 assert.equal(parseBet365BttsOdds({bookmakers:[raw.bookmakers[0],raw.bookmakers[0]]},args).state,'AMBIGUOUS_BOOKMAKER');
 assert.equal(parseBet365BttsOdds({bookmakers:[]},{...args,observed:kickoff}).state,'INVALID_EVIDENCE');
});
test('only exact fixture ID, teams and kickoff can store BTTS price',()=>{
 const fixed=mergeBet365BttsQuotes({},fixture,parsed,now);
 assert.equal(fixed.state,'PRICED');
 assert.equal(fixed.quotes['999'].prices.BTTS_NO,1.5);
 assert.throws(()=>mergeBet365BttsQuotes({},fixture,{...parsed,awayId:'200'},now),/MISMATCH/);
 const next=mergeBet365BttsQuotes(fixed.quotes,fixture,{state:'NOT_OFFERED'},now);
 assert.equal(next.quotes['999'].state,'PRICED');
 const older=mergeBet365BttsQuotes(fixed.quotes,fixture,{...parsed,observed:289},now);
 assert.equal(older.state,'STALE_QUOTE_IGNORED');
});
function db(){
 const sql=new DatabaseSync(':memory:');
 const conn={exec:(q,...args)=>{
  const stmt=sql.prepare(q);if(/^\s*(SELECT|WITH|PRAGMA)/i.test(q))return stmt.all(...args);
  return (stmt.run(...args),[]);
 },transaction:f=>{sql.exec('BEGIN');try{const r=f();sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 init(conn);initBttsHistory(conn);return conn;
}
function seed(conn,h=10,a=10){
 const fixtures=[];
 for(let i=0;i<h;i++)fixtures.push({id:1000+i,league:{id:8},teams:{home:{id:10},away:{id:10000+i}},kickoff_ts:110+i,
  status:'finished',status_code:'full',goals:{home:2,away:1}});
 for(let i=0;i<a;i++)fixtures.push({id:2000+i,league:{id:8},teams:{home:{id:20},away:{id:20000+i}},kickoff_ts:140+i,
  status:'finished',status_code:'full',goals:{home:2,away:1}});
 ingest(conn,fixtures,200);
}
test('exact ten completed games per team required, 1X2 history not fabricated',()=>{
 const conn=db();seed(conn,10,9);
 const r=evaluateBttsUltra(conn,[fixture],now,{});
 assert.equal(r.totals.upcoming,1);assert.equal(r.totals.historyIncomplete,1);
 assert.equal(r.totals.qualified,0);assert.equal(r.totals.quoteRequired,0);
 assert.equal(r.sample[0].state,'INSUFFICIENT_HISTORY');
 assert.equal(r.published,0);
});
test('10/10 valid history, no odds => only rate-limited candidate list, zero calls/published',()=>{
 const conn=db();seed(conn);
 const r=evaluateBttsUltra(conn,[fixture],now,{});
 assert.equal(r.totals.historyReady,1);
 assert.equal(r.totals.modelProbabilityReady,1);
 assert.equal(r.totals.quoteRequired,1);
 assert.equal(r.candidates.length,1);
 assert.equal(r.decisions.length,0);assert.equal(r.providerCalls,0);assert.equal(r.published,0);
});
test('valid Bet365 odds can make independent BTTS shadow decision',()=>{
 const conn=db();seed(conn);
 const verified={...parsed,prices:{BTTS_YES:1.85,BTTS_NO:2.1}};
 const r=evaluateBttsUltra(conn,[fixture],now,{'999':{...verified,state:'PRICED'}});
 assert.equal(r.totals.historyReady,1);assert.equal(r.totals.availableQuote,1);
 assert.equal(r.totals.qualified,1);
 assert.equal(r.decisions[0].signal,'BTTS_YES');
 assert.equal(r.published,0);assert.equal(r.providerCalls,0);
});
test('HUB 1X2 alone does not masquerade as Bet365 BTTS',()=>{
 const conn=db();seed(conn);
 const f={...fixture,storedHub1x2:{bookmaker:'5usd-hub',observed:285,prices:{BTTS_YES:1.6,BTTS_NO:2.1}}};
 const r=evaluateBttsUltra(conn,[f],now,{});
 assert.equal(r.totals.availableQuote,0);assert.equal(r.totals.quoteRequired,1);
});
test('cached null market counted separately from missing price',()=>{
 const conn=db();seed(conn);
 const q=mergeBet365BttsQuotes({},fixture,{state:'NOT_OFFERED'},now).quotes;
 const r=evaluateBttsUltra(conn,[fixture],now,q);
 assert.equal(r.totals.notOffered,1);assert.equal(r.totals.quoteRequired,0);
 assert.equal(r.sample[0].state,'NOT_OFFERED');assert.equal(r.decisions.length,0);
});
