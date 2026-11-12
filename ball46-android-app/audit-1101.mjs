import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/ball46-production/deployments?per_page=5');
const active=d.deployments?.[0]?.versions?.[0]?.version_id;
console.log('ACTIVE='+active);
for(const url of ['https://ball46.com/','https://www.ball46.com/']){
 try{
  const r=await fetch(url,{redirect:'manual',headers:{'user-agent':'BALL46-Healthcheck/1.0'},signal:AbortSignal.timeout(30000)});
  const t=await r.text();
  console.log(url+' STATUS='+r.status+' CF_RAY='+(r.headers.get('cf-ray')||'')+' BODY='+JSON.stringify(t.slice(0,300)));
 }catch(e){console.log(url+' ERROR='+e.message)}
}
