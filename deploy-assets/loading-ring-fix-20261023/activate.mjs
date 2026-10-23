import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {BASE_ID,BASE_HTML_SHA,BASE_ICON_SHA,BASE_MAIN_SHA,patchMain,sha} from './patch.mjs';
const candidate=JSON.parse(await readFile('audit/candidate.json','utf8'));
const browser=JSON.parse(await readFile('audit/browser.json','utf8'));
assert(candidate.ok&&candidate.trafficChanged===false&&candidate.base===BASE_ID,'INVALID_CANDIDATE');
assert(browser.ok&&browser.scenarios?.length===4&&browser.scenarios.every(x=>x.pass),'BROWSER_QA_NOT_PASSED');
assert.equal(browser.url,candidate.preview,'BROWSER_PREVIEW_DRIFT');
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN,worker='ball46-production';
assert.equal(acc,'62cb0db544160e6591342abd6b4f35cc');assert(tok);
const root='https://api.cloudflare.com/client/v4/accounts/'+acc,domains=['https://ball46.com','https://www.ball46.com'];
const report={at:new Date().toISOString(),worker,base:BASE_ID,candidate:candidate.candidate,run:process.env.GITHUB_RUN_ID,ok:false,uploadedModulesPreserved:true,assetChecks:[]};
async function api(path,body){if(body)assert.equal(path,'/workers/scripts/'+worker+'/deployments','DEPLOYMENTS_ONLY_WRITE');
 const r=await fetch(root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+tok,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success===true,'CLOUDFLARE_API:'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,250));return j.result;}
async function active(){const a=(await api('/workers/scripts/'+worker+'/deployments?per_page=1')).deployments[0];assert(a.versions?.length===1&&a.versions[0].percentage===100);return{id:a.versions[0].version_id,deployment:a.id};}
async function get(base,path){const u=new URL(path,base);u.searchParams.set('ringCutoverVerify',String(Date.now()));const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:sha(b),text:()=>b.toString()};}
async function verifyVersion(expectedSha){for(const domain of domains){for(const path of ['/','/index.html']){const r=await get(domain,path);assert.equal(r.status,200);assert.equal(r.sha,expectedSha,'LIVE_HTML_CHANGED:'+domain+path);}const f=await get(domain,'/favicon-192.png');assert.equal(f.status,200);assert.equal(f.sha,BASE_ICON_SHA,'FAVICON_CHANGED');}}
async function verifyFiles(){for(const domain of domains){for(const [path,baseline]of Object.entries(candidate.files)){const r=await get(domain,path);assert.equal(r.status,baseline.status);assert.equal(r.sha,baseline.sha,'ASSET_DRIFT:'+domain+path);report.assetChecks.push(domain+path);}}}
async function verifyHealth(){for(const domain of domains){for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await get(domain,path);assert.equal(r.status,200);const j=JSON.parse(r.text());assert.equal(j.ok,true,'HEALTH_ERROR:'+path);if(path==='/api/engine/board')assert.equal(j.stale,false,'BOARD_STALE');}}}
async function deploy(to,from,message){assert.equal((await active()).id,from,'ACTIVE_CHANGED_BEFORE_TRAFFIC');const d=await api('/workers/scripts/'+worker+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':message}});assert.equal((await active()).id,to,'CLOUDFLARE_ACTIVE_MISMATCH');return d.id;}
async function waitFor(target,shaTarget){let stable=0;const until=Date.now()+65000;while(Date.now()<until){assert.equal((await active()).id,target,'DIFFERENT_ACTIVE_VERSION');let good=true;for(const domain of domains){const [h,icon]=await Promise.all([get(domain,'/'),get(domain,'/favicon-192.png')]);if(h.status!==200||h.sha!==shaTarget||icon.status!==200||icon.sha!==BASE_ICON_SHA)good=false;}if(good&&++stable>=2)return; if(!good)stable=0;await new Promise(r=>setTimeout(r,2100));}throw Error('PUBLIC_CUTOVER_TIMEOUT');}
let activated=false;
try{
 assert.equal((await active()).id,BASE_ID,'NEWER_PRODUCTION_DEPLOYMENT_ABORT');
 await verifyVersion(BASE_HTML_SHA);await verifyFiles();await verifyHealth();
 const baseline=await api('/workers/workers/'+worker+'/versions/'+BASE_ID+'?include=modules');
 const main=baseline.modules.find(m=>m.name===baseline.main_module);
 assert(main);const old=Buffer.from(main.content_base64,'base64').toString();assert.equal(sha(Buffer.from(old)),BASE_MAIN_SHA);
 const expected=patchMain(old),newModuleSha=sha(Buffer.from(expected));
 const candidateVersion=await api('/workers/workers/'+worker+'/versions/'+candidate.candidate+'?include=modules');
 assert.equal(candidateVersion.annotations?.['workers/tag'],'BALL46_LOADING_RING_20261023');
 const newMain=candidateVersion.modules.find(m=>m.name===candidateVersion.main_module);
 assert.equal(sha(Buffer.from(newMain.content_base64,'base64')),newModuleSha);
 assert.deepEqual(baseline.modules.filter(m=>m.name!==baseline.main_module).map(m=>[m.name,sha(Buffer.from(m.content_base64,'base64'))]),candidateVersion.modules.filter(m=>m.name!==candidateVersion.main_module).map(m=>[m.name,sha(Buffer.from(m.content_base64,'base64'))]));
 // Browser QA was executed against this exact candidate; candidate root must remain valid.
 const prev=await get(candidate.preview,'/');assert.equal(prev.sha,candidate.html.after,'PREVIEW_CHANGED');
 report.before=await active();
 activated=true;
 report.activationDeployment=await deploy(candidate.candidate,BASE_ID,'Fix loading ring on other devices: CSS normal/reduced motion only; preserve site');
 await waitFor(candidate.candidate,candidate.html.after);await verifyVersion(candidate.html.after);await verifyFiles();await verifyHealth();
 report.after=await active();report.ok=true;
}catch(e){
 report.error=e.message;console.error('RING_ACTIVATION_ERROR:'+e.message);
 if(activated){try{const a=await active();if(a.id===candidate.candidate){report.rollbackDeployment=await deploy(BASE_ID,candidate.candidate,'Auto rollback: loading animation post-deploy validation failed');await waitFor(BASE_ID,BASE_HTML_SHA);await verifyVersion(BASE_HTML_SHA);report.rolledBack=true;}else{report.rollbackSkippedBecauseNewerActive=a;}}catch(rollback){report.rollbackError=rollback.message;}}
 process.exitCode=1;
}
report.finishedAt=new Date().toISOString();
await writeFile('audit/activation.json',JSON.stringify(report,null,2));
console.log('BALL46_RING_ACTIVATION='+JSON.stringify({ok:report.ok,error:report.error,active:report.after,candidate:report.candidate,rolledBack:report.rolledBack,rollbackError:report.rollbackError,assetsChecked:report.assetChecks.length}));
