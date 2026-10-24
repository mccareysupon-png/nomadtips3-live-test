import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
assert(A&&T);
const W='ball46-production',BASE='79d7e063-7d48-4790-93ac-17e2fb22c755',NEXT='a456929a-3350-4376-ad8a-65da47c04291';
const hashes={'/':'8ba4fec5f99a16ed363e747f0cac5b4c6d0289f17173962d30be19566844fdc7','/dashboard-v2-stage3-featured-facts-20261013a.js':'e4d2e2147d396e50a5515c9129683cde6ca991ecc4ee5396597504a4a5e571e4'};
const hosts=['https://ball46.com','https://www.ball46.com'];
const dir='deploy-assets/corner-entry-20261024/audit',report={at:new Date().toISOString(),ok:false};await mkdir(dir,{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
const stable=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function cf(path,body){
 if(body!==undefined)assert.equal(path,'/workers/scripts/'+W+'/deployments');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+T,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(80000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors).slice(0,200));return j.result;
}
async function live(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return d.versions[0].version_id;}
async function read(url){const r=await fetch(url+'?cornerQA='+Date.now(),{signal:AbortSignal.timeout(60000),headers:{'cache-control':'no-cache'}}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,hash:digest(b),value:b.toString()};}
async function safeDeploy(version,expected){assert.equal(await live(),expected,'PRODUCTION_CHANGED');return (await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':'Featured Corner ENTRY snapshot only; no engine modifications'}})).id;}
async function inspectOriginal(){const out={};for(const path of['/signal.html','/signal-next.js','/statistics.html']){const r=await read(hosts[0]+path);assert.equal(r.status,200);out[path]=r.hash;}return out;}
async function assertEndpoints(){
 for(const host of hosts)for(const p of['/api/engine/health','/api/engine/signals','/api/full-market/health']){
 const r=await read(host+p);assert.equal(r.status,200);assert.equal(JSON.parse(r.value).ok,true,p);
 }}
let modified=false;
try{
 assert.equal(await live(),BASE,'BASE_DEPLOY_CHANGED_ABORT');
 const c=await cf('/workers/workers/'+W+'/versions/'+NEXT+'?include=modules');
 assert.equal(c.annotations?.['workers/tag'],'BALL46_CORNER_ENTRY_20261024');
 const unrelated=await inspectOriginal();
 const config=stable(await cf('/workers/scripts/'+W+'/settings'));
 await assertEndpoints();
 const preview='https://'+NEXT.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 for(const [p,hash]of Object.entries(hashes)){const r=await read(preview+p);assert.equal(r.status,200);assert.equal(r.hash,hash,'PREVIEW_CHANGED_'+p);}
 report.deployment=await safeDeploy(NEXT,BASE);modified=true;
 let confirmed=0;
 for(let tries=0;tries<32&&confirmed<2;tries++){
   assert.equal(await live(),NEXT,'CONCURRENT_DEPLOY_ABORT');
   let all=true;for(const host of hosts)for(const [p,hash]of Object.entries(hashes)){const r=await read(host+p);if(r.status!==200||r.hash!==hash)all=false;}
   confirmed=all?confirmed+1:0;if(confirmed<2)await new Promise(r=>setTimeout(r,2000));
 }
 assert.equal(confirmed,2,'NEW_ASSETS_NOT_LIVE');
 for(const host of hosts)for(const [p,hash]of Object.entries(unrelated)){const r=await read(host+p);assert.equal(r.status,200);assert.equal(r.hash,hash,'UNRELATED_ASSET_CHANGED_'+p);}
 await assertEndpoints();
 assert.equal(stable(await cf('/workers/scripts/'+W+'/settings')),config,'SETTINGS_CHANGED');
 report.active=await live();report.ok=true;report.passed={domains:2,unchangedAssets:Object.keys(unrelated).length,apiRoutes:3};
 console.log('CORNER_ENTRY_PRODUCTION_PASS='+JSON.stringify(report));
}catch(e){report.error=String(e.stack||e);console.error('CORNER_ENTRY_PRODUCTION_FAIL='+String(e.message||e));
 if(modified){try{if(await live()===NEXT){report.rollback=await safeDeploy(BASE,NEXT);report.restored=await live()}}catch(err){report.rollbackError=String(err)}}process.exitCode=1;}
await writeFile(dir+'/deployment.json',JSON.stringify(report,null,2));