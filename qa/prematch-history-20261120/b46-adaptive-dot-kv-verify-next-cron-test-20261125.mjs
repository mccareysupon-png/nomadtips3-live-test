// Read through the exact Cloudflare account API path supported by the existing Cloudflare connector.
import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const ns='c3ce9ac5641a45cca03ec318a35c6872';
const key=encodeURIComponent('adaptive-risk-supervisor/latest-v1-test');
const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/storage/kv/namespaces/'+ns+'/values/'+key;
const resp=await fetch(url,{headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(25000)});
assert(resp.ok,'NATIVE_KV_CONNECTOR_READ_FAILED_HTTP_'+resp.status);
const data=await resp.json();
assert.equal(data.status,'OK','NATIVE_KV_DATA_NOT_HEALTHY_'+data.status);
assert.equal(data.privateTransport,'CLOUDFLARE_KV_ACCOUNT_API_ONLY');
assert.equal(data.summary.totalFormulas,42);
assert.equal(data.formulas.length,42);
const completed=Date.parse(data.freshness?.cronCompletedAt||'');
assert(Number.isFinite(completed)&&Date.now()-completed<35*60*1000,'KV_CRON_OLDER_THAN_35_MIN');
assert(Date.parse(data.staleAfter)>Date.now(),'KV_SNAPSHOT_STALE');
assert(data.freshness?.cronInvocationId!=='scheduled-15m-1795597204','KV_NOT_REFRESHED_BY_NEXT_REAL_CRON');
assert.equal(data.freshness?.cronRiskGuardBefore?.checked,42);
assert.equal(data.freshness?.cronRiskGuardAfter?.checked,42);
assert(!data.formulas.some(f=>Object.hasOwn(f,'fixture_id')||Object.hasOwn(f,'home')||Object.hasOwn(f,'away')));
console.log('B46_DOT_NATIVE_KV_NEXT_REAL_CRON_PASS '+JSON.stringify({
 source:'CLOUDFLARE_ACCOUNT_KV_API',newCronInvocationId:data.freshness.cronInvocationId,
 completedAt:data.freshness.cronCompletedAt,snapshotAt:data.snapshotRecordedAt,staleAfter:data.staleAfter,
 formulaCount:data.formulas.length,guardBefore:data.freshness.cronRiskGuardBefore.checked,
 guardAfter:data.freshness.cronRiskGuardAfter.checked,
 verifiedFT:data.summary.verifiedFTDecisions,
 notManualBootstrap:true,noOwnerBrowser:true,noCustomHttpBearerForDot:true,
 noRawLedger:true,productionWrites:0,paidProviderCalls:0
}));
