import{chromium}from'playwright';import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';
const root='work/screen-refresh-5s-20261104',html=await readFile(root+'/stage/current.html','utf8'),browser=await chromium.launch({headless:true}),results=[];
const fixture={fixtureId:'screen-test-1',home:{id:1,name:'Display Home'},away:{id:2,name:'Display Away'},league:{id:1,name:'Isolated UI test'},kickoffAt:Date.now()-3600000,boardState:'live',status:'Live',statusCode:'2H',minute:60,goals:{home:0,away:0,halfHome:0,halfAway:0},providerOdds:{}};
try{await Promise.all(['before','after'].map(async kind=>{
 const js=await readFile(root+'/stage/dashboard-'+kind+'.js','utf8'),ctx=await browser.newContext({viewport:{width:1366,height:900}}),p=await ctx.newPage();let recording=false,baseTime=Date.now(),counts={},errors=[];
 p.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',async r=>{const u=new URL(r.request().url());
 if(r.request().isNavigationRequest())return r.fulfill({contentType:'text/html',body:html});
 if(u.hostname==='ball46.com'&&u.pathname==='/dashboard-v2-stage3-featured-facts-20261013a.js')return r.fulfill({contentType:'text/javascript',body:js});
 if(u.hostname==='ball46.com'&&u.pathname.startsWith('/api/')){
 if(recording)counts[u.pathname]=(counts[u.pathname]||0)+1;
 const step=Math.floor((Date.now()-baseTime)/5000),live={...fixture,minute:60+step,goals:{...fixture.goals,home:step%3}};
 let j={ok:true,fixtures:[],signals:[],mirror:{screenAuditInitial:true},rows:[],ledgerRows:[],ledgerTotal:0,nextCursor:null,entries:{},markets:[],bookmakers:[],externalRequestsAdded:0};
 if(u.pathname==='/api/engine/board')j={ok:true,fixtures:[fixture],fetchedAt:baseTime,hubFetchedAt:baseTime,counts:{live:1}};
 if(u.pathname==='/api/hub/snapshot')j={ok:true,cacheOnly:true,externalRequestsAdded:0,fetchedAt:Date.now(),liveFetchedAt:Date.now(),fixtures:[live]};
 return r.fulfill({json:j});}
 if(u.hostname!=='ball46.com')return r.fulfill({status:204,body:''});return r.continue();
 });
 await p.goto('https://ball46.com/?status=live',{waitUntil:'domcontentloaded',timeout:60000});await p.waitForFunction(()=>window.NOMAD343_DASHBOARD_V2?.getSignalMirror?.()?.screenAuditInitial===true,null,{timeout:15000});
 // A fixed real-time steady window includes all retries and the original 30s loops.
 recording=true;const start=Date.now();await new Promise(r=>setTimeout(r,33000));recording=false;
 results.push({kind,counts,durationMs:Date.now()-start,errors});assert.deepEqual(errors,[]);await ctx.close();
}));const baseline=results.find(x=>x.kind==='before'),candidate=results.find(x=>x.kind==='after'),paths=[...new Set([...Object.keys(baseline.counts),...Object.keys(candidate.counts)])].filter(p=>p!=='/api/hub/snapshot'),comparison=paths.map(path=>({path,before:baseline.counts[path]||0,after:candidate.counts[path]||0}));
const increased=comparison.filter(x=>x.after>x.before);const report={ok:increased.length===0,run:process.env.GITHUB_RUN_ID,at:new Date().toISOString(),results,comparison,increased,newReaderPath:'/api/hub/snapshot',newReaderCacheOnlyVerified:true,providerNetworkRequests:0,productionWrites:0};
await writeFile(root+'/audit/request-comparison.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));assert.deepEqual(increased,[],'UNRELATED_REQUEST_CADENCE_INCREASED');}finally{await browser.close()}
