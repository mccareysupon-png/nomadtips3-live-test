import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const name='ball46-prematch-history-real-test-20261120',hub='nomadtips3-5usd-hub-343',root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(path,o={}){const r=await fetch(root+path,{...o,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...o.headers},signal:AbortSignal.timeout(40000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+path);return j.result}
const protectedNames=['ball46-production','nomadtips3-engine-343',hub];
async function versions(names){const o={};for(const n of names)o[n]=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;return o}
const before=await versions([...protectedNames,name]);console.log('AUDIT_BEFORE',JSON.stringify(before));
const v=await cf('/workers/'+hub+'/versions/'+before[hub][0].version_id+'?include=modules');
const src=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
assert(src.includes('await this.snapshot()')&&src.includes('https://hub.internal/snapshot'));
const old=await cf('/workers/'+name+'/versions/'+before[name][0].version_id+'?include=modules');assert(old.main_module==='real-worker.mjs');
const oldsrc=Buffer.from(old.modules.find(m=>m.name===old.main_module).content_base64,'base64').toString();
assert(oldsrc.includes("idFromName('real-isolated-v1')")&&oldsrc.includes("JOHN_LOCAL_PLAN_V3"));
const sub=await cf('/subdomain'),url='https://'+name+'.'+sub.subdomain+'.workers.dev';
const beforeHealth=await(await fetch(url+'/health',{signal:AbortSignal.timeout(15000)})).json();assert(beforeHealth.syncPolicy==='JOHN_LOCAL_PLAN_V3');
const secret=crypto.randomBytes(32).toString('hex'),dir='qa/prematch-history-20261120/',form=new FormData();
form.append('metadata',new Blob([JSON.stringify({main_module:'real-worker.mjs',compatibility_date:'2026-11-19',bindings:[{name:'HISTORY',type:'durable_object_namespace',class_name:'RealHistory'},{name:'SOURCE_HUB',type:'service',service:hub,environment:'production'},{name:'BOOTSTRAP_SECRET',type:'secret_text',text:secret}]})],{type:'application/json'}),'metadata.json');
for(const f of ['real-worker.mjs','history.mjs','backfill.mjs','john-sync.mjs','audit-history.mjs','last5-archive.mjs','step7-runtime.mjs','step7-seed.mjs'])form.append(f,new Blob([fs.readFileSync(dir+f,'utf8')],{type:'application/javascript+module'}),f);
assert(name==='ball46-prematch-history-real-test-20261120');await cf('/scripts/'+name,{method:'PUT',body:form});await cf('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
const active=(await versions([name]))[name][0].version_id;const deployed=await cf('/workers/'+name+'/versions/'+active+'?include=modules');const deployedSource=Buffer.from(deployed.modules.find(m=>m.name===deployed.main_module).content_base64,'base64').toString();assert(deployedSource.includes('/audit-version')&&deployedSource.includes('/audit-real'));console.log('AUDIT_DEPLOYED',active);
let ready=false;for(let i=0;i<30;i++){try{const r=await fetch(url+'/audit-version',{signal:AbortSignal.timeout(10000)});if(r.ok&&(await r.json()).auditVersion==='REAL_SQL_MATCH_V1'){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,2000))}assert(ready,'AUDIT_ROUTE_NOT_PROPAGATED');
let result;for(let i=0;i<20;i++){const r=await fetch(url+'/audit-real',{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(60000)});if(r.status===404){console.log('AUDIT_AUTH_404',i);await new Promise(r=>setTimeout(r,2000));continue}const j=await r.json();if(!r.ok)throw Error('AUDIT '+JSON.stringify(j));result=j;break}
assert(result?.auditVersion==='REAL_SQL_MATCH_V1');assert(result.hub.cacheOnly&&Number(result.hub.externalRequestsAdded)===0);
assert.equal((await fetch(url+'/audit-real',{method:'POST'})).status,404);
const afterHealth=await(await fetch(url+'/health')).json();
const after=await versions(protectedNames),unchanged=Object.keys(after).every(n=>JSON.stringify(after[n])===JSON.stringify(before[n]));
const evidence={...result,protectedUnchanged:unchanged,healthUnchanged:JSON.stringify(beforeHealth)===JSON.stringify(afterHealth),providerRequestsAdded:0};
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/audit-real.json',JSON.stringify(evidence,null,2));console.log('REAL_SQL_AUDIT',JSON.stringify(evidence));
assert.equal(result.duplicates,0);assert.equal(result.lookup.mismatches,0);assert.equal(result.compare.duplicateSource,0);
