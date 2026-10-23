import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{BASE,MAIN_SHA,HTML_SHA,JS_SHA,JS_PATH,patchJS,patchHTML,patchWorker,sha}from'./patch.mjs';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,WORKER='ball46-production';
assert.equal(ACCOUNT,'62cb0db544160e6591342abd6b4f35cc','WRONG_ACCOUNT');assert(TOKEN);
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT,ORIGIN='https://ball46.com';
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+WORKER+'/versions','WRITES_ONLY_NEW_CANDIDATES');const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN},body,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success,'CF_ERROR_'+r.status+':'+JSON.stringify(j.errors).slice(0,250));return j.result;}
async function active(){const d=(await api('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];assert(d.versions?.length===1&&d.versions[0].percentage===100);return{id:d.versions[0].version_id,deployment:d.id};}
async function version(id){for(let i=0;i<4;i++){try{return await api('/workers/workers/'+WORKER+'/versions/'+id+'?include=modules')}catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,650*(i+1)))}}}
async function get(host,path){const u=new URL(path,host);u.searchParams.set('ghostCandidateAudit',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,type:r.headers.get('content-type'),sha:sha(b),body:b,headers:Object.fromEntries(r.headers)};}
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const retainedPaths=['/robots.txt','/favicon.ico','/favicon-192.png','/ball46-logo.svg','/dashboard-v2-stage3.js','/dashboard-v2-tune.css','/statistics.html','/signal.html','/settings.html','/api-monitor.html'];
async function assets(host,baseline){const result={};for(const path of retainedPaths){const r=await get(host,path);assert.equal(r.status,200,'ASSET_HTTP_'+path);result[path]={status:200,sha:r.sha};if(baseline)assert.equal(r.sha,baseline[path].sha,'CHANGED_ASSET_'+path);}return result;}
async function health(host){const result=[];for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(host,path);assert.equal(r.status,200,'API_HTTP_'+path);const j=JSON.parse(r.body.toString());assert.equal(j.ok,true,'API_NOT_OK_'+path);result.push({path,ok:true});}return result;}
const hashes=v=>v.modules.map(m=>({name:m.name,sha:sha(Buffer.from(m.content_base64,'base64')),type:m.content_type})).sort((a,b)=>a.name.localeCompare(b.name));
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,base:BASE,ok:false};
await mkdir('audit',{recursive:true});const save=async()=>writeFile('audit/candidate.json',JSON.stringify(report,null,2));
try{
 report.before=await active();assert.equal(report.before.id,BASE,'NEWER_DEPLOY_ABSENT_GUARD');
 const base=await version(BASE),main=base.modules.find(m=>m.name===base.main_module);
 assert(main&&base.assets,'WORKER_MAIN_OR_ASSETS_MISSING');
 const mainSrc=Buffer.from(main.content_base64,'base64').toString();assert.equal(sha(Buffer.from(mainSrc)),MAIN_SHA,'MAIN_WORKER_HASH_DRIFT');
 report.moduleHashes=hashes(base);
 const [settings,schedules,domains]=await Promise.all([api('/workers/scripts/'+WORKER+'/settings'),api('/workers/scripts/'+WORKER+'/schedules'),api('/workers/domains')]);
 assert.deepEqual(domains.filter(x=>x.service===WORKER).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'DOMAINS_CHANGED');
 report.config={settings,schedules};
 const [page,js]=await Promise.all([get(ORIGIN,'/'),get(ORIGIN,JS_PATH)]);
 assert.equal(page.status,200);assert.equal(js.status,200);assert.equal(page.sha,HTML_SHA,'HTML_HASH_DRIFT');assert.equal(js.sha,JS_SHA,'JS_HASH_DRIFT');
 const updatedHTML=patchHTML(page.body.toString()),updatedJS=patchJS(js.body.toString()),updatedWorker=patchWorker(mainSrc);
 report.htmlSha=sha(Buffer.from(updatedHTML));report.jsSha=sha(Buffer.from(updatedJS));report.workerSha=sha(Buffer.from(updatedWorker));
 report.assets=await assets(ORIGIN);report.healthBefore=await health(ORIGIN);await writeFile('audit/candidate-runtime.mjs',updatedWorker);
 const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'BALL46_SIGNAL_EMPTY_GHOST_FIX_20261023','workers/message':'Remove No active signal orphan text node in FEATURED ACTIVE SIGNALS; no odds or API change'}};
 for(const k of['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?updatedWorker:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).id,BASE,'ACTIVE_CHANGED_BEFORE_CANDIDATE');
 report.candidate=(await api('/workers/scripts/'+WORKER+'/versions',form)).id;await save();
 const v=await version(report.candidate);assert.equal(v.annotations?.['workers/tag'],'BALL46_SIGNAL_EMPTY_GHOST_FIX_20261023');
 const expected=base.modules.map(m=>({name:m.name,sha:m.name===base.main_module?report.workerSha:sha(Buffer.from(m.content_base64,'base64')),type:m.content_type})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(hashes(v),expected,'OTHER_MODULES_CHANGED');
 for(const k of ['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(canonical(v[k]),canonical(base[k]),'CONFIG_CHANGED_'+k);
 report.preview='https://'+report.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
 for(const path of ['/','/index.html']){const r=await get(report.preview,path);assert.equal(r.status,200);assert.equal(r.sha,report.htmlSha,'PREVIEW_HTML_MISMATCH_'+path);}
 const j=await get(report.preview,JS_PATH);assert.equal(j.status,200);assert.equal(j.sha,report.jsSha,'PREVIEW_JS_MISMATCH');assert.equal(j.headers['x-ball46-empty-ghost'],'fixed-20261023');
 report.healthPreview=await health(report.preview);await assets(report.preview,report.assets);
 assert.equal(canonical((await api('/workers/scripts/'+WORKER+'/settings'))),canonical(settings),'SETTINGS_CHANGED');
 assert.equal((await active()).id,BASE,'CANDIDATE_ACCIDENTALLY_ACTIVE');
 report.ok=true;report.trafficChanged=false;await save();
 console.log('B46_GHOST_CANDIDATE='+JSON.stringify({ok:true,base:BASE,candidate:report.candidate,preview:report.preview,htmlSha:report.htmlSha,jsSha:report.jsSha,assets:Object.keys(report.assets).length,modules:base.modules.length}));
}catch(e){report.error=e.stack||e.message;await save();console.error('B46_GHOST_CANDIDATE_FAILED='+e.message);process.exitCode=1;}
