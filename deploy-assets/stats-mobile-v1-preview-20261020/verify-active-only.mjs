import assert from 'node:assert/strict';
const id=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const u='https://api.cloudflare.com/client/v4/accounts/'+id+'/workers/scripts/ball46-production/deployments?per_page=1';
const r=await fetch(u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));
console.log('BALL46_MOBILE14_PRODUCTION_ACTIVE_NOW',JSON.stringify(j.result.deployments[0].versions));
for(const domain of ['https://ball46.com','https://www.ball46.com']){
 const x=await fetch(domain+'/?mobile14_status_readonly='+Date.now(),{signal:AbortSignal.timeout(30000)});const html=await x.text();
 console.log('BALL46_MOBILE14_PUBLIC_HTML_NOW',JSON.stringify({domain,http:x.status,oldPC14:html.includes('b46-statistics-v23-allthemes-repaired-20261020'),mobileKPI14:html.includes('b46-mobile-stats-14-kpi-7x2-20261020'),mobileHistory:html.includes('b46-mobile-stats-clean-v1-20261020'),bytes:html.length}));
}
