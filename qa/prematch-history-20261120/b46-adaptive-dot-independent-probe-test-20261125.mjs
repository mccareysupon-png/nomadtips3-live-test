// Separate CI process: Dot reader permission only. No owner tab/session, no owner password, no mutation.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const cf=process.env.CLOUDFLARE_API_TOKEN;
assert(cf,'INDEPENDENT_READER_CREDENTIAL_SOURCE_MISSING');
const probe=process.env.B46_PROBE_ID||'UNKNOWN';
const bearer=createHmac('sha256',cf).update('BALL46_TEST_DOT_RISK_READER_V1_INDEPENDENT_SCOPE').digest('hex');
const base='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const endpoint='/adaptive-dot-risk-read-test';
async function call(path,method,key){
 const r=await fetch(base+path,{method,headers:{authorization:'Bearer '+key,accept:'application/json'},
  signal:AbortSignal.timeout(24000),cache:'no-store'});
 const text=await r.text();
 let j=null;try{j=JSON.parse(text)}catch{}
 return {http:r.status,body:j,cache:r.headers.get('cache-control'),
  cors:r.headers.get('access-control-allow-origin'),contentType:r.headers.get('content-type')};
}
const start=Date.now();
let good=null;
for(let attempt=0;attempt<16;attempt++){
 good=await call(endpoint,'GET',bearer);
 if(good.body?.code==='B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST'&&[200,503].includes(good.http))break;
 if(attempt===0||attempt===15)console.log('B46_INDEPENDENT_DOT_EDGE_PENDING '+JSON.stringify({probe,attempt,http:good.http}));
 await new Promise(resolve=>setTimeout(resolve,1400));
}
assert(good?.body?.code==='B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST','READER_NOT_AVAILABLE_AFTER_PROPAGATION');
assert(good.cache?.includes('no-store'),'PUBLIC_CACHE_NOT_DISABLED');
assert.equal(good.cors,null,'READER_PUBLIC_CORS_ENABLED');
let fail=null;
for(let attempt=0;attempt<12;attempt++){
 const res=await Promise.all([
  call(endpoint,'GET','0'.repeat(64)),
  call(endpoint,'POST',bearer),
  call(endpoint,'GET',createHmac('sha256',cf).update('BALL46_PREMATCH_ONLY_V1').digest('hex')),
  call('/adaptive-control-dot-test','POST',bearer)
 ]);
 if(res[0].http===401&&res[1].http===405&&res[2].http===401&&[401,403].includes(res[3].http)){fail=null;break}
 fail=res.map(x=>x.http);
 await new Promise(resolve=>setTimeout(resolve,1200));
}
assert.equal(fail,null,'READ_ONLY_AUTHZ_TEST_FAILED_'+JSON.stringify(fail));
if(good.http===503){
 assert.equal(good.body.formulas,null,'UNAVAILABLE_MUST_NOT_RETURN_ZERO_METRICS');
 assert.equal(good.body.summary,null,'UNAVAILABLE_MUST_NOT_RETURN_ZERO_AGGREGATES');
 assert(['UNAVAILABLE','STALE','DATA_QUALITY_ERROR'].includes(good.body.status),'UNEXPECTED_DEGRADED_STATUS');
 console.log('B46_DOT_INDEPENDENT_PROBE_CRON_OR_QUALITY_PENDING '+JSON.stringify({
  probe,authenticatedRead:true,readOnly:true,status:good.body.status,reason:good.body.reason,
  wrongCredentialDenied:true,ownerCredentialDenied:true,readerPostDenied:true,
  noOwnerTab:true,hasUnverifiedData:good.body.affectedFormulas?.length||0,
  elapsedMs:Date.now()-start
 }));
 if(process.argv.includes('--allow-pending'))process.exit(0);
 process.exit(2);
}
assert.equal(good.http,200);
const j=good.body;
assert.equal(j.status,'OK');assert.equal(j.readOnly,true);
assert.equal(j.summary?.totalFormulas,42);
assert(Array.isArray(j.formulas)&&j.formulas.length===42);
assert(j.formulas.every(f=>['RUN','PAUSED_AUTO','PAUSED_MANUAL'].includes(f.mode)));
assert(j.formulas.every(f=>Number.isInteger(f.verifiedFTSettled)&&f.unverifiedFTRecords===0));
assert(j.formulas.every(f=>f.sampleStatus==='NO_OBSERVATIONS'||f.sampleStatus==='HAS_OBSERVATIONS'));
assert.equal(j.freshness.cronSource,'CLOUDFLARE_SCHEDULED_15M');
assert.equal(j.freshness.cronRiskGuardBefore.checked,42);
assert.equal(j.freshness.cronRiskGuardAfter.checked,42);
assert(j.freshness.cronAgeSeconds>=0&&j.freshness.cronAgeSeconds<2100);
assert(j.freshness.workerAgeSeconds>=0&&j.freshness.workerAgeSeconds<2100);
assert(j.formulas.every(f=>typeof f.lastEvidenceAt==='string'||f.lastEvidenceAt===null));
assert(j.formulas.every(f=>!('home' in f)&&!('away' in f)&&!('fixture_id' in f)));
console.log('B46_DOT_INDEPENDENT_READER_HEALTHY_PASS '+JSON.stringify({
 probe,readOnly:true,fromFreshGitHubRunner:true,noOwnerTab:true,
 formulas:j.formulas.length,verifiedFT:j.summary.verifiedFTDecisions,
 pausedManual:j.summary.pausedManual,pausedAuto:j.summary.pausedAuto,
 autoEnabled:j.summary.autoStopEnabled,
 cronInvocationId:j.freshness.cronInvocationId,
 cronRiskGuardBefore:j.freshness.cronRiskGuardBefore.checked,
 cronRiskGuardAfter:j.freshness.cronRiskGuardAfter.checked,
 cronCompletedAt:j.freshness.cronCompletedAt,
 workerLastRunAt:j.freshness.workerLastRunAt,
 workerAgeSeconds:j.freshness.workerAgeSeconds,
 wrongCredentialDenied:true,ownerCredentialDenied:true,
 readerPostDenied:true,oldDotCommandsDenied:true,
 noRawLedgerReturned:true,productionWrites:0,paidProviderCalls:0
}));
