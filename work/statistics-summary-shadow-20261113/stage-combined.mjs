// Creates an isolated summary service and an INACTIVE Website candidate only.
// No traffic mutation, Engine upload, route change, Cron or security weakening.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {active,version,config,modules,sha,canon,cf} from '../statistics-member-sidebar-test-20261112/release-ops.mjs';
const D='work/statistics-summary-shadow-20261113',OUT=D+'/qa/combined',A='62cb0db544160e6591342abd6b4f35cc',W='ball46-production',S='ball46-statistics-summary-v1',ENTRY='b46-summary-entry-20261113.mjs',PAYLOAD='summary-release-payload.txt';
const require=createRequire(resolve(D+'/.runtime/resolve.cjs')),{build}=require('esbuild');
await mkdir(OUT,{recursive:true});
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,website:W,summaryService:S,trafficWrites:0,engineWrites:0,providerRequests:0,writes:[]};
async function control(method,path,body){
 assert((method==='GET')||(method==='PUT'&&path==='/workers/scripts/'+S)||(method==='POST'&&path==='/workers/scripts/'+S+'/subdomain'),'CONTROL_WRITE_DENIED');
 if(method!=='GET')report.writes.push({method,path});
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success,'CF_'+r.status+':'+JSON.stringify(j.errors));return j.result;
}
async function get(origin,path){const r=await fetch(new URL(path,origin),{redirect:'error',signal:AbortSignal.timeout(45000)}),body=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200,'PUBLIC_HTTP_'+r.status+':'+path);return {body,headers:r.headers};}
try{
 const source=JSON.parse(await readFile(D+'/source/active.json')),base=source.workers.find(x=>x.worker===W),engine=source.workers.find(x=>x.worker==='nomadtips3-engine-343');
 report.before=await active();assert.equal(report.before.version,base.active,'WEBSITE_DRIFT');assert.equal((await active(engine.worker)).version,engine.active,'ENGINE_DRIFT');
 const v=await version(base.active),cfg=await config();assert.equal(v.main_module,'index.js');assert.equal(sha(Buffer.from(v.modules.find(x=>x.name===v.main_module).content_base64,'base64')),base.sha);
 report.baseModules=modules(v);report.baseConfig=cfg;report.baseVersion=base.active;report.engine=engine;assert(!v.bindings.some(x=>x.name==='STATISTICS_SUMMARY'),'SUMMARY_BINDING_EXISTS_STOP');assert(!v.modules.some(x=>[ENTRY,PAYLOAD].includes(x.name)),'CANDIDATE_MODULE_EXISTS_STOP');
 const payload=JSON.parse(await readFile(D+'/'+PAYLOAD)),capture=JSON.parse(await readFile(D+'/reference/ui-proof/qa/ui-capture/capture.json'));assert.equal(payload.baseVersion,base.active);
 const currentHtml=(await get(capture.origin,'/')).body.toString();assert.equal(currentHtml.split(payload.htmlDelta.before).length,2,'LIVE_HTML_DRIFT');
 // Confirm every captured live reference still returns the original bytes.
 report.publicBefore=[];for(const f of capture.files){const r=await get(capture.origin,f.path);assert.equal(sha(r.body),f.sha,'STATIC_DRIFT:'+f.path);report.publicBefore.push({path:f.path,sha:f.sha});}
 const gates=JSON.parse(await readFile(D+'/qa/combined/browser.json')),runtime=JSON.parse(await readFile(D+'/qa/service-runtime.json')),ui=JSON.parse(await readFile(D+'/qa/ui/browser.json')),preflight=JSON.parse(await readFile(D+'/qa/deploy-preflight.json'));assert(gates.ok&&runtime.ok&&ui.ok&&preflight.ok,'LOCAL_QA_GATE');report.testChecks={combined:gates.checks,service:runtime.checks,ui:ui.checks??ui.results?.length};
 const scripts=await control('GET','/workers/scripts');assert(!scripts.some(x=>x.id===S),'SUMMARY_WORKER_ALREADY_EXISTS_REVIEW_REQUIRED');
 await build({entryPoints:[D+'/summary-service.mjs'],bundle:true,format:'esm',platform:'browser',loader:{'.txt':'text'},external:['cloudflare:*'],outfile:D+'/qa/combined/summary-bundle.mjs'});
 const serviceBytes=await readFile(OUT+'/summary-bundle.mjs');report.serviceSha=sha(serviceBytes);
 const serviceMeta={main_module:'index.mjs',compatibility_date:'2026-09-09',bindings:[{type:'service',name:'ENGINE',service:engine.worker},{type:'durable_object_namespace',name:'SUMMARY',class_name:'StatisticsSummary'}],migrations:{new_tag:'b46-summary-v1',new_sqlite_classes:['StatisticsSummary']},observability:{enabled:true},annotations:{'workers/tag':'B46_BOUNDED_SUMMARY_20261113','workers/message':'Isolated read-only statistics reducer and approved PC banner media; no Engine changes'}};
 const sf=new FormData();sf.set('metadata',new Blob([JSON.stringify(serviceMeta)],{type:'application/json'}));sf.set('index.mjs',new Blob([serviceBytes],{type:'application/javascript+module'}),'index.mjs');
 assert.deepEqual(await active(),report.before);assert.equal(sha(canon(await config())),sha(canon(cfg)));
 report.serviceUpload=await control('PUT','/workers/scripts/'+S,sf);await control('POST','/workers/scripts/'+S+'/subdomain',{enabled:false,previews_enabled:false});report.serviceActive=await active(S);report.serviceSettings=await control('GET','/workers/scripts/'+S+'/settings');
 assert.deepEqual(await control('GET','/workers/scripts/'+S+'/schedules'),{schedules:[]});
 assert.equal((await control('GET','/workers/scripts/'+S+'/subdomain')).enabled,false);
 const nextModules=[...v.modules,{name:ENTRY,content_type:'application/javascript+module',content_base64:Buffer.from(await readFile(D+'/website-entry.mjs')).toString('base64')},{name:PAYLOAD,content_type:'text/plain',content_base64:Buffer.from(JSON.stringify(payload)).toString('base64')}];
 report.compressedModuleBytes=nextModules.reduce((n,m)=>n+gzipSync(Buffer.from(m.content_base64,'base64')).length,0);assert(report.compressedModuleBytes<10*1024*1024-100*1024,'WORKER_SIZE_HEADROOM');
 const metadata={main_module:ENTRY,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:[...v.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:b.type,version_id:'latest'}:b),{type:'service',name:'STATISTICS_SUMMARY',service:S}],keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'B46_SUMMARY_PC_BANNERS_20261113','workers/message':'Owner-approved bounded statistics reads + two PC membership banners; original modules retained'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(cfg.settings[k]!=null)metadata[k]=cfg.settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));for(const m of nextModules)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.deepEqual(await active(),report.before);assert.equal((await active(engine.worker)).version,engine.active);
 const made=await cf('/workers/scripts/'+W+'/versions',form);report.candidate=made.id;report.preview='https://'+made.id.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 const actual=await version(made.id);assert.deepEqual(modules(actual),modules({modules:nextModules}));assert.equal(actual.main_module,ENTRY);for(const k of ['assets','compatibility_date','compatibility_flags'])assert.equal(canon(actual[k]),canon(v[k]));
 assert.equal(canon(actual.bindings.filter(b=>b.name!=='STATISTICS_SUMMARY')),canon(v.bindings));
 const root=await get(report.preview,'/');assert(root.body.toString().includes('b46-member-banners-20261112'));assert(root.body.toString().includes('b46=summary-pc-banners-20261113'));
 for(const f of capture.files){const r=await get(report.preview,f.path),changed=payload.files.find(x=>x.path===new URL(f.path,capture.origin).pathname);assert.equal(sha(r.body),changed?.sha||f.sha,'CANDIDATE_ASSET_HASH:'+f.path);}
 for(const f of JSON.parse(await readFile(D+'/qa/combined/build.json')).newMedia){const r=await get(report.preview,f.path);assert.equal(sha(r.body),f.sha,'BANNER_HASH');}
 const summary=JSON.parse((await get(report.preview,'/api/statistics/summary')).body);assert(summary.ok&&summary.mode==='LIVE_SUMMARY'&&summary.stale===false&&summary.ledgerTotal>0,'HOSTED_SUMMARY_NOT_READY');report.hostedSummary={asOf:summary.asOf,total:summary.total,ledgerTotal:summary.ledgerTotal,bytes:JSON.stringify(summary).length};
 assert.deepEqual(await active(),report.before);assert.equal((await active(engine.worker)).version,engine.active);assert.equal(sha(canon(await config())),sha(canon(cfg)));report.ok=true;
}catch(e){report.ok=false;report.error=String(e.stack);process.exitCode=1}
await writeFile(OUT+'/candidate.json',JSON.stringify(report,null,2));console.log('COMBINED_STAGE '+JSON.stringify({ok:report.ok,error:report.error,base:report.baseVersion,candidate:report.candidate,preview:report.preview,hostedSummary:report.hostedSummary,trafficWrites:0,engineWrites:0,compressedModuleBytes:report.compressedModuleBytes}));
