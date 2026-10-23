import assert from'node:assert/strict';
import {mkdir,writeFile} from'node:fs/promises';
import{BASE_VERSION,BASE_MAIN_SHA,BASE_HTML_SHA,BASE_JS_SHA,JS_ROUTE,patchHtml,patchJs,patchMain,sha}from'./patch.mjs';
const SCRIPT='ball46-production',ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert.equal(ACCOUNT,'62cb0db544160e6591342abd6b4f35cc','WRONG_ACCOUNT_ABORT');assert(TOKEN,'MISSING_TOKEN');
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT,HOST='https://ball46.com';
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+SCRIPT+'/versions','WRITES_ONLY_NEW_CANDIDATES');const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN},body,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success===true,'CF:'+r.status+':'+JSON.stringify(j.errors).slice(0,200));return j.result;}
async function active(){const x=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments[0];assert(x?.versions?.length===1&&x.versions[0].percentage===100);return{id:x.versions[0].version_id,deployment:x.id};}
async function version(id){for(let i=0;i<5;i++){try{return await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}catch(e){if(i===4)throw e;await new Promise(r=>setTimeout(r,700*(i+1)))}}}
async function get(base,path){const url=new URL(path,base);url.searchParams.set('b46AtomicAudit',Date.now()+'-'+Math.random());const r=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,type:r.headers.get('content-type'),sha:sha(b),bytes:b,headers:Object.fromEntries(r.headers)};}
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const retained=['/robots.txt','/favicon.ico','/favicon-192.png','/ball46-logo.svg','/dashboard-v2-stage3.js','/dashboard-v2-tune.css','/app.css','/statistics.html','/signal.html','/settings.html','/api-monitor.html'];
async function health(base){const a=[];for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(base,path);assert.equal(r.status,200,'API_STATUS_'+path);const j=JSON.parse(r.bytes.toString());assert.equal(j.ok,true,'API_NOT_OK_'+path);a.push({path,status:200,ok:true,stale:j.stale});}return a;}
async function assets(base,expected){const o={};for(const path of retained){const r=await get(base,path);assert.equal(r.status,200,'ASSET_STATUS_'+path);o[path]={status:r.status,sha:r.sha};if(expected)assert.equal(r.sha,expected[path].sha,'UNEXPECTED_CHANGED_ASSET_'+path)}return o;}
function hashes(v){return v.modules.map(m=>({name:m.name,type:m.content_type,sha:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));}
const out={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,worker:SCRIPT,base:BASE_VERSION,ok:false};
await mkdir('audit',{recursive:true});const save=async()=>writeFile('audit/candidate.json',JSON.stringify(out,null,2));
try{
 out.before=await active();assert.equal(out.before.id,BASE_VERSION,'ACTIVE_VERSION_MOVED_ABORT');
 const base=await version(BASE_VERSION);assert(base.assets,'ASSET_CONFIG_MISSING');const main=base.modules.find(m=>m.name===base.main_module);assert(main,'MAIN_NOT_FOUND');
 const source=Buffer.from(main.content_base64,'base64').toString();assert.equal(sha(Buffer.from(source)),BASE_MAIN_SHA,'MAIN_SOURCE_DRIFT');
 out.sourceModules=hashes(base);
 const [settings,schedules,domains]=await Promise.all([api('/workers/scripts/'+SCRIPT+'/settings'),api('/workers/scripts/'+SCRIPT+'/schedules'),api('/workers/domains')]);
 assert.deepEqual(domains.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'DOMAINS_DRIFT');
 out.config={settings,schedules,domains:domains.filter(x=>x.service===SCRIPT)};
 const [h,j]=await Promise.all([get(HOST,'/'),get(HOST,JS_ROUTE)]);
 assert.equal(h.status,200);assert.equal(j.status,200);assert.equal(h.sha,BASE_HTML_SHA,'LIVE_HTML_DRIFT');assert.equal(j.sha,BASE_JS_SHA,'LIVE_JS_DRIFT');
 assert(/javascript/.test(j.type),'JS_MIME_DRIFT');
 const htmlNew=patchHtml(h.bytes.toString()),jsNew=patchJs(j.bytes.toString()),sourceNew=patchMain(source);
 out.html={old:h.sha,new:sha(Buffer.from(htmlNew))};out.js={old:j.sha,new:sha(Buffer.from(jsNew))};out.newMainSha=sha(Buffer.from(sourceNew));
 out.retained=await assets(HOST);out.healthBefore=await health(HOST);
 await writeFile('audit/candidate-worker.mjs',sourceNew);
 const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'BALL46_ACTIVE_SIGNALS_ATOMIC_20261023','workers/message':'Atomic FEATURED ACTIVE SIGNALS V11 DOM labels/count; preserve data/UI elsewhere'}};
 for(const k of['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?sourceNew:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).id,BASE_VERSION,'CONCURRENT_DEPLOY_ABORT');
 out.candidate=(await api('/workers/scripts/'+SCRIPT+'/versions',form)).id;await save();
 const v=await version(out.candidate);assert.equal(v.annotations?.['workers/tag'],'BALL46_ACTIVE_SIGNALS_ATOMIC_20261023','CANDIDATE_OWNERSHIP_FAIL');
 const expected=base.modules.map(m=>({name:m.name,type:m.content_type,sha:m.name===base.main_module?out.newMainSha:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(hashes(v),expected,'UNEXPECTED_MODULE_CHANGE');
 for(const k of['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(canonical(v[k]),canonical(base[k]),'CONFIG_CHANGED_'+k);
 const preview='https://'+out.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';out.preview=preview;
 for(const path of ['/','/index.html']){const r=await get(preview,path);assert.equal(r.status,200);assert.equal(r.sha,out.html.new,'PREVIEW_HTML_FAILED_'+path);}
 const pj=await get(preview,JS_ROUTE);assert.equal(pj.status,200);assert.equal(pj.sha,out.js.new,'PREVIEW_JS_FAILED');
 assert.equal(pj.headers['x-ball46-signal-ui'],'atomic-v11-20261023','JS_PATCH_HEADER_ABSENT');
 out.previewRetained=await assets(preview,out.retained);out.healthPreview=await health(preview);
 assert.equal(canonical((await api('/workers/scripts/'+SCRIPT+'/settings'))),canonical(settings),'SETTINGS_CHANGED');
 assert.equal((await active()).id,BASE_VERSION,'CANDIDATE_DID_NOT_REMAIN_ISOLATED');
 out.ok=true;out.trafficChanged=false;await save();
 console.log('BALL46_SIGNALS_CANDIDATE='+JSON.stringify({ok:true,candidate:out.candidate,preview:out.preview,html:out.html,js:out.js,assets:Object.keys(out.retained).length,modules:out.sourceModules.length,base:BASE_VERSION}));
}catch(e){out.error=e.stack||e.message;await save();console.error('BALL46_SIGNALS_CANDIDATE_FAILED='+e.message);process.exitCode=1}
