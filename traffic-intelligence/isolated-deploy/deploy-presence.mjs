// Exact two-Worker release. Never writes routes, domains, Access, KV or main site.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',KV='4b13b81758934e91a8b6bd03bfbbfcb9';
const ADMIN='b46-visitor-monitor-admin',COLLECTOR='b46-visitor-monitor-collector';
const EXPECTED={[ADMIN]:'afdad706-06bb-4b6b-a7cb-23b755f91147',[COLLECTOR]:'ff93556d-2416-4268-b237-d6aa6ee29b16'};
const REVIEWED_STAGED={[ADMIN]:'50044ef2-786c-4d4d-b12d-7bfe1f281928',[COLLECTOR]:'b21f8f6f-8d36-4e0a-974f-b0ee57e49ed1'};
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
  assert([ADMIN,COLLECTOR].some(name=>[`${root}/workers/scripts/${name}/versions?bindings_inherit=strict`,`${root}/workers/scripts/${name}/deployments`].includes(path)),'Write outside two Monitor Workers denied');
  writes.push({method,path});
 }
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 const data=await response.json();if(!response.ok||data.success===false)throw Error(`Cloudflare HTTP ${response.status}; codes ${(data.errors||[]).map(e=>e.code).join(',')}`);
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
function preserveProtected(before,after){for(const name of ['main','member','member2'])assert.deepEqual(protectedEvidence(after[name]),protectedEvidence(before[name]),name+' changed');assert.equal(after.domainsHash,before.domainsHash);assert.equal(after.access.hash,before.access.hash);for(const name of ['admin','collector']){assert.deepEqual(after[name].subdomain,before[name].subdomain);assert.deepEqual(after[name].schedules,before[name].schedules);assert.deepEqual(withoutBindings(after[name].settings),withoutBindings(before[name].settings),'Unapproved settings changed: '+name);}}
function baseline(s){
 for(const name of ['admin','collector']){const w=s[name];assert.equal(w.version,EXPECTED[w.name],'Active source drift: '+w.name);assert.equal(w.bindings.find(b=>b.name==='COLLECT_ENABLED')?.text,'false');assert.equal(w.bindings.find(b=>b.name==='EVENTS_KV')?.namespace_id,KV);assert(!w.bindings.some(b=>['d1','service','durable_object_namespace'].includes(b.type)));assert(!w.settings.has_assets);}
 assert.deepEqual(sorted(s.admin.bindings).map(b=>b.name),['ACCESS_AUD','ACCESS_TEAM_DOMAIN','ADMIN_EMAIL','CF_ANALYTICS_TOKEN','CF_WEB_ANALYTICS_TOKEN','COLLECT_ENABLED','EVENTS_KV'].sort());
 assert.deepEqual(sorted(s.collector.bindings).map(b=>b.name),['COLLECT_ENABLED','EVENTS_KV'].sort());
 for(const name of ['CF_ANALYTICS_TOKEN','CF_WEB_ANALYTICS_TOKEN'])assert.equal(s.admin.bindings.find(b=>b.name===name)?.type,'secret_text');
}
function desiredBindings(w){
 const bindings=w.bindings.map(b=>b.name==='COLLECT_ENABLED'?{...b,text:'true'}:b);
 if(w.name===COLLECTOR)bindings.push({type:'ratelimit',name:'PRESENCE_VISITOR_LIMIT',namespace_id:'842610214601',simple:{limit:6,period:60}},{type:'ratelimit',name:'PRESENCE_NETWORK_LIMIT',namespace_id:'842610214602',simple:{limit:240,period:60}});
 return sorted(bindings);
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
const before=await snapshot();baseline(before);await writeFile('deployment-evidence/presence-before.json',JSON.stringify(evidence(before),null,2));
for(const name of [ADMIN,COLLECTOR]){const versions=await api(`${root}/workers/scripts/${name}/versions`);assert.equal((versions.items||versions)[0]?.id,REVIEWED_STAGED[name],'Unreviewed inactive source exists: '+name);const detail=await api(`${root}/workers/scripts/${name}/versions/${REVIEWED_STAGED[name]}`);assert.deepEqual(sorted(detail.resources.bindings),desiredBindings(name===ADMIN?before.admin:before.collector));console.log('REVIEWED INACTIVE VERSION',name,REVIEWED_STAGED[name],hash(detail),detail.resources.script?.etag);}
console.log('PRESENCE BASELINE',JSON.stringify(evidence(before)));

const rollback={workers:[ADMIN,COLLECTOR].map(name=>({worker:name,version:EXPECTED[name],method:'POST /deployments with existing version at100%; never upload old source'})),firstStep:'Disable Zaraz (originally OFF with no configured tools) before switching Collector/Admin versions',sourceCommit:'2f57eb3a17272ccb780517c21d00cd16e7677eea',commit:process.env.GITHUB_SHA};
await writeFile('deployment-evidence/presence-rollback.json',JSON.stringify(rollback,null,2));
// Activate the exact immutable versions already uploaded and audited; do not upload older or duplicate source.
const staged={...REVIEWED_STAGED},sourceHashes={};
const expectedSource={
 [ADMIN]:{'worker.mjs':'7660a5937ec16637b5955a9304d134d6a55af185e4f14a0614d4521c73fefa97','analytics.mjs':'28badf13c008dcb11027c7622ca71b96108a63394c50b6c68ce9dc3967fa040f','web-analytics.mjs':'36c7e5a784dfd18f17552ec16733e6e52091c93605bd702243c3c8413796d2cb','request-logs.mjs':'0ed48ab5bb30d5d789f6c87358ff3361ee099333a0a6b7645a1106d11e61938e','presence.mjs':'d02cceab1e893796d6d8ce151f93277705d25e59c9ea94ac08cecc17e552392e'},
 [COLLECTOR]:{'collector.mjs':'eb6eca9c7c81f08028216be59691c0e5eb49dc0076bf28cffdca492076b7e4cb','presence.mjs':'d02cceab1e893796d6d8ce151f93277705d25e59c9ea94ac08cecc17e552392e','tracker-assets.mjs':'38bcd7c3f101b79d6ae7b37cc0821adfa427e4b67075a8658d3aefedcf47fcb0'}
};
const etags={[ADMIN]:'02171f8cc24be8cab194714058f6556ab6ee801e9f19dff778977a727024ba64',[COLLECTOR]:'000f123a52a3a3857f8fd5700cf6681eef5f514214856151ddc3b97c66ed74bd'};
for(const w of [before.admin,before.collector]){
 sourceHashes[w.name]={};for(const [file,expected] of Object.entries(expectedSource[w.name])){sourceHashes[w.name][file]=hash(await readFile(file,'utf8'));assert.equal(sourceHashes[w.name][file],expected,'Source differs from reviewed upload: '+file);}
 const detail=await api(`${root}/workers/scripts/${w.name}/versions/${staged[w.name]}`);assert.equal(detail.resources.script?.etag,etags[w.name],'Immutable staged code differs');assert.deepEqual(sorted(detail.resources.bindings),desiredBindings(w));
 console.log('PRESENCE VERIFIED UPLOAD',w.name,staged[w.name],JSON.stringify(sourceHashes[w.name]));
}
if(mode==='audit'){console.log('PRESENCE RELEASE AUDIT PASSED; exact staged bytes verified; no writes');process.exit(0);}
const ready=await snapshot();baseline(ready);preserveProtected(before,ready);
for(const w of [before.admin,before.collector])assert.deepEqual(sorted(ready[w.name===ADMIN?'admin':'collector'].bindings),sorted(w.bindings));
for(const name of [ADMIN,COLLECTOR]){
 const dep=await api(`${root}/workers/scripts/${name}/deployments`,{method:'POST',body:{strategy:'percentage',versions:[{version_id:staged[name],percentage:100}],annotations:{'workers/message':'Activate consented Visitor Monitor presence V1'}}});
 console.log('PRESENCE DEPLOYED',name,staged[name],'deployment',dep.id);
}
const after=await snapshot();preserveProtected(before,after);
for(const key of ['admin','collector']){assert.equal(after[key].version,staged[after[key].name]);assert.deepEqual(sorted(after[key].bindings),desiredBindings(before[key]));}
const anonymous=await publicChecks();
await writeFile('deployment-evidence/presence-after.json',JSON.stringify({...evidence(after),sourceHashes,anonymous,sourceCommit:'2f57eb3a17272ccb780517c21d00cd16e7677eea',commit:process.env.GITHUB_SHA},null,2));
console.log('PRESENCE RELEASE VERIFIED; only Admin/Collector changed; exact bindings, owner Access, main/member versions, domains and schedules preserved. Zaraz activation and real browser verification remain required.');
