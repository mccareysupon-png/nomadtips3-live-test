// Explicit, one-off Ultra TEST BTTS historical trial for one existing league.
// 1 metadata + <=4 league-season finished pages, per_page=100, no odds.
// Max 5 5USD account-wide calls at >=8 seconds apart. No retries or re-runs.
// Import ONLY into btts_history_private_test. Never touch HCR/1X2/Live/PROD.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const key=process.env.FIVEDOLLAR_API_KEY,token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(key&&token&&account,'MISSING_APPROVED_TEST_KEYS');
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','NEVER_REPLAY_PROVIDER_REQUESTS');
const worker='ball46-prematch-only-test-20261120',leagueId=354;
const activeRequired='3b15d254-dfec-4a94-9c83-9c7a7fe7dabd';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const targets=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120','ball46-prematch-ui-test-v5-20261120'];
let calls=0,last=0,lowReserve=false,stopped=null,rateRemain=null;
const report={operation:'TEST_BTTS_ULTRA_PRIVATE_SEASON_ONCE',leagueId,
 limit:5,providerCalls:0,leagueSeason:null,pages:[],savedRows:0,
 publication:false,productionWrites:0};
async function version(name){
 const r=await fetch(root+'/scripts/'+name+'/deployments?per_page=1',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_VERSION_'+name);
 return j.result.deployments?.[0]?.versions?.[0]?.version_id;
}
async function owner(path,body=null){
 const r=await fetch(host+path,{method:body===null?'GET':'POST',
  headers:{authorization:auth,...(body===null?{}:{'content-type':'application/json'})},
  ...(body===null?{}:{body:JSON.stringify(body)}),
  cache:'no-store',signal:AbortSignal.timeout(22000)});
 const j=await r.json().catch(()=>({error:'INVALID_JSON'}));
 assert(r.ok,'TEST_OWNER_'+path+'_'+r.status+'_'+JSON.stringify(j).slice(0,300));
 return j;
}
async function provider(path){
 if(calls>=5)throw Error('HARD_FIVE_CALL_CAP');
 if(last)await new Promise(r=>setTimeout(r,Math.max(0,8100-(Date.now()-last))));
 last=Date.now();calls++;report.providerCalls=calls;
 const resp=await fetch('https://api.5dollarfootballapi.com'+path,{headers:{authorization:'Bearer '+key,accept:'application/json'},
  redirect:'manual',signal:AbortSignal.timeout(22000)});
 const remain=resp.headers.get('x-ratelimit-remaining');
 rateRemain=remain!==null&&/^\d+$/.test(remain)?Number(remain):null;
 if(resp.status===429){stopped='429_RETRY_AFTER_'+(resp.headers.get('retry-after')||'UNKNOWN');return null;}
 if(!resp.ok){stopped='HTTP_'+resp.status;return null;}
 let j;try{j=await resp.json()}catch{stopped='INVALID_JSON';return null}
 if(j.success!==1){stopped='INVALID_PROVIDER_SUCCESS';return null}
 if(rateRemain!==null&&rateRemain<12)lowReserve=true;
 return j;
}
const beforeWorker=await version(worker);
assert.equal(beforeWorker,activeRequired,'TEST_WORKER_VERSION_DRIFT_NO_PROVIDER_REQUEST');
const original=Object.fromEntries(await Promise.all(targets.map(async n=>[n,await version(n)])));
const [beforeHcr,beforeLedger,beforeArchive,beforeBtts]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/test-ledger'),
 owner('/btts-history-private-test'),owner('/btts-shadow')]);
assert.equal(beforeArchive.mode,'BTTS_PRIVATE_HISTORY_TEST');
assert.equal(beforeArchive.archive.privateFT,0,'BTTS_PRIVATE_ARCHIVE_ALREADY_HAS_DATA_NO_REQUERY');
assert(beforeArchive.leagues.some(x=>x.leagueId===leagueId),'NO_UPCOMING_FIXTURES_FOR_TARGET_LEAGUE');
assert.equal(beforeHcr.registry.code,'HCR-V1');
assert.equal(beforeLedger.rows.length,75);
const ledgerHash=crypto.createHash('sha256').update(JSON.stringify({rows:beforeLedger.rows,stats:beforeLedger.stats})).digest('hex');
const meta=await provider('/v1/leagues/'+leagueId);
if(!meta||!meta.data||Number(meta.data.id)!==leagueId||!Array.isArray(meta.data.seasons)){
 stopped=stopped||'LEAGUE_METADATA_INVALID';
}else{
 const selected=meta.data.seasons.find(x=>x.current===true)?.season;
 if(typeof selected!=='string'||!/^\d{4}(?:\/\d{2,4})?$/.test(selected))stopped='NO_CONFIRMED_SEASON';
 else{
  report.leagueSeason=selected;
  for(let page=1;page<=4&&!stopped&&!lowReserve;page++){
   const q=new URLSearchParams({season:selected,status:'finished',per_page:'100',page:String(page)});
   const j=await provider('/v1/leagues/'+leagueId+'/fixtures?'+q);
   if(!j)break;
   if(!Array.isArray(j.data)||j.data.length>100||j.pagination?.page!==page||
     typeof j.pagination?.has_more!=='boolean'){stopped='INVALID_PAGE_SCHEMA';break;}
   const observed=Math.floor(Date.now()/1000);
   const stored=await owner('/btts-history-import-test',{
    source:'ULTRA_FINISHED_LEAGUE_SEASON',leagueId,season:selected,observed,rows:j.data
   });
   assert.equal(stored.mode,'BTTS_PRIVATE_HISTORY_TEST');
   const entry={page,received:j.data.length,stats:stored.stats,hasMore:j.pagination.has_more};
   report.pages.push(entry);
   report.savedRows+=stored.stats.added;
   if(!j.pagination.has_more){stopped='COMPLETE';break}
   if(page===4)stopped='FOUR_PAGES_FINISHED_CAP';
  }
 }
}
if(!stopped)stopped=lowReserve?'RATE_LIMIT_RESERVE':'PAGE_LIMIT';
const [afterHcr,afterLedger,afterArchive,afterBtts]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/test-ledger'),
 owner('/btts-history-private-test'),owner('/btts-shadow')]);
assert.equal(afterHcr.registry.code,'HCR-V1');
assert.equal(afterHcr.inventory.finishedFixtures,beforeHcr.inventory.finishedFixtures,'SHARED_HCR_CHANGED');
assert.equal(crypto.createHash('sha256').update(JSON.stringify({rows:afterLedger.rows,stats:afterLedger.stats})).digest('hex'),ledgerHash,'ONE_X_TWO_LEDGER_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(targets.map(async n=>[n,await version(n)]))),original,'PROTECTED_WORKER_CHANGED');
assert.equal(afterBtts.providerCalls,0);
assert.equal(afterBtts.published,0);
report.stopped=stopped;report.lastRateRemaining=rateRemain;
report.archive=afterArchive.archive;
report.historyReadyBefore=beforeBtts.totals.historyReady;
report.historyReadyAfter=afterBtts.totals.historyReady;
report.qualifiedAfter=afterBtts.totals.qualified;
report.oneX2Unchanged=true;report.HCRUnchanged=true;report.UIUnchanged=true;
console.log('B46_BTTS_ULTRA_PRIVATE_BACKFILL_RESULT '+JSON.stringify(report));
