import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {BASE_VERSION,BASE_HTML_SHA,sha} from './patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8')),qa=JSON.parse(await readFile('audit/browser.json','utf8'));
assert(c.ok&&c.trafficChanged===false&&c.base===BASE_VERSION,'UNVERIFIED_CANDIDATE');
assert(qa.ok&&qa.tests?.length===4&&qa.tests.every(x=>x.pass),'BROWSER_QA_NOT_PASSED');
const worker='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.equal(account,'62cb0db544160e6591342abd6b4f35cc');assert(token);
const root='https://api.cloudflare.com/client/v4/accounts/'+account,hosts=['https://ball46.com','https://www.ball46.com'];
const report={at:new Date().toISOString(),base:BASE_VERSION,candidate:c.candidate,checks:[],ok:false};
const canon=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+worker+'/deployments','WRITES_ONLY_DEPLOYMENT');const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success===true,'CLOUDFLARE_API_'+r.status);return j.result;}
async function active(){const d=(await api('/workers/scripts/'+worker+'/deployments?per_page=1')).deployments[0];assert(d?.versions?.length===1&&d.versions[0].percentage===100);return{id:d.versions[0].version_id,deployment:d.id};}
async function get(host,path){const u=new URL(path,host);u.searchParams.set('comparisonCutoverCheck',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{sha:sha(b),status:r.status,bytes:b,headers:Object.fromEntries(r.headers)};}
async function pages(expected){for(const host of hosts)for(const path of ['/','/index.html']){const r=await get(host,path);assert.equal(r.status,200,'HTML_HTTP_'+host+path);assert.equal(r.sha,expected,'HTML_SHA_'+host+path);report.checks.push({host,path,sha:r.sha});}}
async function assets(){for(const host of hosts)for(const [path,value]of Object.entries(c.assets)){const r=await get(host,path);assert.equal(r.status,value.status,'ASSET_HTTP_'+path);assert.equal(r.sha,value.sha,'ASSET_SHA_'+path);report.checks.push({host,path,sha:r.sha});}}
async function health(){for(const host of hosts)for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(host,path);assert.equal(r.status,200);assert.equal(JSON.parse(r.bytes.toString()).ok,true,'BACKEND_HEALTH_'+path);report.checks.push({host,path,ok:true});}}
async function shift(to,expected,message){assert.equal((await active()).id,expected,'ACTIVE_CHANGED_BEFORE_TRAFFIC');const d=await api('/workers/scripts/'+worker+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':message}});return d.id;}
async function converge(version,expected){const deadline=Date.now()+120000;let stable=0,observations=[];while(Date.now()<deadline){assert.equal((await active()).id,version,'ANOTHER_DEPLOY_DURING_CUTOVER');let all=true;for(const host of hosts){const r=await get(host,'/');if(![BASE_HTML_SHA,c.htmlSha].includes(r.sha))throw Error('UNKNOWN_HTML_VERSION_'+host);observations.push({host,sha:r.sha});if(r.status!==200||r.sha!==expected)all=false;}stable=all?stable+1:0;if(stable>=2){report.propagation=observations.slice(-10);return;}await new Promise(r=>setTimeout(r,2400));}throw Error('PUBLIC_PROPAGATION_TIMEOUT');}
let attempted=false;
try{
 assert.equal((await active()).id,BASE_VERSION,'STALE_PRODUCTION_BASE');
 await pages(BASE_HTML_SHA);await assets();await health();
 const p=await get(c.preview,'/');assert.equal(p.sha,c.htmlSha,'PREVIEW_CONTENT_MOVED');
 assert.equal(canon((await api('/workers/scripts/'+worker+'/settings'))),canon(c.config.settings),'SETTINGS_CHANGED');
 const domains=(await api('/workers/domains')).filter(x=>x.service===worker).map(x=>x.hostname).sort();assert.deepEqual(domains,['ball46.com','www.ball46.com']);
 report.before=await active();attempted=true;
 report.deployment=await shift(c.candidate,BASE_VERSION,'BALL46 Featured MATCH COMPARISON labels HOME AWAY only desktop/mobile');
 await converge(c.candidate,c.htmlSha);await pages(c.htmlSha);await assets();await health();
 assert.equal(canon((await api('/workers/scripts/'+worker+'/settings'))),canon(c.config.settings),'POST_SETTINGS_CHANGE');
 report.activeAfter=await active();assert.equal(report.activeAfter.id,c.candidate);
 report.ok=true;
}catch(e){
 report.error=e.message;console.error('B46_COMPARE_CUTOVER_FAILURE='+e.message);
 if(attempted){try{const x=await active();if(x.id===c.candidate){report.rollback=await shift(BASE_VERSION,c.candidate,'Automatic rollback MATCH COMPARISON validation failed');await converge(BASE_VERSION,BASE_HTML_SHA);await pages(BASE_HTML_SHA);report.rolledBack=true;}else report.rollbackSkippedActive=x;}catch(err){report.rollbackError=err.message;}}
 process.exitCode=1;
}
report.finishedAt=new Date().toISOString();await writeFile('audit/activation.json',JSON.stringify(report,null,2));
console.log('B46_COMPARE_ACTIVATION='+JSON.stringify({ok:report.ok,error:report.error,candidate:c.candidate,activeAfter:report.activeAfter,deployment:report.deployment,rolledBack:report.rolledBack,rollbackError:report.rollbackError,checks:report.checks.length}));
