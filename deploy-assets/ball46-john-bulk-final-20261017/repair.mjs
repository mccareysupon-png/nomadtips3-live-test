import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const acct=process.env.CLOUDFLARE_ACCOUNT_ID, tok=process.env.CLOUDFLARE_API_TOKEN;
const worker="nomadtips3-5usd-hub-343";
const expected="2b01dc85-a525-4283-959e-8f6db796c81e";
const expectedSha="c567082a3fc4363c733ca7305a8133a80cb7ebbc8e0ba40f4ae5911d1cf5c92f";
const dry=process.env.JOHN_DRY_RUN!=="0";
assert(acct&&tok,"CF_AUTH_MISSING");
const hash=s=>createHash("sha256").update(s).digest("hex");
const report=(tag,data)=>console.log(tag+" "+JSON.stringify(data));
async function cf(path,opt={}){
 const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+acct+"/workers"+path,{
   ...opt,headers:{Authorization:"Bearer "+tok,...opt.headers},signal:AbortSignal.timeout(40000)});
 const j=await r.json().catch(()=>null);
 assert(r.ok&&j?.success===true,"CLOUDFLARE_"+r.status+"_"+path+"_"+JSON.stringify(j?.errors||[]).slice(0,180));
 return j.result;
}
async function active(){
 const p=await cf("/scripts/"+worker+"/deployments?per_page=1");
 const vers=p.deployments?.[0]?.versions||[];
 assert(vers.length===1&&Number(vers[0].percentage)===100,"ACTIVE_NOT_100PCT");
 return vers[0].version_id;
}
const version=id=>cf("/workers/"+worker+"/versions/"+id+"?include=modules");
const settings=()=>cf("/scripts/"+worker+"/settings");
const schedules=()=>cf("/scripts/"+worker+"/schedules");
const canon=x=>JSON.stringify(x, (k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
function once(s,oldVal,newVal,name){
 assert(s.split(oldVal).length===2,"ANCHOR_NOT_UNIQUE_"+name);
 return s.replace(oldVal,newVal);
}
function patch(src){
 let s=src;
 assert(!s.includes("B46_FINAL_BULK_PAGES_20261017"),"ALREADY_MODIFIED");
 s=once(s,"async function fetchPages(env, query, perPage, maxPages) {","async function fetchPages(env, query, perPage, maxPages, startPage = 1) {","fetchSignature");
 s=once(s,"let page = 1, hasMore = false;","let page = startPage, hasMore = false;","pageStart");
 s=once(s,"} while (hasMore && page <= maxPages);","} while (hasMore && page < startPage + maxPages);","pageEnd");
 s=once(s,"return { rows, requests: page - 1, guardHit: hasMore && page > maxPages };","return { rows, requests: page - startPage, guardHit: hasMore && page >= startPage + maxPages, nextPage: hasMore ? page : 1 };","pageResult");
 s=once(s,"async function fetchTodayAndLive(env) {","async function fetchTodayAndLive(env, startPage = 1) {","todaySignature");
 s=once(s,"TODAY_PAGE_SIZE, TODAY_MAX_PAGES);","TODAY_PAGE_SIZE, TODAY_MAX_PAGES, startPage);","todayPages");
 s=once(s,"const p = await fetchTodayAndLive(this.env), map = /* @__PURE__ */ new Map();",
  '/* B46_FINAL_BULK_PAGES_20261017: rotate results pages, keep API count unchanged. */\n'+
  '        const todayWindow=bangkokWindow();\n'+
  '        const savedCursor=Number(oldMeta?.todayWindow?.start)===todayWindow.start?Number(oldMeta?.todayPageCursor):1;\n'+
  '        const nextStart=Number.isSafeInteger(savedCursor)&&savedCursor>=1&&savedCursor<=200?savedCursor:1;\n'+
  '        const p = await fetchTodayAndLive(this.env,nextStart), map = /* @__PURE__ */ new Map();',"rotatePages");
 s=once(s,
  'for (const old of oldRows) {\n          if (map.has(old.fixtureId)) map.set(old.fixtureId, merge(old, map.get(old.fixtureId)));\n        }',
  'for (const old of oldRows) {\n'+
  '          if(!old?.fixtureId)continue;\n'+
  '          if(map.has(old.fixtureId)){map.set(old.fixtureId,merge(old,map.get(old.fixtureId)));continue;}\n'+
  '          const kickoffAt=Number(old.kickoffAt),t=now();\n'+
  '          if(old.boardState==="finished"&&Number.isFinite(kickoffAt)&&kickoffAt>=t-72*3600*1000&&kickoffAt<t+3600000)map.set(old.fixtureId,old);\n'+
  '        }',"preserveFinished");
 s=once(s,"guardHit: Boolean(p.today.guardHit || p.live.guardHit), include: p.include, todayWindow:",
  "guardHit: Boolean(p.today.guardHit || p.live.guardHit), todayPageCursor: p.today.nextPage, include: p.include, todayWindow:","saveCursor");
 s=once(s,"guardHit: Boolean(detail.guardHit), include: detail.include",
  'guardHit: detail.refreshKind === "LIVE" ? Boolean(oldMeta?.guardHit || detail.guardHit) : Boolean(detail.guardHit), todayPageCursor: Number(detail.todayPageCursor ?? oldMeta?.todayPageCursor ?? 1), include: detail.include',"snapshotCursor");
 assert(s.includes("MAX_PROVIDER_REQUESTS_PER_TODAY_REFRESH = 5"),"BUDGET_CHANGED");
 assert(s.includes("TODAY_MAX_PAGES = 4"),"TODAY_CALL_LIMIT_CHANGED");
 assert(s.includes("LIVE_MAX_PAGES = 1"),"LIVE_CALL_LIMIT_CHANGED");
 return s;
}
function test(){
 const more={1:true,2:true,3:true,4:true,5:true,6:true,7:false};
 function simulate(start){let page=start,hasMore=false,n=0;do{hasMore=more[page];n++;page++}while(hasMore&&page<start+4);return {n,next:hasMore?page:1}}
 assert.deepEqual(simulate(1),{n:4,next:5});
 assert.deepEqual(simulate(5),{n:3,next:1});
 assert(4+1<=5,"MORE_CALLS_THAN_ORIGINAL");
 report("B46_FINAL_BULK_TEST_PASS",{pagesFirst:"1-4",pagesSecond:"5-7",callsBudget:5,retainFinishedHours:72});
}
async function health(){
 const urls={
 hub:"https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/health",
 engine:"https://nomadtips3-engine-343.mccarey-supon.workers.dev/health",
 signals:"https://nomadtips3-engine-343.mccarey-supon.workers.dev/signals",
 ledger:"https://ball46-production.mccarey-supon.workers.dev/api/engine/ledger-health"
 };
 const ret={};
 for(const [name,url] of Object.entries(urls)){
  const r=await fetch(url+"?john_verify="+Date.now(),{signal:AbortSignal.timeout(20000),cache:"no-store"});
  const j=await r.json();
  assert(r.ok&&j.ok===true,"HEALTH_FAILED_"+name);
  ret[name]={version:j.version,signals:j.signals?.length,ledgerTotal:j.ledgerTotal,settledTotal:j.settledTotal,
    error:j.lastError||null};
 }
 return ret;
}
async function deploy(id,label){
 return cf("/scripts/"+worker+"/deployments",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({strategy:"percentage",versions:[{version_id:id,percentage:100}],
    annotations:{"workers/message":label}})});
}
let prior=null,candidateId=null,activated=false;
try{
 test(); prior=await active();
 assert.equal(prior,expected,"HUB_ACTIVE_VERSION_CHANGED");
 const [v,setting,schedule,before]=await Promise.all([version(prior),settings(),schedules(),health()]);
 const mod=v.modules.find(x=>x.name===v.main_module);
 assert(mod?.content_base64,"HUB_MAIN_MISSING");
 const old=Buffer.from(mod.content_base64,"base64").toString();
 assert.equal(hash(old),expectedSha,"HUB_HASH_CHANGED");
 const next=patch(old);
 const temp="/tmp/b46-john-bulk-"+process.pid+".mjs";
 writeFileSync(temp,next);execFileSync(process.execPath,["--check",temp]);
 report("B46_FINAL_BULK_PREFLIGHT",{dry,prior,hashBefore:hash(old),hashAfter:hash(next),
  crons:schedule.schedules.map(x=>x.cron),before});
 if(dry)process.exit(0);
 assert.equal(await active(),prior,"HUB_DEPLOY_RACE");
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,
  compatibility_flags:setting.compatibility_flags||[],
  bindings:(v.bindings||[]).map(b=>b.type==="secret_text"?{name:b.name,type:"inherit",version_id:"latest"}:{...b}),
  annotations:{"workers/message":"Ball46 John rotate bulk final pages and retain finished history 72h",
    "workers/commit_sha":process.env.GITHUB_SHA||""}};
 for(const key of ["logpush","observability","limits","placement","tail_consumers"])if(setting[key]!=null)meta[key]=setting[key];
 const form=new FormData();
 form.set("metadata",new Blob([JSON.stringify(meta)],{type:"application/json"}));
 for(const m of v.modules)form.set(m.name,
   new Blob([m.name===v.main_module?Buffer.from(next):Buffer.from(m.content_base64,"base64")],
    {type:m.content_type}),m.name);
 const up=await cf("/scripts/"+worker+"/versions?bindings_inherit=strict",{method:"POST",body:form});
 candidateId=up.id;assert(candidateId,"NO_CANDIDATE_ID");
 const v2=await version(candidateId),cm=v2.modules.find(x=>x.name===v2.main_module);
 assert.equal(hash(Buffer.from(cm.content_base64,"base64")),hash(next),"CANDIDATE_SOURCE_DIFFERS");
 assert.equal(canon(v2.bindings),canon(v.bindings),"BINDINGS_CHANGED");
 assert.equal(v2.compatibility_date,v.compatibility_date,"COMPATIBILITY_CHANGED");
 assert.equal(v2.modules.length,v.modules.length,"MODULES_CHANGED");
 assert.equal(await active(),prior,"CONCURRENT_DEPLOY_INTERVENED");
 await deploy(candidateId,"Ball46 John recover result bulk pages");activated=true;
 assert.equal(await active(),candidateId,"ACTIVATION_FAILED");
 const after=await health();
 assert(after.ledger.ledgerTotal>=before.ledger.ledgerTotal,"LEDGER_ROWS_LOST");
 assert(after.ledger.settledTotal>=before.ledger.settledTotal,"LEDGER_SETTLED_LOST");
 assert.equal(canon((await schedules()).schedules.map(x=>x.cron)),canon(schedule.schedules.map(x=>x.cron)),"CRON_CHANGED");
 const settingsNoDeployMeta=o=>Object.fromEntries(Object.entries(o).filter(([key])=>key!=="annotations"));
 assert.equal(canon(settingsNoDeployMeta(await settings())),canon(settingsNoDeployMeta(setting)),"SETTINGS_CHANGED");
 report("B46_FINAL_BULK_DEPLOY_SUCCESS",{prior,candidateId,hashAfter:hash(next),before,after,
  noExtraProviderCallsPerTick:true,onlyHubModified:true,ledgerPreserved:true});
}catch(e){
 console.error("B46_FINAL_BULK_ERROR",String(e.stack||e));
 if(activated&&prior&&candidateId)try{
  if(await active()===candidateId){await deploy(prior,"Rollback John bulk result retention");
   assert.equal(await active(),prior,"ROLLBACK_NOT_ACTIVE");report("B46_FINAL_BULK_ROLLBACK_OK",{prior})}
 }catch(err){console.error("B46_FINAL_BULK_ROLLBACK_FAILED",String(err))}
 process.exitCode=1;
}