import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{BASE,MAIN_SHA,HTML_SHA,JS_SHA,JS_PATH,patchJs,patchHtml,patchWorker,sha}from'./patch.mjs';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,WORKER='ball46-production';
assert.equal(ACCOUNT,'62cb0db544160e6591342abd6b4f35cc');assert(TOKEN);
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT,ORIGIN='https://ball46.com';
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+WORKER+'/versions','CANDIDATE_ONLY_WRITE');const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN},body,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success===true,'CLOUDFLARE_API_'+r.status+'_'+JSON.stringify(j.errors).slice(0,160));return j.result;}
async function active(){const a=(await api('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];assert(a?.versions?.length===1&&a.versions[0].percentage===100);return{id:a.versions[0].version_id,deployment:a.id};}
async function version(id){for(let i=0;i<4;i++){try{return await api('/workers/workers/'+WORKER+'/versions/'+id+'?include=modules')}catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,900*(i+1)))}}}
async function get(host,path){const u=new URL(path,host);u.searchParams.set('scoreCandidate',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(46000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,type:r.headers.get('content-type'),sha:sha(b),body:b,headers:Object.fromEntries(r.headers)};}
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const retainedPaths=['/robots.txt','/favicon.ico','/favicon-192.png','/ball46-logo.svg','/dashboard-v2-stage3.js','/dashboard-v2-tune.css','/statistics.html','/signal.html','/settings.html','/api-monitor.html'];
async function retained(host,expected){const out={};for(const path of retainedPaths){const r=await get(host,path);assert.equal(r.status,200,'ASSET_HTTP_'+path);out[path]={sha:r.sha,status:200};if(expected)assert.equal(out[path].sha,expected[path].sha,'ASSET_CHANGED_'+path);}return out;}
async function health(host){const out=[];for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(host,path);assert.equal(r.status,200,'API_STATUS_'+path);assert.equal(JSON.parse(r.body.toString()).ok,true,'API_NOT_OK_'+path);out.push(path);}return out;}
const hashes=v=>v.modules.map(m=>({name:m.name,sha:sha(Buffer.from(m.content_base64,'base64')),type:m.content_type})).sort((a,b)=>a.name.localeCompare(b.name));
const out={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,base:BASE,ok:false};await mkdir('audit',{recursive:true});const save=async()=>writeFile('audit/candidate.json',JSON.stringify(out,null,2));
try{
 out.before=await active();assert.equal(out.before.id,BASE,'NEWER_PRODUCTION_VERSION_ABORT');
 const b=await version(BASE),main=b.modules.find(m=>m.name===b.main_module);assert(main&&b.assets,'WORKER_MODULES_MISSING');
 const source=Buffer.from(main.content_base64,'base64').toString();assert.equal(sha(Buffer.from(source)),MAIN_SHA,'MAIN_MODULE_SHA_DRIFT');out.baseHashes=hashes(b);
 const [settings,schedules,domains]=await Promise.all([api('/workers/scripts/'+WORKER+'/settings'),api('/workers/scripts/'+WORKER+'/schedules'),api('/workers/domains')]);
 assert.deepEqual(domains.filter(x=>x.service===WORKER).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'CUSTOM_DOMAINS_DRIFT');
 out.config={settings,schedules};
 const [h,j]=await Promise.all([get(ORIGIN,'/'),get(ORIGIN,JS_PATH)]);
 assert.equal(h.status,200);assert.equal(j.status,200);assert.equal(h.sha,HTML_SHA,'HOMEPAGE_SHA_DRIFT');assert.equal(j.sha,JS_SHA,'FEATURED_JS_SHA_DRIFT');
 const html=patchHtml(h.body.toString()),js=patchJs(j.body.toString()),newSource=patchWorker(source);
 out.htmlSha=sha(Buffer.from(html));out.jsSha=sha(Buffer.from(js));out.mainSha=sha(Buffer.from(newSource));
 assert(html.includes('MATCH COMPARISON')&&html.includes('HOME')&&html.includes('AWAY'),'MATCH_COMPARISON_FIX_LOST');
 assert(js.includes("node.textContent.trim().toLowerCase()==='no active signal'"),'ACTIVE_SIGNAL_FIX_LOST');
 out.assets=await retained(ORIGIN);out.healthBefore=await health(ORIGIN);await writeFile('audit/new-main.mjs',newSource);
 const metadata={main_module:b.main_module,compatibility_date:b.compatibility_date,compatibility_flags:b.compatibility_flags||[],bindings:b.bindings,keep_assets:true,assets:{config:b.assets.config},annotations:{'workers/tag':'BALL46_FEATURED_SCORE_SHORT_DASH_20261023','workers/message':'Shorten central featured score en dash to hyphen only; preserve all other assets'}};
 for(const k of['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const mod of b.modules)form.set(mod.name,new Blob([mod.name===b.main_module?newSource:Buffer.from(mod.content_base64,'base64')],{type:mod.content_type}),mod.name);
 assert.equal((await active()).id,BASE,'ACTIVE_CHANGED_BEFORE_UPLOAD');
 out.candidate=(await api('/workers/scripts/'+WORKER+'/versions',form)).id;await save();
 const v=await version(out.candidate);assert.equal(v.annotations?.['workers/tag'],'BALL46_FEATURED_SCORE_SHORT_DASH_20261023');
 const expected=b.modules.map(m=>({name:m.name,sha:m.name===b.main_module?out.mainSha:sha(Buffer.from(m.content_base64,'base64')),type:m.content_type})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(hashes(v),expected,'UNEXPECTED_MODULE_CHANGE');
 for(const k of ['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(canonical(v[k]),canonical(b[k]),'WORKER_CONFIG_CHANGED_'+k);
 out.preview='https://'+out.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
 for(const path of ['/','/index.html']){const r=await get(out.preview,path);assert.equal(r.status,200);assert.equal(r.sha,out.htmlSha,'PREVIEW_HTML_MISMATCH_'+path);}
 const pjs=await get(out.preview,JS_PATH);assert.equal(pjs.status,200);assert.equal(pjs.sha,out.jsSha,'PREVIEW_JS_MISMATCH');assert.equal(pjs.headers['x-ball46-score-dash'],'short-hyphen-20261023');
 await retained(out.preview,out.assets);out.healthPreview=await health(out.preview);
 assert.equal(canonical((await api('/workers/scripts/'+WORKER+'/settings'))),canonical(settings),'SETTINGS_CHANGED');
 assert.equal((await active()).id,BASE,'ISOLATED_CANDIDATE_NOT_ISOLATED');
 out.ok=true;out.trafficChanged=false;await save();
 console.log('B46_SCORE_CANDIDATE='+JSON.stringify({ok:true,base:BASE,candidate:out.candidate,preview:out.preview,htmlSha:out.htmlSha,jsSha:out.jsSha,assets:Object.keys(out.assets).length,modules:b.modules.length}));
}catch(e){out.error=e.stack||e.message;await save();console.error('B46_SCORE_CANDIDATE_FAILED='+e.message);process.exitCode=1;}
