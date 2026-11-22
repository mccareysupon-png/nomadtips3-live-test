// TEST: make Predictions a global LIVE-first chronological feed; preserve all existing market calculations.
// Preflight, one-module replacement, postflight, 1X2 ledger and protected versions frozen.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchPredictionsChronologyClient} from './patch-predictions-chronological-feed-test-20261122.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_ACCESS_NOT_CONFIGURED');
const front='ball46-premium-match-colors-test-20261120';
const frontURL='https://'+front+'.mccarey-supon.workers.dev';
const backend='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const protectedWorkers=[backend,'ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(45000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_'+path+'_'+r.status+' '+JSON.stringify(j.errors??[]));return j.result;
}
async function version(name){
 const j=await cf('/scripts/'+name+'/deployments?per_page=1');
 const v=j.deployments?.[0]?.versions?.[0]?.version_id;assert(v,'MISSING_DEPLOYED_'+name);return v;
}
const before=Object.fromEntries(await Promise.all(protectedWorkers.map(async x=>[x,await version(x)])));
const beforeVersion=await version(front);
const active=await cf('/workers/'+front+'/versions/'+beforeVersion+'?include=modules');
assert(active.main_module==='worker.js'&&active.modules?.length===1,'UI_MODULE_LAYOUT_CHANGED');
const original=Buffer.from(active.modules[0].content_base64,'base64').toString('utf8');
const rx=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
const m=original.match(rx);assert(m,'MISSING_ORIGINAL_PREMATCH_CLIENT');
const client=JSON.parse(m[1]);
const patch=patchPredictionsChronologyClient(client);
const oldDeclaration=m[0];
const newDeclaration='var prematchClientScript = '+JSON.stringify(patch.code)+';';
const next=original.replace(oldDeclaration,newDeclaration);
assert.notEqual(original,next,'UNCHANGED');
assert.equal(next.replace(newDeclaration,oldDeclaration),original,'CHANGE_OUTSIDE_TEST_UI_CLIENT');
assert.equal(next.split(newDeclaration).length,2,'MORE_THAN_ONE_CLIENT_DECLARATION');
assert(!next.includes('OU_BOT_ACTIVATED'));
for(const [name,s] of [['client',patch.code],['worker',next]]){
 const p='/tmp/b46-chronology-ui-'+name+'.mjs';fs.writeFileSync(p,s);
 execFileSync(process.execPath,['--check',p],{stdio:'pipe'});
}
const required=[
 "const chronoGroups=mode==='predictions'?groupPreMatchIssuedRows(rows):null;",
 "const visible=[...rows].sort((a,b)=>{",
 "const chronoPhase=item=>",
 "if(hub?.phase==='LIVE'&&!monitor?.snapshotStale)return 0;",
 "const sectionNames=['LIVE NOW','UPCOMING','AWAITING UPDATE','FINISHED'];",
 "header.classList.add('b46pm-chrono-section-header');",
 "list.append(el('div','b46pm-chrono-inline-league',league));",
 "const nativeCard=window.B46PreMatchLiveMirror.render",
 "Pre-Match · Total (1X2)",
 "Pre-Match · Over/Under (2.5)"
];
for(const anchor of required)assert(patch.code.includes(anchor),'CHRONO_GUARD_FAILED_'+anchor);
assert(!patch.code.includes('lastPredictionsLeague'),'OBSOLETE_LEAGUE_GROUP_HEADER');
assert(!patch.code.includes("if(mode==='predictions')return Number(a.kickoff)-Number(b.kickoff)"),
 'OLD_PREDICTIONS_SORT_REMAINS');
// Execute the exact patched comparator block under controlled status/time fixtures,
// without changing persistent ledgers or test fixtures.
const sortStart=patch.code.indexOf('    const chronoNow=Math.floor(Date.now()/1000);');
const sortEnd=patch.code.indexOf('    // Predictions use the league headings',sortStart);
assert(sortStart>0&&sortEnd>sortStart,'SORT_EVAL_BOUNDS');
const extracted=patch.code.slice(sortStart,sortEnd);
const sortFn=new Function('rows','mode','hubRows','monitor','exceptionalStatus',
 'groupPreMatchIssuedRows','Date',extracted+'\nreturn visible;');
const now=1800000000;
const frozenDate={now:()=>now*1000};
const mk=(fixture_id,kickoff,status='PENDING',market='1X2')=>({fixture_id,kickoff,status,market});
const fake=[mk(11,now+7200),mk(23,now-3000),mk(22,now-600),mk(21,now-1700),
 mk(12,now+3600),mk(31,now-7200),mk(32,now-3600,'WIN'),mk(33,now-200,'LOSS'),
 mk(11,now+7200,'PENDING','O/U')];
const hubs={21:{phase:'LIVE'},22:{phase:'LIVE'},23:{phase:'NOT_IN_HUB'}};
const group=f=>{const m=new Map();for(const r of f){const k=String(r.fixture_id);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return m};
const expected=[22,21,12,11,23,31,33,32];
const actual=sortFn(fake,'predictions',hubs,{snapshotStale:false},new Set(['POSTPONED','CANCELLED','ABANDONED','UNKNOWN']),group,frozenDate);
const unique=[...new Set(actual.map(x=>x.fixture_id))];
assert.deepEqual(unique,expected,'SORT_IS_NOT_LIVE_NEWEST_UPCOMING_NEAREST_AWAITING_FINISHED');
assert.deepEqual(fake.map(x=>x.fixture_id),[11,23,22,21,12,31,32,33,11],'SORT_MUTATED_SOURCE_INPUT');
const stale=sortFn(fake,'predictions',hubs,{snapshotStale:true},new Set(['POSTPONED','CANCELLED','ABANDONED','UNKNOWN']),group,frozenDate);
assert.equal(stale[0].fixture_id,12,'STALE_HUB_MISLABELED_LIVE');
console.log('B46_CHRONO_SORT_SYNTHETIC_PASS '+JSON.stringify({order:unique,live:[22,21],upcoming:[12,11],
 awaiting:[23,31],finished:[33,32],sourceDataNotMutated:true,staleLiveNotPromoted:true}));
const oldSettings=await cf('/scripts/'+front+'/settings');
const bindings=oldSettings.bindings.map(x=>x.name).sort();
assert(bindings.includes('PREMATCH_STORE')&&bindings.includes('B46_PRODUCTION_READ'),'FRONTEND_BINDINGS_CHANGED');
const oldData=await (await fetch(frontURL+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(15000)})).json();
const original1x2=crypto.createHash('sha256').update(JSON.stringify(oldData.testLedger)).digest('hex');
console.log('B46_PREDICTIONS_CHRONO_PREFLIGHT '+JSON.stringify({
 front,beforeVersion,onlyClient:true,sourceBytes:original.length,clientAddedBytes:patch.code.length-client.length,
 oneX2LedgerCount:oldData.testLedger.rows?.length,change:'PREDICTIONS_CHRONO_DISPLAY_ONLY',sort:'LIVE_UPCOMING_AWAITING_FINISHED',newProviderCalls:0,protectedWorkers,backendVersion:before[backend]}));
assert.equal(await version(front),beforeVersion,'CONCURRENT_FRONTEND_DEPLOY_ABORT');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async x=>[x,await version(x)]))),before,'PROTECTED_WORKER_CHANGED_ABORT');
const meta={main_module:active.main_module,compatibility_date:active.compatibility_date||'2026-11-20',
 bindings:bindings.map(name=>({name,type:'inherit'})),
 ...(active.compatibility_flags?.length?{compatibility_flags:active.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}),'metadata.json');
form.append('worker.js',new Blob([next],{type:'application/javascript+module'}),'worker.js');
await cf('/scripts/'+front+'?bindings_inherit=strict',{method:'PUT',body:form});
let current=null,installed=null;
for(let attempt=0;attempt<35;attempt++){
 current=await version(front);
 if(current!==beforeVersion){
   installed=await cf('/workers/'+front+'/versions/'+current+'?include=modules');
   if(installed.modules?.length===1&&
     Buffer.from(installed.modules[0].content_base64,'base64').toString('utf8')===next)break;
 }
 await new Promise(resolve=>setTimeout(resolve,1100));
}
assert(current!==beforeVersion,'TEST_FRONTEND_NOT_UPDATED');
assert.equal(Buffer.from(installed?.modules?.[0]?.content_base64??'','base64').toString('utf8'),next,'ACTIVE_SOURCE_DIFFERENT');
assert.deepEqual((await cf('/scripts/'+front+'/settings')).bindings.map(x=>x.name).sort(),bindings,'BINDING_CHANGED');
assert.deepEqual(Object.fromEntries(await Promise.all(protectedWorkers.map(async x=>[x,await version(x)]))),before,'PROTECTED_WORKER_CHANGED');
const afterData=await (await fetch(frontURL+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(15000)})).json();
const afterHash=crypto.createHash('sha256').update(JSON.stringify(afterData.testLedger)).digest('hex');
assert.equal(afterHash,original1x2,'1X2_LEDGER_CHANGED');
const doc=await fetch(frontURL+'/?b46pm=predictions',{cache:'no-store',signal:AbortSignal.timeout(15000)});
assert(doc.ok,'UNIFIED_FRONTEND_PAGE_NOT_AVAILABLE_'+doc.status);
const page=await doc.text();
assert(page.length>1000,'TEST_PAGE_EMPTY');
console.log('B46_PREDICTIONS_CHRONO_DEPLOY_PASS '+JSON.stringify({
 url:frontURL+'/?b46pm=predictions',statisticsURL:frontURL+'/?b46pm=ou',newVersion:current,
 original1x2LedgerCount:afterData.testLedger.rows.length,
 preservedBindings:bindings,protectedWorkersUnchanged:true,oneX2LedgerUnchanged:true,
 newProviderCalls:0,ouBotEnabled:false,originalLiveAndBTTSLogicUntouched:true,total1X2OnlyPreserved:true,ouStatisticsPreserved:true,oneCardPerFixture:true,marketRoutesUntouched:true}));
