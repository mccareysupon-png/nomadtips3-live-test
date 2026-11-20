import assert from 'node:assert/strict';
import fs from 'node:fs';
const name='ball46-prematch-history-test-20261120',root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const token=process.env.CLOUDFLARE_API_TOKEN;assert(token&&process.env.CLOUDFLARE_ACCOUNT_ID);
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(40000)});const j=await r.json();assert(r.ok&&j.success,'CF '+path+' '+r.status+' '+JSON.stringify(j.errors?.map(x=>({code:x.code,message:x.message}))));return j.result}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
async function versions(){const result={};for(const n of protectedNames)result[n]=(await api('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;return result}
const before=await versions();console.log('PROTECTED_BEFORE',JSON.stringify(before));
// Inspect active HUB metadata and source markers, never print source or secret values.
const hub='nomadtips3-5usd-hub-343',hv=before[hub][0].version_id;const h=await api('/workers/'+hub+'/versions/'+hv+'?include=modules');
const markers=['rate','Retry-After','429','/v1/fixtures','finished','scheduled','pagination','has_more','start_time','end_time','per_page'];
const sources=(h.modules||[]).filter(x=>typeof x.content_base64==='string').map(x=>Buffer.from(x.content_base64,'base64').toString('utf8')).join('\n');
const inventory={version:hv,modules:(h.modules||[]).length,sourceReadable:sources.length>0,markers:Object.fromEntries(markers.map(k=>[k,sources.toLowerCase().includes(k.toLowerCase())])),bindings:(h.resources?.bindings||h.bindings||[]).map(b=>({name:b.name,type:b.type}))};
console.log('HUB_INVENTORY',JSON.stringify(inventory));
assert(name==='ball46-prematch-history-test-20261120'&&!protectedNames.includes(name));
const existing=(await api('/scripts')).some(w=>w.id===name);assert(!existing,'ISOLATED_TEST_NAME_EXISTS');
const dir='qa/prematch-history-20261120/';const form=new FormData();
form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-19',bindings:[{name:'HISTORY',type:'durable_object_namespace',class_name:'History'}],migrations:{new_tag:'v1',new_sqlite_classes:['History']}})],{type:'application/json'}),'metadata.json');
for(const f of ['worker.mjs','history.mjs','sample.mjs'])form.append(f,new Blob([fs.readFileSync(dir+f,'utf8')],{type:'application/javascript+module'}),f);
await api('/scripts/'+name,{method:'PUT',body:form});await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
const sub=await api('/subdomain'),url='https://'+name+'.'+sub.subdomain+'.workers.dev';
let first;for(let i=0;i<12;i++){try{const r=await fetch(url+'/health',{signal:AbortSignal.timeout(10000)});if(r.ok){first=await r.json();break}}catch{}await new Promise(r=>setTimeout(r,1000))}
assert(first?.complete&&first.fixtures===12&&first.finished===12&&first.team1===10&&first.team2===10&&first.upstreamCalls===0,JSON.stringify(first));
const second=await(await fetch(url+'/health',{signal:AbortSignal.timeout(15000)})).json();assert.deepEqual(second,first);
assert.deepEqual(await versions(),before,'PROTECTED_VERSION_CHANGED_DURING_TEST');
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/history-phase2.json',JSON.stringify({url,inventory,first,second,protectedUnchanged:true},null,2));console.log('PHASE2_SYNTHETIC_READY',JSON.stringify({url,first,protectedUnchanged:true}));
