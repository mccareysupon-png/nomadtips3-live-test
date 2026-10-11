const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN;
if(!acc||!tok)throw Error("CLOUDFLARE_AUTH_UNAVAILABLE");
const base=`https://api.cloudflare.com/client/v4/accounts/${acc}/workers`,worker="nomadtips3-engine-343";
const get=async(path)=>{const r=await fetch(base+path,{headers:{Authorization:`Bearer ${tok}`},signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||!j.success)throw Error(`CF_${r.status}`);return j.result;};
const d=await get(`/scripts/${worker}/deployments`),active=d.deployments?.[0]?.versions?.filter(x=>Number(x.percentage)===100);
if(active?.length!==1)throw Error("ACTIVE_NOT_UNIQUE");
const v=await get(`/workers/${worker}/versions/${active[0].version_id}?include=modules`),main=v.modules?.find(x=>x.name===v.main_module);
if(!main?.content_base64)throw Error("MAIN_MODULE_MISSING");
const s=Buffer.from(main.content_base64,"base64").toString("utf8"),lines=s.split("\n");
const {createHash}=await import("node:crypto");
console.log("CURRENT_WORKER",JSON.stringify({versionId:active[0].version_id,bytes:s.length,sha:createHash("sha256").update(s).digest("hex"),phase1:s.includes("var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;"),phase2:s.includes("LIVE_OVER_EARLY_V1")}));
for(const pattern of ["async autoReconcileMissingFinals() {","async compactWorkingSignalsAfterLedger() {","await this.autoReconcileMissingFinals()","async reconcileExternalFinal(request) {"]){
 const ix=lines.findIndex(x=>x.includes(pattern));
 console.log("METHOD_SECTION",JSON.stringify({pattern,at:ix+1,body:ix<0?null:lines.slice(Math.max(0,ix-1),Math.min(lines.length,ix+(pattern.includes("autoReconcileMissingFinals() {")?95:pattern.includes("compactWorking")?21:pattern.includes("reconcileExternalFinal")?49:6))).join("\n").slice(0,19800)}));
}
