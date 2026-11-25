// Secure TEST KV bootstrap from the already authenticated separate Dot READ-only API.
// No owner cookies, no user passwords, no raw Ledger rows, no formula/worker writes.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const bearer=createHmac('sha256',token).update('BALL46_TEST_DOT_RISK_READER_V1_INDEPENDENT_SCOPE').digest('hex');
const origin='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const uri=origin+'/adaptive-dot-risk-read-test';
const read=await fetch(uri,{cache:'no-store',headers:{authorization:'Bearer '+bearer,accept:'application/json'},
 signal:AbortSignal.timeout(25000)});
const state=await read.json();
assert.equal(read.status,200,'DEDICATED_DOT_RISK_SOURCE_NOT_HEALTHY_'+state?.status);
assert.equal(state?.status,'OK');
assert.equal(state?.summary?.totalFormulas,42);
assert.equal(state?.formulas?.length,42);
assert.equal(state.freshness?.cronSource,'CLOUDFLARE_SCHEDULED_15M');
assert.equal(state.freshness?.cronRiskGuardBefore?.checked,42);
assert.equal(state.freshness?.cronRiskGuardAfter?.checked,42);
assert(!state.formulas.some(f=>'fixture_id'in f||'home'in f||'away'in f));
const completed=Date.parse(state.freshness.cronCompletedAt);
assert(Date.now()-completed>=0&&Date.now()-completed<35*60*1000,'LATEST_CRON_RISK_REPORT_STALE');
const now=new Date().toISOString();
const value={...state,privateTransport:'CLOUDFLARE_KV_ACCOUNT_API_ONLY',
 snapshotRecordedAt:now,staleAfter:new Date(completed+35*60*1000).toISOString()};
const ns='c3ce9ac5641a45cca03ec318a35c6872';
const key='adaptive-risk-supervisor/latest-v1-test';
const kvUrl='https://api.cloudflare.com/client/v4/accounts/'+account+
 '/storage/kv/namespaces/'+ns+'/values/'+encodeURIComponent(key)+'?expiration_ttl=2400';
const write=await fetch(kvUrl,{method:'PUT',
 headers:{authorization:'Bearer '+token,'content-type':'application/json'},
 body:JSON.stringify(value),signal:AbortSignal.timeout(35000)});
const body=await write.json().catch(()=>null);
assert(write.ok&&body?.success,'PRIVATE_KV_BOOTSTRAP_WRITE_FAILED_'+write.status);
console.log('B46_DOT_KV_BOOTSTRAP_TEST_PASS '+JSON.stringify({
 key,namespace:ns,source:'AUTHENTICATED_DOT_READ_ONLY_WORKER',
 snapshotRecordedAt:now,staleAfter:value.staleAfter,
 cronInvocationId:value.freshness.cronInvocationId,
 cronRiskGuardBefore:value.freshness.cronRiskGuardBefore.checked,
 cronRiskGuardAfter:value.freshness.cronRiskGuardAfter.checked,
 formulas:value.formulas.length,
 noOwnerTab:true,readOnlyDotCredential:true,rawLedgerNotPublished:true,
 onlyPrivateKVWrite:true,paidFootballProviderCalls:0,productionWrites:0
}));
