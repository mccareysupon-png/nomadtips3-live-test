import assert from'node:assert/strict';import{chromium}from'playwright';import{readFile,writeFile}from'node:fs/promises';import{ROOT,DIR,sha,preview,patchHTML}from'./release-ops.mjs';
const phase=process.argv[2];assert(['candidate','production','shadow'].includes(phase));const candidate=JSON.parse(await readFile(DIR+'/candidate.json')),host=phase==='candidate'?preview(candidate.candidate):'https://ball46.com',build=JSON.parse(await readFile(DIR+'/build.json')),payload=JSON.parse(await readFile(ROOT+'/stage/assets.json')),browser=await chromium.launch({headless:true}),results=[];
try{for(const {width,theme} of [1366,390].flatMap(width=>['light','dark'].map(theme=>({width,theme})))){
const reduced=width===390&&theme==='light',ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:reduced?'reduce':'no-preference'}),p=await ctx.newPage(),errors=[],failures=[],snapshots=[],writes=[],failureReads=[];let preventedProvider=0,directProvider=0;
await ctx.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),theme);
p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{const u=new URL(r.url());if(u.hostname===new URL(host).hostname&&r.status()>=400&&!u.pathname.startsWith('/cdn-cgi/')){const item={path:u.pathname,url:u.pathname+u.search,status:r.status()};failures.push(item);failureReads.push(r.text().then(body=>{item.body=body}).catch(e=>{item.bodyReadError=e.message}));}});
await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
if(phase==='shadow'&&req.isNavigationRequest()&&u.hostname==='ball46.com'){const response=await route.fetch(),html=await response.text();return route.fulfill({response,body:patchHTML(html,payload.head,candidate.previousHead)});}
if(phase==='shadow'&&build.assets.some(a=>a.path===u.pathname)){const response=await route.fetch({url:preview(candidate.candidate)+u.pathname+u.search});return route.fulfill({response});}

if(/5dollarfootballapi|goaloo/i.test(u.hostname)){directProvider++;return route.abort();}
if(!['GET','HEAD'].includes(req.method())){if(u.pathname.startsWith('/cdn-cgi/')||/cloudflareinsights|google|analytics|visitor-monitor/.test(u.hostname))return route.fulfill({status:204,body:''});writes.push({method:req.method(),path:u.pathname});return route.abort();}
if(u.hostname!==new URL(host).hostname&&u.hostname!=='ball46.com'&&u.hostname!=='www.ball46.com')return route.fulfill({status:204,body:''});
if(u.pathname==='/api/full-market/fixture-odds'||u.pathname.includes('/referee')||u.pathname.includes('/form-history')||u.pathname.includes('/last5')){preventedProvider++;return route.fulfill({json:{ok:true,source:'AUDIT_PROVIDER_REQUEST_SUPPRESSED',fixtureId:u.searchParams.get('fixtureId'),fullOdds:null,markets:[],bookmakers:[],externalRequestsAdded:0}});}
if(u.pathname==='/api/hub/snapshot'){const at=Date.now(),response=await route.fetch(),j=await response.json();assert.equal(response.status(),200);assert(j.ok&&j.cacheOnly===true&&j.externalRequestsAdded===0);snapshots.push({at,stamp:j.fetchedAt});return route.fulfill({response});}
return route.continue();
});
await p.goto(host+'/?status=live',{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForFunction(()=>window.NOMAD343_DASHBOARD_V2?.getFixture&&document.querySelector('[data-board-sections] .match-row'),null,{timeout:90000});
if(width===390){
 await p.locator('#b46gn-cards [data-b46gn-fixture]').first().waitFor({state:'visible',timeout:30000});
 const pick=await p.locator('#b46gn-cards [data-b46gn-fixture]').evaluateAll(es=>es.map(el=>({id:el.dataset.b46gnFixture,minute:Number(window.NOMAD343_DASHBOARD_V2.getFixture(el.dataset.b46gnFixture)?.minute)||0})).sort((a,b)=>a.minute-b.minute)[0]);assert(pick);await p.locator('#b46gn-cards [data-b46gn-fixture="'+pick.id+'"]').click();
}
const selector=width===390?'#b46-suite-summary .b46mp-card':'.right-rail > .b46mp-card';await p.locator(selector).waitFor({state:'visible',timeout:30000});
await p.waitForFunction(selector=>{const a=document.querySelector(selector),i=a?.querySelector('img');return i?.complete&&i.naturalWidth===1774},selector,{timeout:30000});
const deadline=Date.now()+25000;while(snapshots.length<4&&Date.now()<deadline)await new Promise(r=>setTimeout(r,500));assert(snapshots.length>=4,'EXISTING_5S_POLL_MISSING');
await p.locator('#b46-data-orbit-loading').waitFor({state:'detached',timeout:15000});
const state=await p.locator(selector).evaluate(a=>{const r=a.getBoundingClientRect(),f=a.nextElementSibling,content=a.querySelector('.b46mp-content'),img=a.querySelector('img'),title=a.querySelector('.b46mp-title'),cta=a.querySelector('.b46mp-cta');return{height:r.height,width:r.width,theme:a.dataset.b46mpTheme,pageTheme:document.documentElement.dataset.theme,aboveFeatured:f?.matches('.featured-card[data-featured]'),gap:f.getBoundingClientRect().top-r.bottom,href:a.href,target:a.target,rel:a.rel,heading:getComputedStyle(title).color,ctaBackground:getComputedStyle(cta).backgroundColor,ctaColor:getComputedStyle(cta).color,image:{width:img.naturalWidth,height:img.naturalHeight,animation:getComputedStyle(img).animationName,renderedHeight:img.getBoundingClientRect().height,renderedWidth:img.getBoundingClientRect().width,src:img.getAttribute('src')},animation:getComputedStyle(a.querySelector('.b46mp-letter')).animationName,animationDuration:getComputedStyle(a.querySelector('.b46mp-letter')).animationDuration,statsDuplicates:document.querySelectorAll('#b46-suite-stats .b46mp-card').length,visibleCards:[...document.querySelectorAll('.b46mp-card')].filter(x=>x.getBoundingClientRect().width>0).length,contentOverflow:content.scrollWidth>content.clientWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,score:document.querySelector('[data-featured-score]')?.textContent,testData:/PREVIEW · MEMBER CARD|Preview FC|Display Home/.test(document.body.innerText)}});

const diagnostic=await p.locator(selector).evaluate(a=>{const p=a.parentElement,c=a.querySelector('.b46mp-content'),img=a.querySelector('img'),props=e=>{const s=getComputedStyle(e);return Object.fromEntries(['display','position','height','minHeight','maxHeight','width','flex','flexGrow','flexShrink','flexBasis','alignSelf','boxSizing','transform','padding','margin'].map(k=>[k,s[k]]))},rules=[];for(const sheet of document.styleSheets){try{for(const r of sheet.cssRules){if(r.selectorText)try{if(a.matches(r.selectorText)&&(/height|display|flex|min-height|max-height/.test(r.style?.cssText||'')))rules.push({href:sheet.href,selector:r.selectorText,css:r.style.cssText})}catch{}}}catch{}}return{card:props(a),inline:a.getAttribute('style'),parent:{className:p.className,style:props(p)},content:props(c),image:props(img),rules}});
await writeFile(DIR+'/'+phase+'-'+width+'-'+theme+'-layout.json',JSON.stringify({state,diagnostic},null,2));console.log(JSON.stringify({layout:true,phase,width,theme,state,diagnostic}));
await p.screenshot({path:DIR+'/'+phase+'-'+width+'-'+theme+'-observed.png',fullPage:false});
assert.equal(state.theme,theme);assert.equal(state.height,width===390?160:156);assert(state.width>=250&&state.width<=430);assert(state.aboveFeatured);assert.equal(state.gap,12);assert.equal(state.visibleCards,1);assert.equal(state.statsDuplicates,0);assert.equal(state.contentOverflow,false);assert.equal(state.pageOverflow,false);assert.equal(state.testData,false);assert.equal(state.href,'https://member.ball46.com/pricing');assert.equal(state.target,'_blank');assert(state.rel.includes('noopener'));assert.equal(state.image.height,887);assert.equal(state.image.src,'/b46-member-promo-sharp-20261105.png?v=1');assert.equal(state.image.renderedHeight,state.height);assert.equal(state.image.renderedWidth,state.height*2);assert.equal(state.image.animation,'none');assert.equal(state.heading,theme==='light'?'rgb(22, 61, 43)':'rgb(255, 255, 255)');assert((theme==='light'?['rgb(255, 255, 255)']:['rgb(20, 48, 30)','rgb(18, 57, 32)']).includes(state.ctaColor),'CTA_TEXT_COLOR');if(reduced)assert.equal(state.animation,'none');else assert(state.animation.startsWith('b46mp-letter-'));
const gaps=snapshots.slice(1,4).map((s,i)=>s.at-snapshots[i].at);for(const g of gaps)assert(g>=3500&&g<=8000,'DISPLAY_CADENCE_CHANGED:'+g);
for(const asset of build.assets){const r=await ctx.request.get((phase==='shadow'?preview(candidate.candidate):host)+asset.path+'?v='+asset.version,{headers:{'cache-control':'no-cache'}});assert.equal(r.status(),200);assert.equal(sha(await r.body()),asset.sha,'ASSET_HASH_MISMATCH:'+asset.path);}
const dashboard=await ctx.request.get(host+'/dashboard-v2-stage3-featured-facts-20261013a.js?v=b46-screen-refresh-5s-20261104',{headers:{'cache-control':'no-cache'}});assert.equal(sha(await dashboard.body()),'fd6202e8154f7ee6dd3c1b1bd589ef64e2580781cbb70bdadd8d6a68e2c82d50','5S_SOURCE_CHANGED');
await Promise.all(failureReads);
const preExistingStatisticsFailures=[],unexplainedFailures=[];
for(const failure of failures){
 if(failure.path==='/api/engine/statistics'&&failure.status===599&&typeof failure.body==='string'){
  // Read the identical request through the untouched immediate baseline.
  // Only a byte-identical 599 body is classified as an existing Statistics issue.
  // Every other API/resource failure remains a hard failure.
  const referenceURL=preview(candidate.base)+failure.url;
  const reference=await ctx.request.get(referenceURL,{timeout:45000,headers:{'cache-control':'no-cache'}});
  const referenceBody=await reference.text();
  if(reference.status()===599&&referenceBody===failure.body){
   preExistingStatisticsFailures.push({path:failure.path,url:failure.url,status:failure.status,referenceStatus:reference.status(),referenceVersion:candidate.base,identicalErrorBody:true,errorBodySha256:sha(referenceBody),errorBody:referenceBody.slice(0,1200)});
   continue;
  }
  unexplainedFailures.push({...failure,referenceStatus:reference.status(),referenceBody:referenceBody.slice(0,1200)});
 }else unexplainedFailures.push(failure);
}
await writeFile(DIR+'/'+phase+'-'+width+'-'+theme+'-request-comparison.json',JSON.stringify({preExistingStatisticsFailures,unexplainedFailures},null,2));
assert.deepEqual(errors,[]);assert.deepEqual(unexplainedFailures,[],'UNEXPLAINED_RESOURCE_OR_API_FAILURE');assert.deepEqual(writes,[]);assert.equal(directProvider,0);
await p.screenshot({path:DIR+'/'+phase+'-'+width+'-'+theme+'.png',fullPage:false});results.push({width,theme,ok:true,reducedMotion:reduced,state,cacheReadGapsMs:gaps,providerReadsSuppressed:preventedProvider,directProviderAttempts:directProvider,pageErrors:errors,failedResources:failures,preExistingStatisticsFailures,unexplainedFailures,ownServerWrites:0});
await ctx.unrouteAll({behavior:'wait'});await ctx.close();
}await writeFile(DIR+'/'+phase+'-browser.json',JSON.stringify({ok:true,phase,candidate:candidate.candidate,host,run:process.env.GITHUB_RUN_ID,at:new Date().toISOString(),results},null,2));console.log(JSON.stringify({ok:true,phase,results}));}catch(e){await writeFile(DIR+'/'+phase+'-browser-failure.json',JSON.stringify({ok:false,phase,error:e.stack,results},null,2));throw e}finally{for(const c of browser.contexts())await c.unrouteAll({behavior:'wait'});await browser.close()}




