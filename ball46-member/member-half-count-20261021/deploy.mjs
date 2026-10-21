import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patch as rebuildV3,MARKER as V3_MARKER,GRADIENT_ID,STYLE} from '../member-signal-v3-20261020/theme.mjs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-win-loss-combined-20261021';
const SCOPED='ball46-member/member-loading-20261020';
const OLD_VERSION='1c45157e-90db-4af8-893a-d5aa08ddeca1';
// The immutable active Cloudflare version ID above protects the exact Worker module bytes.
const OLD_CSS_SHA='bcff14935bd652d70209fb7996fd7034ad3009d109eae8e1f89a0e9002520f40';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER HALF WIN AND HALF LOSS KPI FOLD',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'05c276f7f76a6226b10b45bd85ac369e53167d2f',target:W};
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
  annotations:{'workers/tag':'MEMBER-HALF-WIN-LOSS-FOLD-20261021','workers/message':'BALL46 Member summary KPI only; HALF_WIN included in WIN and HALF_LOSS in LOSS'},
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



function replaceOne(source,needle,replacement,name){
 assert.equal(source.split(needle).length-1,1,'SOURCE_ANCHOR_CHANGED_'+name);
 return source.replace(needle,replacement);
}
function unwindV3(live){
 const start="const __b46MemberSignalV3=svgNode('linearGradient',{id:'b46-member-eventflow-signal-v3-20261020'";
 const end='defs.append(gh,ga,__b46MemberSignalV3); svg.append(defs);';
 assert.equal(live.split(start).length-1,1,'V3_DEFS_START_CHANGED');
 assert.equal(live.split(end).length-1,1,'V3_DEFS_END_CHANGED');
 const i=live.indexOf(start),j=live.indexOf(end,i);
 assert(j>i&&j-i<1200,'V3_DEFS_LENGTH_CHANGED');
 return live.slice(0,i)+'defs.append(gh,ga); svg.append(defs);'+live.slice(j+end.length);
}
function foldSummary(source){
 const begin=source.indexOf('function renderSummary(){'),end=source.indexOf('function filteredRows(){',begin);
 assert(begin>=0&&end>begin&&end-begin<4500,'MEMBER_KPI_FUNCTION_CHANGED');
 const current=source.slice(begin,end);
 const win="['WIN',s.win,'win']",loss="['LOSS',s.loss,'loss']";
 const winNew="['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']";
 const lossNew="['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']";
 const revised=replaceOne(replaceOne(current,win,winNew,'WIN'),loss,lossNew,'LOSS');
 assert(!revised.includes("['HALF WIN'")&&!revised.includes("['HALF LOSS'"),'SEPARATE_HALF_KPI_PRESENT');
 const patched=source.slice(0,begin)+revised+source.slice(end);
 assert.equal(patched.replace(winNew,win).replace(lossNew,loss),source,'NON_DISPLAY_JS_CHANGE');
 return {patched,functionSource:revised};
}
function bustOnlyMemberScript(html){
 let n=0;
 const patched=html.replace(/(src="\/member\.js\?[^"]+)"/,(_,prefix)=>{n++;return prefix+'&halfFold=20261021"';});
 assert.equal(n,1,'MEMBER_SCRIPT_VERSION_ANCHOR_MISSING');
 assert.equal(patched.replace('&halfFold=20261021',''),html,'PROTECTED_HTML_CHANGED_BEYOND_VERSION');
 return patched;
}
async function testActualRenderSummary(browser,url,label,width,expectedSha,functionSource){
 const page=await browser.newPage({viewport:{width,height:820,isMobile:width<=700,deviceScaleFactor:1}});
 try{
  await page.goto(url+'/?memberHalfFoldTest='+Date.now(),{waitUntil:'domcontentloaded',timeout:52000});
  const fromPage=await getPublic('/member.js',url);
  assert.equal(fromPage.sha,expectedSha,'BROWSER_QA_PUBLIC_JS_SHA_CHANGED');
  await page.addStyleTag({url:url+'/styles.css'});
  const cases=[{win:4,halfWin:2,loss:3,halfLoss:1},{win:0,halfWin:1,loss:0,halfLoss:1},{win:0,halfWin:0,loss:0,halfLoss:0},{win:5,halfWin:0,loss:4,halfLoss:0}];
  const reports=[];
  for(const c of cases){
   const values=await page.evaluate(({functionSource,c})=>{
    const summary=document.createElement('section');summary.id='dailySummary';
    summary.style.cssText='max-width:1120px;margin:65px auto;';
    document.body.className='page-member';document.body.replaceChildren(summary);
    const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
    const counts={signals:9,win:c.win,halfWin:c.halfWin,loss:c.loss,halfLoss:c.halfLoss,push:0,pending:0,live:0,unresolved:0,void:0,pnl:1.25,winRate:56.5};
    const create=new Function('currentStats','state','averageRecordedOdds','fmtPct','fmtPnl','summary','node',functionSource+'\nreturn renderSummary;');
    const render=create(()=>counts,{payload:{signals:[]},market:'ALL'},()=>1.85,v=>String(v)+'%',v=>String(v),summary,node);
    render();
    return Object.fromEntries([...summary.querySelectorAll('.summary-stat')].map(e=>[e.querySelector('span')?.textContent,e.querySelector('b')?.textContent]));
   },{functionSource,c});
   assert.equal(Number(values.WIN),c.win+c.halfWin,'WIN_DID_NOT_INCLUDE_HALF_WIN');
   assert.equal(Number(values.LOSS),c.loss+c.halfLoss,'LOSS_DID_NOT_INCLUDE_HALF_LOSS');
   assert.equal(values['WIN RATE'],'56.5%','WIN_RATE_DISPLAY_CHANGED');
   assert.equal(values['P/L TODAY'],'1.25','PNL_DISPLAY_CHANGED');
   assert(!Object.hasOwn(values,'HALF WIN')&&!Object.hasOwn(values,'HALF LOSS'),'SEPARATE_HALF_CARDS_STILL_VISIBLE');
   reports.push({input:c,win:values.WIN,loss:values.LOSS});
   if(reports.length===1)await page.screenshot({path:AUDIT+'/'+label+'-'+width+'.png',fullPage:false});
  }
  return reports;
 }finally{await page.close();}
}
let initial=null,newVersion=null;
try{
 assert(A&&T,'CLOUDFLARE_CREDENTIALS_MISSING');
 initial=await active();report.activeBefore=initial;
 assert.equal(initial.version,OLD_VERSION,'MEMBER_PRODUCTION_VERSION_CHANGED');
 const base=await getVersion(initial.version);
 assert.deepEqual(base.modules.map(x=>x.name),['worker.js'],'MEMBER_WORKER_MODULE_CHANGED');
 const runtimeHashes=base.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))}));
 const beforeSettings=await settings();
 assert.deepEqual(beforeSettings.domains,['member.ball46.com'],'MEMBER_PRODUCTION_DOMAIN_WRONG');
 assert.equal(base.bindings.filter(x=>x.type==='secret_text').length,3,'MEMBER_SECRET_BINDINGS_CHANGED');
 assert(base.bindings.some(x=>x.type==='assets'&&x.name==='ASSETS'),'MEMBER_ASSET_BINDING_MISSING');
 assert.equal(walk(DIR).length,40,'PINNED_MEMBER_SOURCE_NOT_40_FILES');
 assert(readFileSync(DIR+'/member.html','utf8').includes('kpiV7=desktop-nine-in-one-row-20261020'),'PINNED_MEMBER_HTML_CHANGED');
 const liveCss=await getPublic('/styles.css'),liveJs=await getPublic('/member.js');
 assert.equal(liveCss.status,200,'MEMBER_CSS_NOT_200');
 assert.equal(liveJs.status,200,'MEMBER_JS_NOT_200');
 assert.equal(liveCss.sha,'5186dd9dfa27c36b7dced6068b15a20d04ab8f15ab771e33d61116c8725b817d','MEMBER_LIVE_CSS_HASH_CHANGED');
 assert.equal(liveJs.sha,'729d3084c5934324b34ac7b07484b4807e5c855b67f0524fd82bfcc0833e0ac5','MEMBER_LIVE_JS_HASH_CHANGED');
 assert(liveCss.data.toString('utf8').includes(V3_MARKER)&&liveJs.data.toString('utf8').includes(GRADIENT_ID),'V3_RUNTIME_ASSET_MARKERS_MISSING');
 const footer='\n'+STYLE+'\n';
 const cssV3=liveCss.data.toString('utf8');
 assert(cssV3.endsWith(footer),'MEMBER_V3_CSS_NOT_EXPECTED');
 const cssBeforeV3=cssV3.slice(0,-footer.length);
 assert.equal(hash(cssBeforeV3),OLD_CSS_SHA,'MEMBER_OLD_CSS_UNDO_FAILED');
 const jsBeforeV3=unwindV3(liveJs.data.toString('utf8'));
 assert.equal(hash(jsBeforeV3),'58a580302fe247fce4c98d2fe06f185dddacb5fadd632d724e5633da026f562a','MEMBER_V3_UNDO_FAILED');
 const splash=spawnSync('python3',[SCOPED+'/patch_member.py',DIR],{encoding:'utf8'});
 assert.equal(splash.status,0,'MEMBER_LOADER_REBUILD_FAILED '+splash.stderr+' '+splash.stdout);
 const restored=rebuildV3({html:readFileSync(DIR+'/member.html','utf8'),css:cssBeforeV3,js:jsBeforeV3});
 writeFileSync(DIR+'/member.html',restored.html,'utf8');
 writeFileSync(DIR+'/styles.css',restored.css,'utf8');
 writeFileSync(DIR+'/member.js',restored.js,'utf8');
 assert.equal(hash(restored.css),liveCss.sha,'V3_CSS_REBUILT_WRONG');
 assert.equal(hash(restored.js),liveJs.sha,'V3_JS_REBUILT_WRONG');
 const before=walk(DIR).map(absolute=>{const bytes=readFileSync(absolute);return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)};});
 assert.equal(before.length,42,'MEMBER_V3_ASSET_COUNT_WRONG');
 const publicCheck=await publicInventory(before.filter(x=>x.path!=='/member.html'),BASE);
 assert.deepEqual(publicCheck.mismatches,[],'CURRENT_MEMBER_ASSETS_NOT_FROM_VERIFIED_SOURCE');
 assert.equal(publicCheck.matches,41,'CURRENT_MEMBER_41_ASSETS_NOT_VALID');
 const authBefore=await getPublic('/member.html');
 assert([302,303].includes(authBefore.status),'MEMBER_PAGE_NOT_ACCESS_PROTECTED');
 const healthBefore=await getPublic('/api/health');
 const folded=foldSummary(restored.js);
 writeFileSync(DIR+'/member.js',folded.patched,'utf8');
 writeFileSync(DIR+'/member.html',bustOnlyMemberScript(restored.html),'utf8');
 const syntax=spawnSync(process.execPath,['--check',DIR+'/member.js'],{encoding:'utf8'});
 assert.equal(syntax.status,0,'MEMBER_NEW_JS_SYNTAX_FAILED '+syntax.stderr);
 const files=walk(DIR).map(absolute=>{const bytes=readFileSync(absolute);return {path:'/'+relative(DIR,absolute).replaceAll('\\','/'),bytes,sha:hash(bytes)};});
 assert.equal(files.length,42,'MEMBER_NEW_ASSET_COUNT_CHANGED');
 const modified=['/member.js','/member.html'],unchanged=files.filter(x=>!modified.includes(x.path));
 assert.equal(unchanged.length,40,'MEMBER_UNCHANGED_ASSET_COUNT_NOT_40');
 for(const f of unchanged)assert.equal(f.sha,before.find(x=>x.path===f.path)?.sha,'MEMBER_OTHER_ASSET_CHANGED_'+f.path);
 report.diff=files.filter(f=>before.find(x=>x.path===f.path)?.sha!==f.sha).map(f=>({path:f.path,shaBefore:before.find(x=>x.path===f.path).sha,shaAfter:f.sha}));
 assert.deepEqual(report.diff.map(x=>x.path).sort(),modified.sort(),'MEMBER_DIFF_SCOPE_NOT_2');
 report.before={version:initial.version,assetsMatched:41,moduleHashes:runtimeHashes,memberGate:authBefore.status};
 report.newJsSha=files.find(x=>x.path==='/member.js').sha;save();
 assert.equal((await active()).version,initial.version,'MEMBER_WORKER_CHANGED_BEFORE_UPLOAD');
 const uploaded=await uploadAssets(files);
 report.upload={total:uploaded.files,uploaded:uploaded.uploaded};save();
 newVersion=await uploadVersion(initial.version,base,uploaded.completion);
 report.candidateVersion=newVersion;save();
 const candidate=await getVersion(newVersion);
 compareVersion(candidate,base);
 assert.deepEqual(candidate.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))})),runtimeHashes,'MEMBER_WORKER_CODE_CHANGED');
 const preview=candidate.urls?.find(x=>x.startsWith('https://'))||'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 report.preview=preview;
 const others=await publicInventory(unchanged,preview);
 assert.deepEqual(others.mismatches,[],'CANDIDATE_UNRELATED_ASSET_MISMATCH');
 assert.equal(others.matches,40,'CANDIDATE_UNRELATED_ASSET_COUNT');
 assert.equal((await getPublic('/member.js',preview)).sha,report.newJsSha,'CANDIDATE_JS_HASH_WRONG');
 assert([302,303].includes((await getPublic('/member.html',preview)).status),'CANDIDATE_BYPASSES_MEMBER_AUTH');
 const price=await getPublic('/',preview);
 assert.equal(price.status,200,'MEMBER_PRICING_PREVIEW_UNAVAILABLE');
 assert.equal(price.sha,unchanged.find(x=>x.path==='/pricing.html')?.sha,'MEMBER_PRICING_CHANGED');
 const browser=await chromium.launch({headless:true});
 try{
  report.previewUi=[];
  for(const width of [1440,390])report.previewUi.push({width,test:await testActualRenderSummary(browser,preview,'candidate',width,report.newJsSha,folded.functionSource)});
 }finally{await browser.close();}
 report.candidateVerified=true;save();
 assert.equal((await active()).version,initial.version,'MEMBER_ACTIVE_DRIFT_BEFORE_PROMOTION');
 const settingsBeforeDeploy=await settings();
 assert.deepEqual(settingsBeforeDeploy.domains,beforeSettings.domains,'MEMBER_DOMAIN_DRIFT');
 assert.deepEqual(settingsBeforeDeploy.schedules,beforeSettings.schedules,'MEMBER_SCHEDULE_DRIFT');
 assert.deepEqual(settingsOperational(settingsBeforeDeploy.set),settingsOperational(beforeSettings.set),'MEMBER_SETTINGS_DRIFT');
 report.safeRollbackReady=true;save();
 report.deployId=await promote(newVersion,initial.version,'BALL46 Member Summary WIN adds HALF_WIN, LOSS adds HALF_LOSS. KPI only.');
 report.activated=true;save();
 assert(await waitCss(report.newJsSha,BASE,'/member.js'),'NEW_MEMBER_JS_NOT_VISIBLE');
 const unchangedAfter=await publicInventory(unchanged,BASE);
 assert.deepEqual(unchangedAfter.mismatches,[],'UNRELATED_MEMBER_ASSET_CHANGED_IN_PRODUCTION');
 assert.equal(unchangedAfter.matches,40,'PRODUCTION_ASSET_COUNT_NOT_40');
 assert.equal((await getPublic('/member.html')).status,authBefore.status,'MEMBER_ACCESS_REDIRECT_CHANGED');
 const healthAfter=await getPublic('/api/health');
 assert.equal(healthAfter.status,healthBefore.status,'MEMBER_HEALTH_HTTP_CHANGED');
 assert.equal(healthAfter.sha,healthBefore.sha,'MEMBER_HEALTH_RESPONSE_CHANGED');
 const pb=await chromium.launch({headless:true});
 try{
  report.productionUi=[];
  for(const width of [1440,390])report.productionUi.push({width,test:await testActualRenderSummary(pb,BASE,'production',width,report.newJsSha,folded.functionSource)});
 }finally{await pb.close();}
 const settingsAfter=await settings();
 assert.deepEqual(settingsAfter.domains,beforeSettings.domains,'MEMBER_DOMAIN_CHANGED_AFTER');
 assert.deepEqual(settingsAfter.schedules,beforeSettings.schedules,'MEMBER_CRON_CHANGED_AFTER');
 assert.deepEqual(settingsOperational(settingsAfter.set),settingsOperational(beforeSettings.set),'MEMBER_SETTINGS_CHANGED_AFTER');
 assert.equal((await active()).version,newVersion,'MEMBER_NEW_VERSION_NOT_ACTIVE');
 report.success=true;report.completedAt=new Date().toISOString();save();
 console.log('BALL46_MEMBER_HALF_FOLD_DEPLOY_SUCCESS',JSON.stringify({before:initial.version,after:newVersion,modified:report.diff.map(x=>x.path),unchangedAssets:40,memberAccessPreserved:true,workerCodePreserved:true,winAndLossCombined:true}));
}catch(e){
 report.success=false;report.error=String(e.stack||e);report.completedAt=new Date().toISOString();
 if(report.activated&&newVersion){
  try{const current=await active();if(current.version===newVersion){await promote(initial.version,newVersion,'Rollback Member half results display after failed verification');report.rolledBack=true;}
   else report.foreignVersionDetected=current.version;
  }catch(err){report.rollbackError=String(err);}
 }
 save();console.error('BALL46_MEMBER_HALF_FOLD_SAFE_STOP',String(e.stack||e));process.exitCode=1;
}
