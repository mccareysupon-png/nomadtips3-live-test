import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,"NO_CLOUDFLARE_CREDENTIALS");
const DRY=process.env.CANARY_QUOTA_DRY_RUN==="1",base="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers";
const CANARIES=[
 {name:"nomadtips3-343-central-cache-canary",id:"6777de59-8fd7-44eb-94dd-17f3950347a6"},
 {name:"nomadtips3-343-full-market-central-canary",id:"4fcf795f-91ac-417c-8609-43497416c746"},
 {name:"nomadtips3-5usd-hub-343-stable-canary",id:"4134978b-88d5-49bb-84ec-07b255460af9"}
];
const PROTECTED=[
 {name:"nomadtips3-engine-343",id:"d5e2cfba-0ec8-4098-ae4c-41cda0a18689",cron:"* * * * *"},
 {name:"nomadtips3-5usd-hub-343",id:"2b01dc85-a525-4283-959e-8f6db796c81e",cron:"*/2 * * * *"},
 {name:"nomadtips3-full-market-343-ball46",id:"3a53ee1a-467c-4a20-9f50-ba749e8adab4",cron:"1-59/2 * * * *"}
];
async function cf(path,update){
 const r=await fetch(base+path,{method:update?"PUT":"GET",
  headers:{Authorization:"Bearer "+token,...(update?{"Content-Type":"application/json"}:{})},
  body:update?JSON.stringify(update):undefined,signal:AbortSignal.timeout(30000)});
 const j=await r.json().catch(()=>({}));
 assert(r.ok&&j.success===true,"CLOUDFLARE_"+r.status+"_"+path+"_"+JSON.stringify(j?.errors||[]).slice(0,200));
 return j.result;
}
const readCron=async n=>(await cf("/scripts/"+n+"/schedules")).schedules.map(x=>x.cron);
async function active(n){
 const ds=await cf("/scripts/"+n+"/deployments");
 const v=ds.deployments?.[0]?.versions||[];
 assert(v.length===1&&Number(v[0].percentage)===100,"SPLIT_ACTIVE_"+n);
 return v[0].version_id;
}
async function ledger(){
 const r=await fetch("https://www.ball46.com/api/engine/ledger-health?canary_fix="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(22000)});
 const j=await r.json();assert(r.ok&&j.ok===true&&j.ledgerTotal>0,"LEDGER_UNHEALTHY");
 return {total:j.ledgerTotal,settled:j.settledTotal};
}
mkdirSync("audit-canary",{recursive:true});
const log=(tag,obj)=>console.log(tag,JSON.stringify(obj));
const save=(obj)=>writeFileSync("audit-canary/quota-stop.json",JSON.stringify(obj,null,2));
const targets=[...CANARIES,...PROTECTED];
const before={};
for(const {name,id} of targets){
 const [version,cron]=await Promise.all([active(name),readCron(name)]);
 assert.equal(version,id,"WORKER_CHANGED_"+name);
 if(CANARIES.some(x=>x.name===name))assert.deepEqual(cron,["* * * * *"],"CANARY_CRON_CHANGED_"+name);
 else assert.deepEqual(cron,[PROTECTED.find(x=>x.name===name).cron],"PRODUCTION_CRON_CHANGED_"+name);
 before[name]={version,cron};
}
const beforeLedger=await ledger();
const changes=CANARIES.map(x=>({name:x.name,cronBefore:before[x.name].cron,cronAfter:[]}));
save({before,beforeLedger,changes,dryRun:DRY,utc:new Date().toISOString()});
log("CANARY_QUOTA_PREFLIGHT_PASS",{changes,protected:PROTECTED.map(x=>x.name),beforeLedger,dryRun:DRY});
if(DRY)process.exit(0);
let changed=[];
try{
 for(const target of CANARIES){
   for(const p of PROTECTED)assert.equal(await active(p.name),p.id,"MAIN_DEPLOY_CHANGED");
   assert.deepEqual(await readCron(target.name),["* * * * *"],"TARGET_CRON_CONCURRENT_CHANGE");
   const reply=await cf("/scripts/"+target.name+"/schedules",[]);
   assert.deepEqual((reply.schedules||[]).map(x=>x.cron),[],"WRITE_REPLY_NOT_EMPTY");
   changed.push(target.name);
   assert.deepEqual(await readCron(target.name),[],"READBACK_CRON_NOT_EMPTY");
 }
 for(const target of targets){
   assert.equal(await active(target.name),target.id,"CODE_DEPLOY_INTERVENED_"+target.name);
   assert.deepEqual(await readCron(target.name),
    CANARIES.some(x=>x.name===target.name)?[]:before[target.name].cron,
    "UNEXPECTED_SCHEDULE_CHANGE_"+target.name);
 }
 const afterLedger=await ledger();
 assert(afterLedger.total>=beforeLedger.total&&afterLedger.settled>=beforeLedger.settled,"LEDGER_REGRESSED");
 const report={result:"SUCCESS",disabledCanarySchedules:changed,protectedProductionCronsUnchanged:true,allWorkerSourcesUnchanged:true,beforeLedger,afterLedger};
 save({...before,...report});
 log("CANARY_QUOTA_FIX_SUCCESS",report);
}catch(error){
 const failures=[];
 for(const name of [...changed].reverse()){
  try{if((await readCron(name)).length===0&&await active(name)===before[name].version){
    await cf("/scripts/"+name+"/schedules",[{cron:"* * * * *"}]);
    assert.deepEqual(await readCron(name),before[name].cron,"RESTORE_CRON_MISMATCH");
  }}catch(e){failures.push({name,error:String(e?.message||e)})}
 }
 save({result:"FAILED",error:String(error?.message||error),rolledBackTargets:changed,rollbackFailures:failures,beforeLedger});
 log("CANARY_QUOTA_FIX_FAILED",{error:String(error?.message||error),rollbackFailures:failures});
 process.exitCode=1;
}
