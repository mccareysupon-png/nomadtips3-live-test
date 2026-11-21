import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const name='ball46-prematch-only-test-20261120';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'Missing Cloudflare credentials');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+name+'.mccarey-supon.workers.dev';
const secret=crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,options={}){
 const r=await fetch(root+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(30000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result;
}
async function post(path){const r=await fetch(host+path,{method:'POST',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(18000)});return {status:r.status,body:await r.text()}}
async function get(path){const r=await fetch(host+path,{headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(18000)});assert(r.ok,'GET '+path+' '+r.status);return await r.json()}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
async function versions(){return await Promise.all(protectedNames.map(async n=>({name:n,versions:(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions})))}
const before=await versions(),ledgerBefore=await get('/test-ledger'),archiveBefore=await get('/merge-summary'),dailyBefore=await get('/daily-state');
assert(ledgerBefore.stats.total>=8&&ledgerBefore.mode==='TEST_ONLY');
const workerSrc=fs.readFileSync('qa/prematch-history-20261120/prematch-only-worker.mjs','utf8');
assert(workerSrc.includes('DISABLED_NO_ADDITIONAL_PROVIDER_RUNS'));
assert(workerSrc.includes('PREMATCH_EXTRA_PROVIDER_CYCLE_DISABLED'));
assert(!workerSrc.includes('api.5dollarfootballapi.com'));
assert(workerSrc.includes('settled=await this.ctx.storage.get(\'testLedgerEnabled\')?settlePicks(this.db,now):0'));
const modules=['prematch-only-worker.mjs','history.mjs','prematch-bot.mjs','stored-prematch-feed.mjs','stored-signal-adapter.mjs','evaluate-btts-signal.mjs','evaluate-1x2-signal.mjs','market-1x2.mjs','test-pick-ledger.mjs'];
const settings={main_module:'prematch-only-worker.mjs',compatibility_date:'2026-11-20',bindings:[{name:'STORE',type:'durable_object_namespace',class_name:'PrematchStore'},{name:'OWNER_SECRET',type:'secret_text',text:secret}]};
const payload=new FormData();payload.append('metadata',new Blob([JSON.stringify(settings)],{type:'application/json'}),'metadata.json');
for(const file of modules)payload.append(file,new Blob([fs.readFileSync('qa/prematch-history-20261120/'+file)],{type:'application/javascript+module'}),file);
const out=await cf('/scripts/'+name,{method:'PUT',body:payload});
console.log('NO_EXTRA_RESULTS_UPLOAD '+JSON.stringify({name,version:out.version_id||null,deployment:out.deployment_id||null}));
let active=null;
for(let i=0;i<30;i++){
 const dep=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0];
 const version=dep.versions[0].version_id;
 const v=await cf('/workers/'+name+'/versions/'+version+'?include=modules');
 const source=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
 if(source.includes('DISABLED_NO_ADDITIONAL_PROVIDER_RUNS')&&!source.includes('api.5dollarfootballapi.com')){active=version;break}
 await new Promise(r=>setTimeout(r,1700));
}
assert(active,'NO_EXTRA_PROVIDER_CODE_NOT_ACTIVE');
let result=null;
for(let i=0;i<25;i++){
 const r=await post('/daily-run');
 try{const j=JSON.parse(r.body);if(r.status===409&&j.state==='DISABLED_NO_ADDITIONAL_PROVIDER_RUNS'&&j.providerCalls===0){result=j;break}}catch{}
 await new Promise(r=>setTimeout(r,1700));
}
assert(result,'DIRECT_DAILY_PROVIDER_ROUTE_NOT_DISABLED');
const ledgerAfter=await get('/test-ledger'),archiveAfter=await get('/merge-summary'),dailyAfter=await get('/daily-state');
assert.deepEqual(ledgerAfter,ledgerBefore,'PICKS_CHANGED_DURING_DEPLOY');
assert.deepEqual(archiveAfter,archiveBefore,'HISTORY_CHANGED_DURING_DEPLOY');
assert.deepEqual(dailyAfter,dailyBefore,'OLD_DAILY_STATE_CHANGED_DURING_DEPLOY');
assert.deepEqual(await versions(),before,'PRODUCTION_OR_HUB_CHANGED');
const health=await get('/health');assert.equal(health.liveBindings,0);
console.log('NO_EXTRA_RESULTS_VERIFIED '+JSON.stringify({host,activeVersion:active,providerScheduled:false,dailyRunBlocked:true,picks:ledgerAfter.stats,totalFinished:archiveAfter.stored.finished,productionUnchanged:true,hubUnchanged:true,providerCalls:0,accountMode:'test-only',source:'existing imported finished data'}));
