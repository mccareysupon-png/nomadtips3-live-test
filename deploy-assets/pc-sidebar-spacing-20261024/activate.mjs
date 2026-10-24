import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{chromium}from'playwright-core';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-production',BEFORE='3d9e0ad6-6b23-4abe-9981-4c8d3fbd4eda',NEXT='246319a6-203b-475f-afd6-95ed792b35be';
const TAG='b46-pc-sidebar-spacing-20261024',NEW_HTML_SHA='587574ecd6e02fd397f198e73eecb0c62ad0c5bccd94667e14ec13d82d999145';
assert(A&&T);
const hosts=['https://ball46.com','https://www.ball46.com'],unchanged=['/live-prediction-343.js','/signal.html','/signal-next.js','/statistics.html','/dashboard-v2-stage3-featured-facts-20261013a.js','/prediction-v8/jersey-0-3d-v8.webp'];
const digest=b=>createHash('sha256').update(b).digest('hex');
async function cf(p,body){
 if(body!==undefined)assert.equal(p,'/workers/scripts/'+W+'/deployments');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{method:body?'POST':'GET',headers:{authorization:'Bearer '+T,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)}),j=await r.json();
 if(!r.ok||!j.success)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors).slice(0,350));return j.result;
}
async function active(){
 const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];
 assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);
 return{version:d.versions[0].version_id,deployment:d.id};
}
async function read(host,p){
 const u=new URL(p,host);u.searchParams.set('sidebarLiveQa',Date.now()+''+Math.random());
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(70000)}),b=Buffer.from(await r.arrayBuffer());
 return{status:r.status,hash:digest(b),body:b};
}
async function switchTo(version,expected,message){
 assert.equal((await active()).version,expected,'PRODUCTION_VERSION_CHANGED_ABORT');
 return(await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':message}})).id;
}
async function browserQA(){
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const out=[];
 try{
  for(const d of[{name:'pc-dark',width:1366,height:900,theme:'dark'},{name:'pc-light',width:1366,height:900,theme:'light'},{name:'mobile',width:390,height:844,theme:'dark'}]){
   const page=await browser.newPage({viewport:{width:d.width,height:d.height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const r=await page.goto('https://ball46.com/?sidebarProdQa='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});assert.equal(r.status(),200);
   await page.waitForTimeout(7000);await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),d.theme);
   const info=await page.evaluate(()=>{
    const rail=document.querySelector('.workspace.singlepage>.left-rail'),brand=rail?.querySelector('.workspace-brand-card'),member=rail?.querySelector('[data-b46-member-independent="1"]'),
    status=rail?.querySelector('.b46-mobile-status-menu'),stats=rail?.querySelector('.workspace-stats-card'),mb=e=>parseFloat(getComputedStyle(e).marginBottom),y=e=>Math.round(e.getBoundingClientRect().top);
    return{tag:!!document.getElementById('b46-pc-sidebar-spacing-20261024'),margin:{brand:mb(brand),member:mb(member),status:mb(status),statusTitle:mb(status.querySelector('.rail-title')),statsTitle:mb(stats.querySelector('.rail-title'))},
    y:{member:y(member),status:y(status),stats:y(stats)},rows:[...status.querySelectorAll('button')].map(e=>Math.round(e.getBoundingClientRect().height)),
    voteCards:document.querySelectorAll('[data-pv-version="8"]').length,width:document.documentElement.scrollWidth};
   });
   assert(info.tag&&info.voteCards===1,'STYLE_OR_PREDICTION_MISSING_'+d.name);
   if(d.width>=761){
    assert.deepEqual(info.margin,{brand:0,member:0,status:0,statusTitle:4,statsTitle:2},'PC_MARGIN_CHANGED_'+d.name);
    assert.deepEqual(info.y,{member:110,status:154,stats:402},'PC_POSITIONS_CHANGED_'+d.name);
    assert(info.rows.every(n=>n===34),'PC_NAV_ROW_HEIGHT_CHANGED_'+d.name);
   }else{
    assert.deepEqual(info.margin,{brand:6,member:6,status:6,statusTitle:0,statsTitle:0},'MOBILE_MARGIN_CHANGED');
    assert(info.width<=d.width,'MOBILE_OVERFLOW');
   }
   assert.equal(errors.length,0,'JS_ERRORS_'+d.name+':'+errors.slice(0,2).join(';'));
   out.push({device:d.name,margin:info.margin,position:info.y,voteCards:info.voteCards});
   await page.close();
  }
 }finally{await browser.close()}
 return out;
}
let changed=false;
try{
 assert.equal((await active()).version,BEFORE,'LATEST_PRODUCTION_VERSION_CHANGED');
 const version=await cf('/workers/workers/'+W+'/versions/'+NEXT+'?include=modules');
 assert.equal(version.annotations?.['workers/tag'],'BALL46_PC_SIDEBAR_SPACING_20261024','WRONG_CANDIDATE');
 assert.equal(version.modules.length,20,'V8_MODULES_MISSING');
 const originals=new Map(),config=JSON.stringify(await cf('/workers/scripts/'+W+'/settings'));
 for(const host of hosts)for(const p of unchanged)originals.set(host+p,await read(host,p));
 const preview=await read('https://246319a6-ball46-production.mccarey-supon.workers.dev','/');
 assert.equal(preview.status,200);assert.equal(preview.hash,NEW_HTML_SHA,'CANDIDATE_CHANGED');
 const id=await switchTo(NEXT,BEFORE,'BALL46 PC sidebar spacing only: 62px tighter group separation, original V8 and mobile unchanged');
 changed=true;
 let consecutive=0;
 for(let i=0;i<40&&consecutive<2;i++){
  assert.equal((await active()).version,NEXT,'PARALLEL_DEPLOYMENT_AFTER_SWITCH');
  let ok=true;for(const host of hosts){const r=await read(host,'/');if(r.status!==200||!r.body.includes(Buffer.from(TAG))||!r.body.includes(Buffer.from('data-pv-version="8"')))ok=false;}
  consecutive=ok?consecutive+1:0;
  if(consecutive<2)await new Promise(r=>setTimeout(r,2000));
 }
 assert.equal(consecutive,2,'PRODUCTION_STALE_AFTER_DEPLOY');
 for(const [key,before]of originals){const u=new URL(key),after=await read(u.origin,u.pathname);assert.equal(after.status,before.status,'OTHER_HTTP_'+key);assert.equal(after.hash,before.hash,'OTHER_ASSET_CHANGED_'+key);}
 for(const host of hosts){
  for(const path of['/api/engine/health','/api/engine/signals','/api/full-market/health']){
   const r=await read(host,path);assert.equal(r.status,200,'API_HTTP_'+host+path);assert.equal(JSON.parse(r.body.toString()).ok,true,'API_NOT_OK_'+host+path);
  }
 }
 assert.equal(JSON.stringify(await cf('/workers/scripts/'+W+'/settings')),config,'CONFIG_CHANGED');
 const browser=await browserQA();
 assert.equal((await active()).version,NEXT,'PRODUCTION_CHANGED_DURING_VERIFICATION');
 console.log('B46_PC_SIDEBAR_PRODUCTION_PASS='+JSON.stringify({ok:true,active:NEXT,deployment:id,domains:2,assetsUnchanged:unchanged.length,apiChecks:6,browser}));
}catch(e){
 console.error('B46_PC_SIDEBAR_PRODUCTION_FAIL='+String(e.stack||e).slice(0,1250));
 if(changed){try{if((await active()).version===NEXT)console.log('B46_PC_SIDEBAR_ROLLBACK='+await switchTo(BEFORE,NEXT,'Rollback PC sidebar spacing because guarded QA failed'));}catch(x){console.error('B46_PC_SIDEBAR_ROLLBACK_ERROR='+String(x.message||x))}}
 process.exitCode=1;
}
