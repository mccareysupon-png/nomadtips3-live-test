// Explicit owner-authorized activation with immediate-baseline rollback.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {active,version,config,modules,sha,canon,cf} from '../statistics-member-sidebar-test-20261112/release-ops.mjs';
const D='work/statistics-summary-shadow-20261113',O=D+'/qa/combined',W='ball46-production';
const p=JSON.parse(await readFile(O+'/candidate.json')),report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,base:p.baseVersion,candidate:p.candidate,engineWrites:0,providerRequests:0};
async function get(host,path){const r=await fetch(new URL(path,host),{redirect:'error',signal:AbortSignal.timeout(45000)}),body=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200,'HTTP_'+r.status+':'+host+path);return {body,headers:r.headers};}
async function health(host){const j=JSON.parse((await get(host,'/api/engine/health')).body);assert(j.ok===true&&!JSON.stringify(j).includes('SQLITE_TOOBIG'),'BACKEND_NOT_OK:engine');const h=JSON.parse((await get(host,'/api/hub/snapshot')).body);assert(h.ok===true&&h.cacheOnly===true&&h.externalRequestsAdded===0&&h.stale!==true,'LIVE_CACHE_NOT_READY');return {engine:true,cacheOnly:true,fixtures:h.fixtures?.length};}
async function protectedRows(){
 const hashes={};let cursor='stat:v2:row:\uffff';const seen=new Set();
 const host='https://nomadtips3-engine-343.mccarey-supon.workers.dev';
 do{assert(seen.size<256&&!seen.has(cursor),'CURSOR_GUARD');seen.add(cursor);const j=JSON.parse((await get(host,'/statistics?'+new URLSearchParams({paged:'1',cursor}))).body);assert(j.ok&&Array.isArray(j.rows)&&j.rows.length<=500);
  for(const r of j.rows)if(r.status==='SETTLED'){const value=Object.fromEntries(['id','fixtureId','status','result','market','selection','line','selectionLine','odds','bookmaker','entryMinute','entryScore','finalScore','settledAt','createdAt','settlementRevision','settlementSource'].filter(k=>k in r).map(k=>[k,r[k]]));hashes[r.id]=sha(canon(value));}
  cursor=j.nextCursor||null;
 }while(cursor);assert(Object.keys(hashes).length>0);return hashes;
}
async function check(host){
 const html=(await get(host,'/')).body.toString();assert(html.includes('b46-member-banners-20261112')&&html.includes('b46=summary-pc-banners-20261113'),'RELEASE_HTML');
 const payload=JSON.parse(await readFile(D+'/summary-release-payload.txt'));
 for(const f of p.publicBefore){const b=(await get(host,f.path)).body,changed=payload.files.find(x=>x.path===new URL(f.path,host).pathname);assert.equal(sha(b),changed?.sha||f.sha,'ASSET_HASH:'+f.path);}
 for(const f of JSON.parse(await readFile(O+'/build.json')).newMedia)assert.equal(sha((await get(host,f.path)).body),f.sha,'MEDIA_HASH');
 const j=JSON.parse((await get(host,'/api/statistics/summary')).body);assert(j.ok&&j.mode==='LIVE_SUMMARY'&&!j.stale&&j.ledgerTotal>0,'SUMMARY_NOT_READY');return {ledgerTotal:j.ledgerTotal,asOf:j.asOf};
}
try{
 assert(p.ok&&p.trafficWrites===0&&p.engineWrites===0,'PREVIEW_NOT_VERIFIED');
 const ui=JSON.parse(await readFile(O+'/hosted-browser.json'));assert(ui.ok&&ui.candidate===p.candidate&&ui.desktop&&ui.mobile&&ui.realScores,'HOSTED_PC_MOBILE_REQUIRED');
 assert.deepEqual(await active(),p.before,'CONCURRENT_DEPLOY');assert.equal(sha(canon(await config())),sha(canon(p.baseConfig)),'BASE_CONFIG_DRIFT');assert.equal((await active(p.engine.worker)).version,p.engine.active,'ENGINE_CHANGED');assert.deepEqual(await active(p.summaryService),p.serviceActive,'SUMMARY_SERVICE_CHANGED');
 const candidate=await version(p.candidate),base=await version(p.baseVersion);assert.deepEqual(modules(base),p.baseModules);assert.equal(candidate.main_module,'b46-summary-entry-20261113.mjs');assert.deepEqual(modules(candidate).filter(x=>!['b46-summary-entry-20261113.mjs','summary-release-payload.txt'].includes(x.name)),p.baseModules);
 await check(p.preview);report.preflight=await health('https://ball46-production.mccarey-supon.workers.dev');
 // Do not reduce Bot Fight Mode or bypass a challenge to satisfy this gate.
 await get('https://ball46.com','/');
 const before=await protectedRows();report.protectedBefore=Object.keys(before).length;
 assert.deepEqual(await active(),p.before,'CONCURRENT_DEPLOY');
 report.activation=await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:p.candidate,percentage:100}],annotations:{'workers/message':'Owner-approved bounded read-only statistics summary and two PC membership banners; Engine unchanged'}});report.activated=true;
 report.public=await check('https://ball46.com');report.afterHealth=await health('https://ball46.com');
 const after=await protectedRows();for(const [id,hash]of Object.entries(before))assert.equal(after[id],hash,'SETTLED_RECORD_CHANGED:'+id);report.protectedPreserved=Object.keys(before).length;
 assert.equal((await active()).version,p.candidate);assert.equal((await active(p.engine.worker)).version,p.engine.active);
 const afterConfig=await config();assert.equal(canon(afterConfig.cron),canon(p.baseConfig.cron));assert.equal(canon(afterConfig.domains),canon(p.baseConfig.domains));assert.equal(canon(afterConfig.subdomain),canon(p.baseConfig.subdomain));
 for(const [name,id]of Object.entries(p.baseConfig.services))assert.equal(afterConfig.services[name],id,'DEPENDENCY_CHANGED:'+name);
 assert.equal(canon(afterConfig.settings.bindings.filter(b=>b.name!=='STATISTICS_SUMMARY')),canon(p.baseConfig.settings.bindings));report.ok=true;
}catch(e){report.ok=false;report.error=String(e.stack);
 if(report.activated){const now=await active();if(now.version===p.candidate){report.rollback=await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:p.baseVersion,percentage:100}],annotations:{'workers/message':'Guarded rollback of combined release to immediate baseline'}});report.restored=(await active()).version===p.baseVersion;}else report.concurrentChange=true;}
 process.exitCode=1;
}
await writeFile(O+'/activation.json',JSON.stringify(report,null,2));console.log('COMBINED_ACTIVATION '+JSON.stringify(report));
