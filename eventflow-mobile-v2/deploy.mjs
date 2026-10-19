
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',script='ball46-production';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonical=o=>JSON.stringify(o,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...options.headers}});const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result;}
async function active(){const d=await api('/scripts/'+script+'/deployments?per_page=1');assert.equal(d.deployments[0].versions.length,1);assert.equal(d.deployments[0].versions[0].percentage,100);return d.deployments[0].versions[0].version_id;}
async function activate(id,message){return api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}})});}
if(process.argv.includes('--rollback')){
  const report=JSON.parse(fs.readFileSync('audit/deployment.json','utf8'));
  const id=await active();if(id===report.candidateVersion){await activate(report.baseVersion,'Rollback Event Flow Mobile V2 after post-deploy QA failure');assert.equal(await active(),report.baseVersion);report.rollback='confirmed';fs.writeFileSync('audit/deployment.json',JSON.stringify(report,null,2));console.log('ROLLBACK_CONFIRMED');}
  else {assert.equal(id,report.baseVersion,'FOREIGN_VERSION_ACTIVE: DO NOT OVERWRITE');console.log('BASE_ALREADY_ACTIVE');}
  process.exit(0);
}
const qa=JSON.parse(fs.readFileSync('audit/report.json','utf8'));assert.equal(qa.result,'PASS');
assert.equal(qa.versionId,'82a493c8-2ed5-486d-91c4-3bc0e841ddce');
assert.equal(qa.candidateSha,'e7a3c04d2589a5101a83b8648bc3f65afc831a40ed21238ae6af6c85f8213fa3');
const base=await active();assert.equal(base,qa.versionId,'PRODUCTION_MOVED_STOP');
const v=await api('/workers/'+script+'/versions/'+base+'?include=modules');
const main=v.modules.find(m=>m.name===v.main_module),candidate=fs.readFileSync('audit/production-candidate.js','utf8');
assert.equal(hash(Buffer.from(main.content_base64,'base64')),qa.sourceSha);assert.equal(hash(candidate),qa.candidateSha);
const settings=await api('/scripts/'+script+'/settings'),settingsHash=hash(canonical(settings)),schedules=await api('/scripts/'+script+'/schedules');
fs.writeFileSync('audit/before-settings.json',JSON.stringify(settings,null,2));
const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'B46_EVENTFLOW_MOBILE_V2_20261020','workers/message':'Event Flow Mobile V2 only; preserve Desktop, Engine, bindings and current assets'}};
for(const key of ['logpush','limits','observability','placement'])if(settings[key]!=null)metadata[key]=settings[key];
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?candidate:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
const uploaded=await api('/scripts/'+script+'/versions',{method:'POST',body:form}),id=uploaded.id;
assert(id&&id!==base,'CANDIDATE_VERSION_MISSING');
const u=await api('/workers/'+script+'/versions/'+id+'?include=modules');
assert.equal(u.modules.length,v.modules.length);
for(const m of v.modules){const n=u.modules.find(n=>n.name===m.name);assert(n,'MODULE_MISSING:'+m.name);assert.equal(hash(Buffer.from(n.content_base64,'base64')),m.name===v.main_module?qa.candidateSha:hash(Buffer.from(m.content_base64,'base64')),'MODULE_CHANGED:'+m.name);}
for(const key of ['bindings','compatibility_date','compatibility_flags','assets'])assert.equal(canonical(u[key]),canonical(v[key]),'CONFIG_CHANGED:'+key);
assert.equal(await active(),base,'PRODUCTION_MOVED_DURING_UPLOAD');
assert.equal(hash(canonical(await api('/scripts/'+script+'/settings'))),settingsHash,'SETTINGS_CHANGED_DURING_UPLOAD');
assert.equal(canonical(await api('/scripts/'+script+'/schedules')),canonical(schedules),'SCHEDULE_CHANGED_DURING_UPLOAD');
const report={baseVersion:base,candidateVersion:id,sourceSha:qa.sourceSha,candidateSha:qa.candidateSha,onlyEventFlowLiteral:true,assetsRetained:true,unchangedNonMainModules:v.modules.length-1,settingsPreserved:true,activated:false};
fs.writeFileSync('audit/deployment.json',JSON.stringify(report,null,2));
try{
 await activate(id,'Install Event Flow Mobile V2 after responsive real-signal and Desktop pixel QA');
 assert.equal(await active(),id,'ACTIVATION_NOT_CONFIRMED');
 report.activated=true;fs.writeFileSync('audit/deployment.json',JSON.stringify(report,null,2));
 assert.equal(hash(canonical(await api('/scripts/'+script+'/settings'))),settingsHash,'SETTINGS_CHANGED_AFTER_DEPLOY');
 assert.equal(canonical(await api('/scripts/'+script+'/schedules')),canonical(schedules),'SCHEDULE_CHANGED_AFTER_DEPLOY');
 for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/statistics']){const r=await fetch('https://ball46.com'+path),j=await r.json();assert(r.ok&&j.ok===true,'API_HEALTH_FAILED:'+path);}
 console.log(JSON.stringify(report,null,2));
}catch(e){if(await active()===id){await activate(base,'Rollback Event Flow Mobile V2 activation validation failure');report.rollback='confirmed';fs.writeFileSync('audit/deployment.json',JSON.stringify(report,null,2));}throw e;}
