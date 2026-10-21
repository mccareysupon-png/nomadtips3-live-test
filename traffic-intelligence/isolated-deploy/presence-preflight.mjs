// Read-only presence preparation audit. No mutations or secret values.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ADMIN='b46-visitor-monitor-admin',MAIN='ball46-production',COLLECTOR='b46-visitor-monitor-collector';
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',KV='4b13b81758934e91a8b6bd03bfbbfcb9';
const HOST='b46-visitor-monitor-admin.mccarey-supon.workers.dev';
const EXPECTED='afdad706-06bb-4b6b-a7cb-23b755f91147';
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'Missing read-only audit credential');assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
const root=`/accounts/${ACCOUNT}`,admin=`${root}/workers/scripts/${ADMIN}`;
const writes=[];
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=x=>createHash('sha256').update(typeof x==='string'?x:stable(x)).digest('hex');
async function api(path,{method='GET',body}={}){
 assert.equal(method,'GET','Read-only presence preflight: all writes forbidden');
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
 assert.equal(settings.bindings.length,7,'Unexpected bindings: review latest deployment first');
 assert.deepEqual(settings.bindings.map(b=>b.name).sort(),['ACCESS_AUD','ACCESS_TEAM_DOMAIN','ADMIN_EMAIL','CF_ANALYTICS_TOKEN','CF_WEB_ANALYTICS_TOKEN','COLLECT_ENABLED','EVENTS_KV'].sort());
 assert.equal(settings.bindings.find(b=>b.name==='COLLECT_ENABLED').text,'false');
 assert.equal(settings.bindings.find(b=>b.name==='EVENTS_KV').namespace_id,KV);
 for(const name of ['CF_ANALYTICS_TOKEN','CF_WEB_ANALYTICS_TOKEN'])assert.equal(settings.bindings.find(b=>b.name===name).type,'secret_text');
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
const versions=await api(`${admin}/versions`);assert.equal((versions.items||versions)[0]?.id,'50044ef2-786c-4d4d-b12d-7bfe1f281928','Unreviewed inactive Admin version exists: stop');
const collectorSettings=await api(`${root}/workers/scripts/${COLLECTOR}/settings`);
assert.equal(before.collector.version,'ff93556d-2416-4268-b237-d6aa6ee29b16','Collector drift: review before any release');
await writeFile('deployment-evidence/presence-readonly.json',JSON.stringify({admin:evidence(before),collector:{bindings:collectorSettings.bindings.map(b=>({name:b.name,type:b.type,namespace_id:b.namespace_id,valueHash:b.type==='plain_text'?hash(b.text):undefined})),settingsHash:hash(collectorSettings)},writes},null,2));
console.log('COLLECTOR_BINDING_NAMES',JSON.stringify(collectorSettings.bindings.map(b=>({name:b.name,type:b.type,namespace_id:b.namespace_id}))));
console.log('PRESENCE PREFLIGHT PASSED; no writes; Collector remains OFF; no Zaraz or main Worker changes');
