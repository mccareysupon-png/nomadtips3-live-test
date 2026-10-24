import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{spawnSync}from'node:child_process';
import{WORKER,JS_PATH,HTML_PATH,VERSION_SUFFIX,patchJs,patchHtml,patchWorker,sha}from'./patch.mjs';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
const root='https://api.cloudflare.com/client/v4/accounts/'+A,store='deploy-assets/corner-entry-20261024/audit';
await mkdir(store,{recursive:true});const out={at:new Date().toISOString(),ok:false,enabled:false};
async function cf(p,form){
 if(form!==undefined)assert.equal(p,'/workers/scripts/'+WORKER+'/versions','ONLY_CANDIDATE_VERSION_WRITE');
 const r=await fetch(root+p,{method:form?'POST':'GET',headers:{authorization:'Bearer '+T},body:form,signal:AbortSignal.timeout(80000)}),j=await r.json();
 if(!r.ok||!j.success)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors).slice(0,260));return j.result;
}
async function active(){const d=(await cf('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];
 assert(d.versions.length===1&&d.versions[0].percentage===100,'MIXED_TRAFFIC_ABORT');
 return{version:d.versions[0].version_id,deployment:d.id};}
async function get(host,p){const u=new URL(p,host);u.searchParams.set('b46CornerEntryAudit',Date.now());
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(55000)}),b=Buffer.from(await r.arrayBuffer());
 return{status:r.status,type:r.headers.get('content-type'),body:b,sha:sha(b)};}
const runtime={...out};
try{
 const b=await active();out.before=b;
 const v=await cf('/workers/workers/'+WORKER+'/versions/'+b.version+'?include=modules');
 const settings=await cf('/workers/scripts/'+WORKER+'/settings');
 assert(v.main_module&&v.modules?.length>=1&&v.assets,'ACTIVE_WORKER_METADATA_MISSING');
 const main=v.modules.find(x=>x.name===v.main_module);assert(main?.content_base64);
 const source=Buffer.from(main.content_base64,'base64').toString();
 const [j,h]=await Promise.all([get('https://ball46.com',JS_PATH),get('https://ball46.com',HTML_PATH)]);
 assert.equal(j.status,200);assert.equal(h.status,200);
 assert(j.type.includes('javascript'));assert(h.type.includes('html'));
 const nextJs=patchJs(j.body.toString()),tag=patchHtml(h.body.toString());
 const nextSource=patchWorker(source,sha(Buffer.from(source)),tag);
 out.oldSourceSha=sha(Buffer.from(source));out.newSourceSha=sha(Buffer.from(nextSource));
 out.oldJsSha=j.sha;out.newJsSha=sha(Buffer.from(nextJs));
 out.oldHtmlSha=h.sha;out.newHtmlSha=sha(Buffer.from(tag.html));
 out.oldVersion=b.version;
 out.originalSettings=settings;
 out.expectedOtherModules=v.modules.filter(x=>x.name!==v.main_module).map(x=>({name:x.name,sha:sha(Buffer.from(x.content_base64,'base64'))}));
 await writeFile(store+'/wrapped-main.mjs',nextSource);
 let check=spawnSync('node',['--check',store+'/wrapped-main.mjs'],{encoding:'utf8'});
 assert.equal(check.status,0,'WRAPPER_SYNTAX_FAILED_'+check.stderr?.slice(0,300));
 // Keep ALL existing bindings, assets, compatibility and module bytes intact.
 const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],
  bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},
  annotations:{'workers/tag':'BALL46_CORNER_ENTRY_20261024','workers/message':'UI only: show immutable entryCorners for corner markets in Featured ACTIVE SIGNALS'}};
 for(const k of['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?nextSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).version,b.version,'CONCURRENT_PRODUCTION_DEPLOY_ABORT');
 const candidate=(await cf('/workers/scripts/'+WORKER+'/versions',form)).id;out.candidate=candidate;
 out.preview='https://'+candidate.slice(0,8)+'-'+WORKER+'.mccarey-supon.workers.dev';
 const cv=await cf('/workers/workers/'+WORKER+'/versions/'+candidate+'?include=modules');
 assert.equal(cv.modules.length,v.modules.length,'CANDIDATE_MODULE_COUNT_DRIFT');
 assert.equal(sha(Buffer.from(cv.modules.find(x=>x.name===v.main_module).content_base64,'base64')),out.newSourceSha,'CANDIDATE_MAIN_DRIFT');
 for(const old of out.expectedOtherModules)assert.equal(sha(Buffer.from(cv.modules.find(x=>x.name===old.name).content_base64,'base64')),old.sha,'UNRELATED_MODULE_CHANGED_'+old.name);
 for(const name of['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(JSON.stringify(cv[name]),JSON.stringify(v[name]),'CANDIDATE_CONFIG_CHANGED_'+name);
 const [pvJs,pvHtml]=await Promise.all([get(out.preview,JS_PATH),get(out.preview,HTML_PATH)]);
 assert.equal(pvJs.status,200);assert.equal(pvHtml.status,200);
 assert.equal(pvJs.sha,out.newJsSha,'CANDIDATE_JS_NOT_EXPECTED');
 assert.equal(pvHtml.sha,out.newHtmlSha,'CANDIDATE_HTML_NOT_EXPECTED');
 assert(pvJs.body.includes(Buffer.from('entryCornerScore')),'CORNER_ENTRY_MISSING_ON_PREVIEW');
 assert(pvHtml.body.includes(Buffer.from(VERSION_SUFFIX)),'HTML_CACHING_TAG_MISSING');
 for(const p of['/statistics.html','/signal.html','/signal-next.js','/favicon.ico']){
  const [old,newOne]=await Promise.all([get('https://ball46.com',p),get(out.preview,p)]);
  assert.equal(old.status,newOne.status,'UNRELATED_HTTP_'+p);assert.equal(old.sha,newOne.sha,'UNRELATED_RESPONSE_CHANGED_'+p);
 }
 assert.equal((await active()).version,b.version,'CANDIDATE_ACTIVATED_UNEXPECTEDLY');
 out.ok=true;out.trafficChanged=false;
 console.log('B46_CORNER_CANDIDATE='+JSON.stringify({ok:true,oldVersion:b.version,candidate,preview:out.preview,modules:cv.modules.length,jsSha:out.newJsSha,htmlSha:out.newHtmlSha,trafficChanged:false}));
}catch(e){out.error=String(e.stack||e);console.error('B46_CORNER_CANDIDATE_FAIL='+String(e.message||e));process.exitCode=1;}
await writeFile(store+'/candidate.json',JSON.stringify(out,null,2));