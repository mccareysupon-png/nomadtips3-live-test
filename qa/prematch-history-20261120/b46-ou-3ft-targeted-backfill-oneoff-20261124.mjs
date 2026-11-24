// BALL46 explicitly authorized one-shot, TEST ONLY historical FT acquisition.
// Stage 1: Upcoming/Waiting target teams, >=3 prior FT each, deduped SQLite.
// Stage 2 odds/EV untouched. CLOSED Ultra scheduler stays CLOSED.
// Strict local budget: up to 4 league pages x 100 + up to 8 team pages x 10
// (maximum 480 returned FT rows, 12 requests, >=9 seconds between requests).
// No retries, no replay, no new cron, no LIVE/HUB/Production writes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','NEVER_REPLAY_PROVIDER_REQUESTS');
const secret=process.env.FIVEDOLLAR_API_KEY,token=process.env.CLOUDFLARE_API_TOKEN,
 account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(secret&&token&&account,'MISSING_APPROVED_KEYS');
const host='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const hub='https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev';
const cloud='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const MAX_LEAGUE=4,MAX_TEAM=8,MAX_CALLS=12,MAX_ROWS=480,SPACING_MS=9100;
const out='evidence/b46-ou-upcoming-history-three-20261124';
fs.mkdirSync(out,{recursive:true});
const report={code:'B46_OU_UPCOMING_HISTORY_BACKFILL_ONE_SHOT_20261124',
 scope:'TEST_ONLY',source:'5USD_ULTRA_FINISHED_FT',maxLeaguePages:MAX_LEAGUE,
 maxTeamPages:MAX_TEAM,maxProviderCalls:MAX_CALLS,maxReturnedRows:MAX_ROWS,
 minHistoryPerTeam:3,maxModelHistoryPerTeam:10,
 leagueRounds:[],teamRounds:[],providerCalls:0,requestedRows:0,
 originalPaths:[],begin:null,end:null,stopped:null,problem:null,
 providerRateRemaining:null,ultraActivated:false,pricesTouched:false,
 legacyHistoryRoundsTouched:false,liveHubWrites:0,productionWrites:0,
 productionVersionsUnchanged:null,oldOuPricePreserved:null};
const safeName=s=>String(s??'').slice(0,100);
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
const sec=()=>Math.floor(Date.now()/1000);
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function version(name){
 const res=await fetch(cloud+'/scripts/'+name+'/deployments?per_page=1',
  {headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 const j=await res.json();assert(res.ok&&j.success,'CF_VERSION_'+name);
 return j.result.deployments[0].versions[0].version_id;
}
async function owner(path,body=null){
 const res=await fetch(host+path,{method:body===null?'GET':'POST',
  headers:{authorization:auth,...(body===null?{}:{'content-type':'application/json'})},
  ...(body!==null?{body:JSON.stringify(body)}:{}),
  cache:'no-store',signal:AbortSignal.timeout(30000)});
 const txt=await res.text();
 assert(res.ok,'TEST_OWNER_'+path+'_HTTP_'+res.status+'_'+txt.slice(0,220));
 return JSON.parse(txt);
}
async function hubHealth(){
 const r=await fetch(hub+'/health',{cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert(r.ok,'HUB_HEALTH_HTTP_'+r.status);
 const h=await r.json();
 const last429=Number(h.lastRateLimitAt||0);
 assert(h.ok===true&&h.stale!==true&&!h.lastError&&
  !(Number(h.retryAfterSec)>0)&&
  !(last429>0&&sec()-last429<600),'HUB_QUOTA_OR_HEALTH_UNSAFE');
 if(Number.isFinite(h.estimatedBulkRequestsPerMinute))
  assert(h.estimatedBulkRequestsPerMinute<=25,'LIVE_BULK_RATE_TOO_HIGH');
 return {ok:h.ok,liveRequestsPerMinute:h.estimatedBulkRequestsPerMinute,
  hubAgeMs:h.ageMs,lastError:!!h.lastError};
}
let calls=0,lastAt=0,lastRemaining=null,stop=false;
async function paid(path,kind){
 assert(calls<MAX_CALLS,'OVER_MAX_12_PROVIDER_CALLS');
 if(lastRemaining!==null&&lastRemaining<=12)throw Error('SHARED_QUOTA_HEADROOM_12_STOP');
 if(lastAt)await new Promise(resolve=>setTimeout(resolve,Math.max(0,SPACING_MS-(Date.now()-lastAt))));
 lastAt=Date.now();calls++;report.providerCalls=calls;
 report.originalPaths.push({n:calls,kind,path});
 const r=await fetch('https://api.5dollarfootballapi.com'+path,{
  headers:{authorization:'Bearer '+secret,accept:'application/json'},
  redirect:'manual',signal:AbortSignal.timeout(32000)});
 const remaining=r.headers.get('x-ratelimit-remaining');
 lastRemaining=remaining===null?null:/^\d+$/.test(remaining)?Number(remaining):null;
 report.providerRateRemaining=lastRemaining;
 if(r.status===429)throw Error('UPSTREAM_429_STOP_NO_RETRY_'+safeName(r.headers.get('retry-after')));
 assert(r.ok,'UPSTREAM_HTTP_'+r.status+'_NO_RETRY');
 const body=await r.json();
 assert(body.success===1&&Array.isArray(body.data)&&body.data.length<=100,
  'UPSTREAM_INVALID_DATA_SCHEMA');
 return body;
}
function verified(row,now,expectedLeague=null,expectedTeam=null){
 const h=Number(row?.teams?.home?.id),a=Number(row?.teams?.away?.id);
 return positive(row?.id)&&positive(row?.league?.id)&&positive(h)&&positive(a)&&h!==a&&
  row.status==='finished'&&row.status_code==='full'&&
  Number.isSafeInteger(row.kickoff_ts)&&row.kickoff_ts>0&&row.kickoff_ts<now&&
  Number.isSafeInteger(row.goals?.home)&&row.goals.home>=0&&
  Number.isSafeInteger(row.goals?.away)&&row.goals.away>=0&&
  (expectedLeague===null||Number(row.league.id)===expectedLeague)&&
  (expectedTeam===null||h===expectedTeam||a===expectedTeam);
}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120'];
const beforeVersion=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const testVersion=await version('ball46-prematch-only-test-20261120');
const [before,archive,truck,visible,health]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),
 owner('/ou-history-ft-state'),
 owner('/btts-bulk-v2-state'),
 owner('/preview-data'),
 hubHealth()]);
report.begin={at:new Date().toISOString(),testVersion,health,
 hcrFT:before.inventory?.finishedFixtures,privateFT:archive.archive?.ft,
 upcoming:before.supplyPlanning?.upcomingFixtures,ready3:before.supplyPlanning?.readyFixtures,
 missingTeamGames:before.supplyPlanning?.deduplicatedTeamMatchGaps};
assert(truck.config.mode==='CLOSED','ULTRA_TRUCK_MUST_REMAIN_CLOSED');
assert.equal(before.supplyPlanning.targetHistoryPerTeam,3,'TEST_GATE_MUST_BE_THREE');
assert.equal(before.supplyPlanning.historySource,'DEDUPED_OU_ONLY_PLUS_1X2_BTTS_FINISHED_FT_ASOF');
assert(archive.code==='B46_OU_TARGET_FT_HISTORY_V1_TEST','OU_DEDICATED_VAULT_NOT_AVAILABLE');
assert(before.supplyPlanning.upcomingFixtures>0,'NO_UPCOMING_WAITING_IN_TARGET_FEED');
const originalOu=visible.ouLedger?.rows?.find(x=>Number(x.fixture_id)===204906152);
assert(originalOu?.status==='LOSS'&&originalOu?.units===-1,'OU_OLD_IMMUTABLE_PICK_MISSING');
console.log('B46_OU_HISTORY_BACKFILL_PREFLIGHT '+JSON.stringify(report.begin));
let aborted=null;
try{
 const priority=(before.supplyPlanning.priorityLeagues??[])
  .filter(x=>positive(x.leagueId)&&x.incompleteFixtures>0)
  .sort((a,b)=>b.incompleteFixtures-a.incompleteFixtures||b.totalFixtures-a.totalFixtures)
  .slice(0,MAX_LEAGUE);
 assert(priority.length>0,'NO_VERIFIED_UPCOMING_LEAGUES');
 for(const league of priority){
  if(stop)break;
  // Provider expects Unix-seconds start_time/end_time (verified in prior successful 5USD calls).
  const from=String(Math.floor(Date.parse('2026-01-01T00:00:00Z')/1000)),end=String(sec());
  const query=new URLSearchParams({status:'finished',start_time:from,end_time:end,
   per_page:'100',page:'1'});
  const path='/v1/leagues/'+league.leagueId+'/fixtures?'+query;
  let body;
  try{body=await paid(path,'LEAGUE_FINISHED')}catch(e){aborted=safeName(e.message);stop=true;break}
  const page=body.pagination;
  if(Number(page?.page)!==1||typeof page?.has_more!=='boolean'||
     body.data.some(f=>!verified(f,sec(),Number(league.leagueId)))){aborted='INVALID_LEAGUE_FINISHED_PAGE_'+league.leagueId;stop=true;break}
  const distinct=new Set(body.data.map(x=>String(x.id)));
  if(distinct.size!==body.data.length){aborted='DUPLICATE_ID_WITHIN_PAGE';stop=true;break}
  assert(report.requestedRows+body.data.length<=MAX_ROWS,'FT_RETURN_CAP_EXCEEDED');
  report.requestedRows+=body.data.length;
  const observed=sec();
  const imported=await owner('/ou-history-ft-import-test',{
    source:'UPCOMING_LEAGUE_FT',leagueId:Number(league.leagueId),observed,rows:body.data
  });
  assert(imported.code==='B46_OU_TARGET_FT_HISTORY_V1_TEST'&&
   imported.oneX2LedgerUnchanged===true&&imported.bttsProjectUnchanged===true,
   'ISOLATED_OU_TEST_IMPORT_INVALID');
  const rec={leagueId:league.leagueId,leagueName:safeName(league.leagueName),
   upcomingFixtures:league.totalFixtures,received:body.data.length,
   newFT:imported.stats.added,duplicates:imported.stats.unchanged,
   hasMore:page.has_more,source:'PROVIDER_2026_WINDOW_PAGE_1_NOT_FULL_SEASON'};
  report.leagueRounds.push(rec);
  console.log('B46_OU_HISTORY_LEAGUE_PAGE '+JSON.stringify(rec));
  if(lastRemaining!==null&&lastRemaining<=12){aborted='RATE_RESERVE_AFTER_LEAGUES';stop=true}
 }
 if(!stop){
  await hubHealth();
  const mid=await owner('/history-cargo-registry?detail=0');
  report.afterLeague={ready3:mid.supplyPlanning.readyFixtures,
   missingTeamGames:mid.supplyPlanning.deduplicatedTeamMatchGaps};
  const upcoming=(mid.supplyPlanning.highestPriority??[])
   .filter(x=>Number.isFinite(Date.parse(x.kickoffUTC))&&
    Date.parse(x.kickoffUTC)>Date.now()+20*60*1000)
   .sort((a,b)=>a.kickoffUTC.localeCompare(b.kickoffUTC));
  const attempted=new Set();
  for(const f of upcoming){
   if(stop||report.teamRounds.length>=MAX_TEAM)break;
   // Read-only coverage refresh. Fixture may have become complete after the
   // league pages or another team's successful import.
   const current=await owner('/history-cargo-registry?detail=0');
   const live=(current.supplyPlanning.highestPriority??[]).find(x=>x.fixtureId===f.fixtureId);
   if(!live||live.completeFor3)continue;
   for(const side of ['home','away']){
    if(stop||report.teamRounds.length>=MAX_TEAM)break;
    const team=live[side],teamId=Number(team?.teamId);
    if(!positive(teamId)||team?.missingTo3<=0||attempted.has(teamId))continue;
    attempted.add(teamId);
    const path='/v1/teams/'+teamId+'/fixtures?status=finished&per_page=10';
    let body;
    try{body=await paid(path,'TEAM_FT_FALLBACK')}catch(e){aborted=safeName(e.message);stop=true;break}
    const distinct=new Set(body.data.map(x=>String(x.id)));
    if(body.data.length>10||distinct.size!==body.data.length||
      body.data.some(x=>!verified(x,sec(),null,teamId))){
      aborted='INVALID_TEAM_FT_PAGE_'+teamId;stop=true;break
    }
    if(report.requestedRows+body.data.length>MAX_ROWS){
      aborted='MAX_RETURNED_FT_ROWS_REACHED';stop=true;break
    }
    report.requestedRows+=body.data.length;
    let imported={stats:{added:0,unchanged:0,conflicts:0}};
    if(body.data.length)imported=await owner('/ou-history-ft-import-test',{
     source:'UPCOMING_TEAM_FT',fixtureId:f.fixtureId,teamId,
     observed:sec(),rows:body.data});
    const rec={fixtureId:f.fixtureId,teamId,teamName:safeName(team.teamName),
     received:body.data.length,newFT:imported.stats.added,duplicates:imported.stats.unchanged,
     oldestKickoff:body.data.length?new Date(Math.min(...body.data.map(x=>x.kickoff_ts))*1000).toISOString():null};
    report.teamRounds.push(rec);
    console.log('B46_OU_HISTORY_TEAM_FALLBACK '+JSON.stringify(rec));
    if(lastRemaining!==null&&lastRemaining<=12){aborted='RATE_RESERVE_AFTER_TEAMS';stop=true;break}
   }
  }
 }
}catch(e){
 aborted=aborted??safeName(e.message);
 report.problem=String(e.stack||e).slice(0,900);
}
try{
 const [after,priv,closed,ou,afterVersions,afterTestVersion]=await Promise.all([
  owner('/history-cargo-registry?detail=0'),owner('/ou-history-ft-state'),
  owner('/btts-bulk-v2-state'),owner('/preview-data'),
  Promise.all(protectedNames.map(async n=>[n,await version(n)])).then(Object.fromEntries),
  version('ball46-prematch-only-test-20261120')
 ]);
 report.end={at:new Date().toISOString(),hcrFT:after.inventory.finishedFixtures,
  privateFT:priv.archive.ft,upcoming:after.supplyPlanning.upcomingFixtures,
  ready3:after.supplyPlanning.readyFixtures,
  missingTeamGames:after.supplyPlanning.deduplicatedTeamMatchGaps,
  uniqueTeamsMissing:after.supplyPlanning.uniqueTeamsNeedingHistory,
  deltaReady3:after.supplyPlanning.readyFixtures-before.supplyPlanning.readyFixtures,
  deltaPrivateFT:priv.archive.ft-archive.archive.ft,
  testedOuCandidateReadyAtNextCron:after.supplyPlanning.readyFixtures};
 report.ultraActivated=closed.config.mode!=='CLOSED';
 const afterPick=ou.ouLedger?.rows?.find(x=>Number(x.fixture_id)===204906152);
 report.oldOuPricePreserved=afterPick?.status==='LOSS'&&afterPick?.units===-1&&Number(afterPick.price)===2.8;
 report.productionVersionsUnchanged=sha(beforeVersion)===sha(afterVersions);
 assert(report.productionVersionsUnchanged&&report.oldOuPricePreserved&&
  !report.ultraActivated&&afterTestVersion===testVersion,'TEST_ISOLATION_OR_PICK_REGRESSION');
 console.log('B46_OU_HISTORY_BACKFILL_RESULT '+JSON.stringify({
  ...report,originalPaths:report.originalPaths.map(x=>({n:x.n,kind:x.kind,path:x.path}))
 }).slice(0,25000));
}catch(e){report.problem=String(e.stack||e).slice(0,900);aborted=aborted??'POSTCHECK_UNAVAILABLE'}
report.stopped=aborted??'ONE_SHOT_COMPLETED_NO_RETRY';
report.providerCalls=calls;
fs.writeFileSync(out+'/REPORT.json',JSON.stringify(report,null,2));
console.log('B46_OU_HISTORY_BACKFILL_FINAL '+JSON.stringify({
 state:report.stopped,calls,requestedRows:report.requestedRows,
 newFT:report.end?.deltaPrivateFT,ready3Before:report.begin.ready3,
 ready3After:report.end?.ready3,
 missingTeamGamesBefore:report.begin.missingTeamGames,
 missingTeamGamesAfter:report.end?.missingTeamGames,
 successfulLeaguePages:report.leagueRounds.length,
 successfulTeamCalls:report.teamRounds.length,
 ultraMode:report.ultraActivated?'UNEXPECTEDLY_ACTIVE':'CLOSED',
 noProductionWrites:report.productionWrites===0,
 noPricesTouched:!report.pricesTouched
}));
if(aborted)process.exitCode=1;
