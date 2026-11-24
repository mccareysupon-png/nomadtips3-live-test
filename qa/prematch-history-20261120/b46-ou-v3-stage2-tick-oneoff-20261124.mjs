// Exactly one existing TEST-only Pre-Match O/U price/EV engine tick.
// Model V3 must already be installed. The current price/EV engine owns all
// existing zero-or-one-provider-call and 4/day reservations. No quota bypass.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','NO_RETRY_ON_EXISTING_PAID_PRICE_PIPELINE');
const base='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const cfbase='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const core=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
async function version(name){const r=await fetch(cfbase+'/scripts/'+name+'/deployments?per_page=1',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});const j=await r.json();assert(r.ok&&j.success);return j.result.deployments[0].versions[0].version_id}
async function owner(path,body=null){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:auth,...(body?{'content-type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(48000)});
 assert(r.ok,'OWNER_HTTP_'+path+'_'+r.status);
 return r.json();
}
const original=Object.fromEntries(await Promise.all(core.map(async n=>[n,await version(n)])));
const [v3,engine,truck,oldLedger]=await Promise.all([
 owner('/ou-v3-stage-one-audit-test'),owner('/prematch-ou-engine-state'),
 owner('/btts-bulk-v2-state'),owner('/preview-data')
]);
assert.equal(v3.code,'B46_OU_V3_ALLGROUNDS_H2H_STAGE1_TEST');
assert.equal(v3.policy.minimumPerTeam,3);assert.equal(v3.policy.h2hMinimum,0);
assert(v3.models.length>0,'NO_AVAILABLE_UPCOMING_HISTORY_QUALIFIED_FIXTURE');
assert.equal(truck.config.mode,'CLOSED');
const originalSignal=oldLedger.ouLedger.rows.find(x=>Number(x.fixture_id)===204906152);
assert(originalSignal?.status==='LOSS'&&originalSignal.units===-1);
console.log('B46_OU_V3_STAGE_TWO_PREFLIGHT '+JSON.stringify({
 at:v3.checkedAtUTC,upcomingChecked:v3.counts.checked,modeled:v3.counts.modeled,
 model:v3.policy.model,priceMin:v3.policy.minimumPriceExclusive,
 minEV:v3.policy.minimumEV,
 currentShadow:engine.shadowCount,
 existingQuoteBudget:engine.quota,
 noNewBackfill:true
}).slice(0,12000));
const outcome=await owner('/prematch-ou-engine-tick',{});
assert.equal(outcome.engine,'B46_PREMATCH_OU_ENGINE_V1_TEST');
assert.equal(outcome.stage,'PREMATCH_ONLY_BEFORE_LIVE');
assert(outcome.providerCalls>=0&&outcome.providerCalls<=1,'QUOTA_POLICY_BROKEN');
const [afterEngine,afterTruck,afterLedger,versionsAfter]=await Promise.all([
 owner('/prematch-ou-engine-state'),owner('/btts-bulk-v2-state'),
 owner('/preview-data'),
 Promise.all(core.map(async n=>[n,await version(n)])).then(Object.fromEntries)
]);
assert.equal(afterTruck.config.mode,'CLOSED');
assert.deepEqual(versionsAfter,original,'LIVE_OR_PROD_DEPLOY_REGRESSION');
assert(afterLedger.ouLedger.rows.some(x=>Number(x.fixture_id)===204906152&&x.status==='LOSS'&&x.units===-1),
 'OLD_SETTLED_OU_PICK_MUTATED');
console.log('B46_OU_V3_STAGE_TWO_LIVE_TICK '+JSON.stringify({
 at:new Date().toISOString(),status:outcome.status,
 feed:outcome.feed,scan:outcome.scan,locked:outcome.locked,
 quote:outcome.priceBridge,providerCalls:outcome.providerCalls,
 currentShadow:afterEngine.shadowCount,actualLast:afterEngine.last,
 noBTTSReactivation:true,noProdWrites:true
}).slice(0,23000));
console.log('B46_OU_V3_STAGE_TWO_TEST_PASS');
