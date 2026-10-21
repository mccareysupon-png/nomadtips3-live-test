// Collector-only consent UI update. Never writes Admin, main, Member, routes, Access, KV or Zaraz.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',KV='4b13b81758934e91a8b6bd03bfbbfcb9';
const ADMIN='b46-visitor-monitor-admin',COLLECTOR='b46-visitor-monitor-collector';
const EXPECTED={[ADMIN]:'50044ef2-786c-4d4d-b12d-7bfe1f281928',[COLLECTOR]:'b21f8f6f-8d36-4e0a-974f-b0ee57e49ed1'};
const HOST=ADMIN+'.mccarey-supon.workers.dev',TEAM='https://rapid-glade-f6b9.cloudflareaccess.com';
const mode=process.argv[2]||'audit',token=process.env.CLOUDFLARE_API_TOKEN;
assert(['audit','deploy'].includes(mode));assert(token);assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
if(mode==='deploy')assert.equal(process.env.PRESENCE_OWNER_APPROVED,'20261021-main-public-opt-in','Reviewed owner scope required');
const root=`/accounts/${ACCOUNT}`,writes=[];
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=x=>createHash('sha256').update(typeof x==='string'?x:stable(x)).digest('hex');
const sorted=bindings=>[...bindings].sort((a,b)=>a.name.localeCompare(b.name));
const withoutBindings=settings=>Object.fromEntries(Object.entries(settings).filter(([key])=>key!=='bindings').map(([key,value])=>[key,key==='annotations'?Object.fromEntries(Object.entries(value).filter(([name])=>!['workers/message','workers/tag'].includes(name))):value]));
async function api(path,{method='GET',body}={}){
 if(method!=='GET'){
  assert.equal(mode,'deploy');assert.equal(method,'POST');
  assert([COLLECTOR].some(name=>[`${root}/workers/scripts/${name}/versions?bindings_inherit=strict`,`${root}/workers/scripts/${name}/deployments`].includes(path)),'Write outside Collector version/deployment endpoints denied');
  writes.push({method,path});
 }
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 const data=await response.json();if(!response.ok||data.success===false){
  const safe=(data.errors||[]).map(e=>({code:e.code,message:String(e.message||'').replaceAll(token,'[REDACTED]').slice(0,1600),details:(e.error_chain||[]).map(c=>({code:c.code,message:String(c.message||'').replaceAll(token,'[REDACTED]').slice(0,1000)}))}));
  throw Error(`Cloudflare HTTP ${response.status}; ${JSON.stringify(safe)}`);
 }
 return data.result;
}
async function worker(name){
 const base=`${root}/workers/scripts/${name}`,deployments=await api(base+'/deployments');
 const deployment=(deployments.deployments||deployments)[0];assert.equal(deployment?.versions?.length,1);assert.equal(deployment.versions[0].percentage,100);
 const version=deployment.versions[0].version_id;
 const [detail,settings,subdomain,schedules]=await Promise.all([api(base+'/versions/'+version),api(base+'/settings'),api(base+'/subdomain'),api(base+'/schedules')]);
 assert(Array.isArray(detail.resources?.bindings),'Active version bindings required');
 return {name,version,versionHash:hash(detail),bindings:detail.resources.bindings,settings,subdomain,schedules};
}
async function ownerAccess(admin){
 const apps=await api(root+'/access/apps?per_page=100'),matches=apps.filter(app=>app.domain===HOST);assert.equal(matches.length,1);
 const app=matches[0],policies=await api(`${root}/access/apps/${app.id}/policies`);
 assert.equal(app.aud,admin.bindings.find(b=>b.name==='ACCESS_AUD')?.text);
 const owner=admin.bindings.find(b=>b.name==='ADMIN_EMAIL')?.text;assert(owner);
 assert.equal(policies.length,1);const p=policies[0];assert.equal(p.decision,'allow');assert.equal(p.include.length,1);assert.equal(p.include[0].email?.email?.toLowerCase(),owner.toLowerCase());assert(!p.exclude?.length&&!p.require?.length);
 return {hash:hash({app,policies}),ownerOnly:true,appId:app.id};
}
async function snapshot(){
 const [admin,collector,main,member,member2,domains]=await Promise.all([worker(ADMIN),worker(COLLECTOR),worker('ball46-production'),worker('ball46-member-production'),worker('ball46-member2-production'),api(root+'/workers/domains')]);
 return {admin,collector,main,member,member2,domainsHash:hash(domains),access:await ownerAccess(admin)};
}
function protectedEvidence(w){return {version:w.version,versionHash:w.versionHash,settingsHash:hash(w.settings),subdomainHash:hash(w.subdomain),schedulesHash:hash(w.schedules)};}
function evidence(s){return {admin:monitorEvidence(s.admin),collector:monitorEvidence(s.collector),main:protectedEvidence(s.main),member:protectedEvidence(s.member),member2:protectedEvidence(s.member2),access:s.access,domainsHash:s.domainsHash,writes};}
function monitorEvidence(w){return {name:w.name,version:w.version,settingsHash:hash(w.settings),bindings:sorted(w.bindings).map(b=>({name:b.name,type:b.type,namespace_id:b.namespace_id,simple:b.simple,valueHash:b.type==='plain_text'?hash(b.text):undefined})),subdomain:w.subdomain,schedulesHash:hash(w.schedules)};}
function preserveProtected(before,after){for(const name of ['admin','main','member','member2'])assert.deepEqual(protectedEvidence(after[name]),protectedEvidence(before[name]),name+' changed');assert.equal(after.domainsHash,before.domainsHash);assert.equal(after.access.hash,before.access.hash);for(const name of ['admin','collector']){assert.deepEqual(after[name].subdomain,before[name].subdomain);assert.deepEqual(after[name].schedules,before[name].schedules);assert.deepEqual(withoutBindings(after[name].settings),withoutBindings(before[name].settings),'Unapproved settings changed: '+name);}}
function baseline(s){
 for(const name of ['admin','collector']){const w=s[name];assert.equal(w.version,EXPECTED[w.name],'Active source drift: '+w.name);assert.equal(w.bindings.find(b=>b.name==='COLLECT_ENABLED')?.text,'true');assert.equal(w.bindings.find(b=>b.name==='EVENTS_KV')?.namespace_id,KV);assert(!w.bindings.some(b=>['d1','service','durable_object_namespace'].includes(b.type)));assert(!w.settings.has_assets);}
 assert.deepEqual(sorted(s.admin.bindings).map(b=>b.name),['ACCESS_AUD','ACCESS_TEAM_DOMAIN','ADMIN_EMAIL','CF_ANALYTICS_TOKEN','CF_WEB_ANALYTICS_TOKEN','COLLECT_ENABLED','EVENTS_KV'].sort());
 assert.deepEqual(sorted(s.collector.bindings).map(b=>b.name),['COLLECT_ENABLED','EVENTS_KV','PRESENCE_NETWORK_LIMIT','PRESENCE_VISITOR_LIMIT'].sort());
 for(const name of ['CF_ANALYTICS_TOKEN','CF_WEB_ANALYTICS_TOKEN'])assert.equal(s.admin.bindings.find(b=>b.name===name)?.type,'secret_text');
}
async function publicChecks(){
 const anonymous=[];for(const path of ['/','/api/summary','/api/presence']){const r=await fetch('https://'+HOST+path,{redirect:'manual'});assert.equal(r.status,302);assert((r.headers.get('location')||'').startsWith(TEAM+'/'));anonymous.push({path,status:r.status});}
 const base='https://'+COLLECTOR+'.mccarey-supon.workers.dev';
 for(const path of ['/api/summary','/api/presence'])assert.equal((await fetch(base+path)).status,404);
 assert.equal((await fetch(base+'/api/collect',{method:'POST',headers:{Origin:'https://member.ball46.com','content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/collect',{method:'POST',headers:{Origin:'https://ball46.com','content-type':'application/json'},body:'{}'})).status,400);
 const script=await fetch(base+'/tracker.js');assert.equal(script.status,200);assert.equal(hash(await script.text()),hash(await readFile('tracker.js','utf8')));
 const privacy=await fetch(base+'/privacy');assert.equal(privacy.status,200);assert.equal(hash(await privacy.text()),hash(await readFile('presence-privacy.html','utf8')));
 return anonymous;
}
await mkdir('deployment-evidence',{recursive:true});
const before=await snapshot();baseline(before);
assert.equal(before.main.version,'b16a5b96-5ed0-45db-9117-d4a93d11cc2d','Protected main changed since review');
assert.equal(before.access.hash,'8bd4498f31fb0f866ec887c5358d9afcedba52313db1800472b3b96266f59ceb');
assert.equal(before.collector.settings.bindings.length,4);
assert.deepEqual(sorted(before.collector.settings.bindings),sorted(before.collector.bindings),'Latest and active bindings must match');
const base=root+'/workers/scripts/'+COLLECTOR;
const versions=await api(base+'/versions');assert.equal((versions.items||versions)[0]?.id,EXPECTED[COLLECTOR],'Newer inactive source exists');
const old=await api(base+'/versions/'+EXPECTED[COLLECTOR]);assert.equal(old.resources.script.etag,'000f123a52a3a3857f8fd5700cf6681eef5f514214856151ddc3b97c66ed74bd');
const sourceHashes={};for(const file of ['collector.mjs','presence.mjs','tracker-assets.mjs'])sourceHashes[file]=hash(await readFile(file,'utf8'));
assert.equal(sourceHashes['collector.mjs'],'eb6eca9c7c81f08028216be59691c0e5eb49dc0076bf28cffdca492076b7e4cb');
assert.equal(sourceHashes['presence.mjs'],'d02cceab1e893796d6d8ce151f93277705d25e59c9ea94ac08cecc17e552392e');
await writeFile('deployment-evidence/consent-ui-before.json',JSON.stringify(evidence(before),null,2));
await writeFile('deployment-evidence/consent-ui-rollback.json',JSON.stringify({worker:COLLECTOR,version:before.collector.version,method:'POST existing Collector version to /deployments at100%; never upload older source',commit:process.env.GITHUB_SHA},null,2));
console.log('CONSENT UI BASELINE',JSON.stringify(evidence(before)));console.log('REVIEWED SOURCE',JSON.stringify(sourceHashes));
if(mode==='audit'){console.log('COLLECTOR-ONLY AUDIT PASSED; no Cloudflare writes');process.exit(0);}
const settings=before.collector.settings;
const metadata={main_module:'collector.mjs',bindings:before.collector.bindings,annotations:{'workers/message':'English consent; dismiss both choices; footer privacy settings','workers/tag':process.env.GITHUB_SHA.slice(0,40)}};
for(const key of ['compatibility_date','compatibility_flags','usage_model','limits','logpush','observability','placement','tail_consumers'])if(settings[key]!==undefined)metadata[key]=settings[key];
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const file of Object.keys(sourceHashes))form.set(file,new Blob([await readFile(file,'utf8')],{type:'application/javascript+module'}),file);
const staged=await api(base+'/versions?bindings_inherit=strict',{method:'POST',body:form});assert(staged.id);
const detail=await api(base+'/versions/'+staged.id);assert.deepEqual(sorted(detail.resources.bindings),sorted(before.collector.bindings));
console.log('COLLECTOR STAGED',staged.id,detail.resources.script.etag);
const ready=await snapshot();baseline(ready);preserveProtected(before,ready);assert.deepEqual(sorted(ready.collector.bindings),sorted(before.collector.bindings));
const deployment=await api(base+'/deployments',{method:'POST',body:{strategy:'percentage',versions:[{version_id:staged.id,percentage:100}],annotations:{'workers/message':'English consent with immediate dismissal and footer settings'}}});
console.log('COLLECTOR DEPLOYED',staged.id,'deployment',deployment.id);
const after=await snapshot();preserveProtected(before,after);assert.equal(after.collector.version,staged.id);assert.deepEqual(sorted(after.collector.bindings),sorted(before.collector.bindings));
const anonymous=await publicChecks();
const board=await fetch('https://ball46.com/api/engine/board');assert.equal(board.status,200);assert.equal((await board.json()).ok,true);
const result={...evidence(after),collectorEtag:detail.resources.script.etag,commit:process.env.GITHUB_SHA,sourceHashes,anonymous,mainHealthy:true,collectorDeployment:deployment.id};
await writeFile('deployment-evidence/consent-ui-after.json',JSON.stringify(result,null,2));
console.log('CONSENT UI RELEASE VERIFIED',JSON.stringify(result));
