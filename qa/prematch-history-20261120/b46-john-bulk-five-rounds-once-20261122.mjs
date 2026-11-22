// BALL46 one-off John-guided Ultra Bulk Backfill, TEST ONLY.
// Five request slots; each league-fixtures page holds <=100 finished matches.
// No season metadata? Official 5USD docs allow league-specific time window
// WITHOUT a 24 hour limit. We select 2026 UTC calendar for accurate archive
// source labelling under existing "season" column (not a league-season claim).
// Private BTTS table only. Raw responses and report retained as GH artifact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','REPLAY_PROHIBITED');
const apiKey=process.env.FIVEDOLLAR_API_KEY;
const cfToken=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(apiKey&&cfToken&&account,'MISSING_TEST_KEYS');
const MAX_FINISHED_PAGES=5,MAX_BTTS_QUOTE_CALLS=2;
const PER_PAGE=100,MAX_PROVIDER_CALLS=7,PACE_MS=8500;
const START_UTC=Math.floor(Date.parse('2026-01-01T00:00:00Z')/1000);
const OUT='evidence/b46-john-bulk-20261122';
fs.mkdirSync(OUT,{recursive:true});
const WORKER='ball46-prematch-only-test-20261120';
const HOST='https://'+WORKER+'.mccarey-supon.workers.dev';
const CF='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const OWNER='Bearer '+crypto.createHmac('sha256',cfToken).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const targets=[
 {id:229,name:'Italy Serie D'},
 {id:12115,name:'Greece Gamma Ethniki'},
 {id:10409,name:'Thailand Division 3'},
 {id:354,name:'Türkiye 2 Lig Beyaz'},
 {id:800,name:'Spain Regional League'},
 {id:453,name:'Türkiye 2 Lig Kirmizi'},
 {id:809,name:'Ghana Premier League'},
 {id:36001,name:'England National League Premier Women'}
];
const report={
 code:'B46_JOHN_BULK_5_ROUNDS_TEST_20261122',mode:'ONE_OFF_REAL_5USD',
 maxTransportRounds:5,perRoundMaxFixtures:100,maxHistoricalRows:500,
 maxProviderRequests:MAX_PROVIDER_CALLS,maxOddsProbeCalls:MAX_BTTS_QUOTE_CALLS,
 providerCalls:0,bulkCalls:0,oddsCalls:0,rounds:[],rawReceived:0,
 distinctReceived:0,newPrivateFT:0,privateFTBefore:null,privateFTAfter:null,
 fields:[],allRawPreserved:true,originals:[],
 evaluation:null,quotes:[],protectedUnchanged:null,
 oneX2Unchanged:null,HCRUnchanged:null,productionWrites:0,liveHubWrites:0,
 stopped:null,problems:[]
};
const evidence={report:null,apiPaths:[],rawPages:[],rawOdds:[],source:'5DollarFootballAPI Ultra',
 provenance:'WINDOW_UTC_2026_BUT_LEGACY_TEST_PRIVATE_SEASON_LABEL_2026'};
let calls=0,bulkCalls=0,oddsCalls=0,lastAt=0,remaining=null;
function hash(x){return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')}
function save(){
 report.providerCalls=calls;report.bulkCalls=bulkCalls;report.oddsCalls=oddsCalls;
 evidence.report=report;
 fs.writeFileSync(OUT+'/ORIGINAL_PROVIDER_RESPONSES.json',JSON.stringify(evidence,null,2));
 fs.writeFileSync(OUT+'/REPORT.json',JSON.stringify(report,null,2));
 console.log('B46_JOHN_BULK_FIVE_ROUND_RESULT '+JSON.stringify(report));
}
async function version(n){
 const r=await fetch(CF+'/scripts/'+n+'/deployments?per_page=1',{headers:{authorization:'Bearer '+cfToken},signal:AbortSignal.timeout(19000)});
 const j=await r.json();assert(r.ok&&j.success,'VERSION_UNAVAILABLE_'+n);
 const v=j.result.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'VERSION_ID_MISSING_'+n);return v;
}
async function owner(path,post=null){
 const r=await fetch(HOST+path,{
  method:post===null?'GET':'POST',
  headers:{authorization:OWNER,...(post===null?{}:{'content-type':'application/json'})},
  ...(post===null?{}:{body:JSON.stringify(post)}),
  cache:'no-store',signal:AbortSignal.timeout(30000)
 });
 const raw=await r.text();
 assert(r.ok,'OWNER_'+path+'_HTTP_'+r.status+'_'+raw.slice(0,200));
 return JSON.parse(raw);
}
async function provider(path,kind){
 assert(calls<MAX_PROVIDER_CALLS,'PROVIDER_LIMIT_7');
 if(remaining!==null&&remaining<=12)throw Error('SHARED_RATE_HEADROOM_STOP_'+remaining);
 if(lastAt)await new Promise(resolve=>setTimeout(resolve,Math.max(0,PACE_MS-(Date.now()-lastAt))));
 lastAt=Date.now();
 calls++;if(kind==='bulk')bulkCalls++;else if(kind==='btts')oddsCalls++;
 evidence.apiPaths.push({kind,path,sequence:calls});
 const r=await fetch('https://api.5dollarfootballapi.com'+path,{
  headers:{authorization:'Bearer '+apiKey,accept:'application/json'},
  redirect:'manual',signal:AbortSignal.timeout(26000)
 });
 const val=r.headers.get('x-ratelimit-remaining');remaining=val!==null&&/^\d+$/.test(val)?Number(val):null;
 if(r.status===429)throw Error('PROVIDER_429_NO_RETRY_'+(r.headers.get('retry-after')??'UNKNOWN'));
 if(!r.ok)throw Error('PROVIDER_HTTP_'+r.status+'_NO_RETRY');
 const body=await r.json();assert.equal(body?.success,1,'INVALID_5USD_PAYLOAD');
 return body;
}
function validFinished(f,id,now){
 return Number.isSafeInteger(Number(f.id))&&Number(f.id)>0&&
  Number(f.league?.id)===id&&f.status==='finished'&&f.status_code==='full'&&
  Number.isSafeInteger(f.kickoff_ts)&&f.kickoff_ts>=START_UTC&&f.kickoff_ts<now&&
  Number.isSafeInteger(f.goals?.home)&&f.goals.home>=0&&
  Number.isSafeInteger(f.goals?.away)&&f.goals.away>=0&&
  Number.isSafeInteger(Number(f.teams?.home?.id))&&Number(f.teams.home.id)>0&&
  Number.isSafeInteger(Number(f.teams?.away?.id))&&Number(f.teams.away.id)>0&&
  Number(f.teams.home.id)!==Number(f.teams.away.id);
}
async function run(){
 const now=Math.floor(Date.now()/1000);
 const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
 const [beforeProtected,workerBefore,beforeHcr,beforeHistory,beforeBot,beforeLedger,beforeStats]=await Promise.all([
   Promise.all(protectedNames.map(async n=>[n,await version(n)])).then(Object.fromEntries),
   version(WORKER),owner('/history-cargo-registry?detail=0'),
   owner('/btts-history-private-test'),owner('/btts-shadow'),
   owner('/test-ledger'),owner('/prematch-stats-registry-test?days=90')
 ]);
 assert.equal(beforeHcr.registry.code,'HCR-V1');
 assert.equal(beforeBot.policy.historyPerTeam,10);
 assert.equal(beforeBot.policy.minHistory,3);
 assert.equal(beforeBot.policy.minProbability,.60);
 assert.equal(beforeBot.policy.minEdge,.05);
 assert.equal(beforeBot.policy.minEV,.05);
 assert.equal(beforeBot.policy.publish,false);
 const priorOneXTwo=hash({rows:beforeLedger.rows,stats:beforeLedger.stats});
 report.privateFTBefore=beforeHistory.archive.privateFT;
 report.preflight={upcoming:beforeBot.totals.upcoming,historyReady:beforeBot.totals.historyReady,
  modelReady:beforeBot.totals.modelProbabilityReady,quoteRequired:beforeBot.totals.quoteRequired,
  hcrFT:beforeHcr.inventory.finishedFixtures,oneX2Rows:beforeLedger.rows.length,
  workerVersion:workerBefore};
 const currentCandidates=new Map(beforeHistory.leagues.map(x=>[Number(x.leagueId),x]));
 const ordered=targets.filter(x=>currentCandidates.has(x.id))
   .sort((a,b)=>(currentCandidates.get(b.id).upcoming-currentCandidates.get(a.id).upcoming));
 assert(ordered.length>=5,'INSUFFICIENT_VERIFIED_TARGET_LEAGUES');
 console.log('B46_JOHN_BULK_PLAN '+JSON.stringify({ranked:ordered.map(x=>({...x,
   upcoming:currentCandidates.get(x.id).upcoming})),pageCap:MAX_FINISHED_PAGES,
   windowStart:new Date(START_UTC*1000).toISOString(),windowEnd:new Date(now*1000).toISOString()}));
 const all=new Map(),fields=new Set();
 let slots=0;
 for(const target of ordered){
   if(slots>=MAX_FINISHED_PAGES)break;
   const q=new URLSearchParams({status:'finished',start_time:String(START_UTC),
     end_time:String(now),per_page:String(PER_PAGE),page:'1'});
   const path='/v1/leagues/'+target.id+'/fixtures?'+q;
   let body;
   try{body=await provider(path,'bulk')}
   catch(e){report.stopped='PROVIDER_GUARD_OR_FAILURE';report.problems.push(String(e.message));break}
   slots++;
   if(!Array.isArray(body.data)||body.data.length>PER_PAGE||
      Number(body.pagination?.page)!==1||typeof body.pagination?.has_more!=='boolean'){
      report.stopped='BAD_PAGE_SCHEMA_NO_IMPORT';report.problems.push('LEAGUE_'+target.id);break
   }
   // Full raw (including any free fields) always saved, not just normalized scores.
   evidence.rawPages.push({leagueId:target.id,league:target.name,urlPath:path,body});
   const invalid=body.data.filter(x=>!validFinished(x,target.id,now));
   if(invalid.length){report.stopped='INVALID_ROWS_PAGE_REJECTED';
     report.problems.push('LEAGUE_'+target.id+'_invalid_'+invalid.length);break}
   if(new Set(body.data.map(x=>String(x.id))).size!==body.data.length){
      report.stopped='DUPLICATE_FIXTURE_WITHIN_PAGE';break;
   }
   for(const row of body.data){
     if(all.has(String(row.id))){
       const old=all.get(String(row.id));
       if(old.goals.home!==row.goals.home||old.goals.away!==row.goals.away)
         throw Error('CONFLICTING_RESULT_ID_'+row.id);
     }else all.set(String(row.id),row);
     Object.keys(row).forEach(k=>fields.add(k));
   }
   const observed=Math.floor(Date.now()/1000);
   // Existing isolated TEST private import expects a numerical season string.
   // For league IDs whose seasons[] is empty, '2026' is explicitly the UTC
   // calendar-range PROVENANCE LABEL only, not a claim of provider league season.
   const importResult=await owner('/btts-history-import-test',{
     source:'ULTRA_FINISHED_LEAGUE_SEASON',leagueId:target.id,
     season:'2026',observed,rows:body.data
   });
   assert.equal(importResult.mode,'BTTS_PRIVATE_HISTORY_TEST');
   assert.equal(importResult.oneX2Changed,false);
   assert.equal(importResult.HCRChanged,false);
   const record={round:slots,leagueId:target.id,leagueName:target.name,
     upcoming:currentCandidates.get(target.id).upcoming,
     requestedMax:100,received:body.data.length,
     imported:importResult.stats.added,duplicates:importResult.stats.duplicates,
     conflicts:importResult.stats.conflicts,
     hasMore:body.pagination.has_more,fields:Object.keys(body.data[0]??{}).sort(),
     startUTC:new Date(START_UTC*1000).toISOString(),
     dataType:'FINISHED_SCORES_NO_INCLUDE',providerRequests:1};
   report.rounds.push(record);
   report.rawReceived+=body.data.length;
   console.log('B46_JOHN_BULK_ROUND '+JSON.stringify(record));
   if(remaining!==null&&remaining<=12){report.stopped='LOW_SHARED_QUOTA_STOP';break}
 }
 report.distinctReceived=all.size;report.fields=[...fields].sort();
 // Use ONLY already stored qualifying probability rows; do not request
 // BTTS per fixture for the whole card. John says Bet365 is market-dependent.
 const afterBulk=await owner('/btts-shadow');
 const candidates=(afterBulk.candidates??[]).filter(x=>
   x.state==='BET365_PRICE_NEEDED'&&x.kickoff>Math.floor(Date.now()/1000)+3600
 ).sort((a,b)=>{
   const ar=targets.some(t=>String(t.id)===String(a.leagueId))?1:0,
         br=targets.some(t=>String(t.id)===String(b.leagueId))?1:0;
   return br-ar||a.kickoff-b.kickoff
 });
 for(const candidate of candidates.slice(0,MAX_BTTS_QUOTE_CALLS)){
   if(remaining!==null&&remaining<=12)break;
   const path='/v1/fixtures/'+candidate.fixtureId+'/odds?market=btts';
   let body;
   try{body=await provider(path,'btts')}
   catch(e){report.problems.push('ODDS_'+String(e.message));break}
   evidence.rawOdds.push({fixtureId:candidate.fixtureId,path,body});
   const odds=body.data??body;
   const books=Array.isArray(odds.bookmakers)?odds.bookmakers:[];
   const bet365=books.find(x=>x.slug==='bet365');
   const offered=bet365?.odds?.btts?.closing?.yes>1&&
      bet365?.odds?.btts?.closing?.no>1||
      bet365?.odds?.btts?.opening?.yes>1&&
      bet365?.odds?.btts?.opening?.no>1;
   const q={fixtureId:candidate.fixtureId,home:candidate.home,away:candidate.away,
    league:candidate.leagueName,bet365Found:!!bet365,
    offered:!!offered,bttsOdds:bet365?.odds?.btts??null,imported:null};
   if(bet365){
     const imported=await owner('/btts-quote-import-test',{
       fixtureId:Number(candidate.fixtureId),observed:Math.floor(Date.now()/1000),
       response:{bookmakers:books}
     });
     q.imported=imported.state;
   }
   report.quotes.push(q);
 }
 const cycle=await owner('/btts-cycle-test',{});
 const [afterHcr,afterHist,afterBot,afterLedger,afterStats,statsAudit,afterProtected,afterWorker]=await Promise.all([
  owner('/history-cargo-registry?detail=0'),owner('/btts-history-private-test'),
  owner('/btts-shadow'),owner('/test-ledger'),owner('/prematch-stats-registry-test?days=90'),
  owner('/prematch-stats-registry-audit-test'),
  Promise.all(protectedNames.map(async n=>[n,await version(n)])).then(Object.fromEntries),
  version(WORKER)
 ]);
 report.privateFTAfter=afterHist.archive.privateFT;
 report.newPrivateFT=afterHist.archive.privateFT-beforeHistory.archive.privateFT;
 report.evaluation={before:beforeBot.totals,after:afterBot.totals,
   modelReadyDelta:afterBot.totals.modelProbabilityReady-beforeBot.totals.modelProbabilityReady,
   historyReadyDelta:afterBot.totals.historyReady-beforeBot.totals.historyReady,
   qualifiedDelta:afterBot.totals.qualified-beforeBot.totals.qualified,
   cycle:cycle.trial};
 assert.equal(hash({rows:afterLedger.rows,stats:afterLedger.stats}),priorOneXTwo,'1X2_SOURCE_MUTATED');
 report.oneX2Unchanged=true;
 assert.equal(afterHcr.inventory.finishedFixtures,beforeHcr.inventory.finishedFixtures,'HCR_FT_MUTATED');
 report.HCRUnchanged=true;
 assert.equal(afterStats.markets['1X2'].total,beforeStats.markets['1X2'].total,'1X2_STATS_MUTATED');
 assert.equal(afterStats.markets.TOTAL.total,afterStats.markets['1X2'].total+afterStats.markets.BTTS.total,'STATS_TOTAL_MISMATCH');
 assert.equal(statsAudit.verified,true,'STATS_REGISTRY_AUDIT_FAILED');
 assert.equal(afterWorker,workerBefore,'TEST_WORKER_CODE_CHANGED');
 assert.deepEqual(afterProtected,beforeProtected,'PRODUCTION_OR_HUB_VERSION_CHANGED');
 report.protectedUnchanged=true;
 report.stopped=report.stopped||'FIVE_BULK_ROUNDS_COMPLETE';
 report.auditPass=true;
}
try{await run()}catch(e){
 report.stopped=report.stopped||'SAFETY_ABORT';
 report.problems.push(String(e.stack||e).slice(0,1100));process.exitCode=1;
 console.log('B46_JOHN_BULK_CAUTION '+JSON.stringify({reason:String(e.message),providerCalls:calls}));
}finally{save()}
