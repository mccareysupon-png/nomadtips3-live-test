import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {TARGET,OLD_HANDLER,NEW_HANDLER,patchNav} from './league-nav-patch.mjs';

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'NO_CLOUDFLARE_AUTH');
const SCRIPT='ball46-production',PROD='https://ball46.com',ALIAS='https://www.ball46.com';
const EXPECTED_ACTIVE='d535dfc0-bf7a-4419-906e-bc762abed6d4';
const OLD_CALL='return __b46FlagNoFlashV8(response,new URL(request.url).pathname); /* B46_LEAGUE_FLAG_V8 */';
const NEW_CALL='return __b46StatsLeaguesNavV9(response,new URL(request.url).pathname); /* B46_STATS_LEAGUES_V9 */';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const PATHS=['/','/index.html','/expanded-match-343.js','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/featured-facts-premium-20261013a.css','/league-flags-343.js'];
const NAV_PATH=TARGET;
const hash=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('proof',{recursive:true});
const report={task:'BALL46 Statistics League selection: switch into All Matches when choosing a league; no cards/flags/Event Flow changed',at:new Date().toISOString()};
const save=()=>writeFileSync('proof/report.json',JSON.stringify(report,null,2));
async function api(path,body){
 const r=await fetch(ROOT+path,{method:body?'POST':'GET',
  headers:{Authorization:'Bearer '+TOKEN,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},
  body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined,
  signal:AbortSignal.timeout(60000)});
 const data=await r.json();
 assert(r.ok&&data.success,'CF_API_ERROR '+path+' '+JSON.stringify(data.errors));
 return data.result;
}
async function active(){
 const data=await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1');
 const d=data.deployments[0];
 assert(d?.versions?.length===1&&Number(d.versions[0].percentage)===100,'ACTIVE_WORKER_SPLIT');
 return {version:d.versions[0].version_id,deployment:d.id};
}
async function version(v){const d=await api('/workers/workers/'+SCRIPT+'/versions/'+v+'?include=modules');
 assert(d.main_module&&d.modules?.length,'ACTIVE_MODULES_UNREADABLE');return d;}
async function get(origin,path){
 let last;
 for(let i=0;i<5;i++)try{
  const u=new URL(path,origin);u.searchParams.set('b46_no_flag_flicker',process.env.GITHUB_RUN_ID+'-'+Date.now());
  const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  const bytes=Buffer.from(await r.arrayBuffer());
  return {status:r.status,bytes,hash:hash(bytes),contentType:r.headers.get('content-type')};
 }catch(e){last=e;await wait(600*(i+1));}
 throw last;
}
async function fetchSet(origin){
 const result={};
 for(const p of PATHS){
  const d=await get(origin,p);assert.equal(d.status,200,'ASSET_FAILED '+origin+p);result[p]=d;
 }
 return result;
}
function patchWorker(source){
 assert.equal(source.split(OLD_CALL).length-1,1,'ACTIVE_V8_DISPATCH_CHANGED');
 assert(!source.includes('function __b46StatsLeaguesNavV9'),'V9_ALREADY_PRESENT');
 assert.equal(source.split('async function __b46FlagNoFlashV8').length-1,1,'V8_FLAGS_WRAPPER_DRIFT');
 const helper='\nasync function __b46StatsLeaguesNavV9(response,path){\n'+
  ' const original=await __b46FlagNoFlashV8(response,path);\n'+
  ' if(path!=='+JSON.stringify(NAV_PATH)+'||!original||original.status!==200)return original;\n'+
  ' const before='+JSON.stringify(OLD_HANDLER)+',after='+JSON.stringify(NEW_HANDLER)+';\n'+
  ' const source=await original.text();\n'+
  ' if(source.split(before).length!==2)throw Error("LEAGUES_HANDLER_DRIFT");\n'+
  ' const output=source.replace(before,after);\n'+
  ' const headers=new Headers(original.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");\n'+
  ' return new Response(output,{status:original.status,statusText:original.statusText,headers});\n'+
  '}\n';
 const out=source.replace(OLD_CALL,NEW_CALL)+helper;
 assert.equal(out.slice(0,-helper.length).replace(NEW_CALL,OLD_CALL),source,'UNRELATED_WORKER_CODE_CHANGE');
 return out;
}

async function browserQA(domain,phase,patched){
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const results=[];
 try{
  const cases=phase==='before'?[[1440,'statistics'],[390,'statistics']]:
     [[1440,'statistics'],[1440,'live'],[1440,'signal'],[390,'statistics'],[390,'live']];
  for(const [width,view] of cases){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e).slice(0,150)));
   try{
    await page.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});
    await page.goto(domain+'/?view='+view+'&b46_nav_v9='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.querySelector('.workspace.singlepage')&&window.NOMAD_LEAGUE_FLAGS_343?.iconCount===143,{timeout:50000});
    await page.waitForFunction(()=>document.querySelectorAll('[data-league-filter]').length>5,{timeout:55000});
    await wait(850);
    const before=await page.evaluate(()=>{
     const fact=[...document.querySelectorAll('.right-rail > .featured-card[data-featured] .feature-facts > div')];
     return {view:document.body.dataset.workspaceView, count:document.querySelectorAll('[data-league-filter]').length,
      pcFacts:fact.length,pcRecessed:fact.length===4&&fact.every(x=>getComputedStyle(x).boxShadow.includes('inset')),
      flags:window.NOMAD_LEAGUE_FLAGS_343.iconCount,hasDrawer:!!document.querySelector('[data-b46m-open]'),
      docWidth:document.documentElement.scrollWidth};
    });
    assert(before.count>5&&before.flags===143,'BOARD_OR_FLAG_REGISTRY_CHANGED');
    assert(before.docWidth<=width+5,'PAGE_OVERFLOW');
    assert(before.pcFacts===4&&before.pcRecessed,'PC_FEATURED_V7_REGRESSED');
    let clicked={};
    if(width>=768){
      const chosen=await page.$('[data-league-filter]:not([disabled])');
      assert(chosen,'LEAGUE_FILTER_MISSING');
      await chosen.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
      const league=await chosen.evaluate(el=>el.dataset.leagueFilter);
      await chosen.click({delay:75,timeout:10000});
      await wait(800);
      const after=await page.evaluate(league=>{
        const buttons=[...document.querySelectorAll('[data-league-filter]')];
        const selected=buttons.find(x=>x.dataset.leagueFilter===league);
        const names=[...document.querySelectorAll('.league-block .league-head')].map(x=>x.textContent.replace(/\s+/g,' ').trim()).slice(0,5);
        const statsPanel=document.querySelector('[data-workspace-panel="statistics"]');
        const livePanel=document.querySelector('[data-workspace-panel="live"]');
        return {view:document.body.dataset.workspaceView,selected:!!selected?.classList.contains('active'),
          liveVisible:!!livePanel&&!livePanel.hidden,
          statsHidden:!!statsPanel?.hidden,leagueNames:names,
          url:location.href,docWidth:document.documentElement.scrollWidth,
          factCount:document.querySelectorAll('.right-rail > .featured-card[data-featured] .feature-facts > div').length};
      },league);
      clicked={league,after};
      assert(after.selected,'LEAGUE_SELECTION_NOT_ACTIVE');
      if(view==='statistics'){
        assert.equal(after.view,patched?'live':'statistics','STATISTICS_LEAGUE_NAVIGATION_WRONG');
        if(patched)assert(after.liveVisible&&after.statsHidden,'ALL_MATCHES_NOT_VISIBLE_AFTER_LEAGUE');
      }else assert.equal(after.view,view,'UNRELATED_VIEW_CHANGED_AFTER_LEAGUE');
    }else {
      // Existing mobile navigation must continue working with no added menu.
      const nav=await page.$('[data-b46m-open]');
      assert(nav,'MOBILE_MENU_TOGGLE_MISSING');
      await nav.click();
      await page.waitForFunction(()=>document.querySelector('#b46m-drawer[aria-hidden="false"]'),{timeout:5000});
      const all=await page.$('#b46m-drawer [data-b46m-status="all"]');
      assert(all,'ORIGINAL_MOBILE_ALL_MATCHES_MISSING');
      await all.click();
      await wait(550);
      const current=await page.evaluate(()=>({view:document.body.dataset.workspaceView,drawer:document.querySelector('#b46m-drawer')?.getAttribute('aria-hidden'),facts:document.querySelectorAll('.right-rail > .featured-card[data-featured] .feature-facts>div').length}));
      assert.equal(current.view,'live','ORIGINAL_MOBILE_NAV_CHANGED');
      clicked={mobileAfter:current};
      // Open a real match from existing UI, and check its facts unchanged.
      const fixture=await page.$('#b46gn-cards [data-b46gn-fixture]');
      if(fixture){
       await fixture.click();
       await page.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card'),{timeout:10000});
       const detail=await page.evaluate(()=>({
         wells:document.querySelectorAll('#b46gn-detail .b46gn-featured .featured-card .feature-facts>div').length,
         shadows:[...document.querySelectorAll('#b46gn-detail .b46gn-featured .featured-card .feature-facts>div')].every(n=>getComputedStyle(n).boxShadow.includes('inset')),
         v4:document.querySelectorAll('.b46x-live-detail').length,v5:document.querySelectorAll('.b46-native-summary').length,
         eventFlow:!!document.querySelector('.expand-flow-card'),fullMarket:!!document.querySelector('.expand-full-market-card')
       }));
       assert(detail.wells===4&&detail.shadows&&!detail.v4&&!detail.v5&&detail.eventFlow&&detail.fullMarket,'MOBILE_V6_EVENT_FLOW_CHANGED '+JSON.stringify(detail));
       clicked.mobileDetail=detail;
      }
    }
    assert.deepEqual(errors,[],'BROWSER_ERRORS '+JSON.stringify(errors));
    await page.screenshot({path:'proof/'+phase+'-'+width+'-'+view+'.png',fullPage:false});
    console.log('B46_STATS_LEAGUES_NAV_V9_BROWSER_PASS',JSON.stringify({phase,width,view,domain,patched,before,clicked}));
    results.push({width,view,before,clicked});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
 return results;
}

let promoted=false,rollbackAttempted=false;
try{
 report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'WORKER_CHANGED_FROM_V8_STOP');
 const current=await version(report.activeBefore.version);
 const originalMain=current.modules.find(x=>x.name===current.main_module);
 assert(originalMain,'MAIN_MODULE_NOT_FOUND');
 const source=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
 const modified=patchWorker(source);
 const files=await fetchSet(PROD);
 const originalFlag=await get(PROD,NAV_PATH);
 assert.equal(originalFlag.status,200,'ORIGINAL_LEAGUE_NAV_JS_MISSING');
 const expectedFlag=patchNav(originalFlag.bytes.toString('utf8'));
 report.oldFlagHash=originalFlag.hash;report.newFlagHash=hash(expectedFlag);
 report.beforeQA=await browserQA(PROD,'before',false);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_PRECHECK');
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,
   compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
   annotations:{'workers/tag':'B46_STATS_LEAGUES_NAV_V9_20261021','workers/message':'Restore league filter navigation from Statistics to All Matches; preserve other code and assets'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 const form=new FormData();
 form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of current.modules)form.set(m.name,new Blob([m.name===current.main_module?modified:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 report.candidate=uploaded.id;
 const candVersion=await version(uploaded.id);
 for(const m of candVersion.modules){
  const old=current.modules.find(x=>x.name===m.name);
  assert(old,'UNKNOWN_WORKER_MODULE '+m.name);
  const actualHash=hash(Buffer.from(m.content_base64,'base64'));
  assert.equal(actualHash,m.name===current.main_module?hash(modified):hash(Buffer.from(old.content_base64,'base64')),'UNRELATED_WORKER_MODULE_CHANGED '+m.name);
 }
 const sub=(await api('/workers/subdomain')).subdomain||'mccarey-supon';
 const preview='https://'+uploaded.id.slice(0,8)+'-'+SCRIPT+'.'+sub+'.workers.dev';
 report.preview=preview;save();
 const candidateFiles=await fetchSet(preview);
 for(const p of PATHS)assert.equal(candidateFiles[p].hash,files[p].hash,'UNRELATED_ASSET_CHANGED '+p);
 const candidateFlag=await get(preview,NAV_PATH);
 assert.equal(candidateFlag.hash,report.newFlagHash,'LEAGUE_NAV_JS_WRONG_PATCH');
 report.candidateQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_CANDIDATE_QA');
 const deploy=await api('/workers/scripts/'+SCRIPT+'/deployments',
  {strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],annotations:{'workers/message':'Fix Statistics to League navigation only, unchanged cards, markets and Event Flow'}});
 promoted=true;report.deployment=deploy.id;save();
 let live=false;
 for(let i=0;i<25;i++){
  const a=await active();
  if(a.version===uploaded.id){live=true;break;}
  assert.equal(a.version,report.activeBefore.version,'UNEXPECTED_WORKER_VERSION_DURING_DEPLOY');await wait(1200);
 }
 assert(live,'DEPLOY_ACCEPTED_NOT_ACTIVE');
 for(const domain of [PROD,ALIAS]){
  let propagated=false;
  for(let i=0;i<25;i++){
   const flag=await get(domain,NAV_PATH),head=await get(domain,'/');
   if(flag.hash===report.newFlagHash&&head.hash===files['/'].hash){propagated=true;break;}
   assert.equal((await active()).version,uploaded.id,'OTHER_PRODUCTION_VERSION_DURING_EDGE');await wait(1800);
  }
  assert(propagated,'LIVE_EDGE_HAS_OLD_LEAGUE_NAV_JS '+domain);
 }
 const liveFiles=await fetchSet(PROD);
 for(const p of PATHS)assert.equal(liveFiles[p].hash,files[p].hash,'UNRELATED_PRODUCTION_ASSET_CHANGED '+p);
 assert.equal((await get(PROD,NAV_PATH)).hash,report.newFlagHash,'PRODUCTION_LEAGUE_NAV_ASSET_WRONG');
 report.productionQA=await browserQA(PROD,'production',true);
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_NOT_PROMOTED_VERSION');
 report.ok=true;save();
 console.log('B46_STATS_LEAGUES_NAV_V9_PRODUCTION_SUCCESS',JSON.stringify({workerVersion:uploaded.id,previousVersion:report.activeBefore.version,
  statisticsLeaguesClickable:true,leagueFiltersPreserved:true,flagV8Preserved:true,pcV7Preserved:true,mobileV6Preserved:true,eventFlowUntouched:true,otherAssetsUnchanged:true,qa:'pass'}));
}catch(e){
 report.error=e.stack||String(e);
 if(promoted&&report.candidate&&report.activeBefore){
  try{
   for(let k=0;k<10;k++){
    const a=await active();
    if(a.version===report.candidate){
     rollbackAttempted=true;
     await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',
       versions:[{version_id:report.activeBefore.version,percentage:100}],
       annotations:{'workers/message':'Auto rollback: statistics leagues navigation regression'}});
     report.rollback='previous_active_requested';break;
    }
    if(a.version!==report.activeBefore.version)break;await wait(900);
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.rollbackAttempted=rollbackAttempted;save();
 console.error('B46_STATS_LEAGUES_NAV_V9_STOP',report.error);
 process.exitCode=1;
}