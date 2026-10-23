import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{spawnSync}from'node:child_process';
import{WORKER,BASE,JS_PATH,HTML_PATH,patchJs,patchHtml,patchWorker,sha}from'./patch.mjs';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
const root='https://api.cloudflare.com/client/v4/accounts/'+A,origin='https://ball46.com',path='deploy-assets/signal-repair-20261023/audit';
await mkdir(path,{recursive:true});
const out={at:new Date().toISOString(),ok:false,worker:WORKER,base:BASE};
async function api(p,form){if(form!==undefined)assert.equal(p,'/workers/scripts/'+WORKER+'/versions','CANDIDATE_ONLY_WRITE');
 const r=await fetch(root+p,{method:form?'POST':'GET',headers:{authorization:'Bearer '+T},body:form,signal:AbortSignal.timeout(90000)}),j=await r.json();
 if(!r.ok||!j.success)throw Error('CLOUDFLARE_'+r.status+JSON.stringify(j.errors).slice(0,260));return j.result}
async function active(){const d=(await api('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{id:d.versions[0].version_id,deployment:d.id};}
async function get(host,p){const u=new URL(p,host);u.searchParams.set('signalFixCandidate',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,type:r.headers.get('content-type'),body:b,sha:sha(b),headers:Object.fromEntries(r.headers)};}
try{
 const a=await active();assert.equal(a.id,BASE,'PRODUCTION_CHANGED_ABORT');out.before=a;
 const b=await api('/workers/workers/'+WORKER+'/versions/'+BASE+'?include=modules');assert(b.main_module&&b.assets&&b.modules.length>0);
 const settings=await api('/workers/scripts/'+WORKER+'/settings'),domains=await api('/workers/domains');
 assert.deepEqual(domains.filter(x=>x.service===WORKER).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com']);
 const mod=b.modules.find(m=>m.name===b.main_module),source=Buffer.from(mod.content_base64,'base64').toString();
 const [j,h]=await Promise.all([get(origin,JS_PATH),get(origin,HTML_PATH)]);
 assert.equal(j.status,200);assert.equal(h.status,200);out.jsOriginalSha=j.sha;out.htmlOriginalSha=h.sha;
 const js=patchJs(j.body.toString()),pHtml=patchHtml(h.body.toString());
 const newSource=patchWorker(source,sha(Buffer.from(source)),pHtml.oldTag,pHtml.newTag);
 out.originalMainSha=sha(Buffer.from(source));out.newMainSha=sha(Buffer.from(newSource));out.newJsSha=sha(Buffer.from(js));out.newHtmlSha=sha(Buffer.from(pHtml.html));
 await writeFile(path+'/new-main.mjs',newSource);
 const check=spawnSync('node',['--check',path+'/new-main.mjs'],{encoding:'utf8'});assert.equal(check.status,0,'NEW_MAIN_INVALID_'+check.stderr.slice(0,260));
 const metadata={main_module:b.main_module,compatibility_date:b.compatibility_date,compatibility_flags:b.compatibility_flags||[],bindings:b.bindings,keep_assets:true,assets:{config:b.assets.config},annotations:{'workers/tag':'BALL46_SIGNAL_STANDALONE_REPAIR_20261023','workers/message':'Fix standalone SIGNAL page fetch only; preserve all current engine/assets/data'}};
 for(const k of['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of b.modules)form.set(m.name,new Blob([m.name===b.main_module?newSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).id,BASE,'PRODUCTION_CHANGED_BEFORE_CANDIDATE');
 const cv=(await api('/workers/scripts/'+WORKER+'/versions',form)).id;out.candidate=cv;out.preview='https://'+cv.slice(0,8)+'-'+WORKER+'.mccarey-supon.workers.dev';
 const v=await api('/workers/workers/'+WORKER+'/versions/'+cv+'?include=modules');
 assert.equal(v.annotations?.['workers/tag'],'BALL46_SIGNAL_STANDALONE_REPAIR_20261023');
 assert.equal(v.modules.length,b.modules.length);
 for(const m of b.modules)assert.equal(sha(Buffer.from(v.modules.find(x=>x.name===m.name).content_base64,'base64')),m.name===b.main_module?out.newMainSha:sha(Buffer.from(m.content_base64,'base64')),'MODULE_CHANGED_'+m.name);
 for(const key of ['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(JSON.stringify(v[key]),JSON.stringify(b[key]),'CONFIG_DRIFT_'+key);
 const [jh,hh]=await Promise.all([get(out.preview,JS_PATH),get(out.preview,HTML_PATH)]);
 assert.equal(jh.status,200);assert.equal(hh.status,200);
 assert.equal(jh.sha,out.newJsSha,'PREVIEW_JS_MISMATCH');
 assert.equal(hh.sha,out.newHtmlSha,'PREVIEW_HTML_MISMATCH');
 assert.equal(jh.headers['x-ball46-signal-repair'],'standalone-fetch-20261023');
 const baselineAssets={};
 for(const p of ['/', '/statistics.html','/signal.js','/dashboard-v2-stage3.js','/favicon-192.png']){
   const [r1,r2]=await Promise.all([get(origin,p),get(out.preview,p)]);
   assert.equal(r1.status,200,'BASE_ASSET_'+p);assert.equal(r2.status,200,'CANDIDATE_ASSET_'+p);assert.equal(r1.sha,r2.sha,'UNRELATED_ASSET_CHANGED_'+p);baselineAssets[p]=r1.sha;
 }
 out.assets=baselineAssets;out.originalVersionSettings=settings;
 assert.equal((await active()).id,BASE,'PRODUCTION_CHANGED_BY_CANDIDATE');
 out.ok=true;out.trafficChanged=false;
 console.log('B46_SIGNAL_CANDIDATE='+JSON.stringify({ok:true,base:BASE,candidate:cv,preview:out.preview,newJsSha:out.newJsSha,newHtmlSha:out.newHtmlSha,assets:Object.keys(baselineAssets).length,trafficChanged:false}));
}catch(e){out.error=String(e.stack||e);console.error('B46_SIGNAL_CANDIDATE_FAILED='+String(e.message||e));process.exitCode=1}
await writeFile(path+'/candidate.json',JSON.stringify(out,null,2));
