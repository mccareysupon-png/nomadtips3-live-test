import assert from'node:assert/strict';
import{writeFile,mkdir}from'node:fs/promises';
import{BASE_VERSION,JS_ROUTE,NEW_TAG,sha}from'./patch.mjs';
const current='55e8db05-c9a7-4665-b9fe-ada34e57804f',deployment='895233f1-557e-4768-81bf-e09d6a726483';
const htmlHash='993b3d079e83bd7a72e7977a485183b400ca0965365407f614b8ec28d8fd7c06',jsHash='457fbabd07d04b75831147774b3afcccb4c91873892d670a2e15143262f4d89b';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert(token&&account);
const api=async(path)=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)}),j=await r.json();assert(r.ok&&j.success,'CF_READ_FAILED');return j.result;};
const live=(await api('/workers/scripts/ball46-production/deployments?per_page=1')).deployments[0];
assert.equal(live.id,deployment);assert.deepEqual(live.versions,[{version_id:current,percentage:100}]);
const hosts=['https://ball46.com','https://www.ball46.com'];const checks=[];
for(const host of hosts){
 for(const [path,expected]of [['/',htmlHash],['/index.html',htmlHash],[JS_ROUTE,jsHash]]){
  const u=new URL(path,host);u.searchParams.set('atomicPostVerify',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());
  assert.equal(r.status,200);assert.equal(sha(b),expected,'POST_DEPLOY_HASH_DRIFT_'+host+path);
  if(path==='/')assert(b.toString().includes(NEW_TAG),'NEW_SCRIPT_MISSING');
  if(path===JS_ROUTE){assert.equal(r.headers.get('x-ball46-signal-ui'),'atomic-v11-20261023');assert(b.toString().includes("host.dataset.v11Count=String(rows.length)"));}
  checks.push({host,path,status:r.status,sha:expected});
 }
 for(const p of ['/favicon-192.png','/robots.txt','/api/engine/health','/api/full-market/health']){
  const u=new URL(p,host);u.searchParams.set('atomicPostVerify',Date.now());const r=await fetch(u,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,'PATH_FAILED_'+p);
  if(p.endsWith('/health'))assert.equal((await r.json()).ok,true);checks.push({host,path:p,status:r.status});
 }
}
const result={at:new Date().toISOString(),active:current,deployment:live.id,prior:BASE_VERSION,checks,ok:true};
await mkdir('audit',{recursive:true});await writeFile('audit/post-deploy.json',JSON.stringify(result,null,2));
console.log('BALL46_SIGNALS_POST_VERIFY='+JSON.stringify({ok:true,active:current,deployment:live.id,checks:checks.length}));
