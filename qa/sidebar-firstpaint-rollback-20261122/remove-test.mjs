import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CREDENTIALS_MISSING');
const name='ball46-sidebar-initial-winrate-test-20261122';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const h={authorization:'Bearer '+token};
const p='/scripts/'+name;
const r=await fetch(api+p,{headers:h,signal:AbortSignal.timeout(45000)});
if(r.status===404){console.log('B46_WRONG_TEST_ALREADY_ABSENT');process.exit(0)}
assert(r.ok,'TEST_LOOKUP_FAILED '+r.status);
const site=await fetch(api+'/scripts/ball46-production/deployments?per_page=1',{headers:h,signal:AbortSignal.timeout(45000)});
const sj=await site.json();assert(site.ok&&sj.success,'SITE_LOOKUP_FAILED');
const current=sj.result.deployments[0].versions;
assert(current.length===1&&current[0].version_id==='0797b888-ff90-42d1-af42-1f9d95844a2b','PRODUCTION_CHANGED_STOP');
const del=await fetch(api+p,{method:'DELETE',headers:h,signal:AbortSignal.timeout(45000)});
const dj=await del.json();assert(del.ok&&dj.success,'TEST_DELETE_FAILED '+JSON.stringify(dj.errors??[]));
console.log('B46_WRONG_TEST_WORKER_DELETED '+name);
