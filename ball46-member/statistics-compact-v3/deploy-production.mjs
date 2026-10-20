import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-statistics-v3-production-deploy';
const PATCHER='ball46-member/statistics-compact-v3/patch_active_statistics.py';
const OLD_VERSION='4373d1fa-4534-498b-98d3-b2c39296569b';
const OLD_MODULE_SHA='eeb30972a6b8b15a64cd9a4dae967f3cb61de7ae914fe3ae4a1a8dab4dfadfd9';
const OLD_CSS_SHA='fa96bbdf0cc293082b17032752c4c84b57b31a00c8c7fca32929ac13bf0f6bb0';
const OLD_JS_SHA='1ede22f4a3c100bf96088ff2eabdb4097ce074f87ecbd886854454805664fee6';
const SOURCE_GRAPHITE_CSS_SHA='1c4deaee6fc0885ce4c24f3f45f739af624814d4be4c1988fc6e3951a7e376d2';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER DESKTOP STATISTICS COMPACT V3',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'design/member-graphite-noir-dark-20261015',target:W};
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
 const u=new URL(path,host);u.searchParams.set('_desktopv3',Date.now().toString(36));
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
  annotations:{'workers/tag':'MEMBER-STATS-COMPACT-V3-20261020','workers/message':'BALL46 MEMBER Desktop Statistics V3 only; preserve Worker code, bindings and all other assets'},
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
async function waitAsset(path,sha,host=BASE){
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
 assert.equal(initial.version,OLD_VERSION,'ACTIVE_VERSION_CHANGED_FROM_LAST_VERIFIED_PRODUCTION');
 const base=await getVersion(initial.version);
 assert.deepEqual(base.modules.map(x=>x.name),['worker.js'],'ACTIVE_WORKER_MODULE_COUNT_CHANGED');
 assert.equal(hash(Buffer.from(base.modules[0].content_base64,'base64')),OLD_MODULE_SHA,'ACTIVE_WORKER_MODULE_DRIFT');
 const previous=await settings();
 assert.deepEqual(previous.domains,['member.ball46.com'],'WRONG_WORKER_DOMAINS');
 assert.equal(base.bindings.filter(x=>x.type==='secret_text').length,3,'SECRET_BINDING_COUNT_CHANGED');
 assert(base.bindings.some(x=>x.type==='assets'&&x.name==='ASSETS'),'ASSET_BINDING_MISSING');
 assert(previous.schedules!==undefined,'CRON_NOT_READ');
 report.phase='INVENTORY';
 const source=readdirSync(DIR);
 assert(source.length>=8,'SOURCE_DIR_MISSING');
 const files=walk(DIR).map(absolute=>{const raw=readFileSync(absolute);return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes:raw,sha:hash(raw)}});
 assert.equal(files.length,40,'SOURCE_ASSET_COUNT_DRIFT');
 const graphiteCss=readFileSync(DIR+'/styles.css');
 assert.equal(hash(graphiteCss),SOURCE_GRAPHITE_CSS_SHA,'GRAPHITE_SOURCE_CSS_DRIFT');
 const graphiteJS=readFileSync(DIR+'/member.js');
 assert.equal(hash(graphiteJS),OLD_JS_SHA,'GRAPHITE_SOURCE_JS_DRIFT');
 const [liveCss,liveJS]=await Promise.all([getPublic('/styles.css'),getPublic('/member.js')]);
 assert.equal(liveCss.status,200,'ACTIVE_CSS_NOT_PUBLIC');
 assert.equal(liveJS.status,200,'ACTIVE_JS_NOT_PUBLIC');
 assert.equal(liveCss.sha,OLD_CSS_SHA,'ACTIVE_CSS_BASE_DRIFT');
 assert.equal(liveJS.sha,OLD_JS_SHA,'ACTIVE_JS_BASE_DRIFT');
 assert(liveCss.data.toString('utf8').startsWith(graphiteCss.toString('utf8')),'ORIGINAL_GRAPHITE_CSS_NOT_PREFIX');
 assert(liveCss.data.toString('utf8').includes('BALL46_MEMBER_MARKETS_SCROLLBAR_DARK_20261020'),'PREVIOUS_SCROLLBAR_DEPLOY_NOT_PRESERVED');
 writeFileSync(AUDIT+'/original-member.js',liveJS.data);
 writeFileSync(AUDIT+'/original-styles.css',liveCss.data);
 const build=spawnSync('python3',[PATCHER,AUDIT+'/original-member.js',AUDIT+'/original-styles.css',AUDIT+'/candidate-member.js',AUDIT+'/candidate-styles.css',AUDIT+'/patch-report.json'],{encoding:'utf8'});
 assert.equal(build.status,0,'V3_PATCH_GENERATION_ERROR:'+build.stdout+build.stderr);
 const nextJS=readFileSync(AUDIT+'/candidate-member.js'),nextCss=readFileSync(AUDIT+'/candidate-styles.css');
 assert(nextJS.toString('utf8').includes('BALL46_MEMBER_DESKTOP_STATISTICS_COMPACT_V3_20261020'),'V3_JS_MARKER_MISSING');
 assert(nextCss.toString('utf8').includes('BALL46_MEMBER_DESKTOP_STATISTICS_COMPACT_V3_20261020'),'V3_CSS_MARKER_MISSING');
 const nodecheck=spawnSync('node',['--check',AUDIT+'/candidate-member.js'],{encoding:'utf8'});
 assert.equal(nodecheck.status,0,'V3_JS_SYNTAX_FAILED:'+nodecheck.stderr);
 files.find(x=>x.path==='/styles.css').bytes=nextCss;
 files.find(x=>x.path==='/member.js').bytes=nextJS;
 const otherFiles=files.filter(x=>!['/styles.css','/member.js'].includes(x.path));
 const verified=await publicInventory(otherFiles,BASE);
 assert.deepEqual(verified.mismatches,[],'NON_STATISTICS_ASSET_SOURCE_CHANGED');
 assert.equal(verified.protected.length,1,'PROTECTED_HTML_STATUS_CHANGED');
 assert.equal(verified.protected[0].path,'/member.html','UNEXPECTED_PROTECTED_ASSET');
 assert.equal(verified.matches,37,'UNMODIFIED_ASSET_VERIFICATION_INCOMPLETE');
 report.inventory={total:files.length,unchangedMatched:verified.matches,memberHtmlProtected:verified.protected,onlyChangedAssets:['/member.js','/styles.css']};
 report.cssShaBefore=liveCss.sha;report.cssShaAfter=hash(nextCss);
 report.jsShaBefore=liveJS.sha;report.jsShaAfter=hash(nextJS);
 report.phase='UPLOAD_ASSETS';save();
 const uploaded=await uploadAssets(files);
 report.uploadedAssetCount=uploaded.uploaded;report.manifestCount=uploaded.files;
 report.phase='CREATE_CANDIDATE';save();
 newVersion=await uploadVersion(initial.version,base,uploaded.completion);
 report.candidateVersion=newVersion;
 const candidate=await getVersion(newVersion);
 compareVersion(candidate,base);
 assert.equal((await active()).version,initial.version,'ACTIVE_CHANGED_DURING_CANDIDATE');
 const preview=candidate.urls?.find(x=>x.startsWith('https://'))||
   'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 report.candidatePreview=preview;
 report.phase='CANDIDATE_QA';save();
 assert(await waitAsset('/styles.css',hash(nextCss),preview),'CANDIDATE_PREVIEW_CSS_NOT_UPDATED');
 assert(await waitAsset('/member.js',hash(nextJS),preview),'CANDIDATE_PREVIEW_JS_NOT_UPDATED');
 const previewAssets=await publicInventory(otherFiles,preview);
 assert.deepEqual(previewAssets.mismatches,[],'CANDIDATE_MISSING_UNTOUCHED_ASSETS');
 assert.equal(previewAssets.matches,37,'CANDIDATE_UNTOUCHED_ASSETS_COUNT_MISMATCH');
 const oldMember=await getPublic('/member.html',BASE);
 const newMember=await getPublic('/member.html',preview);
 assert([302,303].includes(oldMember.status)&&[302,303].includes(newMember.status),'MEMBER_AUTH_REDIRECT_REGRESSION');
 const html=await getPublic('/',preview);
 assert.equal(html.status,200,'MEMBER_PUBLIC_ROOT_DOWN');
 assert.equal(html.sha,otherFiles.find(x=>x.path==='/pricing.html').sha,'PRICING_ROOT_ASSET_CHANGED');
 // Browser-check the actual Candidate JS/CSS from version URL. Member auth remains enforced.
 const browser=await chromium.launch({headless:true});
 const source=nextJS.toString('utf8');
 const start=source.indexOf('function renderSummary(){');
 const stop=source.indexOf('\nfunction filteredRows(){',start);
 assert(start>=0&&stop>start,'CANDIDATE_STAT_RENDER_NOT_FOUND');
 const renderSource=source.slice(start,stop);
 try{
   for(const width of [390,767,768,900,1280,1920]){
     const page=await browser.newPage({viewport:{width,height:760},deviceScaleFactor:1});
     await page.goto(preview+'/pricing',{waitUntil:'domcontentloaded',timeout:40000});
     const cssResponse=await page.request.get(preview+'/styles.css');
     const jsResponse=await page.request.get(preview+'/member.js');
     assert.equal(cssResponse.status(),200,'PREVIEW_BROWSER_CSS_NOT_200');
     assert.equal(jsResponse.status(),200,'PREVIEW_BROWSER_JS_NOT_200');
     const cssText=await cssResponse.text(),jsText=await jsResponse.text();
     assert.equal(hash(Buffer.from(cssText)),hash(nextCss),'PREVIEW_BROWSER_CSS_HASH_MISMATCH');
     assert.equal(hash(Buffer.from(jsText)),hash(nextJS),'PREVIEW_BROWSER_JS_HASH_MISMATCH');
     await page.setContent('<!doctype html><html><body class="page-member"><div class="shell" style="width:calc(100% - 24px);max-width:100%;margin:auto"><div id="dailySummary" class="summary"></div></div></body></html>');
     await page.addStyleTag({content:cssText});
     const stats=await page.evaluate(script=>{
       const summary=document.querySelector('#dailySummary');
       const state={market:'ALL',payload:{signals:[{market:'AH',odds:1.85},{market:'AH',odds:2.15},{market:'AH',odds:null}]}};
       const currentStats=()=>({signals:15,win:5,halfWin:2,loss:3,halfLoss:1,push:2,pending:1,live:1,winRate:61.1,pnl:4.25});
       const averageRecordedOdds=rows=>{const v=rows.map(x=>Number(x.odds)).filter((n,i)=>rows[i].odds!==null&&Number.isFinite(n)&&n>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
       const fmtPct=x=>x.toFixed(1)+'%',fmtPnl=x=>x.toFixed(2);
       const node=(tag,cls,value)=>{const el=document.createElement(tag);el.className=cls||'';if(value!==undefined)el.textContent=value;return el};
       eval(script+';renderSummary();');
       const elements=[...summary.children],rects=elements.map(x=>{const r=x.getBoundingClientRect();return {y:r.y,height:r.height,width:r.width}});
       return {labels:elements.map(x=>x.querySelector('span')?.textContent),values:elements.map(x=>x.querySelector('b')?.textContent),rects,overflow:document.documentElement.scrollWidth>innerWidth+2};
     },renderSource);
     if(width>=768){
       assert.deepEqual(stats.labels,['SIGNALS','WIN','LOSS','PUSH','PENDING','LIVE','WIN RATE','P/L TODAY','AVG ODDS'],'DESKTOP_STAT_LABEL_ORDER');
       assert.deepEqual(stats.values,['15','7','4','2','1','1','61.1%','4.25','2.00'],'DESKTOP_STAT_DATA_WRONG');
       assert(stats.rects.every(x=>Math.abs(x.y-stats.rects[0].y)<2),'DESKTOP_STATS_NOT_SINGLE_ROW:'+width);
       assert(stats.rects.every(x=>Math.abs(x.height-60)<1),'DESKTOP_CARD_HEIGHT_NOT_60:'+width);
     }else{
       assert.equal(stats.labels.length,12,'MOBILE_V6_COUNT_DRIFT:'+width);
       assert(stats.labels.includes('HALF WIN')&&stats.labels.includes('HALF LOSS'),'MOBILE_V6_HALVES_MISSING');
     }
     assert.equal(stats.overflow,false,'KPI_HORIZONTAL_OVERFLOW:'+width);
     await page.screenshot({path:AUDIT+'/candidate-'+width+'.png'});
     await page.close();
   }
 }finally{await browser.close();}
 report.candidateVerified=true;
 report.phase='PRE_PROMOTION_GUARDS';save();
 assert.equal((await active()).version,initial.version,'ACTIVE_DRIFT_BEFORE_PROMOTION');
 const now=await settings();
 assert.deepEqual(now.domains,previous.domains,'DOMAIN_DRIFT');
 assert.deepEqual(now.schedules,previous.schedules,'SCHEDULE_DRIFT');
 assert.deepEqual(settingsOperational(now.set),settingsOperational(previous.set),'OPERATIONAL_SETTINGS_DRIFT');
 report.safeRollbackReady=true;report.phase='PROMOTING';save();
 report.newDeployment=await promote(newVersion,initial.version,'BALL46 MEMBER Desktop Statistics V3: 9 compact cards, total WIN/LOSS and recorded AVG ODDS');
 report.activated=true;report.phase='VERIFY_PRODUCTION';save();
 assert(await waitAsset('/styles.css',hash(nextCss),BASE),'PRODUCTION_CSS_NOT_UPDATED');
 assert(await waitAsset('/member.js',hash(nextJS),BASE),'PRODUCTION_JS_NOT_UPDATED');
 const verifiedLive=await publicInventory(otherFiles,BASE);
 assert.deepEqual(verifiedLive.mismatches,[],'PRODUCTION_UNTOUCHED_ASSET_CHANGED');
 assert.equal(verifiedLive.matches,37,'PRODUCTION_UNTOUCHED_ASSETS_COUNT_MISMATCH');
 const newMemberLive=await getPublic('/member.html',BASE);
 assert.equal(newMemberLive.status,oldMember.status,'MEMBER_ACCESS_BEHAVIOR_CHANGED');
 const liveConfig=await settings();
 assert.deepEqual(liveConfig.domains,previous.domains,'PRODUCTION_DOMAINS_DRIFT');
 assert.deepEqual(liveConfig.schedules,previous.schedules,'PRODUCTION_SCHEDULE_DRIFT');
 assert.deepEqual(settingsOperational(liveConfig.set),settingsOperational(previous.set),'PRODUCTION_OPERATIONAL_SETTINGS_DRIFT');
 assert.equal((await active()).version,newVersion,'PRODUCTION_ACTIVE_NOT_CANDIDATE');
 report.phase='COMPLETE';report.productionVerified=true;save();
 console.log('BALL46_MEMBER_DESKTOP_STATISTICS_V3_DEPLOY_SUCCESS',JSON.stringify({
  previousVersion:initial.version,newActiveVersion:newVersion,previousDeployment:initial.deployment,newDeployment:report.newDeployment,
  sourceAssets:files.length,unchangedAssetsVerified:37,onlyChangedAssets:['/member.js','/styles.css'],
  cssBefore:report.cssShaBefore,cssAfter:report.cssShaAfter,jsBefore:report.jsShaBefore,jsAfter:report.jsShaAfter,productionVerified:true
 }));
}catch(e){
 report.error=String(e.stack||e).slice(0,2600);report.phase='FAILED';
 console.error('BALL46_MEMBER_DESKTOP_STATISTICS_V3_DEPLOY_BLOCKED',String(e.message||e));
 try{
  if(initial&&newVersion){
   const current=await active();
   if(current.version===newVersion) {
     const dep=await promote(initial.version,newVersion,'Rollback Member Desktop Statistics V3 deployment after failed verification');
     report.rolledBack=true;report.rollbackDeployment=dep;
     assert.equal((await active()).version,initial.version,'ROLLBACK_NOT_CONFIRMED');
   }else if(current.version!==initial.version){report.foreignActiveDetected=true;report.noRollbackForeign=true;}
  }
 }catch(rollbackError){report.rollbackError=String(rollbackError);}
 save();
 process.exitCode=1;
}