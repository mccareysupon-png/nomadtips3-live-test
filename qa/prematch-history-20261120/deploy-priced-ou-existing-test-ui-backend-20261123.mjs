// BALL46: deploy real O/U V2 selections to EXISTING PreMatch TEST UI data keys.
// Patch one existing backend main module; no new Worker module/page/API provider.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {projectPricedOuV2Ui} from './patch-priced-ou-into-existing-prematch-ui-test-20261123.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CF_CREDS_REQUIRED');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const worker='ball46-prematch-only-test-20261120',main='prematch-only-worker.mjs';
const expected='86c8260c-af9e-4c4b-a8f4-776d403e2535';
const front='ball46-premium-match-colors-test-20261120';
const protectedNames=[
 'ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46',front,
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'
];
async function cf(p,opts={}){
 const r=await fetch(root+p,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},
  signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+p+'_'+r.status+'_'+JSON.stringify(j.errors??[]));
 return j.result;
}
async function version(name){
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'NO_VERSION_'+name);return id;
}
const protectedBefore=Object.fromEntries(await Promise.all(
 protectedNames.map(async name=>[name,await version(name)])));
assert.equal(await version(worker),expected,'CURRENT_TEST_VERSION_CHANGED_ABORT');
const deployed=await cf('/workers/'+worker+'/versions/'+expected+'?include=modules');
assert.equal(deployed.main_module,main);
assert.equal(deployed.modules.length,31);
const source=deployed.modules.find(m=>m.name===main);
assert(source?.content_base64);
const old=Buffer.from(source.content_base64,'base64').toString('utf8');
const once=(s,a,b,label)=>{
 const n=s.split(a).length-1;assert.equal(n,1,'B46_OU_UI_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
assert(old.includes('PREMATCH_OU_REPLACES_V2_OLD_CRON')&&
 old.includes("path==='/preview-data'&&req.method==='GET'")&&
 old.includes('const ouLedgerNow=readOuLedger(this.db,now),ouSnapshotNow=readOuSnapshot(this.db,now);')&&
 old.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 !old.includes('__b46ProjectPricedOuForUi'),'BACKEND_SOURCE_DRIFT');
let next=old;
next=once(next,
 "import {screenOuValueV2,recordOuValueShadow,readOuValueShadow,OU_VALUE_V2_POLICY,OU_VALUE_V2_MODEL} from './ou-value-screener-v2-test.mjs';",
 "import {screenOuValueV2,recordOuValueShadow,readOuValueShadow,evaluateAsianOu,OU_VALUE_V2_POLICY,OU_VALUE_V2_MODEL} from './ou-value-screener-v2-test.mjs';",
 'REUSE_CALC');
next=once(next,
 'export class PrematchStore extends DurableObject{',
 'const __b46ProjectPricedOuForUi='+projectPricedOuV2Ui.toString()+';\nexport class PrematchStore extends DurableObject{',
 'PURE_UI_VIEW_NO_NEW_MODULE');
const identity="\n   const issuedId=Number(result.priceBridge?.selected?.fixtureId);\n   if(result.locked?.added>0&&Number.isSafeInteger(issuedId)&&issuedId>0){\n    const match=snapshot.fixtures?.find(x=>Number(x.fixtureId??x.id)===issuedId);\n    if(match?.home?.name&&match?.away?.name){\n     const names=await this.ctx.storage.get('b46PmOuV2MatchNames')??{};\n     names[String(issuedId)]={home:String(match.home.name).slice(0,140),\n      away:String(match.away.name).slice(0,140),\n      leagueName:String(match.league?.name??'').slice(0,140),\n      leagueId:Number(match.league?.id)||0};\n     await this.ctx.storage.put('b46PmOuV2MatchNames',names);\n    }\n   }\n";
const view="\n const pricedV2Rows=readOuValueShadow(this.db,200);\n const pricedV2Names=await this.ctx.storage.get('b46PmOuV2MatchNames')??{};\n const missing=new Set(pricedV2Rows.filter(r=>!pricedV2Names[String(r.fixture_id)])\n  .map(r=>String(r.fixture_id)));\n if(missing.size){\n  for(const item of [...knownFixtures,...ledgerNow.rows,...ouLedgerNow.rows]){\n   const id=String(item.fixture_id??item.fixtureId??item.id??'');\n   if(!missing.has(id))continue;\n   const home=typeof item.home==='string'?item.home:item.teams?.home?.name??item.home?.name;\n   const away=typeof item.away==='string'?item.away:item.teams?.away?.name??item.away?.name;\n   if(!home||!away)continue;\n   pricedV2Names[id]={home:String(home).slice(0,140),away:String(away).slice(0,140),\n    leagueName:String(item.leagueName??item.league?.name??'').slice(0,140),\n    leagueId:Number(item.league_id??item.league?.id)||0};\n   missing.delete(id);\n  }\n  const last=Number(await this.ctx.storage.get('b46PmOuV2NameBackfillAt')??0);\n  if(missing.size&&this.env.HUB&&now-last>3600){\n   try{\n    const r=await this.env.HUB.fetch('https://hub.internal/snapshot',{\n     method:'GET',signal:AbortSignal.timeout(12000)});\n    if(r.ok){\n     const snapshot=await r.json();\n     if(snapshot?.ok===true&&snapshot?.cacheOnly===true&&Array.isArray(snapshot.fixtures))\n      for(const item of snapshot.fixtures){\n       const id=String(item.fixtureId??item.id??'');\n       if(!missing.has(id)||!item.home?.name||!item.away?.name)continue;\n       pricedV2Names[id]={home:String(item.home.name).slice(0,140),\n        away:String(item.away.name).slice(0,140),\n        leagueName:String(item.league?.name??'').slice(0,140),\n        leagueId:Number(item.league?.id)||0};\n       missing.delete(id);\n      }\n    }\n   }catch{}\n   await this.ctx.storage.put('b46PmOuV2NameBackfillAt',now);\n  }\n  await this.ctx.storage.put('b46PmOuV2MatchNames',pricedV2Names);\n }\n const pricedV2Ui=__b46ProjectPricedOuForUi({\n  shadowRows:pricedV2Rows,identities:pricedV2Names,now,\n  window:londonAccountingWindow(now),\n  dayForTime:t=>londonAccountingWindow(t).businessDay,\n  evaluate:evaluateAsianOu\n });\n";
next=once(next,
 "   await this.ctx.storage.put('b46PreMatchOuEngineLast',answer);",
 identity+"   await this.ctx.storage.put('b46PreMatchOuEngineLast',answer);",
 'CAPTURE_NAMED_MATCH_WHEN_ISSUED');
next=once(next,
 " const displayMonitor=enrichLeagueNamesOnMonitor(testMonitor,ledgerNow.rows,knownFixtures,knownLeagueNames,catalog,archivedLeagueIdsForPicks(this.db));",
 view+" const displayMonitor=enrichLeagueNamesOnMonitor(testMonitor,ledgerNow.rows,knownFixtures,knownLeagueNames,catalog,archivedLeagueIdsForPicks(this.db));",
 'READ_PRICED_V2_FROM_EXISTING_LEDGER');
next=once(next,
 'ouLedger:ouLedgerNow,ouDailyBook:ouSnapshotNow.dailyBook,ouDailySeries:ouSnapshotNow.dailySeries',
 'ouLedger:pricedV2Ui.ouLedger,ouDailyBook:pricedV2Ui.ouDailyBook,ouDailySeries:pricedV2Ui.ouDailySeries',
 'PASS_TO_EXISTING_UI_KEYS');
assert(next.includes('pricedV2Names')&&next.includes('readOuLedger(this.db,now)')&&
 next.includes('PREMATCH_OU_REPLACES_V2_OLD_CRON')&&
 next.includes('BTTS_HISTORY_API_DISABLED_PROJECT_CLOSED')&&
 next.includes('OU_2P5_CAPTURE_AT_ISSUE_TEST')&&
 next.includes('ouLedger:pricedV2Ui.ouLedger'),'PRESERVATION_INVARIANT');
fs.writeFileSync('/tmp/b46-ou-existing-ui-backend-20261123.mjs',next);
execFileSync(process.execPath,['--check','/tmp/b46-ou-existing-ui-backend-20261123.mjs']);
const frontURL='https://'+front+'.mccarey-supon.workers.dev';
const oldData=await(await fetch(frontURL+'/__b46_prematch_data',
 {cache:'no-store',signal:AbortSignal.timeout(25000)})).json();
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const original1x2=sha(JSON.stringify(oldData.testLedger));
const originalBtts=sha(JSON.stringify(oldData.bttsLedger));
const oldModelOnlyCount=oldData.ouLedger.rows.length;
const settings=await cf('/scripts/'+worker+'/settings');
const bindings=settings.bindings.map(x=>x.name).sort();
assert.deepEqual(bindings,['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const untouched=Object.fromEntries(deployed.modules.map(m=>[
 m.name,sha(Buffer.from(m.content_base64,'base64'))]));
assert.equal(await version(worker),expected,'CONCURRENT_VERSION_ABORT');
console.log('B46_PRICED_OU_EXISTING_UI_PREFLIGHT '+JSON.stringify({
 worker,version:expected,oldModelOnlyCount,
 original1x2Count:oldData.testLedger.rows.length,
 onlyMainModuleChanged:true,newWorkerModules:0,
 originalFrontVersion:protectedBefore[front],noProviderCalls:0}));
const meta={main_module:main,compatibility_date:deployed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(b=>({name:b.name,type:'inherit'})),
 ...(deployed.compatibility_flags?.length?{compatibility_flags:deployed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
for(const m of deployed.modules){
 const buf=m.name===main?next:Buffer.from(m.content_base64,'base64');
 form.append(m.name,new Blob([buf],{type:'application/javascript+module'}),m.name);
}
await cf('/scripts/'+worker+'?bindings_inherit=strict',{method:'PUT',body:form});
let active=null,newModules=null;
for(let n=0;n<38;n++){
 const id=await version(worker);
 if(id!==expected){
  const d=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
  if(d.modules.length===31&&
   Buffer.from(d.modules.find(m=>m.name===main)?.content_base64??'','base64').toString('utf8')===next){
    active=id;newModules=d.modules;break;
  }
 }
 await new Promise(r=>setTimeout(r,1000));
}
assert(active&&newModules,'NEW_BACKEND_VERSION_NOT_CONFIRMED');
for(const m of deployed.modules){
 if(m.name===main)continue;
 const x=newModules.find(k=>k.name===m.name);
 assert(x,'LOST_MODULE_'+m.name);
 assert.equal(sha(Buffer.from(x.content_base64,'base64')),untouched[m.name],
  'UNAUTHORIZED_MODULE_CHANGED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+worker+'/settings')).bindings.map(x=>x.name).sort(),bindings);
const fresh=await(await fetch(frontURL+'/__b46_prematch_data',
 {cache:'no-store',signal:AbortSignal.timeout(25000)})).json();
assert.equal(sha(JSON.stringify(fresh.testLedger)),original1x2,'1X2_LEDGER_CHANGED');
assert.equal(sha(JSON.stringify(fresh.bttsLedger)),originalBtts,'BTTS_LEDGER_CHANGED');
assert.equal(fresh.ouLedger?.mode,'TEST_ONLY');
assert.equal(fresh.ouLedger?.pricedOnly,true);
assert(!fresh.ouLedger.rows.some(x=>!Number.isFinite(x.price)||x.price<=1.5),
 'UNPRICED_OU_IN_ISSUED_PREMATCH');
const actual=fresh.ouLedger.rows.find(x=>Number(x.fixture_id)===204906152);
assert(actual,'KNOWN_REAL_V2_LOCKED_PICK_MISSING');
assert.equal(actual.pick,'UNDER_2.5');
assert.equal(actual.price,2.8);
assert.equal(actual.bookmaker,'ladbrokes');
assert.equal(actual.market,'O/U');
assert.equal(actual.status,'PENDING');
assert.equal(actual.home,'Neftchi Fargona');
assert.equal(actual.away,'Al Hilal Riyadh');
const protectedAfter=Object.fromEntries(await Promise.all(
 protectedNames.map(async n=>[n,await version(n)])));
assert.deepEqual(protectedAfter,protectedBefore,'OTHER_WORKER_VERSION_CHANGED');
console.log('B46_PRICED_OU_EXISTING_UI_BACKEND_DEPLOY_PASS '+JSON.stringify({
 worker,previous:expected,active,
 route:'/__b46_prematch_data',
 originalFrontVersion:protectedBefore[front],
 existingUI:['?b46pm=predictions','?b46pm=ou'],
 pricedRows:fresh.ouLedger.rows.length,
 verifiedPick:{id:actual.fixture_id,home:actual.home,away:actual.away,
  pick:actual.pick,price:actual.price,bookmaker:actual.bookmaker,
  ev:actual.ev,status:actual.status},
 excludedLegacyModelOnly:oldModelOnlyCount,
 existingModulesUnchanged:30,modifiedExistingModule:main,newModules:0,
 original1x2AndBttsByteDataPreserved:true,
 productionAndLiveUnchanged:true,providerCalls:0}));
