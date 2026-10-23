import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patch as rebuildV3,MARKER as V3_MARKER,GRADIENT_ID,STYLE} from '../member-signal-v3-20261020/theme.mjs';
import {patchOdds} from '../member-odds-topbar-20261021/patch.mjs';
import {patchPremiumTopbar,PREMIUM_CSS,SVG_AFTER,ICON_MARKER} from '../member-odds-topbar-premium-v2-20261021/premium.mjs';
import {patchOddsBorderless,CSS as BORDERLESS_CSS,MARKER as BORDERLESS_MARKER} from '../member-odds-borderless-v3-20261021/borderless.mjs';
import {patchGlass55,CSS as GLASS_CSS,MARKER as GLASS_MARKER} from '../member-odds-glass55-v4-20261021/glass55.mjs';
import {patchOpacity75,CSS as OPACITY75_CSS,MARKER as OPACITY75_MARKER} from '../member-odds-opacity75-v5-20261021/opacity75.mjs';
import {patchOpacity85,CSS as OPACITY85_CSS,MARKER as OPACITY85_MARKER} from '../member-odds-opacity85-v6-20261021/opacity85.mjs';
import {patchSolid,CSS as SOLID_CSS,MARKER as SOLID_MARKER} from '../member-odds-solid-v7-20261021/solid.mjs';
import {patchSignal1x,CSS as SIGNAL1X_CSS,MARKER as SIGNAL1X_MARKER} from './flat.mjs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-winrate-mathematics-20261023';
const SCOPED='ball46-member/member-loading-20261020';
const OLD_VERSION='6ba427b5-579a-4cc4-928d-2b32f393daba';
// The immutable active Cloudflare version ID above protects the exact Worker module bytes.
const OLD_CSS_SHA='bcff14935bd652d70209fb7996fd7034ad3009d109eae8e1f89a0e9002520f40';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER WIN RATE MATH - HALF WIN COUNTS AS WIN HALF LOSS COUNTS AS LOSS',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'05c276f7f76a6226b10b45bd85ac369e53167d2f',target:W};
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
async function uploadVersion(oldVersion,old,completion,patchedRuntime){
 assert.equal((await active()).version,oldVersion,'ACTIVE_DRIFT_BEFORE_VERSION_UPLOAD');
 const payload={
  main_module:old.main_module,
  modules:old.modules.map(m=>m.name===old.main_module?{...m,content_base64:Buffer.from(patchedRuntime,'utf8').toString('base64')}:m),
  bindings:old.bindings.map(b=>b.type==='assets'?{name:b.name,type:'assets'}:{name:b.name,type:'inherit',version_id:oldVersion}),
  assets:{jwt:completion,config:old.assets.config},
  compatibility_date:old.compatibility_date,
  compatibility_flags:old.compatibility_flags||[],
  usage_model:old.usage_model,
  annotations:{'workers/tag':'MEMBER-WINRATE-MATHEMATICS-20261023','workers/message':'Member WIN RATE mathematically consistent with half-win merged into win, half-loss merged into loss; preserve assets and P/L'},
 };
 for(const k of ['limits','placement'])if(old[k])payload[k]=old[k];
 const version=await cf('/workers/workers/'+W+'/versions?deploy=false&bindings_inherit=strict',payload);
 const id=version?.id;
 assert(id&&/^[a-f0-9-]{36}$/.test(id),'VERSION_CREATE_ID_MISSING');
 return id;
}
function compareVersion(candidate,base,expectedWorkerSha){
 const changed=candidate.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))}));
 const unchanged=base.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))}));
 assert.equal(changed.length,unchanged.length,'WORKER_MODULE_COUNT_CHANGED');
 assert.deepEqual(changed.map(x=>x.name),unchanged.map(x=>x.name),'WORKER_MODULE_NAMES_CHANGED');
 for(let i=0;i<changed.length;i++)if(changed[i].name!==base.main_module)assert.equal(changed[i].sha,unchanged[i].sha,'UNRELATED_MODULE_CHANGED');
 assert.equal(changed.find(x=>x.name===base.main_module).sha,expectedWorkerSha,'MATH_WORKER_MODULE_SHA_NOT_EXPECTED');
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
async function browserHeader(browser,host,label,width,updatedHtml,expectedPremiumCssSha,expectedJsSha,expectedSignalCssSha){
 const page=await browser.newPage({viewport:{width,height:800,isMobile:width<=680,deviceScaleFactor:1}});
 try{
  await page.goto(host+'/?member_header_premium_qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:58000});
  // A successful activation may briefly return CSS from different Cloudflare edge caches.
  // Demand three consecutive live SHA matches; never accept stale CSS as success.
  let controls=null;
  for(let attempt=0;attempt<24;attempt++){
   let stable=true;
   for(let probe=0;probe<3;probe++){
    controls=await getPublic('/member-odds-topbar.css',host);
    if(controls.status!==200||controls.sha!==expectedPremiumCssSha){stable=false;break;}
    if(probe<2)await new Promise(r=>setTimeout(r,500));
   }
   if(stable)break;
   if(attempt<23)await new Promise(r=>setTimeout(r,1800));
  }
  assert.equal(controls?.sha,expectedPremiumCssSha,'PREMIUM_STYLES_NOT_CONSISTENTLY_VISIBLE_ON_BROWSER_HOST '+host);
  assert.equal((await getPublic('/member.js',host)).sha,expectedJsSha,'MEMBER_APP_JS_CHANGED_IN_BROWSER_QA');
  let signalStyles=null;
  for(let a=0;a<25;a++){
   signalStyles=await getPublic('/styles.css',host);
   if(signalStyles.status===200&&signalStyles.sha===expectedSignalCssSha)break;
   if(a<24)await new Promise(r=>setTimeout(r,1700));
  }
  assert.equal(signalStyles?.sha,expectedSignalCssSha,'MEMBER_SIGNAL_1X_STYLES_NOT_LIVE_'+width);
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
  await page.addStyleTag({url:host+'/styles.css?signalFlatGlow1x='+Date.now()});
  await page.addStyleTag({url:host+'/member-odds-topbar.css?v=20261021-odds-solid-v7-'+Date.now()});
  await page.addScriptTag({url:host+'/member-odds-topbar.js'});

  await page.evaluate(()=>{
    const host=document.createElement('div');host.className='member-flow-chart';
    host.style.cssText='max-width:260px;margin:20px;overflow:visible';
    host.innerHTML='<svg viewBox="0 0 252 45" style="width:100%;height:45px;overflow:visible" xmlns="http://www.w3.org/2000/svg"><g class="member-flow-signal-tag"><rect class="member-flow-signal-plate" x="2" y="2" width="246" height="36" rx="5"/><rect class="member-flow-signal-accent" x="8" y="9" width="2.4" height="22" rx="1.2"/><text class="member-flow-signal-label" x="16" y="16">SIGNAL 17′</text><text class="member-flow-signal-detail" x="16" y="30">CORNER TOTAL · OVER 12 · @-125 · Bet 365</text></g></svg>';
    document.body.append(host);
  });
  const plateStyles=await page.evaluate(()=>{
     const plate=document.querySelector('.member-flow-signal-plate');
     const accent=document.querySelector('.member-flow-signal-accent');
     const p=getComputedStyle(plate),a=getComputedStyle(accent);
     return {fill:p.fill,fillOpacity:p.fillOpacity,stroke:p.stroke,strokeWidth:p.strokeWidth,filter:p.filter,animation:p.animationName,
       accentFill:a.fill,accentFilter:a.filter,accentAnimation:a.animationName};
  });
  assert.equal(plateStyles.fill,'rgb(12, 76, 62)','SOLID_TEAL_FILL_MISSING '+width+' '+JSON.stringify(plateStyles));
  assert.equal(plateStyles.fillOpacity,'1','PLATE_NOT_FULLY_OPAQUE '+width);
  assert.equal(plateStyles.stroke,'none','PLATE_BORDER_VISIBLE '+width);
  assert.equal(plateStyles.filter.includes('drop-shadow('),true,'GLOW1X_PLATE_MISSING '+width);
  assert.equal(plateStyles.animation,'none','PLATE_GLOW_PULSE_NOT_REMOVED '+width);
  assert.equal(plateStyles.accentAnimation,'none','ACCENT_PULSE_NOT_REMOVED '+width);

  const observed=await page.evaluate(()=>{
   const rect=q=>{const el=document.querySelector(q),r=el?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,middleY:(r.top+r.bottom)/2}:null};
   const container=document.querySelector('.topbar-inner');
   return {header:rect('.topbar'),brand:rect('.topbar .brand'),nav:rect('.topbar .nav'),
    icon:rect('.topbar .b46-odds-trigger'),account:rect('.topbar .topbar-account-slot'),
    memberChip:rect('.topbar .member-chip'),
    grid:getComputedStyle(container).gridTemplateColumns,
    iconCircleCount:document.querySelectorAll('.b46-odds-trigger svg circle').length,
    label:document.querySelector('.b46-odds-trigger-label')?.textContent,
    triggerBorder:getComputedStyle(document.querySelector('.b46-odds-trigger')).borderTopWidth,
    menuBorder:getComputedStyle(document.querySelector('.b46-odds-menu')).borderTopWidth,
    menuShadow:getComputedStyle(document.querySelector('.b46-odds-menu')).boxShadow,
    codeBorder:getComputedStyle(document.querySelector('.b46-odds-code')).borderTopWidth,
    noteBorder:getComputedStyle(document.querySelector('.b46-odds-note')).borderTopWidth,
    menuBackground:getComputedStyle(document.querySelector('.b46-odds-menu')).backgroundColor,
    menuOpacity:getComputedStyle(document.querySelector('.b46-odds-menu')).opacity,
    menuBackdrop:getComputedStyle(document.querySelector('.b46-odds-menu')).backdropFilter,
    premiumMarker:[...document.styleSheets].length>0,
    docWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth
   };
  });
  assert.equal(observed.iconCircleCount,3,'PREMIUM_ODDS_SVG_NOT_RENDERED');
  assert.equal(observed.label,'ODDS','VISIBLE_ODDS_LABEL_MISSING');
  assert.equal(observed.triggerBorder,'0px','TRIGGER_OUTLINE_VISIBLE');
  assert.equal(observed.menuBorder,'0px','MENU_OUTLINE_VISIBLE');
  assert.equal(observed.codeBorder,'0px','CODE_BADGE_BORDER_VISIBLE');
  assert.equal(observed.noteBorder,'0px','DETAIL_DIVIDER_VISIBLE');
  assert.equal(observed.menuShadow,'none','DETAIL_SHADOW_VISIBLE');
  assert.equal(observed.menuBackground,'rgb(18, 38, 48)','DROPDOWN_SOLID_BACKGROUND_NOT_OPAQUE '+width+' '+observed.menuBackground);
  assert.equal(observed.menuOpacity,'1','DROPDOWN_TEXT_FADES_WITH_PANEL '+width);
  assert.equal(observed.menuBackdrop,'none','DROPDOWN_BACKDROP_BLUR_MUST_BE_DISABLED '+width);
  assert(observed.account&&observed.account.width>=32&&(width<=680||(observed.memberChip&&observed.memberChip.width>48)),'MEMBER_ACCOUNT_NOT_VISIBLE '+width+' '+JSON.stringify(observed));
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
 assert.equal(runtime[0].sha,'eeb30972a6b8b15a64cd9a4dae967f3cb61de7ae914fe3ae4a1a8dab4dfadfd9','LATEST_MEMBER_WORKER_RUNTIME_CHANGED');
 const oldModule=Buffer.from(base.modules[0].content_base64,'base64').toString('utf8');
 const oldFormula='    const winPoints = counts.win + counts.halfWin * 0.5;';
 const newFormula='    const winningBets = counts.win + counts.halfWin;';
 const oldLine='winRate: decided ? Number((winPoints / decided * 100).toFixed(1)) : null';
 const newLine='winRate: decided ? Number((winningBets / decided * 100).toFixed(1)) : null';
 const patchedRuntime=replaceOne(replaceOne(oldModule,oldFormula,newFormula,'WEIGHTED_HALF_WIN_FORMULA'),oldLine,newLine,'WEIGHTED_HALF_WIN_REFERENCE');
 assert(patchedRuntime.includes('function resultPnl(result, odds)'),'P_AND_L_RUNTIME_DISAPPEARED');
 const oldProfit=oldModule.slice(oldModule.indexOf('function resultPnl('),oldModule.indexOf('function signalState('));
 assert(patchedRuntime.includes(oldProfit),'P_AND_L_RUNTIME_MODIFIED');
 const summaryStart=patchedRuntime.indexOf('function dailySummary(');
 const summaryEnd=patchedRuntime.indexOf('__name(dailySummary,',summaryStart);
 assert(summaryStart>=0&&summaryEnd>summaryStart&&summaryEnd-summaryStart<1200,'LIVE_SUMMARY_SOURCE_MOVED');
 const actualSummary=Function('MARKET_ORDER','countMemberOutcomes',patchedRuntime.slice(summaryStart,summaryEnd)+'\nreturn dailySummary;')(
   ['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'],
   rows=>{const counts={signals:rows.length,win:0,loss:0,halfWin:0,halfLoss:0,push:0,void:0,pending:0,live:0,unresolved:0};
     for(const r of rows){const key={WIN:'win',LOSS:'loss',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss',PUSH:'push',VOID:'void',PENDING:'pending',LIVE:'live'}[r.result]||'unresolved';counts[key]++;}
     return counts;}
 );
 const sample=(results,expected)=>{const rows=results.map(result=>({market:'AH',result,pnl:0}));assert.equal(actualSummary(rows).ALL.winRate,expected)};
 sample(['WIN','WIN','HALF_WIN','LOSS','HALF_LOSS'],60);
 sample(['HALF_WIN'],100);sample(['HALF_LOSS'],0);sample(['WIN','HALF_LOSS'],50);
 sample(['WIN','PUSH','VOID','LIVE','PENDING'],100);sample(['PUSH','VOID','LIVE'],null);
 sample([...Array(8).fill('WIN'),...Array(2).fill('HALF_WIN'),...Array(4).fill('LOSS'),'HALF_LOSS'],66.7);
 const runtimeSha=hash(Buffer.from(patchedRuntime));
 writeFileSync(AUDIT+'/patched-runtime-hash.txt',runtimeSha+'\n');
 report.expectedRuntimeBefore=runtime[0].sha;
 report.expectedRuntimeAfter=runtimeSha;
 const settingsBefore=await settings();
 assert.deepEqual(settingsBefore.domains,['member.ball46.com'],'MEMBER_DOMAIN_CHANGED');
 assert.equal(base.bindings.filter(b=>b.type==='secret_text').length,3,'MEMBER_SECRET_BINDINGS_CHANGED');
 assert(base.bindings.some(b=>b.type==='assets'&&b.name==='ASSETS'),'ASSETS_BINDING_MISSING');
 assert.equal(walk(DIR).length,40,'PINNED_MEMBER_ASSETS_NOT_40');
 const currentCss=await getPublic('/styles.css'),currentJs=await getPublic('/member.js');
 const currentOddsCss=await getPublic('/member-odds-topbar.css'),currentOddsJs=await getPublic('/member-odds-topbar.js');
 assert.equal(currentCss.sha,'f685a95c6bf6cadd280e26ac092a04e89b51a1675e0fd2d8cc78ccb36b27e7df','MEMBER_CURRENT_SIGNAL_CSS_MOVED');
 assert.equal(currentJs.sha,'ef4489618ae07303a7f275b4b37fddd0f7a8cb721bf98d3216c887128c806524','MEMBER_MAIN_JS_MOVED');
 assert.equal(currentOddsCss.sha,'3a6ea0a6cd39b6c94fdc0874999c92d0468bca2c980a37d8bb4c2bc27b48443d','MEMBER_ODDS_SOLID_V7_CSS_MOVED');
 assert.equal(currentOddsJs.sha,'12265bd447751f9223860a852196bc97a576e1c70a08020343f12524698848c7','MEMBER_ODDS_V1_JS_MOVED');
 const signalFlatEnd='\n'+SIGNAL1X_CSS+'\n';
 const liveFlatCss=currentCss.data.toString('utf8');
 assert(liveFlatCss.endsWith(signalFlatEnd),'CURRENT_SIGNAL_1X_CSS_FOOTER_NOT_FOUND');
 const v3Css=liveFlatCss.slice(0,-signalFlatEnd.length);
 assert.equal(hash(v3Css),'5186dd9dfa27c36b7dced6068b15a20d04ab8f15ab771e33d61116c8725b817d','SIGNAL_V3_STYLES_NO_LONGER_MATCH');
 const footer='\n'+STYLE+'\n';
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
 const solidEnd='\n'+SOLID_CSS+'\n';
 const liveSolidCss=currentOddsCss.data.toString('utf8');
 assert(liveSolidCss.endsWith(solidEnd),'ACTIVE_ODDS_SOLID_V7_CSS_FOOTER_MISSING');
 const v6OddsCssLayer=liveSolidCss.slice(0,-solidEnd.length);
 assert.equal(hash(v6OddsCssLayer),'cd27fb17fd5941d41f234d81d8047c3fcac436dd247a3cad0792a00c8f037e7d','OPACITY85_V6_CSS_SOURCE_DRIFT');
 const opacity85End='\n'+OPACITY85_CSS+'\n';
 const liveOpacity85Css=v6OddsCssLayer;
 assert(liveOpacity85Css.endsWith(opacity85End),'ACTIVE_OPACITY85_V6_CSS_FOOTER_MISSING');
 const v5CssLayer=liveOpacity85Css.slice(0,-opacity85End.length);
 assert.equal(hash(v5CssLayer),'476df19b96343f643b483e795a87d6f4ab63632b42b22d13a21714f9cbabd11e','OPACITY75_V5_SOURCE_HASH_DRIFT');
 const opacity75End='\n'+OPACITY75_CSS+'\n';
 const liveOpacity75Css=v5CssLayer;
 assert(liveOpacity75Css.endsWith(opacity75End),'ACTIVE_OPACITY75_V5_CSS_FOOTER_MISSING');
 const v4CssLayer=liveOpacity75Css.slice(0,-opacity75End.length);
 assert.equal(hash(v4CssLayer),'b6633b6d654bcd11396b3975726ac612b32e06b8601572421d3b4045e420c833','GLASS55_V4_SOURCE_HASH_DRIFT');
 const glass55End='\n'+GLASS_CSS+'\n';
 const liveGlass55Css=v4CssLayer;
 assert(liveGlass55Css.endsWith(glass55End),'ACTIVE_GLASS55_V4_CSS_FOOTER_MISSING');
 const v3CssLayer=liveGlass55Css.slice(0,-glass55End.length);
 assert.equal(hash(v3CssLayer),'10a07147ada8f1923cdbe174c893e17d74e193ac9d4273b771819ae7d5fc6aa5','BORDERLESS_V3_SOURCE_HASH_DRIFT');
 const borderlessEnd='\n'+BORDERLESS_CSS+'\n';
 const liveBorderlessCss=v3CssLayer;
 assert(liveBorderlessCss.endsWith(borderlessEnd),'ACTIVE_BORDERLESS_V3_CSS_FOOTER_MISSING');
 const activePremiumCss=liveBorderlessCss.slice(0,-borderlessEnd.length);
 const premiumEnd='\n'+PREMIUM_CSS+'\n';
 assert(activePremiumCss.endsWith(premiumEnd),'ACTIVE_PREMIUM_V2_CSS_FOOTER_MISSING');
 const oddsV1Css=activePremiumCss.slice(0,-premiumEnd.length);
 assert.equal(hash(oddsV1Css),'97f544c20ab10ad1d44b1ecd29ea590fc41d3435e0698824ceefb21b1ce7282b','ODDS_V1_CSS_REVERSAL_FAILED');
 const currentPremiumV2=patchPremiumTopbar({html:oddsV1.html,css:oddsV1Css});
 assert.equal(hash(currentPremiumV2.css),'9df93d4b6c953705e312738afb2d9504bdb7ea1d1c396967a68d5873d7641ba3','PREMIUM_V2_CSS_REBUILD_FAILED');
 const currentBorderlessV3=patchOddsBorderless({html:currentPremiumV2.html,css:currentPremiumV2.css});
 assert.equal(hash(currentBorderlessV3.css),'10a07147ada8f1923cdbe174c893e17d74e193ac9d4273b771819ae7d5fc6aa5','MEMBER_BORDERLESS_V3_CSS_REBUILD_FAILED');
 assert(currentBorderlessV3.html.includes('member-odds-topbar.css?v=20261021-odds-borderless-v3'),'MEMBER_BORDERLESS_V3_HTML_NOT_REBUILT');
 const currentGlass55V4=patchGlass55({html:currentBorderlessV3.html,css:currentBorderlessV3.css});
 assert.equal(hash(currentGlass55V4.css),'b6633b6d654bcd11396b3975726ac612b32e06b8601572421d3b4045e420c833','MEMBER_GLASS55_V4_CSS_REBUILD_FAILED');
 assert(currentGlass55V4.html.includes('member-odds-topbar.css?v=20261021-odds-glass55-v4'),'MEMBER_GLASS55_V4_HTML_NOT_REBUILT');
 const currentOpacity75V5=patchOpacity75({html:currentGlass55V4.html,css:currentGlass55V4.css});
 assert.equal(hash(currentOpacity75V5.css),'476df19b96343f643b483e795a87d6f4ab63632b42b22d13a21714f9cbabd11e','MEMBER_OPACITY75_V5_CSS_REBUILD_FAILED');
 assert(currentOpacity75V5.html.includes('member-odds-topbar.css?v=20261021-odds-opacity75-v5'),'MEMBER_OPACITY75_V5_HTML_NOT_REBUILT');
 const currentOpacity85V6=patchOpacity85({html:currentOpacity75V5.html,css:currentOpacity75V5.css});
 assert.equal(hash(currentOpacity85V6.css),'cd27fb17fd5941d41f234d81d8047c3fcac436dd247a3cad0792a00c8f037e7d','MEMBER_OPACITY85_V6_CSS_REBUILD_FAILED');
 assert(currentOpacity85V6.html.includes('member-odds-topbar.css?v=20261021-odds-opacity85-v6'),'MEMBER_OPACITY85_V6_HTML_NOT_REBUILT');
 const currentSolidV7=patchSolid({html:currentOpacity85V6.html,css:currentOpacity85V6.css});
 assert.equal(hash(currentSolidV7.css),currentOddsCss.sha,'MEMBER_ODDS_SOLID_V7_CSS_REBUILD_FAILED');
 assert(currentSolidV7.html.includes('member-odds-topbar.css?v=20261021-odds-solid-v7'),'MEMBER_ODDS_SOLID_V7_HTML_NOT_REBUILT');
 writeFileSync(DIR+'/member.html',currentSolidV7.html,'utf8');
 writeFileSync(DIR+'/member-odds-topbar.css',currentSolidV7.css,'utf8');
 writeFileSync(DIR+'/member-odds-topbar.js',currentOddsJs.data);
 const existing=walk(DIR).map(f=>{const bytes=readFileSync(f);return {path:'/'+relative(DIR,f).replaceAll('\\','/'),sha:hash(bytes),bytes};});
 assert.equal(existing.length,44,'LATEST_MEMBER_44_FILES_MISSING');
 const productionPublic=await publicInventory(existing.filter(f=>f.path!=='/member.html'),BASE,currentCss.data);
 assert.deepEqual(productionPublic.mismatches,[],'LATEST_MEMBER_PUBLIC_ASSET_DRIFT');
 assert.equal(productionPublic.matches,43,'MEMBER_43_PUBLIC_ASSET_CHECK_FAILED');
 const protectedBefore=await getPublic('/member.html');
 assert([302,303].includes(protectedBefore.status),'MEMBER_ACCESS_GATE_CHANGED');
 const healthBefore=await getPublic('/api/health');
 const fixed=patchSignal1x({html:currentSolidV7.html,css:restored.css});
 writeFileSync(DIR+'/member.html',fixed.html,'utf8');
 writeFileSync(DIR+'/styles.css',fixed.css,'utf8');
 assert.equal(fixed.html.replace('&b46SignalFlat1x20261021=1',''),currentSolidV7.html,'UNRELATED_MEMBER_HTML_CHANGE');
 assert.equal(hash(fixed.css),currentCss.sha,'LIVE_SIGNAL_1X_CSS_WOULD_CHANGE');
 assert.equal(hash(readFileSync(DIR+'/member.js')),currentJs.sha,'LIVE_MEMBER_JS_WOULD_CHANGE');
 assert(fixed.css.endsWith(SIGNAL1X_CSS+'\n')&&fixed.css.includes(SIGNAL1X_MARKER)&&fixed.css.includes(V3_MARKER),'MEMBER_SIGNAL_FLAT_1X_CSS_NOT_APPENDED');
 assert.equal(readFileSync(DIR+'/member-odds-topbar.css','utf8'),currentOddsCss.data.toString('utf8'),'ODDS_CSS_CHANGED');
 const files=walk(DIR).map(f=>{const bytes=readFileSync(f);return {path:'/'+relative(DIR,f).replaceAll('\\','/'),sha:hash(bytes),bytes};});
 const modified=['/member.html','/styles.css'];
 assert.equal(files.length,44,'PREMIUM_CANDIDATE_ASSET_COUNT_CHANGED');
 const untouched=files.filter(f=>!modified.includes(f.path));
 assert.equal(untouched.length,42,'UNTOUCHED_MEMBER_ASSET_COUNT_NOT_42');
 for(const f of untouched)assert.equal(f.sha,existing.find(x=>x.path===f.path)?.sha,'MEMBER_UNRELATED_ASSET_CHANGED_'+f.path);
 report.before={version:initial.version,publicIdentical:43,protectedHtmlHash:hash(fixed.html),workerHashes:runtime};
 assert.equal(hash(fixed.css),currentCss.sha,'EXPECTED_NO_STYLES_CHANGE');
 report.modified=files.filter(f=>existing.find(x=>x.path===f.path)?.sha!==f.sha).map(f=>({path:f.path,before:existing.find(x=>x.path===f.path)?.sha,after:f.sha}));
 assert.deepEqual(report.modified.map(x=>x.path).sort(),modified.sort(),'MEMBER_PINNED_ASSET_RECONSTRUCTION_CHANGED');
 report.liveAssetChanges=[];report.changeScope=['worker.js (winRate only)'];
 save();
 assert.equal((await active()).version,initial.version,'MEMBER_WORKER_MOVED_BEFORE_ASSET_UPLOAD');
 const uploaded=await uploadAssets(files);
 report.upload={fileCount:uploaded.files,uploaded:uploaded.uploaded};save();
 newVersion=await uploadVersion(initial.version,base,uploaded.completion,patchedRuntime);
 report.candidate=newVersion;save();
 const candidate=await getVersion(newVersion);
 compareVersion(candidate,base,runtimeSha);
 assert.equal(hash(Buffer.from(candidate.modules[0].content_base64,'base64')),runtimeSha,'CANDIDATE_WINRATE_WORKER_NOT_PATCHED');
 // Candidate must preserve the original P/L computation and original per-market grouping.
 assert(Buffer.from(candidate.modules[0].content_base64,'base64').toString('utf8').includes(oldProfit),'CANDIDATE_PNL_CHANGED');
 const preview=candidate.urls?.find(x=>x.startsWith('https://'))||'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 report.preview=preview;
 const unmodified=await publicInventory(untouched,preview);
 assert.deepEqual(unmodified.mismatches,[],'CANDIDATE_UNRELATED_FILES_CHANGED');
 assert.equal(unmodified.matches,42,'CANDIDATE_UNMODIFIED_FILES_COUNT');
 const premium=await getPublic('/styles.css',preview);
 assert.equal(premium.status,200,'CANDIDATE_PREMIUM_CSS_NOT_AVAILABLE');
 assert.equal(premium.sha,files.find(f=>f.path==='/styles.css').sha,'CANDIDATE_PREMIUM_CSS_SHA_MISMATCH');
 assert([302,303].includes((await getPublic('/member.html',preview)).status),'CANDIDATE_MEMBERSHIP_GATE_BYPASSED');
 const browser=await chromium.launch({headless:true});
 try{
  report.candidateBrowsers=[];
  for(const width of [1440,1024,768,680,390,320])
   report.candidateBrowsers.push(await browserHeader(browser,preview,'candidate',width,fixed.html,currentOddsCss.sha,currentJs.sha,premium.sha));
 }finally{await browser.close();}
 report.candidateVerified=true;save();
 assert.equal((await active()).version,initial.version,'MEMBER_VERSION_CHANGED_DURING_BROWSER_QA');
 const now=await settings();
 assert.deepEqual(now.domains,settingsBefore.domains,'MEMBER_DOMAIN_CHANGED_BEFORE_DEPLOY');
 assert.deepEqual(now.schedules,settingsBefore.schedules,'MEMBER_CRON_CHANGED_BEFORE_DEPLOY');
 assert.deepEqual(settingsOperational(now.set),settingsOperational(settingsBefore.set),'MEMBER_SETTINGS_CHANGED_BEFORE_DEPLOY');
 report.safeRollbackReady=true;save();
 report.deployment=await promote(newVersion,initial.version,'Member SIGNAL Flat Deep Teal 1x Glow, preserve layout and all Member logic');
 report.activated=true;save();
 assert(await waitCss(premium.sha,BASE,'/styles.css'),'MEMBER_SIGNAL_CSS_NOT_VISIBLE_AFTER_DEPLOY');
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
   report.productionBrowsers.push(await browserHeader(pb,BASE,'production',width,fixed.html,currentOddsCss.sha,currentJs.sha,premium.sha));
 }finally{await pb.close();}
 const finalSettings=await settings();
 assert.deepEqual(finalSettings.domains,settingsBefore.domains,'MEMBER_DOMAIN_CHANGED_AFTER');
 assert.deepEqual(finalSettings.schedules,settingsBefore.schedules,'MEMBER_CRON_CHANGED_AFTER');
 assert.deepEqual(settingsOperational(finalSettings.set),settingsOperational(settingsBefore.set),'MEMBER_SETTINGS_CHANGED_AFTER');
 assert.equal((await active()).version,newVersion,'MEMBER_DEPLOYED_VERSION_NOT_ACTIVE');
 const verified=await getVersion(newVersion);
 assert.equal(hash(Buffer.from(verified.modules[0].content_base64,'base64')),runtimeSha,'PRODUCTION_WORKER_WINRATE_WRONG_SHA');
 assert.equal((await getPublic('/styles.css')).sha,currentCss.sha,'LIVE_STYLES_CHANGED');
 assert.equal((await getPublic('/member.js')).sha,currentJs.sha,'LIVE_MEMBER_JS_CHANGED');
 report.success=true;report.completedAt=new Date().toISOString();save();
 console.log('BALL46_MEMBER_WINRATE_MATH_DEPLOY_SUCCESS',JSON.stringify({before:initial.version,after:newVersion,assetBytesPreserved:true,untouched:44,workerRuntimePatched:true,oldSha:runtime[0].sha,newSha:runtimeSha,loginPreserved:true,desktopAndMobileVerified:[1440,1024,768,680,390,320]}));
}catch(e){
 report.success=false;report.error=String(e.stack||e);report.completedAt=new Date().toISOString();
 if(report.activated&&newVersion){
   try{const curr=await active();
    if(curr.version===newVersion){await promote(initial.version,newVersion,'Rollback Member win-rate formula after failed verification');report.rolledBack=true;}
    else report.foreignVersionDetected=curr.version;
   }catch(err){report.rollbackError=String(err);}
 }
 save();console.error('BALL46_MEMBER_PREMIUM_TOPBAR_V2_SAFE_STOP',String(e.stack||e));process.exitCode=1;
}
