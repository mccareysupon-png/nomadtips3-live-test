import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parse } from "acorn";
import { patchMissingHubEarlyFinal } from "./patch.mjs";

const activeFile=process.env.B46_ACTIVE_SOURCE;
assert(activeFile,"B46_ACTIVE_SOURCE_REQUIRED");
const original=readFileSync(activeFile,"utf8"),patched=patchMissingHubEarlyFinal(original);
assert(patched.length>original.length);
assert.throws(()=>patchMissingHubEarlyFinal(patched));
const tree=parse(patched,{ecmaVersion:"latest",sourceType:"module"});
const methods=[];
const walk=n=>{if(!n||typeof n!=="object")return;if(n.type==="MethodDefinition"&&n.key?.name==="autoReconcileMissingFinals")methods.push(n);
for(const [k,v] of Object.entries(n)){if(k==="start"||k==="end")continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==="object")walk(v)}};
walk(tree);assert.equal(methods.length,1);
const method=patched.slice(methods[0].start,methods[0].end);
assert(method.includes("phase2IsEarly(sig)"));
assert(method.includes("FINAL_RECHECK_INTERVAL_MS"));
assert(method.includes("FINAL_RECHECK_MAX_PER_SCAN"));
const test=(name,fn)=>fn().then(()=>console.log("QA_OK",name));
const make=(fixtureId="f",market="ft_over",line=2.5,source="LIVE_OVER_EARLY_V1")=>({
  id:"sig-"+fixtureId+"-"+market,fixtureId,market,line,selection:"OVER",status:"SETTLED",result:"WIN",
  settlementSource:source,createdAt:1000000,settledAt:1000100,finalScore:{home:1,away:2},finalCorners:{home:5,away:5}
});
const final=(fixtureId="f",goals={home:1,away:2},corners={home:5,away:5},status="finished")=>({fixtureId,status,goals,corners,minute:90});
async function runCase(rows,fixture,options={}) {
  const ctx={rows:structuredClone(rows),board:{fixtures:options.board||[]},state:structuredClone(options.state||{}),writes:0,requests:0,fixture,
    http:options.http??200,now:options.now??600000000};
  const b={
    now2:()=>ctx.now,
    phase2IsEarly:s=>s?.status==="SETTLED"&&s?.settlementSource==="LIVE_OVER_EARLY_V1",
    readWorkingSignals:async()=>ctx.rows,
    writeWorkingSignals:async(_ctx,signals)=>{ctx.writes++;ctx.rows=structuredClone(signals);},
    clone2:x=>x===undefined?null:structuredClone(x),num3:x=>x==null?null:Number(x),
    normalizeFinalFixture:fixture=>fixture,
    isFinished2:f=>f?.status==="finished",
    periodComplete:(sig,fixture)=>fixture?.status==="finished",
    settleMarketSignal:(sig,f)=>{const x=sig.market.includes("corner")?f.corners:f.goals;
      const h=x?.home,a=x?.away;if(!Number.isFinite(h)||!Number.isFinite(a))return null;
      const total=h+a;
      return total>sig.line?"WIN":total<sig.line?"LOSS":"PUSH";},
    FINAL_RECHECK_STATE_KEY:"state",
    FINAL_RECHECK_INTERVAL_MS:900000,
    FINAL_RECHECK_MIN_SIGNAL_AGE_MS:0,
    FINAL_RECHECK_MAX_PER_SCAN:3,
    FINAL_RECHECK_TIMEOUT_MS:12000,
    FINAL_RECONCILE_VERSION:"missing-final-direct-v1",
    SETTLEMENT_REVISION:"bet365-rules-v2",
    AbortController,setTimeout,clearTimeout,
    fetch:async()=>{ctx.requests++;return {ok:ctx.http===200,status:ctx.http,json:async()=>ctx.fixture};}
  };
  const Worker=vm.runInNewContext("class TestEngine {"+method+"}; TestEngine",b);
  const engine=new Worker();
  engine.env={FIVEDOLLAR_API_KEY:"test-only"};
  engine.ctx={storage:{
    get:async key=>key==="board"?ctx.board:key==="state"?ctx.state:null,
    put:async(key,value)=>{if(key==="state")ctx.state=value;}
  }};
  const result=await engine.autoReconcileMissingFinals();
  return {ctx,result};
}
await test("Early WIN missing HUB confirmed FT",async()=>{
  const t=await runCase([make()],final());
  assert.equal(t.result.checked,1);assert.equal(t.ctx.requests,1);assert.equal(t.result.settledSignals,1);
  assert.equal(t.ctx.rows[0].result,"WIN");assert.equal(t.ctx.rows[0].settlementSource,"DIRECT_FINAL_FALLBACK");
  assert.equal(t.ctx.rows[0].mirrorStatus,"finished");
});
await test("VAR changed final result recorded",async()=>{
  const t=await runCase([make()],final("f",{home:1,away:1}));
  assert.equal(t.ctx.rows[0].result,"LOSS");assert.equal(t.ctx.rows[0].previousResult,"WIN");
  assert.equal(t.ctx.rows[0].reconciledAt,t.ctx.now);
  assert.equal(t.ctx.rows[0].status,"SETTLED");
});
await test("missing-HUB Corners OVER confirmed",async()=>{
  const t=await runCase([make("f","ft_corner_over",9.5)],final());
  assert.equal(t.ctx.rows[0].result,"WIN");assert.equal(t.ctx.rows[0].settlementSource,"DIRECT_FINAL_FALLBACK");
});
await test("FT incomplete does not mark confirmed",async()=>{
  const s=make(),t=await runCase([s],final("f",null,null));
  assert.equal(t.ctx.rows[0].settlementSource,"LIVE_OVER_EARLY_V1");
  assert.equal(t.ctx.rows[0].status,"SETTLED");assert.equal(t.result.incompleteFinalData,1);
});
await test("HTTP 429 does not falsify WIN",async()=>{
  const t=await runCase([make()],final(),{http:429});
  assert.equal(t.result.errors,1);assert.equal(t.ctx.rows[0].settlementSource,"LIVE_OVER_EARLY_V1");
});
await test("not yet FT does not falsely confirm",async()=>{
  const t=await runCase([make()],final("f",{home:1,away:2},{home:5,away:5},"live"));
  assert.equal(t.result.settledSignals,0);assert.equal(t.ctx.rows[0].settlementSource,"LIVE_OVER_EARLY_V1");
});
await test("fixture present in HUB is skipped",async()=>{
  const t=await runCase([make()],final(),{board:[{fixtureId:"f"}]});
  assert.equal(t.result.checked,0);assert.equal(t.ctx.requests,0);
});
await test("already final-confirmed is not fetched",async()=>{
  const t=await runCase([make("f","ft_over",2.5,"EXTERNAL_FINAL_BRIDGE")],final());
  assert.equal(t.result.checked,0);
});
await test("existing pending route stays active",async()=>{
  const s=make();s.status="PENDING";s.result="PENDING";s.settlementSource=null;
  const t=await runCase([s],final());assert.equal(t.result.settledSignals,1);
});
await test("one call per fixture groups early and pending",async()=>{
  const s=make(),p=make("f","ft_corner_over",9.5,null);p.status="PENDING";p.result="PENDING";
  const t=await runCase([s,p],final());
  assert.equal(t.ctx.requests,1);assert.equal(t.result.settledSignals,2);
});
await test("maximum three fixture checks per scan",async()=>{
  const rows=Array.from({length:8},(_,i)=>make("f"+i));
  const t=await runCase(rows,final("f0"));
  assert.equal(t.result.checked,3);assert.equal(t.ctx.requests,3);
});
await test("same 15 minute retry cooldown",async()=>{
  const t=await runCase([make()],final(),{state:{f:{checkedAt:600000000-200000}}});
  assert.equal(t.result.checked,0);assert.equal(t.ctx.requests,0);
});
console.log("PHASE3_ACTIVE_METHOD_REGRESSION_PASS",JSON.stringify({checks:12,sourceBytes:original.length,patchedBytes:patched.length}));
