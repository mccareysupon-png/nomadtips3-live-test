import assert from 'node:assert/strict';
import{createHash}from'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-production',BASE='681f3159-b314-4418-aa95-aed5a9ff13ce',NEXT='dc158cd1-bf39-4b6a-a4eb-3e3c8b0c2db4',NEW='8875d98bb712b56612e93d64c1dda34d86806c0c51774a706cb5e16873c0caca';
assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
const host=['https://ball46.com','https://www.ball46.com'];
const keep=['/signal.html','/signal-next.js','/statistics.html','/dashboard-v2-stage3-featured-facts-20261013a.js'];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function cf(path,body){
 if(body)assert.equal(path,'/workers/scripts/'+W+'/deployments');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+T,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(80000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CLOUDFLARE_'+r.status+JSON.stringify(j.errors));return j.result;
}
async function live(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return d.versions[0].version_id;}
async function read(url){const r=await fetch(url+'?caretGreenTest='+Date.now()+Math.random(),{signal:AbortSignal.timeout(55000)}),b=Buffer.from(await r.arrayBuffer());return {status:r.status,sha:sha(b),text:b.toString()};}
async function switchTo(target,expected,message){
 assert.equal(await live(),expected,'PARALLEL_DEPLOYMENT_ABORT');
 return (await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:target,percentage:100}],annotations:{'workers/message':message}})).id;
}
let changed=false;
try{
 assert.equal(await live(),BASE,'ACTIVE_VERSION_CHANGED_ABORT');
 const c=await cf('/workers/workers/'+W+'/versions/'+NEXT+'?include=modules');
 assert.equal(c.annotations?.['workers/tag'],'BALL46_SEARCH_CARET_GREEN_20261024','CANDIDATE_TAG_WRONG');
 const original=new Map();
 for(const h of host)for(const p of keep)original.set(h+p,await read(h+p));
 const config=JSON.stringify(await cf('/workers/scripts/'+W+'/settings'));
 const pv=await read('https://dc158cd1-ball46-production.mccarey-supon.workers.dev/');
 assert.equal(pv.status,200);assert.equal(pv.sha,NEW,'PREVIEW_CHANGED');
 const id=await switchTo(NEXT,BASE,'Green search text caret only; no other BALL46 changes');
 changed=true;
 let stable=0;
 for(let i=0;i<35&&stable<2;i++){
   assert.equal(await live(),NEXT,'NEW_PARALLEL_DEPLOYMENT');
   let success=true;
   for(const h of host){const x=await read(h+'/');if(x.status!==200||x.sha!==NEW)success=false;}
   stable=success?stable+1:0;
   if(stable<2)await new Promise(r=>setTimeout(r,2000));
 }
 assert.equal(stable,2,'PRODUCTION_NOT_READY');
 for(const h of host){
   for(const p of keep){const x=await read(h+p),prior=original.get(h+p);assert.equal(x.status,prior.status,'UNRELATED_STATUS_'+p);assert.equal(x.sha,prior.sha,'UNRELATED_ASSET_'+p);}
   for(const p of ['/api/engine/health','/api/engine/signals','/api/full-market/health']){const x=await read(h+p);assert.equal(x.status,200,p);assert.equal(JSON.parse(x.text).ok,true,p);}
 }
 assert.equal(JSON.stringify(await cf('/workers/scripts/'+W+'/settings')),config,'SETTINGS_CHANGED');
 console.log('B46_GREEN_CARET_DEPLOY_PASS='+JSON.stringify({ok:true,active:NEXT,deployment:id,domains:2,unrelatedAssets:keep.length,apiChecks:6}));
}catch(e){
 console.error('B46_GREEN_CARET_DEPLOY_FAIL='+String(e.message||e));
 if(changed){try{if(await live()===NEXT)console.log('B46_GREEN_CARET_ROLLBACK='+await switchTo(BASE,NEXT,'Restore previous working search cursor style'));}catch(x){console.error('B46_GREEN_CARET_ROLLBACK_ERROR='+String(x.message||x));}}
 process.exitCode=1;
}