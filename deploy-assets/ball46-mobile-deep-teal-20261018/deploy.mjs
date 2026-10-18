import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {completeAssetUpload,createPayload,candidateModules} from '../member-orange-only-20261015/assets.mjs';

const ROOT='deploy-assets/ball46-mobile-deep-teal-20261018';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID, TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT='ball46-production', ORIGIN='https://ball46.com';
const ACCOUNT_EXPECTED='62cb0db544160e6591342abd6b4f35cc';
const EXPECTED_ACTIVE='c5094977-5f2c-4e4a-bb47-2196cfad4104';
const EXPECTED_INDEX_SHA='ae5cd8de0a39f59af5671150e63ca82541667e4a288fcad79fc66884628cc0e4';
const MARK='BALL46_MOBILE_DEEP_TEAL_20261018_OWNER_APPROVED';
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v,(key,x)=>key==='annotations'?undefined:x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const filesDir=join(ROOT,'audit'),preview=id=>'https://'+id.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
mkdirSync(filesDir,{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'BALL46 main mobile only',mark:MARK,sourceSha256:'acf14036a459dbd39f0d088f45471eedba598b955de16d9fe8a388f46b4a429c',phase:'PRECHECK',activated:false};
const save=()=>writeFileSync(join(filesDir,'result.json'),JSON.stringify(report,null,2));
function apiUrl(path){return 'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path;}
async function cf(path,body=null) {
 const method=body?'POST':'GET';
 const response=await fetch(apiUrl(path),{method,headers:{Authorization:'Bearer '+TOKEN,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const json=await response.json();
 assert(response.ok&&json.success===true,'CLOUDFLARE_'+method+'_'+response.status+':'+JSON.stringify(json.errors||[]).slice(0,500));
 return json.result;
}
async function active(){
 const d=(await cf('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments?.[0];
 assert(d?.versions?.length===1&&d.versions[0].percentage===100,'ACTIVE_NOT_SINGLE_VERSION');
 return {id:d.versions[0].version_id,deployment:d.id};
}
const version=id=>cf('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
async function config(){
 const settings=await cf('/workers/scripts/'+SCRIPT+'/settings'),schedules=await cf('/workers/scripts/'+SCRIPT+'/schedules');
 const domains=(await cf('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'PRODUCTION_DOMAIN_MISMATCH');
 return {settings,schedules,domains};
}
async function bytes(origin,path){
 const url=new URL(path,origin);url.searchParams.set('_b46deepteal',Date.now()+'-'+Math.random().toString(16).slice(2));
 const response=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)});
 const body=Buffer.from(await response.arrayBuffer());
 return {path,status:response.status,bytes:body,sha:hash(body),type:response.headers.get('content-type')||''};
}
async function allAssets(host,paths){
 const result=new Map();
 for(let i=0;i<paths.length;i+=5){
  for(const item of await Promise.all(paths.slice(i,i+5).map(p=>bytes(host,'/'+p)))) {
   assert.equal(item.status,200,'ASSET_NOT_200:'+item.path+':'+item.status);
   assert(item.bytes.length>0,'ASSET_EMPTY:'+item.path);
   result.set(item.path,item);
  }
 }
 return result;
}
async function health(host){
 const paths=['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1'];
 const out=[];
 for(const path of paths){
  const response=await bytes(host,path);assert.equal(response.status,200,'API_HTTP:'+path+':'+response.status);
  const j=JSON.parse(response.bytes.toString('utf8'));assert.equal(j.ok,true,'API_NOT_OK:'+path);
  if(path==='/api/engine/board')assert(Array.isArray(j.fixtures),'LIVE_BOARD_SCHEMA_CHANGED');
  if(path.includes('/statistics'))assert(Array.isArray(j.rows),'STATISTICS_SCHEMA_CHANGED');
  out.push({path,ok:j.ok,version:j.version,rows:j.rows?.length,fixtures:j.fixtures?.length,status:j.status});
 }
 return out;
}
async function ui(host,stage){
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true});
 const screenshots=[];
 try{
  for(const width of [320,360,390,430,760,761,1280]){
   const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(host+'/?_b46nav='+Date.now(),{waitUntil:'domcontentloaded',timeout:50000});
   await page.locator('body').waitFor({timeout:20000});
   if(width<=760){
    await page.locator('#b46m-teal-shell').waitFor({state:'visible',timeout:20000});
    assert.equal(await page.locator('html').getAttribute('data-b46m-teal'),'1','MOBILE_MODE_NOT_ACTIVE');
    assert.equal(await page.locator('.left-rail').isVisible(),false,'OLD_MOBILE_HORIZONTAL_MENU_STILL_VISIBLE');
    const open=page.locator('[data-b46m-open]');
    await open.click();assert.equal(await open.getAttribute('aria-expanded'),'true','DRAWER_NOT_OPEN');
    assert.equal(await page.locator('#b46m-drawer').getAttribute('aria-hidden'),'false','DRAWER_ARIA');
    if(width===390){let shot=join(filesDir,stage+'-mobile-menu-390.png');await page.screenshot({path:shot});screenshots.push(shot);}
    await page.locator('[data-b46m-status="live"]').click();
    assert.equal(await open.getAttribute('aria-expanded'),'false','DRAWER_NOT_CLOSED');
    assert(await page.locator('[data-status-filter="live"]').count()>0,'ORIGINAL_STATUS_MISSING');
    await page.locator('[data-b46m-searchbutton]').click();
    assert.equal(await page.locator('[data-b46m-searchpanel]').getAttribute('data-open'),'true','SEARCH_PANEL_HIDDEN');
    await page.locator('[data-b46m-searchinput]').fill('Arsenal');
    assert.equal(await page.locator('[data-search]').inputValue(),'Arsenal','SEARCH_NOT_DELEGATED');
    await open.click();await page.keyboard.press('Escape');
    assert.equal(await open.getAttribute('aria-expanded'),'false','ESC_FAILED');
    if(width===390){let shot=join(filesDir,stage+'-mobile-390.png');await page.screenshot({path:shot});screenshots.push(shot);}
   } else {
    assert.equal(await page.locator('#b46m-teal-shell').isVisible(),false,'DESKTOP_CHANGED');
    assert.equal(await page.locator('.left-rail').isVisible(),true,'DESKTOP_NAV_HIDDEN');
    if(width===1280){let shot=join(filesDir,stage+'-desktop-1280.png');await page.screenshot({path:shot});screenshots.push(shot);}
   }
   assert(errors.every(x=>!x.includes('b46m')),'DEEP_TEAL_JS_ERROR:'+errors.join('; ').slice(0,300));
   await page.close();
  }
 }finally{await browser.close();}
 return screenshots;
}
async function deploy(to,expected,label){
 assert.equal((await active()).id,expected,'ACTIVE_DRIFT_BEFORE_DEPLOY');
 const deployment=await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':label}});
 assert.equal((await active()).id,to,'DEPLOYED_VERSION_NOT_ACTIVE');
 return deployment.id;
}
async function waitPublicIndex(expectedSha,timeoutMs=90000){
 const start=Date.now();let consecutive=0;
 while(Date.now()-start<timeoutMs){
  const current=await bytes(ORIGIN,'/index.html');
  const main=await bytes(ORIGIN,'/');
  consecutive=current.status===200&&main.status===200&&current.sha===expectedSha&&main.sha===expectedSha?consecutive+1:0;
  if(consecutive>=2)return;
  await new Promise(r=>setTimeout(r,2200));
 }
 throw new Error('PRODUCTION_PUBLIC_CUTOVER_NOT_VISIBLE');
}
let candidate=null, original=null, activated=false;
try{
 assert(ACCOUNT&&TOKEN,'CLOUDFLARE_CREDENTIALS_MISSING');
 assert.equal(ACCOUNT,ACCOUNT_EXPECTED,'WRONG_ACCOUNT');
 const sourceB64=readFileSync(join(ROOT,'source.br.b64'),'utf8').trim();
 const source=Buffer.from(sourceB64,'base64');
 assert.equal(hash(source),report.sourceSha256,'SOURCE_PACKAGE_CORRUPT');
 const decoded=(await import('node:zlib')).brotliDecompressSync(source);
 const packagePath=join(ROOT,'source.tar');writeFileSync(packagePath,decoded);
 const unpack=spawnSync('tar',['-xf',packagePath,'-C',ROOT],{encoding:'utf8'});
 assert.equal(unpack.status,0,'TAR_UNPACK_FAILED:'+unpack.stderr);
 for(const p of ['mobile-navigation.css','mobile-navigation.js','apply_patch.py'])assert(readFileSync(join(ROOT,p)).length>0,'PATCH_SOURCE_MISSING:'+p);
 const jsCheck=spawnSync('node',['--check',join(ROOT,'mobile-navigation.js')],{encoding:'utf8'});
 assert.equal(jsCheck.status,0,'MOBILE_JS_SYNTAX:'+jsCheck.stderr);

 original=await active();
 assert.equal(original.id,EXPECTED_ACTIVE,'ACTIVE_VERSION_CHANGED_SINCE_READ_ONLY_AUDIT');
 const base=await version(original.id);const previousConfig=await config();
 const main=base.modules.find(m=>m.name===base.main_module);
 const indexModule=base.modules.find(m=>m.name==='assets/index.html');
 assert(main&&indexModule,'ACTIVE_VERSION_MODULE_MISSING');
 const old=Buffer.from(indexModule.content_base64,'base64');
 assert.equal(hash(old),EXPECTED_INDEX_SHA,'CURRENT_INDEX_CHANGED');
 const originalIndex=old.toString('utf8');
 const inventory=JSON.parse(readFileSync('deploy-assets/member-orange-only-20261015/provenance.json','utf8')).paths;
 assert.equal(new Set(inventory).size,inventory.length,'DUPLICATE_ASSETS');
 const extra='ball46-footer.css',paths=[...inventory,extra];
 const referred=[...originalIndex.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
  .map(m=>new URL(m[1].replaceAll('&amp;','&'),ORIGIN))
  .filter(u=>u.origin===ORIGIN).map(u=>u.pathname.slice(1));
 const unknown=[...new Set(referred.filter(p=>!paths.includes(p)))];
 assert.deepEqual(unknown,['color-semantics-stat-entry-20261011.js'],'UNKNOWN_REFERENCES_CHANGED');
 const missing=await bytes(ORIGIN,'/color-semantics-stat-entry-20261011.js');
 assert.equal(missing.status,404,'KNOWN_MISSING_JS_BECAME_ACTIVE');
 const baseFiles=await allAssets(ORIGIN,paths);
 const sourceIndex=baseFiles.get('index.html');
 assert.equal(sourceIndex.sha,EXPECTED_INDEX_SHA,'PRODUCTION_PUBLIC_NOT_ACTIVE');
 const footer=baseFiles.get(extra);assert(footer.type.includes('text/css'),'FOOTER_IS_NOT_CSS');
 const assetView=await allAssets(preview(original.id),paths);
 for(const [p,f] of baseFiles)assert.equal(assetView.get(p).sha,f.sha,'ACTIVE_PREVIEW_ASSET_DRIFT:'+p);
 const before=await health(ORIGIN);
 report.phase='BASE_VALIDATED';
 report.preflight={activeVersion:original.id,deployment:original.deployment,indexSha:sourceIndex.sha,mainSha:hash(Buffer.from(main.content_base64,'base64')),files:paths.length,extraAsset:extra,bindings:base.bindings.map(x=>({type:x.type,name:x.name})),domains:previousConfig.domains,health:before};save();

 const originalPath=join(ROOT,'active-index.html'),candidatePath=join(ROOT,'candidate-index.html');
 writeFileSync(originalPath,old);
 const patched=spawnSync('python3',[join(ROOT,'apply_patch.py'),originalPath,candidatePath],{encoding:'utf8'});
 assert.equal(patched.status,0,'PATCH_FAILED:'+patched.stderr);
 const html=readFileSync(candidatePath,'utf8');
 assert(html.includes('b46-mobile-deep-teal-20261018')&&html.includes('b46-mobile-deep-teal-runtime-20261018'),'PATCH_MARKERS_MISSING');
 const uploadedFiles=new Map([...baseFiles].map(([p,file])=>[p,{bytes:p==='index.html'?Buffer.from(html):file.bytes,type:file.type}]));
 assert.equal(uploadedFiles.size,paths.length,'NEW_ASSET_SET_INCOMPLETE');
 report.change={path:'index.html',before:hash(old),after:hash(Buffer.from(html)),unchangedAssets:paths.length-1};
 save();

 assert.equal((await active()).id,original.id,'ACTIVE_CHANGED_DURING_ASSET_READ');
 const uploaded=await completeAssetUpload({account:ACCOUNT,script:SCRIPT,files:uploadedFiles,expectedPaths:paths,api:cf});
 report.upload={files:uploaded.fileCount,completionToken:!!uploaded.jwt,uploadedHashes:uploaded.uploadedHashCount};
 assert.equal((await active()).id,original.id,'UPLOAD_ALTERED_ACTIVE');
 const payload=createPayload(base,html,uploaded.jwt,MARK);
 payload.annotations['workers/message']='BALL46 main mobile Deep Teal only; unchanged live engine and all other assets';
 candidate=(await cf('/workers/workers/'+SCRIPT+'/versions?deploy=false',payload)).id;
 assert(candidate&&candidate!==original.id,'CANDIDATE_INVALID');
 const cv=await version(candidate);
 assert.equal(cv.annotations?.['workers/tag'],MARK,'CANDIDATE_NOT_OWNED');
 const hashes=v=>v.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]).sort(([a],[b])=>a.localeCompare(b));
 assert.deepEqual(hashes(cv),hashes({modules:candidateModules(base,html)}),'CANDIDATE_MODULES_CHANGED');
 assert.equal(canonical(cv.bindings),canonical(base.bindings),'CANDIDATE_BINDINGS_CHANGED');
 assert.equal(canonical(cv.assets?.config),canonical(base.assets?.config),'CANDIDATE_ASSET_CONFIG_CHANGED');
 assert.equal(cv.compatibility_date,base.compatibility_date,'COMPATIBILITY_DATE_CHANGED');
 const candidateHost=preview(candidate);
 const previewFiles=await allAssets(candidateHost,paths);
 for(const [p,f] of uploadedFiles)assert.equal(previewFiles.get(p).sha,hash(f.bytes),'CANDIDATE_ASSET_DRIFT:'+p);
 report.candidate={id:candidate,url:candidateHost,health:await health(candidateHost)};
 report.phase='CANDIDATE_VERIFIED';save();
 report.candidate.screenshots=await ui(candidateHost,'candidate');
 assert.equal(canonical(await config()),canonical(previousConfig),'DEPLOY_CONFIGURATION_CHANGED_BEFORE_ACTIVATION');
 assert.equal((await active()).id,original.id,'CANDIDATE_ALTERED_ACTIVE');
 report.phase='UI_VERIFIED';save();
 console.log('BALL46 CANDIDATE OK',JSON.stringify({version:candidate,assetCount:paths.length,index:report.change.after,screenshots:report.candidate.screenshots}));
 report.activationDeployment=await deploy(candidate,original.id,'BALL46 main mobile Deep Teal owner approved');
 activated=true;report.activated=true;report.phase='ACTIVATED';save();
 await waitPublicIndex(report.change.after);
 report.productionScreenshots=await ui(ORIGIN,'production');
 report.postHealth=await health(ORIGIN);
 assert.equal(canonical(await config()),canonical(previousConfig),'PRODUCTION_CONFIGURATION_CHANGED');
 assert.equal((await active()).id,candidate,'ACTIVE_CHANGED_AFTER_ACTIVATION');
 report.phase='SUCCESS';report.ok=true;report.finishedAt=new Date().toISOString();save();
 console.log('BALL46 DEEP TEAL DEPLOY SUCCESS',JSON.stringify({activeVersion:candidate,previousVersion:original.id,deployment:report.activationDeployment}));
}catch(error){
 report.error=String(error?.stack||error);
 console.error('BALL46 DEPLOY BLOCKED:',String(error?.message||error));
 if(activated&&original?.id){
  try {
   report.rollbackDeployment=await deploy(original.id,candidate,'ROLLBACK BALL46 Deep Teal on postdeploy failure');
   await waitPublicIndex(EXPECTED_INDEX_SHA,90000);
   report.phase='ROLLED_BACK';report.activated=false;
  }catch(rollbackError){report.rollbackError=String(rollbackError?.stack||rollbackError);report.phase='ROLLBACK_FAILED';}
 } else report.phase='BLOCKED_BEFORE_PRODUCTION_ACTIVATION';
 report.ok=false;report.finishedAt=new Date().toISOString();save();
 process.exitCode=1;
}
