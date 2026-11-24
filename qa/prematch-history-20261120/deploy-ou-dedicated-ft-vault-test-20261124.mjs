// TEST-only: activate dedicated O/U finished-history import without unclosing BTTS.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const tok=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(tok&&account);
const name='ball46-prematch-only-test-20261120',root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const auth='Bearer '+crypto.createHmac('sha256',tok).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+tok,...(opts.headers||{})},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+' '+JSON.stringify(j.errors??[]));return j.result;
}
async function version(n){return (await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function owner(path,body=null){
 const r=await fetch('https://'+name+'.mccarey-supon.workers.dev'+path,{method:body?'POST':'GET',
  headers:{authorization:auth,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(25000)});
 return {http:r.status,data:await r.json().catch(()=>null)};
}
function replace(s,find,to,label){
 const count=s.split(find).length-1;assert.equal(count,1,'DRIFT_'+label+'_'+count);return s.replace(find,to);
}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'ball46-premium-match-colors-test-20261120'];
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const oldId=await version(name);
const original=await cf('/workers/'+name+'/versions/'+oldId+'?include=modules');
const settings=await cf('/scripts/'+name+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const mods=Object.fromEntries(original.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString('utf8')]));
const newName='ou-target-history-ft-v1-test.mjs';
assert(!mods[newName],'OU_ARCHIVE_ALREADY_INSTALLED');
let main=mods[original.main_module],ou=mods['ou-value-screener-v2-test.mjs'],
 hcr=mods['history-cargo-registry.mjs'];
assert(main.includes('BTTS_PROJECT_CLOSED')&&ou.includes('minCombinedHistory:6,minHistoryPerTeam:3'));
main=replace(main,"import {DurableObject} from 'cloudflare:workers';",
 "import {DurableObject} from 'cloudflare:workers';\nimport {initOuTargetHistoryFT,importOuTargetHistoryFT,ouTargetHistoryCoverage,OU_TARGET_HISTORY_CODE} from './ou-target-history-ft-v1-test.mjs';",
 'MAIN_IMPORT');
main=replace(main,'initBttsHistory(this.db);initBttsBulkV2(this.db);',
 'initBttsHistory(this.db);initOuTargetHistoryFT(this.db);initBttsBulkV2(this.db);',
 'MAIN_INIT');
const route=[
" if(path==='/ou-history-ft-state'&&req.method==='GET'){",
"  const fixtures=await this.ctx.storage.get('botFixtures')??[];",
"  return json({code:OU_TARGET_HISTORY_CODE,archive:ouTargetHistoryCoverage(this.db),upcoming:fixtures.filter(x=>['scheduled','upcoming','waiting'].includes(x.status)&&x.kickoff_ts>now+300).length,minimumFTPerTeam:3,providerCalls:0,bttsProjectClosed:true,productionWrites:0});",
" }",
" if(path==='/ou-history-ft-import-test'&&req.method==='POST'){",
"  const body=await req.json().catch(()=>null);",
"  const fixtures=await this.ctx.storage.get('botFixtures')??[];",
"  const current=fixtures.filter(x=>['scheduled','upcoming','waiting'].includes(x.status)&&x.kickoff_ts>now+300);",
"  const leagueId=Number(body?.leagueId),teamId=Number(body?.teamId),fixtureId=Number(body?.fixtureId);",
"  const byLeague=body?.source==='UPCOMING_LEAGUE_FT'&&current.some(x=>Number(x.league?.id)===leagueId);",
"  const byTeam=body?.source==='UPCOMING_TEAM_FT'&&current.some(x=>Number(x.id)===fixtureId&&[Number(x.teams?.home?.id),Number(x.teams?.away?.id)].includes(teamId));",
"  if((!byLeague&&!byTeam)||!Array.isArray(body?.rows)||body.rows.length>100||!Number.isSafeInteger(body?.observed)||body.observed>now||now-body.observed>1200)",
"   return new Response(JSON.stringify({error:'OU_HISTORY_SCOPE_OR_TIMESTAMP_INVALID'}),{status:400,headers:{'content-type':'application/json'}});",
"  try{",
"   const stats=importOuTargetHistoryFT(this.db,body.rows,body.observed,byLeague?{leagueId}:{teamId});",
"   return json({code:OU_TARGET_HISTORY_CODE,stats,archive:ouTargetHistoryCoverage(this.db),providerCalls:0,bttsProjectUnchanged:true,oneX2LedgerUnchanged:true,OUPredictionLedgerUnchanged:true,productionWrites:0});",
"  }catch(error){return new Response(JSON.stringify({error:String(error.message)}),{status:422,headers:{'content-type':'application/json'}})}",
" }"
].join('\n');
main=replace(main,"  if(path==='/btts-project-shutdown-test'&&req.method==='POST'){",
route+"\n  if(path==='/btts-project-shutdown-test'&&req.method==='POST'){",'OWNER_OU_ROUTE');
assert(main.includes("if(req.method==='POST'&&(/^\\/btts-")&&main.includes("BTTS_PROJECT_CLOSED"));
ou=replace(ou,"import {bttsLastMatches} from './btts-history-private.mjs';",
"import {ouTargetLastMatches,ouTargetLeagueAsOf} from './ou-target-history-ft-v1-test.mjs';",'OU_IMPORT');
ou=replace(ou,"history=get(db,\"SELECT r.hg,r.ag FROM result_version r WHERE r.league_id=? AND r.status='finished' AND r.kickoff<? AND r.observed<=? AND r.observed=(SELECT MAX(v.observed) FROM result_version v WHERE v.fixture_id=r.fixture_id AND v.observed<=?) ORDER BY r.kickoff DESC LIMIT 120\",\n   Number(leagueId),kickoff,asOf,asOf);",
"history=ouTargetLeagueAsOf(db,Number(leagueId),kickoff,asOf,120);",'OU_LEAGUE_PRIOR');
ou=replace(ou,'bttsLastMatches(db,homeId,','ouTargetLastMatches(db,homeId,','OU_HOME');
ou=replace(ou,'bttsLastMatches(db,awayId,','ouTargetLastMatches(db,awayId,','OU_AWAY');
hcr=replace(hcr,"import {bttsLastMatches} from './btts-history-private.mjs';",
"import {ouTargetLastMatches,ouTargetHistoryCoverage} from './ou-target-history-ft-v1-test.mjs';",'HCR_IMPORT');
hcr=replace(hcr,'bttsLastMatches(db,teamId,','ouTargetLastMatches(db,teamId,','HCR_TEAM');
hcr=replace(hcr,"historySource:'DEDUPED_1X2_AND_BTTS_FINISHED_FT_ASOF'",
"historySource:'DEDUPED_OU_ONLY_PLUS_1X2_BTTS_FINISHED_FT_ASOF'",'HCR_SOURCE');
hcr=replace(hcr,'inventory:{finishedFixtures:archived.length,leagues:leagueCount.size,',
'inventory:{finishedFixtures:archived.length,ouDedicatedFT:ouTargetHistoryCoverage(db).ft,leagues:leagueCount.size,','HCR_INVENTORY');
const after={...mods,[original.main_module]:main,
 'ou-value-screener-v2-test.mjs':ou,'history-cargo-registry.mjs':hcr,
 [newName]:fs.readFileSync('qa/prematch-history-20261120/'+newName,'utf8')};
for(const n of ['ou-value-screener-v2-test.mjs','history-cargo-registry.mjs',newName])
 assert.equal(after[n],fs.readFileSync('qa/prematch-history-20261120/'+n,'utf8'),'REPO_RUNTIME_SOURCE_DRIFT_'+n);
for(const [n,txt] of Object.entries(after)){
 if(n.endsWith('.mjs')){const tmp='/tmp/'+n;fs.writeFileSync(tmp,txt);execFileSync(process.execPath,['--check',tmp]);}
}
const [beforeHcr,beforeTruck,beforePicks]=await Promise.all([
 owner('/history-cargo-registry?detail=0'),owner('/btts-bulk-v2-state'),owner('/preview-data')]);
assert(beforeHcr.http===200&&beforeTruck.data.config.mode==='CLOSED');
assert(beforePicks.data.ouLedger.rows.some(x=>Number(x.fixture_id)===204906152&&x.status==='LOSS'));
console.log('B46_OU_FT_VAULT_PREFLIGHT '+JSON.stringify({oldId,modules:Object.keys(mods).length,
 old3:beforeHcr.data.supplyPlanning.readyFixtures,closed:true}));
assert.equal(await version(name),oldId,'CONCURRENT_TEST_UPDATE');
const metadata={main_module:original.main_module,compatibility_date:original.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(original.compatibility_flags?.length?{compatibility_flags:original.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [n,s] of Object.entries(after))form.append(n,new Blob([s],{type:'application/javascript+module'}),n);
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let installed=null;
for(let i=0;i<45;i++){
 const id=await version(name);
 if(id!==oldId){
  const v=await cf('/workers/'+name+'/versions/'+id+'?include=modules');
  const actual=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(actual).length===Object.keys(after).length&&
   Object.entries(after).every(([n,x])=>actual[n]===x)){installed=id;break}
 }
 await new Promise(res=>setTimeout(res,750));
}
assert(installed,'CLOUDFLARE_NEW_VERSION_MISMATCH');
await cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:installed,percentage:100}],
  code_update_strategy:{mode:'immediate'}})});
let hcrNow,state;
for(let i=0;i<25;i++){
 await new Promise(res=>setTimeout(res,i===0?2500:1700));
 [state,hcrNow]=await Promise.all([owner('/ou-history-ft-state'),owner('/history-cargo-registry?detail=0')]);
 if(state.http===200&&state.data?.code==='B46_OU_TARGET_FT_HISTORY_V1_TEST'&&
 hcrNow.data?.supplyPlanning?.historySource==='DEDUPED_OU_ONLY_PLUS_1X2_BTTS_FINISHED_FT_ASOF')break;
}
assert(state.http===200&&state.data?.code==='B46_OU_TARGET_FT_HISTORY_V1_TEST','TEST_OU_FT_VAULT_ROUTE_NOT_ACTIVE');
assert.equal(hcrNow.data.inventory.ouDedicatedFT,0);
const lid=hcrNow.data.supplyPlanning.priorityLeagues?.find(x=>Number(x.leagueId)>0)?.leagueId;
assert(lid,'NO_TARGET_LEAGUE');
const empty=await owner('/ou-history-ft-import-test',{source:'UPCOMING_LEAGUE_FT',
 leagueId:lid,observed:Math.floor(Date.now()/1000),rows:[]});
assert(empty.http===200&&empty.data?.stats?.received===0,'OU_OWNER_IMPORT_CONTRACT_FAILED');
const [truck,picks,protect,afterSettings]=await Promise.all([
 owner('/btts-bulk-v2-state'),owner('/preview-data'),
 Promise.all(protectedNames.map(async n=>[n,await version(n)])).then(Object.fromEntries),
 cf('/scripts/'+name+'/settings')]);
assert(truck.data.config.mode==='CLOSED'&&
 picks.data.ouLedger.rows.some(x=>Number(x.fixture_id)===204906152&&x.status==='LOSS'&&x.units===-1));
assert.deepEqual(protect,protectedBefore);
assert.deepEqual(afterSettings.bindings.map(x=>x.name).sort(),bindings);
console.log('B46_OU_DEDICATED_FT_VAULT_TEST_DEPLOY_PASS '+JSON.stringify({
 from:oldId,to:installed,activeOwnerImport:true,
 minimumFTPerTeam:3,leagueGoalPriorReadsCombinedHistory:true,
 bttsClosed:true,priorPricedOUPickPreserved:true,
 providerCalls:0,productionWrites:0
}));
