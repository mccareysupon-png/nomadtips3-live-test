import { mkdirSync, writeFileSync } from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token) throw new Error('CLOUDFLARE_AUTH_MISSING');
const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
async function get(url){try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});const text=await r.text();let json=null;try{json=JSON.parse(text)}catch{};return {status:r.status,ok:r.ok,json:json?.result??json,error:json?.errors??null};}catch(e){return {status:0,ok:false,error:e.message};}}
const base='https://api.cloudflare.com/client/v4';
const report={checkedAt:new Date().toISOString(),account,zoneLookup:null,zone:null,cacheRules:null,pageRules:null,workerRoutes:null};
report.zoneLookup=await get(`${base}/zones?name=ball46.com&account.id=${encodeURIComponent(account)}`);
const zones=Array.isArray(report.zoneLookup.json)?report.zoneLookup.json:[];
const zone=zones.find(z=>z?.name==='ball46.com')||zones[0];
if(zone?.id){
 report.zone={id:zone.id,name:zone.name,status:zone.status,paused:zone.paused,type:zone.type};
 report.cacheRules=await get(`${base}/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`);
 report.pageRules=await get(`${base}/zones/${zone.id}/pagerules?status=active&per_page=100`);
 report.workerRoutes=await get(`${base}/zones/${zone.id}/workers/routes`);
}
mkdirSync('audit/cloudflare-cache-route',{recursive:true});
writeFileSync('audit/cloudflare-cache-route/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
