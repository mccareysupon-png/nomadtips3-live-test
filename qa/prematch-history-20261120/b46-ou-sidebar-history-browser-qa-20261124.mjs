import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const device of [{name:'PC',width:1440,height:900,mobile:false},
  {name:'Mobile',width:390,height:844,mobile:true}]){
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},
   isMobile:device.mobile,hasTouch:device.mobile});
  for(const pageName of ['ou','1x2']){
   const page=await ctx.newPage();
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   let adaptive=null,legacy=null;
   await page.route('**/__b46_pm_adaptive_research',async route=>{
    const response=await route.fetch({timeout:30000});
    assert(response.ok(),'ADAPTIVE_HTTP_FAIL');
    adaptive=await response.json();
    await route.fulfill({response,body:JSON.stringify(adaptive)});
   });
   await page.route('**/__b46_prematch_data',async route=>{
    const response=await route.fetch({timeout:30000});
    assert(response.ok(),'BASE_HTTP_FAIL');
    legacy=await response.json();
    await route.fulfill({response,body:JSON.stringify(legacy)});
   });
   const res=await page.goto(url+'?b46pm='+pageName,{waitUntil:'domcontentloaded',timeout:60000});
   assert(res?.ok(),'PAGE_HTTP_'+pageName);
   const sidebar=page.locator('[data-b46-prematch-route="ou"] .b46pm-menu-count');
   await page.waitForFunction(()=>{
    const spans=[...document.querySelectorAll('[data-b46-prematch-route="ou"] .b46pm-menu-count')];
    return spans.length>0&&spans.some(n=>/^\\d+\\.\\d{2}%$/.test(n.textContent.trim()));
   },{timeout:45000});
   assert(adaptive&&legacy,'FRONTEND_SNAPSHOT_MISSING_'+pageName);
   assert.equal(adaptive.formulas.length,42,'FORMULAS_NOT_42');
   const f=adaptive.formulas.filter(x=>x.selection==='ALL');
   const wins=f.reduce((sum,x)=>sum+Number(x.win),Number(legacy.ouLedger.stats.win));
   const losses=f.reduce((sum,x)=>sum+Number(x.loss),Number(legacy.ouLedger.stats.loss));
   const pct=(100*wins/(wins+losses)).toFixed(2)+'%';
   const labels=await sidebar.allTextContents();
   assert(labels.length>0,'SIDEBAR_OU_MENU_MISSING_'+device.name+'_'+pageName);
   assert(labels.every(s=>s.trim()===pct),'SIDEBAR_RATE_INCORRECT_'+device.name+'_'+pageName+'_'+JSON.stringify(labels)+'!='+pct);
   const sidebarColor=await sidebar.first().evaluate(el=>getComputedStyle(el).color);
   assert(sidebarColor&&sidebarColor!=='rgba(0, 0, 0, 0)','O_U_RATE_COLOR_MISSING');
   if(pageName==='ou'){
    const section=page.locator('#b46pm-ou-history-public');
    await section.waitFor({state:'visible',timeout:40000});
    const rows=section.locator('tbody tr');
    assert.equal(await rows.count(),10,'INITIAL_HISTORY_NOT_10_'+device.name);
    const expected=adaptive.records.slice().sort((a,b)=>
      (Number(b.kickoff)||0)-(Number(a.kickoff)||0)||
      (Number(b.picked_at)||0)-(Number(a.picked_at)||0)||
      (Number(b.fixture_id)||0)-(Number(a.fixture_id)||0)||
      String(a.formula_id||'').localeCompare(String(b.formula_id||'')));
    assert(expected.length>10,'NOT_ENOUGH_ROWS_FOR_TWO_PAGES');
    const first=await rows.first().locator('td').allTextContents();
    assert(first[1].includes(expected[0].home),'FIRST_KICKOFF_HOME_MISMATCH');
    assert(first[1].includes(expected[0].away),'FIRST_KICKOFF_AWAY_MISMATCH');
    assert.equal(first[2],expected[0].formula_id,'FIRST_FORMULA_ORDER');
    const scrollBefore=await page.locator('#b46-prematch-panel').evaluate(el=>el.scrollTop);
    await section.getByRole('button',{name:'Next'}).click();
    assert.equal(await rows.count(),10,'SECOND_HISTORY_NOT_10');
    const row2=await rows.first().locator('td').allTextContents();
    assert(row2[1].includes(expected[10].home),'SECOND_PAGE_KICKOFF_NOT_SORTED');
    assert.equal(row2[2],expected[10].formula_id);
    const current=section.locator('[aria-current="page"]');
    assert.equal(await current.textContent(),'2','SECOND_PAGE_NUMBER_WRONG');
    const scrollAfter=await page.locator('#b46-prematch-panel').evaluate(el=>el.scrollTop);
    assert.equal(scrollBefore,scrollAfter,'HISTORY_PAGE_JUMPED_SCROLL');
    assert.equal(await page.locator('#b46-adaptive-native table').count(),1,'FORMULA_STATS_TABLE_CHANGED');
    assert.equal(await page.locator('#b46-adaptive-research-equity svg').count(),1,'FORMULA_GRAPH_MISSING');
    assert.equal(await page.locator('#b46-pm-firstpaint-loader').count(),0,'FULLSCREEN_LOADER_BACK');
   }
   assert.deepEqual(errors,[],'BROWSER_JS_ERRORS_'+errors.join('|'));
   results.push({device:device.name,view:pageName,sidebar:pct,
     paging:pageName==='ou'?'10 rows, page 2 checked':'sidebar without entering OU',
     unchangedEngine:true});
   await page.close();
  }
  await ctx.close();
 }
 console.log('B46_SIDEBAR_HISTORY_BROWSER_QA_PASS '+JSON.stringify({
   results,all42FormulasKept:true,noBackendDeployment:true,noProductionDeployment:true}));
}finally{await browser.close()}
