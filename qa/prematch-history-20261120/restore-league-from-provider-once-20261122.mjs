// Owner-approved targeted one-shot league-name repair in TEST, following John's
// Ultra guidance: a small number of BULK /v1/fixtures calls, 100 rows/page,
// no include=odds, never a call per fixture; no pagination replay.
// Entire flow is explicit, once only, <=5 upstream requests, >=8 sec apart.
// Never mutate 1X2 ledger, BTTS configuration, HCR, shared HUB, or production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','NO_RERUN_OF_PROVIDER_RECOVERY');
const token=process.env.CLOUDFLARE_API_TOKEN,key=process.env.FIVEDOLLAR_API_KEY,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&key&&account,'MISSING_TEST_PROVIDER_CREDENTIALS');
const host='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const MAX_REQUESTS=5,PAUSE_MS=8500;
const seconds=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
const validName=x=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=130;
async function owner(path,body=null){
 const r=await fetch(host+path,{method:body===null?'GET':'POST',headers:{authorization:auth,...(body===null?{}:{'content-type':'application/json'})},...(body===null?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(25000)});
 const out=await r.json().catch(()=>({error:'NON_JSON'}));
 assert(r.ok,'TEST_OWNER_'+path+'_'+r.status+'_'+JSON.stringify(out).slice(0,320));
 return out;
}
async function version(name){
 const r=await fetch(root+'/scripts/'+name+'/deployments?per_page=1',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 const j=await r.json();assert(r.ok&&j.success,'VERSION_ERROR_'+name);return j.result.deployments?.[0]?.versions?.[0]?.version_id;
}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await version(name)])));
const [before,hcr,cargo]=await Promise.all([owner('/preview-data'),owner('/history-cargo-registry?detail=0'),owner('/history-cargo-full')]);
assert.equal(hcr.registry.code,'HCR-V1');assert.equal(cargo.registry,'HISTORY-CARGO-FULL-V1');
assert.equal(before.testLedger.mode,'TEST_ONLY');
const ledgerJson=JSON.stringify(before.testLedger.rows),ledgerStats=JSON.stringify(before.testLedger.stats);
const byId=new Map(before.testLedger.rows.map(p=>[String(p.fixture_id),p]));
const missing=before.testLedger.rows.filter(p=>!validName(before.testMonitor?.monitor?.[String(p.fixture_id)]?.leagueName));
const wanted=new Map(missing.map(x=>[String(x.fixture_id),x]));
const recovered=new Map(),conflict=new Set();
function add(f,source){
 const fixtureId=seconds(f.fixtureId),homeId=seconds(f.homeId),awayId=seconds(f.awayId),leagueId=seconds(f.leagueId);
 const leagueName=validName(f.leagueName)?f.leagueName.trim():null;
 if(!fixtureId||!homeId||!awayId||!leagueId||!leagueName)return false;
 const p=wanted.get(String(fixtureId));
 if(!p||Number(p.home_id)!==homeId||Number(p.away_id)!==awayId)return false;
 const record={fixtureId,homeId,awayId,leagueId,leagueName};
 const old=recovered.get(String(fixtureId));
 if(old&&(old.leagueId!==leagueId||old.leagueName!==leagueName)){conflict.add(String(fixtureId));return false}
 recovered.set(String(fixtureId),record);return true;
}
// Recover from the ORIGINAL provider response archived in GitHub Actions,
// rather than re-request a match we already have.
const files=fs.readdirSync('prior').filter(x=>/^scheduled-\d+\.json$/.test(x));
let rawEntries=0,originalRecovered=0;
for(const file of files){
 const j=JSON.parse(fs.readFileSync('prior/'+file,'utf8'));
 for(const f of j.body?.data??[]){
  rawEntries++;
  if(add({fixtureId:f.id,homeId:f.teams?.home?.id,awayId:f.teams?.away?.id,leagueId:f.league?.id,leagueName:f.league?.name},'SAVED_ORIGINAL'))originalRecovered++;
 }
}
// Demand-specific kickoff-minute windows minimize page count and provider traffic.
// 5USD /v1/fixtures supports arbitrary <=24h UTC windows and status=all.
const groups=new Map();
for(const p of missing){
 if(recovered.has(String(p.fixture_id)))continue;
 const t=seconds(p.kickoff);if(!t)continue;
 const start=Math.floor(t/60)*60;
 if(!groups.has(start))groups.set(start,[]);
 groups.get(start).push(String(p.fixture_id));
}
const sorted=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length||a[0]-b[0]);
let requests=0,rowsScanned=0,last=0,stopReason='ALL_WINDOWS_READ',coverage=[];
for(const [start,ids] of sorted){
 let page=1,pages=0;
 while(requests<MAX_REQUESTS){
  // Only query the exact kickoff minute: no background range/crawl or odds.
  const params=new URLSearchParams({status:'all',start_time:String(start),end_time:String(start+60),per_page:'100',page:String(page)});
  if(last)await new Promise(r=>setTimeout(r,Math.max(0,PAUSE_MS-(Date.now()-last))));
  last=Date.now();requests++;
  const r=await fetch('https://api.5dollarfootballapi.com/v1/fixtures?'+params,{headers:{authorization:'Bearer '+key,accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(25000)});
  const remain=r.headers.get('x-ratelimit-remaining');
  if(r.status===429){stopReason='HTTP_429_STOP_RETRY_AFTER_'+(r.headers.get('retry-after')||'unreported');break}
  if(!r.ok){stopReason='HTTP_'+r.status;break}
  const j=await r.json();
  if(j?.success!==1||!Array.isArray(j.data)||j.data.length>100||Number(j.pagination?.page)!==page||typeof j.pagination?.has_more!=='boolean'){
   stopReason='BAD_PROVIDER_SCHEMA';break;
  }
  pages++;rowsScanned+=j.data.length;
  for(const f of j.data){
   add({fixtureId:f.id,homeId:f.teams?.home?.id,awayId:f.teams?.away?.id,leagueId:f.league?.id,leagueName:f.league?.name},'5USD_BULK');
  }
  const found=ids.filter(id=>recovered.has(id)).length;
  coverage.push({startUtc:new Date(start*1000).toISOString(),page,rows:j.data.length,targetCount:ids.length,found,hasMore:j.pagination.has_more});
  if(remain!==null&&/^\d+$/.test(remain)&&Number(remain)<12){stopReason='SHARED_ACCOUNT_RATE_RESERVE';break}
  if(found===ids.length||!j.pagination.has_more)break;
  page++;
 }
 if(stopReason!=='ALL_WINDOWS_READ')break;
 if(requests===MAX_REQUESTS){stopReason='FIVE_REQUEST_CAP';break}
}
for(const fixtureId of conflict)recovered.delete(fixtureId);
const restore=[...recovered.values()];
let response={restored:0,existing:0};
if(restore.length){
 response=await owner('/league-restore',{source:'5USD_ORIGINAL_FIXTURES_VERIFIED',fixtures:restore});
 assert.equal(response.code,'PREMATCH_LEAGUE_RESTORE_TEST_ONLY');
 assert.equal(response.ledgerChanged,false);assert.equal(response.providerCalls,0);
}
const after=await owner('/preview-data');
const hcrAfter=await owner('/history-cargo-registry?detail=0'),cargoAfter=await owner('/history-cargo-full');
assert.equal(JSON.stringify(after.testLedger.rows),ledgerJson,'PICK_LEDGER_MODIFIED_ABORT');
assert.equal(JSON.stringify(after.testLedger.stats),ledgerStats,'PICK_STATISTICS_MODIFIED_ABORT');
assert(hcrAfter.inventory.finishedFixtures>=hcr.inventory.finishedFixtures,'HISTORY_ARCHIVE_SHRANK');
assert.equal(hcrAfter.registry.code,'HCR-V1');assert.equal(cargoAfter.registry,'HISTORY-CARGO-FULL-V1');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await version(name)]))),protectedBefore,'PROTECTED_WORKERS_CHANGED');
const currentMissing=after.testLedger.rows.filter(p=>!validName(after.testMonitor?.monitor?.[String(p.fixture_id)]?.leagueName));
const report={
 code:'B46_JOHN_ORIGINAL_LEAGUE_RECOVERY',state:'TEST_ONLY',
 originalArtifactFixtures:rawEntries,originalArtifactMatches:originalRecovered,
 missingBefore:missing.length,missingAfter:currentMissing.length,
 namesRestored:response.restored??0,duplicates:response.existing??0,
 providerCalls:requests,maxProviderCalls:MAX_REQUESTS,pages:coverage,
 stopReason,rawConflicts:conflict.size,scannedRows:rowsScanned,
 remainingFixtureIds:currentMissing.map(p=>Number(p.fixture_id)),
 ledgerUnchanged:true,HCRUnchanged:true,productionWrites:0
};
console.log('B46_JOHN_ORIGINAL_LEAGUE_RECOVERY '+JSON.stringify(report));
