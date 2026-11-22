import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {init} from './history.mjs';
import {initBttsHistory,importBttsTeamFallback} from './btts-history-private.mjs';
import {initBttsPickLedger,bttsPicksFromScreen,recordBttsPicks,bttsPickLedger} from './btts-pick-ledger-test.mjs';
import {evaluateBttsUltra,mergeBet365BttsQuotes} from './btts-ultra-shadow.mjs';
import {runBttsPricePickup,bttsPricePickupState,B46_BTTS_PRICE_PICKUP_CAP} from './btts-priced-fixture-pickup-test.mjs';
import {patchBttsPriceBridgeMain} from './patch-btts-price-bridge-into-existing-test-worker.mjs';

const now=700,kickoff=2400;
function db(){
 const sqlite=new DatabaseSync(':memory:');
 const d={exec:(sql,...p)=>{const q=sqlite.prepare(sql);return /^\s*(SELECT|WITH|PRAGMA)/i.test(sql)?q.all(...p):(q.run(...p),[])},
  transaction:f=>{sqlite.exec('BEGIN');try{const r=f();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 init(d);initBttsHistory(d);initBttsPickLedger(d);return d;
}
const fixture=(id=999)=>({id:String(id),status:'scheduled',kickoff_ts:kickoff,
  league:{id:8,name:'Test League'},
  teams:{home:{id:10,name:'Home'},away:{id:20,name:'Away'}}});
const row=(id,team,other,day)=>({id,league:{id:8},
  teams:{home:{id:team},away:{id:other}},kickoff_ts:day,
  status:'finished',status_code:'full',goals:{home:2,away:1}});
function ready(d){
 importBttsTeamFallback(d,Array.from({length:10},(_,i)=>row(1000+i,10,11000+i,110+i)),600,{teamId:10});
 importBttsTeamFallback(d,Array.from({length:10},(_,i)=>row(2000+i,20,21000+i,130+i)),600,{teamId:20});
}
const quote=()=>({data:{fixture_id:999,bookmakers:[{slug:'bet365',odds:{btts:{
 closing:{yes:1.85,no:2.1},opening:{yes:1.81,no:2.15},inplay:null}}}]}});
function input(d,opts={}){
 const f=fixture();
 let stored={};
 const calls=[];
 const args={
  now,fixtures:[f],feedAt:650,quotes:stored,clock:()=>701,
  hubreview:async()=>({ok:true,retryAfterSec:0,lastError:null}),
  provider:async(path)=>{
   calls.push(path);
   return {ok:true,status:200,body:quote(),remaining:33};
  },
  onQuote:async(fixture,parsed,observed)=>{
   stored=mergeBet365BttsQuotes(stored,fixture,parsed,observed).quotes;
   const evalResult=evaluateBttsUltra(d,[fixture],observed,stored,1000);
   const picks=bttsPicksFromScreen(evalResult,[fixture],observed);
   return {issued:recordBttsPicks(d,picks,observed)};
  },...opts
 };
 return {args,calls,getQuotes:()=>stored};
}
test('real per-fixture Bet365 quote flows into existing strict BTTS evaluator and ledger',async()=>{
 const d=db();ready(d);
 assert.equal(evaluateBttsUltra(d,[fixture()],now,{}).totals.quoteRequired,1);
 const x=input(d);
 const result=await runBttsPricePickup(d,x.args);
 assert.equal(result.state,'PICKUP_EXECUTED');
 assert.equal(result.providerCalls,1);
 assert.deepEqual(x.calls,['/v1/fixtures/999/odds?market=btts']);
 assert.equal(result.selected[0].state,'PRICED_IMPORTED');
 assert.equal(result.selected[0].oddsYes,1.85);
 assert.equal(result.selected[0].oddsNo,2.1);
 assert.equal(result.selected[0].issued.added,1);
 assert.equal(bttsPickLedger(d).stats.total,1);
 assert.equal(bttsPickLedger(d).rows[0].price,1.85);
 assert.equal(bttsPickLedger(d).rows[0].source,'5USD_FIXTURE_BET365_BTTS');
 assert.equal(bttsPricePickupState(d,now).priced,1);
 const duplicate=await runBttsPricePickup(d,{...x.args,quotes:x.getQuotes()});
 assert.equal(duplicate.providerCalls,0);
 assert.equal(x.calls.length,1);
 assert.equal(bttsPickLedger(d).stats.total,1);
});
test('real Bet365 btts:null -> NOT_OFFERED, do not issue pick or retry same day',async()=>{
 const d=db();ready(d);
 const calls=[];
 const x=input(d,{provider:async path=>{
  calls.push(path);
  return {ok:true,status:200,body:{data:{fixture_id:999,bookmakers:[{slug:'bet365',odds:{btts:null}}]}},remaining:32};
 }});
 const a=await runBttsPricePickup(d,x.args);
 assert.equal(a.selected[0].state,'NOT_OFFERED');
 assert.equal(bttsPickLedger(d).stats.total,0);
 assert.equal((await runBttsPricePickup(d,x.args)).providerCalls,0);
 assert.equal(calls.length,1);
 assert.equal(bttsPricePickupState(d,now).notOffered,1);
});
test('no approved price buying without 3+ historical matches, fresh feed and HUB clearance',async()=>{
 const d=db(),x=input(d);
 const out=await runBttsPricePickup(d,x.args);
 assert.equal(out.state,'NO_NEW_PROBABILITY_READY_FIXTURES');
 assert.equal(out.providerCalls,0);
 ready(d);
 const stale=await runBttsPricePickup(d,{...x.args,feedAt:0});
 assert.equal(stale.state,'FRESH_SCHEDULED_FEED_REQUIRED');
 const health=await runBttsPricePickup(d,{...x.args,hubreview:async()=>({ok:false,retryAfterSec:20})});
 assert.equal(health.state,'SHARED_HUB_NOT_READY');
 assert.deepEqual(x.calls,[]);
});
test('HTTP 429 never retries, leaves distinct test-only SQL evidence and blocks entire day',async()=>{
 const d=db();ready(d);
 let n=0;const x=input(d,{provider:async()=>{n++;return {ok:false,status:429,remaining:0}}});
 const first=await runBttsPricePickup(d,x.args);
 assert.equal(first.providerCalls,1);
 assert.equal(first.selected[0].state,'FAIL_429');
 assert.equal(bttsPickLedger(d).stats.total,0);
 const second=await runBttsPricePickup(d,x.args);
 assert.equal(second.state,'SHARED_RATE_LIMIT_STOP_FOR_DAY');
 assert.equal(second.providerCalls,0);
 assert.equal(n,1);
});
test('wrong provider fixture ID or non-Bet365 book does not create any pick',async()=>{
 for(const payload of [
  {data:{fixture_id:777,bookmakers:[{slug:'bet365',odds:{btts:{closing:{yes:2,no:2}}}}]}},
  {data:{fixture_id:999,bookmakers:[{slug:'pinnacle',odds:{btts:{closing:{yes:2,no:2}}}}]}}
 ]){
  const d=db();ready(d);
  const a=await runBttsPricePickup(d,input(d,{provider:async()=>({ok:true,body:payload,remaining:34})}).args);
  assert.equal(a.providerCalls,1);
  assert.equal(bttsPickLedger(d).stats.total,0);
 }
});
test('transport preserves the user 5-round historical limit by using its own price quota',()=>{
 assert.equal(B46_BTTS_PRICE_PICKUP_CAP.maxPerLondonBusinessDay,12);
 assert.equal(B46_BTTS_PRICE_PICKUP_CAP.maxPerTick,2);
});
test('main worker patch only appends BTTS price pipeline without changing old bot/truck',()=>{
 const stub=[
 "import {initPreMarketStatsRegistry,syncPreMarketStatsRegistry,readPreMarketStatsRegistry,auditPreMarketStatsRegistry} from './prematch-stats-registry-test.mjs';",
 "export class PrematchStore extends DurableObject{",
 "constructor(){initBttsPickLedger(this.db);initPreMarketStatsRegistry(this.db)}",
 " async rememberLeagueCatalog(snapshot){}",
 " if(path==='/btts-shadow'&&req.method==='GET'){}",
 " if(path==='/btts-cycle-test'&&req.method==='POST'){}",
 "const b=await stub.fetch('https://prematch.internal/btts-cycle-test',{method:'POST'});console.log('BTTS_TEST_ONLY_CYCLE '+b.status)"
 ].join('\n');
 const p=patchBttsPriceBridgeMain(stub);
 assert(p.changedExistingTransport===false);
 assert(p.code.includes('api.5dollarfootballapi.com'));
 assert(p.code.includes('btts-price-pickup-tick'));
 assert(p.code.includes('initBttsPricePickup(this.db)'));
 assert(p.code.includes("const b=await stub.fetch('https://prematch.internal/btts-cycle-test'"));
 assert.equal(p.code.split("'/btts-cycle-test'").length-1,1);
 assert.throws(()=>patchBttsPriceBridgeMain(p.code),/SOURCE_DRIFT/);
});
