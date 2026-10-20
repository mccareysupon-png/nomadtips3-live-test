// Only the two exact Admin version/deployment endpoints below can be mutated.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ADMIN='b46-visitor-monitor-admin',MAIN='ball46-production',COLLECTOR='b46-visitor-monitor-collector';
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',KV='4b13b81758934e91a8b6bd03bfbbfcb9';
const HOST='b46-visitor-monitor-admin.mccarey-supon.workers.dev';
const EXPECTED='73b75b17-296e-4c30-97b2-54176f97a1b7';
const mode=process.argv[2]||'audit',token=process.env.CLOUDFLARE_API_TOKEN;
assert(['audit','deploy'].includes(mode));assert(token,'Missing deploy credential');assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
const root=`/accounts/${ACCOUNT}`,admin=`${root}/workers/scripts/${ADMIN}`;
const writes=[];
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=x=>createHash('sha256').update(typeof x==='string'?x:stable(x)).digest('hex');
async function api(path,{method='GET',body}={}){
 if(method!=='GET'){
  assert.equal(mode,'deploy');assert.equal(method,'POST');
  assert([`${admin}/versions?bindings_inherit=strict`,`${admin}/deployments`].includes(path),'Write outside isolated Admin denied');
  writes.push({method,path});
 }
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 const j=await r.json();if(!r.ok||j.success===false)throw Error(`Cloudflare HTTP ${r.status}; codes ${(j.errors||[]).map(e=>e.code).join(',')}`);
 return j.result;
}
async function active(name){
 const d=await api(`${root}/workers/scripts/${name}/deployments`);
 const dep=(d.deployments||d)[0];assert(dep?.versions?.length===1&&dep.versions[0].percentage===100,`${name}: unexpected split deployment`);
 return dep.versions[0].version_id;
}
async function protectedWorker(name){
 const version=await active(name);
 const [detail,subdomain,schedules]=await Promise.all([api(`${root}/workers/scripts/${name}/versions/${version}`),api(`${root}/workers/scripts/${name}/subdomain`),api(`${root}/workers/scripts/${name}/schedules`)]);
 return {version,versionHash:hash(detail),subdomainHash:hash(subdomain),schedulesHash:hash(schedules)};
}
async function accessState(settings){
 const apps=await api(`${root}/access/apps?per_page=100`);
 const matches=apps.filter(x=>x.domain===HOST);assert.equal(matches.length,1,'Exactly one dedicated Access app required');
 const app=matches[0],policies=await api(`${root}/access/apps/${app.id}/policies`);
 const owner=settings.bindings.find(b=>b.name==='ADMIN_EMAIL')?.text;
 assert(owner);assert.equal(app.aud,settings.bindings.find(b=>b.name==='ACCESS_AUD')?.text);
 assert.equal(policies.length,1,'Unexpected Access policy count');
 const p=policies[0];assert.equal(p.decision,'allow');assert.equal(p.include.length,1);assert.equal(p.include[0].email?.email?.toLowerCase(),owner.toLowerCase());
 assert(!p.exclude?.length&&!p.require?.length,'Unexpected policy condition requires review');
 return {appId:app.id,hash:hash({app,policies}),ownerOnly:true};
}
function validateBindings(settings){
 assert.equal(settings.bindings.length,6,'Unexpected bindings: review latest deployment first');
 assert.deepEqual(settings.bindings.map(b=>b.name).sort(),['ACCESS_AUD','ACCESS_TEAM_DOMAIN','ADMIN_EMAIL','CF_ANALYTICS_TOKEN','COLLECT_ENABLED','EVENTS_KV'].sort());
 assert.equal(settings.bindings.find(b=>b.name==='COLLECT_ENABLED').text,'false');
 assert.equal(settings.bindings.find(b=>b.name==='EVENTS_KV').namespace_id,KV);
 assert.equal(settings.bindings.find(b=>b.name==='CF_ANALYTICS_TOKEN').type,'secret_text');
 assert(!settings.bindings.some(b=>b.type==='d1'||b.type==='service'));assert(!settings.has_assets);
}
async function snapshot(){
 const [version,settings,subdomain,schedules,main,collector,domains]=await Promise.all([active(ADMIN),api(`${admin}/settings`),api(`${admin}/subdomain`),api(`${admin}/schedules`),protectedWorker(MAIN),protectedWorker(COLLECTOR),api(`${root}/workers/domains`)]);
 validateBindings(settings);
 const access=await accessState(settings);
 return {version,settings,subdomain,schedules,main,collector,domainsHash:hash(domains),access};
}
function evidence(s){return {adminVersion:s.version,bindings:s.settings.bindings.map(b=>({name:b.name,type:b.type,...(b.type==='kv_namespace'?{namespace_id:b.namespace_id}:{}),valueHash:b.type==='plain_text'?hash(b.text):undefined})),settingsHash:hash(s.settings),subdomain:s.subdomain,schedulesHash:hash(s.schedules),main:s.main,collector:s.collector,domainsHash:s.domainsHash,access:s.access};}
function preserved(before,after){
 assert.deepEqual(after.settings.bindings,before.settings.bindings,'Bindings changed');
 assert.deepEqual(after.subdomain,before.subdomain,'Worker subdomain protection changed');
 assert.deepEqual(after.schedules,before.schedules,'Schedules changed');
 assert.deepEqual(after.main,before.main,'Main Worker changed during deployment');
 assert.deepEqual(after.collector,before.collector,'Collector changed during deployment');
 assert.equal(after.domainsHash,before.domainsHash,'Domains changed');
 assert.equal(after.access.hash,before.access.hash,'Access policy changed');
}
await mkdir('deployment-evidence',{recursive:true});
const before=await snapshot();
await writeFile('deployment-evidence/before.json',JSON.stringify(evidence(before),null,2));
console.log('BASELINE',JSON.stringify(evidence(before)));
assert.equal(before.version,EXPECTED,'Active Admin changed: stop; never overwrite newer code');
const versions=await api(`${admin}/versions`);assert.equal((versions.items||versions)[0]?.id,EXPECTED,'Inactive newer Admin version exists: review before continuing');
if(mode==='audit'){console.log('AUDIT PASSED; no writes');process.exit(0);}
// Keep the settings of the pinned latest version. Secrets stay inside Cloudflare.
const metadata={main_module:'worker.mjs',bindings:before.settings.bindings.map(b=>b.type==='secret_text'?{type:'inherit',name:b.name,version_id:'latest'}:b),annotations:{'workers/message':'Visitor Monitor V1: real Cloudflare request analytics; Collector OFF','workers/tag':process.env.GITHUB_SHA?.slice(0,40)||'visitor-monitor-v1'}};
for(const k of ['compatibility_date','compatibility_flags','usage_model','limits','logpush','observability','placement','tail_consumers'])if(before.settings[k]!==undefined)metadata[k]=before.settings[k];
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
const sourceHashes={};
for(const file of ['worker.mjs','analytics.mjs']){const content=await readFile(file,'utf8');sourceHashes[file]=hash(content);form.set(file,new Blob([content],{type:'application/javascript+module'}),file);}
await writeFile('deployment-evidence/rollback.json',JSON.stringify({worker:ADMIN,version:before.version,method:'POST isolated Admin /deployments with this version at 100%; never upload old source',sourceHashes,commit:process.env.GITHUB_SHA},null,2));
const staged=await api(`${admin}/versions?bindings_inherit=strict`,{method:'POST',body:form});assert(staged.id,'No staged version ID');
console.log('STAGED',staged.id,'source',JSON.stringify(sourceHashes));
const stagedDetail=await api(`${admin}/versions/${staged.id}`);
assert.equal(stagedDetail.resources?.bindings?.find(b=>b.name==='CF_ANALYTICS_TOKEN')?.type,'secret_text','Secret inheritance failed');
const preactivate=await snapshot();preserved(before,preactivate);assert.equal(preactivate.version,before.version);
const deployment=await api(`${admin}/deployments`,{method:'POST',body:{strategy:'percentage',versions:[{version_id:staged.id,percentage:100}],annotations:{'workers/message':'Activate tested isolated Visitor Monitor analytics V1'}}});
console.log('DEPLOYED',staged.id,'deployment',deployment.id);
const after=await snapshot();preserved(before,after);assert.equal(after.version,staged.id);
const anonymous=[];
for(const path of ['/','/api/summary']){
 const r=await fetch('https://'+HOST+path,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 const location=r.headers.get('location')||'';assert.equal(r.status,302);assert(location.startsWith('https://rapid-glade-f6b9.cloudflareaccess.com/'));
 anonymous.push({path,status:r.status,redirectHost:new URL(location).hostname});
}
const collector=await fetch('https://b46-visitor-monitor-collector.mccarey-supon.workers.dev/api/collect',{method:'POST',headers:{Origin:'https://ball46.com','content-type':'application/json'},body:'{}'});assert.equal(collector.status,503);
await writeFile('deployment-evidence/after.json',JSON.stringify({...evidence(after),commit:process.env.GITHUB_SHA,sourceHashes,anonymous,collectorStatus:collector.status,writes},null,2));
console.log('VERIFIED: bindings, owner-only Access, schedules, main Worker active version, Collector and domains unchanged; anonymous routes denied.');
