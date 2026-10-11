import {createHash} from "node:crypto";
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`,worker="nomadtips3-engine-343";
async function get(path){const res=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(40000)});const body=await res.json();if(!res.ok||!body?.success)throw Error("CF_"+res.status);return body.result;}
const dep=await get(`/scripts/${worker}/deployments`),active=dep.deployments[0].versions;
if(active.length!==1||Number(active[0].percentage)!==100)throw Error("ACTIVE_NOT_UNIQUE");
const v=await get(`/workers/${worker}/versions/${active[0].version_id}?include=modules`),m=v.modules.find(x=>x.name===v.main_module),source=Buffer.from(m.content_base64,"base64").toString("utf8");
const lines=source.split("\n");
console.log("JOHN_AUDIT_ACTIVE",JSON.stringify({version:active[0].version_id,bytes:source.length,sha:createHash("sha256").update(source).digest("hex")}));
const patterns=["Ball46 GOALS Over Under","function isVerifiedGoalMarket(","function isVerifiedCornerMarket(","let goalTickRequests","let verifiedGoal=null","const requiresFullMarket=","if (!full && !marketCandidates.some(","if (!full && !isVerifiedCornerMarket","if (!full && !isVerifiedCornerMarket(key) && !isVerifiedGoalMarket(key))","const best = pickBestPriced(cands,verifiedGoal","priceSource: verifiedGoal","priceReference: verifiedGoal","GOAL_LIVE_PRICE_UNVERIFIED","function pickBestPriced(","function consensusProviderLine(","function offersFor(","FULL_MARKET_REQUESTS_PER_SCAN","FINAL_RECHECK_MAX_PER_SCAN"];
for(const pattern of patterns){const indexes=lines.map((line,i)=>line.includes(pattern)?i:-1).filter(i=>i>=0);for(const idx of indexes.slice(0,6)){
  let before=pattern.includes("let verifiedGoal")?8:3,after=pattern.includes("let verifiedGoal")?29:7;
  console.log("JOHN_AUDIT_SOURCE",JSON.stringify({pattern,line:idx+1,count:indexes.length,code:lines.slice(Math.max(0,idx-before),Math.min(lines.length,idx+after+1)).join("\n").slice(0,7000)}));
}}
