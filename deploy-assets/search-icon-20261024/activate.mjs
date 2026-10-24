import assert from'node:assert/strict';
import{createHash}from'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-production',BASE='a456929a-3350-4376-ad8a-65da47c04291',NEXT='b64e9766-5a92-47ca-835e-4ebac8c060ba';
const NEW='e13bb183c9a27398adfedac3c06410b928a32a00adc84e65f0f91b9b483f9416';
assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
async function cf(p,body){
 if(body)assert.equal(p,'/workers/scripts/'+W+'/deployments');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+T,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(80000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+r.status+JSON.stringify(j.errors).slice(0,200));return j.result;
}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return d.versions[0].version_id;}
const digest=b=>createHash('sha256').update(b).digest('hex');
async function get(host,p){const r=await fetch(host+p+'?searchFixVerify='+Date.now()+Math.random(),{signal:AbortSignal.timeout(55000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:digest(b),text:b.toString()}}
async function change(to,expected,msg){assert.equal(await active(),expected,'ACTIVE_VERSION_CHANGED');const r=await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':msg}});return r.id;}
const hosts=['https://ball46.com','https://www.ball46.com'],paths=['/signal.html','/signal-next.js','/statistics.html','/dashboard-v2-stage3-featured-facts-20261013a.js'];
let deployed=false;try{
 assert.equal(await active(),BASE,'BASE_CHANGED_DO_NOT_OVERWRITE');
 const ver=await cf('/workers/workers/'+W+'/versions/'+NEXT+'?include=modules');
 assert.equal(ver.annotations?.['workers/tag'],'BALL46_SEARCH_ICON_ONLY_20261024','WRONG_CANDIDATE');
 const before=new Map();for(const host of hosts)for(const p of paths){const r=await get(host,p);before.set(host+p,r);}
 const settings=JSON.stringify(await cf('/workers/scripts/'+W+'/settings'));
 const preview=await get('https://b64e9766-ball46-production.mccarey-supon.workers.dev','/');
 assert.equal(preview.sha,NEW,'CANDIDATE_NOT_APPROVED');
 const deployId=await change(NEXT,BASE,'Search input borderless and placeholder hidden; preserve search and all other systems');deployed=true;
 let consecutive=0;
 for(let i=0;i<30&&consecutive<2;i++){
  assert.equal(await active(),NEXT,'OTHER_DEPLOY_DETECTED');
  let ok=true;for(const host of hosts){const h=await get(host,'/');if(h.status!==200||h.sha!==NEW)ok=false;}
  consecutive=ok?consecutive+1:0;if(consecutive<2)await new Promise(r=>setTimeout(r,2000));
 }
 assert.equal(consecutive,2,'HOMEPAGE_NOT_UPDATED');
 for(const host of hosts){
  for(const p of paths){const a=before.get(host+p),b=await get(host,p);assert.equal(b.status,a.status,'STATUS_DRIFT_'+p);assert.equal(b.sha,a.sha,'ASSET_DRIFT_'+p);}
  for(const p of ['/api/engine/health','/api/engine/signals','/api/full-market/health']){
   const r=await get(host,p);assert.equal(r.status,200,p);assert.equal(JSON.parse(r.text).ok,true,p);
  }
 }
 assert.equal(JSON.stringify(await cf('/workers/scripts/'+W+'/settings')),settings,'SETTINGS_CHANGED');
 console.log('B46_SEARCH_ICON_DEPLOY_PASS='+JSON.stringify({ok:true,version:NEXT,deployment:deployId,domains:2,unrelated:paths.length,apiChecks:6,searchStyle:'borderless/icon-only'}));
}catch(e){console.error('B46_SEARCH_ICON_DEPLOY_FAIL='+String(e.message||e));
 if(deployed){try{if(await active()===NEXT)console.log('ROLLBACK_DEPLOYMENT='+await change(BASE,NEXT,'Rollback failed search icon UI change'));}catch(x){console.error('ROLLBACK_ERROR='+String(x.message||x))}}
 process.exitCode=1;
}