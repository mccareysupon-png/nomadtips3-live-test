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

function rateLimitedResponse(){
  return new Response(JSON.stringify({error:'rate limited'}),{status:429,headers:{'content-type':'application/json','x-ratelimit-limit':'40','x-ratelimit-remaining':'0','retry-after':'1'}});
}

const baseFixture=(id,status,kickoff)=>({
  id,status,status_code:status==='live'?'25':'NS',kickoff_utc:kickoff,
  league:{name:'League'},teams:{home:{name:`H${id}`},away:{name:`A${id}`}},goals:{home:0,away:0},
  statistics:status==='live'?{attacks:{home:12,away:9},dangerous_attacks:{home:5,away:4},shots_on_target:{home:2,away:1},shots_off_target:{home:3,away:2},possession:{home:52,away:48}}:undefined,
});

const books=['1xbet','bet365','macauslot','crown','easybets','vcbet','interwetten','12bet','18bet','pinnacle'];

function refereeResponse(){
  return response({bookmakers:books.map(slug=>({slug,odds:{asian_handicap:{inplay:{line:-0.5,home:1.91,away:1.99}}}}))});
}

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

test('legacy lane budget variables cannot block LIVE, WAITING or REFEREE anymore',async()=>{
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    const parsed=new URL(url);
    if(parsed.pathname.includes('/odds')) return refereeResponse();
    return response({data:[],pagination:{has_more:false}});
  };
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_LIVE_REQUEST_BUDGET_PER_60S:'1',
    FIVEUSD_UPCOMING_REQUEST_BUDGET_PER_60S:'1',
    FIVEUSD_REFEREE_REQUEST_BUDGET_PER_60S:'1',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'6',
  },{fetchImpl,clock:()=>100000});

  await runtime.refreshLive({force:true});
  await runtime.refreshLive({force:true});
  await runtime.refreshUpcoming({force:true});
  await runtime.refreshUpcoming({force:true});
  await runtime.refreshReferee('1',{force:true});
  await runtime.refreshReferee('2',{force:true});

  assert.equal(calls,6);
  assert.equal((await runtime.liveRate()).usedLast60s,2);
  assert.equal((await runtime.upcomingRate()).usedLast60s,2);
  assert.equal((await runtime.refereeRate()).usedLast60s,2);
  for(const rate of [await runtime.liveRate(),await runtime.upcomingRate(),await runtime.refereeRate()]){
    assert.equal(rate.unlocked,true);
    assert.equal(rate.configuredCeiling,null);
    assert.equal(rate.guardScope,'GLOBAL_ONLY');
    assert.equal(rate.effectiveCeiling,6);
  }
});

test('one global hard ceiling is shared across all lanes',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response({data:[],pagination:{has_more:false}});};
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'2',
  },{fetchImpl,clock:()=>200000});

  await runtime.refreshLive({force:true});
  await runtime.refreshUpcoming({force:true});
  await assert.rejects(()=>runtime.refreshLive({force:true}),error=>error instanceof FiveUsdRateGuardError&&error.code==='FIVEUSD_GLOBAL_RATE_GUARD');
  assert.equal(calls,2);
  assert.equal((await runtime.globalRate()).usedLast60s,2);
});

test('global guard is a soft throttle for engine tick and never marks engine unhealthy',async()=>{
  const storage=new MemoryStorage();
  const fetchImpl=async url=>{
    const parsed=new URL(url);
    if(parsed.searchParams.get('status')==='live') return response({data:[baseFixture(1,'live','2026-09-13T11:30:00Z')],pagination:{has_more:false}});
    return response({data:[],pagination:{has_more:false}});
  };
  const runtime=new FiveUsdNativeRuntime(storage,{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'1',
  },{fetchImpl,clock:()=>300000});

  const state=await runtime.tick({force:true});
  assert.equal(state.ok,true);
  assert.equal(state.lastError,null);
  assert.equal(state.rateLimited,true);
  assert.equal(state.throttled.length,1);
  assert.equal(state.throttled[0].path,'waiting');
  assert.equal(state.throttled[0].code,'FIVEUSD_GLOBAL_RATE_GUARD');
});

test('provider HTTP 429 is a soft throttle, not an engine failure',async()=>{
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'40',
  },{fetchImpl:async()=>rateLimitedResponse(),clock:()=>400000});

  const state=await runtime.tick({force:true});
  assert.equal(state.ok,true);
  assert.equal(state.lastError,null);
  assert.equal(state.rateLimited,true);
  assert.ok(state.throttled.some(row=>row.code==='5USD_HTTP_429'));
});

test('pagination is not pre-blocked by reserving every possible page',async()=>{
  let pageCalls=0;
  const fetchImpl=async url=>{
    pageCalls++;
    const page=Number(new URL(url).searchParams.get('page')||1);
    if(page===1){
      return response({data:Array.from({length:50},(_,i)=>baseFixture(i+1,'live','2026-09-13T11:30:00Z')),pagination:{has_more:true}});
    }
    return response({data:[baseFixture(999,'live','2026-09-13T11:30:00Z')],pagination:{has_more:false}});
  };
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'40',
  },{fetchImpl,clock:()=>500000});

  const live=await runtime.refreshLive({force:true});
  assert.equal(pageCalls,2);
  assert.equal(live.fixtures.length,51);
  assert.equal(live.truncated,false);
  assert.equal((await runtime.globalRate()).usedLast60s,2);
});

test('native cadence remains settings-driven while all request lanes are unlocked',async()=>{
  const runtime=new FiveUsdNativeRuntime(new MemoryStorage(),{
    FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x',
    FIVEUSD_LIVE_REFRESH_MS:'5000',
    FIVEUSD_UPCOMING_REFRESH_MS:'45000',
    FIVEUSD_REFEREE_REFRESH_MS:'7000',
    FIVEUSD_GLOBAL_REQUEST_BUDGET_PER_60S:'38',
  });
  const health=await runtime.health();
  assert.equal(health.cadence.cycleMs,5000);
  assert.equal(health.cadence.upcomingRefreshMs,45000);
  assert.equal(health.cadence.refereeRefreshMs,7000);
  assert.equal(health.rate.live.configuredCeiling,null);
  assert.equal(health.rate.upcoming.configuredCeiling,null);
  assert.equal(health.rate.referee.configuredCeiling,null);
  assert.equal(health.rate.live.unlocked,true);
  assert.equal(health.rate.upcoming.unlocked,true);
  assert.equal(health.rate.referee.unlocked,true);
  assert.equal(health.rate.global.globalCeiling,38);
});
