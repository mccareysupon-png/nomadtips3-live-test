import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patch as rebuildV3,MARKER as V3_MARKER,GRADIENT_ID,STYLE} from '../member-signal-v3-20261020/theme.mjs';
import {patchOdds} from '../member-odds-topbar-20261021/patch.mjs';
import {patchPremiumTopbar,PREMIUM_CSS,SVG_AFTER,ICON_MARKER} from './premium.mjs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-odds-topbar-premium-v2-20261021';
const SCOPED='ball46-member/member-loading-20261020';
const OLD_VERSION='83e2727d-360a-481e-9884-eae184d0a7fa';
// The immutable active Cloudflare version ID above protects the exact Worker module bytes.
const OLD_CSS_SHA='bcff14935bd652d70209fb7996fd7034ad3009d109eae8e1f89a0e9002520f40';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER 4-COLUMN HEADER FIX & PREMIUM ODDS ICON V2',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'05c276f7f76a6226b10b45bd85ac369e53167d2f',target:W};
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
  annotations:{'workers/tag':'MEMBER-HEADER-PREMIUM-ODDS-V2-20261021','workers/message':'Member header four-column alignment and premium ODDS icon only; preserve all app logic and bindings'},
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





function replaceOne(source,needle,replacement,label){
 assert.equal(source.split(needle).length-1,1,'SOURCE_ANCHOR_DRIFT_'+label);
 return source.replace(needle,replacement);
}
function unwindV3(live){
 const start="const __b46MemberSignalV3=svgNode('linearGradient',{id:'b46-member-eventflow-signal-v3-20261020'";
 const end='defs.append(gh,ga,__b46MemberSignalV3); svg.append(defs);';
 assert.equal(live.split(start).length-1,1,'MEMBER_V3_START_DRIFT');
 assert.equal(live.split(end).length-1,1,'MEMBER_V3_END_DRIFT');
 const i=live.indexOf(start),j=live.indexOf(end,i);
 assert(j>i&&j-i<1200,'MEMBER_V3_STRUCTURE_DRIFT');
 return live.slice(0,i)+'defs.append(gh,ga); svg.append(defs);'+live.slice(j+end.length);
}
function foldSummary(source){
 const begin=source.indexOf('function renderSummary(){'),end=source.indexOf('function filteredRows(){',begin);
 assert(begin>=0&&end>begin&&end-begin<4500,'MEMBER_SUMMARY_FUNCTION_DRIFT');
 const section=source.slice(begin,end);
 const updated=replaceOne(replaceOne(section,"['WIN',s.win,'win']","['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']",'WIN'),"['LOSS',s.loss,'loss']","['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']",'LOSS');
 return source.slice(0,begin)+updated+source.slice(end);
}
function bustHalfMemberScript(html){
 let count=0;
 const result=html.replace(/(src="\/member\.js\?[^"]+)"/,(_x,p)=>{count++;return p+'&halfFold=20261021"';});
 assert.equal(count,1,'HALF_FOLD_SCRIPT_VERSION_DRIFT');
 return result;
}
async function browserHeader(browser,host,label,width,updatedHtml,expectedPremiumCssSha,expectedJsSha){
 const page=await browser.newPage({viewport:{width,height:800,isMobile:width<=680,deviceScaleFactor:1}});
 try{
  await page.goto(host+'/?member_header_premium_qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:58000});
  const controls=await getPublic('/member-odds-topbar.css',host);
  assert.equal(controls.sha,expectedPremiumCssSha,'PREMIUM_STYLES_NOT_LIVE_ON_BROWSER_HOST');
  assert.equal((await getPublic('/member.js',host)).sha,expectedJsSha,'MEMBER_APP_JS_CHANGED_IN_BROWSER_QA');
  const headerStart=updatedHtml.indexOf('<header class="topbar">');
  const headerEnd=updatedHtml.indexOf('</header>',headerStart);
  assert(headerStart>=0&&headerEnd>headerStart,'REAL_MEMBER_HEADER_MARKUP_MISSING');
  const fragment=updatedHtml.slice(headerStart,headerEnd+'</header>'.length);
  await page.evaluate(markup=>{
   document.body.className='page-member';
   document.body.replaceChildren();
   document.body.insertAdjacentHTML('afterbegin',markup);
   document.body.insertAdjacentHTML('beforeend','<main class="shell" style="min-height:300px"><h1 style="font-size:18px">Member header layout QA</h1><p>Production CSS and protected Member header template.</p></main>');
  },fragment);
  await page.addStyleTag({url:host+'/styles.css'});
  await page.addStyleTag({url:host+'/member-odds-topbar.css'});
  await page.addScriptTag({url:host+'/member-odds-topbar.js'});
  const observed=await page.evaluate(()=>{
   const rect=q=>{const el=document.querySelector(q),r=el?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,middleY:(r.top+r.bottom)/2}:null};
   const container=document.querySelector('.topbar-inner');
   return {header:rect('.topbar'),brand:rect('.topbar .brand'),nav:rect('.topbar .nav'),
    icon:rect('.topbar .b46-odds-trigger'),account:rect('.topbar .topbar-account-slot'),
    memberChip:rect('.topbar .member-chip'),
    grid:getComputedStyle(container).gridTemplateColumns,
    iconCircleCount:document.querySelectorAll('.b46-odds-trigger svg circle').length,
    premiumMarker:[...document.styleSheets].length>0,
    docWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth
   };
  });
  assert.equal(observed.iconCircleCount,3,'PREMIUM_ODDS_SVG_NOT_RENDERED');
  assert(observed.memberChip&&observed.memberChip.width>48&&observed.account,'MEMBER_IDENTITY_NOT_VISIBLE '+width+' '+JSON.stringify(observed));
  assert(Math.abs(observed.account.middleY-observed.brand.middleY)<=9,'MEMBER_ACCOUNT_DROPPED_TO_SECOND_ROW '+width+' '+JSON.stringify(observed));
  assert(Math.abs(observed.icon.middleY-observed.brand.middleY)<=9,'ODDS_ICON_NOT_ALIGNED '+width);
  assert(observed.account.bottom<=observed.header.bottom+3,'MEMBER_ACCOUNT_BELOW_HEADER '+width);
  assert(observed.icon.right<=observed.account.left+2,'ICON_COLLIDES_WITH_MEMBER_ACCOUNT '+width);
  assert(observed.docWidth<=width+2,'HORIZONTAL_OVERFLOW '+width);
  assert.equal(observed.grid.split(' ').length,width<=680?3:4,'GRID_COLUMN_COUNT_WRONG '+width);
  const trigger=page.locator('#b46-member-odds-trigger');
  const menu=page.locator('#b46-member-odds-menu');
  await trigger.click();assert.equal(await menu.isVisible(),true,'ODDS_MENU_CANNOT_OPEN '+width);
  const popup=await menu.boundingBox();
  assert(popup&&popup.x>=-2&&popup.x+popup.width<=width+2,'ODDS_MENU_OFFSCREEN '+width+' '+JSON.stringify(popup));
  await page.screenshot({path:AUDIT+'/'+label+'-'+width+'.png',fullPage:false});
  await page.locator('[data-b46-odds-format="FRA"]').click();
  assert.equal(await page.evaluate(()=>window.Ball46MemberOdds.formatOdds(1.91)),'@10/11','FRA_FORMAT_BROKEN');
  await trigger.click();await page.locator('[data-b46-odds-format="AM"]').click();
  assert.equal(await page.evaluate(()=>window.Ball46MemberOdds.formatOdds(2.50)),'@+150','AM_FORMAT_BROKEN');
  await trigger.click();await page.locator('[data-b46-odds-format="DEC"]').click();
  assert.equal(await page.evaluate(()=>window.Ball46MemberOdds.formatOdds(1.91)),'@1.91','DEC_FORMAT_BROKEN');
  return {width,layout:observed,popup,formatsPassed:true};
 }finally{await page.close();}
}
let initial=null,newVersion=null;
try{
 assert(A&&T,'CLOUDFLARE_SECRETS_MISSING');
 initial=await active();report.activeBefore=initial;
 assert.equal(initial.version,OLD_VERSION,'MEMBER_WORKER_VERSION_MOVED_STOP');
 const base=await getVersion(initial.version);
 assert.deepEqual(base.modules.map(m=>m.name),['worker.js'],'MEMBER_WORKER_MODULES_CHANGED');
 const runtime=base.modules.map(m=>({name:m.name,sha:hash(Buffer.from(m.content_base64,'base64'))}));
 const settingsBefore=await settings();
 assert.deepEqual(settingsBefore.domains,['member.ball46.com'],'MEMBER_DOMAIN_CHANGED');
 assert.equal(base.bindings.filter(b=>b.type==='secret_text').length,3,'MEMBER_SECRET_BINDINGS_CHANGED');
 assert(base.bindings.some(b=>b.type==='assets'&&b.name==='ASSETS'),'ASSETS_BINDING_MISSING');
 assert.equal(walk(DIR).length,40,'PINNED_MEMBER_ASSETS_NOT_40');
 const currentCss=await getPublic('/styles.css'),currentJs=await getPublic('/member.js');
 const currentOddsCss=await getPublic('/member-odds-topbar.css'),currentOddsJs=await getPublic('/member-odds-topbar.js');
 assert.equal(currentCss.sha,'5186dd9dfa27c36b7dced6068b15a20d04ab8f15ab771e33d61116c8725b817d','MEMBER_BASE_CSS_MOVED');
 assert.equal(currentJs.sha,'ef4489618ae07303a7f275b4b37fddd0f7a8cb721bf98d3216c887128c806524','MEMBER_MAIN_JS_MOVED');
 assert.equal(currentOddsCss.sha,'97f544c20ab10ad1d44b1ecd29ea590fc41d3435e0698824ceefb21b1ce7282b','MEMBER_ODDS_V1_CSS_MOVED');
 assert.equal(currentOddsJs.sha,'12265bd447751f9223860a852196bc97a576e1c70a08020343f12524698848c7','MEMBER_ODDS_V1_JS_MOVED');
 const v3Css=currentCss.data.toString('utf8'),footer='\n'+STYLE+'\n';
 assert(v3Css.endsWith(footer),'MEMBER_EVENTFLOW_V3_CSS_MARKER_MISSING');
 const beforeV3Css=v3Css.slice(0,-footer.length);
 assert.equal(hash(beforeV3Css),OLD_CSS_SHA,'MEMBER_V3_CSS_RECONSTRUCTION_UNSAFE');
 const oddsV1Js=currentJs.data.toString('utf8');
 const oldFmt="function fmtOdds(v){\n  const fmt=window.Ball46MemberOdds;\n  if(fmt&&typeof fmt.formatOdds==='function')return fmt.formatOdds(v);\n  const n=Number(v);return Number.isFinite(n)?'@'+n.toFixed(2):'—';\n}";
 const initialFmt="function fmtOdds(v){\n  const n=Number(v);\n  return Number.isFinite(n)?'@'+n.toFixed(2):'—';\n}";
 const hook="window.addEventListener('ball46:member-odds-format-change',()=>{if(state.payload)render();});\n";
 const oldVersionJs=replaceOne(replaceOne(oddsV1Js,oldFmt,initialFmt,'UNDO_ODDS_FMTOdds'),hook,'','UNDO_ODDS_HOOK');
 assert.equal(hash(oldVersionJs),'6f62bf55ad0edbf3f3837d4754bc2a65e13ea62dcf27fd76b5d77780a2878acf','MEMBER_ODDS_V1_UNDO_FAILED');
 const beforeHalf=replaceOne(replaceOne(oldVersionJs,"['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']","['WIN',s.win,'win']",'UNDO_WIN'),"['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']","['LOSS',s.loss,'loss']",'UNDO_LOSS');
 assert.equal(hash(beforeHalf),'729d3084c5934324b34ac7b07484b4807e5c855b67f0524fd82bfcc0833e0ac5','MEMBER_HALF_FOLD_UNDO_FAILED');
 const beforeV3Js=unwindV3(beforeHalf);
 assert.equal(hash(beforeV3Js),'58a580302fe247fce4c98d2fe06f185dddacb5fadd632d724e5633da026f562a','MEMBER_V3_JS_RECONSTRUCTION_FAILED');
 const loader=spawnSync('python3',[SCOPED+'/patch_member.py',DIR],{encoding:'utf8'});
 assert.equal(loader.status,0,'MEMBER_LOADER_REBUILD_ERROR '+loader.stderr+' '+loader.stdout);
 const restored=rebuildV3({html:readFileSync(DIR+'/member.html','utf8'),css:beforeV3Css,js:beforeV3Js});
 const half={html:bustHalfMemberScript(restored.html),js:foldSummary(restored.js)};
 const oddsV1=patchOdds({html:half.html,js:half.js});
 assert.equal(hash(oddsV1.html),'d31769f8a7bdd2583e0d668947157ba6a63207d37a35da7c679c2f635a8c662b','ODDS_V1_PROTECTED_HTML_DRIFT');
 assert.equal(hash(oddsV1.js),currentJs.sha,'ODDS_V1_MEMBER_JS_REBUILD_MISMATCH');
 writeFileSync(DIR+'/member.html',oddsV1.html,'utf8');
 writeFileSync(DIR+'/member.js',oddsV1.js,'utf8');
 writeFileSync(DIR+'/styles.css',restored.css,'utf8');
 writeFileSync(DIR+'/member-odds-topbar.css',currentOddsCss.data);
 writeFileSync(DIR+'/member-odds-topbar.js',currentOddsJs.data);
 const existing=walk(DIR).map(f=>{const bytes=readFileSync(f);return {path:'/'+relative(DIR,f).replaceAll('\\','/'),sha:hash(bytes),bytes};});
 assert.equal(existing.length,44,'LATEST_MEMBER_44_FILES_MISSING');
 const productionPublic=await publicInventory(existing.filter(f=>f.path!=='/member.html'),BASE);
 assert.deepEqual(productionPublic.mismatches,[],'LATEST_MEMBER_PUBLIC_ASSET_DRIFT');
 assert.equal(productionPublic.matches,43,'MEMBER_43_PUBLIC_ASSET_CHECK_FAILED');
 const protectedBefore=await getPublic('/member.html');
 assert([302,303].includes(protectedBefore.status),'MEMBER_ACCESS_GATE_CHANGED');
 const healthBefore=await getPublic('/api/health');
 const fixed=patchPremiumTopbar({html:oddsV1.html,css:currentOddsCss.data.toString('utf8')});
 writeFileSync(DIR+'/member.html',fixed.html,'utf8');
 writeFileSync(DIR+'/member-odds-topbar.css',fixed.css,'utf8');
 assert.equal(fixed.html.replace('member-odds-topbar.css?v=20261021-topbar-premium-v2','member-odds-topbar.css?v=20261021-topbar-v1').replace(SVG_AFTER,'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg>'),oddsV1.html,'UNRELATED_MEMBER_HTML_CHANGE');
 assert(fixed.css.endsWith(PREMIUM_CSS+'\n')&&fixed.css.includes(ICON_MARKER),'PREMIUM_CSS_NOT_APPENDED');
 const files=walk(DIR).map(f=>{const bytes=readFileSync(f);return {path:'/'+relative(DIR,f).replaceAll('\\','/'),sha:hash(bytes),bytes};});
 const modified=['/member.html','/member-odds-topbar.css'];
 assert.equal(files.length,44,'PREMIUM_CANDIDATE_ASSET_COUNT_CHANGED');
 const untouched=files.filter(f=>!modified.includes(f.path));
 assert.equal(untouched.length,42,'UNTOUCHED_MEMBER_ASSET_COUNT_NOT_42');
 for(const f of untouched)assert.equal(f.sha,existing.find(x=>x.path===f.path)?.sha,'MEMBER_UNRELATED_ASSET_CHANGED_'+f.path);
 report.before={version:initial.version,publicIdentical:43,protectedHtmlHash:hash(oddsV1.html),workerHashes:runtime};
 report.modified=files.filter(f=>existing.find(x=>x.path===f.path)?.sha!==f.sha).map(f=>({path:f.path,before:existing.find(x=>x.path===f.path)?.sha,after:f.sha}));
 assert.deepEqual(report.modified.map(x=>x.path).sort(),modified.sort(),'MEMBER_DIFF_SCOPE_EXCEEDED');
 save();
 assert.equal((await active()).version,initial.version,'MEMBER_WORKER_MOVED_BEFORE_ASSET_UPLOAD');
 const uploaded=await uploadAssets(files);
 report.upload={fileCount:uploaded.files,uploaded:uploaded.uploaded};save();
 newVersion=await uploadVersion(initial.version,base,uploaded.completion);
 report.candidate=newVersion;save();
 const candidate=await getVersion(newVersion);
 compareVersion(candidate,base);
 assert.deepEqual(candidate.modules.map(m=>({name:m.name,sha:hash(Buffer.from(m.content_base64,'base64'))})),runtime,'MEMBER_WORKER_RUNTIME_CHANGED');
 const preview=candidate.urls?.find(x=>x.startsWith('https://'))||'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 report.preview=preview;
 const unmodified=await publicInventory(untouched,preview);
 assert.deepEqual(unmodified.mismatches,[],'CANDIDATE_UNRELATED_FILES_CHANGED');
 assert.equal(unmodified.matches,42,'CANDIDATE_UNMODIFIED_FILES_COUNT');
 const premium=await getPublic('/member-odds-topbar.css',preview);
 assert.equal(premium.status,200,'CANDIDATE_PREMIUM_CSS_NOT_AVAILABLE');
 assert.equal(premium.sha,files.find(f=>f.path==='/member-odds-topbar.css').sha,'CANDIDATE_PREMIUM_CSS_SHA_MISMATCH');
 assert([302,303].includes((await getPublic('/member.html',preview)).status),'CANDIDATE_MEMBERSHIP_GATE_BYPASSED');
 const browser=await chromium.launch({headless:true});
 try{
  report.candidateBrowsers=[];
  for(const width of [1440,1024,768,680,390,320])
   report.candidateBrowsers.push(await browserHeader(browser,preview,'candidate',width,fixed.html,premium.sha,currentJs.sha));
 }finally{await browser.close();}
 report.candidateVerified=true;save();
 assert.equal((await active()).version,initial.version,'MEMBER_VERSION_CHANGED_DURING_BROWSER_QA');
 const now=await settings();
 assert.deepEqual(now.domains,settingsBefore.domains,'MEMBER_DOMAIN_CHANGED_BEFORE_DEPLOY');
 assert.deepEqual(now.schedules,settingsBefore.schedules,'MEMBER_CRON_CHANGED_BEFORE_DEPLOY');
 assert.deepEqual(settingsOperational(now.set),settingsOperational(settingsBefore.set),'MEMBER_SETTINGS_CHANGED_BEFORE_DEPLOY');
 report.safeRollbackReady=true;save();
 report.deployment=await promote(newVersion,initial.version,'Member header 4-column alignment + premium silver odds icon V2');
 report.activated=true;save();
 assert(await waitCss(premium.sha,BASE,'/member-odds-topbar.css'),'MEMBER_PREMIUM_CSS_NOT_VISIBLE_AFTER_DEPLOY');
 const otherAfter=await publicInventory(untouched,BASE);
 assert.deepEqual(otherAfter.mismatches,[],'OTHER_PRODUCTION_MEMBER_ASSETS_CHANGED');
 assert.equal(otherAfter.matches,42,'PRODUCTION_UNMODIFIED_MEMBER_COUNT_FAILED');
 assert.equal((await getPublic('/member.html')).status,protectedBefore.status,'MEMBER_ACCESS_GATE_CHANGED_AFTER');
 const healthAfter=await getPublic('/api/health');
 assert.equal(healthAfter.status,healthBefore.status,'MEMBER_HEALTH_HTTP_CHANGED');
 assert.equal(healthAfter.sha,healthBefore.sha,'MEMBER_HEALTH_RESPONSE_CHANGED');
 const pb=await chromium.launch({headless:true});
 try{
  report.productionBrowsers=[];
  for(const width of [1440,1024,768,680,390,320])
   report.productionBrowsers.push(await browserHeader(pb,BASE,'production',width,fixed.html,premium.sha,currentJs.sha));
 }finally{await pb.close();}
 const finalSettings=await settings();
 assert.deepEqual(finalSettings.domains,settingsBefore.domains,'MEMBER_DOMAIN_CHANGED_AFTER');
 assert.deepEqual(finalSettings.schedules,settingsBefore.schedules,'MEMBER_CRON_CHANGED_AFTER');
 assert.deepEqual(settingsOperational(finalSettings.set),settingsOperational(settingsBefore.set),'MEMBER_SETTINGS_CHANGED_AFTER');
 assert.equal((await active()).version,newVersion,'MEMBER_DEPLOYED_VERSION_NOT_ACTIVE');
 report.success=true;report.completedAt=new Date().toISOString();save();
 console.log('BALL46_MEMBER_PREMIUM_TOPBAR_V2_DEPLOY_SUCCESS',JSON.stringify({before:initial.version,after:newVersion,modified,untouched:42,workerUnchanged:true,loginPreserved:true,desktopAndMobileVerified:[1440,1024,768,680,390,320]}));
}catch(e){
 report.success=false;report.error=String(e.stack||e);report.completedAt=new Date().toISOString();
 if(report.activated&&newVersion){
   try{const curr=await active();
    if(curr.version===newVersion){await promote(initial.version,newVersion,'Rollback Premium Topbar V2 after failed browser verification');report.rolledBack=true;}
    else report.foreignVersionDetected=curr.version;
   }catch(err){report.rollbackError=String(err);}
 }
 save();console.error('BALL46_MEMBER_PREMIUM_TOPBAR_V2_SAFE_STOP',String(e.stack||e));process.exitCode=1;
}
