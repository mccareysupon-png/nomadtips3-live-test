import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verifySplash} from './verify-splash.mjs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-graphite-loading-production-deploy';
const SCOPED='ball46-member/member-loading-20261020';
const OLD_VERSION='6fdd5ca6-3855-4110-9a28-c2bb887f04d8';
// The immutable active Cloudflare version ID above protects the exact Worker module bytes.
const OLD_CSS_SHA='bcff14935bd652d70209fb7996fd7034ad3009d109eae8e1f89a0e9002520f40';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER GRAPHITE NOIR LOADING DATA SPLASH',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'05c276f7f76a6226b10b45bd85ac369e53167d2f',target:W};
mkdirSync(AUDIT,{recursive:true});
const save=()=>writeFileSync(AUDIT+'/deployment-report.json',JSON.stringify(report,null,2));
const cf=async(path,body,options={})=>{
 const method=body===undefined?'GET':'POST';
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method,headers:{Authorization:'Bearer '+T,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(85000),...options});
 const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{throw Error('CF_NON_JSON:'+r.status+':'+txt.slice(0,300))}
 assert(r.ok&&j.success===true,'CF_'+method+'_'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,700));return j.result;
};
const active=async()=>{
 const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments?.[0];
 assert(d?.versions?.length===1&&d.versions[0].percentage===100,'ACTIVE_NOT_SINGLE_100_PERCENT');
 return {version:d.versions[0].version_id,deployment:d.id};
};
const getVersion=version=>cf('/workers/workers/'+W+'/versions/'+version+'?include=modules');
const getPublic=async(path,host=BASE)=>{
 const u=new URL(path,host);u.searchParams.set('_scrollbardeploy',Date.now().toString(36));
 const r=await fetch(u,{redirect:'manual',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(40000)});
 const buf=Buffer.from(await r.arrayBuffer());
 return {status:r.status,data:buf,sha:hash(buf),location:r.headers.get('location')||'',type:r.headers.get('content-type')||''};
};
const settingsOperational=x=>({...x,annotations:undefined});
const settings=async()=>{
 const [set,schedules,domains]=await Promise.all([
   cf('/workers/scripts/'+W+'/settings'),cf('/workers/scripts/'+W+'/schedules'),cf('/workers/domains')]);
 return {set,schedules,domains:domains.filter(x=>x.service===W).map(x=>x.hostname).sort()};
};
const publicInventory=async(files,host,patchedCss=null)=>{
 const bad=[],protectedList=[],ok=[];
 for(let i=0;i<files.length;i+=5){
  const batch=await Promise.all(files.slice(i,i+5).map(async f=>{
   const expected=f.path==='/styles.css'&&patchedCss?hash(patchedCss):f.sha;
   const response=await getPublic(f.path,host);
   let canonical=null;
   if([307].includes(response.status)&&f.path.endsWith('.html')){
     canonical=await getPublic(f.path.slice(0,-5),host);
   }
   return {...f,expected,actual:response.sha,status:response.status,canonical:canonical&&{status:canonical.status,sha:canonical.sha},matched:(response.status===200&&response.sha===expected)||(canonical?.status===200&&canonical.sha===expected),protected:response.status===302||response.status===303};
  }));
  for(const x of batch){if(x.matched)ok.push(x.path);else if(x.protected)protectedList.push({path:x.path,status:x.status});else bad.push({path:x.path,status:x.status,expected:x.expected,actual:x.actual,canonical:x.canonical});}
 }
 return {matches:ok.length,protected:protectedList,mismatches:bad};
};
async function uploadAssets(files){
 const manifest={},byHash=new Map();
 for(const f of files){
  const raw=f.bytes;
  // Cloudflare asset-upload-session format: 32 hex keyed by SHA256(base64 + extension).
  const id=hash(raw.toString('base64')+extname(f.path).slice(1)).slice(0,32);
  manifest[f.path]={hash:id,size:raw.length};
  const old=byHash.get(id);if(old)assert.equal(old.raw.equals(raw),true,'UPLOAD_ID_COLLISION');
  byHash.set(id,{raw,type:mime(f.path)});
 }
 const session=await cf('/workers/scripts/'+W+'/assets-upload-session',{manifest});
 assert(session.jwt&&Array.isArray(session.buckets),'UPLOAD_SESSION_INVALID');
 let completion=session.buckets.length===0?session.jwt:null;
 const uploadHashes=session.buckets.flat();
 assert(new Set(uploadHashes).size===uploadHashes.length,'DUPLICATE_BUCKET_HASH');
 for(const bucket of session.buckets){
  const form=new FormData();
  for(const id of bucket){const x=byHash.get(id);assert(x,'CF_ASKED_UNEXPECTED_HASH');form.append(id,new Blob([x.raw.toString('base64')],{type:x.type}),id)}
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+'/workers/assets/upload?base64=true',{method:'POST',headers:{Authorization:'Bearer '+session.jwt},body:form,signal:AbortSignal.timeout(85000)});
  const j=await res.json();
  assert(res.ok&&j.success===true,'UPLOAD_ASSET_FAILED:'+res.status+':'+JSON.stringify(j.errors||[]).slice(0,600));
  if(j.result?.jwt)completion=j.result.jwt;
 }
 assert(completion,'UPLOAD_COMPLETION_JWT_MISSING');
 return {completion,files:files.length,uploaded:uploadHashes.length};
}
async function uploadVersion(oldVersion,old,completion){
 assert.equal((await active()).version,oldVersion,'ACTIVE_DRIFT_BEFORE_VERSION_UPLOAD');
 const payload={
  main_module:old.main_module,
  modules:old.modules,
  bindings:old.bindings.map(b=>b.type==='assets'?{name:b.name,type:'assets'}:{name:b.name,type:'inherit',version_id:oldVersion}),
  assets:{jwt:completion,config:old.assets.config},
  compatibility_date:old.compatibility_date,
  compatibility_flags:old.compatibility_flags||[],
  usage_model:old.usage_model,
  annotations:{'workers/tag':'MEMBER-GRAPHITE-LOADING-20261020','workers/message':'BALL46 MEMBER Graphite loading splash; only member.html, member.js and 2 new loader files; unchanged Worker and Bindings'},
 };
 for(const k of ['limits','placement'])if(old[k])payload[k]=old[k];
 const version=await cf('/workers/workers/'+W+'/versions?deploy=false&bindings_inherit=strict',payload);
 const id=version?.id;
 assert(id&&/^[a-f0-9-]{36}$/.test(id),'VERSION_CREATE_ID_MISSING');
 return id;
}
function compareVersion(candidate,base){
 assert.deepEqual(candidate.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))})),base.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))})),'WORKER_MODULE_MODIFIED');
 const norm=v=>(v.bindings||[]).map(x=>({name:x.name,type:x.type})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(norm(candidate),norm(base),'PRODUCTION_BINDINGS_DIFFERENT');
 assert.deepEqual(candidate.assets?.config,base.assets?.config,'ASSET_ROUTING_CONFIG_CHANGED');
 assert.equal(candidate.compatibility_date,base.compatibility_date,'COMPAT_DATE_CHANGED');
 assert.deepEqual(candidate.compatibility_flags||[],base.compatibility_flags||[],'COMPAT_FLAGS_CHANGED');
 // Check inherited public variable values too, without emitting them.
 const plain=v=>(v.bindings||[]).filter(x=>x.type==='plain_text').map(x=>[x.name,x.text]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(plain(candidate),plain(base),'PLAIN_TEXT_BINDING_VALUE_CHANGED');
}
async function promote(version,prior,message){
 assert.equal((await active()).version,prior,'ACTIVE_DRIFT_AT_PROMOTION');
 const dep=await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':message}});
 for(let i=0;i<24;i++){
  const curr=await active();
  if(curr.version===version)return curr.deployment||dep.id;
  assert.equal(curr.version,prior,'UNRELATED_DEPLOYMENT_DURING_PROMOTION');
  await new Promise(r=>setTimeout(r,1500));
 }
 throw Error('PROMOTION_NOT_CONFIRMED');
}
async function waitCss(sha,host=BASE,path='/styles.css'){
 for(let i=0;i<25;i++){
  const css=await getPublic(path,host);
  if(css.status===200&&css.sha===sha)return true;
  await new Promise(r=>setTimeout(r,2500));
 }
 return false;
}
let initial=null,newVersion=null;
try{
 assert(A&&T,'CLOUDFLARE_SECRETS_MISSING');
 assert.equal(A,'62cb0db544160e6591342abd6b4f35cc','CLOUDFLARE_ACCOUNT_UNEXPECTED');
 initial=await active();
 report.activeBefore=initial;
 assert.equal(initial.version,OLD_VERSION,'PRODUCTION_CHANGED_FROM_VERIFIED_BASE');
 const base=await getVersion(initial.version);
 assert.deepEqual(base.modules.map(x=>x.name),['worker.js'],'ACTIVE_WORKER_MODULE_COUNT_CHANGED');
 assert(base.modules[0].content_base64&&base.modules[0].name==='worker.js','ACTIVE_WORKER_MODULE_DRIFT');
 const previous=await settings();
 assert.deepEqual(previous.domains,['member.ball46.com'],'WRONG_WORKER_DOMAINS');
 assert.equal(base.bindings.filter(x=>x.type==='secret_text').length,3,'SECRET_BINDING_COUNT_CHANGED');
 assert(base.bindings.some(x=>x.type==='assets'&&x.name==='ASSETS'),'ASSET_BINDING_MISSING');
 assert(previous.schedules!==undefined,'CRON_NOT_READ');

 report.phase='ACTIVE_SOURCE_VERIFICATION';save();
 const before=walk(DIR).map(absolute=>{
  const bytes=readFileSync(absolute);return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)}
 });
 assert.equal(before.length,45,'ACTIVE_SOURCE_ASSET_COUNT_DRIFT');
 const origHtml=before.find(x=>x.path==='/member.html');
 const origJs=before.find(x=>x.path==='/member.js');
 const origCss=before.find(x=>x.path==='/styles.css');
 assert(origHtml&&origJs&&origCss,'REQUIRED_MEMBER_ASSETS_MISSING');
 assert(origHtml.bytes.toString('utf8').includes('kpiV7=desktop-nine-in-one-row-20261020'),'LAST_DEPLOYED_MEMBER_HTML_SOURCE_DRIFT');
 assert(origJs.bytes.toString('utf8').includes('favoriteStorageInit(session.member)'),'MEMBER_JS_SOURCE_MISSING');
 // CSS was edited only by the previously verified MARKETS scrollbar deploy.
 const liveCss=await getPublic('/styles.css');
 assert.equal(liveCss.status,200,'LIVE_CSS_HTTP_ERROR');
 assert.equal(liveCss.sha,OLD_CSS_SHA,'LIVE_CSS_CHANGED_SINCE_SCROLLBAR_DEPLOY');
 assert(origCss.bytes.length>200000,'LAST_DEPLOYED_MEMBER_CSS_SOURCE_MISSING');
 assert(liveCss.data.toString('utf8').includes('BALL46_MEMBER_MARKETS_SCROLLBAR_DARK_20261020'),'PREVIOUS_SCROLLBAR_DESIGN_MISSING');
 writeFileSync(DIR+'/styles.css',liveCss.data);
 const liveJs=await getPublic('/member.js');
 assert.equal(liveJs.status,200,'LIVE_MEMBER_JS_HTTP_ERROR');
 assert.equal(liveJs.sha,'1ddd9d0d245e4b449e18c4f942635e773d14ee8d600ea39e33812c61ba500c97','ACTIVE_MEMBER_JS_CHANGED_SINCE_READONLY_PROOF');
 writeFileSync(DIR+'/member.js',liveJs.data);

 const oldFiles=walk(DIR).map(absolute=>{
  const bytes=readFileSync(absolute);return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)}
 });
 const publicOld=await publicInventory(oldFiles.filter(x=>x.path!=='/member.html'),BASE);
 assert.deepEqual(publicOld.mismatches,[],'BASE_PUBLIC_ASSET_MISMATCH');
 assert.equal(publicOld.matches,44,'BASE_ASSETS_NOT_ALL_VERIFIED');
 assert.equal(publicOld.protected.length,0,'UNEXPECTED_BASE_ASSET_ACCESS_BLOCK');
 const oldMember=await getPublic('/member.html',BASE);
 assert([302,303].includes(oldMember.status),'ACTIVE_MEMBER_LOGIN_PROTECTION_CHANGED');

 const patch=spawnSync('python3',[SCOPED+'/patch_member.py',DIR],{encoding:'utf8'});
 assert.equal(patch.status,0,'PATCH_FAILED:'+patch.stderr+patch.stdout);
 const files=walk(DIR).map(absolute=>{
  const bytes=readFileSync(absolute);return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)}
 });
 assert.equal(files.length,47,'CANDIDATE_ASSET_COUNT_NOT_47');
 const changes=['/member.html','/member.js','/member-loading.css','/member-loading.js'];
 const nonChanged=files.filter(x=>!changes.includes(x.path));
 assert.equal(nonChanged.length,43,'UNTOUCHED_MEMBER_ASSET_COUNT_CHANGED');
 for(const file of nonChanged) assert.equal(file.sha,oldFiles.find(x=>x.path===file.path)?.sha,'UNRELATED_ASSET_MUTATION:'+file.path);
 assert.equal(files.find(x=>x.path==='/styles.css').sha,OLD_CSS_SHA,'PREVIOUS_SCROLLBAR_CSS_CHANGED');
 assert.notEqual(files.find(x=>x.path==='/member.js').sha,liveJs.sha,'MEMBER_LOADER_READY_HOOK_NOT_PATCHED');
 const html=readFileSync(DIR+'/member.html','utf8');
 const js=readFileSync(DIR+'/member.js','utf8');
 assert(html.includes('id="b46-member-loading"')&&html.includes('/member-loading.css'),'LOADING_HTML_MISSING');
 assert(js.includes("ball46:member-data-ready")&&js.includes("ball46:member-data-error"),'MEMBER_DATA_LIFECYCLE_NOT_WIRED');
 report.change={assetsChanged:['/member.html','/member.js'],newAssets:['/member-loading.css','/member-loading.js'],unchangedAssets:43,
  priorCssHash:OLD_CSS_SHA,htmlBefore:origHtml.sha,jsBefore:liveJs.sha,
  htmlAfter:files.find(x=>x.path==='/member.html').sha,jsAfter:files.find(x=>x.path==='/member.js').sha};
 report.phase='UPLOAD_ASSET_CANDIDATE';save();
 assert.equal((await active()).version,initial.version,'ACTIVE_CHANGED_DURING_PREP');
 const uploaded=await uploadAssets(files);
 report.assetUpload={total:uploaded.files,uploaded:uploaded.uploaded};
 report.phase='CREATE_VERSION';save();
 newVersion=await uploadVersion(initial.version,base,uploaded.completion);
 report.candidateVersion=newVersion;
 const candidate=await getVersion(newVersion);
 compareVersion(candidate,base);
 assert.equal((await active()).version,initial.version,'CANDIDATE_CREATION_CHANGED_ACTIVE');
 const preview=candidate.urls?.find(x=>x.startsWith('https://'))||
  'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 report.candidatePreview=preview;
 report.phase='CANDIDATE_QA';save();
 const unchanged=await publicInventory(nonChanged,preview);
 assert.deepEqual(unchanged.mismatches,[],'CANDIDATE_UNCHANGED_ASSETS_FAILED');
 assert.equal(unchanged.matches,43,'CANDIDATE_UNCHANGED_ASSET_COUNT');
 for(const path of ['/member.js','/member-loading.css','/member-loading.js']){
  const live=await getPublic(path,preview);
  assert.equal(live.status,200,'CANDIDATE_NEW_ASSET_NOT_200:'+path);
  assert.equal(live.sha,files.find(x=>x.path===path).sha,'CANDIDATE_NEW_ASSET_HASH_MISMATCH:'+path);
 }
 const newMember=await getPublic('/member.html',preview);
 assert([302,303].includes(newMember.status),'PROTECTED_MEMBER_BYPASS_ON_CANDIDATE');
 const landing=await getPublic('/',preview);
 assert.equal(landing.status,200,'PUBLIC_PRICING_UNAVAILABLE');
 assert.equal(landing.sha,nonChanged.find(x=>x.path==='/pricing.html').sha,'PUBLIC_PRICING_CHANGED');
 report.candidateUI=await verifySplash(preview,html,'candidate',AUDIT);
 report.phase='CANDIDATE_VERIFIED';save();
 assert.equal((await active()).version,initial.version,'FOREIGN_DEPLOYMENT_INTERVENED');
 const now=await settings();
 assert.deepEqual(now.domains,previous.domains,'DOMAIN_CHANGED');
 assert.deepEqual(now.schedules,previous.schedules,'SCHEDULES_CHANGED');
 assert.deepEqual(settingsOperational(now.set),settingsOperational(previous.set),'WORKER_SETTINGS_CHANGED');
 report.phase='PROMOTING';report.safeRollbackReady=true;save();
 report.newDeployment=await promote(newVersion,initial.version,'BALL46 MEMBER Graphite Noir branded loading ring and data readiness only');
 report.activated=true;report.phase='VERIFY_PUBLIC';save();
 for(const path of ['/member.js','/member-loading.css','/member-loading.js']){
  const expected=files.find(x=>x.path===path).sha;
  assert(await waitCss(expected,BASE,path),'NEW_PRODUCTION_ASSET_NOT_PUBLISHED:'+path);
 }
 const otherLive=await publicInventory(nonChanged,BASE);
 assert.deepEqual(otherLive.mismatches,[],'UNTOUCHED_PRODUCTION_ASSETS_CHANGED');
 assert.equal(otherLive.matches,43,'PRODUCTION_ASSET_COUNT_DRIFT');
 const finalMember=await getPublic('/member.html',BASE);
 assert.equal(finalMember.status,oldMember.status,'PROTECTED_MEMBER_REDIRECT_CHANGED');
 report.productionUI=await verifySplash(BASE,html,'production',AUDIT);
 const liveConfig=await settings();
 assert.deepEqual(liveConfig.domains,previous.domains,'DOMAINS_CHANGED_AFTER_DEPLOY');
 assert.deepEqual(liveConfig.schedules,previous.schedules,'CRON_CHANGED_AFTER_DEPLOY');
 assert.deepEqual(settingsOperational(liveConfig.set),settingsOperational(previous.set),'SETTINGS_CHANGED_AFTER_DEPLOY');
 assert.equal((await active()).version,newVersion,'CANDIDATE_NOT_ACTIVE_AFTER_DEPLOY');
 report.phase='COMPLETE';report.productionVerified=true;save();
 console.log('BALL46_MEMBER_LOADING_DEPLOY_SUCCESS',JSON.stringify({
  beforeVersion:initial.version,afterVersion:newVersion,beforeDeployment:initial.deployment,afterDeployment:report.newDeployment,
  files:47,unchanged:43,newAssets:['member-loading.js','member-loading.css'],
  cssScrollbarPreserved:true,workerAndSecretsPreserved:true,
  candidateBrowserPassed:true,productionBrowserPassed:true,productionVerified:true}));
}catch(e){
 report.error=String(e.stack||e).slice(0,2600);report.phase='FAILED';
 console.error('BALL46_MEMBER_LOADING_DEPLOY_BLOCKED',String(e.message||e));
 try{
  if(initial&&newVersion){
   const current=await active();
   if(current.version===newVersion) {
     const dep=await promote(initial.version,newVersion,'Rollback member loading overlay after failed verification');
     report.rolledBack=true;report.rollbackDeployment=dep;
     assert.equal((await active()).version,initial.version,'ROLLBACK_NOT_CONFIRMED');
   }else if(current.version!==initial.version){report.foreignActiveDetected=true;report.noRollbackForeign=true;}
  }
 }catch(rollbackError){report.rollbackError=String(rollbackError);}
 save();
 process.exitCode=1;
}