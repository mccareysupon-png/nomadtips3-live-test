import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {BASE,SCRIPT,MARK,ORIGINAL_KITS,CANDIDATE_KITS,patchMain,sha} from './patch.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.equal(account,'62cb0db544160e6591342abd6b4f35cc','WRONG_ACCOUNT');assert(token,'AUTH_MISSING');
const request=JSON.parse(await readFile('request.json','utf8'));
assert(['candidate','activate','restore'].includes(request.phase),'INVALID_PHASE');
assert.equal(request.base,BASE,'REQUEST_BASE_MISMATCH');
const root=`https://api.cloudflare.com/client/v4/accounts/${account}`;
const publicOrigin='https://ball46.com',zone='d491ee30b7a87a6c37e6a4dacf00ae8d';
await mkdir('audit',{recursive:true});await mkdir('audit-last',{recursive:true});
const report={phase:request.phase,base:BASE,script:SCRIPT,mark:MARK,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,startedAt:new Date().toISOString(),assetStrategy:'inherit ASSETS from exact Active UUID; no manifest rebuild or asset upload',offlineFullAssetInventory:false};
const save=async()=>writeFile('audit/result.json',JSON.stringify(report,null,2));
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function api(path,body){
 if(body){assert(path===`/workers/workers/${SCRIPT}/versions?deploy=false`||path===`/workers/scripts/${SCRIPT}/deployments`,'WRITE_ENDPOINT_NOT_ALLOWED');}
 const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,`CF_API:${r.status}:${JSON.stringify(j.errors||[]).slice(0,500)}`);return j.result;
}
async function active(){const j=await api(`/workers/scripts/${SCRIPT}/deployments?per_page=1`);const d=j.deployments?.[0];assert(d?.versions?.length===1&&d.versions[0].percentage===100,'ACTIVE_NOT_SINGLE_100');return {id:d.versions[0].version_id,deployment:d.id};}
async function version(id){return api(`/workers/workers/${SCRIPT}/versions/${id}?include=modules`);}
const moduleHashes=v=>v.modules.map(x=>({name:x.name,type:x.content_type,sha:sha(Buffer.from(x.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
async function config(){const settings=await api(`/workers/scripts/${SCRIPT}/settings`),schedules=await api(`/workers/scripts/${SCRIPT}/schedules`),domains=(await api('/workers/domains')).filter(x=>x.service===SCRIPT).sort((a,b)=>a.hostname.localeCompare(b.hostname));return {settings,schedules,domains};}
// Zone routes use the zone endpoint, not an account endpoint. No write is allowed here.
async function readRoutes(){const r=await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/workers/routes`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});const j=await r.json();if(r.ok&&j.success)return j.result;const proof=request.routesAudit;assert([401,403].includes(r.status),`ROUTES_READ_FAILED:${r.status}:${JSON.stringify(j.errors)}`);assert(proof?.source==='authenticated-dashboard-session'&&proof.zone===zone&&proof.success===true&&Array.isArray(proof.result),'AUTHENTICATED_EXTERNAL_ROUTES_AUDIT_REQUIRED');assert(Date.now()-Date.parse(proof.capturedAt)>=0&&Date.now()-Date.parse(proof.capturedAt)<600000,'EXTERNAL_ROUTES_AUDIT_EXPIRED');report.routesRead={ciStatus:r.status,ciErrors:j.errors,verifiedBy:proof.source,verifiedAt:proof.capturedAt,requiresDashboardPostCheck:true};return proof.result;}
async function snapshotConfig(){const c=await config();c.routes=await readRoutes();assert.deepEqual(c.domains.map(x=>x.hostname),['ball46.com','www.ball46.com'],'WRONG_CUSTOM_DOMAINS');return c;}
async function bytes(origin,path){assert(/^https:\/\/(ball46\.com|[a-f0-9]{8}-ball46-production\.mccarey-supon\.workers\.dev)$/.test(origin),'UNAPPROVED_ORIGIN');const u=new URL(path,origin);u.searchParams.set('kitAudit',`${process.env.GITHUB_RUN_ID}-${Date.now()}`);const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});const b=Buffer.from(await r.arrayBuffer());return {path,status:r.status,sha:sha(b),bytes:b};}
async function health(origin){const result=[];for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1']){const r=await bytes(origin,path);assert.equal(r.status,200,'API_HTTP:'+path);const j=JSON.parse(r.bytes);assert.equal(j.ok,true,'BACKEND_NOT_OK:'+path);if(path==='/api/engine/board'){assert(Array.isArray(j.fixtures),'BOARD_SCHEMA');assert.equal(j.stale,false,'BOARD_STALE');}result.push({path,status:r.status,ok:j.ok,version:j.version,stale:j.stale,hubFetchedAt:j.hubFetchedAt,fixtureCount:j.fixtures?.length,signalCount:j.signals?.length,pageRows:j.rows?.length});}return result;}
async function publicSnapshot(v){const html=await bytes(publicOrigin,'/index.html');assert.equal(html.status,200,'ROOT_MISSING');const paths=new Set(['/','/index.html','/team-kits-343.js',...v.modules.filter(x=>x.name.startsWith('assets/')).map(x=>'/'+x.name.slice(7))]);for(const m of html.bytes.toString().matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)){const u=new URL(m[1].replaceAll('&amp;','&'),publicOrigin);if(u.origin===publicOrigin)paths.add(u.pathname);}const records=[];for(const path of [...paths].sort()){const r=await bytes(publicOrigin,path);assert(r.status===200||(path==='/color-semantics-stat-entry-20261011.js'&&r.status===404),'UNEXPECTED_BASE_RESOURCE_FAILURE:'+path);records.push({path,status:r.status,sha:r.sha});}return records;}
async function verifyPublic(origin,records,shirtHash){for(const entry of records){const r=await bytes(origin,entry.path);assert.equal(r.status,entry.path==='/team-kits-343.js'?200:entry.status,'PUBLIC_STATUS:'+entry.path);assert.equal(r.sha,entry.path==='/team-kits-343.js'?shirtHash:entry.sha,'PUBLIC_BYTES:'+entry.path);}}
const previewOrigin=id=>`https://${id.slice(0,8)}-ball46-production.mccarey-supon.workers.dev`;
async function assertOwnedCandidate(id,baseVersion,kits){assert(/^[a-f0-9-]{36}$/.test(id||'')&&id!==BASE,'INVALID_CANDIDATE_UUID');const v=await version(id);assert.equal(v.annotations?.['workers/tag'],MARK,'CANDIDATE_NOT_OWNED');assert.equal(v.main_module,baseVersion.main_module,'MAIN_MODULE_CHANGED');const expected=baseVersion.modules.map(x=>x.name===baseVersion.main_module?{...x,content_base64:Buffer.from(patchMain(Buffer.from(x.content_base64,'base64').toString(),kits)).toString('base64')}:x);assert.deepEqual(moduleHashes(v),moduleHashes({modules:expected}),'UNEXPECTED_MODULE_DIFF');assert.equal(canonical(v.bindings),canonical(baseVersion.bindings),'BINDINGS_CHANGED');assert.equal(canonical(v.assets?.config),canonical(baseVersion.assets?.config),'ASSET_CONFIG_CHANGED');assert.equal(v.compatibility_date,baseVersion.compatibility_date,'COMPATIBILITY_CHANGED');assert.deepEqual(v.compatibility_flags||[],baseVersion.compatibility_flags||[],'FLAGS_CHANGED');return v;}
async function setTraffic(id,expected,message){assert.equal((await active()).id,expected,'ACTIVE_CHANGED_BEFORE_TRAFFIC_WRITE');await api(`/workers/scripts/${SCRIPT}/deployments`,{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}});assert.equal((await active()).id,id,'TRAFFIC_WRITE_NOT_CONFIRMED');}
let activated=false;
try{
 const a=await active();report.before=a;assert.equal(a.id,request.phase==='restore'?request.candidate:BASE,'ACTIVE_CHANGED_STOP');
 const base=await version(BASE);assert.equal(base.id,BASE,'BASE_EXPORT_MISMATCH');assert(base.modules?.length,'MODULE_EXPORT_EMPTY');assert(base.bindings.every(x=>['assets','service'].includes(x.type)),'UNEXPECTED_BINDING_TYPE');
 const kits=await readFile('team-kits-343.js','utf8');assert.equal(sha(kits),CANDIDATE_KITS,'KIT_BYTES_CHANGED');
 const beforeConfig=await snapshotConfig();report.configBefore=beforeConfig;report.baseModules=moduleHashes(base);report.healthBefore=await health(publicOrigin);
 const existing=JSON.parse(await readFile('audit-last/candidate.json','utf8').catch(()=>'{"publicBefore":null}'));
 const publicBefore=request.phase==='candidate'?await publicSnapshot(base):existing.publicBefore;assert(publicBefore?.length>=33,'PUBLIC_BASELINE_MISSING');report.publicBefore=publicBefore;
 if(request.phase==='candidate'){
  assert.equal((await bytes(publicOrigin,'/team-kits-343.js')).sha,ORIGINAL_KITS,'ORIGINAL_KIT_CHANGED');
  const modules=base.modules.map(x=>x.name===base.main_module?{...x,content_base64:Buffer.from(patchMain(Buffer.from(x.content_base64,'base64').toString(),kits)).toString('base64')}:x);
  const body={main_module:base.main_module,modules,bindings:base.bindings.map(x=>({type:'inherit',name:x.name,version_id:BASE})),assets:{config:base.assets.config},compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],annotations:{'workers/tag':MARK,'workers/message':'Team shirt GET only; exact Active ASSETS inheritance; no manifest rebuild'},usage_model:base.usage_model};
  for(const k of ['limits','placement'])if(base[k])body[k]=base[k];
  report.inheritance=body.bindings;await save();assert.equal((await active()).id,BASE,'ACTIVE_CHANGED_BEFORE_UPLOAD');
  const c=await api(`/workers/workers/${SCRIPT}/versions?deploy=false`,body);report.candidate=c.id;await save();
  await assertOwnedCandidate(c.id,base,kits);await verifyPublic(previewOrigin(c.id),publicBefore,CANDIDATE_KITS);report.previewHealth=await health(previewOrigin(c.id));
  assert.equal(canonical(await snapshotConfig()),canonical(beforeConfig),'CONFIG_CHANGED_ON_UPLOAD');assert.equal((await active()).id,BASE,'UPLOAD_CHANGED_ACTIVE');
  report.previewUrl=previewOrigin(c.id);report.candidateVerified=true;report.trafficChanged=false;await writeFile('audit-last/candidate.json',JSON.stringify(report,null,2));
 }else{
  assert.equal(existing.base,BASE,'AUDIT_BASE_MISMATCH');assert.equal(existing.candidate,request.candidate,'AUDIT_CANDIDATE_MISMATCH');assert.equal(existing.candidateVerified,true,'PREVIEW_NOT_VERIFIED');
  await assertOwnedCandidate(request.candidate,base,kits);assert.equal(canonical(beforeConfig),canonical(existing.configBefore),'CONFIG_DRIFT_SINCE_CANDIDATE');
  if(request.phase==='restore'){await setTraffic(BASE,request.candidate,'Restore exact pre-shirt Active after authorized team shirt change');await verifyPublic(publicOrigin,publicBefore,ORIGINAL_KITS);report.restored=true;}
  else{
   assert.equal(request.uiVerified,true,'BROWSER_PREVIEW_NOT_VERIFIED');await verifyPublic(publicOrigin,publicBefore,ORIGINAL_KITS);await verifyPublic(previewOrigin(request.candidate),publicBefore,CANDIDATE_KITS);await health(previewOrigin(request.candidate));
   await setTraffic(request.candidate,BASE,'Verified team shirts only; preserve exact Active assets, APIs and bindings');activated=true;report.candidate=request.candidate;await save();
   await verifyPublic(publicOrigin,publicBefore,CANDIDATE_KITS);report.healthAfter=await health(publicOrigin);assert.equal(canonical(await snapshotConfig()),canonical(beforeConfig),'CONFIG_CHANGED_AFTER_ACTIVATE');report.activated=true;
  }
 }
 report.finishedAt=new Date().toISOString();report.ok=true;await save();await writeFile(`audit-last/${request.phase}-${process.env.GITHUB_RUN_ID}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({phase:request.phase,ok:true,base:BASE,candidate:report.candidate,preview:report.previewUrl,active:await active()}));
}catch(e){
 report.ok=false;report.error=e.message;
 if(activated){try{await setTraffic(BASE,request.candidate,'Restore pre-shirt Active after post-deploy verification failure');report.emergencyRestored=true;report.restoreHealth=await health(publicOrigin);}catch(restoreError){report.restoreError=restoreError.message;}}
 await save();console.error(e.message);process.exitCode=1;
}
