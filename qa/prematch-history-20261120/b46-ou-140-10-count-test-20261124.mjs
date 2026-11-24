// BALL46 TEST: one actual 1.40..10.00 O/U screening tick and exact qualified count.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_CF_TEST_CREDS');
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','NO_REPEAT_PRICE_TEST');
const host='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function get(path,body=null) {
 const r=await fetch(host+path,{method:body?'POST':'GET',
  headers:{authorization:auth,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000),cache:'no-store'});
 assert(r.ok,'TEST_HTTP_'+path+'_'+r.status);return r.json();
}
async function workerVersion(n){
 const r=await fetch(root+'/scripts/'+n+'/deployments?per_page=1',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 const d=await r.json();assert(r.ok&&d.success,'VERSION_READ_FAILED_'+n);return d.result.deployments[0].versions[0].version_id;
}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
const before=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await workerVersion(n)])));
const [stage1,beforeState,closed]=await Promise.all([
 get('/ou-v3-stage-one-audit-test'),get('/prematch-ou-engine-state'),get('/btts-bulk-v2-state')]);
assert.equal(stage1.policy.minimumPriceInclusive,1.4);
assert.equal(stage1.policy.maximumPriceInclusive,10);
assert.equal(stage1.policy.minimumEV,.05);
assert.equal(stage1.policy.minimumPerTeam,3);
assert.equal(closed.config.mode,'CLOSED');
console.log('B46_140_10_BEFORE '+JSON.stringify({
 stamp:stage1.checkedAtUTC,priceRange:'1.40-10.00',
 upcoming:stage1.counts.checked,historyQualified:stage1.counts.modeled,
 quota:beforeState.quota,priorShadow:beforeState.shadowCount,
 minimumEV:.05}));
const tick=await get('/prematch-ou-engine-tick',{});
assert.equal(tick.engine,'B46_PREMATCH_OU_ENGINE_V1_TEST');
assert(tick.providerCalls>=0&&tick.providerCalls<=1);
const [afterState,afterClosed,afterVersions]=await Promise.all([
 get('/prematch-ou-engine-state'),get('/btts-bulk-v2-state'),
 Promise.all(protectedNames.map(async n=>[n,await workerVersion(n)])).then(Object.fromEntries)]);
assert.equal(afterClosed.config.mode,'CLOSED');
assert.deepEqual(before,afterVersions,'PROTECTED_PROD_CHANGED');
console.log('B46_140_10_ACTUAL_SCREEN '+JSON.stringify({
 when:new Date().toISOString(),
 status:tick.status,historyModeled:tick.scan.modeled,
 pricedFixtures:tick.scan.pricedFixtures,priceOffers:tick.scan.prices,
 qualified:tick.scan.valueQualified,unavailable:tick.scan.unavailable,
 newPredictions:tick.locked.added,duplicate:tick.locked.duplicate,
 fallback:tick.priceBridge,externalProviderCalls:tick.providerCalls,
 afterShadow:afterState.shadowCount,quotaAfter:afterState.quota,
 productionWrites:tick.productionWrites}));
console.log('B46_140_10_TEST_COMPLETED');
