import test from 'node:test';
import assert from 'node:assert/strict';
import {FiveUsdNativeRuntime,FiveUsdRateGuardError} from '../src/fivedollar-runtime.js';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async transaction(fn){return fn(this);}
}

function response(payload,headers={}){
  return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json','x-ratelimit-limit':'40','x-ratelimit-remaining':'39',...headers}});
}

const baseFixture=(id,status,kickoff)=>({
  id,status,status_code:status==='live'?'25':'NS',kickoff_utc:kickoff,
  league:{name:'League'},teams:{home:{name:`H${id}`},away:{name:`A${id}`}},goals:{home:0,away:0},
  statistics:status==='live'?{attacks:{home:12,away:9},dangerous_attacks:{home:5,away:4},shots_on_target:{home:2,away:1},shots_off_target:{home:3,away:2},possession:{home:52,away:48}}:undefined,
});

test('runtime is fail-closed/off unless explicitly enabled',async()=>{
  const runtime=new FiveUsdNativeRuntime(new MemoryStorage(),{});
  assert.equal(runtime.enabled(),false);
  assert.deepEqual(await runtime.tick(),{ok:false,mode:'off',error:'FIVEUSD_NATIVE_DISABLED'});
});

test('shadow tick builds board from live plus near waiting and never displays terminal',async()=>{
  const at=Date.parse('2026-09-13T12:00:00Z');
  let current=at,calls=0;
  const fetchImpl=async url=>{
    calls++;
    const parsed=new URL(url);
    if(parsed.searchParams.get('status')==='live'){
      return response({data:[baseFixture(1,'live','2026-09-13T11:30:00Z')],pagination:{has_more:false}});
    }
    return response({data:[
      baseFixture(2,'scheduled','2026-09-13T12:45:00Z'),
      baseFixture(3,'scheduled','2026-09-13T16:00:00Z'),
    ],pagination:{has_more:false}});
  };
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x'},{fetchImpl,clock:()=>current});
  const state=await runtime.tick({force:true});
  const snapshot=await runtime.snapshot();
  assert.equal(state.ok,true);
  assert.equal(state.shadowOnly,true);
  assert.deepEqual(snapshot.board.counts,{live:1,waiting:1});
  assert.equal(snapshot.board.terminalDisplayed,0);
  assert.deepEqual(snapshot.board.fixtures.map(row=>row.fixtureId).sort(),['1','2']);
  assert.equal(calls,2);
  const health=await runtime.health();
  assert.equal(health.cadence.cycleMs,3000);
  assert.equal(health.cadence.noOverlap,true);
  assert.equal(health.rate.global.usedLast60s,2);
  assert.equal(health.rate.live.usedLast60s,1);
  assert.equal(health.rate.upcoming.usedLast60s,1);
});

test('live and waiting request lanes are independent while global usage remains bounded',async()=>{
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    const parsed=new URL(url);
    const status=parsed.searchParams.get('status');
    return response({data:status==='live'?[]:[],pagination:{has_more:false}});
  };
  const storage=new MemoryStorage();
  const env={
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_LIVE_REQUEST_BUDGET_PER_60S:'20',
    FIVEUSD_UPCOMING_REQUEST_BUDGET_PER_60S:'3',
    FIVEUSD_REFEREE_REQUEST_BUDGET_PER_60S:'10',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'40',
  };
  const runtime=new FiveUsdNativeRuntime(storage,env,{fetchImpl,clock:()=>100000});
  for(let i=0;i<20;i++) await runtime.refreshLive({force:true});
  await assert.rejects(()=>runtime.refreshLive({force:true}),error=>error instanceof FiveUsdRateGuardError&&error.code==='FIVEUSD_LIVE_RATE_GUARD');
  for(let i=0;i<3;i++) await runtime.refreshUpcoming({force:true});
  await assert.rejects(()=>runtime.refreshUpcoming({force:true}),error=>error instanceof FiveUsdRateGuardError&&error.code==='FIVEUSD_SCHEDULED_RATE_GUARD');
  assert.equal(calls,23);
  assert.equal((await runtime.liveRate()).usedLast60s,20);
  assert.equal((await runtime.upcomingRate()).usedLast60s,3);
  assert.equal((await runtime.globalRate()).usedLast60s,23);
});

test('lane locks can be disabled by settings while provider hard ceiling remains enforced',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response({data:[],pagination:{has_more:false}});};
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_LIVE_REQUEST_BUDGET_PER_60S:'0',
    FIVEUSD_UPCOMING_REQUEST_BUDGET_PER_60S:'0',
    FIVEUSD_REFEREE_REQUEST_BUDGET_PER_60S:'0',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'2',
  },{fetchImpl,clock:()=>200000});
  await runtime.refreshLive({force:true});
  await runtime.refreshUpcoming({force:true});
  await assert.rejects(()=>runtime.refreshLive({force:true}),error=>error instanceof FiveUsdRateGuardError&&error.code==='FIVEUSD_GLOBAL_RATE_GUARD');
  assert.equal(calls,2);
  const live=await runtime.liveRate();
  assert.equal(live.unlocked,true);
  assert.equal(live.configuredCeiling,null);
  assert.equal((await runtime.globalRate()).usedLast60s,2);
});

test('referee path keeps an independently configurable guard and remains shadow-only',async()=>{
  let calls=0;
  const books=['1xbet','bet365','macauslot','crown','easybets','vcbet','interwetten','12bet','18bet','pinnacle'];
  const fetchImpl=async()=>{
    calls++;
    return response({bookmakers:books.map(slug=>({slug,odds:{asian_handicap:{inplay:{line:-0.5,home:1.91,away:1.99}}}}))});
  };
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_REFEREE_REQUEST_BUDGET_PER_60S:'10',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'40',
  },{fetchImpl,clock:()=>300000});
  for(let i=0;i<10;i++){
    const row=await runtime.refreshReferee(String(i+1),{force:true});
    assert.equal(row.referees.length,10);
    assert.equal(row.shadowOnly,true);
    assert.equal(row.votingEnabled,false);
  }
  await assert.rejects(()=>runtime.refreshReferee('11',{force:true}),error=>error instanceof FiveUsdRateGuardError&&error.code==='FIVEUSD_REFEREE_RATE_GUARD');
  assert.equal(calls,10);
  const rate=await runtime.refereeRate();
  assert.equal(rate.usedLast60s,10);
  assert.equal(rate.configuredCeiling,10);
});

test('native cadence and lane budgets are driven by settings, not hard-coded card-era limits',async()=>{
  const runtime=new FiveUsdNativeRuntime(new MemoryStorage(),{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_LIVE_REFRESH_MS:'5000',
    FIVEUSD_UPCOMING_REFRESH_MS:'45000',
    FIVEUSD_REFEREE_REFRESH_MS:'7000',
    FIVEUSD_LIVE_REQUEST_BUDGET_PER_60S:'18',
    FIVEUSD_UPCOMING_REQUEST_BUDGET_PER_60S:'4',
    FIVEUSD_REFEREE_REQUEST_BUDGET_PER_60S:'12',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'38',
  });
  const health=await runtime.health();
  assert.equal(health.cadence.cycleMs,5000);
  assert.equal(health.cadence.upcomingRefreshMs,45000);
  assert.equal(health.cadence.refereeRefreshMs,7000);
  assert.equal(health.rate.live.configuredCeiling,18);
  assert.equal(health.rate.upcoming.configuredCeiling,4);
  assert.equal(health.rate.referee.configuredCeiling,12);
  assert.equal(health.rate.global.globalCeiling,38);
});
