import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const cases=[];
const formulas=Array.from({length:42},(_,i)=>({
 formula:i===0?'A02':('A'+String(i+2).padStart(2,'0')),
 mode:'RUN',autoEnabled:false,wins:i%5,losses:i%3,pending:i%2,draws:0,
 winRate:((i%5)+(i%3))?100*(i%5)/((i%5)+(i%3)):null,
 profitLoss:i%5-i%3,currentDD:0,allTimeMaxDD:0,ddLimit:3,minSettled:5,
 riskStartedAt:0,points:[{t:0,p:0},{t:1,p:i%5-i%3}]
}));
const expected=formulas.reduce((p,f)=>({wins:p.wins+f.wins,losses:p.losses+f.losses,draws:p.draws+f.draws,pending:p.pending+f.pending}),{wins:0,losses:0,draws:0,pending:0});
const browser=await chromium.launch({headless:true});
try{
 for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.addInitScript(()=>sessionStorage.setItem('b46_ac_key','browser-qa-mock-only-not-real-credential'));
  await context.route('**/adaptive-control-api-test',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   ok:true,formulas,summary:{total:42,running:42,pausedManual:0,pausedAuto:0,autoEnabled:0},events:[],latestSignals:[],latestPickedAt:null
  })}));
  await context.route('**/ou-adaptive-research-data',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'B46_ADAPTIVE_OU_RESEARCH_V1',records:[]})}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const res=await page.goto(origin+'/adaptive-control-test',{waitUntil:'domcontentloaded',timeout:60000});
  assert(res?.ok(),'PAGE_HTTP_'+name);
  await page.locator('#b46-wld-totals-body .latest-item').first().waitFor({timeout:20000});
  const actual=await page.evaluate(()=>window.__B46_WLD_TOTALS_READONLY);
  const text=await page.locator('#b46-wld-totals').innerText();
  assert.equal(actual.formulaCount,42);
  for(const key of ['wins','losses','draws','pending'])assert.equal(actual[key],expected[key],name+'_'+key);
  assert.equal(actual.settled,expected.wins+expected.losses);
  assert.equal(actual.allResults,expected.wins+expected.losses+expected.pending);
  assert.equal(actual.winRate,100*expected.wins/(expected.wins+expected.losses));
  assert(text.includes('DRAW')&&text.includes('PENDING')&&text.includes('WIN RATE'));
  assert.equal(await page.locator('#rows tr').count(),42,'TABLE_STILL_42_FORMULAS_'+name);
  assert.equal(errors.length,0,'JS_ERRORS_'+name+' '+errors.join(';'));
  cases.push({name,totals:actual,errors,tableRows:42});
  await context.close();
 }
 console.log('B46_ADAPTIVE_CONTROL_WLD_BROWSER_QA_PASS '+JSON.stringify({url:origin+'/adaptive-control-test',cases}));
}catch(e){console.error('B46_ADAPTIVE_CONTROL_WLD_BROWSER_QA_FAIL '+String(e.stack||e));process.exitCode=1}
finally{await browser.close()}
