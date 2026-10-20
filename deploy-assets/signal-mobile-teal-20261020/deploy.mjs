import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {injectSignalTheme,SIGNAL_OVERLAY,MARKER} from './theme.mjs';
const SCRIPT='ball46-production',EXPECTED_ACTIVE='4d1e8a2b-ca44-4cad-bd45-ffc22c74127e',origin='https://ball46.com';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CLOUDFLARE_ACCOUNT_MISSING');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+account;
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const BASE='return __b46PcDarkPerformance20261020(await __b46MobileFeaturedElevation20261020(await __b46MobileSignalPanelElevation20261020(await __b46MobileFlowDepth20261020(await __b46MatchTitleElevation20261020(await __b46InjectFooter(response))))),url.pathname);';
const MATCH='return __b46DarkMatchCard20261020(await '+BASE.slice(7,-1)+',url.pathname);';
const INTERACTION='return __b46DarkMatchInteraction20261020(await '+MATCH.slice(7,-1)+',url.pathname);';
const MOBILE='return __b46MobileOriginalCards20261020(await '+INTERACTION.slice(7,-1)+',url.pathname);';
const PC_ACTIVE='return __b46PcNoInitialActive20261020(await '+MOBILE.slice(7,-1)+',url.pathname);';
const DRAWER='return __b46PcSeamlessDrawer20261020(await '+PC_ACTIVE.slice(7,-1)+',url.pathname);';
const ANCHOR='return __b46UltraSoftMobile20261020(await '+DRAWER.slice(7,-1)+',url.pathname);';
const NEXT='return __b46SignalMobileDeepTeal20261020(await '+ANCHOR.slice(7,-1)+',url.pathname);';
const helper=[
'function __b46SignalMobileThemeHtml20261020(s){',
'const overlay='+JSON.stringify(SIGNAL_OVERLAY)+';',
'if(!s.includes("b46-mobile-ultrasoft-flow-v3-20261020")||!s.includes("b46-pc-seamless-drawer-20261020")||!s.includes("</body>")||s.includes("b46-signal-mobile-deep-teal-v2-20261020"))throw new Error("SIGNAL_THEME_SOURCE_DRIFT");',
'return s.replace("</body>",overlay+"</body>");',
'}',
'async function __b46SignalMobileDeepTeal20261020(response,path){',
'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
'const original=await response.text();',
'const modified=__b46SignalMobileThemeHtml20261020(original);',
'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");',
'return new Response(modified,{status:response.status,statusText:response.statusText,headers});',
'}'
].join('\n');
function patchWorker(src){
 assert.equal(src.split(ANCHOR).length,2,'PRODUCTION_WORKER_CALL_CHAIN_CHANGED');
 assert(!src.includes('__b46SignalMobileDeepTeal20261020'),'SIGNAL_THEME_ALREADY_INSTALLED');
 const at=src.lastIndexOf('export default');assert(at>0,'MAIN_EXPORT_NOT_FOUND');
 const out=src.slice(0,at)+'\n'+helper+'\n'+src.slice(at).replace(ANCHOR,NEXT);
 assert.equal(out.replace('\n'+helper+'\n','').replace(NEXT,ANCHOR),src,'NON_TARGET_WORKER_CODE_CHANGED');
 return out;
}
mkdirSync('audit',{recursive:true});
const report={job:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,script:SCRIPT,baseline:EXPECTED_ACTIVE,scope:'Mobile Dark Signal menu only: Deep Graphite Teal match cards, header and drawer shadow; other tabs untouched',writes:[],startedAt:new Date().toISOString()};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function api(path,body=null){
 const res=await fetch(apiRoot+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
 const obj=await res.json();assert(res.ok&&obj.success===true,'CF_API_ERROR '+res.status+':'+JSON.stringify(obj.errors||[]));return obj.result;
}
async function active(){
 const r=await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1'),d=r.deployments?.[0];
 assert(d&&d.versions?.length===1&&Number(d.versions[0].percentage)===100,'NOT_100_PERCENT_ACTIVE_VERSION');
 return {version:d.versions[0].version_id,deployment:d.id};
}
async function version(id){const v=await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');assert(v.main_module&&Array.isArray(v.modules)&&v.modules.length>0,'WORKER_MODULE_MISSING');return v;}
const modulesHash=v=>v.modules.map(m=>({name:m.name,type:m.content_type,hash:sha(Buffer.from(m.content_base64,'base64'))})).sort((a,b)=>a.name.localeCompare(b.name));
async function read(base,path){
 const url=new URL(path,base);url.searchParams.set('flow_ultrasoft_audit',process.env.GITHUB_RUN_ID+'-'+Date.now());
 const res=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
 const buf=Buffer.from(await res.arrayBuffer());return {path,status:res.status,contentType:res.headers.get('content-type'),buf,hash:sha(buf)};
}
const urls=['/','/index.html','/app.css','/dashboard-v2-tune.css','/singlepage-workspace-343.js','/expanded-match-343.js'];
async function assets(base){const result={};for(const p of urls){const f=await read(base,p);assert.equal(f.status,200,'MISSING_ASSET '+p);result[p]=f;}return result;}
const mapHashes=a=>Object.fromEntries(Object.entries(a).map(([p,v])=>[p,{sha256:v.hash,bytes:v.buf.length,status:v.status}]));
async function health(base){
 const out={};
 for(const p of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals']){
  const r=await read(base,p);assert.equal(r.status,200,'API_HTTP_ERROR '+p);
  const obj=JSON.parse(r.buf.toString());assert.equal(obj.ok,true,'API_UNHEALTHY '+p);
  out[p]={ok:true,stale:obj.stale};
 }
 return out;
}
async function observe(browser,width,theme,shot,overrideHtml=null){
 const page=await browser.newPage(),errs=[];let injected=0;
 try{
  page.on('pageerror',e=>errs.push(String(e).slice(0,300)));
  if(overrideHtml){
   await page.setRequestInterception(true);
   page.on('request',req=>{
    const u=new URL(req.url());
    if(req.isNavigationRequest()&&u.hostname==='ball46.com'&&(u.pathname==='/'||u.pathname==='/index.html')){
     injected++;req.respond({status:200,contentType:'text/html; charset=utf-8',body:overrideHtml});
    }else req.continue();
   });
  }
  await page.setViewport({width,height:930,isMobile:width<=767,deviceScaleFactor:1});await page.setCacheEnabled(false);
  await page.goto(origin+'/?signal_card_qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:85000});
  await new Promise(r=>setTimeout(r,5200));
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await new Promise(r=>setTimeout(r,1000));
  const modes=width<=767?['all','live','upcoming','signal']:['all'];
  const out={width,theme,injected,modes:{},errors:[]};
  for(const mode of modes){
   if(width<=767){
    const clicked=await page.evaluate(mode=>{
     const b=document.querySelector('.b46m-item[data-b46m-page="'+mode+'"]')
       ||[...document.querySelectorAll('.b46m-item')].find(e=>(e.textContent||'').toLowerCase().includes(mode==='signal'?'signals':mode==='live'?'live':mode==='upcoming'?'upcoming':'all matches'));
     if(b){b.click();return true;}return false;
    },mode);
    assert(clicked,'MOBILE_NAV_ITEM_MISSING '+mode);
    await new Promise(r=>setTimeout(r,850));
   }
   const snap=await page.evaluate(mode=>{
    const sample=e=>{
     if(!e)return null;const c=getComputedStyle(e),r=e.getBoundingClientRect();
     return{w:+r.width.toFixed(2),h:+r.height.toFixed(2),left:+r.left.toFixed(2),bg:c.backgroundColor,image:c.backgroundImage,shadow:c.boxShadow,border:c.borderColor,borderWidth:c.borderWidth,padding:c.padding,color:c.color,radius:c.borderRadius};
    };
    const visible=s=>[...document.querySelectorAll(s)].find(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
    const check=visible('.workspace.singlepage .status-section .league-block > article.match-row');
    const mobile=visible('.b46gn-card'),pc=visible('.workspace.singlepage .match-row');
    const s={route:new URL(location.href).searchParams.get('view'),tag:document.documentElement.getAttribute('data-b46-signal-mobile-v2'),installed:!!window.__b46SignalMobileV2Installed,realSignal:sample(mode==='signal'?check:null),regularCard:sample(mode==='signal'?null:(innerWidth<=767?mobile:pc)),league:sample(visible('.workspace.singlepage .status-section .league-block > header.league-head')),signalCount:document.querySelectorAll('.workspace.singlepage .status-section .league-block > article.match-row').length,otherCard:sample(mobile)};
    // Use a synthetic Signal league/card to prove selector gating when live signals expire.
    const host=document.querySelector('.workspace.singlepage');
    if(host){
     const box=document.createElement('section');box.className='status-section';box.id='b46-signal-color-test';box.style.cssText='position:fixed;left:-15000px;top:0;width:360px';
     box.innerHTML='<section class="league-block"><header class="league-head">Test league</header><article class="match-row" role="button"><div>Fixture A – Fixture B</div></article><section class="match-expanded" data-expanded-match="test"><div class="match-expanded-inner"></div></section></section>';
     host.appendChild(box);
     const row=box.querySelector('article.match-row'),panel=box.querySelector('section.match-expanded'),head=box.querySelector('header.league-head');
     const normal=sample(row);
     row.classList.add('active');row.setAttribute('aria-expanded','true');
     const selected=sample(row),expanded=sample(panel);
     s.synthetic={normal,selected,expanded,head:sample(head)};
     box.remove();
    }
    s.flowScriptPresent=!!window.__b46MobileFlowUltraSoftV3Installed;
    return s;
   },mode);
   out.modes[mode]=snap;
   if(mode==='signal')await page.screenshot({path:'audit/'+shot+'-signal.png',fullPage:false});
  }
  out.errors=errs;
  return out;
 }finally{await page.close();}
}
function checkUI(a,b,width,theme,needsInjection){
 assert(a&&b,'BROWSER_CAPTURE_MISSING');
 assert.deepEqual(Object.keys(b.modes),Object.keys(a.modes),'NAVIGATION_MODES_CHANGED');
 assert(b.errors.length<=a.errors.length,'NEW_RUNTIME_JS_ERROR '+b.errors.join(';'));
 if(needsInjection)assert(b.injected>0,'PREVIEW_HTML_NOT_LOADED');
 for(const [mode,v] of Object.entries(b.modes)){
  const old=a.modes[mode];
  assert(old&&old.synthetic&&v.synthetic,'SYNTHETIC_SCOPED_FIXTURE_MISSING '+mode);
  assert.equal(v.flowScriptPresent,old.flowScriptPresent,'EVENT_FLOW_ULTRA_SOFT_LOST '+width+' '+mode);
  const expected=width<=767&&theme==='dark'&&mode==='signal';
  assert.equal(v.tag==='1',mode==='signal','SIGNAL_MENU_SCOPE_BAD '+mode+' '+width);
  for(const name of ['normal','selected','expanded','head']){
   const x=old.synthetic[name],y=v.synthetic[name];
   assert(x&&y,'MISSING_COMPARISON_ELEMENT '+name);
   for(const key of ['w','h','left','padding','borderWidth','color'])
    assert.deepEqual(y[key],x[key],'SYNTHETIC_GEOMETRY_TEXT_CHANGED '+width+' '+theme+' '+mode+' '+name+' '+key);
   if(!expected){
    for(const key of ['bg','image','shadow','radius','border'])
     assert.deepEqual(y[key],x[key],'NON_SIGNAL_CARD_CHANGED '+width+' '+theme+' '+mode+' '+name+' '+key);
   }
  }
  if(expected){
   const n=v.synthetic.normal,z=v.synthetic.selected,p=v.synthetic.expanded;
   assert(n.image.includes('28, 48, 41'),'SIGNAL_MATCH_NORMAL_DEEP_TEAL_MISSING '+width);
   assert(z.image.includes('44, 81, 65'),'SIGNAL_MATCH_EXPANDED_ACTIVE_MISSING '+width);
   assert(p.shadow.includes('44, 81, 65')&&!p.shadow.includes('42, 207, 131'),'SIGNAL_DRAWER_GREEN_FRAME_REMAINS '+width);
   assert.equal(v.synthetic.head.image,old.synthetic.head.image,'LEAGUE_HEAD_ALREADY_CORRECT_CHANGED');
   if(old.realSignal&&v.realSignal){
    for(const key of ['w','h','left','padding','borderWidth','color'])
     assert.deepEqual(v.realSignal[key],old.realSignal[key],'REAL_SIGNAL_MATCH_GEOMETRY_CHANGED '+width+' '+key);
    assert(v.realSignal.image.includes('28, 48, 41')||v.realSignal.image.includes('44, 81, 65'),'REAL_SIGNAL_MATCH_STILL_OLD_COLOR '+width);
   }
  } else {
   for(const key of ['realSignal','regularCard','otherCard']){
    if(old[key]&&v[key]){
     for(const prop of ['bg','image','shadow','borderWidth','color','w','h'])
      assert.deepEqual(v[key][prop],old[key][prop],'OTHER_SCREEN_CARD_CHANGED '+width+' '+theme+' '+mode+' '+key+'.'+prop);
    }
   }
  }
 }
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let candidate=null,activated=false;
try{
 report.unit='Previously deployed Event Flow V3 retained, asset SHA verified';report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'CURRENT_PRODUCTION_VERSION_MOVED_STOP');
 const domains=await api('/workers/domains');
 assert.deepEqual(domains.filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort(),['ball46.com','www.ball46.com'],'DOMAIN_ROUTE_DRIFT');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings'),schedules=await api('/workers/scripts/'+SCRIPT+'/schedules'),settingsSHA=sha(canonical(settings)),schedulesSHA=sha(canonical(schedules));
 const base=await version(EXPECTED_ACTIVE);report.baseModules=modulesHash(base);
 const main=base.modules.find(x=>x.name===base.main_module);assert(main,'MAIN_NOT_FOUND');
 const baselineSource=Buffer.from(main.content_base64,'base64').toString('utf8'),patchedSource=patchWorker(baselineSource);
 report.runtimeHashBefore=sha(baselineSource);report.runtimeHashAfter=sha(patchedSource);
 report.beforeAssets=mapHashes(await assets(origin));
 const original=await assets(origin),originalHTML=original['/'].hash;
 assert.equal(original['/index.html'].hash,originalHTML,'HTML_ASSET_NOT_IDENTICAL');
 assert(original['/'].buf.toString().includes('b46-pc-seamless-drawer-20261020')&&original['/'].buf.toString().includes('b46-mobile-ultrasoft-flow-v3-20261020'),'LATEST_WORKER_FEATURES_MISSING');
 const expectedHTML=injectSignalTheme(original['/'].buf.toString());
 report.expectedHTMLHash=sha(expectedHTML);report.originalScriptHash=original['/expanded-match-343.js'].hash;
 report.healthBefore=await health(origin);save();
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROME_MISSING');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try{
  report.beforeUI={};
  for(const width of [1440,430,390,360])for(const theme of ['light','dark']){const k=width+'-'+theme;report.beforeUI[k]=await observe(browser,width,theme,'before-'+k);}
  const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings,keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':'B46_SIGNAL_MOBILE_TEAL_V2_20261020','workers/message':'Mobile Dark Signal match card colors only, preserving other tabs and Event Flow'}};
  for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
  const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const m of base.modules)form.set(m.name,new Blob([m.name===base.main_module?patchedSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
  assert.equal((await active()).version,EXPECTED_ACTIVE,'ACTIVE_VERSION_MOVED_BEFORE_CANDIDATE');
  const candidateResponse=await api('/workers/scripts/'+SCRIPT+'/versions',form);candidate=candidateResponse.id;report.candidate=candidate;report.writes.push({type:'candidate-only-upload',id:candidate});save();
  const cv=await version(candidate);assert.equal(cv.annotations?.['workers/tag'],'B46_SIGNAL_MOBILE_TEAL_V2_20261020','UNOWNED_CANDIDATE');
  const modAfter=modulesHash(cv);
  for(const m of report.baseModules){const hit=modAfter.find(x=>x.name===m.name);assert(hit,'MISSING_UPLOADED_MODULE');assert.equal(hit.hash,m.name===base.main_module?sha(patchedSource):m.hash,'NON_TARGET_MODULE_CHANGED '+m.name);}
  const preview='https://'+candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
  const tested=await assets(preview);
  for(const p of urls)assert.equal(tested[p].hash,p==='/'||p==='/index.html'?report.expectedHTMLHash:original[p].hash,'PREVIEW_ASSET_CHANGED '+p);
  report.previewAssets=mapHashes(tested);report.previewHealth=await health(preview);
  report.previewUI={};
  for(const width of [1440,430,390,360])for(const theme of ['light','dark']){
   const k=width+'-'+theme;
   const val=await observe(browser,width,theme,'preview-'+k,tested['/'].buf);
   report.previewUI[k]=val;save();checkUI(report.beforeUI[k],val,width,theme,true);
  }
  report.candidateVerified=true;save();
  assert.equal((await active()).version,EXPECTED_ACTIVE,'PRODUCTION_MOVED_BEFORE_SWITCH');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/settings'))),settingsSHA,'WORKER_SETTINGS_DRIFT');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesSHA,'WORKER_CRONS_DRIFT');
  const promotion=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'BALL46 Signal mobile-only Dark Graphite Teal card and drawer colors'}});
  activated=true;report.writes.push({type:'production_100_percent',version:candidate,deployment:promotion.id});save();
  assert.equal((await active()).version,candidate,'CANDIDATE_NOT_ACTIVE');
  let visible=false;
  for(let i=0;i<20;i++){
   const f=await read(origin,'/');
   if(f.hash===report.expectedHTMLHash){visible=true;break;}
   assert.equal(f.hash,originalHTML,'UNKNOWN_PRODUCTION_HTML_VERSION');await sleep(1800);
  }
  assert(visible,'UPDATED_HTML_NOT_PUBLIC');
  const post=await assets(origin);
  for(const p of urls)assert.equal(post[p].hash,p==='/'||p==='/index.html'?report.expectedHTMLHash:original[p].hash,'PRODUCTION_ASSET_CHANGED '+p);
  report.afterAssets=mapHashes(post);report.healthAfter=await health(origin);
  report.productionUI={};
  for(const width of [1440,430,390,360])for(const theme of ['light','dark']){
   const k=width+'-'+theme;
   const val=await observe(browser,width,theme,'production-'+k);
   report.productionUI[k]=val;save();checkUI(report.beforeUI[k],val,width,theme,false);
  }
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/settings'))),settingsSHA,'SETTINGS_CHANGED');
  assert.equal(sha(canonical(await api('/workers/scripts/'+SCRIPT+'/schedules'))),schedulesSHA,'SCHEDULES_CHANGED');
  assert.equal((await active()).version,candidate,'ACTIVE_MOVED_DURING_CHECK');
  report.success=true;report.activeAfter=candidate;report.finishedAt=new Date().toISOString();save();
  console.log('BALL46_SIGNAL_MOBILE_THEME_V2_DEPLOY_SUCCESS',candidate);
 }finally{await browser.close();}
}catch(e){
 report.success=false;report.error=e.stack||String(e);
 if(activated&&candidate){try{
   if((await active()).version===candidate){
    await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:EXPECTED_ACTIVE,percentage:100}],annotations:{'workers/message':'Rollback mobile ultra soft flow after verification failure'}});
    report.writes.push({type:'automatic_rollback',to:EXPECTED_ACTIVE});
    report.rolledBack=(await active()).version===EXPECTED_ACTIVE;
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.finishedAt=new Date().toISOString();save();
 console.error('BALL46_SIGNAL_MOBILE_THEME_V2_DEPLOY_STOP',e.stack||String(e));process.exitCode=1;
}
