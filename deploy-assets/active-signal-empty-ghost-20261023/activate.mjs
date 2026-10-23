import assert from'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{BASE,HTML_SHA,JS_SHA,JS_PATH,sha}from'./patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8')),qa=JSON.parse(await readFile('audit/browser.json','utf8'));
assert(c.ok&&!c.trafficChanged&&c.base===BASE,'CANDIDATE_FAILED');
assert(qa.ok&&qa.cases.length===4&&qa.cases.every(x=>x.pass)&&qa.preview===c.preview,'BROWSER_TEST_NOT_PASSED');
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,WORKER='ball46-production';
assert.equal(ACCOUNT,'62cb0db544160e6591342abd6b4f35cc');assert(TOKEN);
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT,hosts=['https://ball46.com','https://www.ball46.com'];
const canon=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,base:BASE,candidate:c.candidate,ok:false,checks:[]};
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+WORKER+'/deployments','WRITE_RESTRICTED');const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_ERROR_'+r.status);return j.result;}
async function active(){const x=(await api('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];assert(x?.versions?.length===1&&x.versions[0].percentage===100);return{id:x.versions[0].version_id,deployment:x.id};}
async function get(host,path){const u=new URL(path,host);u.searchParams.set('ghostCutoverAudit',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:sha(b),body:b};}
async function verifyPages(expectedHTML,expectedJS){for(const host of hosts)for(const [path,expected]of [['/',expectedHTML],['/index.html',expectedHTML],[JS_PATH,expectedJS]]){const r=await get(host,path);assert.equal(r.status,200,'HTTP_'+host+path);assert.equal(r.sha,expected,'HTML_OR_JS_DRIFT_'+host+path);report.checks.push({host,path,sha:r.sha});}}
async function verifyAssets(){for(const host of hosts)for(const [path,ref]of Object.entries(c.assets)){const r=await get(host,path);assert.equal(r.status,ref.status,'RETAINED_HTTP_'+path);assert.equal(r.sha,ref.sha,'RETAINED_ASSET_CHANGED_'+path);report.checks.push({host,path,sha:r.sha});}}
async function health(){for(const host of hosts)for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(host,path);assert.equal(r.status,200);assert.equal(JSON.parse(r.body.toString()).ok,true,'API_FAILURE_'+path);report.checks.push({host,path,ok:true});}}
async function shift(to,expected,message){assert.equal((await active()).id,expected,'NEWER_DEPLOYMENT_ABSENT_GUARD');const d=await api('/workers/scripts/'+WORKER+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':message}});return d.id;}
async function converge(expectedVersion,html,js){let success=0;const deadline=Date.now()+120000;while(Date.now()<deadline){assert.equal((await active()).id,expectedVersion,'CONCURRENT_DEPLOYMENT_STOP');let okay=true;for(const host of hosts){const [a,b]=await Promise.all([get(host,'/'),get(host,JS_PATH)]);assert([HTML_SHA,c.htmlSha].includes(a.sha),'UNKNOWN_LIVE_HTML');assert([JS_SHA,c.jsSha].includes(b.sha),'UNKNOWN_LIVE_JS');if(a.status!==200||b.status!==200||a.sha!==html||b.sha!==js)okay=false;}success=okay?success+1:0;if(success>=2)return;await new Promise(r=>setTimeout(r,2200));}throw Error('PUBLIC_CUTOVER_TIMEOUT');}
let tried=false;
try{
 assert.equal((await active()).id,BASE,'PRODUCTION_MOVED_STOP');
 await verifyPages(HTML_SHA,JS_SHA);await verifyAssets();await health();
 const p=await get(c.preview,'/'),j=await get(c.preview,JS_PATH);assert.equal(p.sha,c.htmlSha);assert.equal(j.sha,c.jsSha);
 assert.equal(canon((await api('/workers/scripts/'+WORKER+'/settings'))),canon(c.config.settings),'SETTINGS_CHANGED');
 const d=(await api('/workers/domains')).filter(x=>x.service===WORKER).map(x=>x.hostname).sort();assert.deepEqual(d,['ball46.com','www.ball46.com']);
 report.before=await active();tried=true;
 report.deployment=await shift(c.candidate,BASE,'BALL46 ACTIVE SIGNALS fix stale No active signal text orphan; keep live signal cards unchanged');
 await converge(c.candidate,c.htmlSha,c.jsSha);await verifyPages(c.htmlSha,c.jsSha);await verifyAssets();await health();
 assert.equal(canon((await api('/workers/scripts/'+WORKER+'/settings'))),canon(c.config.settings),'SETTINGS_CHANGED_AFTER');
 report.after=await active();assert.equal(report.after.id,c.candidate);report.ok=true;
}catch(e){
 report.error=e.message;console.error('B46_GHOST_DEPLOY_FAILED='+e.message);
 if(tried){try{const a=await active();if(a.id===c.candidate){report.rollbackDeployment=await shift(BASE,c.candidate,'Automatic rollback empty signal ghost fix failed');await converge(BASE,HTML_SHA,JS_SHA);await verifyPages(HTML_SHA,JS_SHA);report.rolledBack=true;}else report.rollbackSkippedActive=a;}catch(err){report.rollbackError=err.message;}}
 process.exitCode=1;
}
report.finishedAt=new Date().toISOString();await writeFile('audit/activate.json',JSON.stringify(report,null,2));
console.log('B46_GHOST_ACTIVATION='+JSON.stringify({ok:report.ok,error:report.error,after:report.after,candidate:c.candidate,deployment:report.deployment,checks:report.checks.length,rolledBack:report.rolledBack,rollbackError:report.rollbackError}));
