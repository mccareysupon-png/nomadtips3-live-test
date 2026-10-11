import assert from "node:assert/strict";
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,"CLOUDFLARE_AUTH_REQUIRED");
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const fm="nomadtips3-full-market-343-ball46",hub="nomadtips3-5usd-hub-343",engine="nomadtips3-engine-343";
const OLD="*/2 * * * *",NEW="1-59/2 * * * *";
async function api(path,body){const res=await fetch(base+path,{method:body?"PUT":"GET",headers:{Authorization:`Bearer ${token}`,...body?{"Content-Type":"application/json"}:{}},
 body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});const j=await res.json().catch(()=>null);
 assert(res.ok&&j?.success===true,"CF_"+(body?"WRITE":"READ")+"_"+res.status+"_"+path+"_"+JSON.stringify(j?.errors||[]).slice(0,250));return j.result;}
const sched=name=>api(`/scripts/${name}/schedules`);
async function active(name){const d=await api(`/scripts/${name}/deployments`);const v=d.deployments?.[0]?.versions||[];assert(v.length===1&&Number(v[0].percentage)===100,"AMBIGUOUS_VERSION_"+name);return v[0].version_id;}
const before=await Promise.all([sched(fm),sched(hub),sched(engine),active(fm),active(hub),active(engine)]);
const [oldFM,oldHub,oldEngine,fmVersion,hubVersion,engineVersion]=before;
const crons=x=>(x?.schedules||[]).map(s=>s.cron);
console.log("CRON_COLLISION_PREFLIGHT",JSON.stringify({fm:crons(oldFM),hub:crons(oldHub),engine:crons(oldEngine),versions:{fm:fmVersion,hub:hubVersion,engine:engineVersion}}));
assert.deepEqual(crons(oldFM),[OLD],"FULL_MARKET_SCHEDULE_CHANGED");
assert.deepEqual(crons(oldHub),[OLD],"HUB_SCHEDULE_CHANGED");
assert.deepEqual(crons(oldEngine),["* * * * *"],"ENGINE_SCHEDULE_CHANGED");
assert.equal(fmVersion,"3a53ee1a-467c-4a20-9f50-ba749e8adab4","FULL_MARKET_ACTIVE_CODE_CHANGED");
assert.equal(hubVersion,"2b01dc85-a525-4283-959e-8f6db796c81e","HUB_ACTIVE_CODE_CHANGED");
// Avoid modifying schedules if another deploy changed the active Engine.
assert.equal(engineVersion,"42a8bf93-895c-4b10-898e-56c209165517","ENGINE_ACTIVE_VERSION_CHANGED");
const beforeLedgerResponse=await fetch("https://www.ball46.com/api/engine/ledger-health?cron_qa="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(22000)});
const beforeLedger=await beforeLedgerResponse.json();assert(beforeLedgerResponse.ok&&beforeLedger?.ok&&beforeLedger.ledgerTotal>0,"LEDGER_UNHEALTHY_PRE");
// Preserve the same two-minute rate; only stagger Full Market prewarm away from the HUB minute.
let changed=false;
try{
 const res=await api(`/scripts/${fm}/schedules`,[{cron:NEW}]);changed=true;
 assert.deepEqual(crons(res),[NEW],"CRON_WRITE_READBACK_RESPONSE_UNEXPECTED");
 const [afterFM,afterHub,afterEngine,afterFmVersion,afterHubVersion,afterEngineVersion]=await Promise.all([
  sched(fm),sched(hub),sched(engine),active(fm),active(hub),active(engine)]);
 assert.deepEqual(crons(afterFM),[NEW],"CRON_READBACK_INCORRECT");
 assert.deepEqual(crons(afterHub),[OLD],"HUB_SCHEDULE_CHANGED_AFTER");
 assert.deepEqual(crons(afterEngine),["* * * * *"],"ENGINE_SCHEDULE_CHANGED_AFTER");
 assert.equal(afterFmVersion,fmVersion,"FULL_MARKET_SOURCE_CHANGED");
 assert.equal(afterHubVersion,hubVersion,"HUB_SOURCE_CHANGED");
 assert.equal(afterEngineVersion,engineVersion,"ENGINE_SOURCE_CHANGED");
 const lr=await fetch("https://www.ball46.com/api/engine/ledger-health?cron_qa_post="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(22000)});
 const afterLedger=await lr.json();assert(lr.ok&&afterLedger?.ok&&afterLedger.ledgerTotal>=beforeLedger.ledgerTotal,"LEDGER_REGRESSED");
 console.log("CRON_STAGGER_SUCCESS",JSON.stringify({fullMarketCronBefore:OLD,fullMarketCronAfter:NEW,
  hubCronUnchanged:OLD,engineCronUnchanged:"* * * * *",fullMarketWorkerCodeUnchanged:true,engineWorkerCodeUnchanged:true,
  hubWorkerCodeUnchanged:true,ledgerBefore:beforeLedger.ledgerTotal,ledgerAfter:afterLedger.ledgerTotal}));
}catch(error){console.error("CRON_STAGGER_FAILED",String(error?.stack||error));
 if(changed){try{
   const current=crons(await sched(fm));
   if(current.length===1&&current[0]===NEW){await api(`/scripts/${fm}/schedules`,[{cron:OLD}]);assert.deepEqual(crons(await sched(fm)),[OLD]);console.log("CRON_STAGGER_ROLLBACK_SUCCESS");}
  }catch(e){console.error("CRON_STAGGER_ROLLBACK_FAILED",String(e?.stack||e));}
 }
 process.exitCode=1;
}