const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account)throw Error("NO_CF_AUTH");
const root="https://api.cloudflare.com/client/v4";
const get=async p=>{const r=await fetch(root+p,{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(25000)});const j=await r.json().catch(()=>null);return {status:r.status,result:j?.result,success:j?.success,errors:j?.errors};};
const zones=await get("/zones?name=ball46.com&per_page=25");
console.log("ZONE_DISCOVERY",JSON.stringify({http:zones.status,success:zones.success,zones:(zones.result||[]).map(z=>({id:z.id,name:z.name,accountId:z.account?.id,status:z.status})),errors:zones.errors}));
for(const z of zones.result||[]){
 const r=await get(`/zones/${z.id}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
 console.log("REDIRECT_RULESET",JSON.stringify({zone:z.name,http:r.status,success:r.success,id:r.result?.id,version:r.result?.version,
 phase:r.result?.phase,rules:(r.result?.rules||[]).map(x=>({id:x.id,description:x.description,enabled:x.enabled,expression:String(x.expression||"").slice(0,160),action:x.action,action_parameters:x.action_parameters})).slice(0,20),errors:r.errors}));
}
