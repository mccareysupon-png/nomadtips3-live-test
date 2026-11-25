import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CF_CREDS');
async function get(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers'+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors||[]));return j.result}
async function data(name){
 const d=await get('/scripts/'+name+'/deployments?per_page=1');
 const ver=d.deployments[0].versions[0].version_id;
 const v=await get('/workers/'+name+'/versions/'+ver+'?include=modules');
 const words=['B46_ADAPTIVE_NATIVE_CHART_30_90_V3','b46-adaptive-research-equity','ADAPTIVE OVER/UNDER 2.5','b46AdaptiveChartDays','B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125','b46pm-period-btn'];
 const found=v.modules.map(m=>{
  const src=Buffer.from(m.content_base64,'base64').toString('utf8');
  return {name:m.name,bytes:src.length,keys:words.filter(x=>src.includes(x))};
 }).filter(m=>m.keys.length);
 return {worker:name,version:ver,main:v.main_module,modules:v.modules.length,matches:found};
}
for(const name of ['ball46-production','ball46-premium-match-colors-test-20261120']){
 try{console.log('B46_ADAPTIVE_PREDEPLOY_SCOPE '+JSON.stringify(await data(name)))}catch(e){console.log('B46_ADAPTIVE_PREDEPLOY_SCOPE_ERROR '+name+':'+String(e))}
}
for(const url of ['https://ball46.com/?view=live','https://ball46.com/?b46pm=ou','https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=ou']){
 const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 const text=await r.text();
 console.log('B46_ADAPTIVE_PUBLIC_HTML '+JSON.stringify({url,status:r.status,size:text.length,markers:['b46-adaptive-research-equity','ADAPTIVE OVER/UNDER 2.5','__b46_prematch_client.js','b46pm=ou','b46-prematch-panel'].filter(k=>text.includes(k))}));
}
