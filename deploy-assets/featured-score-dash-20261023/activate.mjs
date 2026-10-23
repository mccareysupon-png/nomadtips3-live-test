import assert from'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{BASE,HTML_SHA,JS_SHA,JS_PATH,sha}from'./patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8')),qa=JSON.parse(await readFile('audit/browser.json','utf8'));
assert(c.ok&&!c.trafficChanged&&c.base===BASE,'UNVERIFIED_CANDIDATE');
assert(qa.ok&&qa.preview===c.preview&&qa.tests.length===4&&qa.tests.every(x=>x.pass),'BROWSER_QA_FAILED');
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,WORKER='ball46-production';assert.equal(ACCOUNT,'62cb0db544160e6591342abd6b4f35cc');assert(TOKEN);
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT,hosts=['https://ball46.com','https://www.ball46.com'];
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const out={at:new Date().toISOString(),candidate:c.candidate,baseline:BASE,checks:[],ok:false};
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+WORKER+'/deployments','WRITES_ONLY_DEPLOYMENTS');const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success===true,'CLOUDFLARE_API_'+r.status);return j.result;}
async function active(){const d=(await api('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];assert(d?.versions?.length===1&&d.versions[0].percentage===100);return{id:d.versions[0].version_id,deployment:d.id};}
async function get(host,path){const u=new URL(path,host);u.searchParams.set('scoreCutover',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:sha(b),body:b};}
async function htmlJs(expectedHTML,expectedJS){for(const host of hosts)for(const [path,hash]of [['/',expectedHTML],['/index.html',expectedHTML],[JS_PATH,expectedJS]]){const r=await get(host,path);assert.equal(r.status,200,'HTTP_'+host+path);assert.equal(r.sha,hash,'LIVE_SHA_MISMATCH_'+host+path);out.checks.push({host,path,sha:r.sha});}}
async function assets(){for(const host of hosts)for(const [path,value]of Object.entries(c.assets)){const r=await get(host,path);assert.equal(r.status,value.status,'ASSET_STATUS_'+path);assert.equal(r.sha,value.sha,'OTHER_ASSET_CHANGED_'+path);out.checks.push({host,path,sha:r.sha});}}
async function health(){for(const host of hosts)for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(host,path);assert.equal(r.status,200);assert.equal(JSON.parse(r.body.toString()).ok,true,'API_HEALTH_'+path);out.checks.push({host,path,ok:true});}}
async function traffic(to,from,message){assert.equal((await active()).id,from,'ACTIVE_CHANGED_ABORT');return(await api('/workers/scripts/'+WORKER+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':message}})).id;}
async function converge(version,html,js){const deadline=Date.now()+110000;let stable=0;while(Date.now()<deadline){assert.equal((await active()).id,version,'PARALLEL_DEPLOY_DETECTED');let all=true;for(const host of hosts){const [h,j]=await Promise.all([get(host,'/'),get(host,JS_PATH)]);assert([HTML_SHA,c.htmlSha].includes(h.sha),'UNKNOWN_PUBLIC_HTML');assert([JS_SHA,c.jsSha].includes(j.sha),'UNKNOWN_PUBLIC_JS');if(h.status!==200||j.status!==200||h.sha!==html||j.sha!==js)all=false;}stable=all?stable+1:0;if(stable>=2)return;await new Promise(r=>setTimeout(r,2100));}throw Error('CUTOVER_PROPAGATION_TIMEOUT');}
let attempted=false;
try{
 assert.equal((await active()).id,BASE,'PRODUCTION_ALREADY_CHANGED');
 await htmlJs(HTML_SHA,JS_SHA);await assets();await health();
 const [ph,pj]=await Promise.all([get(c.preview,'/'),get(c.preview,JS_PATH)]);assert.equal(ph.sha,c.htmlSha);assert.equal(pj.sha,c.jsSha);
 assert.equal(canonical(await api('/workers/scripts/'+WORKER+'/settings')),canonical(c.config.settings),'SETTINGS_CHANGED');
 assert.deepEqual((await api('/workers/domains')).filter(x=>x.service===WORKER).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com']);
 out.before=await active();attempted=true;
 out.deployment=await traffic(c.candidate,BASE,'BALL46 featured signal center score dash only: 1–0 to 1-0; no other UI/data edits');
 await converge(c.candidate,c.htmlSha,c.jsSha);await htmlJs(c.htmlSha,c.jsSha);await assets();await health();
 assert.equal(canonical(await api('/workers/scripts/'+WORKER+'/settings')),canonical(c.config.settings),'CONFIG_CHANGED_AFTER_CUTOVER');
 out.after=await active();assert.equal(out.after.id,c.candidate);out.ok=true;
}catch(e){
 out.error=e.message;console.error('B46_SCORE_DEPLOY_FAILED='+e.message);
 if(attempted){try{const a=await active();if(a.id===c.candidate){out.rollbackDeployment=await traffic(BASE,c.candidate,'Auto rollback failed FEATURED center score dash validation');await converge(BASE,HTML_SHA,JS_SHA);await htmlJs(HTML_SHA,JS_SHA);out.rolledBack=true;}else out.rollbackSkippedNewerActive=a;}catch(err){out.rollbackError=err.message;}}
 process.exitCode=1;
}
out.completedAt=new Date().toISOString();await writeFile('audit/activation.json',JSON.stringify(out,null,2));
console.log('B46_SCORE_ACTIVATION='+JSON.stringify({ok:out.ok,error:out.error,candidate:c.candidate,active:out.after,deployment:out.deployment,checks:out.checks.length,rolledBack:out.rolledBack,rollbackError:out.rollbackError}));
