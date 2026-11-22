import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CREDENTIALS_MISSING');
const script='ball46-production';
const introduced='b4273ed3-b33e-4e8a-aa30-f67a4996ece7';
const previous='0797b888-ff90-42d1-af42-1f9d95844a2b';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(p,method='GET',body){
 const r=await fetch(api+p,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success,'CF '+method+' '+p+' '+JSON.stringify(j.errors??[]));return j.result;
}
async function active(){
 const a=await cf('/scripts/'+script+'/deployments?per_page=1');
 assert(a.deployments?.[0]?.versions?.length===1&&Number(a.deployments[0].versions[0].percentage)===100,'TRAFFIC_SPLIT');
 return a.deployments[0].versions[0].version_id;
}
const before=await active();
console.log('B46_ROLLBACK_BASELINE '+JSON.stringify({before,introduced,previous}));
assert(before===introduced,'ACTIVE_VERSION_CHANGED: stop; refusing to overwrite another release. No deployment changed.');
const old=await cf('/workers/'+script+'/versions/'+previous+'?include=modules');
assert(old.id===previous&&Array.isArray(old.modules)&&old.modules.length>0,'ROLLBACK_VERSION_MISSING');
assert(old.bindings?.some(b=>b.name==='B46_SIDEBAR_MONITOR'),'ORIGINAL_SIDEBAR_BINDING_MISSING');
assert(await active()===introduced,'RACE_BEFORE_ROLLBACK');
const dep=await cf('/scripts/'+script+'/deployments','POST',{strategy:'percentage',versions:[{version_id:previous,percentage:100}],annotations:{'workers/message':'Owner ordered removal of mistaken Sidebar initial firstpaint 20261122 release'}});
for(let i=0;i<15;i++){if(await active()===previous)break;await new Promise(r=>setTimeout(r,1500))}
assert.equal(await active(),previous,'ROLLBACK_NOT_ACTIVE');
let good=false;
for(let i=0;i<15;i++){
 const r=await fetch('https://ball46.com/__b46_sidebar_initial_test.js?rollbackCheck='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(r.status!==200){good=true;break}
 await new Promise(r=>setTimeout(r,1800));
}
assert(good,'OLD_SIDEBAR_SCRIPT_STILL_SERVED');
const home=await fetch('https://ball46.com/?rollbackCheck='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});
assert(home.ok,'SITE_NOT_HEALTHY');
console.log('B46_SIDEBAR_FIRSTPAINT_ROLLBACK_PASS '+JSON.stringify({before,active:await active(),deployment_id:dep?.id??null,home:home.status,removedScript:true}));
