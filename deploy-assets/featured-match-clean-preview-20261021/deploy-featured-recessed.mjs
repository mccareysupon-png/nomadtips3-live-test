import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {FEATURED_PRODUCTION_SCRIPT,FEATURED_PRODUCTION_CSS,FEATURED_PROD_MARKER} from './production-payload.mjs';
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,SCRIPT='ball46-production',ORIGIN='https://ball46.com';
assert(acct&&token,'CLOUDFLARE_ACCOUNT_TOKEN_REQUIRED');
const apiRoot='https://api.cloudflare.com/client/v4/accounts/'+acct;
const hash=data=>createHash('sha256').update(data).digest('hex');
mkdirSync('audit',{recursive:true});
const css=FEATURED_PRODUCTION_CSS;
const styleTag='<style id="'+FEATURED_PROD_MARKER+'-style">'+css+'</style>';
const scriptTag='<script id="'+FEATURED_PROD_MARKER+'-script">'+FEATURED_PRODUCTION_SCRIPT+'</script>';
const report={task:'BALL46 Featured Match recessed facts PC/mobile - user-approved guarded PRODUCTION release',sha:process.env.GITHUB_SHA,created:new Date().toISOString(),noProductionActivation:false,actions:[]};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function api(path,body){
 const r=await fetch(apiRoot+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},
  body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(70000)});
 const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_API_FAILURE '+path+': '+JSON.stringify(j.errors));return j.result;
}
async function active(){const d=(await api('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&Number(d.versions[0].percentage)===100,'WORKER_NOT_FULLY_ACTIVE');return{version:d.versions[0].version_id,deployment:d.id}}
async function version(id){const x=await api('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');assert(x.main_module&&Array.isArray(x.modules),'VERSION_MODULES_NOT_AVAILABLE');return x}
async function read(origin,path){
 let last;
 for(let i=0;i<4;i++){
  try{
   const u=new URL(path,origin);u.searchParams.set('featured_clean_preview_20261021',Date.now()+'-'+i+'-'+process.env.GITHUB_RUN_ID);
   const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(40000)});
   const b=Buffer.from(await r.arrayBuffer());return {status:r.status,body:b,sha:hash(b)};
  }catch(e){last=e;if(i<3)await new Promise(r=>setTimeout(r,1800*(i+1)))}
 }
 throw Error('PUBLIC_FILE_FETCH_FAILED '+origin+path+' '+String(last));
}
const files=['/','/index.html','/dashboard-v2-stage3-featured-facts-20261013a.js','/featured-facts-premium-20261013a.css','/singlepage-workspace-343.css','/singlepage-workspace-343.js'];
async function assets(host){const out={};for(const p of files){out[p]=await read(host,p);assert.equal(out[p].status,200,'ASSET_NOT_OK '+p)}return out}
function patchHtml(input){
 assert(input.includes('</head>')&&input.includes('</body>')&&input.includes('featured-card'),'LIVE_FEATURED_CARD_HTML_MISSING');
 assert(!input.includes(FEATURED_PROD_MARKER),'PREVIEW_ALREADY_PRESENT');
 return input.replace('</head>',styleTag+'</head>').replace('</body>',scriptTag+'</body>');
}
const helper=[
'async function __b46FeaturedRecessedProduction20261021(response,path){',
'if(!["/","/index.html"].includes(path)||!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;',
'const raw=await response.text();',
'if(!raw.includes("</head>")||!raw.includes("featured-card")||raw.includes('+JSON.stringify(FEATURED_PROD_MARKER)+'))throw Error("FEATURED_PREVIEW_BASELINE_UNEXPECTED");',
'const patched=raw.replace("</head>",'+JSON.stringify(styleTag)+'+"</head>").replace("</body>",'+JSON.stringify(scriptTag)+'+"</body>");',
'const headers=new Headers(response.headers);headers.delete("etag");headers.delete("content-length");headers.set("Cache-Control","no-store");',
'return new Response(patched,{status:response.status,statusText:response.statusText,headers});',
'}'
].join('\n');
function patchWorker(source){
 const anchor='export default {';
 assert.equal(source.split(anchor).length,2,'WORKER_EXPORT_DRIFT');
 assert(!source.includes('__b46FeaturedRecessedProduction20261021'),'FEATURED_PREVIEW_ALREADY_PATCHED');
 const original=source.replace(anchor,'const __b46CurrentWorkerFeatured20261021 = {');
 return original+'\n'+helper+'\nexport default {...__b46CurrentWorkerFeatured20261021,async fetch(request,env,ctx){const response=await __b46CurrentWorkerFeatured20261021.fetch.call(__b46CurrentWorkerFeatured20261021,request,env,ctx);return __b46FeaturedRecessedProduction20261021(response,new URL(request.url).pathname);}};\n';
}
async function qa(host,mode){
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(chrome,'CHROME_MISSING');
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 const result=[];
 try{
  for(const [width,theme] of [[390,'dark'],[390,'light'],[1440,'dark'],[1440,'light']]){
   const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e).slice(0,280)));
   try{
    await p.setViewport({width,height:960,deviceScaleFactor:1,isMobile:width<768});await p.setCacheEnabled(false);
    await p.goto(host+'/?featured_recessed_prod='+width+'-'+theme+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await p.waitForFunction(()=>document.querySelector('.featured-card[data-featured]')&&window.__b46FeaturedCleanPreviewV1,{timeout:50000,polling:400});
    await new Promise(r=>setTimeout(r,2400));
    const natural=await p.evaluate(()=>{
     const src=document.querySelector('.featured-card[data-featured]');
     const home=src.querySelector('[data-featured-home]')?.textContent.trim();
     const away=src.querySelector('[data-featured-away]')?.textContent.trim();
     const score=src.querySelector('[data-featured-score]')?.textContent.trim();
     const missing=!home||home==='—'||!away||away==='—'||!score||score==='—';
     const target=innerWidth<768?document.querySelector('.b46fm-preview-mobile .b46fm'):document.querySelector('.b46fm-preview-pc .b46fm');
     return{missing,home,away,score,targetShown:!!target,sourceHidden:getComputedStyle(src).display==='none'};
    });
    if(natural.missing){
     assert(!natural.targetShown&&!natural.sourceHidden,'FABRICATED_MATCH_VISIBLE_WHEN_NO_LIVE_FIXTURE');
     // Browser-local QA fixture only. Never inserted into Cloudflare HTML or live user sessions.
     await p.evaluate(()=>{
      const root=document.querySelector('.featured-card[data-featured]');
      const put=(key,v)=>{const e=root.querySelector(key);if(e)e.textContent=v};
      put('[data-featured-home]','Londrina');
      put('[data-featured-away]','Cuiaba');
      put('[data-featured-score]','1–0');
      put('[data-featured-status]',"84'");
      const league=root.querySelector('[data-featured-league] .league-label')||root.querySelector('[data-featured-league]');
      if(league)league.textContent='Brazil Serie B';
      const facts=root.querySelector('.feature-facts');
      if(facts){
       facts.replaceChildren();
       for(const [label,value] of [['HALF-TIME','HT 1–0'],['CORNERS','3–4'],['CARDS H · A','2 Yellow / 0 Red · 2 Yellow / 1 Red'],['ODDS AGE','8s']]){
        const e=document.createElement('div'),sp=document.createElement('span'),b=document.createElement('b');
        sp.textContent=label;b.textContent=value;e.append(sp,b);facts.append(e);
       }
      }
      const stats=root.querySelector('.feature-stats');if(stats){
       stats.replaceChildren();
       for(const [h,name,a] of [['2','Shots on target','7'],['3','Corners','4']]){
        const row=document.createElement('div');row.className='stat-row';
        const hb=document.createElement('b');hb.textContent=h;const ab=document.createElement('b');ab.textContent=a;
        const home=document.createElement('div');home.className='stat-track home';home.innerHTML='<i style="width:45%"></i>';
        const away=document.createElement('div');away.className='stat-track away';away.innerHTML='<i style="width:62%"></i>';
        const sp=document.createElement('span');sp.textContent=name;row.append(hb,home,sp,away,ab);stats.append(row);
       }
      }
      const events=root.querySelector('.feature-events');
      if(events){
       events.replaceChildren();
       for(const [minute,txt] of [["84'","corner · away"],["79'","corner · away"],["74'","substitution · home"],["72'","corner · away"]]){
        const row=document.createElement('div');row.className='event-item';
        const time=document.createElement('time'),span=document.createElement('span');
        time.textContent=minute;span.textContent=txt;row.append(time,span);events.append(row);
       }
      }
     });
    }
    await p.waitForFunction(()=>{
     const x=innerWidth<768?document.querySelector('.b46fm-preview-mobile .b46fm'):document.querySelector('.b46fm-preview-pc .b46fm');
     return !!x&&x.querySelectorAll('.fm-fact').length===4;
    },{timeout:17000,polling:300});
    await new Promise(r=>setTimeout(r,650));
    const data=await p.evaluate(()=>{
     const src=document.querySelector('.featured-card[data-featured]');
     const target=innerWidth<768?document.querySelector('.b46fm-preview-mobile .b46fm'):document.querySelector('.b46fm-preview-pc .b46fm');
     const facts=[...target.querySelectorAll('.fm-fact')];
     const cardRect=target.getBoundingClientRect();
     return {theme:document.documentElement.dataset.theme,width:innerWidth,docWidth:document.documentElement.scrollWidth,
      home:[src.querySelector('[data-featured-home]')?.textContent.trim(),target.querySelector('.fm-team.home strong')?.textContent.trim()],
      away:[src.querySelector('[data-featured-away]')?.textContent.trim(),target.querySelector('.fm-team.away strong')?.textContent.trim()],
      score:[src.querySelector('[data-featured-score]')?.textContent.trim(),target.querySelector('.fm-score-number')?.textContent.trim()],
      facts:facts.map(e=>({label:e.querySelector('span')?.textContent.trim(),value:e.querySelector('b')?.textContent.trim(),
        shadow:getComputedStyle(e).boxShadow,border:getComputedStyle(e).borderTopWidth,
        background:getComputedStyle(e).backgroundImage,overflow:e.scrollWidth>e.clientWidth+3})),
      sourceFacts:[...src.querySelectorAll('.feature-facts > div')].map(e=>({label:e.querySelector('span')?.textContent.trim(),value:e.querySelector('b')?.textContent.trim()})),
      rows:[src.querySelectorAll('.feature-stats .stat-row').length,target.querySelectorAll('.fm-stat').length],
      events:[src.querySelectorAll('.feature-events .event-item').length,target.querySelectorAll('.fm-event').length],
      renderedSignals:target.querySelectorAll('.fm-sample-signal').length,
      sourceHidden:getComputedStyle(src).display==='none',size:{w:cardRect.width,h:cardRect.height},
      mobileVisible:!!document.querySelector('.b46fm-preview-mobile .b46fm')?.getBoundingClientRect().width,
      pcVisible:!!document.querySelector('.b46fm-preview-pc .b46fm')?.getBoundingClientRect().width
     };
    });
    assert.equal(data.home[0],data.home[1],'LIVE_SOURCE_HOME_CHANGED');
    assert.equal(data.away[0],data.away[1],'LIVE_SOURCE_AWAY_CHANGED');
    assert.equal(data.score[0],data.score[1],'LIVE_SOURCE_SCORE_CHANGED');
    assert.equal(data.facts.length,4,'FOUR_FACT_WELLS_NOT_FOUND');
    assert.deepEqual(data.facts.map(x=>({label:x.label,value:x.value})),data.sourceFacts,'FACT_VALUES_NOT_FROM_SOURCE');
    assert(data.facts.every(x=>x.shadow.includes('inset')&&x.border==='0px'&&x.background.includes('linear-gradient')&&!x.overflow),'FACTS_ARE_NOT_RECESSED '+JSON.stringify(data.facts));
    assert.equal(data.rows[0],data.rows[1],'COMPARISON_ROWS_DIFFER_FROM_SOURCE');
    assert.equal(data.events[1],Math.min(3,data.events[0]),'EVENTS_NOT_READ_FROM_SOURCE');
    assert.equal(data.renderedSignals,0,'MOCK_SIGNALS_MUST_NEVER_APPEAR');
    assert(data.sourceHidden,'DUPLICATE_OLD_FEATURED_CARD_VISIBLE');
    assert(data.docWidth<=width+4,'HORIZONTAL_OVERFLOW '+width);
    assert(data.size.w>=(width<768?280:230),'FEATURED_CARD_UNEXPECTED_SIZE');
    assert((width<768?data.mobileVisible:data.pcVisible),'FEATURED_REDESIGN_NOT_VISIBLE');
    assert.deepEqual(errors,[],'RUNTIME_ERRORS');
    await p.screenshot({path:'audit/'+mode+'-featured-'+width+'-'+theme+(natural.missing?'-qa-fixture':'-live')+'.png',fullPage:false});
    result.push({width,theme,sourceWasLive:!natural.missing,...data});
    console.log('FEATURED_RECESSED_BROWSER_PASS',JSON.stringify({mode,width,theme,sourceWasLive:!natural.missing,card:data.size,facts:data.facts.map(x=>({label:x.label,value:x.value,shadow:x.shadow}))}));
   }finally{await p.close()}
  }
 }finally{await browser.close()}
 return result;
}

let activated=false;
try{
 report.before=await active();
 console.log('FEATURED_RECESSED_ACTIVE_BEFORE',JSON.stringify(report.before));
 const v=await version(report.before.version),main=v.modules.find(x=>x.name===v.main_module);
 assert(main,'PRODUCTION_MAIN_MODULE_NOT_FOUND');
 const currentSource=Buffer.from(main.content_base64,'base64').toString('utf8');
 const modifiedSource=patchWorker(currentSource);
 const hashes=v.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))}));
 const original=await assets(ORIGIN);
 report.productionAssetHashesBefore=Object.fromEntries(Object.entries(original).map(([k,d])=>[k,d.sha]));
 const expected=hash(patchHtml(original['/'].body.toString()));
 report.expectedHtmlHash=expected;
 const domains=(await api('/workers/domains')).filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'PRODUCTION_DOMAINS_CHANGED');
 const settings=await api('/workers/scripts/'+SCRIPT+'/settings');
 const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'B46_FEATURED_MATCH_RECESSED_PRODUCTION_20261021','workers/message':'Approved Featured Match clean PC/mobile, four inset deep teal fact wells; preserve all other production assets'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(settings[k]!=null)metadata[k]=settings[k];
 assert.deepEqual(await active(),report.before,'ACTIVE_WORKER_CHANGED_BEFORE_UPLOAD');
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
 for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?modifiedSource:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 const uploaded=await api('/workers/scripts/'+SCRIPT+'/versions',form);
 report.candidate=uploaded.id;report.actions.push('UPLOAD_INACTIVE_CANDIDATE');save();
 const cand=await version(uploaded.id);
 for(const m of cand.modules){
  const old=hashes.find(x=>x.name===m.name);assert(old,'UNEXPECTED_WORKER_MODULE '+m.name);
  assert.equal(hash(Buffer.from(m.content_base64,'base64')),m.name===v.main_module?hash(modifiedSource):old.sha,'UNRELATED_MODULE_CHANGED '+m.name);
 }
 const sub=(await api('/workers/subdomain')).subdomain||'mccarey-supon';
 const preview='https://'+uploaded.id.slice(0,8)+'-'+SCRIPT+'.'+sub+'.workers.dev';
 report.candidateUrl=preview+'/?featured_recessed_candidate=1';save();
 const previewHtml=await read(preview,'/');
 assert.equal(previewHtml.sha,expected,'CANDIDATE_HTML_NOT_EXACT');
 for(const p of files.filter(x=>x!=='/'&&x!=='/index.html')){
  const doc=await read(preview,p);assert.equal(doc.sha,original[p].sha,'UNRELATED_CANDIDATE_ASSET_CHANGED '+p);
 }
 report.candidateQA=await qa(preview,'candidate');
 assert.deepEqual(await active(),report.before,'PRODUCTION_CHANGED_DURING_CANDIDATE_QA');
 const d=await api('/workers/scripts/'+SCRIPT+'/deployments',{
  strategy:'percentage',versions:[{version_id:uploaded.id,percentage:100}],
  annotations:{'workers/message':'Owner approved Featured Match recessed facts PC/mobile; verified in browser on candidate'}
 });
 activated=true;report.actions.push({type:'PROMOTED_TESTED_CANDIDATE',id:uploaded.id,deployment:d.id||null});save();
 // Cloudflare active deployment status can lag after the promotion API reply.
 let reached=false;
 for(let i=0;i<26;i++){
  const now=await active();
  if(now.version===uploaded.id){reached=true;break}
  assert.equal(now.version,report.before.version,'UNEXPECTED_DIFFERENT_ACTIVE_WORKER');
  await new Promise(r=>setTimeout(r,2500));
 }
 assert(reached,'PROMOTED_WORKER_NOT_ACTIVE_AFTER_WAIT');
 for(const domain of [ORIGIN,'https://www.ball46.com']){
  let confirmed=false;
  for(let i=0;i<22;i++){
   const [a,b]=await Promise.all([read(domain,'/'),read(domain,'/index.html')]);
   if(a.sha===expected&&b.sha===expected){confirmed=true;break}
   assert.equal((await active()).version,uploaded.id,'ACTIVE_CHANGED_DURING_PROPAGATION');
   await new Promise(r=>setTimeout(r,3600));
  }
  assert(confirmed,'PRODUCTION_HTML_NOT_PROPAGATED '+domain);
 }
 const after=await assets(ORIGIN);
 for(const p of files)assert.equal(after[p].sha,p==='/'||p==='/index.html'?expected:original[p].sha,'UNRELATED_PRODUCTION_ASSET_CHANGED '+p);
 report.productionQA=await qa(ORIGIN,'production');
 report.activeAfter=await active();assert.equal(report.activeAfter.version,uploaded.id,'ACTIVE_WORKER_CHANGED_AFTER_QA');
 report.finished=new Date().toISOString();report.success=true;save();
 console.log('BALL46_FEATURED_RECESSED_PRODUCTION_SUCCESS',JSON.stringify({productionVersion:uploaded.id,previousVersion:report.before.version,site:ORIGIN,qa:'both PC and mobile Dark/Light; no fake match; recessed 4 facts'}));
}catch(e){
 report.error=e.stack||String(e);report.finished=new Date().toISOString();
 if(activated&&report.before?.version&&report.candidate){
  try{
   if((await active()).version===report.candidate){
    await api('/workers/scripts/'+SCRIPT+'/deployments',{
     strategy:'percentage',versions:[{version_id:report.before.version,percentage:100}],
     annotations:{'workers/message':'Automatic rollback: Featured Match PC/mobile production QA failed'}
    });
    report.rolledBack=(await active()).version===report.before.version;
   }
  }catch(z){report.rollbackError=String(z)}
 }
 save();console.error('BALL46_FEATURED_RECESSED_PRODUCTION_STOP',report.error);process.exitCode=1;
}
