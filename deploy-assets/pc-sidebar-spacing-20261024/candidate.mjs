import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{spawnSync}from'node:child_process';
import{chromium}from'playwright-core';
import{W,EXPECTED,TAG,hash,patchHtml,patchWorker,css}from'./patch.mjs';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
assert(A&&T,'MISSING_CF_SECRETS');
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+A,DIR='deploy-assets/pc-sidebar-spacing-20261024/audit';
await mkdir(DIR,{recursive:true});
const out={at:new Date().toISOString(),ok:false,candidate:null,previewQa:[],assets:{}};
async function api(p,form){
 if(form!==undefined)assert.equal(p,'/workers/scripts/'+W+'/versions','CANDIDATE_UPLOAD_ONLY');
 const r=await fetch(ROOT+p,{method:form?'POST':'GET',headers:{authorization:'Bearer '+T},body:form,signal:AbortSignal.timeout(90000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+r.status+JSON.stringify(j.errors).slice(0,350));return j.result;
}
async function active(){
 const d=(await api('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];
 assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);
 return{version:d.versions[0].version_id,deployment:d.id};
}
async function read(host,p){
 const u=new URL(p,host);u.searchParams.set('sidebarQa',Date.now()+''+Math.random());
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(70000)}),b=Buffer.from(await r.arrayBuffer());
 return{status:r.status,hash:hash(b),body:b};
}
async function measure(page){
 return page.evaluate(()=>{
  const rail=document.querySelector('.workspace.singlepage>.left-rail'),brand=rail?.querySelector('.workspace-brand-card'),member=rail?.querySelector('[data-b46-member-independent="1"]'),status=rail?.querySelector('.b46-mobile-status-menu'),stats=rail?.querySelector('.workspace-stats-card'),
   sTitle=status?.querySelector('.rail-title'),tTitle=stats?.querySelector('.rail-title'),buttons=[...status?.querySelectorAll('[data-status-filter],button[data-workspace-view]')||[]];
  const mb=x=>x?Number.parseFloat(getComputedStyle(x).marginBottom):null;
  const y=x=>x?Math.round(x.getBoundingClientRect().y):null;
  return{tag:!!document.getElementById('b46-pc-sidebar-spacing-20261024'),
   railVisible:!!rail&&rail.getBoundingClientRect().width>0,
   mb:{brand:mb(brand),member:mb(member),status:mb(status),statusTitle:mb(sTitle),statsTitle:mb(tTitle)},
   y:{brand:y(brand),member:y(member),status:y(status),firstStatus:y(buttons[0]),finished:y(buttons.at(-1)),stats:y(stats),firstStat:y(stats?.querySelector('.filter'))},
   rowHeights:buttons.map(b=>Math.round(b.getBoundingClientRect().height)),
   labels:buttons.map(b=>b.textContent.replace(/[0-9,]/g,'').trim()).join('|'),
   mobilePageWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth,
   voteCards:document.querySelectorAll('[data-pv-version="8"]').length,
   voteImgs:[...document.querySelectorAll('[data-pv-version="8"] img')].map(i=>i.naturalWidth).slice(0,2)
  };
 });
}
try{
 const before=await active();assert.equal(before.version,EXPECTED,'NEWER_PRODUCTION_VERSION_ABORT');out.before=before;
 const old=await read('https://ball46.com','/');assert.equal(old.status,200);
 const expectedHtml=patchHtml(old.body.toString());
 out.baseHtmlSha=old.hash;out.expectedHtmlSha=hash(Buffer.from(expectedHtml));
 const v=await api('/workers/workers/'+W+'/versions/'+EXPECTED+'?include=modules'),settings=await api('/workers/scripts/'+W+'/settings');
 assert(v.main_module&&v.modules.length>=15&&v.assets,'VERSION_MODULE_SHAPE');
 const main=v.modules.find(x=>x.name===v.main_module);assert(main?.content_base64);
 const original=Buffer.from(main.content_base64,'base64').toString();
 const next=patchWorker(original,hash(Buffer.from(original)));
 out.oldMainSha=hash(Buffer.from(original));out.newMainSha=hash(Buffer.from(next));
 await writeFile(DIR+'/wrapped-main.mjs',next);
 const syntax=spawnSync('node',['--check',DIR+'/wrapped-main.mjs'],{encoding:'utf8'});
 assert.equal(syntax.status,0,'WRAPPER_SYNTAX_'+syntax.stderr?.slice(0,500));
 const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'BALL46_PC_SIDEBAR_SPACING_20261024','workers/message':'62px smaller PC-only sidebar group spacing; preserve latest Prediction V8 and mobile'}};
 for(const key of['usage_model','logpush','limits','observability','placement'])if(settings[key]!=null)metadata[key]=settings[key];
 const f=new FormData();f.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of v.modules)f.set(m.name,new Blob([m.name===v.main_module?next:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).version,EXPECTED,'PARALLEL_CHANGE_BEFORE_CANDIDATE');
 const candidate=await api('/workers/scripts/'+W+'/versions',f);out.candidate=candidate.id;
 out.preview='https://'+candidate.id.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 const vv=await api('/workers/workers/'+W+'/versions/'+candidate.id+'?include=modules');
 assert.equal(vv.annotations?.['workers/tag'],'BALL46_PC_SIDEBAR_SPACING_20261024');
 assert.equal(vv.modules.length,v.modules.length,'MODULE_COUNT_DRIFT');
 for(const m of v.modules){
  const check=vv.modules.find(z=>z.name===m.name);assert(check,'MODULE_MISSING_'+m.name);
  const expected=m.name===v.main_module?out.newMainSha:hash(Buffer.from(m.content_base64,'base64'));
  assert.equal(hash(Buffer.from(check.content_base64,'base64')),expected,'MODULE_CHANGED_'+m.name);
 }
 for(const key of['bindings','assets','compatibility_date','compatibility_flags'])
  assert.equal(JSON.stringify(vv[key]),JSON.stringify(v[key]),'CONFIG_CHANGED_'+key);
 const p=await read(out.preview,'/');assert.equal(p.status,200);
 assert.equal(p.hash,out.expectedHtmlSha,'PREVIEW_HTML_CONTENT_CHANGED_UNEXPECTEDLY');
 assert(p.body.includes(Buffer.from(TAG)));
 for(const path of['/live-prediction-343.js','/signal.html','/signal-next.js','/statistics.html','/dashboard-v2-stage3-featured-facts-20261013a.js','/prediction-v8/jersey-0-3d-v8.webp']){
  const [a,b]=await Promise.all([read('https://ball46.com',path),read(out.preview,path)]);
  assert.equal(a.status,b.status,'UNRELATED_HTTP_'+path);assert.equal(a.hash,b.hash,'UNRELATED_ASSET_'+path);
  out.assets[path]={status:a.status,hash:a.hash};
 }
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  for(const d of[{name:'pc-dark',width:1366,height:900,theme:'dark'},{name:'pc-light',width:1366,height:900,theme:'light'},{name:'mobile-dark',width:390,height:844,theme:'dark'}]){
   const page=await browser.newPage({viewport:{width:d.width,height:d.height}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const res=await page.goto(out.preview+'/?qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
   assert.equal(res.status(),200);await page.waitForTimeout(7000);
   await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),d.theme);
   const observed=await measure(page);
   const diag=await page.evaluate(()=>{
    const e=document.querySelector('.workspace.singlepage>.left-rail>.workspace-brand-card'),s=document.getElementById('b46-pc-sidebar-spacing-20261024');
    return {selectorMatch:!!document.querySelector('html body .workspace.singlepage > .left-rail > .rail-card.workspace-brand-card'),
      styleLen:s?.textContent.length,styleEnds:s?.textContent.slice(-180),media:matchMedia('(min-width:761px)').matches,
      brandInline:e?.getAttribute('style'),railAttrs:e?.parentElement?.outerHTML.slice(0,80),
      styleColor:getComputedStyle(e||document.body).color,
      overrideTest: (()=>{if(!e)return null;const initial=getComputedStyle(e).marginBottom;
        e.style.setProperty('margin-bottom','0px','important');const after=getComputedStyle(e).marginBottom;
        e.style.removeProperty('margin-bottom');return {initial,after};})()};
   });
   console.log('B46_SIDEBAR_DIAG='+JSON.stringify({name:d.name,diag}).slice(0,2200));
   console.log('B46_SIDEBAR_MEASUREMENT='+JSON.stringify({name:d.name,observed}).slice(0,4200));
   assert.equal(observed.tag,true,'STYLE_MISSING_'+d.name);
   assert.equal(errors.length,0,'JS_ERRORS_'+d.name+':'+errors.join(';'));
   assert.equal(observed.voteCards,1,'PREDICTION_V8_NOT_PRESERVED_'+d.name);
   if(d.width>=761){
    assert.deepEqual(observed.mb,{brand:0,member:0,status:0,statusTitle:4,statsTitle:2},'PC_SPACING_MISMATCH_'+d.name);
    assert(observed.rowHeights.every(h=>h===34),'NAV_ROW_HEIGHT_CHANGED');
    assert.equal(observed.y.member,110,'MEMBER_POSITION_WRONG');
    assert.equal(observed.y.status,154,'STATUS_POSITION_WRONG');
    assert.equal(observed.y.stats,402,'STATS_POSITION_WRONG');
   }else{
    const baseline=await browser.newPage({viewport:{width:d.width,height:d.height}});
    await baseline.goto('https://ball46.com/?mobileSpacingBaseline='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
    await baseline.waitForTimeout(5500);
    await baseline.evaluate(t=>document.documentElement.setAttribute('data-theme',t),d.theme);
    const untouched=await measure(baseline);
    assert.deepEqual(observed.mb,untouched.mb,'MOBILE_SPACING_CHANGED');
    assert.deepEqual(observed.y,untouched.y,'MOBILE_POSITIONS_CHANGED');
    assert.deepEqual(observed.rowHeights,untouched.rowHeights,'MOBILE_ROW_HEIGHT_CHANGED');
    await baseline.close();
   }
   out.previewQa.push({name:d.name,...observed,errors:0});await page.close();
  }
 }finally{await browser.close()}
 assert.equal((await active()).version,EXPECTED,'LIVE_VERSION_CHANGED_DURING_QA');
 out.ok=true;out.trafficChanged=false;
 console.log('B46_PC_SIDEBAR_CANDIDATE_PASS='+JSON.stringify({ok:true,before,candidate:out.candidate,preview:out.preview,htmlSha:out.expectedHtmlSha,modules:v.modules.length,qa:out.previewQa,assets:Object.keys(out.assets),trafficChanged:false}).slice(0,8500));
}catch(e){out.error=String(e.stack||e);console.error('B46_PC_SIDEBAR_CANDIDATE_FAIL='+String(e.message||e));process.exitCode=1}
await writeFile(DIR+'/candidate.json',JSON.stringify(out,null,2));
