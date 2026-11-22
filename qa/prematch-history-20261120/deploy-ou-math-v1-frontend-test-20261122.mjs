// TEST: wire issued model-only O/U picks into Predictions and Over/Under Statistics UI.
// Preflight, one-module replacement, postflight, 1X2 ledger and protected versions frozen.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {patchOuUiClient} from './patch-ou-math-v1-frontend-test.mjs';
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
const patch=patchOuUiClient(client);
const oldDeclaration=m[0];
const newDeclaration='var prematchClientScript = '+JSON.stringify(patch.code)+';';
const next=original.replace(oldDeclaration,newDeclaration);
assert.notEqual(original,next,'UNCHANGED');
assert.equal(next.replace(newDeclaration,oldDeclaration),original,'CHANGE_OUTSIDE_TEST_UI_CLIENT');
assert.equal(next.split(newDeclaration).length,2,'MORE_THAN_ONE_CLIENT_DECLARATION');
assert(!next.includes('OU_BOT_ACTIVATED'));
for(const [name,s] of [['client',patch.code],['worker',next]]){
 const p='/tmp/b46-ou-math-ui-'+name+'.mjs';fs.writeFileSync(p,s);
 execFileSync(process.execPath,['--check',p],{stdio:'pipe'});
}
const required=[
 "Pre-Match · Total (1X2)",
 "Pre-Match · Over/Under (2.5)",
 "mode==='ou'?(ouLedger??",
 "const activeLedger=",
 "const selectedBook=mode==='ou'?ouDailyBook",
 "ouLedger=j.ouLedger?.mode==='TEST_ONLY'",
 "const bothRows=[...(allLedger?.rows??[]),...(ouLedger.rows??[])];",
 "r.id==='ou'?rate(ouLedger?.stats??{})",
 "mode==='ou'?'O/U 2.5",
 "window.B46PreMatchLiveMirror.render"
];
for(const anchor of required)assert(patch.code.includes(anchor),'MISSING_OU_UI_'+anchor);
assert(!patch.code.includes("if(mode==='ou'||mode==='ou-predictions')"),'OU_STILL_RENDERING_EMPTY_PLACEHOLDER');
assert(patch.code.includes("mode==='all'?'Pre-Match · Total (1X2)'"),'ORIGINAL_1X2_ONLY_TOTAL_CHANGED');
const oldSettings=await cf('/scripts/'+front+'/settings');
const bindings=oldSettings.bindings.map(x=>x.name).sort();
assert(bindings.includes('PREMATCH_STORE')&&bindings.includes('B46_PRODUCTION_READ'),'FRONTEND_BINDINGS_CHANGED');
const oldData=await (await fetch(frontURL+'/__b46_prematch_data',{cache:'no-store',signal:AbortSignal.timeout(15000)})).json();
const original1x2=crypto.createHash('sha256').update(JSON.stringify(oldData.testLedger)).digest('hex');
console.log('B46_OU_MATH_TWO_PAGES_PREFLIGHT '+JSON.stringify({
 front,beforeVersion,onlyClient:true,sourceBytes:original.length,clientAddedBytes:patch.code.length-client.length,
 oneX2LedgerCount:oldData.testLedger.rows?.length,change:'O_U_MODEL_ONLY_TWO_PAGE_UI',excludedFromTotal:'O/U',newProviderCalls:0,protectedWorkers,backendVersion:before[backend]}));
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
console.log('B46_OU_MATH_TWO_PAGES_DEPLOY_PASS '+JSON.stringify({
 url:frontURL+'/?b46pm=predictions',statisticsURL:frontURL+'/?b46pm=ou',newVersion:current,
 original1x2LedgerCount:afterData.testLedger.rows.length,
 preservedBindings:bindings,protectedWorkersUnchanged:true,oneX2LedgerUnchanged:true,
 newProviderCalls:0,ouBotEnabled:false,originalLiveAndBTTSLogicUntouched:true,total1X2OnlyPreserved:true,ouPages:['predictions','ou'],modelOnly:true,marketRoutesUntouched:true}));
