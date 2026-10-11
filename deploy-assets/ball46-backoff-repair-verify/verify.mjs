import {createHash} from "node:crypto";
const cfRoot=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers`;
const token=process.env.CLOUDFLARE_API_TOKEN;
async function cloud(path){const r=await fetch(cfRoot+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(22000)});const x=await r.json();if(!r.ok||x?.success!==true)throw Error("CLOUDFLARE_READ_"+r.status);return x.result}
for(const worker of ["nomadtips3-engine-343","nomadtips3-full-market-343-ball46"]){
 const v=await cloud(`/scripts/${worker}/deployments`);const active=v.deployments?.[0]?.versions?.find(x=>Number(x.percentage)===100);
 console.log("VERIFY_ACTIVE",JSON.stringify({worker,id:active?.version_id,at:v.deployments?.[0]?.created_on}));
}
const base="https://www.ball46.com";
async function get(path){
 const r=await fetch(base+path+(path.includes("?")?"&":"?")+"backoffVerify="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(24000)});const j=await r.json().catch(()=>null);
 if(!r.ok||j?.ok===false)console.log("VERIFY_ENDPOINT_ERROR",JSON.stringify({path,http:r.status,message:j?.error}));
 return {http:r.status,j};
}
for(let n=0;n<2;n++){
const [full,health,signals,board,ledger,settings]=await Promise.all([
 get("/api/full-market/health"),get("/api/engine/health"),get("/api/engine/signals"),
 get("/api/engine/board"),get("/api/engine/ledger-health"),get("/api/engine/settings")]);
const fullJ=full.j||{},h=health.j||{},sig=signals.j||{},b=board.j||{},l=ledger.j||{},set=settings.j||{};
const errors=h.refereeErrors||[];let hist={};for(const e of errors){const s=String(e.error||e.message||e);hist[s]=(hist[s]||0)+1}
const signalArr=Array.isArray(sig.signals)?sig.signals:[];
const repairTime=Date.parse("2026-10-11T12:16:14Z");
console.log("VERIFY_RUNTIME",JSON.stringify({n,time:new Date().toISOString(),
 fullMarket:{http:full.http,version:fullJ.version,mode:fullJ.mode,blockedUntil:fullJ.blockedUntil,retryAfterSec:fullJ.retryAfterSec,
 callsLast60s:fullJ.callsLast60s,budget:fullJ.maxFullMarketCallsPerMinute,remaining:fullJ.remainingLocalBudget,providerMeta:fullJ.providerMeta},
 engine:{http:health.http,startedAt:h.startedAt,finishedAt:h.finishedAt,scanAgeSeconds:Number.isFinite(h.finishedAt)?Math.round((Date.now()-h.finishedAt)/1000):null,
 liveCount:h.liveCount,fixtureCount:h.fixtureCount,signalCount:h.signalCount,refereeRequests:h.refereeRequests,refereeQueued:h.refereeQueued,
 externalOddsRequests:h.externalOddsRequests,refereeErrorCount:errors.length,errorTypes:hist,lastError:h.lastError},
 signals:{http:signals.http,visible:signalArr.length,workingTotal:sig.allCount,newSinceRepair:signalArr.filter(x=>Number(x.createdAt)>repairTime).length,
 latestCreated:signalArr.slice().sort((a,b)=>Number(b.createdAt)-Number(a.createdAt)).slice(0,4).map(x=>({market:x.market,at:x.createdAt,fixtureId:x.fixtureId}))},
 board:{http:board.http,hubAgeMs:b.hubAgeMs,stale:b.stale,fixtures:b.fixtures?.length,live:b.counts?.live,
 referee:b.referee?{requests:b.referee.requests,queued:b.referee.queued,errorCount:b.referee.errors?.length}:null},
 ledger:{http:ledger.http,total:l.ledgerTotal,settled:l.settledTotal,pending:l.pending},
 runState:{http:settings.http,ft_over:set.runState?.ft_over,ft_corner_over:set.runState?.ft_corner_over,ft_1x2:set.runState?.ft_1x2,ft_ah:set.runState?.ft_ah}}));
if(n===0)await new Promise(done=>setTimeout(done,11000));
}
console.log("POST_REPAIR_READONLY_AUDIT_DONE");