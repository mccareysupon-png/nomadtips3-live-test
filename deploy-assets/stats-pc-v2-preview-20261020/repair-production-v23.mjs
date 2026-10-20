import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {patchedHtml,NEW_SCRIPT_ID,REPAIR_STYLE_ID} from './allthemes-fix.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,SCRIPT='ball46-production',ORIGIN='https://ball46.com';
assert(account&&token,'CLOUDFLARE_DEPLOY_ACCESS_MISSING');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+account;
const hash=b=>createHash('sha256').update(b).digest('hex');
mkdirSync('audit/repair',{recursive:true});
const report={created:new Date().toISOString(),gitSha:process.env.GITHUB_SHA,actions:[],target:'Statistics PC 14-card ribbon - actual light + dark mode repair'};
const save=()=>writeFileSync('audit/repair/report.json',JSON.stringify(report,null,2));
async function api(path,body){
 const r=await fetch(apiRoot+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},
 body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_REQUEST_ERROR '+path+' '+JSON.stringify(j.errors));return j.result;
}
async function active(){const x=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments?.[0];assert(x?.versions?.length===1&&Number(x.versions[0].percentage)===100);return{version:x.versions[0].version_id,deployment:x.id}}
async function version(id){return await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}
async function read(base,path){
 const u=new URL(path,base);u.searchParams.set('b46v23_allthemes',process.env.GITHUB_RUN_ID+'-'+Date.now());
 const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(40000)});
 const bytes=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:hash(bytes),body:bytes};
}
const paths=['/','/index.html','/longterm-performance-343.js','/singlepage-workspace-343.js','/dashboard-v2-tune.css','/expanded-match-343.js'];
async function assets(base){const x={};for(const path of paths){x[path]=await read(base,path);assert.equal(x[path].status,200,'HTTP_STATUS_FAILED '+base+' '+path)}return x}
function patchWorker(source){
 const anchor='export default {';
 assert.equal(source.split(anchor).length,2,'WORKER_ENTRY_POINT_DRIFT');
 assert(!source.includes('__b46StatsV23AllThemes20261020'),'REPAIR_ALREADY_IN_WORKER');
 const original=source.replace(anchor,'const __b46PreservedCurrentProductionWorker = {');
 const helper=[
  'async function __b46StatsV23AllThemes20261020(response,path){',
  'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
  'const raw=await response.text();',
  'const out=__b46ApplyV23AllThemesHtml20261020(raw);',
  'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","no-store");',
  'return new Response(out,{status:response.status,statusText:response.statusText,headers});',
  '}',
  'function __b46ApplyV23AllThemesHtml20261020(s){',
  'const oldTag='+JSON.stringify('<script id="b46-statistics-v23-single-row-14-20261020">')+';',
  'const newTag='+JSON.stringify('<script id="'+NEW_SCRIPT_ID+'">')+';',
  'const lightStyle='+JSON.stringify((()=>{
   const sample=patchedHtml('<html><head></head><body><script id="b46-statistics-v23-single-row-14-20261020">nothing</script></body></html>');
   return sample.slice(sample.indexOf('<style id="'+REPAIR_STYLE_ID+'">'),sample.indexOf('</style>',sample.indexOf('<style id="'+REPAIR_STYLE_ID+'">'))+8);
  })())+';',
  'const newScript='+JSON.stringify((()=>{
   const sample=patchedHtml('<html><head></head><body><script id="b46-statistics-v23-single-row-14-20261020">nothing</script></body></html>');
   return sample.slice(sample.indexOf('<script id="'+NEW_SCRIPT_ID+'">'),sample.indexOf('</script>',sample.indexOf('<script id="'+NEW_SCRIPT_ID+'">'))+9);
  })())+';',
  'if(!s.includes("</head>")||!s.includes(oldTag)||s.includes(newTag)||s.includes('+JSON.stringify(REPAIR_STYLE_ID)+'))throw new Error("STATS_RIBBON_REPAIR_BASELINE_MISSING");',
  'const start=s.indexOf(oldTag),end=s.indexOf("</script>",start+oldTag.length);',
  'if(end<0||s.indexOf(oldTag,start+oldTag.length)!==-1)throw new Error("STATS_RIBBON_NOT_UNIQUE");',
  'return (s.slice(0,start)+newScript+s.slice(end+9)).replace("</head>",lightStyle+"</head>");',
  '}'
 ].join('\n');
 return original+'\n'+helper+'\nexport default {...__b46PreservedCurrentProductionWorker,async fetch(request,env,ctx){const response=await __b46PreservedCurrentProductionWorker.fetch.call(__b46PreservedCurrentProductionWorker,request,env,ctx);return __b46StatsV23AllThemes20261020(response,new URL(request.url).pathname);}};';
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function browserCheck(base,tag){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'CHROME_NOT_INSTALLED');
 const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox']});
 const result=[];
 try{
  for(const width of [1024,1440,390]){
   for(const wanted of ['light','dark']){
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e).slice(0,240)));
    try{
     await page.setViewport({width,height:900,isMobile:width<768,deviceScaleFactor:1});
     await page.setCacheEnabled(false);
     await page.evaluateOnNewDocument(theme=>{
      try{localStorage.setItem('nomad343_dashboard_theme_v1',theme)}catch(e){}
     },wanted);
     await page.goto(base+'/?view=statistics&b46_theme_realuser='+Date.now(),{waitUntil:'domcontentloaded',timeout:85000});
     await page.waitForFunction(()=>document.querySelector('.sp-stats-content')&&document.querySelectorAll('.sp-kpis .sp-kpi').length===8&&document.querySelectorAll('.b46-perf-kpis .b46-perf-kpi').length===6,{timeout:45000,polling:450});
     await sleep(2200);
     // The app has its own theme controls; set HTML data-theme through the same
     // root attribute after testing persistence, then observe live sync.
     await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),wanted);
     await sleep(1650);
     const state=await page.evaluate(()=>{
      const stat=document.querySelector('.sp-stats-content'),ribbon=stat?.querySelector('.b46v23-strip'),cards=[...stat?.querySelectorAll('.b46v23-micro-card')||[]],src=[...stat?.querySelectorAll('.sp-kpis .sp-kpi,.b46-perf-kpis .b46-perf-kpi')||[]];
      const style=e=>e?{display:getComputedStyle(e).display,w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)}:null;
      const cardData=cards.map(e=>[e.querySelector('.b46v23-label')?.textContent,e.querySelector('.b46v23-value')?.textContent,e.querySelector('.b46v23-meta')?.textContent]);
      const sourceData=src.map((e,i)=>[e.querySelector('span')?.textContent.trim(),e.querySelector(i<8?'strong':'b')?.textContent.trim(),e.querySelector('small')?.textContent.trim()]);
      const tops=cards.map(e=>e.getBoundingClientRect().top);
      const chart=document.querySelector('.b46-perf-chart-wrap svg,.b46-perf-chart-wrap canvas');
      return {theme:document.documentElement.dataset.theme,script:!!window.__b46StatisticsV23SingleRowInstalled,lightStyle:!!document.getElementById('b46-statistics-v23-light-ribbon-repair-20261020'),
       newScript:!!document.getElementById('b46-statistics-v23-allthemes-repaired-20261020'),ready:stat?.classList.contains('b46v23-ready'),count:cards.length,
       srcCount:src.length,exactLiveData:JSON.stringify(cardData)===JSON.stringify(sourceData),rowSpread:tops.length?Math.max(...tops)-Math.min(...tops):null,
       oldTop:style(stat?.querySelector('.sp-kpis')),oldPerf:style(stat?.querySelector('.b46-perf-kpis')),ribbon:style(ribbon),
       chart:!!chart,documentOverflow:document.documentElement.scrollWidth-innerWidth};
     });
     console.log('V23_REAL_USER_THEME_CHECK',JSON.stringify({base,width,wanted,state,errors}));
     assert.equal(errors.length,0,'BROWSER_RUNTIME_ERRORS '+errors.join(';'));
     assert(state.newScript&&state.lightStyle,'LIVE_REPAIR_ASSETS_NOT_PRESENT');
     assert.equal(state.srcCount,14,'SOURCE_DATA_CHANGED');
     if(width>=1024){
      assert(state.ready&&state.count===14&&state.exactLiveData,'FOURTEEN_REAL_STATS_NOT_VISIBLE '+width+' '+wanted);
      assert(state.rowSpread<=2,'SINGLE_ROW_BROKEN '+width+' '+wanted);
      assert(state.ribbon?.display==='block'&&state.ribbon.h>=40,'RIBBON_NOT_VISIBLE '+width+' '+wanted);
      assert(state.oldTop?.display==='none'&&state.oldPerf?.display==='none','OLD_STATS_CARDS_STILL_VISIBLE '+width+' '+wanted);
     }else{
      assert(!state.ready&&state.count===0,'MOBILE_STATISTICS_WERE_MODIFIED');
      assert(state.oldTop?.display!=='none','MOBILE_TOP_CARDS_MISSING');
     }
     assert(state.chart,'STATISTICS_CHART_MISSING');
     await page.screenshot({path:'audit/repair/'+tag+'-'+width+'-'+wanted+'.png',fullPage:false});
     result.push({width,wanted,state});
    }finally{await page.close()}
   }
  }
 }finally{await browser.close()}
 return result;
}
let candidate=null,activated=false;
try{
 report.before=await active();
 assert.equal(report.before.version,'15254188-e574-4cff-975e-c9972564ea18','PRODUCTION_VERSION_CHANGED_FROM_VERIFIED_SOURCE');
 const cur=await version(report.before.version),modules=cur.modules;
 const main=modules.find(m=>m.name===cur.main_module);assert(main,'MAIN_MODULE_MISSING');
 const oldJs=Buffer.from(main.content_base64,'base64').toString('utf8'),updatedJs=patchWorker(oldJs);
 report.moduleHashesBefore=modules.map(m=>({name:m.name,sha:hash(Buffer.from(m.content_base64,'base64'))}));
 const beforeAssets=await assets(ORIGIN),beforeHtml=beforeAssets['/'].body.toString();
 assert(beforeHtml.includes('b46-statistics-v23-single-row-14-20261020'),'LIVE_OLD_14_RIBBON_MISSING');
 assert(!beforeHtml.includes(REPAIR_STYLE_ID),'REPAIR_ALREADY_PUBLIC');
 const expected=patchedHtml(beforeHtml);report.expectedHtmlHash=hash(expected);
 const prodDomains=(await api('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(prodDomains,['ball46.com','www.ball46.com'],'UNKNOWN_PRODUCTION_DOMAINS');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:cur.main_module,compatibility_date:cur.compatibility_date,compatibility_flags:cur.compatibility_flags||[],bindings:cur.bindings,keep_assets:true,assets:{config:cur.assets.config},annotations:{'workers/tag':'B46_STATS_V23_ALLTHEMES_REALUSER_FIX_20261020','workers/message':'Repair 14-statistics single-row on both PC themes, preserve mobile data and all other features'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 assert.deepEqual(await active(),report.before,'PRODUCTION_CHANGED_BEFORE_UPLOAD');
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of modules)form.set(m.name,new Blob([m.name===cur.main_module?updatedJs:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);candidate=uploaded.id;report.candidate=candidate;report.actions.push('INACTIVE_VERSION_UPLOADED');save();
 const candidateVersion=await version(candidate);
 for(const m of modules.filter(x=>x.name!==cur.main_module)){
  const newM=candidateVersion.modules.find(n=>n.name===m.name);
  assert(newM,'WORKER_MODULE_LOST '+m.name);
  assert.equal(hash(Buffer.from(newM.content_base64,'base64')),hash(Buffer.from(m.content_base64,'base64')),'UNRELATED_MODULE_CHANGED '+m.name);
 }
 const sub=await api('/workers/subdomain');const domain=sub.subdomain||'mccarey-supon';
 const preview='https://'+candidate.slice(0,8)+'-'+SCRIPT+'.'+domain+'.workers.dev';
 const cand=await read(preview,'/');assert.equal(cand.sha,report.expectedHtmlHash,'INACTIVE_CANDIDATE_HTML_WRONG');
 report.previewQA=await browserCheck(preview,'candidate');
 assert.deepEqual(await active(),report.before,'PRODUCTION_CHANGED_DURING_QA');
 const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'Fix real-user 14 cards across Dark and Light Statistics PC; preserve all other Worker assets'}});
 activated=true;report.actions.push({productionVersion:candidate,deployment:d.id});save();
 assert.equal((await active()).version,candidate,'ACTIVE_NEW_WORKER_MISSING');
 // Wait for live edge propagation, not one immediate read.
 for(const host of [ORIGIN,'https://www.ball46.com']){
  let matched=false;
  for(let i=0;i<24;i++){
   const x=await read(host,'/'),y=await read(host,'/index.html');
   if(x.sha===report.expectedHtmlHash&&y.sha===report.expectedHtmlHash){matched=true;break}
   assert.equal((await active()).version,candidate,'OTHER_WORKER_DEPLOYED_WHILE_WAITING');
   await sleep(3300);
  }
  assert(matched,'LIVE_HTML_NOT_PROPAGATED '+host);
 }
 const afterAssets=await assets(ORIGIN);
 for(const p of paths){assert.equal(afterAssets[p].sha,['/','/index.html'].includes(p)?report.expectedHtmlHash:beforeAssets[p].sha,'ASSET_DIFF_NOT_SCOPED '+p)}
 report.liveQA=await browserCheck(ORIGIN,'production');
 report.after=await active();assert.equal(report.after.version,candidate,'PRODUCTION_VERSION_CHANGED_AFTER_QA');
 report.success=true;save();console.log('BALL46_STATS_V23_REALUSER_ALLTHEMES_DEPLOY_SUCCESS',JSON.stringify({version:candidate,rollback:report.before.version,qa:'14 real cards PC light dark, mobile preserved'}));
}catch(e){
 report.error=e.stack||String(e);
 if(activated&&candidate){
  try{
   if((await active()).version===candidate){
    await api('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:report.before.version,percentage:100}],annotations:{'workers/message':'Auto rollback if Statistics light/dark 14-card verification fails'}});
    report.rollbackTo=report.before.version;report.rolledBack=(await active()).version===report.before.version;
   }
  }catch(z){report.rollbackError=String(z)}
 }
 save();console.error('BALL46_STATS_V23_REALUSER_ALLTHEMES_DEPLOY_STOP',report.error);process.exitCode=1;
}
