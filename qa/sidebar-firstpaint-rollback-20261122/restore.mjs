import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CREDENTIALS_MISSING');
const site='ball46-production';
const from='0797b888-ff90-42d1-af42-1f9d95844a2b';
const restore='b4273ed3-b33e-4e8a-aa30-f67a4996ece7';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path,method='GET',body){
 const r=await fetch(api+path,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(70000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE '+path+' '+r.status+' '+JSON.stringify(j.errors??[]));return j.result;
}
async function active(){
 const d=await cf('/scripts/'+site+'/deployments?per_page=1');
 const x=d.deployments[0].versions;assert(x.length===1&&Number(x[0].percentage)===100,'TRAFFIC_SPLIT');
 return x[0].version_id;
}
const current=await active();
console.log('RESTORE_SIDEBAR_BASELINE '+JSON.stringify({current,expected:from,restore}));
if(current===restore){console.log('RESTORE_SIDEBAR_ALREADY_ACTIVE');process.exit(0)}
assert.equal(current,from,'CURRENT_VERSION_CHANGED: STOP_TO_PROTECT_NEWER_WORK');
const v=await cf('/workers/'+site+'/versions/'+restore+'?include=modules');
assert(v.id===restore&&Array.isArray(v.modules)&&v.modules.length===91,'RESTORE_VERSION_UNAVAILABLE');
assert(v.modules.some(m=>m.name==='b46-sidebar-firstpaint-entry-20261122.mjs'),'RESTORE_MODULE_MISSING');
assert(v.bindings?.some(b=>b.name==='B46_SIDEBAR_MONITOR'&&b.type==='service'),'SIDEBAR_BINDING_MISSING');
const preview='https://'+restore.slice(0,8)+'-'+site+'.mccarey-supon.workers.dev';
const probe=await fetch(preview+'/__b46_sidebar_initial_test.js',{signal:AbortSignal.timeout(30000)});
assert(probe.ok&&(await probe.text()).includes('SidebarFirstPaintTest'),'CANDIDATE_PREVIEW_NOT_READY');
assert.equal(await active(),from,'VERSION_CHANGED_BEFORE_ACTIVATION');
const deployment=await cf('/scripts/'+site+'/deployments','POST',{strategy:'percentage',versions:[{version_id:restore,percentage:100}],annotations:{'workers/message':'Owner requested restore approved Sidebar Win Rate firstpaint 20261122 release'}});
for(let i=0;i<20;i++){if(await active()===restore)break;await new Promise(r=>setTimeout(r,1300))}
assert.equal(await active(),restore,'RESTORE_NOT_ACTIVE');
let ok=false;
for(let i=0;i<20;i++){
 const r=await fetch('https://ball46.com/__b46_sidebar_initial_test.js?restoreCheck='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});
 if(r.ok&&(await r.text()).includes('SidebarFirstPaintTest')){ok=true;break}
 await new Promise(r=>setTimeout(r,1300));
}
assert(ok,'RESTORE_SITE_SCRIPT_NOT_VISIBLE');
const home=await fetch('https://ball46.com/?restoreSidebarCheck='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(30000)});
assert(home.ok,'RESTORE_SITE_UNHEALTHY');
console.log('RESTORE_SIDEBAR_PRODUCTION_PASS '+JSON.stringify({active:await active(),rollback:from,deployment_id:deployment?.id??null,home:home.status}));
