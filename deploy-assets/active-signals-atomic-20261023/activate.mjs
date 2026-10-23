import assert from'node:assert/strict';
import {readFile,writeFile}from'node:fs/promises';
import{BASE_VERSION,BASE_HTML_SHA,BASE_JS_SHA,JS_ROUTE,sha}from'./patch.mjs';
const c=JSON.parse(await readFile('audit/candidate.json','utf8')),browser=JSON.parse(await readFile('audit/browser.json','utf8'));
assert(c.ok&&c.trafficChanged===false&&c.base===BASE_VERSION,'CANDIDATE_UNVERIFIED');
assert(browser.ok&&browser.cases?.length===4&&browser.cases.every(x=>x.pass)&&browser.preview===c.preview,'BROWSER_QA_UNVERIFIED');
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert.equal(account,'62cb0db544160e6591342abd6b4f35cc');assert(token);
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+account,hosts=['https://ball46.com','https://www.ball46.com'];
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,base:BASE_VERSION,candidate:c.candidate,checks:[],ok:false};
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+SCRIPT+'/deployments','UNEXPECTED_WRITE');const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)}),j=await r.json();assert(r.ok&&j.success===true,'CF:'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,220));return j.result;}
async function active(){const x=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments[0];assert(x?.versions?.length===1&&x.versions[0].percentage===100);return{id:x.versions[0].version_id,deployment:x.id};}
async function get(base,path){const u=new URL(path,base);u.searchParams.set('b46SignalCutover',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:sha(b),headers:Object.fromEntries(r.headers),bytes:b};}
async function verifyPublished(htmlExpected,jsExpected){for(const host of hosts){for(const p of ['/','/index.html',JS_ROUTE]){const r=await get(host,p),expected=p===JS_ROUTE?jsExpected:htmlExpected;assert.equal(r.status,200,'PUBLIC_HTTP_'+host+p);assert.equal(r.sha,expected,'PUBLIC_SHA_'+host+p);report.checks.push({host,path:p,status:200,sha:r.sha});}}}
async function verifyAssets(){for(const host of hosts){for(const [path,expected] of Object.entries(c.retained)){const r=await get(host,path);assert.equal(r.status,expected.status);assert.equal(r.sha,expected.sha,'RETAINED_ASSET_CHANGED_'+path);report.checks.push({host,path,status:200});}}}
async function health(){for(const host of hosts){for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(host,path);assert.equal(r.status,200);const j=JSON.parse(r.bytes);assert.equal(j.ok,true,'BACKEND_NOT_OK_'+path);report.checks.push({host,path,ok:true});}}}
async function traffic(to,expected,message){assert.equal((await active()).id,expected,'ACTIVE_CHANGED_BEFORE_WRITE');const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':message}});return d.id;}
async function converge(version,htmlExpected,jsExpected){const deadline=Date.now()+120000;let stable=0,observed=[];while(Date.now()<deadline){assert.equal((await active()).id,version,'CONCURRENT_WORKER_CUTOVER');let ok=true;for(const host of hosts){const [a,b]=await Promise.all([get(host,'/'),get(host,JS_ROUTE)]);if(![BASE_HTML_SHA,c.html.new].includes(a.sha)||![BASE_JS_SHA,c.js.new].includes(b.sha))throw Error('UNKNOWN_PUBLIC_CONTENT_'+host);if(a.sha!==htmlExpected||b.sha!==jsExpected)ok=false;observed.push({host,html:a.sha,js:b.sha,stable});}stable=ok?stable+1:0;if(stable>=2){report.propagation=observed.slice(-12);return;}await new Promise(r=>setTimeout(r,2500));}throw Error('PUBLIC_CUTOVER_TIMEOUT');}
let wroteTraffic=false;
try{
 assert.equal((await active()).id,BASE_VERSION,'NEW_DEPLOY_DETECTED_STOP');
 await verifyPublished(BASE_HTML_SHA,BASE_JS_SHA);await verifyAssets();await health();
 const j=await get(c.preview,JS_ROUTE),h=await get(c.preview,'/');
 assert.equal(j.sha,c.js.new);assert.equal(h.sha,c.html.new);
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 assert.equal(canonical(settings),canonical(c.config.settings),'SETTINGS_DRIFT');
 const domains=(await api('/workers/domains')).filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com']);
 report.before=await active();wroteTraffic=true;
 report.deployment=await traffic(c.candidate,BASE_VERSION,'Fix FEATURED MATCH ACTIVE SIGNALS old/new UI flicker; atomic V11 markup; preserve odds/signals');
 await converge(c.candidate,c.html.new,c.js.new);await verifyPublished(c.html.new,c.js.new);
 await verifyAssets();await health();
 assert.equal(canonical(await api('/workers/scripts/'+SCRIPT+'/settings')),canonical(c.config.settings),'SETTINGS_CHANGED_AFTER');
 report.after=await active();assert.equal(report.after.id,c.candidate);
 report.ok=true;
}catch(e){
 report.error=e.message;console.error('ACTIVE_SIGNALS_DEPLOY_FAILED='+e.message);
 if(wroteTraffic){try{const now=await active();if(now.id===c.candidate){report.rollbackDeployment=await traffic(BASE_VERSION,c.candidate,'Rollback ACTIVE SIGNALS on verification failure');await converge(BASE_VERSION,BASE_HTML_SHA,BASE_JS_SHA);await verifyPublished(BASE_HTML_SHA,BASE_JS_SHA);report.rolledBack=true;}else report.rollbackSkippedActive=now;}catch(err){report.rollbackError=err.message;}}
 process.exitCode=1;
}
report.finishedAt=new Date().toISOString();await writeFile('audit/activation.json',JSON.stringify(report,null,2));
console.log('BALL46_SIGNALS_ACTIVATION='+JSON.stringify({ok:report.ok,error:report.error,base:BASE_VERSION,candidate:c.candidate,after:report.after,deployment:report.deployment,rolledBack:report.rolledBack,rollbackError:report.rollbackError,checks:report.checks.length}));
