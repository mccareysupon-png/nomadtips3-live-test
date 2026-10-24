import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{spawnSync}from'node:child_process';
import{chromium}from'playwright-core';
import{W,TAG,hash,patchHtml,patchWorker}from'./patch.mjs';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+A,DIR='deploy-assets/search-caret-20261024/audit';
await mkdir(DIR,{recursive:true});
const out={at:new Date().toISOString(),ok:false,previewQa:[],assets:{}};
async function api(p,form){
 if(form!==undefined)assert.equal(p,'/workers/scripts/'+W+'/versions','CANDIDATE_UPLOAD_ONLY');
 const r=await fetch(ROOT+p,{method:form?'POST':'GET',headers:{authorization:'Bearer '+T},body:form,signal:AbortSignal.timeout(90000)}),j=await r.json();
 if(!r.ok||!j.success)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors).slice(0,230));return j.result;
}
async function live(){const d=(await api('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return{version:d.versions[0].version_id,deployment:d.id};}
async function get(host,p){const u=new URL(p,host);u.searchParams.set('b46searchIconPreview',Date.now()+''+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(55000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,hash:hash(b),body:b,headers:r.headers};}
try{
 const before=await live();out.before=before;
 const v=await api('/workers/workers/'+W+'/versions/'+before.version+'?include=modules'),settings=await api('/workers/scripts/'+W+'/settings');
 assert(v.main_module&&v.modules.length>=1&&v.assets);
 const main=v.modules.find(x=>x.name===v.main_module),source=Buffer.from(main.content_base64,'base64').toString();assert(source);
 const old=await get('https://ball46.com','/');
 assert.equal(old.status,200);out.originalHtmlSha=old.hash;
 const next=patchHtml(old.body.toString());
 const code=patchWorker(source,hash(Buffer.from(source)));
 out.newHtmlSha=hash(Buffer.from(next));out.oldMainSha=hash(Buffer.from(source));out.newMainSha=hash(Buffer.from(code));
 await writeFile(DIR+'/wrapped-main.mjs',code);
 const syntax=spawnSync('node',['--check',DIR+'/wrapped-main.mjs'],{encoding:'utf8'});
 assert.equal(syntax.status,0,'INVALID_WRAPPER_'+syntax.stderr?.slice(0,230));
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'BALL46_SEARCH_CARET_GREEN_20261024','workers/message':'UI only: change blinking caret to green, preserve dual-mode search surface and all other assets'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?code:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await live()).version,before.version,'PARALLEL_DEPLOY_BEFORE_CANDIDATE');
 const candidate=(await api('/workers/scripts/'+W+'/versions',form)).id;out.candidate=candidate;
 out.preview='https://'+candidate.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 const vv=await api('/workers/workers/'+W+'/versions/'+candidate+'?include=modules');
 assert.equal(vv.modules.length,v.modules.length);assert.equal(vv.annotations?.['workers/tag'],'BALL46_SEARCH_CARET_GREEN_20261024');
 for(const m of v.modules)assert.equal(hash(Buffer.from(vv.modules.find(z=>z.name===m.name).content_base64,'base64')),m.name===v.main_module?out.newMainSha:hash(Buffer.from(m.content_base64,'base64')),'MODULE_CHANGED_'+m.name);
 for(const key of['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(JSON.stringify(vv[key]),JSON.stringify(v[key]),'CONFIG_DRIFT_'+key);
 const preview=await get(out.preview,'/');assert.equal(preview.status,200);assert.equal(preview.hash,out.newHtmlSha);assert(preview.body.includes(Buffer.from(TAG)));
 for(const p of ['/dashboard-v2-stage3-featured-facts-20261013a.js','/signal.html','/signal-next.js','/statistics.html','/favicon.ico']){
   const [a,b]=await Promise.all([get('https://ball46.com',p),get(out.preview,p)]);
   assert.equal(a.status,b.status,'UNRELATED_HTTP_'+p);assert.equal(a.hash,b.hash,'UNRELATED_CONTENT_'+p);
   out.assets[p]={status:a.status,hash:a.hash};
 }
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  for(const dimension of[{name:'desktop',width:1366,height:768},{name:'mobile',width:390,height:844}]){
   const page=await browser.newPage({viewport:{width:dimension.width,height:dimension.height}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const resp=await page.goto(out.preview+'/?testSearchIcon='+Date.now(),{waitUntil:'domcontentloaded',timeout:65000});assert.equal(resp.status(),200);
   await page.waitForTimeout(5000);
   const o=await page.evaluate(()=>{
    const wrap=document.querySelector('.status-head .b46-live-search'),input=wrap?.querySelector('input'),svg=wrap?.querySelector('svg');
    if(!wrap)return{found:false,styleTag:!!document.getElementById('b46-search-icon-only-20261024')};
    const style=getComputedStyle(wrap),placeholder=input?getComputedStyle(input,'::placeholder'):null;
    return{found:true,styleTag:!!document.getElementById('b46-search-icon-only-20261024'),border:style.borderTopWidth,boxShadow:style.boxShadow,background:style.backgroundColor,placeholderOpacity:placeholder?.opacity,placeholderColor:placeholder?.color,svg:!!svg,placeholder:input?.placeholder||'',display:style.display};
   });
   const themeColors=await page.evaluate(()=>{
   const root=document.documentElement,prior=root.getAttribute('data-theme'),wrap=document.querySelector('.status-head .b46-live-search');
   root.setAttribute('data-theme','dark');const dark=getComputedStyle(wrap).backgroundColor;
   root.setAttribute('data-theme','light');const light=getComputedStyle(wrap).backgroundColor;
   if(prior===null)root.removeAttribute('data-theme');else root.setAttribute('data-theme',prior);
   return{dark,light};
  });
   assert.equal(themeColors.dark,'rgb(18, 46, 37)','DARK_SURFACE_WRONG_'+dimension.name);
   assert.equal(themeColors.light,'rgb(212, 225, 216)','LIGHT_SURFACE_WRONG_'+dimension.name);
   assert.equal(o.styleTag,true,'STYLE_TAG_ABSENT_'+dimension.name);
   assert(await page.evaluate(()=>!!document.getElementById('b46-search-surface-dualmode-20261024')),'ORIGINAL_DUALMODE_STYLE_MISSING');
   const caretByTheme=await page.evaluate(()=>{
     const root=document.documentElement,prior=root.getAttribute('data-theme');
     const input=document.querySelector('.status-head .b46-live-search input');
     root.setAttribute('data-theme','dark');const dark=getComputedStyle(input).caretColor;
     root.setAttribute('data-theme','light');const light=getComputedStyle(input).caretColor;
     if(prior===null)root.removeAttribute('data-theme');else root.setAttribute('data-theme',prior);
     return{dark,light};
   });
   assert.equal(caretByTheme.dark,'rgb(0, 230, 118)','DARK_CARET_NOT_GREEN_'+dimension.name);
   assert.equal(caretByTheme.light,'rgb(0, 230, 118)','LIGHT_CARET_NOT_GREEN_'+dimension.name);
   assert(await page.evaluate(()=>!!document.getElementById('b46-search-caret-green-20261024')),'NEW_CARET_STYLE_MISSING');
   if(o.found){assert.equal(o.border,'0px');assert.equal(o.boxShadow,'none');assert.equal(o.placeholderOpacity,'0');assert(o.svg);
    const field=page.locator('.status-head .b46-live-search input');
    if(await field.isVisible()){await field.fill('Arsenal',{timeout:5000});assert.equal(await field.inputValue(),'Arsenal','SEARCH_DISABLED');}else{assert.equal(dimension.name,'mobile','DESKTOP_SEARCH_NOT_VISIBLE');}
   }
   assert.equal(errors.length,0,'PAGE_JS_ERROR_'+dimension.name+':'+errors.join(' | '));
   out.previewQa.push({name:dimension.name,...o,themeColors,caretByTheme,jsErrors:errors.length});
   await page.close();
  }
 }finally{await browser.close()}
 assert(out.previewQa.some(x=>x.name==='desktop'&&x.found),'DESKTOP_SEARCH_NOT_TESTED');
 assert.equal((await live()).version,before.version,'CANDIDATE_CHANGED_PRODUCTION');
 out.ok=true;out.trafficChanged=false;
 console.log('B46_SEARCH_CANDIDATE_OK='+JSON.stringify({ok:true,before,outVersion:candidate,preview:out.preview,newHtmlSha:out.newHtmlSha,previewQa:out.previewQa,unrelatedAssets:Object.keys(out.assets),trafficChanged:false}).slice(0,6400));
}catch(e){out.error=String(e.stack||e);console.error('B46_SEARCH_CANDIDATE_FAIL='+String(e.message||e));process.exitCode=1}
await writeFile(DIR+'/candidate.json',JSON.stringify(out,null,2));
