// Ultra BTTS owner-approved ONE fixture team last10 fallback TEST trial.
// 1 fixture validation + 2 last10 team result pages = <=3 5USD calls.
// Zero extra Live/HUB requests, no background poller, no writes except
// isolated btts_history_private_test. Original responses kept in artifact.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','PROVIDER_REPLAY_DISABLED');
const key=process.env.FIVEDOLLAR_API_KEY,token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(key&&token&&account,'MISSING_TEST_PROVIDER_ACCESS');
const worker='ball46-prematch-only-test-20261120';
const expected='cee0e535-c220-4a5e-9ebe-6600698e4c47';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
let calls=0,lastCall=0,remaining=null;
const output={mode:'BTTS_TEAM_LAST10_ULTRA_FALLBACK_TEST',targetLeague:null,
 providerCalls:0,maxProviderCalls:3,fixtureId:null,teams:[],before:null,after:null,
 published:0,productionWrites:0,oneX2Writes:0,HCRWrites:0,uiWrites:0};
async function version(name){
 const r=await fetch(root+'/scripts/'+name+'/deployments?per_page=1',{
  headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(14000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_VERSION_'+name);
 return j.result.deployments?.[0]?.versions?.[0]?.version_id;
}
async function owner(path,body=null){
 const r=await fetch(host+path,{method:body===null?'GET':'POST',
  headers:{authorization:auth,...(body===null?{}:{'content-type':'application/json'})},
  ...(body===null?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const j=await r.json().catch(()=>({error:'INVALID_RESPONSE_JSON'}));
 assert(r.ok,'BTTS_TEST_OWNER_'+path+'_'+r.status+'_'+JSON.stringify(j).slice(0,350));return j;
}
async function provider(path,tag){
 assert(calls<3,'MAX_THREE_PROVIDER_CALLS');
 if(lastCall)await new Promise(r=>setTimeout(r,Math.max(0,8500-(Date.now()-lastCall))));
 lastCall=Date.now();calls++;output.providerCalls=calls;
 const r=await fetch('https://api.5dollarfootballapi.com'+path,{
  headers:{authorization:'Bearer '+key,accept:'application/json'},redirect:'manual',
  signal:AbortSignal.timeout(20000)});
 const h=r.headers.get('x-ratelimit-remaining');
 remaining=h!==null&&/^\d+$/.test(h)?Number(h):null;
 if(r.status===429)throw Error('PROVIDER_429_RETRY_AFTER_'+(r.headers.get('retry-after')||'UNKNOWN')+'_NO_RETRY');
 assert(r.ok,'PROVIDER_'+tag+'_'+r.status);
 const j=await r.json();assert(j?.success===1,'INVALID_PROVIDER_'+tag);
 return j;
}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(await version(worker),expected,'BTTS_TEST_WORKER_VERSION_MISMATCH');
let state;
for(let i=0;i<20;i++){
 try{state=await owner('/btts-history-private-test');assert.equal(state.mode,'BTTS_PRIVATE_HISTORY_TEST');break}
 catch(e){if(i===19)throw e;await new Promise(r=>setTimeout(r,1000))}
}
assert.equal(state.archive.privateFT,0,'BTTS_PRIVATE_FALLBACK_ALREADY_IMPORTED_NO_REQUERY');
assert(state.leagues.length>0,'NO_BTTS_TEST_FIXTURES');
const [priorLedger,priorHcr,priorBtts]=await Promise.all([
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0'),owner('/btts-shadow')]);
assert.equal(priorLedger.rows.length,75);assert.equal(priorHcr.registry.code,'HCR-V1');
const ledgerHash=crypto.createHash('sha256').update(JSON.stringify({rows:priorLedger.rows,stats:priorLedger.stats})).digest('hex');
output.before={historyFT:state.archive.privateFT,historyReady:priorBtts.totals.historyReady,oneX2Rows:priorLedger.rows.length};
const now=Math.floor(Date.now()/1000),options=[];
for(let page=1;page<=5;page++){
 const preview=await owner('/btts-preview-data?'+new URLSearchParams({page:String(page),filter:'ALL'}));
 assert.equal(preview.mode,'READ_ONLY_BTTS_SHADOW');
 for(const f of preview.preview.rows)if(f.kickoff>now+3600&&f.state==='WAITING_HISTORY')options.push(f);
 if(options.length)break;
}
assert(options.length,'NO_FUTURE_BTTS_TEST_FIXTURE');
const f=options.filter(x=>!/(?:\\bU\\d{2}\\b|Youth|Reserves|Junior)/i.test(x.leagueName))
 .sort((a,b)=>a.kickoff-b.kickoff)[0]??options.sort((a,b)=>a.kickoff-b.kickoff)[0];
output.fixtureId=Number(f.fixtureId);
const fixturePayload=await provider('/v1/fixtures/'+f.fixtureId,'FIXTURE');
const raw=fixturePayload.data;
const home=Number(raw?.teams?.home?.id),away=Number(raw?.teams?.away?.id);
assert(Number(raw?.id)===Number(f.fixtureId)&&
  Number.isSafeInteger(Number(raw?.league?.id))&&Number(raw.league.id)>0&&
  Number.isSafeInteger(home)&&Number.isSafeInteger(away)&&home>0&&away>0&&home!==away&&
  Number(raw.kickoff_ts)===Number(f.kickoff),'PROVIDER_FIXTURE_IDENTITY_MISMATCH');
output.targetLeague=Number(raw.league.id);
if(remaining!==null)assert(remaining>=15,'RATE_LIMIT_RESERVE_BELOW_15');
const payloads=[];
for(const teamId of [home,away]){
 const q=new URLSearchParams({status:'finished',per_page:'10'});
 const result=await provider('/v1/teams/'+teamId+'/fixtures?'+q,'TEAM_'+teamId);
 assert(Array.isArray(result.data)&&result.data.length<=10&&result.data.length>0,
  'INVALID_TEAM_RESULTS_'+teamId);
 const observed=Math.floor(Date.now()/1000);
 assert(result.data.every(x=>
  x.status==='finished'&&x.status_code==='full'&&
  Number(x.kickoff_ts)<observed&&
  [Number(x.teams?.home?.id),Number(x.teams?.away?.id)].includes(teamId)&&
  Number.isSafeInteger(x.goals?.home)&&Number.isSafeInteger(x.goals?.away)
 ),'UNVERIFIED_TEAM_HISTORY_'+teamId);
 payloads.push({teamId,data:result.data,observed,providerSuccess:result.success});
 output.teams.push({teamId,received:result.data.length});
 if(remaining!==null&&remaining<12)throw Error('SHARED_RATE_RESERVE_ABORT_'+remaining);
}
fs.mkdirSync('evidence/btts-private', {recursive:true});
fs.writeFileSync('evidence/btts-private/verified-team-last10-original.json',
 JSON.stringify({fixtureId:Number(f.fixtureId),fixture:raw,teams:payloads,obtainedAt:Date.now()},null,2));
for(const data of payloads){
 const result=await owner('/btts-team-fallback-test',{
  source:'ULTRA_TEAM_LAST10_FALLBACK',fixtureId:Number(f.fixtureId),teamId:data.teamId,
  observed:data.observed,rows:data.data
 });
 assert.equal(result.mode,'BTTS_TEAM_LAST10_PRIVATE_TEST');
 assert.equal(result.oneX2Changed,false);
 assert.equal(result.HCRChanged,false);
 output.teams.find(x=>x.teamId===data.teamId).stored=result.stats;
}
const [afterHistory,afterBtts,afterLedger,afterHcr]=await Promise.all([
 owner('/btts-history-private-test'),owner('/btts-shadow'),
 owner('/test-ledger'),owner('/history-cargo-registry?detail=0')]);
assert.equal(crypto.createHash('sha256').update(JSON.stringify({rows:afterLedger.rows,stats:afterLedger.stats})).digest('hex'),ledgerHash,'ONE_X_TWO_LEDGER_MODIFIED');
assert.equal(afterHcr.inventory.finishedFixtures,priorHcr.inventory.finishedFixtures,'SHARED_HISTORY_CHANGED');
assert.equal(afterHcr.registry.code,'HCR-V1');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),protectedBefore,'PROTECTED_WORKERS_CHANGED');
assert.equal(afterBtts.providerCalls,0);assert.equal(afterBtts.published,0);
output.after={historyFT:afterHistory.archive.privateFT,historyReady:afterBtts.totals.historyReady,
 eligibleToFetchBet365BTTS:afterBtts.totals.quoteRequired,qualified:afterBtts.totals.qualified,
 oneX2Rows:afterLedger.rows.length};
output.rateRemaining=remaining;output.UIUnchanged=true;output.HCRUnchanged=true;output.oneX2Unchanged=true;
console.log('B46_BTTS_TEAM_LAST10_REAL_TEST_RESULT '+JSON.stringify(output));
