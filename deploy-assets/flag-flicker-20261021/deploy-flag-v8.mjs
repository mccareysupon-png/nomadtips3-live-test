import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {NEW_FLAG,OLD_START,OLD_END,transformFlagJS} from './flag-patch-v8.mjs';

const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
assert(ACCOUNT&&TOKEN,'NO_CLOUDFLARE_AUTH');
const SCRIPT='ball46-production',PROD='https://ball46.com',ALIAS='https://www.ball46.com';
const EXPECTED_ACTIVE='6bb3d318-80cd-4669-909d-21ea9d5fa936';
const OLD_CALL='return __b46NativeFeaturedMobile20261021(response,new URL(request.url).pathname); /* B46_NATIVE_MOBILE_20261021 */';
const NEW_CALL='return __b46FlagNoFlashV8(response,new URL(request.url).pathname); /* B46_LEAGUE_FLAG_V8 */';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const PATHS=['/','/index.html','/expanded-match-343.js','/singlepage-workspace-343.js','/singlepage-workspace-343.css','/featured-facts-premium-20261013a.css','/dashboard-v2-stage3-featured-facts-20261013a.js'];
const FLAG_PATH='/league-flags-343.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('proof',{recursive:true});
const report={task:'BALL46 league flags: remove globe-to-flag blink only; no row/data/Event Flow/CSS changes',at:new Date().toISOString()};
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
 assert.equal(source.split(OLD_CALL).length-1,1,'ACTIVE_WORKER_DISPATCH_DRIFT');
 assert(!source.includes('function __b46FlagNoFlashV8'),'FLAG_V8_ALREADY_ACTIVE');
 assert.equal(source.split('async function __b46NativeFeaturedMobile20261021').length-1,1,'EXISTING_WRAPPER_DRIFT');
 const helper='\nasync function __b46FlagNoFlashV8(response,path){\n'+
   ' const original=await __b46NativeFeaturedMobile20261021(response,path);\n'+
   ' if(path!=='+JSON.stringify(FLAG_PATH)+'||!original||original.status!==200)return original;\n'+
   ' const source=await original.text();\n'+
   ' const before='+JSON.stringify(OLD_START)+',after='+JSON.stringify(OLD_END)+',replacement='+JSON.stringify(NEW_FLAG)+';\n'+
   ' if(source.split(before).length!==2||source.split(after).length!==2)throw Error("BALL46_FLAGS_SOURCE_DRIFT");\n'+
   ' const a=source.indexOf(before),b=source.indexOf(after,a);\n'+
   ' const portion=source.slice(a,b);\n'+
   ' if(!portion.includes("const placeholder=globe();")||!portion.includes("return placeholder;"))throw Error("BALL46_FLAG_BEHAVIOR_CHANGED");\n'+
   ' const output=source.slice(0,a)+replacement+source.slice(b);\n'+
   ' const headers=new Headers(original.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");\n'+
   ' return new Response(output,{status:original.status,statusText:original.statusText,headers});\n'+
   '}\n';
 const updated=source.replace(OLD_CALL,NEW_CALL)+helper;
 assert.equal(updated.slice(0,-helper.length).replace(NEW_CALL,OLD_CALL),source,'UNRELATED_WORKER_CODE_CHANGE');
 return updated;
}
async function browserQA(domain,phase,patched){
 const b=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const results=[];
 try{
  for(const [width,theme] of [[390,'dark'],[390,'light'],[1440,'dark'],[1440,'light']]){
   const p=await b.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(String(e).slice(0,250)));
   try{
    await p.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});
    await p.goto(domain+'/?view=all&b46_flag_v8_test='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await p.waitForFunction(()=>window.NOMAD_LEAGUE_FLAGS_343?.iconCount===143&&document.querySelectorAll('[data-league-flag-code]').length>8,{timeout:50000,polling:250});
    // Read-only capture of the actual DOM; refresh is normally triggered by the existing live engine.
    await wait(2200);
    const states=[];
    for(let i=0;i<5;i++){
      const snap=await p.evaluate(()=>{
        const known=[...document.querySelectorAll('.league-flag-ready[data-league-flag-code]')].filter(n=>!/^(WORLD|unknown)$/.test(n.dataset.leagueFlagCode));
        const loaded=known.filter(n=>{const img=n.querySelector(':scope > img.league-flag');return img&&img.complete&&img.naturalWidth>0}).length;
        const globes=known.filter(n=>n.querySelector(':scope > .league-globe')).length;
        const flags=known.filter(n=>n.querySelector(':scope > img.league-flag')).length;
        const hasFeatured=!!document.querySelector('.right-rail > .featured-card[data-featured] .feature-facts');
        const displayedFeature=!!document.querySelector('.right-rail > .featured-card[data-featured]')?.getBoundingClientRect().width;
        return {count:known.length,loaded,globes,flags,hasFeatured,displayedFeature,
          iconCount:window.NOMAD_LEAGUE_FLAGS_343.iconCount,
          sample:known.slice(0,5).map(n=>({code:n.dataset.leagueFlagCode,text:n.textContent?.slice(0,35),img:n.querySelector('img')?.getAttribute('src')||null})),
          docWidth:document.documentElement.scrollWidth};
      });
      states.push(snap);await wait(450);
    }
    assert(states.every(s=>s.count>=8&&s.hasFeatured&&s.iconCount===143),'LEAGUE_FLAG_REGISTRY_OR_CARD_CHANGED');
    assert(states.every(s=>s.docWidth<=width+5),'HORIZONTAL_OVERFLOW');
    if(patched){
      assert(states.every(s=>s.globes===0),'KNOWN_COUNTRY_GLOBE_STILL_BLINKS '+JSON.stringify(states));
      assert(states.at(-1).loaded>=5,'FLAG_IMAGE_NOT_LOADED '+JSON.stringify(states));
      assert(states.every(s=>s.flags===s.count),'KNOWN_FLAGS_NOT_RENDERED_DIRECTLY');
    }
    if(width>=768){
      const pc=await p.evaluate(()=>{
        const root=document.querySelector('.right-rail > .featured-card[data-featured]');
        const fact=[...root.querySelectorAll('.feature-facts>div')];
        return {width:root.getBoundingClientRect().width,count:fact.length,
         sunken:fact.every(x=>getComputedStyle(x).boxShadow.includes('inset')),
         headings:fact.map(x=>x.querySelector('span')?.textContent)};
      });
      assert(pc.width>=260&&pc.count===4&&pc.sunken,'PC_FEATURED_V7_REGRESSION '+JSON.stringify(pc));
    }else{
      // Existing original mobile modal; opening an actual match must still work.
      await p.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]'),{timeout:40000,polling:250});
      await p.evaluate(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture]').click());
      await p.waitForFunction(()=>document.querySelector('#b46gn-detail[aria-hidden="false"] .b46gn-featured .featured-card .feature-facts'),{timeout:22000,polling:250});
      const mobile=await p.evaluate(()=>{
        const dlg=document.querySelector('#b46gn-detail'),facts=[...dlg.querySelectorAll('.b46gn-featured .featured-card .feature-facts>div')];
        return {facts:facts.length,recessed:facts.every(x=>getComputedStyle(x).boxShadow.includes('inset')),
          v5:document.querySelectorAll('.b46-native-summary').length,
          v4:document.querySelectorAll('.b46x-live-detail').length,
          eventFlowPresent:!!document.querySelector('.expand-flow-card'),
          fullMarketPresent:!!document.querySelector('.expand-full-market-card')};
      });
      assert(mobile.facts===4&&mobile.recessed&&!mobile.v4&&!mobile.v5&&mobile.eventFlowPresent&&mobile.fullMarketPresent,'MOBILE_V6_OR_EVENT_FLOW_REGRESSION '+JSON.stringify(mobile));
    }
    // Browser-only overlay dismissal for screenshot proof; never sent to Production.
    await p.evaluate(()=>{
      const sel=innerWidth>=768?'.right-rail > .featured-card[data-featured]':'#b46gn-detail .b46gn-featured .featured-card';
      document.querySelector(sel)?.scrollIntoView({block:'center',behavior:'instant'});
      document.querySelector('#b46-data-orbit-loading')?.style.setProperty('display','none','important');
    });
    await p.screenshot({path:'proof/'+phase+'-'+width+'-'+theme+'.png',fullPage:false});
    console.log('B46_FLAG_V8_BROWSER_PASS',JSON.stringify({phase,domain,width,theme,patched,states,errors}));
    assert.deepEqual(errors,[],'BROWSER_JS_ERRORS '+JSON.stringify(errors));
    results.push({width,theme,states});
   }finally{await p.close();}
  }
 }finally{await b.close();}
 return results;
}
let promoted=false,rollbackAttempted=false;
try{
 report.activeBefore=await active();
 assert.equal(report.activeBefore.version,EXPECTED_ACTIVE,'WORKER_CHANGED_FROM_V7_STOP');
 const current=await version(report.activeBefore.version);
 const originalMain=current.modules.find(x=>x.name===current.main_module);
 assert(originalMain,'MAIN_MODULE_NOT_FOUND');
 const source=Buffer.from(originalMain.content_base64,'base64').toString('utf8');
 const modified=patchWorker(source);
 const files=await fetchSet(PROD);
 const originalFlag=await get(PROD,FLAG_PATH);
 assert.equal(originalFlag.status,200,'ORIGINAL_FLAGS_JS_MISSING');
 const expectedFlag=transformFlagJS(originalFlag.bytes.toString('utf8'));
 report.oldFlagHash=originalFlag.hash;report.newFlagHash=hash(expectedFlag);
 report.beforeQA=await browserQA(PROD,'before',false);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_PRECHECK');
 const domains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'WRONG_WORKER_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,
   compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets.config},
   annotations:{'workers/tag':'B46_FLAG_FLICKER_V8_20261021','workers/message':'Fix repeated country flag globe swap; other code, CSS and assets preserved'}};
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
 const candidateFlag=await get(preview,FLAG_PATH);
 assert.equal(candidateFlag.hash,report.newFlagHash,'FLAG_JS_WRONG_PATCH');
 report.candidateQA=await browserQA(preview,'candidate',true);
 assert.deepEqual(await active(),report.activeBefore,'WORKER_CHANGED_DURING_CANDIDATE_QA');
 const deploy=await api('/workers/scripts/'+SCRIPT+'/deployments',
  {strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],annotations:{'workers/message':'Fix blinking league flags only, all other modules/assets unchanged'}});
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
   const flag=await get(domain,FLAG_PATH),head=await get(domain,'/');
   if(flag.hash===report.newFlagHash&&head.hash===files['/'].hash){propagated=true;break;}
   assert.equal((await active()).version,uploaded.id,'OTHER_PRODUCTION_VERSION_DURING_EDGE');await wait(1800);
  }
  assert(propagated,'LIVE_EDGE_HAS_OLD_FLAG_ASSET '+domain);
 }
 const liveFiles=await fetchSet(PROD);
 for(const p of PATHS)assert.equal(liveFiles[p].hash,files[p].hash,'UNRELATED_PRODUCTION_ASSET_CHANGED '+p);
 assert.equal((await get(PROD,FLAG_PATH)).hash,report.newFlagHash,'PRODUCTION_FLAG_ASSET_WRONG');
 report.productionQA=await browserQA(PROD,'production',true);
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_NOT_PROMOTED_VERSION');
 report.ok=true;save();
 console.log('B46_FLAG_FLICKER_V8_PRODUCTION_SUCCESS',JSON.stringify({workerVersion:uploaded.id,previousVersion:report.activeBefore.version,
  flagModuleChangedOnly:true,pcV7Preserved:true,mobileV6Preserved:true,eventFlowUntouched:true,otherAssetsUnchanged:true,qa:'pass'}));
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
       annotations:{'workers/message':'Auto rollback: flag flicker fix did not pass browser QA'}});
     report.rollback='previous_active_requested';break;
    }
    if(a.version!==report.activeBefore.version)break;await wait(900);
   }
  }catch(err){report.rollbackError=String(err);}
 }
 report.rollbackAttempted=rollbackAttempted;save();
 console.error('B46_FLAG_FLICKER_V8_STOP',report.error);
 process.exitCode=1;
}