// BALL46 TEST-only UI patch: canonical Pre-Match Predictions includes O/U Adaptive latest signals.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {patchCanonicalPredictionsLatest} from './b46-adaptive-canonical-predictions-test-patch.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'NO_TEST_API_CREDENTIALS');
const n='ball46-premium-match-colors-test-20261120';
const oldVersion='7b1f4537-795a-467a-840f-088209277ebf';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46','ball46-prematch-only-test-20261120'];
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path,options={}){const res=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(60000)});const j=await res.json();assert(res.ok&&j.success,path+' '+res.status+' '+JSON.stringify(j.errors).slice(0,200));return j.result}
async function active(name){return (await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function deploy(id){await cf('/scripts/'+n+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}]})})}
const [id,protectedBefore,installed,settings,schedules]=await Promise.all([
 active(n),Promise.all(protectedNames.map(active)),
 cf('/workers/'+n+'/versions/'+oldVersion+'?include=modules'),
 cf('/scripts/'+n+'/settings'),cf('/scripts/'+n+'/schedules')
]);
assert.equal(id,oldVersion,'TEST_FRONTEND_VERSION_DRIFT_RECHECK_REQUIRED');
assert.equal(installed.main_module,'worker.js');
assert.equal(installed.modules.length,1,'UNEXPECTED_MODULE_SET');
const previous=Buffer.from(installed.modules[0].content_base64,'base64');
const changed=Buffer.from(patchCanonicalPredictionsLatest(previous.toString('utf8')));
assert(changed.length>previous.length&&changed.toString().includes('B46_ADAPTIVE_CANONICAL_PREDICTIONS_V1'));
const d=await mkdtemp(join(tmpdir(),'ball46-canonical-pred-'));
const file=join(d,'worker.js');await writeFile(file,changed);
execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
assert.equal(await active(n),id);
const metadata={main_module:'worker.js',compatibility_date:installed.compatibility_date,
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
form.append('worker.js',new Blob([changed],{type:'application/javascript+module'}),'worker.js');
if(process.argv.includes('--dry-run')){
 console.log('B46_CANONICAL_PREDICTIONS_TEST_PREFLIGHT_PASS '+JSON.stringify({before:id,mainModule:'worker.js',protectedBefore,schedules:schedules.schedules.map(x=>x.cron),moduleSizeBefore:previous.length,moduleSizeAfter:changed.length}));
 process.exit(0);
}
let newVersion=null,deployed=false;
try{
 const uploaded=await cf('/scripts/'+n+'/versions?bindings_inherit=strict',{method:'POST',body:form});
 newVersion=uploaded.id;assert(newVersion);
 const check=await cf('/workers/'+n+'/versions/'+newVersion+'?include=modules');
 assert.equal(check.modules.length,1);
 assert(Buffer.from(check.modules[0].content_base64,'base64').equals(changed),'UPLOADED_UI_BYTES_DIFFER');
 assert.equal(await active(n),id);
 await deploy(newVersion);deployed=true;
 assert.equal(await active(n),newVersion);
 const live=await fetch('https://'+n+'.mccarey-supon.workers.dev/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(30000)});
 const data=await live.json();
 assert(live.ok&&data.formulas?.length===42);
 const afterSchedules=await cf('/scripts/'+n+'/schedules');
 assert.deepEqual(afterSchedules.schedules.map(x=>x.cron),schedules.schedules.map(x=>x.cron),'FRONT_CRON_CHANGED');
 assert.deepEqual(await Promise.all(protectedNames.map(active)),protectedBefore,'OTHER_WORKER_CHANGED');
 console.log('B46_CANONICAL_PREDICTIONS_TEST_DEPLOY_PASS '+JSON.stringify({previous:id,version:newVersion,adaptiveFormulas:data.formulas.length,researchRecords:data.records?.length,protectedWorkersPreserved:true,paidApiCalls:0,productionWrites:0}));
}catch(err){
 console.log('B46_CANONICAL_PREDICTIONS_TEST_FAILED '+String(err?.stack||err));
 if(deployed&&await active(n)===newVersion)await deploy(id);
 throw err;
}
