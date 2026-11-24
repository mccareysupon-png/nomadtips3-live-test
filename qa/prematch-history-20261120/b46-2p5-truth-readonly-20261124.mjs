import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'MISSING_TEST_TOKEN');
const host='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function get(path){
 const r=await fetch(host+path,{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(40000)});
 if(!r.ok)return {error:'HTTP_'+r.status};
 try{return await r.json()}catch(e){return {error:'BAD_RESPONSE'}}
}
const [adaptive,raw,cache,old]=await Promise.all([
 get('/ou-adaptive-research-state-test'),
 get('/ou-raw-expired-odds-18-audit-test'),
 get('/ou-fullmarket-cache-audit-test'),
 get('/ou-v3-stage-one-audit-test')
]);
assert.equal(adaptive.code,'B46_ADAPTIVE_OU_RESEARCH_V1','ADAPTIVE_STATE_NOT_FOUND');
const candidates=adaptive.rawCandidates??[];
const cById=new Map();
for(const c of candidates){const arr=cById.get(c.fixtureId)??[];arr.push(c);cById.set(c.fixtureId,arr)}
const pricedRaw=(raw.rows??[]).filter(x=>x.rawPriceCount>0).map(x=>{
 const p=(x.prices??[]).filter(q=>Number(q.line)===2.5&&
   Number(q.over)>=1.40&&Number(q.over)<=10||
   Number(q.line)===2.5&&Number(q.under)>=1.40&&Number(q.under)<=10);
 return {id:x.fixtureId,match:x.match,stale:x.stale,ageSec:x.cacheAgeSec,
   totalRaw:x.rawPriceCount,priceAt2p5:p.length,
   samples:p.slice(0,7),matchingFormulas:(cById.get(x.fixtureId)??[]).map(x=>x.formula+':'+x.selection)};
});
const keyCand=[...cById.keys()];
const summary={checkedUTC:new Date().toISOString(),
 adaptive:{validUpcoming:adaptive.screeningCounts?.validUpcoming,patternFixtureCount:adaptive.screeningCounts?.uniqueFixturesWithPatterns,
  formulaObservations:adaptive.screeningCounts?.formulasTriggered,candidateIds:keyCand,priced:adaptive.priced,ledgerSize:adaptive.records?.length},
 raw:{error:raw.error,cacheVerified:raw.cacheVerified,
  cachedMatches:raw.cachedMatches,rawPricedMatches:raw.rawPricedMatches,totalRawPriceRows:raw.totalRawPriceRows,
  pricedRaw},
 cache:{error:cache.error,verified:cache.cacheVerified,cacheKeys:cache.cacheKeys,
  priceOffersValid:cache.priceOffersValid,staleOrMissing:cache.staleOrMissing,
  samples:(cache.rows??[]).filter(x=>x.cachePresent).slice(0,6)},
 old:{modeled:old.counts?.modeled,priceBounds:old.policy?.minimumPriceInclusive}};
console.log('B46_OU_PRICE_TRUTH '+JSON.stringify(summary).slice(0,26500));
console.log('B46_OU_PRICE_AUDIT_NO_PROVIDER_CALLS');
