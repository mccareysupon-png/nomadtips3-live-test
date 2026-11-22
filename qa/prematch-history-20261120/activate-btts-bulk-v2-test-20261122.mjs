// Conditional cutover: activate Bulk V2, perform ONE real 5USD league
// page, verify full raw archival and tests. If any step fails, PAUSE V2
// so the old cached-FT truck remains the fallback. TEST ONLY.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','CUTOVER_REPLAY_PROHIBITED');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_OWNER_ACCESS');
const worker='ball46-prematch-only-test-20261120';
const requiredWorkerVersion='0f276292-1fd6-4585-887e-4b15617e86b7';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120'];
async function version(n){
 const r=await fetch(root+'/scripts/'+n+'/deployments?per_page=1',{
  headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(16000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_VERSION_'+n);
 return j.result.deployments?.[0]?.versions?.[0]?.version_id;
}
async function owner(path,data=null){
 const r=await fetch(host+path,{
  method:data===null?'GET':'POST',
  headers:{authorization:auth,...(data===null?{}:{'content-type':'application/json'})},
  ...(data===null?{}:{body:JSON.stringify(data)}),cache:'no-store',
  signal:AbortSignal.timeout(60000)
 });
 const raw=await r.text();
 assert(r.ok,'TEST_OWNER_'+path+'_HTTP_'+r.status+'_'+raw.slice(0,300));
 return JSON.parse(raw);
}
const report={code:'B46_BTTS_BULK_V2_CONDITIONAL_TEST_CUTOVER',
 state:'NOT_STARTED',newProviderCalls:0,oldTruckStatus:'UNCHANGED',
 productionWrites:0,protectedWorkersUnchanged:null,
 collected:null,privateFTBefore:null,privateFTAfter:null,rollBack:null};
let activated=false,success=false;
const beforeProtected=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
try{
 assert.equal(await version(worker),requiredWorkerVersion,'V2_TEST_WORKER_ACTIVE_VERSION_DRIFT');
 const [prior,archive,ledger,hcr,shadow]=await Promise.all([
  owner('/btts-bulk-v2-state'),owner('/btts-history-private-test'),
  owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),
  owner('/btts-shadow')
 ]);
 assert.equal(prior.config.mode,'STAGED','CUTOVER_ALREADY_SWITCHED');
 assert.equal(prior.transport.roundsUsed,0,'ROUND_ALREADY_ATTEMPTED_STOP');
 assert.equal(archive.archive.privateFT,595,'BACKFILL_PROOF_ARCHIVE_DRIFT');
 assert.equal(hcr.registry.code,'HCR-V1');
 assert(ledger.rows.length>=76);
 report.privateFTBefore=archive.archive.privateFT;
 report.preflight={historyReady:shadow.totals.historyReady,
   archiveFT:hcr.inventory.finishedFixtures,oneX2:ledger.rows.length};
 const switchResult=await owner('/btts-bulk-v2-control',{action:'activate',proofRun:44995706285});
 assert.equal(switchResult.state,'ACTIVATED','SWITCH_PREFLIGHT_NOT_MET');
 activated=true;
 report.oldTruckStatus='STOPPED_WHILE_ACTIVE';
 const tick=await owner('/btts-bulk-v2-trip',{action:'once_for_cutover'});
 report.collected={state:tick.state,received:tick.received??0,added:tick.added??0,
   providerCalls:tick.providerCalls??0,leagueId:tick.target?.leagueId??null,
   league:tick.target?.leagueName??null,page:tick.target?.page??null,
   slot:tick.slot??null,reason:tick.reason??null};
 report.newProviderCalls=tick.providerCalls??0;
 let completed=tick.state==='COMPLETED'?tick:null;
 const st=await owner('/btts-bulk-v2-state');
 if(!completed&&tick.state==='ALREADY_EXECUTED'){
  const rec=st.transport.rounds.find(x=>x.state==='COMPLETED');
  if(rec)completed={state:'COMPLETED',received:rec.received,
    target:{leagueId:rec.league_id,page:rec.page},slot:rec.round_no,
    day:st.transport.businessDay};
 }
 assert(completed&&completed.received>0,'NEW_TRUCK_NO_SUCCESSFUL_FULL_PAGE');
 const day=st.transport.businessDay,slot=completed.slot;
 const cargo=await owner('/btts-bulk-v2-raw?day='+day+'&round='+slot);
 assert.equal(cargo.body.success,1);
 assert.equal(cargo.body.data.length,completed.received);
 assert(cargo.body.data.every(f=>f.status==='finished'&&f.status_code==='full'&&
  Number.isInteger(f.goals?.home)&&Number.isInteger(f.goals?.away)),'RAW_CARGO_MISSING_SCORES');
 const mission=await owner('/daily-mission',{action:'test_cutover_bot_feed'});
 assert.equal(mission.transport,'BTTS_ULTRA_BULK_V2','OLD_HISTORY_MISSION_NOT_STOPPED');
 assert.equal(mission.state,'HISTORY_DELIVERED_BOT_READY','AUTOMATIC_BOT_FEED_NOT_READY');
 const [latest,afterArchive,afterHcr,afterLedger,stats,audit]=await Promise.all([
  owner('/btts-bulk-v2-state'),owner('/btts-history-private-test'),
  owner('/history-cargo-registry?detail=0'),owner('/test-ledger'),
  owner('/prematch-stats-registry-test?days=90'),
  owner('/prematch-stats-registry-audit-test')
 ]);
 assert.equal(latest.config.mode,'ACTIVE');
 assert(latest.transport.providerCalls<=1,'EXCESS_PROVIDER_CALLS');
 assert.equal(afterHcr.inventory.finishedFixtures,hcr.inventory.finishedFixtures,'OLD_HCR_TRUCK_STILL_RUNNING');
 assert(afterArchive.archive.privateFT>=archive.archive.privateFT,'BTTS_HISTORY_LOST');
 assert(afterLedger.rows.length>=ledger.rows.length,'1X2_LEDGER_LOST');
 assert.equal(stats.markets.TOTAL.total,stats.markets['1X2'].total+stats.markets.BTTS.total);
 assert.equal(audit.verified,true);
 assert.equal(await version(worker),requiredWorkerVersion);
 assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),
  beforeProtected,'PROTECTED_WORKERS_MUTATED');
 report.privateFTAfter=afterArchive.archive.privateFT;
 report.carriedRawFields=Object.keys(cargo.body.data[0]||{}).sort();
 report.bttsScreening=(await owner('/btts-shadow')).totals;
 report.testMission={state:mission.state,transport:mission.transport};
 report.protectedWorkersUnchanged=true;
 report.oldTruckStatus='STOPPED_IN_TEST_BULK_V2_ACTIVE';
 report.state='ACTIVE_SUCCESS';
 success=true;
 console.log('B46_BTTS_BULK_V2_CUTOVER_SUCCESS '+JSON.stringify(report));
}catch(e){
 report.state='ABORTED';
 report.reason=String(e.stack||e).slice(0,850);
 console.log('B46_BTTS_BULK_V2_CUTOVER_ERROR '+JSON.stringify(report));
 process.exitCode=1
}finally{
 if(activated&&!success){
  try{
   const pause=await owner('/btts-bulk-v2-control',{action:'pause'});
   report.rollBack=pause.state;
   report.oldTruckStatus='FALLBACK_REENABLED';
  }catch(e){report.rollBack='FAILED_'+String(e.message).slice(0,300)}
 }
 console.log('B46_BTTS_BULK_V2_CUTOVER_FINAL '+JSON.stringify(report));
}
