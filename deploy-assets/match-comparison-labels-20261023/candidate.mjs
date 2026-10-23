import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {BASE_VERSION,BASE_MAIN_SHA,BASE_HTML_SHA,OLD_HOME,OLD_AWAY,NEW_HOME,NEW_AWAY,patchHtml,patchWorker,sha} from './patch.mjs';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,WORKER='ball46-production';
assert.equal(ACCOUNT,'62cb0db544160e6591342abd6b4f35cc','WRONG_ACCOUNT');assert(TOKEN,'TOKEN_MISSING');
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT,ORIGIN='https://ball46.com';
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+WORKER+'/versions','ONLY_WRITE_NEW_VERSION');const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN},body,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success===true,'CF_API_'+r.status+'_'+JSON.stringify(j.errors).slice(0,200));return j.result;}
async function active(){const d=(await api('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];assert(d.versions?.length===1&&d.versions[0].percentage===100);return{id:d.versions[0].version_id,deployment:d.id};}
async function version(id){for(let i=0;i<4;i++){try{return await api('/workers/workers/'+WORKER+'/versions/'+id+'?include=modules')}catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,750*(i+1)))}}}
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function get(origin,path){const u=new URL(path,origin);u.searchParams.set('comparisonQa',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,type:r.headers.get('content-type'),sha:sha(b),body:b,headers:Object.fromEntries(r.headers)};}
const paths=['/robots.txt','/favicon.ico','/favicon-192.png','/ball46-logo.svg','/dashboard-v2-stage3.js','/dashboard-v2-tune.css','/statistics.html','/signal.html','/settings.html','/api-monitor.html','/dashboard-v2-stage3-featured-facts-20261013a.js'];
async function retained(origin,expected){const all={};for(const path of paths){const r=await get(origin,path);assert.equal(r.status,200,'ASSET_HTTP_'+path);all[path]={status:200,sha:r.sha};if(expected)assert.equal(r.sha,expected[path].sha,'UNEXPECTED_ASSET_CHANGE_'+path);}return all;}
async function health(origin){const x=[];for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(origin,path);assert.equal(r.status,200,'API_HTTP_'+path);assert.equal(JSON.parse(r.body.toString()).ok,true,'API_NOT_OK_'+path);x.push(path);}return x;}
const hashes=v=>v.modules.map(m=>({name:m.name,type:m.content_type,sha:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,base:BASE_VERSION,ok:false};await mkdir('audit',{recursive:true});const save=()=>writeFile('audit/candidate.json',JSON.stringify(report,null,2));
try{
 report.before=await active();assert.equal(report.before.id,BASE_VERSION,'ACTIVE_VERSION_CHANGED');
 const base=await version(BASE_VERSION);const main=base.modules.find(m=>m.name===base.main_module);assert(main&&base.assets,'INVALID_WORKER_VERSION');
 const oldCode=Buffer.from(main.content_base64,'base64').toString('utf8');assert.equal(sha(Buffer.from(oldCode)),BASE_MAIN_SHA,'WORKER_MAIN_SHA_DRIFT');report.moduleHashes=hashes(base);
 const [settings,schedules,domains]=await Promise.all([api('/workers/scripts/'+WORKER+'/settings'),api('/workers/scripts/'+WORKER+'/schedules'),api('/workers/domains')]);
 assert.deepEqual(domains.filter(x=>x.service===WORKER).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'CUSTOM_DOMAIN_DRIFT');
 report.config={settings,schedules};
 const homepage=await get(ORIGIN,'/');assert.equal(homepage.status,200);assert.equal(homepage.sha,BASE_HTML_SHA,'HOMEPAGE_SOURCE_DRIFT');
 const html=patchHtml(homepage.body.toString()),newCode=patchWorker(oldCode);
 report.htmlSha=sha(Buffer.from(html));report.mainSha=sha(Buffer.from(newCode));report.oldHtmlSha=homepage.sha;report.scriptTagUnchanged=html.includes('atomic-v11-20261023');
 assert(report.scriptTagUnchanged,'OLD_UI_PATCH_WOULD_BE_LOST');
 assert(html.includes(NEW_HOME)&&html.includes(NEW_AWAY)&&!html.includes(OLD_HOME)&&!html.includes(OLD_AWAY));
 report.assets=await retained(ORIGIN);report.healthBefore=await health(ORIGIN);await writeFile('audit/candidate-runtime.mjs',newCode);
 const meta={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'BALL46_MATCH_COMPARISON_HOME_AWAY_20261023','workers/message':'Only shorten featured Match Comparison team labels to HOME and AWAY; PC+mobile; no data changes'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?newCode:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).id,BASE_VERSION,'ACTIVE_CHANGED_BEFORE_CANDIDATE_UPLOAD');
 report.candidate=(await api('/workers/scripts/'+WORKER+'/versions',form)).id;await save();
 const v=await version(report.candidate);assert.equal(v.annotations?.['workers/tag'],'BALL46_MATCH_COMPARISON_HOME_AWAY_20261023','CANDIDATE_TAG_MISSING');
 const expected=base.modules.map(m=>({name:m.name,type:m.content_type,sha:m.name===base.main_module?report.mainSha:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(hashes(v),expected,'OTHER_MODULES_CHANGED');
 for(const k of ['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(canonical(v[k]),canonical(base[k]),'CONFIG_CHANGED_'+k);
 report.preview='https://'+report.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
 for(const path of ['/','/index.html']){const r=await get(report.preview,path);assert.equal(r.status,200);assert.equal(r.sha,report.htmlSha,'PREVIEW_HTML_SHA_'+path);assert.equal(r.headers['x-ball46-comparison-labels'],'home-away-only-20261023');}
 await retained(report.preview,report.assets);report.healthPreview=await health(report.preview);
 assert.equal(canonical((await api('/workers/scripts/'+WORKER+'/settings'))),canonical(settings),'WORKER_SETTINGS_CHANGED');
 assert.equal((await active()).id,BASE_VERSION,'ISOLATED_CANDIDATE_CHANGED_ACTIVE');
 report.ok=true;report.trafficChanged=false;await save();
 console.log('B46_MATCH_LABEL_CANDIDATE='+JSON.stringify({ok:true,candidate:report.candidate,preview:report.preview,htmlSha:report.htmlSha,mainSha:report.mainSha,base:BASE_VERSION,assets:paths.length}));
}catch(e){report.error=e.stack||e.message;await save();console.error('B46_MATCH_LABEL_CANDIDATE_FAILED='+e.message);process.exitCode=1;}
