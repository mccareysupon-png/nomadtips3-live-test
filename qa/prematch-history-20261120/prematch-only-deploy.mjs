import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const name='ball46-prematch-only-test-20261120',root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const token=process.env.CLOUDFLARE_API_TOKEN;assert(token&&process.env.FIVEDOLLAR_API_KEY);
const secret=crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(p,options={}){const r=await fetch(root+p,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+p);return j.result}
const existing=(await cf('/scripts')).some(x=>x.id===name);
const f=new FormData();f.append('metadata',new Blob([JSON.stringify({main_module:'prematch-only-worker.mjs',compatibility_date:'2026-11-20',bindings:[{name:'STORE',type:'durable_object_namespace',class_name:'PrematchStore'},{name:'OWNER_SECRET',type:'secret_text',text:secret},{name:'FIVEDOLLAR_API_KEY',type:'secret_text',text:process.env.FIVEDOLLAR_API_KEY}],...(!existing?{migrations:{new_tag:'v1',new_sqlite_classes:['PrematchStore']}}:{})})],{type:'application/json'}),'metadata.json');
for(const file of ['prematch-only-worker.mjs','history.mjs','prematch-bot.mjs','stored-signal-adapter.mjs','evaluate-btts-signal.mjs','evaluate-1x2-signal.mjs'])f.append(file,new Blob([fs.readFileSync('qa/prematch-history-20261120/'+file)],{type:'application/javascript+module'}),file);
await cf('/scripts/'+name,{method:'PUT',body:f});await cf('/scripts/'+name+'/subdomain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
const host='https://'+name+'.'+(await cf('/subdomain')).subdomain+'.workers.dev';
async function req(path,rows){const r=await fetch(host+path,{method:rows?'POST':'GET',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},...(rows?{body:JSON.stringify({rows})}:{}),signal:AbortSignal.timeout(15000)});assert(r.ok,'HTTP '+r.status);return r.json()}
let h;for(let i=0;i<12;i++){try{h=await req('/health');if(h.system==='BALL46_PREMATCH_ONLY')break}catch{}await new Promise(r=>setTimeout(r,1000))}assert(h?.system==='BALL46_PREMATCH_ONLY');
const before=await req('/daily-state');
let report;for(let i=0;i<15;i++){try{report=await req('/dry-run');if(report.mode==='READ_ONLY_SHADOW')break}catch{}await new Promise(r=>setTimeout(r,1500))}
assert.equal(report?.mode,'READ_ONLY_SHADOW');assert.equal(report.providerCalls,0);assert.equal(report.published,0);
assert.deepEqual(await req('/daily-state'),before);
console.log('STORED_ADAPTER_DRY_RUN '+JSON.stringify(report));
