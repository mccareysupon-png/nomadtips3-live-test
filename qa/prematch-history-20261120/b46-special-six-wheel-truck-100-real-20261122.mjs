// BALL46 special six-wheel history truck: ONE explicitly user-authorized
// REAL 5USD Ultra trip. Up to 5 upcoming fixtures -> 10 distinct teams x
// 10 last finished matches (<=100 rows). Preserve FULL original provider
// replies. Only import validated rows into isolated TEST BTTS private history.
// No modification of shared HCR, 1X2, Live or Production. No recurring cron.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','NO_PROVIDER_RERUN_ALLOWED');
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const key=process.env.FIVEDOLLAR_API_KEY;
assert(token&&account&&key,'MISSING_TEST_CREDENTIALS');
const MAX_TEAM_CALLS=10,MAX_PROVIDER_CALLS=12,MIN_DELAY_MS=8500;
const outdir='evidence/b46-special-truck-100';
fs.mkdirSync(outdir,{recursive:true});
const host='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const cloudRoot='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protect=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
  'ball46-premium-match-colors-test-20261120'];
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report={
  operation:'B46_SPECIAL_SIX_WHEEL_HISTORY_100_TEST_ONLY_20261122',
  mode:'ONE_OFF_VERIFIED_5USD_ULTRA_TEAM_LAST10',maxFixtures:5,maxTeams:10,
  maxHistoricalRows:100,maxProviderRequests:MAX_PROVIDER_CALLS,
  providerCalls:0,teams:[],targetFixtures:[],historicalRowsReturned:0,
  distinctFinishedFixtures:0,storedPrivateHistoryBefore:null,
  storedPrivateHistoryAfter:null,fields:[],nestedFields:[],
  originalDataPreserved:true,oneX2Unchanged:null,HCRUnchanged:null,
  productionWrites:0,liveHubWrites:0,replayAllowed:false,
  oddsProbe:null,quoteImported:null,stopped:null,errors:[]
};
const evidence={operation:report.operation,verifiedSource:'api.5dollarfootballapi.com',
  requestPaths:[],selectedFixtures:[],teamResponses:[],
  verifiedUniqueHistory:[],oddsResponse:null,report:null};
let providerCalls=0,lastProviderAt=0,lastRemaining=null;
function save() {
 report.providerCalls=providerCalls;
 evidence.report=report;
 fs.writeFileSync(outdir+'/FULL_PROVIDER_EVIDENCE.json',JSON.stringify(evidence,null,2));
 fs.writeFileSync(outdir+'/REPORT.json',JSON.stringify(report,null,2));
 console.log('B46_SPECIAL_TRUCK_100_REPORT '+JSON.stringify(report));
}
async function version(n){
 const r=await fetch(cloudRoot+'/scripts/'+n+'/deployments?per_page=1',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(18000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_VERSION_'+n);
 const v=j.result.deployments?.[0]?.versions?.[0]?.version_id;
 assert(v,'VERSION_MISSING_'+n);return v;
}
async function owner(path,data=null){
 const r=await fetch(host+path,{method:data===null?'GET':'POST',
   headers:{authorization:auth,...(data===null?{}:{'content-type':'application/json'})},
   ...(data===null?{}:{body:JSON.stringify(data)}),cache:'no-store',
   signal:AbortSignal.timeout(30000)});
 const raw=await r.text();
 assert(r.ok,'TEST_OWNER_'+path+'_HTTP_'+r.status+'_'+raw.slice(0,300));
 return JSON.parse(raw);
}
async function provider(path,kind){
 if(providerCalls>=MAX_PROVIDER_CALLS)throw Error('MAX_PROVIDER_CALLS_STOP');
 if(lastRemaining!==null&&lastRemaining<12)throw Error('RATE_RESERVE_BELOW_12_STOP');
 if(lastProviderAt)await new Promise(res=>setTimeout(res,Math.max(0,MIN_DELAY_MS-(Date.now()-lastProviderAt))));
 lastProviderAt=Date.now();
 providerCalls++;
 evidence.requestPaths.push({path,kind,attempt:providerCalls});
 const r=await fetch('https://api.5dollarfootballapi.com'+path,{
   headers:{authorization:'Bearer '+key,accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(25000)});
 const h=r.headers.get('x-ratelimit-remaining');
 lastRemaining=h===null?null:/^\d+$/.test(h)?Number(h):null;
 if(r.status===429)throw Error('HTTP_429_NO_RETRY_RETRY_AFTER_'+(r.headers.get('retry-after')||'not_given'));
 if(!r.ok)throw Error('PROVIDER_'+kind+'_HTTP_'+r.status);
 const j=await r.json();
 if(j?.success!==1)throw Error('PROVIDER_'+kind+'_INVALID_SUCCESS');
 return j;
}
function validRow(f,team,now){
 return f?.status==='finished'&&f.status_code==='full'&&
  Number.isSafeInteger(Number(f?.id))&&Number(f.id)>0&&
  Number.isSafeInteger(Number(f?.league?.id))&&Number(f.league.id)>0&&
  Number.isSafeInteger(Number(f?.teams?.home?.id))&&Number(f.teams.home.id)>0&&
  Number.isSafeInteger(Number(f?.teams?.away?.id))&&Number(f.teams.away.id)>0&&
  Number(f.teams.home.id)!==Number(f.teams.away.id)&&
  [Number(f.teams.home.id),Number(f.teams.away.id)].includes(team)&&
  Number.isSafeInteger(f.kickoff_ts)&&f.kickoff_ts>0&&f.kickoff_ts<now&&
  Number.isSafeInteger(f.goals?.home)&&Number.isSafeInteger(f.goals?.away)&&
  f.goals.home>=0&&f.goals.away>=0;
}
function paths(a){
 if(!a||typeof a!=='object'||Array.isArray(a))return [];
 return Object.entries(a).flatMap(([key,val])=>[
   key,...(val&&typeof val==='object'&&!Array.isArray(val)?Object.keys(val).map(sub=>key+'.'+sub):[])
 ]);
}
async function run(){
 const start=Math.floor(Date.now()/1000);
 const [beforeV,protectedBefore]=await Promise.all([
   version('ball46-prematch-only-test-20261120'),
   Promise.all(protect.map(async n=>[n,await version(n)])).then(Object.fromEntries)
 ]);
 report.testWorkerBefore=beforeV;
 const [beforeHcr,beforeLedger,beforeHist,beforeStats,shadow]=await Promise.all([
   owner('/history-cargo-registry?detail=0'),owner('/test-ledger'),
   owner('/btts-history-private-test'),owner('/prematch-stats-registry-test?days=90'),
   owner('/btts-shadow')
 ]);
 assert.equal(beforeHcr.registry.code,'HCR-V1');
 assert.equal(beforeStats.code,'B46_PREMATCH_STATS_REGISTRY_V1');
 assert.equal(shadow.policy.minHistory,3);
 assert.equal(shadow.policy.minProbability,.6);
 assert.equal(shadow.policy.minPrice,1.5);
 assert.equal(shadow.policy.maxPrice,10);
 assert.equal(shadow.policy.minEV,.05);
 assert.equal(shadow.policy.minEdge,.05);
 const origHash=sha({rows:beforeLedger.rows,stats:beforeLedger.stats});
 report.storedPrivateHistoryBefore=beforeHist.archive.privateFT;
 report.preflight={archiveFT:beforeHcr.inventory.finishedFixtures,upcoming:shadow.totals.upcoming,
   historyReady:shadow.totals.historyReady,oneX2Rows:beforeLedger.rows.length};
 const options=[];
 for(let page=1;page<=32;page++){
  const p=await owner('/btts-preview-data?filter=WAITING_HISTORY&page='+page);
  assert.equal(p.mode,'READ_ONLY_BTTS_SHADOW');
  const view=p.preview;
  for(const f of view.rows??[]){
    if(Number(f.kickoff)>start+7200&&Number(f.kickoff)<start+3*86400&&
      !/(?:\bu\d{2}\b|youth|junior|reserves|reserve|women u\d{2}|academy)/i.test(String(f.leagueName??'')))options.push(f);
  }
  if(page>=view.pages)break;
 }
 const hcr=beforeHcr;
 const idsByFixture=new Map((hcr.supplyPlanning?.highestPriority||[]).map(x=>[String(x.fixtureId),x]));
 const optionsById=new Map(options.map(x=>[String(x.fixtureId),x]));
 // Prefer the archived HCR planner's exact fixture/team mapping rather than
 // guessing a team ID from display names or selecting unsupported fixtures.
 const priorityOptions=[...idsByFixture.keys()].map(id=>optionsById.get(id)).filter(Boolean)
   .sort((a,b)=>a.kickoff-b.kickoff||String(a.fixtureId).localeCompare(String(b.fixtureId)));
 const select=[],teamSeen=new Set();
 for(const f of [...priorityOptions,...options]){
   if(select.length>=5)break;
   const a=String(f.home).trim(),b=String(f.away).trim();
   if(!a||!b||a===b||teamSeen.has(a)||teamSeen.has(b))continue;
   if(!idsByFixture.has(String(f.fixtureId)))continue;
   select.push(f);teamSeen.add(a);teamSeen.add(b);
 }
 assert(select.length>=1,'NO_SUITABLE_HCR_MAPPED_UPCOMING_FIXTURES');
 assert(select.length<=5);
 const teamJobs=[];
 for(const f of select){
   const v=idsByFixture.get(String(f.fixtureId));
   if(!v)continue;
   const home=Number(v.home?.teamId),away=Number(v.away?.teamId);
   if(!Number.isSafeInteger(home)||home<=0||!Number.isSafeInteger(away)||away<=0||home===away)continue;
   if(teamJobs.some(x=>x.id===home||x.id===away))continue;
   teamJobs.push({id:home,name:f.home,fixture:f.fixtureId,kickoff:f.kickoff,side:'home'},
     {id:away,name:f.away,fixture:f.fixtureId,kickoff:f.kickoff,side:'away'});
   report.targetFixtures.push({id:String(f.fixtureId),league:f.leagueName,home:f.home,away:f.away,kickoff:f.kickoff,
     teamIds:{home,away}});
   if(teamJobs.length>=MAX_TEAM_CALLS)break;
 }
 // When the 20 high-priority fixture examples no longer match the current
 // scheduled preview, use the priorityTeams IDs mapped to their example
 // upcoming fixture by exact fixtureID, rather than guessing IDs.
 if(!teamJobs.length){
   const priorities=hcr.supplyPlanning?.priorityTeams||[];
   const grouped=new Map();
   for(const x of priorities){
     const k=String(x.exampleFixtureId);
     if(!grouped.has(k))grouped.set(k,[]);
     grouped.get(k).push(x);
   }
   for(const f of select){
     const x=grouped.get(String(f.fixtureId))||[];
     const home=x.find(z=>z.teamName===f.home),away=x.find(z=>z.teamName===f.away);
     if(!home||!away)continue;
     const h=Number(home.teamId),a=Number(away.teamId);
     if(!Number.isSafeInteger(h)||!Number.isSafeInteger(a)||h<=0||a<=0||h===a)continue;
     teamJobs.push({id:h,name:f.home,fixture:f.fixtureId,kickoff:f.kickoff,side:'home'},
       {id:a,name:f.away,fixture:f.fixtureId,kickoff:f.kickoff,side:'away'});
     report.targetFixtures.push({id:String(f.fixtureId),league:f.leagueName,home:f.home,away:f.away,kickoff:f.kickoff,teamIds:{home:h,away:a}});
     if(teamJobs.length>=MAX_TEAM_CALLS)break;
   }
 }
 assert(teamJobs.length>=2,'TEST_HCR_TEAM_ID_MAPPING_UNAVAILABLE_STOP_NO_PROVIDER');
 assert(teamJobs.length<=MAX_TEAM_CALLS);
 evidence.selectedFixtures=report.targetFixtures;
 console.log('B46_SPECIAL_TRUCK_PLAN '+JSON.stringify({targetFixtures:report.targetFixtures,
   targetTeamCount:teamJobs.length,maxRows:teamJobs.length*10,providerCallCap:MAX_PROVIDER_CALLS}));
 let requestsUsed=0;
 const unique=new Map(),fields=new Set(),nested=new Set();
 for(const team of teamJobs){
   if(requestsUsed>=MAX_TEAM_CALLS||unique.size>=100)break;
   const path='/v1/teams/'+team.id+'/fixtures?'+new URLSearchParams({status:'finished',per_page:'10'});
   const body=await provider(path,'LAST10_TEAM_'+team.id);
   requestsUsed++;
   if(!Array.isArray(body.data)||body.data.length>10)throw Error('INVALID_TEAM_RESULTS_'+team.id);
   evidence.teamResponses.push({team,body});
   const now=Math.floor(Date.now()/1000);
   const passed=body.data.length>0&&body.data.every(f=>validRow(f,team.id,now));
   const entry={teamId:team.id,name:team.name,fixtureId:String(team.fixture),
     requested:10,received:body.data.length,valid:passed,stored:null,
     sample:body.data.slice(0,10).map(f=>({fixtureId:f.id,date:f.kickoff_ts,
       home:f.teams?.home?.name,away:f.teams?.away?.name,
       goals:f.goals,league:f.league?.name,fieldCount:Object.keys(f).length}))};
   report.teams.push(entry);
   report.historicalRowsReturned+=body.data.length;
   if(!passed){
     entry.reason='INVALID_TEAM_HISTORY_SKIPPED_NO_IMPORT';
     continue;
   }
   for(const row of body.data){
     const id=Number(row.id);
     if(!unique.has(id)){unique.set(id,row);for(const n of paths(row))nested.add(n);Object.keys(row).forEach(x=>fields.add(x));}
     else {
       const orig=unique.get(id);
       if(orig.goals?.home!==row.goals?.home||orig.goals?.away!==row.goals?.away||
         String(orig.teams?.home?.id)!==String(row.teams?.home?.id)||
         String(orig.teams?.away?.id)!==String(row.teams?.away?.id))
         throw Error('CONFLICTING_PROVIDER_FIXTURE_'+id);
     }
   }
   const observed=Math.floor(Date.now()/1000);
   const saved=await owner('/btts-team-fallback-test',{
      source:'ULTRA_TEAM_LAST10_FALLBACK',fixtureId:Number(team.fixture),
      teamId:team.id,observed,rows:body.data
   });
   assert.equal(saved.oneX2Changed,false);assert.equal(saved.HCRChanged,false);
   entry.stored=saved.stats;
   if(lastRemaining!==null&&lastRemaining<12){report.stopped='LOW_SHARED_QUOTA_RESERVE';break}
 }
 report.distinctFinishedFixtures=unique.size;
 evidence.verifiedUniqueHistory=[...unique.values()].slice(0,100);
 report.fields=[...fields].sort();report.nestedFields=[...nested].sort();
 report.dataQuality={sampleCount:unique.size,
   rowsWithScores:[...unique.values()].filter(x=>x.goals&&Number.isInteger(x.goals.home)&&Number.isInteger(x.goals.away)).length,
   rowsWithStatistics:[...unique.values()].filter(x=>x.statistics!=null).length,
   rowsWithEvents:[...unique.values()].filter(x=>Array.isArray(x.events)&&x.events.length).length,
   rowsWithOdds:[...unique.values()].filter(x=>x.odds!=null||x.providerOdds!=null).length,
   rowsWithLineups:[...unique.values()].filter(x=>x.lineups!=null).length,
   rowsWithReferee:[...unique.values()].filter(x=>x.referee!=null).length,
   rowsWithVenue:[...unique.values()].filter(x=>x.venue!=null).length};
 // One explicit BTTS market demonstration (John: this price is per-fixture,
 // never in bulk finished results). No retry and no more than 12 total calls.
 if(report.targetFixtures.length&&providerCalls<MAX_PROVIDER_CALLS&&!(lastRemaining!==null&&lastRemaining<12)){
   const pick=report.targetFixtures[0];
   const path='/v1/fixtures/'+pick.id+'/odds?market=btts';
   const odds=await provider(path,'BTTS_BET365_ONE_UPCOMING_FIXTURE');
   evidence.oddsResponse={fixtureId:pick.id,body:odds};
   const books=Array.isArray(odds.bookmakers)?odds.bookmakers:
     Array.isArray(odds.data?.bookmakers)?odds.data.bookmakers:[];
   const bm=books.find(x=>x.slug==='bet365')??null;
   report.oddsProbe={fixtureId:pick.id,bookmakersFound:books.length,
     bet365Found:!!bm,btts:bm?.odds?.btts??null,fullResponseKeys:Object.keys(odds),
     offered:!!bm?.odds?.btts};
   // Worker accepts a verified raw response; do not fabricate BTTS odds.
   if(books.length&&bm){
     const observed=Math.floor(Date.now()/1000);
     try {
       const imported=await owner('/btts-quote-import-test',{
         fixtureId:Number(pick.id),observed,
         response:{bookmakers:books}
       });
       report.quoteImported={state:imported.state,issued:imported.issued};
     }catch(e){report.quoteImported={state:'NOT_IMPORTED',reason:String(e.message).slice(0,250)};}
   }
 }
 const tested=await owner('/btts-cycle-test',{}); // only local BTTS screening; no provider calls
 const [afterHistory,afterHcr,afterLedger,afterStats,shadowAfter,audit]=await Promise.all([
  owner('/btts-history-private-test'),owner('/history-cargo-registry?detail=0'),
  owner('/test-ledger'),owner('/prematch-stats-registry-test?days=90'),
  owner('/btts-shadow'),owner('/prematch-stats-registry-audit-test')
 ]);
 report.screening={before:shadow.totals,after:shadowAfter.totals,cycle:tested.trial};
 report.storedPrivateHistoryAfter=afterHistory.archive.privateFT;
 assert.equal(sha({rows:afterLedger.rows,stats:afterLedger.stats}),origHash,'SOURCE_1X2_MUTATED');
 report.oneX2Unchanged=true;
 assert.equal(afterHcr.registry.code,beforeHcr.registry.code,'HCR_CODE_CHANGED');
 assert.equal(afterHcr.inventory.finishedFixtures,beforeHcr.inventory.finishedFixtures,'HCR_FT_CHANGED');
 report.HCRUnchanged=true;
 assert.equal(afterStats.markets['1X2'].total,beforeStats.markets['1X2'].total,'1X2_SNAPSHOT_CHANGED');
 assert.equal(afterStats.markets.TOTAL.total,
   afterStats.markets['1X2'].total+afterStats.markets.BTTS.total,'SNAPSHOT_TOTAL_MISMATCH');
 assert.equal(audit.verified,true,'SNAPSHOT_AUDIT_FAILED');
 assert.equal(await version('ball46-prematch-only-test-20261120'),beforeV,'TEST_WORKER_CODE_CHANGED');
 const protectedAfter=Object.fromEntries(await Promise.all(protect.map(async n=>[n,await version(n)])));
 assert.deepEqual(protectedAfter,protectedBefore,'LIVE_OR_PRODUCTION_VERSION_CHANGED');
 report.stopped=report.stopped||'ONE_SPECIAL_ROUND_COMPLETE';
 report.productionWrites=0;report.liveHubWrites=0;report.auditPass=true;
}
try{await run()}catch(e){report.stopped=report.stopped||'ABORTED_SAFETY_OR_PROVIDER';report.errors.push(String(e.stack||e.message).slice(0,800));console.log('B46_SPECIAL_TRUCK_CAUTION '+JSON.stringify({reason:String(e.message),requests:providerCalls,distinct:report.distinctFinishedFixtures}));process.exitCode=1}finally{save()}
