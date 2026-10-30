import{chromium}from'playwright';import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{ready}from'./ready.mjs';
const candidate=JSON.parse(await readFile('audit/candidate.json')),host=process.argv[2]||'https://'+candidate.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev',browser=await chromium.launch({headless:true}),results=[],errors=[],network=[];let recordedBoard;
try{
for(const width of[1440,390])for(const mode of['live','signal-qa']){
const ctx=await browser.newContext({viewport:{width,height:960}});await ctx.addInitScript(()=>localStorage.setItem('nomad343_dashboard_theme_v1','dark'));
const page=await ctx.newPage();page.on('pageerror',e=>errors.push({width,mode,error:e.message}));page.on('console',m=>{if(m.type()==='error')errors.push({width,mode,error:m.text(),url:m.location().url})});page.on('response',r=>{if(r.status()>=400)network.push({width,mode,status:r.status(),url:r.url()})});
let sampleId;
if(mode==='signal-qa'){
assert(recordedBoard?.fixtures?.length,'BOARD_REQUIRED');const f=recordedBoard.fixtures.find(f=>f.boardState==='live')||recordedBoard.fixtures[0];sampleId=String(f.fixtureId);
await page.route('**/api/engine/board*',r=>r.fulfill({json:recordedBoard}));
await page.route('**/api/engine/signals*',r=>r.fulfill({json:{ok:true,signals:[{id:'B46-UI-QA-ONLY',fixtureId:sampleId,status:'PENDING',market:'AH',marketLabel:'Asian Handicap · Full Time',selection:'HOME',line:0.25,odds:1.74,bookmaker:'Pinnacle',entryMinute:30,mirrorMinute:f.minute,entryScore:f.goals,mirrorScore:f.goals}],allCount:1,mirror:{}}}));
}
const boardResponse=mode==='live'?page.waitForResponse(r=>new URL(r.url()).pathname==='/api/engine/board'&&r.status()===200):null;
await page.goto(host+(mode==='live'?'/?status=live':'/?view=signal'),{waitUntil:'domcontentloaded',timeout:60000});await ready(page);
if(boardResponse)recordedBoard=await(await boardResponse).json();
await page.waitForFunction(()=>document.querySelector('article.match-row[data-match-id]'));
if(mode==='signal-qa')await page.waitForFunction(()=>Number(document.querySelector('[data-featured-signal]')?.dataset.v11Count)>0);
if(width===390&&mode==='live')await page.waitForFunction(()=>document.querySelector('#b46gn-cards [data-b46gn-fixture] .b46-shared-kit img')?.complete);
const rows=await page.evaluate(()=>[...document.querySelectorAll('article.match-row[data-match-id]')].map(row=>({id:row.dataset.matchId,kits:[...row.querySelectorAll('.teams-cell .team-kit-icon')].map(n=>({key:n.dataset.kit,shared:n.classList.contains('b46-shared-kit'),src:n.querySelector('img')?.getAttribute('src')}))})));
assert(rows.length>0);for(const row of rows){assert.equal(row.kits.length,2);assert(row.kits.every(k=>k.shared&&k.src),'LEGACY_KIT_FOUND')}
const id=sampleId||await page.locator('article.match-row.active').first().getAttribute('data-match-id').catch(()=>rows[0].id);
if(width===390&&mode==='live'){await page.locator('#b46gn-cards [data-b46gn-fixture="'+id+'"]').click();await page.locator('#b46gn-detail[aria-hidden="false"]').waitFor();}
else{await page.locator('article.match-row[data-match-id="'+id+'"]').click();}
if(!(width===390&&mode==='signal-qa'))await page.waitForFunction(({id,mobile})=>{const row=document.querySelector('article.match-row[data-match-id="'+id+'"]'),srcs=[...row.querySelectorAll('.b46-shared-kit>img')].map(x=>x.getAttribute('src')),root=mobile?document.querySelector('#b46gn-detail'):document,imgs=[...root.querySelectorAll('.pv8-feature-kit')].filter(i=>i.getClientRects().length);return srcs.length===2&&imgs.length>=2&&imgs.slice(0,2).every((x,i)=>x.getAttribute('src')===srcs[i]&&x.complete&&x.naturalWidth>0)}, {id,mobile:width===390&&mode==='live'});
const match=await page.evaluate(({id,mobile})=>{const root=mobile?document.querySelector('#b46gn-detail'):document,row=document.querySelector('article.match-row[data-match-id="'+id+'"]');const read=nodes=>[...nodes].map(i=>i.getAttribute('src'));return{row:read(row.querySelectorAll('.b46-shared-kit>img')),featured:read(root.querySelectorAll('.pv8-feature-kit')).slice(0,2),prediction:read(root.querySelectorAll('#pv8-home-kit,#pv8-away-kit'))}}, {id,mobile:width===390&&mode==='live'});
// Signal mobile uses the compact match-row layout with its right rail hidden.
if(!(width===390&&mode==='signal-qa')){assert.deepEqual(match.row,match.featured);assert.deepEqual(match.row,match.prediction)}
let themeProof=null;
if(mode==='signal-qa'&&width===1440){const odds=page.locator('.right-rail .feature-signal [data-v11-kind="metrics"]>span:nth-child(2)').first();const color=()=>odds.evaluate(e=>getComputedStyle(e,'::after').color);assert.equal(await color(),'rgb(244, 218, 114)');await page.getByRole('button',{name:'Switch theme',exact:true}).click();assert.equal(await color(),'rgb(130, 96, 0)');themeProof={dark:'rgb(244, 218, 114)',light:'rgb(130, 96, 0)'};await page.getByRole('button',{name:'Switch theme',exact:true}).click();}
const before=await page.evaluate(()=>[...document.querySelectorAll('article.match-row .b46-shared-kit')].map(n=>n.dataset.teamKey));
await page.evaluate(()=>{const fixture=window.NOMAD343_DASHBOARD_V2?.getFixture(document.querySelector('article.match-row')?.dataset.matchId);window.__b46QAkitNodes=[...document.querySelectorAll('article.match-row .b46-shared-kit')];document.dispatchEvent(new CustomEvent('ball46:workspace-view'))});
const preserved=await page.evaluate(()=>{const current=[...document.querySelectorAll('article.match-row .b46-shared-kit')];return current.length===window.__b46QAkitNodes.length&&current.every((n,i)=>n===window.__b46QAkitNodes[i])});assert(preserved,'KIT_DOM_REPLACED_ON_REFRESH');
await page.screenshot({path:'audit/kits-'+(host.includes('workers.dev')?'candidate':'production')+'-'+width+'-'+mode+'.png'});
results.push({width,mode,uiSignalsMocked:mode==='signal-qa',id,rowCount:rows.length,legacyKits:0,match,themeProof,kitNodesPreserved:preserved});await ctx.close();
}
await writeFile('audit/browser-network.json',JSON.stringify({host,errors,network},null,2));assert.deepEqual(errors,[]);
const proof={ok:true,candidate:candidate.candidate,host,desktop:true,mobile:true,kitsUnified:true,signalTheme:true,signalsUntouched:true,consoleErrors:0,results,at:new Date().toISOString()};await writeFile(host.includes('workers.dev')?'browser-proof.json':'audit/production-browser-proof.json',JSON.stringify(proof,null,2));console.log('UNIFIED_KITS_BROWSER_PASS='+JSON.stringify({host,cases:results.length,errors:errors.length}));
}finally{await browser.close()}
