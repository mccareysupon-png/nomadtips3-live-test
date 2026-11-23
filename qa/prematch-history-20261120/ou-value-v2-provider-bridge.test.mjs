import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {initBttsHistory} from './btts-history-private.mjs';
import {initOuValueShadow,recordOuValueShadow,readOuValueShadow} from './ou-value-screener-v2-test.mjs';
import {initOuPricePickup,readOuPricePickupState} from './ou-price-pickup-v1-test.mjs';
import {readOuValueV2BridgeState,captureOneValueV2Price} from './ou-value-v2-provider-bridge-test.mjs';
const now=1800000000,kickoff=now+7200;
function database(){
 const raw=new DatabaseSync(':memory:');
 const db={exec(sql,...args){
  if(args.length===0&&!/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)){raw.exec(sql);return []}
  const stmt=raw.prepare(sql);
  if(/^\s*(SELECT|WITH|PRAGMA)/i.test(sql))return stmt.all(...args);
  stmt.run(...args);return [];
 },transaction(fn){
  raw.exec('BEGIN IMMEDIATE');
  try{const result=fn();raw.exec('COMMIT');return result}
  catch(e){raw.exec('ROLLBACK');throw e}
 },close(){raw.close()}};
 initBttsHistory(db);initOuValueShadow(db);initOuPricePickup(db);
 db.exec("CREATE TABLE result_version(fixture_id INTEGER NOT NULL,league_id INTEGER NOT NULL,kickoff INTEGER NOT NULL,home_id INTEGER NOT NULL,away_id INTEGER NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,observed INTEGER NOT NULL,status TEXT NOT NULL)");
 for(let i=0;i<10;i++)for(const home of [501,502]){
  db.exec('INSERT INTO result_version VALUES(?,?,?,?,?,?,?,?,?)',
   9000+i+(home===501?0:100),12,now-100000+i*9000,
   home,1000+i,1+(i%3),i%2,now-5000+i*100,'finished');
 }
 return db;
}
const fixtures=[{id:7001,status:'scheduled',kickoff_ts:kickoff,
 league:{id:12,name:'League'},teams:{home:{id:501,name:'Alpha'},away:{id:502,name:'Beta'}}}];
const pair=(over,under)=>({over,under});
const full=(id=7001)=>({ok:true,fixtureId:id,stale:false,cached:false,
 fetchedAt:now*1000-1000,ageMs:1000,externalRequestsAdded:1,
 fullOdds:{fixture_id:id,bookmakers:[
  {slug:'pinnacle',odds:{goal_line_fixed:[
   {line:3.5,closing:pair(2.35,1.75)},
   {line:4.5,closing:pair(4.4,1.95)}]}}
 ]}});
const healthyHub={ok:true,stale:false,lastError:null,ageMs:8000,retryAfterSec:0,
 estimatedBulkRequestsPerMinute:3,accountLimitPerMinute:40,refreshMs:30000};
const healthyFm={ok:true,retryAfterSec:0,remainingLocalBudget:8,blockedUntil:null};
function market({provider=full(),cache=null,hub=healthyHub,fm=healthyFm}={}){
 const called=[];
 const fn=async(path,opts)=>{
  called.push({path,method:opts?.method});
  if(path==='/board-cache')return cache??{ok:true,entries:{},externalRequestsAdded:0};
  if(path==='/health')return fm;
  if(path==='/fixture-odds?fixtureId=7001')return provider;
  throw Error('UNKNOWN_MOCK_MARKET_PATH_'+path);
 };
 return {fn,called,hubHealth:async()=>hub};
}
test('new V2 actually retrieves one native fixture quote and chooses best payout across bookmaker lines',async()=>{
 const db=database();
 try{
  const m=market();
  const r=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
  assert.equal(r.state,'VALUE_PICK_PRICED');
  assert.equal(r.candidateId,7001);
  assert.equal(r.budgetReserved,1);
  assert.equal(r.fullMarketUpstreamAdded,1);
  assert.equal(r.selected.fixtureId,7001);
  assert.equal(r.selected.side,'UNDER');
  assert.equal(r.selected.line,4.5);
  assert.equal(r.selected.price,1.95);
  assert.equal(r.selected.bookmaker,'pinnacle');
  assert(r.selected.ev>=0.05);
  assert.deepEqual(m.called.map(x=>x.path),['/board-cache','/health','/fixture-odds?fixtureId=7001']);
  const shadow=recordOuValueShadow(db,[r.selected],r.selected.pickedAt);
  assert.equal(shadow.added,1);
  assert.equal(readOuValueShadow(db)[0].price,1.95);
  const state=readOuValueV2BridgeState(db,now);
  assert.equal(state.sharedOuDailyBudget.remaining,0);
  assert.equal(state.recent.length,1);
  assert.equal(state.recent[0].state,'VALUE_PICK_PRICED');
  const second=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
  assert.equal(second.state,'DAILY_SHARED_OU_CAP');
  assert.equal(m.called.filter(x=>x.path.includes('/fixture-odds')).length,1);
 }finally{db.close()}
});
test('old legacy O/U daily request prevents any extra V2 provider request',async()=>{
 const db=database();try{
  const day=readOuPricePickupState(db,now).day;
  db.exec("INSERT INTO b46_ou_price_request_v1_test(fixture_id,business_day,requested_at,state,provider_calls) VALUES(?,?,?,'RESERVED_AT_SELECTION',1)",8888,day,now-200);
  const m=market();
  const out=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
  assert.equal(out.state,'DAILY_SHARED_OU_CAP');
  assert.equal(out.budgetReserved,0);
  assert.equal(m.called.length,0);
 }finally{db.close()}
});
test('quota not healthy => zero paid requests and zero reserved quota',async()=>{
 const db=database();try{
  const m=market({hub:{...healthyHub,stale:true}});
  const out=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
  assert.equal(out.state,'SHARED_QUOTA_NOT_VERIFIED');
  assert.equal(out.budgetReserved,0);
  assert.equal(m.called.filter(x=>x.path.includes('/fixture-odds')).length,0);
  assert.equal(readOuValueV2BridgeState(db,now).sharedOuDailyBudget.remaining,1);
 }finally{db.close()}
});
test('when Full Market has no O/U side prices: no prediction, no retry and one day quota consumed',async()=>{
 const db=database();try{
  const m=market({provider:{...full(),fullOdds:{fixture_id:7001,bookmakers:[
   {slug:'bet365',odds:{goal_line:{closing:3.5,opening:2.5}}}]}}});
  const first=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
  assert.equal(first.selected,null);
  assert.equal(first.budgetReserved,1);
  assert.equal(first.state,'NO_VERIFIED_OU_OFFERS');
  const second=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
  assert.equal(second.state,'DAILY_SHARED_OU_CAP');
  assert.equal(readOuValueShadow(db).length,0);
  assert.equal(m.called.filter(x=>x.path.includes('/fixture-odds')).length,1);
 }finally{db.close()}
});
test('wrong fixture or stale price is rejected without fake quote or selection',async()=>{
 for(const input of [full(7002),{...full(),stale:true}]){
  const db=database();
  try{
   const m=market({provider:input});
   const result=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
   assert.equal(result.selected,null);assert.equal(result.budgetReserved,1);
   assert.equal(readOuValueShadow(db).length,0);
  }finally{db.close()}
 }
});
test('if price already in cache, paid bridge does not order same market again',async()=>{
 const db=database();try{
  const price=full();
  const m=market({cache:{ok:true,externalRequestsAdded:0,entries:{
   '7001':{fullOdds:price.fullOdds,fetchedAt:price.fetchedAt,ageMs:1000,stale:false}}}});
  const result=await captureOneValueV2Price(db,{fixtures,now,market:m.fn,hubHealth:m.hubHealth,clock:()=>now});
  assert.equal(result.state,'NO_MISSING_MARKET_CANDIDATE');
  assert.equal(result.budgetReserved,0);
  assert.equal(m.called.filter(x=>x.path.includes('/fixture-odds')).length,0);
 }finally{db.close()}
});
