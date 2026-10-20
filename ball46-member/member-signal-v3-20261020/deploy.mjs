import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patch,MARKER,GRADIENT_ID,STYLE} from './theme.mjs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-eventflow-signal-v3-production';
const SCOPED='ball46-member/member-loading-20261020';
const OLD_VERSION='65d4ef55-3656-409d-89de-615388817d0c';
// The immutable active Cloudflare version ID above protects the exact Worker module bytes.
const OLD_CSS_SHA='bcff14935bd652d70209fb7996fd7034ad3009d109eae8e1f89a0e9002520f40';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER EVENT FLOW SIGNAL V3 VISUAL ONLY',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'05c276f7f76a6226b10b45bd85ac369e53167d2f',target:W};
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
  annotations:{'workers/tag':'MEMBER-EVENTFLOW-SIGNAL-V3-20261020','workers/message':'BALL46 Member V3 CSS SVG plate only; preserve full Worker, all other assets, memberships and Signal APIs'},
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


async function syntheticCard(browser,url,label,width){
 const page=await browser.newPage({viewport:{width,height:850}});
 try{
  await page.goto(url+'/?member_signal_v3_qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:55000});
  await page.evaluate(()=>{
   document.body.classList.add('page-member');
   const host=document.createElement('div');
   host.className='member-flow-chart';
   host.style.cssText='width:520px;max-width:96vw;margin:18px auto;display:block;position:relative;';
   host.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 170" width="520" height="170" style="width:100%;height:170px"><defs><linearGradient id="b46-member-eventflow-signal-v3-20261020" x1="0%" y1="0%" x2="22%" y2="100%"><stop offset="0%" stop-color="#31554d"/><stop offset="24%" stop-color="#21463e"/><stop offset="63%" stop-color="#153932"/><stop offset="100%" stop-color="#0b2727"/></linearGradient></defs><g class="member-flow-signal"><line x1="65" y1="60" x2="65" y2="148" class="member-flow-signal-connector"/><circle cx="65" cy="148" r="5" class="member-flow-signal-ring"/><g class="member-flow-signal-tag"><rect x="16" y="15" width="300" height="36" rx="5" ry="5" class="member-flow-signal-plate"/><rect x="22" y="22" width="2.4" height="22" rx="1.2" class="member-flow-signal-accent"/><text x="30" y="29" class="member-flow-signal-label"><tspan class="member-flow-signal-word">SIGNAL </tspan><tspan class="member-flow-signal-minute">45′</tspan></text><text x="30" y="43" class="member-flow-signal-detail"><tspan class="member-flow-signal-market">CORNERS</tspan><tspan class="member-flow-signal-separator"> · </tspan><tspan class="member-flow-signal-pick">OVER 9.5</tspan><tspan class="member-flow-signal-separator"> · </tspan><tspan class="member-flow-signal-odds">@1.90</tspan><tspan class="member-flow-signal-separator"> · </tspan><tspan class="member-flow-signal-bookmaker">Bookmaker</tspan></text></g></g></svg>';
   document.body.append(host);
  });
  const observed=await page.evaluate(()=>{
   const el=document.querySelector('.member-flow-signal-plate'),s=getComputedStyle(el),r=el.getBoundingClientRect();
   return {stroke:s.stroke,strokeWidth:s.strokeWidth,fill:s.fill,filter:s.filter,animation:s.animationName,
    width:r.width,height:r.height,defs:!!document.getElementById('b46-member-eventflow-signal-v3-20261020'),
    text:document.querySelector('.member-flow-signal-tag')?.textContent,loading:!!document.querySelector('#b46-member-loading')};
  });
  const visible=observed.stroke==='none'&&Number.parseFloat(observed.strokeWidth)===0&&observed.fill.includes(GRADIENT_ID)&&observed.filter.includes('drop-shadow')&&observed.defs;
  assert(visible,'MEMBER_SVG_CARD_STYLE_FAILED '+label+' '+width+' '+JSON.stringify(observed));
  await page.screenshot({path:AUDIT+'/'+label+'-'+width+'.png',fullPage:false});
  return observed;
 }finally{await page.close();}
}
let initial=null,newVersion=null;
try{
 assert(A&&T,'CLOUDFLARE_SECRETS_MISSING');
 initial=await active();report.activeBefore=initial;
 assert.equal(initial.version,OLD_VERSION,'MEMBER_PRODUCTION_VERSION_MOVED_STOP');
 const base=await getVersion(initial.version);
 assert.deepEqual(base.modules.map(m=>m.name),['worker.js'],'MEMBER_WORKER_MODULES_CHANGED');
 const baselineModules=base.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))}));
 const beforeSettings=await settings();
 assert.deepEqual(beforeSettings.domains,['member.ball46.com'],'MEMBER_DOMAIN_DRIFT');
 assert.equal(base.bindings.filter(x=>x.type==='secret_text').length,3,'MEMBER_SECRET_BINDINGS_CHANGED');
 assert(base.bindings.some(x=>x.type==='assets'&&x.name==='ASSETS'),'MEMBER_ASSETS_BINDING_MISSING');
 const raw=walk(DIR).map(absolute=>{
   const bytes=readFileSync(absolute);
   return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)};
 });
 assert.equal(raw.length,40,'IMMUTABLE_SOURCE_COUNT_CHANGED');
 assert(raw.some(x=>x.path==='/member.html'&&x.bytes.includes(Buffer.from('kpiV7=desktop-nine-in-one-row-20261020'))),'RECENT_MEMBER_SOURCE_NOT_PRESENT');
 const beforeCss=await getPublic('/styles.css');
 const beforeJs=await getPublic('/member.js');
 assert.equal(beforeCss.status,200,'ACTIVE_MEMBER_CSS_UNAVAILABLE');
 assert.equal(beforeJs.status,200,'ACTIVE_MEMBER_JS_UNAVAILABLE');
 assert.equal(beforeCss.sha,OLD_CSS_SHA,'LATEST_MEMBER_CSS_HASH_CHANGED');
 assert.equal(beforeJs.sha,'58a580302fe247fce4c98d2fe06f185dddacb5fadd632d724e5633da026f562a','LATEST_MEMBER_JS_HASH_CHANGED');
 writeFileSync(DIR+'/styles.css',beforeCss.data);
 // Build the exact previous Member loading release using its pinned repository
 // source and patch; verify EVERY public asset byte before adding V3.
 const splash=spawnSync('python3',[SCOPED+'/patch_member.py',DIR],{encoding:'utf8'});
 assert.equal(splash.status,0,'REBUILD_CURRENT_MEMBER_LOADING_FAILED '+splash.stderr+' '+splash.stdout);
 // Preserve the current public Member JS byte-for-byte (including any latest Member-only updates),
 // while reconstructing the protected HTML only from the exact pinned previous release.
 writeFileSync(DIR+'/member.js',beforeJs.data);
 const previousFiles=walk(DIR).map(absolute=>{
   const bytes=readFileSync(absolute);
   return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)};
 });
 assert.equal(previousFiles.length,42,'RECONSTRUCTED_MEMBER_ASSET_COUNT_NOT_42');
 assert.equal(previousFiles.find(x=>x.path==='/member.js').sha,beforeJs.sha,'LIVE_MEMBER_JS_NOT_RECONSTRUCTED');
 assert.equal(previousFiles.find(x=>x.path==='/styles.css').sha,beforeCss.sha,'LIVE_MEMBER_CSS_NOT_RECONSTRUCTED');
 const previouslyPublic=await publicInventory(previousFiles.filter(x=>x.path!=='/member.html'),BASE);
 assert.deepEqual(previouslyPublic.mismatches,[],'CURRENT_MEMBER_ASSETS_DIFFER_FROM_REBUILT_BASE');
 assert.equal(previouslyPublic.matches,41,'CURRENT_MEMBER_PUBLIC_ASSETS_NOT_41');
 assert.equal(previouslyPublic.protected.length,0,'MEMBER_PUBLIC_ASSET_PROTECTION_CHANGED');
 const protectedBefore=await getPublic('/member.html');
 assert([302,303].includes(protectedBefore.status),'PROTECTED_MEMBER_ACCESS_CHANGED');
 const healthBefore=await getPublic('/api/health');
 report.healthBefore={status:healthBefore.status,sha:healthBefore.sha};
 report.reconstructedBase={assetCount:previousFiles.length,publicIdentical:41,
   memberJsSha:beforeJs.sha,memberCssSha:beforeCss.sha,workerModuleHashes:baselineModules};
 save();
 const paths=['member.html','member.js','styles.css'];
 const original=Object.fromEntries(paths.map(p=>[p,readFileSync(DIR+'/'+p,'utf8')]));
 const updated=patch({html:original['member.html'],js:original['member.js'],css:original['styles.css']});
 const outputFiles={'member.html':updated.html,'member.js':updated.js,'styles.css':updated.css};
 for(const p of paths)writeFileSync(DIR+'/'+p,outputFiles[p],'utf8');
 const files=walk(DIR).map(absolute=>{
   const bytes=readFileSync(absolute);
   return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)};
 });
 const modified=['/member.html','/member.js','/styles.css'];
 const untouched=files.filter(x=>!modified.includes(x.path));
 assert.equal(untouched.length,39,'MEMBER_NON_TARGET_ASSET_COUNT_CHANGED');
 for(const x of untouched)assert.equal(x.sha,previousFiles.find(y=>y.path===x.path)?.sha,'UNEXPECTED_MEMBER_ASSET_CHANGE '+x.path);
 assert.equal(files.length,42,'CANDIDATE_FILE_COUNT_CHANGED');
 assert(updated.js.includes(GRADIENT_ID)&&updated.css.includes(MARKER),'MEMBER_V3_MARKER_MISSING');
 assert(!original.js.includes(GRADIENT_ID),'MEMBER_V3_WAS_ALREADY_ACTIVE');
 report.diff=files.filter(x=>previousFiles.find(y=>y.path===x.path)?.sha!==x.sha).map(x=>({path:x.path,before:previousFiles.find(y=>y.path===x.path)?.sha,after:x.sha}));
 assert.deepEqual(report.diff.map(x=>x.path).sort(),modified.sort(),'MEMBER_V3_FILE_DIFF_EXCEEDED_SCOPE');
 save();
 assert.equal((await active()).version,initial.version,'MEMBER_MOVED_BEFORE_CANDIDATE');
 const uploaded=await uploadAssets(files);
 report.upload={total:uploaded.files,uploaded:uploaded.uploaded};save();
 newVersion=await uploadVersion(initial.version,base,uploaded.completion);
 report.candidate=newVersion;save();
 const candidate=await getVersion(newVersion);
 compareVersion(candidate,base);
 assert.deepEqual(candidate.modules.map(m=>({name:m.name,sha:hash(Buffer.from(m.content_base64,'base64'))})),baselineModules,'MEMBER_WORKER_RUNTIME_REGRESSED');
 const preview=candidate.urls?.find(x=>x.startsWith('https://'))||
  'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 report.preview=preview;
 const valid=await publicInventory(untouched,preview);
 assert.deepEqual(valid.mismatches,[],'UNRELATED_MEMBER_PREVIEW_ASSET_REGRESSION');
 assert.equal(valid.matches,39,'MEMBER_PREVIEW_UNTOUCHED_ASSET_COUNT');
 for(const path of ['/styles.css','/member.js']){
  const got=await getPublic(path,preview);
  assert.equal(got.status,200,'MEMBER_PREVIEW_ASSET_FAILED '+path);
  assert.equal(got.sha,files.find(x=>x.path===path).sha,'MEMBER_PREVIEW_ASSET_HASH_MISMATCH '+path);
 }
 assert([302,303].includes((await getPublic('/member.html',preview)).status),'MEMBER_PREVIEW_ACCESS_BYPASS');
 const preLanding=await getPublic('/',preview);
 assert.equal(preLanding.status,200,'MEMBER_PREVIEW_PRICING_FAILED');
 assert.equal(preLanding.sha,untouched.find(x=>x.path==='/pricing.html').sha,'MEMBER_PREVIEW_PRICING_CHANGED');
 const browser=await chromium.launch({headless:true});
 try {
  report.previewUI={};
  for(const width of [1440,390])report.previewUI[width]=await syntheticCard(browser,preview,'candidate',width);
 }finally{await browser.close();}
 report.previewVerified=true;save();
 assert.equal((await active()).version,initial.version,'MEMBER_CHANGED_BEFORE_PROMOTION');
 const now=await settings();
 assert.deepEqual(now.domains,beforeSettings.domains,'MEMBER_DOMAIN_CHANGED');
 assert.deepEqual(now.schedules,beforeSettings.schedules,'MEMBER_CRON_CHANGED');
 assert.deepEqual(settingsOperational(now.set),settingsOperational(beforeSettings.set),'MEMBER_SETTINGS_CHANGED');
 report.safeRollbackReady=true;save();
 report.deployment=await promote(newVersion,initial.version,'BALL46 Member Event Flow SIGNAL Card V3 — visual-only SVG gradient & soft elevation');
 report.activated=true;save();
 for(const path of ['/member.js','/styles.css']){
  const expected=files.find(x=>x.path===path).sha;
  assert(await waitCss(expected,BASE,path),'MEMBER_NEW_ASSET_NOT_VISIBLE '+path);
 }
 const productionUntouched=await publicInventory(untouched,BASE);
 assert.deepEqual(productionUntouched.mismatches,[],'PRODUCTION_MEMBER_OTHER_ASSETS_CHANGED');
 assert.equal(productionUntouched.matches,39,'PRODUCTION_MEMBER_ASSET_COUNT_CHANGED');
 const protectedAfter=await getPublic('/member.html');
 assert.equal(protectedAfter.status,protectedBefore.status,'MEMBER_ACCESS_PROTECTION_CHANGED');
 const healthAfter=await getPublic('/api/health');
 assert.equal(healthAfter.status,healthBefore.status,'MEMBER_API_HEALTH_STATUS_CHANGED');
 assert.equal(healthAfter.sha,healthBefore.sha,'MEMBER_API_HEALTH_RESPONSE_CHANGED');
 const productionBrowser=await chromium.launch({headless:true});
 try {
  report.productionUI={};
  for(const width of [1440,390])report.productionUI[width]=await syntheticCard(productionBrowser,BASE,'production',width);
 }finally{await productionBrowser.close();}
 const afterSettings=await settings();
 assert.deepEqual(afterSettings.domains,beforeSettings.domains,'PRODUCTION_MEMBER_DOMAINS_CHANGED');
 assert.deepEqual(afterSettings.schedules,beforeSettings.schedules,'PRODUCTION_MEMBER_CRON_CHANGED');
 assert.deepEqual(settingsOperational(afterSettings.set),settingsOperational(beforeSettings.set),'PRODUCTION_MEMBER_SETTINGS_CHANGED');
 assert.equal((await active()).version,newVersion,'MEMBER_PRODUCTION_NOT_ON_CANDIDATE');
 report.completedAt=new Date().toISOString();report.success=true;save();
 console.log('BALL46_MEMBER_SIGNAL_V3_DEPLOY_SUCCESS',JSON.stringify({
  before:initial.version,after:newVersion,sourceSha:process.env.GITHUB_SHA,
  filesChanged:report.diff.map(x=>x.path),unchangedAssets:39,
  workerModulesPreserved:true,bindingsPreserved:true,accessPreserved:true,
  candidateBrowser:true,productionBrowser:true}));
}catch(e){
 report.error=String(e.stack||e);report.success=false;report.completedAt=new Date().toISOString();
 if(report.activated&&newVersion){
  try{const currently=await active();
   if(currently.version===newVersion){await promote(initial.version,newVersion,'Rollback Member Event Flow SIGNAL V3 after failed safety guard');report.rolledBack=true;}
   else report.foreignVersionDetected=currently.version;
  }catch(err){report.rollbackError=String(err);}
 }
 save();console.error('BALL46_MEMBER_SIGNAL_V3_SAFE_STOP',String(e.stack||e));process.exitCode=1;
}
