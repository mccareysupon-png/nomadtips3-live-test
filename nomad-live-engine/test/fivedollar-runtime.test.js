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
  assert.equal(health.rate.core.usedLast60s,2);
});

test('core request guard blocks request 21 inside 60 seconds',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response({data:[],pagination:{has_more:false}});};
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x'},{fetchImpl,clock:()=>100000});
  for(let i=0;i<20;i++) await runtime.refreshLive({force:true});
  await assert.rejects(()=>runtime.refreshLive({force:true}),error=>error instanceof FiveUsdRateGuardError&&error.code==='FIVEUSD_CORE_RATE_GUARD');
  assert.equal(calls,20);
  const rate=await runtime.coreRate();
  assert.equal(rate.usedLast60s,20);
  assert.equal(rate.internalCeiling,20);
});

test('referee path keeps a separate 10/min guard and remains shadow-only',async()=>{
  let calls=0;
  const books=['1xbet','bet365','macauslot','crown','easybets','vcbet','interwetten','12bet','18bet','pinnacle'];
  const fetchImpl=async()=>{
    calls++;
    return response({bookmakers:books.map(slug=>({slug,odds:{asian_handicap:{inplay:{line:-0.5,home:1.91,away:1.99}}}}))});
  };
  const storage=new MemoryStorage();
  const runtime=new FiveUsdNativeRuntime(storage,{FIVEUSD_NATIVE_MODE:'shadow',FIVEDOLLAR_API_KEY:'x'},{fetchImpl,clock:()=>200000});
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
});
