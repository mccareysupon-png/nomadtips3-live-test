import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
const name='ball46-eventflow-test-20261118';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const prod='ball46-production';
async function api(path,options={}){
 const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(40000)});
 const j=await r.json();
 assert(r.ok&&j.success,'API '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));
 return j.result;
}
async function active(){
 const r=await api('/scripts/'+prod+'/deployments?per_page=1');
 return r.deployments?.[0]?.versions;
}
const before=await active();
assert(before?.length===1&&Number(before[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
const candidate=fs.readFileSync('qa-output/expanded-match-343.candidate.js','utf8');
const replay=fs.readFileSync('qa-output/eventflow-browser-preview.html','utf8');
const report=JSON.parse(fs.readFileSync('qa-output/expanded-match-343.candidate.js.report.json','utf8'));
assert.equal(sha(candidate),report.candidateHash);
const sub=await api('/subdomain');assert(sub.subdomain,'WORKERS_SUBDOMAIN_MISSING');
const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
const worker=[
 'const candidate='+JSON.stringify(candidate)+';',
 'const replay='+JSON.stringify(replay)+';',
 'const proof='+JSON.stringify({testOnly:true,candidateSha256:report.candidateHash,originalSha256:report.originalHash,scope:'Event Flow same-minute isolated browser replay; no production bindings, no APIs or cron'})+';',
 "const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};",
 "export default {async fetch(req){const p=new URL(req.url).pathname;if(!['GET','HEAD'].includes(req.method))return new Response('TEST ONLY: read only',{status:405,headers});let body,type;if(p==='/'||p==='/qa'){body=replay;type='text/html; charset=utf-8'}else if(p==='/expanded-match-343.js'){body=candidate;type='application/javascript; charset=utf-8'}else if(p==='/health'){body=JSON.stringify(proof);type='application/json'}else{return new Response('Test routes only',{status:404,headers});}return new Response(req.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':type}})}};"
].join('\n');
assert(name!==prod&&name.startsWith('ball46-eventflow-test-'),'DEPLOY_TARGET_GUARD');
fs.mkdirSync('qa-output',{recursive:true});
fs.writeFileSync('qa-output/isolated-worker.mjs',worker);
const existing=await api('/scripts');
assert(Array.isArray(existing),'WORKER_LIST_MISSING');
assert(!existing.some(x=>x.id===name),'TEST_WORKER_ALREADY_EXISTS_REFUSE_OVERWRITE');
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-18',bindings:[],annotations:{'workers/message':'Isolated BALL46 same-minute Event Flow replay; no production resources'}})],{type:'application/json'}),'metadata.json');
form.append('worker.mjs',new Blob([worker],{type:'application/javascript+module'}),'worker.mjs');
await api('/scripts/'+name,{method:'PUT',body:form});
await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let verified=false;
for(let i=0;i<30;i++){
 try{const v=await fetch(url+'/health?run='+process.env.GITHUB_RUN_ID,{signal:AbortSignal.timeout(10000)});if(v.ok){const p=await v.json();if(p.candidateSha256===report.candidateHash){verified=true;break}}}catch{}
 await delay(1000);
}
assert(verified,'TEST_WORKER_NOT_REACHABLE');
const fetched=await fetch(url+'/expanded-match-343.js',{signal:AbortSignal.timeout(15000)});
assert(fetched.ok&&sha(await fetched.text())===report.candidateHash,'WORKER_CANDIDATE_HASH_MISMATCH');
const home=await fetch(url+'/',{signal:AbortSignal.timeout(15000)});assert(home.ok&&await home.text()===replay,'WORKER_REPLAY_MISMATCH');
const blocked=await fetch(url+'/api/engine/signals',{signal:AbortSignal.timeout(15000)});assert.equal(blocked.status,404);
const after=await active();assert.deepEqual(after,before,'PRODUCTION_BASELINE_MOVED_DURING_TEST');
const output={url,worker:name,productionVersionBefore:before[0].version_id,productionVersionAfter:after[0].version_id,productionUnchanged:true,candidateSha256:report.candidateHash,isolatedReplay:true,noBindings:true};
fs.writeFileSync('qa-output/worker-report.json',JSON.stringify(output,null,2));
console.log('TEST_WORKER_READY '+JSON.stringify(output));
