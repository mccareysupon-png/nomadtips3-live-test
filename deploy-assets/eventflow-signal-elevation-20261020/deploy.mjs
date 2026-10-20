import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {inject,MARKER,STYLE} from './theme.mjs';

// Immutable live-production baseline. Abort if any other writer has changed it.
const SCRIPT='ball46-production',BASELINE='ba937a65-f132-40bd-89a7-816ffd6f4d18';
const ORIGIN='https://ball46.com',ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'CF_CREDENTIALS_MISSING');
const API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const h=b=>createHash('sha256').update(b).digest('hex');
const paths=['/','/index.html','/app.css','/dashboard-v2-tune.css','/singlepage-workspace-343.js','/expanded-match-343.js'];
const report={scope:'Only SVG EVENT FLOW SIGNAL rectangle visual; no data, app logic, engine, other assets or mobile card changes',
  expectedBaseline:BASELINE,job:process.env.GITHUB_RUN_ID,sourceCommit:process.env.GITHUB_SHA,
  startedAt:new Date().toISOString(),writes:[],success:false};
mkdirSync('audit',{recursive:true});const save=()=>writeFileSync('audit/deploy-report.json',JSON.stringify(report,null,2));
async function cf(route,body){
 const res=await fetch(API+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+TOKEN,accept:'application/json',...((body&&!(body instanceof FormData))?{'Content-Type':'application/json'}:{})},
  body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
 const data=await res.json();
 assert(res.ok&&data.success===true,'CF_API_FAILURE '+res.status+' '+JSON.stringify(data.errors||[]));
 return data.result;
}
async function active(){
 const x=await cf('/workers/scripts/'+SCRIPT+'/deployments?per_page=1');const d=x.deployments?.[0];
 assert(d&&d.versions?.length===1&&Number(d.versions[0].percentage)===100,'NOT_SINGLE_100_PERCENT_ACTIVE');
 return {version:d.versions[0].version_id,deployment:d.id};
}
const version=async id=>{
 const x=await cf('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
 assert(Array.isArray(x.modules)&&x.main_module&&x.modules.length>0,'WORKER_MODULES_UNAVAILABLE');
 return x;
};
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function read(origin,path){
 const url=new URL(path,origin);url.searchParams.set('_b46_annotation_audit',process.env.GITHUB_RUN_ID+'-'+Date.now());
 const res=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
 const buf=Buffer.from(await res.arrayBuffer());
 assert.equal(res.status,200,'PUBLIC_ASSET_NOT_200 '+path+' '+res.status);
 return {body:buf,hash:h(buf),bytes:buf.length};
}
async function assets(origin){const x={};for(const path of paths)x[path]=await read(origin,path);return x;}
const assetHashes=a=>Object.fromEntries(Object.entries(a).map(([p,v])=>[p,{sha256:v.hash,bytes:v.bytes}]));
async function health(origin){
 const x={};
 for(const p of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){
  const r=await read(origin,p),data=JSON.parse(r.body.toString());
  assert.equal(data.ok,true,'ENGINE_UNHEALTHY '+p);x[p]={ok:true,stale:data.stale};
 }
 return x;
}
async function visual(browser,url,width,theme,shot){
 const page=await browser.newPage();try{
  await page.setViewport({width,height:860,isMobile:width<=767,deviceScaleFactor:1});
  await page.setCacheEnabled(false);
  await page.goto(url+'/?b46_card_depth_qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await new Promise(r=>setTimeout(r,2200));
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  const result=await page.evaluate(()=>{
   const body=document.body;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 350 110');svg.setAttribute('width','350');svg.setAttribute('height','110');
   svg.classList.add('expand-flow-chart');
   svg.innerHTML='<g class="b46-eventflow-signal-entry b46-eventflow-signal-annotation"><rect x="12" y="14" width="310" height="72" rx="7" stroke="#0acb7c" stroke-width="1.2" fill="#071b16" fill-opacity=".93"/><text x="28" y="38" fill="#61f2b3">SIGNAL 15&#39;</text><text x="28" y="62" fill="#d9f8ea">CORNERS - OVER 10.5 · @1.95</text></g>';
   body.append(svg);
   const rect=svg.querySelector('rect'),cs=getComputedStyle(rect);
   const value={marker:!!document.getElementById('b46-eventflow-signal-soft-elevation-20261020'),
     stroke:cs.stroke,strokeWidth:cs.strokeWidth,fill:cs.fill,filter:cs.filter,
     shadow:cs.filter.includes('drop-shadow'),siteExists:!!document.querySelector('.workspace.singlepage'),
     signalMinute:svg.querySelector('text')?.textContent};
   svg.remove();return value;
  });
  await page.screenshot({path:'audit/'+shot+'.png',fullPage:false});
  return result;
 }finally{await page.close();}
}
let candidate=null,activated=false;
try{
 report.activeBefore=await active();
 assert.equal(report.activeBefore.version,BASELINE,'LIVE_WORKER_VERSION_DRIFT_STOP');
 const domains=await cf('/workers/domains');
 assert.deepEqual(domains.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'DOMAIN_TARGET_DRIFT');
 const settings=await cf('/workers/scripts/'+SCRIPT+'/settings'),schedules=await cf('/workers/scripts/'+SCRIPT+'/schedules');
 const settingsHash=h(canonical(settings)),schedulesHash=h(canonical(schedules));
 const baseline=await version(BASELINE);report.modulesBefore=baseline.modules.map(m=>({name:m.name,hash:h(Buffer.from(m.content_base64,'base64'))}));
 const index=baseline.modules.find(m=>m.name==='assets/index.html'),main=baseline.modules.find(m=>m.name===baseline.main_module);
 assert(index&&main,'LIVE_INDEX_OR_MAIN_MODULE_NOT_FOUND');
 const indexText=Buffer.from(index.content_base64,'base64').toString('utf8');
 assert(indexText.includes('</head>')&&!indexText.includes(MARKER),'BASE_INDEX_INVALID_OR_ALREADY_PATCHED');
 const modifiedIndex=indexText.replace('</head>',STYLE+'</head>');
 // The immutable injected CSS must match the separately reviewed theme exactly.
 const publicBefore=await assets(ORIGIN),liveHtml=publicBefore['/'].body.toString();
 assert.equal(publicBefore['/'].hash,publicBefore['/index.html'].hash,'ROOT_INDEX_HTML_DIFFER');
 const expected=inject(liveHtml);
 assert(expected.includes(MARKER),'STYLE_NOT_IN_EXPECTED_HTML');
 report.beforeAssets=assetHashes(publicBefore);report.healthBefore=await health(ORIGIN);
 report.newIndexHash=h(Buffer.from(modifiedIndex));
 report.baseMainHash=h(Buffer.from(main.content_base64,'base64'));save();
 const metadata={main_module:baseline.main_module,compatibility_date:baseline.compatibility_date,
  compatibility_flags:baseline.compatibility_flags||[],bindings:baseline.bindings,keep_assets:true,
  assets:{config:baseline.assets.config},
  annotations:{'workers/tag':'B46_EVENTFLOW_SIGNAL_BORDERLESS_ELEVATION_20261020',
    'workers/message':'Only SVG Event Flow SIGNAL annotation rect visual; pinned active Worker modules, rollback on mismatch'}};
 for(const key of ['usage_model','logpush','limits','observability','placement'])if(settings[key]!=null)metadata[key]=settings[key];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of baseline.modules){
  const bytes=m.name===index.name?Buffer.from(modifiedIndex):Buffer.from(m.content_base64,'base64');
  form.set(m.name,new Blob([bytes],{type:m.content_type}),m.name);
 }
 assert.equal((await active()).version,BASELINE,'LIVE_VERSION_CHANGED_BEFORE_CANDIDATE');
 candidate=(await cf('/workers/scripts/'+SCRIPT+'/versions',form)).id;
 report.candidate=candidate;report.writes.push({type:'candidate-only',id:candidate});save();
 const staged=await version(candidate);
 assert.equal(staged.annotations?.['workers/tag'],'B46_EVENTFLOW_SIGNAL_BORDERLESS_ELEVATION_20261020','CANDIDATE_TAG_MISSING');
 for(const m of report.modulesBefore){
  const now=staged.modules.find(x=>x.name===m.name);assert(now,'CANDIDATE_MODULE_MISSING '+m.name);
  assert.equal(h(Buffer.from(now.content_base64,'base64')),m.name===index.name?report.newIndexHash:m.hash,'CANDIDATE_UNEXPECTED_MODULE_CHANGE '+m.name);
 }
 const preview='https://'+candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
 const previewAssets=await assets(preview);
 for(const p of paths)assert.equal(previewAssets[p].hash,
  ['/','/index.html'].includes(p)?h(Buffer.from(expected)):publicBefore[p].hash,
  'PREVIEW_ASSET_HASH_MISMATCH '+p);
 report.previewAssets=assetHashes(previewAssets);report.healthPreview=await health(preview);
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
 assert(chrome,'BROWSER_UNAVAILABLE');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try{
  report.previewScreenshots={};
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const key=width+'-'+theme;
   const observed=await visual(browser,preview,width,theme,'preview-'+key);
   assert(observed.marker&&observed.stroke==='none'&&Number.parseFloat(observed.strokeWidth)===0&&observed.shadow,
     'SVG_BORDER_OR_ELEVATION_WRONG '+key+' '+JSON.stringify(observed));
   assert(observed.siteExists,'WORKSPACE_NOT_RENDERED '+key);
   report.previewScreenshots[key]=observed;
  }
 }finally{await browser.close();}
 report.candidateVerified=true;save();
 assert.equal((await active()).version,BASELINE,'LIVE_VERSION_CHANGED_BEFORE_DEPLOY_ABORT');
 assert.equal(h(canonical(await cf('/workers/scripts/'+SCRIPT+'/settings'))),settingsHash,'WORKER_SETTINGS_DRIFT');
 assert.equal(h(canonical(await cf('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesHash,'WORKER_SCHEDULES_DRIFT');
 await cf('/workers/scripts/'+SCRIPT+'/deployments',{
  strategy:'percentage',versions:[{version_id:candidate,percentage:100}],
  annotations:{'workers/message':'Verified Event Flow Signal SVG rect borderless soft elevation; all other modules unchanged'}});
 activated=true;report.writes.push({type:'activate',id:candidate});save();
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 let visible=false;
 for(let i=0;i<12;i++){
  const a=await read(ORIGIN,'/');
  if(a.hash===h(Buffer.from(expected))){visible=true;break;}
  assert.equal(a.hash,publicBefore['/'].hash,'UNKNOWN_PUBLIC_HTML_CONTENT_AFTER_SWITCH');
  await sleep(1800);
 }
 assert(visible,'UPDATED_HTML_NOT_PUBLIC');
 const after=await assets(ORIGIN);
 for(const p of paths)assert.equal(after[p].hash,
  ['/','/index.html'].includes(p)?h(Buffer.from(expected)):publicBefore[p].hash,
  'POST_DEPLOY_ASSET_MISMATCH '+p);
 report.afterAssets=assetHashes(after);report.healthAfter=await health(ORIGIN);
 assert.equal((await active()).version,candidate,'ACTIVE_MOVED_AFTER_DEPLOY');
 assert.equal(h(canonical(await cf('/workers/scripts/'+SCRIPT+'/settings'))),settingsHash,'SETTINGS_CHANGED_AFTER_DEPLOY');
 assert.equal(h(canonical(await cf('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesHash,'SCHEDULES_CHANGED_AFTER_DEPLOY');
 report.success=true;report.finishedAt=new Date().toISOString();save();console.log('BALL46_EVENTFLOW_SIGNAL_ELEVATION_DEPLOY_SUCCESS',candidate);
}catch(error){
 report.error=error.stack||String(error);report.finishedAt=new Date().toISOString();
 if(activated&&candidate){try{
  if((await active()).version===candidate){
   await cf('/workers/scripts/'+SCRIPT+'/deployments',{
    strategy:'percentage',versions:[{version_id:BASELINE,percentage:100}],
    annotations:{'workers/message':'Auto rollback after Signal elevation verification failure'}});
   report.writes.push({type:'rollback',to:BASELINE});report.rolledBack=(await active()).version===BASELINE;
  }
 }catch(rollbackError){report.rollbackError=String(rollbackError);}}
 save();console.error('BALL46_EVENTFLOW_SIGNAL_ELEVATION_DEPLOY_STOP',report.error);process.exitCode=1;
}
