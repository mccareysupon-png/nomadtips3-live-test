import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {BASE_ID,BASE_MAIN_SHA,BASE_HTML_SHA,NEW_ICON_SHA,patchHtml,patchMain,sha} from './patch.mjs';
const SCRIPT='ball46-production',ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert.equal(ACCOUNT,'62cb0db544160e6591342abd6b4f35cc','WRONG_ACCOUNT_STOP');assert(TOKEN,'TOKEN_REQUIRED');
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT,ORIGIN='https://ball46.com';
const MARK='BALL46_FAVICON_SEO_20261023',REPORT={operation:MARK,startedAt:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,branch:process.env.GITHUB_REF_NAME,commit:process.env.GITHUB_SHA,scope:['/','/index.html','/favicon-192.png'],ok:false};
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
await mkdir('audit',{recursive:true});
const save=async()=>writeFile('audit/result.json',JSON.stringify(REPORT,null,2));
async function api(path,body){
 if(body)assert(['/workers/scripts/'+SCRIPT+'/versions','/workers/scripts/'+SCRIPT+'/deployments'].includes(path),'WRITE_NOT_ALLOWED');
 const r=await fetch(ROOT+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,'CLOUDFLARE_API_'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,300));return j.result;
}
async function active(){const ds=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments;assert(ds?.length,'NO_DEPLOYMENT');const a=ds[0];assert.equal(a.versions.length,1);assert.equal(a.versions[0].percentage,100);return {id:a.versions[0].version_id,deployment:a.id};}
const version=id=>api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
function modHash(v){return v.modules.map(m=>({name:m.name,type:m.content_type,sha:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));}
async function read(base,path){assert(/^https:\/\/(ball46\.com|www\.ball46\.com|[a-f0-9]{8}-ball46-production\.mccarey-supon\.workers\.dev)$/.test(base),'HOST_NOT_ALLOWED');
 const u=new URL(path,base);u.searchParams.set('faviconSeoDeployAudit',String(process.env.GITHUB_RUN_ID)+'-'+Date.now());
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)});
 const b=Buffer.from(await r.arrayBuffer());return {status:r.status,sha:sha(b),bytes:b,type:r.headers.get('content-type'),url:r.url};}
async function configuration(){const [settings,schedules,domains]=await Promise.all([api('/workers/scripts/'+SCRIPT+'/settings'),api('/workers/scripts/'+SCRIPT+'/schedules'),api('/workers/domains')]);const d=domains.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort();assert.deepEqual(d,['ball46.com','www.ball46.com']);return {settings,schedules,domains:d};}
async function health(base){const out=[];for(const p of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const r=await read(base,p);assert.equal(r.status,200,'HEALTH_HTTP:'+p);const j=JSON.parse(r.bytes.toString());assert.equal(j.ok,true,'HEALTH_NOT_OK:'+p);out.push({path:p,ok:j.ok,stale:j.stale,signals:j.signals?.length});}return out;}
const retained=['/robots.txt','/ball46-logo.svg','/dashboard-v2-stage3.js','/dashboard-v2-tune.css','/statistics.html','/signal.html','/settings.html'];
async function checkedFiles(base,snapshot){const out={};for(const path of retained){const r=await read(base,path);assert.equal(r.status,200,'RETAINED_STATUS:'+path);out[path]={status:r.status,sha:r.sha};if(snapshot)assert.equal(r.sha,snapshot[path].sha,'RETAINED_ASSET_DRIFT:'+path);}return out;}
function verifyHtml(r,expected){assert.equal(r.status,200,'HTML_HTTP');assert(r.type?.includes('text/html'),'HTML_MIME');assert.equal(r.sha,sha(Buffer.from(expected)),'HTML_BYTES_CHANGED');assert(r.bytes.toString().includes('Live Betting Tips'),'SEO_TITLE_MISSING');}
async function setTraffic(to,expected,message){assert.equal((await active()).id,expected,'ACTIVE_CHANGED_BEFORE_TRAFFIC_WRITE');const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':message}});return d.id;}
async function converge(target,expectedHtml,expectedIcon){let stable=0;const deadline=Date.now()+65000;while(Date.now()<deadline){assert.equal((await active()).id,target,'ACTIVE_CHANGED_DURING_CUTOVER');let passed=true;for(const host of ['https://ball46.com','https://www.ball46.com']){const [html,icon]=await Promise.all([read(host,'/'),read(host,'/favicon-192.png')]);if(html.sha!==sha(Buffer.from(expectedHtml))||html.status!==200||icon.sha!==expectedIcon||icon.status!==200)passed=false;}if(passed&&++stable>=2)return;stable=passed?stable:0;await new Promise(r=>setTimeout(r,1800));}throw Error('PUBLIC_CUTOVER_TIMEOUT');}
let activated=false,candidate,baselineHtml;
try{
 REPORT.before=await active();assert.equal(REPORT.before.id,BASE_ID,'ACTIVE_VERSION_CHANGED_ABORT');
 const base=await version(BASE_ID),m=base.modules.find(x=>x.name===base.main_module);assert(m,'NO_MAIN_MODULE');
 const raw=Buffer.from(m.content_base64,'base64').toString('utf8');
 assert.equal(sha(Buffer.from(raw)),BASE_MAIN_SHA,'MAIN_MODULE_CHANGED');
 REPORT.baseModuleHashes=modHash(base);REPORT.configuration=await configuration();
 const [home,ico]=await Promise.all([read(ORIGIN,'/'),read(ORIGIN,'/favicon-192.png')]);
 assert.equal(home.sha,BASE_HTML_SHA,'BASE_HTML_CHANGED');assert.equal(home.status,200);
 assert.equal(ico.sha,'686b2cec512ba60632818aabdbf7bb38e55876c169f8a27825dd3c97d615af16','OLD_FAVICON_CHANGED');
 const originalHtml=home.bytes.toString(),newHtml=patchHtml(originalHtml);baselineHtml=originalHtml;
 assert.notEqual(originalHtml,newHtml,'NO_SEO_CHANGE');assert.equal(newHtml.slice(newHtml.indexOf('</head>')),originalHtml.slice(originalHtml.indexOf('</head>')),'BODY_CHANGED');
 REPORT.htmlChange={before:sha(home.bytes),after:sha(Buffer.from(newHtml)),bodyUnchanged:true};
 REPORT.iconChange={before:ico.sha,after:NEW_ICON_SHA};
 REPORT.otherAssetsBefore=await checkedFiles(ORIGIN);
 REPORT.healthBefore=await health(ORIGIN);
 REPORT.configBefore=REPORT.configuration;
 const source=patchMain(raw);
 await writeFile('audit/candidate-runtime.mjs',source);
 const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':MARK,'workers/message':'Original BALL46 brand favicon PNG + Live Betting Tips SEO metadata; no UI/data/asset rewrite'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(REPORT.configuration.settings[k]!=null)metadata[k]=REPORT.configuration.settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const item of base.modules)form.set(item.name,new Blob([item.name===base.main_module?source:Buffer.from(item.content_base64,'base64')],{type:item.content_type}),item.name);
 assert.equal((await active()).id,BASE_ID,'ACTIVE_CHANGED_BEFORE_CANDIDATE');
 candidate=(await api('/workers/scripts/'+SCRIPT+'/versions',form)).id;REPORT.candidate=candidate;await save();
 const check=await version(candidate);assert.equal(check.annotations?.['workers/tag'],MARK,'WRONG_CANDIDATE_MARK');
 const expectedHashes=base.modules.map(x=>({name:x.name,type:x.content_type,sha:x.name===base.main_module?sha(Buffer.from(source)):sha(Buffer.from(x.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(modHash(check),expectedHashes,'CANDIDATE_MODULE_MISMATCH');
 for(const k of ['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(canonical(check[k]),canonical(base[k]),'CONFIG_DIFF:'+k);
 const preview='https://'+candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
 REPORT.preview=preview;
 const [ph,pi]=await Promise.all([read(preview,'/'),read(preview,'/favicon-192.png')]);
 verifyHtml(ph,newHtml);assert.equal(pi.status,200);assert.equal(pi.sha,NEW_ICON_SHA,'NEW_ICON_MISMATCH');
 await checkedFiles(preview,REPORT.otherAssetsBefore);REPORT.healthCandidate=await health(preview);
 assert.equal(canonical(await configuration()),canonical(REPORT.configuration),'CONFIGURATION_CHANGED');
 assert.equal((await active()).id,BASE_ID,'CANDIDATE_CHANGED_ACTIVE');
 REPORT.candidateVerified=true;await save();
 activated=true;REPORT.activationDeployment=await setTraffic(candidate,BASE_ID,'Approved: original BALL46 favicon and Live Betting Tips SEO; preserve all other modules/assets');
 await converge(candidate,newHtml,NEW_ICON_SHA);
 verifyHtml(await read(ORIGIN,'/index.html'),newHtml);
 await checkedFiles(ORIGIN,REPORT.otherAssetsBefore);REPORT.healthAfter=await health(ORIGIN);
 assert.equal(canonical(await configuration()),canonical(REPORT.configuration),'POSTDEPLOY_CONFIG_CHANGED');
 REPORT.activeAfter=await active();assert.equal(REPORT.activeAfter.id,candidate);
 REPORT.ok=true;REPORT.finishedAt=new Date().toISOString();
}catch(e){
 REPORT.error=e.message;REPORT.ok=false;
 if(activated&&candidate){try{if((await active()).id===candidate){REPORT.rollbackDeployment=await setTraffic(BASE_ID,candidate,'Automatic rollback after BALL46 favicon/SEO verification failure');await converge(BASE_ID,baselineHtml,'686b2cec512ba60632818aabdbf7bb38e55876c169f8a27825dd3c97d615af16');REPORT.rolledBack=true;}else REPORT.rollbackSkippedCurrentActive=await active();}catch(rollbackError){REPORT.rollbackError=rollbackError.message;}}
 console.error('DEPLOY_FAILED: '+e.message);process.exitCode=1;
}
await save();
console.log('BALL46_DEPLOY_RESULT='+JSON.stringify({ok:REPORT.ok,error:REPORT.error,candidate:REPORT.candidate,activeAfter:REPORT.activeAfter,rollback:REPORT.rolledBack,rollbackError:REPORT.rollbackError,htmlChange:REPORT.htmlChange,iconChange:REPORT.iconChange,phase:REPORT.candidateVerified?'tested candidate':'candidate not verified'}));
