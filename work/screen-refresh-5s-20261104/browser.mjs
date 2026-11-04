import{chromium}from'playwright';import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';
const root='work/screen-refresh-5s-20261104',html=await readFile(root+'/stage/current.html','utf8'),js=await readFile(root+'/stage/dashboard-after.js','utf8'),results=[],browser=await chromium.launch({headless:true});
const fixture={fixtureId:'screen-test-1',home:{id:1,name:'Display Home'},away:{id:2,name:'Display Away'},league:{id:1,name:'Isolated UI test'},kickoffAt:Date.now()-3600000,boardState:'live',status:'Live',statusCode:'2H',minute:60,goals:{home:0,away:0,halfHome:0,halfAway:0},providerOdds:{}};
try{await Promise.all([1366,390].map(async width=>{
 const ctx=await browser.newContext({viewport:{width,height:900}}),p=await ctx.newPage(),errors=[],requests=[],t=Date.now();let reads=0,fail=false,old=false,value=0,minute=60;
 p.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(r.request().isNavigationRequest())return r.fulfill({contentType:'text/html',body:html});
 if(u.hostname==='ball46.com'&&u.pathname==='/dashboard-v2-stage3-featured-facts-20261013a.js')return r.fulfill({contentType:'text/javascript',body:js});
 if(u.hostname==='ball46.com'&&u.pathname.startsWith('/api/')){
 requests.push({path:u.pathname,at:Date.now()-t});let body={ok:true,fixtures:[],signals:[],rows:[],ledgerRows:[],ledgerTotal:0,nextCursor:null,entries:{},markets:[],bookmakers:[],externalRequestsAdded:0};
 if(u.pathname==='/api/engine/board')body={ok:true,fixtures:[fixture],fetchedAt:t,hubFetchedAt:t,counts:{live:1}};
 if(u.pathname==='/api/hub/snapshot'){reads++;if(fail)return r.fulfill({status:503,body:'temporarily unavailable'});body={ok:true,cacheOnly:true,externalRequestsAdded:0,fetchedAt:old?t-1000:Date.now(),liveFetchedAt:Date.now(),fixtures:[{...fixture,minute,goals:{...fixture.goals,home:value}}]};}
 return r.fulfill({json:body});}
 if(u.hostname!=='ball46.com')return r.fulfill({status:204,body:''});
 return r.continue();
 });
 await p.goto('https://ball46.com/?status=live',{waitUntil:'domcontentloaded',timeout:60000});
 await p.waitForFunction(()=>document.querySelector('.match-row[data-match-id]'),null,{timeout:30000});
 await p.evaluate(()=>{window.__testRow=document.querySelector('.match-row');window.__testTeams=document.querySelector('.match-row .teams-cell');window.__fastChildLists=0;window.__fastMutations=[];new MutationObserver(rs=>{window.__fastChildLists+=rs.length;window.__fastMutations.push(...rs.map(r=>({at:performance.now(),target:r.target.className,added:[...r.addedNodes].map(n=>n.nodeType===1?n.outerHTML.slice(0,250):n.textContent),removed:[...r.removedNodes].map(n=>n.nodeType===1?n.outerHTML.slice(0,250):n.textContent)})))}).observe(document.querySelector('[data-board-sections]'),{childList:true,subtree:true});const table=document.createElement('table');table.hidden=true;table.className='sp-table';table.innerHTML='<tbody><tr data-b46-stat-display=\'{"fixtureId":"screen-test-1","settled":false}\'><td class="b46-sc-score"><span class="b46-sc-stack"><span>0</span><span>0</span></span></td></tr></tbody>';document.body.append(table);});
 const start=Date.now(),initialReads=reads;
 value=1;minute=61;
 await p.waitForFunction(()=>window.NOMAD343_DASHBOARD_V2.getFixture('screen-test-1')?.goals?.home===1,null,{timeout:7000});
 let delta=Date.now()-start;assert(delta<6500,'NOT_WITHIN_5S_PLUS_NETWORK');assert.equal(await p.locator('.desktop-team-score').first().textContent(),'1');
 if(width===390){await p.waitForFunction(()=>document.querySelector('#b46gn-cards .b46gn-team-score')?.textContent==='1');}
 assert.equal(await p.locator('[data-featured-score]').first().textContent(),'1-0');
 await p.waitForFunction(()=>document.querySelector('.sp-table .b46-sc-stack > span')?.textContent==='1',null,{timeout:3000});
 await p.waitForFunction(()=>document.querySelector('#pv8-score')?.textContent.includes('1')&&document.querySelector('#pv8-clock')?.textContent.includes('61'),null,{timeout:3000});
 value=0;minute=62;await p.waitForFunction(()=>window.NOMAD343_DASHBOARD_V2.getFixture('screen-test-1')?.minute===62,null,{timeout:7000});assert.equal(await p.locator('.desktop-team-score').first().textContent(),'0');
 fail=true;const oldReads=reads;await new Promise(r=>setTimeout(r,5400));assert(reads>oldReads);assert.equal(await p.locator('.desktop-team-score').first().textContent(),'0');fail=false;
 old=true;value=9;await new Promise(r=>setTimeout(r,5100));assert.equal(await p.locator('.desktop-team-score').first().textContent(),'0');old=false;value=2;minute=65;
 await p.waitForFunction(()=>window.NOMAD343_DASHBOARD_V2.getFixture('screen-test-1')?.minute===65,null,{timeout:7000});
 const identity=await p.evaluate(()=>({row:window.__testRow===document.querySelector('.match-row'),teams:window.__testTeams===document.querySelector('.match-row .teams-cell'),childLists:window.__fastChildLists,mutations:window.__fastMutations}));console.log(JSON.stringify({width,identity,requests}));
 assert(identity.row&&identity.teams);assert.equal(identity.childLists,0,'FAST_DOM_TRIGGERED_EXPANDED_ENGINE_FETCH');
 await p.waitForFunction(()=>document.querySelector('.match-row .desktop-team-score')?.textContent==='2');const wait=Math.max(0,32000-(Date.now()-t));if(wait)await new Promise(r=>setTimeout(r,wait));
 assert.equal(await p.locator('.desktop-team-score').first().textContent(),'2','OLD_ENGINE_BOARD_OVERWROTE_NEW_SCORE');
 const boardReads=requests.filter(r=>r.path==='/api/engine/board').length;assert.equal(boardReads,2,'BASELINE_ENGINE_CADENCE_CHANGED');
 await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__testHidden?'hidden':'visible'});window.__testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
 const hiddenReads=reads;await new Promise(r=>setTimeout(r,5500));assert.equal(reads,hiddenReads,'HIDDEN_TAB_NOT_PAUSED');
 const resume=Date.now();await p.evaluate(()=>{window.__testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForFunction(()=>window.NOMAD343_DASHBOARD_V2.getFixture('screen-test-1')?.minute===65);await new Promise(r=>setTimeout(r,250));assert(reads>hiddenReads,'NO_IMMEDIATE_RESUME');
 assert.deepEqual(errors,[]);const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
 assert.equal(await p.locator('.sp-table .b46-sc-stack > span').first().textContent(),'2');await p.screenshot({path:root+'/audit/preview-'+width+'.png'});
 results.push({width,ok:true,firstUpdateMs:delta,fastReads:reads,boardReadsBeforeResume:boardReads,signalReads:requests.filter(r=>r.path==='/api/engine/signals').length,hiddenPause:true,resumeMs:Date.now()-resume,scoresCorrected:true,staleRejected:true,networkFailureRetainsData:true,oldBoardDidNotOverwrite:true,stableRows:true,fastChildListMutations:0,pageErrors:errors,overflow,providerRequestsAdded:0});
 await ctx.close();
}));await writeFile(root+'/audit/browser-tests.json',JSON.stringify({ok:true,results,fixture:'isolated UI test - not Production match data'},null,2));console.log(JSON.stringify({ok:true,results}));}finally{await browser.close()}


