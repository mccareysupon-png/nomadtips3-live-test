import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'TEST_OWNER_BROWSER_AUTH_UNAVAILABLE');
const ownerKey=createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const url='https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev/adaptive-control-test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const captures='/tmp/ball46-dropdown-qa-20261125';
await mkdir(captures,{recursive:true});
const checked=[];
try {
 for(const size of [{label:'desktop',width:1440,height:900,mobile:false},{label:'mobile',width:390,height:844,mobile:true}]){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},
    isMobile:size.mobile,hasTouch:size.mobile});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e.message)));
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  assert(response?.ok(),'PAGE_HTTP_'+response?.status());
  await page.waitForSelector('#login:not([hidden])',{timeout:20000});
  await page.locator('#key').fill(ownerKey);
  await page.locator('#signin').click();
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:45000});
  const dropdown=page.locator('#search');
  assert.equal(await dropdown.evaluate(el=>el.tagName),'SELECT','SEARCH_INPUT_NOT_REPLACED');
  await page.waitForFunction(()=>document.querySelectorAll('#search option').length===43,null,{timeout:20000});
  const options=await dropdown.locator('option').evaluateAll(os=>os.map(o=>({label:o.textContent,value:o.value})));
  assert.equal(options.length,43,'42_FORMULAS_PLUS_ALL_OPTION_EXPECTED');
  assert.equal(options[0].value,'');
  assert(options[0].label.includes('42'));
  assert.equal(new Set(options.map(o=>o.value)).size,43,'DUPLICATE_FORMULA_OPTIONS');
  assert.equal(await dropdown.inputValue(),'','INITIAL_VIEW_NOT_ALL_FORMULAS');
  assert.equal(await page.locator('#rows tr').count(),42,'INITIAL_ALL_FORMULAS_MISSING');
  for(const id of ['A02','B02']){
   assert(options.some(o=>o.value===id),'MISSING_FORMULA_'+id);
   await dropdown.selectOption(id);
   await page.waitForFunction(formula=>document.querySelectorAll('#rows tr').length===1&&
     document.querySelector('#detailTitle')?.textContent?.startsWith(formula),id);
   assert((await page.locator('#rows tr').innerText()).includes(id),'WRONG_FORMULA_ROW_'+id);
   assert((await page.locator('#detailTitle').innerText()).includes(id),'DETAIL_CHART_NOT_SYNCHRONIZED_'+id);
  }
  await dropdown.selectOption('');
  await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length===42);
  assert.equal(await page.locator('#sort').inputValue(),'pl','SORT_STATE_CHANGED');
  assert.equal(await page.locator('#statusFilter').inputValue(),'all','STATUS_FILTER_CHANGED');
  const didOverflow=await dropdown.evaluate(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||r.width<80});
  assert.equal(didOverflow,false,'DROPDOWN_NOT_RESPONSIVE_'+size.label);
  assert.deepEqual(errors,[],'CLIENT_SCRIPT_ERRORS_'+size.label);
  await page.screenshot({path:captures+'/'+size.label+'.png',fullPage:true});
  checked.push({device:size.label,dropdown:true,options:options.length,allRows:42,individualA02:true,individualB02:true,detailsSynced:true,layoutWithinViewport:true,scriptErrors:0});
  await context.close();
 }
 console.log('B46_FORMULA_DROPDOWN_BROWSER_QA_PASS '+JSON.stringify({screens:checked,
  ownerActionsSent:0,formulaChanges:0,productionWrites:0,paidProviderCalls:0}));
}finally{await browser.close()}
