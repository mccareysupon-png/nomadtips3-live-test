import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {BASE_ID,BASE_MAIN_SHA,BASE_HTML_SHA,BASE_ICON_SHA,patchHtml,patchMain,sha} from './patch.mjs';
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN,worker='ball46-production';
assert.equal(acc,'62cb0db544160e6591342abd6b4f35cc','WRONG_ACCOUNT');assert(tok);
const root='https://api.cloudflare.com/client/v4/accounts/'+acc,origin='https://ball46.com';
const canon=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+worker+'/versions','CANDIDATE_ONLY_WRITE');
const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+tok},body,signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_HTTP_'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,300));return j.result;}
async function active(){const x=(await api('/workers/scripts/'+worker+'/deployments?per_page=1')).deployments[0];assert(x.versions.length===1&&x.versions[0].percentage===100);return{id:x.versions[0].version_id,deployment:x.id};}
async function version(id){for(let i=0;i<4;i++){try{return await api('/workers/workers/'+worker+'/versions/'+id+'?include=modules')}catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,900*(i+1)))}}}
async function get(url,path){const u=new URL(path,url);u.searchParams.set('loadingRingAudit',String(Date.now()));const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:sha(b),type:r.headers.get('content-type'),text:()=>b.toString()};}
const fixed=['/robots.txt','/favicon.ico','/favicon-192.png','/ball46-logo.svg','/dashboard-v2-stage3.js','/dashboard-v2-tune.css','/statistics.html','/signal.html','/settings.html'];
async function assets(url,expected){const o={};for(const p of fixed){const r=await get(url,p);assert.equal(r.status,200,'ASSET_HTTP_'+p);o[p]={sha:r.sha,status:r.status};if(expected)assert.equal(r.sha,expected[p].sha,'ASSET_CHANGED_'+p)}return o;}
async function health(url){let out=[];for(const p of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(url,p);assert.equal(r.status,200,'API_HTTP_'+p);let j=JSON.parse(r.text());assert.equal(j.ok,true,'API_HEALTH_'+p);out.push({path:p,ok:j.ok,stale:j.stale});}return out;}
const hashes=v=>v.modules.map(m=>({name:m.name,sha:sha(Buffer.from(m.content_base64,'base64')),type:m.content_type})).sort((a,b)=>a.name.localeCompare(b.name));
const proof={time:new Date().toISOString(),workflow:process.env.GITHUB_RUN_ID,branch:process.env.GITHUB_REF_NAME,commit:process.env.GITHUB_SHA,base:BASE_ID,ok:false};
await mkdir('audit',{recursive:true});
const save=async()=>writeFile('audit/candidate.json',JSON.stringify(proof,null,2));
try{
 proof.before=await active();assert.equal(proof.before.id,BASE_ID,'ACTIVE_CHANGED_STOP');
 const base=await version(BASE_ID);const mm=base.modules.find(m=>m.name===base.main_module);assert(mm);const source=Buffer.from(mm.content_base64,'base64').toString();
 assert.equal(sha(Buffer.from(source)),BASE_MAIN_SHA,'SOURCE_DRIFT');
 proof.baseHashes=hashes(base);
 const [settings,schedules,domains]=await Promise.all([api('/workers/scripts/'+worker+'/settings'),api('/workers/scripts/'+worker+'/schedules'),api('/workers/domains')]);
 assert.deepEqual(domains.filter(x=>x.service===worker).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'DOMAIN_CHANGED');
 proof.settings=settings;proof.schedules=schedules;
 const beforeHtml=await get(origin,'/');assert.equal(beforeHtml.status,200);assert.equal(beforeHtml.sha,BASE_HTML_SHA,'HTML_DRIFT');
 const beforeText=beforeHtml.text(),afterText=patchHtml(beforeText);
 proof.html={before:beforeHtml.sha,after:sha(Buffer.from(afterText)),bodyUnchanged:afterText.split('</head>')[1]===beforeText.split('</head>')[1]};
 assert(proof.html.bodyUnchanged);
 proof.files=await assets(origin);assert.equal(proof.files['/favicon-192.png'].sha,BASE_ICON_SHA,'FAVICON_CHANGED');
 proof.healthBefore=await health(origin);
 const newSource=patchMain(source);
 await writeFile('audit/candidate-runtime.mjs',newSource);
 const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'BALL46_LOADING_RING_20261023','workers/message':'Fix loading ring CSS reduced motion: original 2.8s, reduced 6s; no other UI or API edits'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?newSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).id,BASE_ID,'ACTIVE_CHANGED_BEFORE_CANDIDATE');
 proof.candidate=(await api('/workers/scripts/'+worker+'/versions',form)).id;await save();
 const check=await version(proof.candidate);assert.equal(check.annotations?.['workers/tag'],'BALL46_LOADING_RING_20261023');
 const expectedHashes=base.modules.map(m=>({name:m.name,sha:m.name===base.main_module?sha(Buffer.from(newSource)):sha(Buffer.from(m.content_base64,'base64')),type:m.content_type})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(hashes(check),expectedHashes,'WORKER_MODULE_DRIFT');
 for(const k of ['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(canon(check[k]),canon(base[k]),'CONFIG_DRIFT_'+k);
 const preview='https://'+proof.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';proof.preview=preview;
 for(const p of ['/','/index.html']){const r=await get(preview,p);assert.equal(r.status,200,'PREVIEW_HTTP_'+p);assert.equal(r.sha,proof.html.after,'PREVIEW_HTML_SHA_'+p);assert(r.text().includes('6s linear infinite'),'NEW_ANIMATION_MISSING');}
 await assets(preview,proof.files);proof.healthPreview=await health(preview);
 assert.equal(canon((await api('/workers/scripts/'+worker+'/settings'))),canon(settings),'SETTINGS_CHANGED');
 assert.equal((await active()).id,BASE_ID,'CANDIDATE_MUST_NOT_ACTIVATE');
 proof.ok=true;proof.trafficChanged=false;await save();console.log('BALL46_CANDIDATE_PASS='+JSON.stringify({ok:true,candidate:proof.candidate,preview,html:proof.html,active:BASE_ID}));
}catch(e){proof.error=e.message;await save();console.error('BALL46_CANDIDATE_FAIL='+e.message);process.exitCode=1}
