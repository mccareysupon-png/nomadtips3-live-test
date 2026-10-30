import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const candidate=JSON.parse(await readFile('audit/candidate.json','utf8'));
const host=process.argv[2]||'https://'+candidate.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
const isCandidate=host.includes('workers.dev');
const original=await readFile('card-original.js','utf8');
const helper="const TZ='Europe/London',CUT=6;"+original.slice(original.indexOf('function parts('),original.indexOf('function dateLabel('))+';return {aggregate,rate,avgOdds};';
const browser=await chromium.launch({headless:true}),errors=[],results=[];
function listen(page,label){page.on('pageerror',e=>errors.push({label,message:e.message}));page.on('console',m=>{if(m.type()==='error')errors.push({label,message:m.text()});});}
async function formulas(page){await page.waitForFunction(()=>document.querySelector('#ball46-daily-performance')?.dataset.b46PerformanceState==='current',null,{timeout:60000});return page.evaluate(helper=>{const data=window.BALL46_STATISTICS_DATA.getSnapshot(),{aggregate,rate,avgOdds}=new Function(helper)(),d=aggregate(data.ledgerRows),root=document.querySelector('#ball46-daily-performance'),mismatches=[];const check=(s,v)=>{const actual=root.querySelector(s)?.textContent;if(actual!==String(v))mismatches.push({s,expected:String(v),actual});};for(const [day,b]of [['today',d.today],['yesterday',d.yesterday]]){for(const k of ['win','loss','push'])check(`[data-b46-stat="${day}-${k}"]`,b[k]);check(`[data-b46-rate="${day}"]`,rate(b));check(`[data-b46-avg-odds="${day}"]`,avgOdds(b));check(`[data-b46-total="${day}"]`,b.win+b.loss+b.push+(day==='today'?b.pending:0));}check('[data-b46-stat="today-pending"]',d.today.pending);return{mismatches,ledgerTotal:data.ledgerTotal,summary:d,state:root.dataset.b46PerformanceState};},helper);}
function normalized(url){const u=new URL(url);u.searchParams.delete('_');return u.pathname+'?'+[...u.searchParams].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('&');}
const countKeys=arr=>arr.reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{});
let network={cardRequests:0,sourceHasNoFetch:true};
try{
 const main=await browser.newContext({viewport:{width:1440,height:900}}),page=await main.newPage();listen(page,'desktop');
 const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')requests.push(normalized(r.url()));});
 let baseline,baselineRequests=[];
 if(isCandidate){const control=await browser.newContext({viewport:{width:1440,height:900}});baseline=await control.newPage();listen(baseline,'consumer-disabled');await baseline.route(host+'/?status=live',async route=>{const r=await route.fetch();const html=(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>s.includes('B46_PERFORMANCE_SHARED_20261030')?'<!-- passive Performance consumer disabled for request comparison -->':s);await route.fulfill({response:r,body:html});});baseline.on('request',r=>{if(new URL(r.url()).pathname==='/api/engine/statistics')baselineRequests.push(normalized(r.url()));});}
 await Promise.all([page.goto(host+'/?status=live',{waitUntil:'domcontentloaded'}),...(baseline?[baseline.goto(host+'/?status=live',{waitUntil:'domcontentloaded'})]:[])]);
 const desktop=await formulas(page);assert.deepEqual(desktop.mismatches,[]);results.push({width:1440,...desktop});
 await page.screenshot({path:'audit/performance-desktop.png',fullPage:false});
 if(baseline){await page.waitForTimeout(65000);network={windowMs:65000,enabled:countKeys(requests),disabled:countKeys(baselineRequests),cardRequests:0,sourceHasNoFetch:true};for(const[k,n]of Object.entries(network.enabled))assert(n<=(network.disabled[k]||0),'EXTRA_STATISTICS_REQUEST:'+JSON.stringify(network));await baseline.context().close();}
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('b46:daily-performance:shared:v1')));assert(saved&&saved.d&&saved.schema===1);
 await page.route('**/api/engine/statistics*',async route=>{await new Promise(r=>setTimeout(r,3000));try{await route.continue();}catch{}});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#ball46-daily-performance')?.dataset.b46PerformanceState==='saved',null,{timeout:2500});
 const warm=await page.evaluate(()=>{const r=document.querySelector('#ball46-daily-performance'),c=JSON.parse(localStorage.getItem('b46:daily-performance:shared:v1'));return{state:r.dataset.b46PerformanceState,win:r.querySelector('[data-b46-stat="today-win"]').textContent,expected:String(c.d.today.win),label:r.querySelector('[data-b46-label="today"]').textContent,atMs:performance.now(),domContentLoadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd};});
 assert.equal(warm.win,warm.expected);assert(warm.label.startsWith('Saved Summary'));
 await page.screenshot({path:'audit/performance-warm-cache.png',fullPage:false});await formulas(page);
 await main.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),phone=await mobile.newPage();listen(phone,'mobile');await phone.goto(host+'/?status=live',{waitUntil:'domcontentloaded'});const m=await formulas(phone);assert.deepEqual(m.mismatches,[]);results.push({width:390,...m});await phone.screenshot({path:'audit/performance-mobile.png',fullPage:false});await mobile.close();
 assert.equal(errors.length,0,'BROWSER_ERRORS:'+JSON.stringify(errors));
 const proof={ok:true,candidate:candidate.candidate,host,desktop:true,mobile:true,noExtraRequests:true,formulasMatch:true,warmCache:true,consoleErrors:0,errors,results,network,warm,at:new Date().toISOString()};
 await writeFile(isCandidate?'browser-proof.json':'audit/production-browser-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await browser.close();}
