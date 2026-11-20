import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const name='ball46-prematch-history-real-test-20261120',hub='nomadtips3-5usd-hub-343',root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',token=process.env.CLOUDFLARE_API_TOKEN;
assert(token&&process.env.CLOUDFLARE_ACCOUNT_ID);
async function api(p,o={}){const r=await fetch(root+p,{...o,headers:{Authorization:'Bearer '+token,...o.headers},signal:AbortSignal.timeout(40000)}),j=await r.json();assert(r.ok&&j.success,'CF '+p+' '+r.status+' '+JSON.stringify(j.errors?.map(x=>({code:x.code,message:x.message}))));return j.result}
const protectedNames=['ball46-production','nomadtips3-engine-343',hub];
async function versions(){const out={};for(const n of protectedNames)out[n]=(await api('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;return out}
const before=await versions();console.log('PROTECTED_BEFORE',JSON.stringify(before));
const v=await api('/workers/'+hub+'/versions/'+before[hub][0].version_id+'?include=modules');const src=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
assert(src.includes('await this.snapshot()')&&src.includes('https://hub.internal/snapshot'),'CACHE_ROUTE_UNVERIFIED');
const existing=(await api('/scripts')).some(w=>w.id===name);assert(name==='ball46-prematch-history-real-test-20261120'&&!protectedNames.includes(name));console.log('TEST_EXISTS',existing);
const secret=crypto.randomBytes(32).toString('hex');const form=new FormData(),dir='qa/prematch-history-20261120/';
const bindings=[{name:'HISTORY',type:'durable_object_namespace',class_name:'RealHistory'},{name:'SOURCE_HUB',type:'service',service:hub,environment:'production'},{name:'BOOTSTRAP_SECRET',type:'secret_text',text:secret}];
form.append('metadata',new Blob([JSON.stringify({main_module:'real-worker.mjs',compatibility_date:'2026-11-19',bindings,...(!existing?{migrations:{new_tag:'v1',new_sqlite_classes:['RealHistory']}}:{})})],{type:'application/json'}),'metadata.json');
for(const f of ['real-worker.mjs','history.mjs'])form.append(f,new Blob([fs.readFileSync(dir+f,'utf8')],{type:'application/javascript+module'}),f);
await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
const sub=await api('/subdomain'),url='https://'+name+'.'+sub.subdomain+'.workers.dev';
let first;for(let i=0;i<12;i++){try{const r=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});if(r.ok){first=await r.json();break}}catch{}await new Promise(r=>setTimeout(r,1000))}
assert(first?.state==='uninitialized'||first?.state==='ok','PREBOOTSTRAP_STATE '+JSON.stringify(first));
let report;for(let i=0;i<6;i++){const response=await fetch(url+'/bootstrap',{method:'POST',headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(90000)});const raw=await response.text();let j;try{j=JSON.parse(raw)}catch{console.log('BOOTSTRAP_NON_JSON',JSON.stringify({status:response.status,title:raw.match(/<title[^>]*>([^<]*)/i)?.[1]??null,errorCode:raw.match(/(?:error code|Error)[: ]+(\d{3,4})/i)?.[1]??null,length:raw.length}));await new Promise(r=>setTimeout(r,1500));continue}console.log('REAL_IMPORT',JSON.stringify(j));if(!response.ok)throw Error('REAL_IMPORT_FAILED '+JSON.stringify(j));report=j;break}
assert(report?.state==='ok'&&report.stored.finished>0&&report.externalRequestsAdded===0,'REAL_IMPORT_FAILED');
const health=await(await fetch(url+'/health')).json();assert.deepEqual(health,report);
const again=await(await fetch(url+'/bootstrap',{method:'POST',headers:{Authorization:'Bearer '+secret}})).json();assert.deepEqual(again,report,'SAME_CYCLE_REPLAY');
assert.equal((await fetch(url+'/bootstrap',{method:'POST'})).status,404);
assert.deepEqual(await versions(),before,'PROTECTED_CHANGED_DURING_CHECK');fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/real-history.json',JSON.stringify({url,report,protectedUnchanged:true},null,2));console.log('REAL_HISTORY_READY',JSON.stringify({url,report,protectedUnchanged:true}));
