import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'OWNER_TOKEN_REQUIRED_FOR_TEST_QA');
const auth='Bearer '+createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const frontend='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const backend='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
async function api(url,headers={}){
 const r=await fetch(url,{headers:{accept:'application/json',...headers},signal:AbortSignal.timeout(27000),cache:'no-store'});
 assert(r.ok,url+' HTTP '+r.status);return r.json();
}
async function latest(){
 const state=await api(frontend+'/__b46_pm_adaptive_research');
 assert.equal(state.formulas.length,42);
 const sorted=state.records.slice().sort((a,b)=>Number(b.picked_at)-Number(a.picked_at)||Number(b.kickoff)-Number(a.kickoff));
 const when=Number(sorted[0]?.picked_at);
 const items=sorted.filter(r=>Number(r.picked_at)===when);
 assert(items.length>0,'NO_ADAPTIVE_SELECTIONS');
 return {state,when,items};
}
function compareCard(card,p,label){
 assert(card.includes(String(p.home))&&card.includes(String(p.away)),label+'_MATCH');
 assert(card.includes(String(p.formula_id))&&card.includes(String(p.selection)),label+'_FORMULA_SIDE');
 assert(card.includes(Number(p.odds).toFixed(2))&&card.includes(String(p.bookmaker)),label+'_LOCKED_ODDS_BOOKMAKER');
 assert(card.includes(String(p.status)),label+'_RESULT_STATUS');
 if(String(p.odds_source).includes('HISTORICAL_RESEARCH_ONLY'))
  assert(card.includes('HISTORICAL_RESEARCH_ONLY'),label+'_RESEARCH_QUOTE_LABEL');
}
const before=await latest();
const owner=await api(backend+'/adaptive-control-api-test',{authorization:auth});
assert.equal(owner.formulas.length,42);
assert.equal(owner.summary?.total,42,'MANUAL_CONTROL_REGISTRY_MISSING');
const chromiumBrowser=await chromium.launch({headless:true,args:['--no-sandbox']});
const folder='/tmp/b46-latest-all-ui-browser-qa';
await mkdir(folder,{recursive:true});
const output=[];
try{
 for(const device of [{name:'desktop',width:1440,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
  const ctx=await chromiumBrowser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.mobile,hasTouch:device.mobile});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const entry of [
   {name:'ou-statistics',route:frontend+'/?b46pm=ou',selector:'#b46pm-adaptive-latest-statistics [data-b46-latest-adaptive-formula]'},
   {name:'canonical-predictions',route:frontend+'/?b46pm=predictions',selector:'#b46pm-adaptive-latest-predictions-content [data-b46-latest-adaptive-formula]'},
  ]){
   const snapshot=await latest();
   const response=await page.goto(entry.route,{waitUntil:'domcontentloaded',timeout:60000});
   assert(response?.ok(),entry.name+'_HTTP_'+response?.status());
   try{await page.waitForSelector(entry.selector,{timeout:12000})}
   catch(e){
    const diag=await page.evaluate(()=>({url:location.href,bodyText:document.body?.innerText.slice(-3500),
      appNodes:[...document.querySelectorAll('[id*=adaptive],[id*=b46pm]')].slice(-18).map(x=>({id:x.id,children:x.children.length,visible:!!x.offsetParent})),
      routeQuery:new URLSearchParams(location.search).get('b46pm')}));
    console.log('B46_ADAPTIVE_BROWSER_SELECTOR_DIAGNOSTIC '+JSON.stringify({page:entry.name,device:device.name,error:String(e),diag,errors}));
    throw e;
   }
   const cards=page.locator(entry.selector);
   await page.waitForFunction(({selector,count})=>document.querySelectorAll(selector).length===count,{selector:entry.selector,count:snapshot.items.length},{timeout:35000});
   const textContent=await cards.allInnerTexts();
   for(const expectedRow of snapshot.items){
     const match=await cards.locator('[data-b46-latest-adaptive-formula]').count().catch(()=>0);
     const cardsMatching=await page.locator(entry.selector+'[data-b46-latest-adaptive-formula="'+expectedRow.formula_id+'"]').allInnerTexts();
     assert(cardsMatching.length>=1,entry.name+'_'+device.name+'_FORMULA_CARD_MISSING');
     compareCard(cardsMatching[0],expectedRow,entry.name+'_'+device.name);
   }
   if(entry.name==='ou-statistics'){
    assert.equal(await page.locator('#b46-adaptive-native').count(),1,'RESEARCH_STATISTICS_MISSING');
    assert.equal(await page.locator('#b46pm-ou-history-public').count(),1,'PAGINATED_HISTORY_MISSING');
   }else{
    assert.equal(await page.locator('#b46pm-adaptive-latest-predictions-content').count(),1,'PREDICTIONS_LATEST_MISSING');
   }
   await page.screenshot({path:folder+'/'+device.name+'-'+entry.name+'.png',fullPage:true});
   output.push({device:device.name,page:entry.name,latestRecords:snapshot.items.length,sourcePickedAt:snapshot.when});
  }
  const researchSnapshot=await latest();
  await page.goto(backend+'/ou-adaptive-research-test',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#b46-research-latest-rows .latest-card',{timeout:35000});
  const researchRows=await page.locator('#b46-research-latest-rows .latest-card').allInnerTexts();
  assert.equal(researchRows.length,researchSnapshot.items.length,'RESEARCH_LATEST_COUNT_WRONG');
  for(const row of researchSnapshot.items){
   const match=researchRows.find(c=>c.includes(row.formula_id+' · '+row.selection+' '+row.line));
   assert(match,'RESEARCH_FORMULA_NOT_SHOWN_'+row.formula_id);
   compareCard(match,row,'RESEARCH_'+device.name);
  }
  assert.equal(await page.locator('#formulaBody tr').count(),42,'RESEARCH_FORMULAS_NOT_42');
  await page.screenshot({path:folder+'/'+device.name+'-research.png',fullPage:true});
  output.push({device:device.name,page:'standalone-research',latestRecords:researchRows.length});
  const controlSnapshot=await latest();
  await page.goto(backend+'/adaptive-control-test',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#key').fill(auth.slice(7));await page.locator('#signin').click();
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:35000});
  assert.equal(await page.locator('#rows tr').count(),42,'MANUAL_42_FORMULA_REGRESSION');
  await page.waitForFunction(count=>document.querySelectorAll('#b46-control-latest-rows .latest-item').length===count,controlSnapshot.items.length,{timeout:25000});
  const controlRows=await page.locator('#b46-control-latest-rows .latest-item').allInnerTexts();
  assert.equal(controlRows.length,controlSnapshot.items.length,'MANUAL_LATEST_COUNT_WRONG');
  for(const row of controlSnapshot.items){
   const match=controlRows.find(c=>c.includes(row.formula_id+' · '+row.selection+' '+row.line));
   assert(match,'MANUAL_FORMULA_NOT_SHOWN_'+row.formula_id);
   compareCard(match,row,'MANUAL_'+device.name);
  }
  await page.screenshot({path:folder+'/'+device.name+'-manual.png',fullPage:true});
  output.push({device:device.name,page:'manual-control',latestRecords:controlRows.length});
  assert.deepEqual(errors,[],'CLIENT_SCRIPT_ERRORS_'+device.name);
  await ctx.close();
 }
 const after=await latest();
 assert.equal(after.state.formulas.length,42);
 console.log('B46_ADAPTIVE_LATEST_ALL_UI_BROWSER_QA_PASS '+JSON.stringify({views:output,formulaCount:42,originalSourcePickedAt:before.when,latestSourcePickedAt:after.when,productionWrites:0,paidProviderCalls:0}));
}finally{await chromiumBrowser.close()}
