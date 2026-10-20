import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
const SCRIPT='ball46-production';
const EXPECTED_ACTIVE='50c19190-3693-4514-87c6-7bdee2e1b9cb';
let PREVIOUS_RELEASE_HTML=null;
const origin='https://ball46.com';
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(acc&&token,'CLOUDFLARE_AUTH_MISSING');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+acc;
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(k,x)=>k==='annotations'?undefined:x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const OLD_MOBILE_CSS=[
'@media(max-width:760px){html[data-theme="dark"] body #b46gn-cards > .b46gn-card{background-color:#1C3029!important;background-image:linear-gradient(145deg,#1C3029 0%,#15251F 100%)!important;box-shadow:0 5px 13px rgba(0,0,0,.21),inset 0 1px 0 rgba(255,255,255,.025)!important;}',
'html[data-theme="dark"] body #b46gn-cards > .b46gn-card .b46gn-cardhead{background-color:#20382F!important;background-image:linear-gradient(100deg,#20382F,#192F27)!important;}}'
].join('\n');
const STYLE_TAG='<style id="b46-dark-match-deep-graphite-teal-20261020">';
const PATCH_MARK='B46_MOBILE_CARD_RESTORED_20261020';
const BASE_ANCHOR='return __b46PcDarkPerformance20261020(await __b46MobileFeaturedElevation20261020(await __b46MobileSignalPanelElevation20261020(await __b46MobileFlowDepth20261020(await __b46MatchTitleElevation20261020(await __b46InjectFooter(response))))),url.pathname);';
const MATCH_ANCHOR='return __b46DarkMatchCard20261020(await '+BASE_ANCHOR.slice(7,-1)+',url.pathname);';
const ANCHOR='return __b46DarkMatchInteraction20261020(await '+MATCH_ANCHOR.slice(7,-1)+',url.pathname);';
const NEXT='return __b46MobileOriginalCards20261020(await '+ANCHOR.slice(7,-1)+',url.pathname);';
const HELPER='\nasync function __b46MobileOriginalCards20261020(response,path){if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;const html=await response.text();const tag='+JSON.stringify(STYLE_TAG)+',old='+JSON.stringify(OLD_MOBILE_CSS)+',mark='+JSON.stringify(PATCH_MARK)+';const start=html.indexOf(tag),end=html.indexOf("</style>",start);if(start<0||end<start||html.indexOf(tag,start+tag.length)>=0)throw new Error("MOBILE_STYLE_BLOCK_DRIFT");const block=html.slice(start,end);if(block.split(old).length!==2||block.includes(mark))throw new Error("ORIGINAL_MOBILE_CSS_DRIFT");const next=html.slice(0,start)+block.replace(old,"/* "+mark+"; restore CSS cascade prior to 20 Oct recolor */")+html.slice(end);const h=new Headers(response.headers);h.delete("content-length");h.delete("etag");return new Response(next,{status:response.status,statusText:response.statusText,headers:h});}\n';
function patchMain(source){assert.equal(source.split(ANCHOR).length,2,'ACTIVE_WORKER_ANCHOR_CHANGED');assert(!source.includes('__b46MobileOriginalCards20261020'),'ALREADY_PATCHED');const at=source.lastIndexOf('export default');assert(at>0,'WORKER_EXPORT_MISSING');const next=source.slice(0,at)+HELPER+source.slice(at).replace(ANCHOR,NEXT);assert.equal(next.replace(HELPER,'').replace(NEXT,ANCHOR),source,'NON_ISOLATED_CODE_CHANGE');return next;}
function patchHTML(html){const start=html.indexOf(STYLE_TAG),end=html.indexOf('</style>',start);assert(start>=0&&end>start&&html.indexOf(STYLE_TAG,start+STYLE_TAG.length)<0,'MOBILE_STYLE_BLOCK_DRIFT');const block=html.slice(start,end);assert.equal(block.split(OLD_MOBILE_CSS).length,2,'ORIGINAL_MOBILE_CSS_DRIFT');assert(!block.includes(PATCH_MARK),'MOBILE_RESTORE_DUPLICATE');return html.slice(0,start)+block.replace(OLD_MOBILE_CSS,'/* '+PATCH_MARK+'; restore CSS cascade prior to 20 Oct recolor */')+html.slice(end);}
const report={scope:'Restore pre-20-Oct dark mobile match card and mobile league header colors only',script:SCRIPT,expectedActive:EXPECTED_ACTIVE,workerWrites:[],started:new Date().toISOString(),branch:process.env.GITHUB_REF_NAME,commit:process.env.GITHUB_SHA};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function api(path,body=null){const response=await fetch(apiRoot+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});const j=await response.json();assert(response.ok&&j.success===true,'CLOUDFLARE_API_ERROR '+response.status+' '+JSON.stringify(j.errors||[]));return j.result;}
async function active(){const r=await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1');const d=r.deployments?.[0];assert(d&&d.versions?.length===1&&Number(d.versions[0].percentage)===100,'NOT_SINGLE_ACTIVE_VERSION');return {id:d.versions[0].version_id,deployment:d.id};}
async function version(id){const v=await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');assert(v.main_module&&v.modules?.length,'NO_VERSION_MODULES');return v;}
function moduleHashes(v){return v.modules.map(m=>({name:m.name,type:m.content_type,hash:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));}
async function read(base,path){const u=new URL(path,base);u.searchParams.set('teal_match_audit',process.env.GITHUB_RUN_ID+'-'+Date.now());const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{path,status:r.status,type:r.headers.get('content-type'),body:b,hash:sha(b)};}
const parts=['/','/index.html','/app.css','/dashboard-v2-tune.css','/singlepage-workspace-343.js'];
async function inspectFiles(base){const a={};for(const p of parts){const v=await read(base,p);assert.equal(v.status,200,'ASSET_STATUS:'+p);a[p]=v;}return a;}
const cleanMap=r=>Object.fromEntries(Object.entries(r).map(([p,x])=>[p,{status:x.status,hash:x.hash,size:x.body.length}]));
async function healthy(base){const out={};for(const p of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){const x=await read(base,p);assert.equal(x.status,200,'BACKEND_HTTP:'+p);const j=JSON.parse(x.body.toString());assert.equal(j.ok,true,'BACKEND_BAD:'+p);out[p]={status:x.status,ok:j.ok,stale:j.stale};}return out;}
async function observe(browser,base,width,theme,shot,overrideHtml=null){const page=await browser.newPage();try{if(overrideHtml){await page.setRequestInterception(true);page.on('request',req=>{if(req.isNavigationRequest()&&req.url().startsWith(base+'/?teal_ui='))req.respond({status:200,contentType:'text/html; charset=utf-8',body:overrideHtml});else req.continue();});}await page.setViewport({width,height:940,isMobile:width<500,deviceScaleFactor:1});await page.setCacheEnabled(false);await page.goto(base+'/?teal_ui='+Date.now(),{waitUntil:'domcontentloaded',timeout:80000});await new Promise(r=>setTimeout(r,7000));await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);await new Promise(r=>setTimeout(r,1100));const out=await page.evaluate(t=>{const choose=s=>{const el=[...document.querySelectorAll(s)].find(x=>x.getBoundingClientRect().width>0);if(!el)return null;const st=getComputedStyle(el),r=el.getBoundingClientRect();return{tag:el.tagName,cls:String(el.className).slice(0,100),w:Math.round(r.width),h:Math.round(r.height),padding:st.padding,fontSize:st.fontSize,color:st.color,bg:st.backgroundColor,image:st.backgroundImage,borderWidth:st.borderWidth,shadow:st.boxShadow};};return{theme:t,matchCount:document.querySelectorAll('.match-row').length,mobileCount:document.querySelectorAll('.b46gn-card').length,row:choose('.workspace.singlepage .match-row'),league:choose('.workspace.singlepage .league-head'),mobile:choose('#b46gn-cards > .b46gn-card'),mobileHeader:choose('#b46gn-cards > .b46gn-card .b46gn-cardhead'),homeText:choose('.teams-cell > b:first-of-type, .b46gn-team-name'),awayText:choose('.teams-cell > b:nth-of-type(2), .b46gn-team:nth-child(2) .b46gn-team-name')};},theme);if(width===1440){
  const chosen=await page.waitForSelector('.workspace.singlepage article.match-row:not(.active)',{visible:true,timeout:4000});
  assert(chosen,'NO_VISIBLE_UNSELECTED_MATCH_ROW');
  const sample=async()=>chosen.evaluate(el=>{const st=getComputedStyle(el),r=el.getBoundingClientRect();return{bg:st.backgroundColor,image:st.backgroundImage,shadow:st.boxShadow,color:st.color,borderWidth:st.borderWidth,w:Math.round(r.width),h:Math.round(r.height),padding:st.padding,fontSize:st.fontSize,active:el.classList.contains('active'),expanded:el.getAttribute('aria-expanded')};});
  out.normalRow=await sample();
  await chosen.hover();await new Promise(r=>setTimeout(r,450));out.hoverRow=await sample();
  await chosen.click();await new Promise(r=>setTimeout(r,450));out.activeRow=await sample();
  out.expandedCount=await page.evaluate(()=>[...document.querySelectorAll('.workspace.singlepage .match-expanded')].filter(e=>e.getBoundingClientRect().width>0).length);
}
await page.screenshot({path:'audit/'+shot+'.png',fullPage:false});return out;}finally{await page.close();}}
function checkUI(old,newer,width,theme){
 const desktop=width===1440;
 const original=[desktop?'row':'mobile',...(desktop?['league']:['mobileHeader'])];
 for(const key of original){
  const a=old[key],b=newer[key];assert(a&&b,'REQUIRED_CARD_MISSING '+key+' '+width);
  for(const prop of ['w','h','padding','fontSize','color','borderWidth'])
   assert.equal(b[prop],a[prop],'CARD_GEOMETRY_OR_TEXT_CHANGED '+key+' '+width+' '+theme+' '+prop);
  if(desktop||theme==='light'){
   for(const prop of ['bg','image','shadow'])
    assert.equal(b[prop],a[prop],'UNAUTHORIZED_DESKTOP_OR_LIGHT_CHANGE '+key+' '+width+' '+theme+' '+prop);
  }
 }
 for(const key of ['homeText','awayText'])
  if(old[key]&&newer[key])assert.equal(newer[key].color,old[key].color,'TEAM_TEXT_CHANGED '+width+' '+theme);
 if(desktop){
  for(const state of ['normalRow','hoverRow','activeRow']){
   const a=old[state],b=newer[state];assert(a&&b,'INTERACTION_STATE_LOST '+state);
   for(const prop of ['w','h','padding','fontSize','color','borderWidth','bg','image','shadow'])
    assert.equal(b[prop],a[prop],'DESKTOP_INTERACTION_CHANGED '+state+' '+prop);
  }
  assert(old.expandedCount>0&&newer.expandedCount>0,'DESKTOP_MATCH_EXPAND_BROKEN');
 }else if(theme==='dark'){
  assert(old.mobile.image.includes('28, 48, 41'),'OLD_MOBILE_WAS_NOT_RECOLORED');
  assert(newer.mobile.image.includes('20, 40, 43'),'MOBILE_ORIGINAL_COLOR_NOT_RESTORED');
  assert(newer.mobile.image.includes('16, 33, 38')&&newer.mobile.image.includes('14, 29, 34'),'MOBILE_ORIGINAL_GRADIENT_MISSING');
  assert.equal(newer.mobileHeader.image,'none','MOBILE_LEAGUE_HEADER_STILL_RECOLORED');
  assert.equal(newer.mobileHeader.bg,'rgba(0, 0, 0, 0)','MOBILE_HEADER_ORIGINAL_BG_NOT_RESTORED');
  assert(newer.mobile.shadow.includes('0px 1px 3px'),'MOBILE_ORIGINAL_ELEVATION_NOT_RESTORED');
 }
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let candidate=null,switched=false,baseSettings=null,base=null,beforeAssets=null;
try{
 const current=await active();report.activeBefore=current;assert.equal(current.id,EXPECTED_ACTIVE,'ACTIVE_PRODUCTION_DRIFT_STOP');
 const domains=await api('/workers/domains');const hostnames=domains.filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();assert.deepEqual(hostnames,['ball46.com','www.ball46.com'],'PRODUCTION_DOMAINS_MISMATCH');report.domains=hostnames;
 baseSettings=await api('/workers/scripts/'+SCRIPT+'/settings');const schedules=await api('/workers/scripts/'+SCRIPT+'/schedules');report.scheduleHash=sha(canonical(schedules));base=await version(current.id);report.mainModule=base.main_module;report.originalModules=moduleHashes(base);
 const main=base.modules.find(m=>m.name===base.main_module);assert(main,'MAIN_MODULE_NOT_FOUND');const source=Buffer.from(main.content_base64,'base64').toString('utf8');const patched=patchMain(source);report.sourceBeforeHash=sha(source);report.sourceAfterHash=sha(patched);writeFileSync('audit/candidate-runtime.mjs',patched);
 beforeAssets=await inspectFiles(origin);report.assetsBefore=cleanMap(beforeAssets);PREVIOUS_RELEASE_HTML=beforeAssets['/'].hash;assert.equal(beforeAssets['/index.html'].hash,PREVIOUS_RELEASE_HTML,'PUBLIC_INDEX_HTML_DIFFERS');assert(beforeAssets['/'].body.toString().includes(STYLE_TAG),'PREVIOUS_TEAL_THEME_MISSING');report.baselinePublicSha=PREVIOUS_RELEASE_HTML;const expectedHtml=patchHTML(beforeAssets['/'].body.toString());report.expectedHtmlSha=sha(expectedHtml);report.healthBefore=await healthy(origin);save();
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'CHROME_NOT_FOUND');const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox']});
 try{
  report.beforeUI={};for(const width of [1440,390,360])for(const theme of ['light','dark'])report.beforeUI[width+'-'+theme]=await observe(browser,origin,width,theme,'before-'+width+'-'+theme);
  const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'B46_MOBILE_CARDS_PRE_RECOLOR_20261020','workers/message':'Restore original mobile card cascade only; desktop match hover-active untouched'}};
  for(const k of ['usage_model','logpush','limits','observability','placement'])if(baseSettings[k]!=null)metadata[k]=baseSettings[k];
  const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?patched:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
  assert.equal((await active()).id,EXPECTED_ACTIVE,'ACTIVE_CHANGED_BEFORE_CANDIDATE');
  const up=await api('/workers/scripts/'+SCRIPT+'/versions',form);candidate=up.id;report.candidate=candidate;report.workerWrites.push({type:'candidate-upload',id:candidate});save();
  const uploaded=await version(candidate);assert.equal(uploaded.annotations?.['workers/tag'],'B46_MOBILE_CARDS_PRE_RECOLOR_20261020','UNOWNED_CANDIDATE');const hashes=moduleHashes(uploaded);for(const v of report.originalModules){const uploadedModule=hashes.find(m=>m.name===v.name);assert(uploadedModule,'MODULE_MISSING');assert.equal(uploadedModule.hash,v.name===base.main_module?sha(patched):v.hash,'NON_PRESENTATION_MODULE_CHANGED '+v.name);}
  const preview='https://'+candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
  const testAssets=await inspectFiles(preview);for(const p of parts)assert.equal(testAssets[p].hash,p==='/'||p==='/index.html'?report.expectedHtmlSha:beforeAssets[p].hash,'PREVIEW_ASSET_CHANGED '+p);report.previewAssets=cleanMap(testAssets);report.previewHealth=await healthy(preview);
  report.previewUI={};for(const width of [1440,390,360])for(const theme of ['light','dark']){const k=width+'-'+theme;const val=await observe(browser,origin,width,theme,'candidate-'+k,testAssets['/'].body);report.previewUI[k]=val;save();console.log('SAME_ORIGIN_CANDIDATE_COMPARE',k,JSON.stringify({before:report.beforeUI[k],after:val}));checkUI(report.beforeUI[k],val,width,theme);}
  report.candidateVerified=true;save();
  assert.equal(canonical(await api('/workers/scripts/'+SCRIPT+'/settings')),canonical(baseSettings),'SETTINGS_CHANGED_BEFORE_ACTIVATION');assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),report.scheduleHash,'SCHEDULE_CHANGED_BEFORE_ACTIVATION');assert.equal((await active()).id,EXPECTED_ACTIVE,'ACTIVE_CHANGED_BEFORE_ACTIVATION');
  const activation=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'BALL46 restore pre-20-Oct mobile card colors only, desktop untouched'}});report.workerWrites.push({type:'production-activation',id:candidate,deployment:activation.id});switched=true;save();assert.equal((await active()).id,candidate,'ACTIVE_NOT_CANDIDATE');
  let matching=false;for(let i=0;i<20;i++){const f=await read(origin,'/');if(f.status===200&&f.hash===report.expectedHtmlSha){matching=true;break;}assert(f.hash===PREVIOUS_RELEASE_HTML,'UNEXPECTED_PUBLIC_CONTENT');await sleep(1800);}assert(matching,'PRODUCTION_CUTOVER_NOT_VISIBLE');
  const afterAssets=await inspectFiles(origin);for(const p of parts)assert.equal(afterAssets[p].hash,p==='/'||p==='/index.html'?report.expectedHtmlSha:beforeAssets[p].hash,'PRODUCTION_ASSET_CHANGED '+p);report.assetsAfter=cleanMap(afterAssets);
  report.healthAfter=await healthy(origin);
  for(const width of [1440,390,360])for(const theme of ['light','dark']){const k=width+'-'+theme;const v=await observe(browser,origin,width,theme,'production-'+k);checkUI(report.beforeUI[k],v,width,theme);}
  assert.equal(canonical(await api('/workers/scripts/'+SCRIPT+'/settings')),canonical(baseSettings),'SETTINGS_CHANGED_AFTER_ACTIVATION');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),report.scheduleHash,'SCHEDULE_CHANGED_AFTER_ACTIVATION');
  assert.equal((await active()).id,candidate,'ACTIVE_CHANGED_DURING_VERIFICATION');
  report.success=true;report.activeAfter=candidate;report.finished=new Date().toISOString();save();console.log('BALL46_MOBILE_PRE_RECOLOR_RESTORED_SUCCESS '+candidate);
 }finally{await browser.close();}
}catch(e){report.error=e.message;report.success=false;if(switched&&candidate){try{if((await active()).id===candidate){await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:EXPECTED_ACTIVE,percentage:100}],annotations:{'workers/message':'Auto-rollback dark match cards on verification failure'}});report.workerWrites.push({type:'rollback',to:EXPECTED_ACTIVE});report.rolledBack=(await active()).id===EXPECTED_ACTIVE;}}catch(restoreError){report.rollbackError=restoreError.message;}}report.finished=new Date().toISOString();save();console.error('BALL46_MOBILE_PRE_RECOLOR_RESTORED_STOP',e.stack||e.message);process.exitCode=1;}
