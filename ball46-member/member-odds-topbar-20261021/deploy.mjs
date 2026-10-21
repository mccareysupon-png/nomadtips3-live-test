import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patch as rebuildV3,MARKER as V3_MARKER,GRADIENT_ID,STYLE} from '../member-signal-v3-20261020/theme.mjs';
import {patchOdds} from './patch.mjs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-odds-topbar-20261021';
const SCOPED='ball46-member/member-loading-20261020';
const OLD_VERSION='f8e5c136-ef14-43da-9042-d252acebfeec';
// The immutable active Cloudflare version ID above protects the exact Worker module bytes.
const OLD_CSS_SHA='bcff14935bd652d70209fb7996fd7034ad3009d109eae8e1f89a0e9002520f40';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER TOPBAR ODDS DEC FRA AM DISPLAY-ONLY',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'05c276f7f76a6226b10b45bd85ac369e53167d2f',target:W};
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
  annotations:{'workers/tag':'MEMBER-ODDS-TOPBAR-V1-20261021','workers/message':'BALL46 Member topbar Odds format display only, preserve V3 signal, half-result counts and worker'},
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
 const section=source.slice(begin,end);
 const winner="['WIN',s.win,'win']",loser="['LOSS',s.loss,'loss']";
 const newWinner="['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']";
 const newLoser="['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']";
 const updated=replaceOne(replaceOne(section,winner,newWinner,'WIN'),loser,newLoser,'LOSS');
 assert(!updated.includes("['HALF WIN'")&&!updated.includes("['HALF LOSS'"),'SEPARATE_HALF_KPI_PRESENT');
 const result=source.slice(0,begin)+updated+source.slice(end);
 assert.equal(result.replace(newWinner,winner).replace(newLoser,loser),source,'NON_COUNT_JS_CHANGED');
 return result;
}
function bustHalfMemberScript(html){
 let n=0;
 const patched=html.replace(/(src="\/member\.js\?[^"]+)"/,(_,prefix)=>{n++;return prefix+'&halfFold=20261021"';});
 assert.equal(n,1,'HALF_RESULT_CACHE_BUST_MISSING');
 assert.equal(patched.replace('&halfFold=20261021',''),html,'PROTECTED_HTML_CHANGED_BEYOND_CACHE');
 return patched;
}
async function browserOdds(browser,host,label,width,updatedHtml,expectedJsHash,expectedCssHash,expectedOddsJsHash){
 const page=await browser.newPage({viewport:{width,height:760,isMobile:width<=767,deviceScaleFactor:1}});
 try{
  await page.goto(host+'/?odds_ui_qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:55000});
  const memberJs=await getPublic('/member.js',host),styles=await getPublic('/member-odds-topbar.css',host),control=await getPublic('/member-odds-topbar.js',host);
  assert.equal(memberJs.sha,expectedJsHash,'ODDS_BROWSER_MEMBER_JS_WRONG');
  assert.equal(styles.sha,expectedCssHash,'ODDS_BROWSER_CSS_WRONG');
  assert.equal(control.sha,expectedOddsJsHash,'ODDS_BROWSER_CONTROL_WRONG');
  const first=updatedHtml.indexOf('<div class="b46-odds-wrap"'),last=updatedHtml.indexOf('<div class="topbar-account-slot">',first);
  assert(first>0&&last>first&&last-first<4000,'TOPBAR_ICON_MARKUP_NOT_FOUND');
  const fragment=updatedHtml.slice(first,last);
  await page.evaluate(markup=>{
   document.body.className='page-member';
   document.body.replaceChildren();
   const header=document.createElement('header');
   header.className='topbar';
   header.innerHTML='<div class="shell topbar-inner"><a class="brand" href="/pricing">ball46 <span class="brand-member">MEMBER</span></a><nav class="nav"><a href="#">Membership</a><a href="#">Signal Center</a></nav>'+markup+'<div class="topbar-account-slot"><div class="member-chip">MEMBER</div></div></div>';
   document.body.append(header);
   document.body.insertAdjacentHTML('beforeend','<main class="shell" style="padding-top:40px"><h1>Ball46 Member Odds Display QA</h1><p>Test fixture using the actual Production assets. No live account data.</p></main>');
  },fragment);
  await page.addStyleTag({url:host+'/member-odds-topbar.css'});
  await page.addScriptTag({url:host+'/member-odds-topbar.js'});
  const trigger=page.locator('#b46-member-odds-trigger'),menu=page.locator('#b46-member-odds-menu');
  assert.equal(await trigger.count(),1,'MEMBER_ODDS_TOPBAR_TRIGGER_COUNT');
  assert.equal(await menu.isHidden(),true,'ODDS_MENU_SHOULD_START_CLOSED');
  const initial=await page.evaluate(()=>window.Ball46MemberOdds?.formatOdds(1.91));
  assert.equal(initial,'@1.91','DEFAULT_DECIMAL_WRONG');
  await trigger.click();assert.equal(await menu.isVisible(),true,'TOPBAR_MENU_NOT_OPEN');
  await page.screenshot({path:AUDIT+'/'+label+'-'+width+'.png',fullPage:false});
  await page.locator('[data-b46-odds-format="FRA"]').click();
  const fra=await page.evaluate(()=>[window.Ball46MemberOdds.formatOdds(1.91),window.Ball46MemberOdds.formatOdds(2.5)]);
  assert.deepEqual(fra,['@10/11','@3/2'],'FRACTIONAL_CONVERSION_WRONG');
  await trigger.click();await page.locator('[data-b46-odds-format="AM"]').click();
  const american=await page.evaluate(()=>[window.Ball46MemberOdds.formatOdds(1.91),window.Ball46MemberOdds.formatOdds(2.5)]);
  assert.deepEqual(american,['@-110','@+150'],'AMERICAN_CONVERSION_WRONG');
  await trigger.click();await page.locator('[data-b46-odds-format="DEC"]').click();
  const back=await page.evaluate(()=>[window.Ball46MemberOdds.formatOdds(1.91),window.Ball46MemberOdds.formatOdds(2.5)]);
  assert.deepEqual(back,['@1.91','@2.50'],'DECIMAL_ROUNDTRIP_WRONG');
  await trigger.click();await page.keyboard.press('Escape');assert.equal(await menu.isHidden(),true,'ESCAPE_DID_NOT_CLOSE_MENU');
  await trigger.click();
  const popup=await menu.boundingBox();
  assert(popup&&popup.x>=-2&&popup.x+popup.width<=width+2,'MOBILE_ODDS_POPUP_CLIPPED');
  const errors=await page.evaluate(()=>({format:window.Ball46MemberOdds.getFormat(),cssLoaded:getComputedStyle(document.querySelector('.b46-odds-menu')).position}));
  assert.equal(errors.format,'DEC');
  return {width,default:initial,fractional:fra,american,decimalAgain:back,popup,style:errors};
 }finally{await page.close();}
}
let initial=null,newVersion=null;
try{
 assert(A&&T,'CLOUDFLARE_CREDENTIALS_MISSING');
 initial=await active();report.activeBefore=initial;
 assert.equal(initial.version,OLD_VERSION,'MEMBER_ACTIVE_VERSION_MOVED_STOP');
 const base=await getVersion(initial.version);
 assert.deepEqual(base.modules.map(m=>m.name),['worker.js'],'MEMBER_MAIN_MODULE_DRIFT');
 const runtimeHashes=base.modules.map(m=>({name:m.name,sha:hash(Buffer.from(m.content_base64,'base64'))}));
 const beforeSettings=await settings();
 assert.deepEqual(beforeSettings.domains,['member.ball46.com'],'MEMBER_DOMAIN_DRIFT');
 assert.equal(base.bindings.filter(b=>b.type==='secret_text').length,3,'MEMBER_SECRETS_DRIFT');
 assert(base.bindings.some(b=>b.type==='assets'&&b.name==='ASSETS'),'MEMBER_ASSETS_BINDING_MISSING');
 assert.equal(walk(DIR).length,40,'VERIFIED_PINNED_SOURCE_40_DRIFT');
 assert(readFileSync(DIR+'/member.html','utf8').includes('kpiV7=desktop-nine-in-one-row-20261020'),'MEMBER_HTML_SOURCE_DRIFT');
 const liveCss=await getPublic('/styles.css'),liveJs=await getPublic('/member.js');
 assert.equal(liveCss.status,200,'MEMBER_CSS_NOT_200');assert.equal(liveJs.status,200,'MEMBER_JS_NOT_200');
 assert.equal(liveCss.sha,'5186dd9dfa27c36b7dced6068b15a20d04ab8f15ab771e33d61116c8725b817d','LIVE_MEMBER_CSS_DRIFT');
 assert.equal(liveJs.sha,'6f62bf55ad0edbf3f3837d4754bc2a65e13ea62dcf27fd76b5d77780a2878acf','LIVE_MEMBER_JS_DRIFT');
 const v3Css=liveCss.data.toString('utf8'),v3End='\n'+STYLE+'\n';
 assert(v3Css.endsWith(v3End)&&v3Css.includes(V3_MARKER),'SIGNAL_V3_CSS_MISSING');
 const preV3Css=v3Css.slice(0,-v3End.length);
 assert.equal(hash(preV3Css),OLD_CSS_SHA,'MEMBER_PREV3_CSS_RESTORE_FAILED');
 const liveHalfJs=liveJs.data.toString('utf8');
 assert(liveHalfJs.includes("['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']"),'LIVE_HALF_WIN_COUNTER_MISSING');
 assert(liveHalfJs.includes("['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']"),'LIVE_HALF_LOSS_COUNTER_MISSING');
 const unwoundHalfJs=replaceOne(
  replaceOne(liveHalfJs,"['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']","['WIN',s.win,'win']",'REVERSE_HALF_WIN'),
  "['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']","['LOSS',s.loss,'loss']",'REVERSE_HALF_LOSS');
 assert.equal(hash(unwoundHalfJs),'729d3084c5934324b34ac7b07484b4807e5c855b67f0524fd82bfcc0833e0ac5','LIVE_HALF_COUNTS_UNWIND_MISMATCH');
 const preV3Js=unwindV3(unwoundHalfJs);
 assert.equal(hash(preV3Js),'58a580302fe247fce4c98d2fe06f185dddacb5fadd632d724e5633da026f562a','LIVE_V3_JS_UNWIND_MISMATCH');
 const splash=spawnSync('python3',[SCOPED+'/patch_member.py',DIR],{encoding:'utf8'});
 assert.equal(splash.status,0,'REBUILD_MEMBER_LOADER_FAILED '+splash.stderr+' '+splash.stdout);
 const restored=rebuildV3({html:readFileSync(DIR+'/member.html','utf8'),css:preV3Css,js:preV3Js});
 const reconstructed={html:bustHalfMemberScript(restored.html),js:foldSummary(restored.js),css:restored.css};
 assert.equal(hash(reconstructed.js),liveJs.sha,'LIVE_JS_RECONSTRUCTION_FAILED');
 assert.equal(hash(reconstructed.css),liveCss.sha,'LIVE_CSS_RECONSTRUCTION_FAILED');
 assert.equal(hash(reconstructed.html),'bcbb8eea2dfb5ad2852fbf8539f6ce8cf885a3807d0a758f41d9fd9af2a48b1b','PROTECTED_MEMBER_HTML_RECONSTRUCTION_CHANGED');
 for(const [key,file] of [['html','member.html'],['js','member.js'],['css','styles.css']])writeFileSync(DIR+'/'+file,reconstructed[key],'utf8');
 const previous=walk(DIR).map(p=>{const bytes=readFileSync(p);return {path:'/'+relative(DIR,p).replaceAll('\\','/'),bytes,sha:hash(bytes)};});
 assert.equal(previous.length,42,'PREVIEW_MEMBER_42_ASSETS_MISSING');
 const unchangedPublic=await publicInventory(previous.filter(x=>x.path!=='/member.html'),BASE);
 assert.deepEqual(unchangedPublic.mismatches,[],'REAL_MEMBER_PRODUCTION_ASSETS_CHANGED');
 assert.equal(unchangedPublic.matches,41,'MEMBER_ALL_41_PUBLIC_ASSETS_NOT_VERIFIED');
 const authBefore=await getPublic('/member.html');
 assert([302,303].includes(authBefore.status),'MEMBER_ACCESS_PROTECTION_MISSING');
 const healthBefore=await getPublic('/api/health');
 const updated=patchOdds({html:reconstructed.html,js:reconstructed.js});
 writeFileSync(DIR+'/member.html',updated.html,'utf8');
 writeFileSync(DIR+'/member.js',updated.js,'utf8');
 for(const [source,dest] of [
   ['ball46-member/member-odds-topbar-20261021/topbar.js','member-odds-topbar.js'],
   ['ball46-member/member-odds-topbar-20261021/topbar.css','member-odds-topbar.css']
 ])writeFileSync(DIR+'/'+dest,readFileSync(source));
 const jsCheck=spawnSync(process.execPath,['--check',DIR+'/member.js'],{encoding:'utf8'});
 const oddsCheck=spawnSync(process.execPath,['--check',DIR+'/member-odds-topbar.js'],{encoding:'utf8'});
 assert.equal(jsCheck.status,0,'MEMBER_JS_SYNTAX_WRONG '+jsCheck.stderr);
 assert.equal(oddsCheck.status,0,'MEMBER_ODDS_JS_SYNTAX_WRONG '+oddsCheck.stderr);
 assert(updated.html.includes('b46-member-loading')&&updated.js.includes('ball46:member-data-ready'),'MEMBER_LOADING_LOST');
 assert(updated.js.includes("['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']")&&updated.js.includes("['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']"),'MEMBER_HALF_RESULTS_LOST');
 assert(updated.js.includes(GRADIENT_ID)&&restored.css.includes(V3_MARKER),'EVENT_FLOW_SIGNAL_V3_LOST');
 const files=walk(DIR).map(p=>{const bytes=readFileSync(p);return {path:'/'+relative(DIR,p).replaceAll('\\','/'),bytes,sha:hash(bytes)};});
 assert.equal(files.length,44,'MEMBER_CANDIDATE_ASSET_COUNT_NOT_44');
 const changed=['/member.js','/member.html'];
 const added=['/member-odds-topbar.css','/member-odds-topbar.js'];
 const unchanged=files.filter(f=>!changed.includes(f.path)&&!added.includes(f.path));
 assert.equal(unchanged.length,40,'MEMBER_UNRELATED_ASSET_COUNT_NOT_40');
 for(const f of unchanged)assert.equal(f.sha,previous.find(p=>p.path===f.path)?.sha,'MEMBER_UNRELATED_ASSET_CHANGE_'+f.path);
 report.before={version:initial.version,publicMatches:41,protectedHtmlSha:hash(reconstructed.html),runtimeHashes};
 report.changed=changed.map(path=>({path,old:previous.find(x=>x.path===path)?.sha,new:files.find(x=>x.path===path)?.sha}));
 report.newAssets=added.map(path=>({path,sha:files.find(x=>x.path===path)?.sha}));
 save();
 assert.equal((await active()).version,initial.version,'MEMBER_WORKER_CHANGED_BEFORE_UPLOAD');
 const uploaded=await uploadAssets(files);
 report.uploaded={files:uploaded.files,newUploads:uploaded.uploaded};save();
 newVersion=await uploadVersion(initial.version,base,uploaded.completion);
 report.candidateVersion=newVersion;save();
 const candidate=await getVersion(newVersion);
 compareVersion(candidate,base);
 assert.deepEqual(candidate.modules.map(m=>({name:m.name,sha:hash(Buffer.from(m.content_base64,'base64'))})),runtimeHashes,'MEMBER_WORKER_RUNTIME_REGRESSION');
 const preview=candidate.urls?.find(x=>x.startsWith('https://'))||'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 report.candidatePreview=preview;
 const untouchedCheck=await publicInventory(unchanged,preview);
 assert.deepEqual(untouchedCheck.mismatches,[],'MEMBER_UNTOUCHED_CANDIDATE_ASSETS_CHANGED');
 assert.equal(untouchedCheck.matches,40,'MEMBER_UNTOUCHED_CANDIDATE_ASSET_COUNT');
 for(const path of [...changed.filter(x=>x==='/member.js'),...added]){
  const live=await getPublic(path,preview);
  assert.equal(live.status,200,'CANDIDATE_ASSET_NOT_AVAILABLE_'+path);
  assert.equal(live.sha,files.find(x=>x.path===path).sha,'CANDIDATE_ASSET_HASH_WRONG_'+path);
 }
 assert([302,303].includes((await getPublic('/member.html',preview)).status),'MEMBER_ACCESS_BYPASS_ON_CANDIDATE');
 const pricing=await getPublic('/',preview);
 assert.equal(pricing.status,200,'CANDIDATE_PUBLIC_PRICING_NOT_200');
 assert.equal(pricing.sha,unchanged.find(x=>x.path==='/pricing.html').sha,'MEMBER_PRICING_CHANGED');
 const browser=await chromium.launch({headless:true});
 try{
  report.candidateUi=[];
  for(const width of [1440,390])report.candidateUi.push(await browserOdds(browser,preview,'candidate',width,updated.html,files.find(x=>x.path==='/member.js').sha,files.find(x=>x.path==='/member-odds-topbar.css').sha,files.find(x=>x.path==='/member-odds-topbar.js').sha));
 }finally{await browser.close();}
 report.candidateQa=true;save();
 assert.equal((await active()).version,initial.version,'MEMBER_ACTIVE_MOVED_DURING_CANDIDATE_QA');
 const nowSettings=await settings();
 assert.deepEqual(nowSettings.domains,beforeSettings.domains,'MEMBER_DOMAINS_CHANGED');
 assert.deepEqual(nowSettings.schedules,beforeSettings.schedules,'MEMBER_CRON_CHANGED');
 assert.deepEqual(settingsOperational(nowSettings.set),settingsOperational(beforeSettings.set),'MEMBER_WORKER_SETTINGS_CHANGED');
 report.safeRollbackReady=true;save();
 report.deployment=await promote(newVersion,initial.version,'BALL46 Member ODDS Topbar DEC FRA AM — display only, V3 and HALF KPI preserved');
 report.activated=true;save();
 for(const path of ['/member.js',...added]){
  assert(await waitCss(files.find(x=>x.path===path).sha,BASE,path),'MEMBER_PRODUCTION_ASSET_NOT_PUBLISHED_'+path);
 }
 const otherAfter=await publicInventory(unchanged,BASE);
 assert.deepEqual(otherAfter.mismatches,[],'MEMBER_UNRELATED_PRODUCTION_ASSET_CHANGED');
 assert.equal(otherAfter.matches,40,'MEMBER_PRODUCTION_UNCHANGED_ASSET_COUNT');
 assert.equal((await getPublic('/member.html')).status,authBefore.status,'MEMBER_PROTECTION_CHANGED_AFTER_DEPLOY');
 const healthAfter=await getPublic('/api/health');
 assert.equal(healthAfter.status,healthBefore.status,'MEMBER_API_HEALTH_HTTP_CHANGED');
 assert.equal(healthAfter.sha,healthBefore.sha,'MEMBER_API_HEALTH_BODY_CHANGED');
 const pb=await chromium.launch({headless:true});
 try{
  report.productionUi=[];
  for(const width of [1440,390])report.productionUi.push(await browserOdds(pb,BASE,'production',width,updated.html,files.find(x=>x.path==='/member.js').sha,files.find(x=>x.path==='/member-odds-topbar.css').sha,files.find(x=>x.path==='/member-odds-topbar.js').sha));
 }finally{await pb.close();}
 const afterSettings=await settings();
 assert.deepEqual(afterSettings.domains,beforeSettings.domains,'MEMBER_DOMAIN_AFTER_DEPLOY_CHANGED');
 assert.deepEqual(afterSettings.schedules,beforeSettings.schedules,'MEMBER_SCHEDULE_AFTER_DEPLOY_CHANGED');
 assert.deepEqual(settingsOperational(afterSettings.set),settingsOperational(beforeSettings.set),'MEMBER_SETTINGS_AFTER_DEPLOY_CHANGED');
 assert.equal((await active()).version,newVersion,'MEMBER_CANDIDATE_NOT_ACTIVE');
 report.success=true;report.completedAt=new Date().toISOString();save();
 console.log('BALL46_MEMBER_ODDS_TOPBAR_DEPLOY_SUCCESS',JSON.stringify({previous:initial.version,activeVersion:newVersion,changed,added,untouched:40,workerPreserved:true,accessPreserved:true,v3Preserved:true,halfKpiPreserved:true,browserQa:'1440+390; DEC FRA AM'}));
}catch(e){
 report.success=false;report.error=String(e.stack||e);report.completedAt=new Date().toISOString();
 if(report.activated&&newVersion){
  try{const current=await active();
   if(current.version===newVersion){await promote(initial.version,newVersion,'Rollback Member odds display after failed verification');report.rolledBack=true;}
   else report.foreignVersionDetected=current.version;
  }catch(err){report.rollbackError=String(err);}
 }
 save();console.error('BALL46_MEMBER_ODDS_TOPBAR_SAFE_STOP',String(e.stack||e));process.exitCode=1;
}
