import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
export async function verify({patchedCss,directory='audit/ui',watchMs=1500}={}){
 mkdirSync(directory,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.QA_BROWSER_CHANNEL?{channel:process.env.QA_BROWSER_CHANNEL}:{})});
 const report={viewports:[],errors:[],navigation:'PENDING'};
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{localStorage.setItem('nomad343_dashboard_theme_v1','dark')});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('https://www.ball46.com/index.html?view=signal',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid',{timeout:60000});
  if(patchedCss)await page.addStyleTag({content:patchedCss});
  await page.waitForTimeout(250);
  const read=()=>page.evaluate(()=>{
   const slot=document.querySelector('[data-workspace-scorebar-slot]'),grid=slot?.querySelector('.workspace-scorebar-grid');
   if(!slot||!grid)return null;
   const slotStyle=getComputedStyle(slot),gridStyle=getComputedStyle(grid),slotBox=slot.getBoundingClientRect(),cols=innerWidth<=760?2:innerWidth<=1180?5:10;
   const cells=[...grid.children].map(e=>{const b=e.getBoundingClientRect(),pill=e.querySelector('.workspace-scorebar-meta i'),p=pill?getComputedStyle(pill):null;return{width:b.width,height:b.height,top:b.top,right:b.right,bottom:b.bottom,status:pill?.textContent||'',pillColor:p?.color||'',pillWeight:p?.fontWeight||'',placeholder:e.classList.contains('placeholder'),text:e.textContent||''}});
   return{viewport:innerWidth,slotWidth:slotBox.width,slotHeight:slotBox.height,slotBackground:slotStyle.backgroundColor,slotBorder:slotStyle.borderTopWidth,slotShadow:slotStyle.boxShadow,slotScrollWidth:slot.scrollWidth,slotClientWidth:slot.clientWidth,gridScrollWidth:grid.scrollWidth,gridClientWidth:grid.clientWidth,gridOverflowX:gridStyle.overflowX,gridHeight:grid.getBoundingClientRect().height,cols,rows:new Set(cells.map(c=>Math.round(c.top))).size,cells};
  });
  for(const [label,width,height] of [['Desktop',1440,1000],['Desktop-wide',2560,1100],['Tablet',1024,1000],['Mobile',390,844],['Mobile-small',320,740]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(250);
   const result=await read();assert(result,'SCOREBAR_MISSING:'+label);result.label=label;
   assert.equal(result.cells.length,10,'TEN_CARDS_REQUIRED:'+label);
   assert.equal(result.rows,Math.ceil(10/result.cols),'ROW_COUNT:'+label);
   assert(result.cells.every(c=>c.width>0),'ZERO_WIDTH_CARD:'+label);
   assert(result.gridScrollWidth<=result.gridClientWidth+1,'HORIZONTAL_GRID_OVERFLOW:'+label);
   assert(result.slotScrollWidth<=result.slotClientWidth+1,'HORIZONTAL_SLOT_OVERFLOW:'+label);
   assert(!['auto','scroll'].includes(result.gridOverflowX),'HORIZONTAL_RAIL_STILL_SCROLLABLE:'+label);
   assert.equal(result.slotBackground,'rgba(0, 0, 0, 0)','SCOREBAR_WRAPPER_NOT_TRANSPARENT:'+label);
   assert.equal(result.slotBorder,'0px','SCOREBAR_WRAPPER_BORDER_PRESENT:'+label);
   assert.equal(result.slotShadow,'none','SCOREBAR_WRAPPER_SHADOW_PRESENT:'+label);
   const populated=result.cells.filter(c=>!c.placeholder&&c.status);
   assert(populated.length>0,'NO_POPULATED_SCOREBAR_CARDS:'+label);
   for(const cell of populated){assert.equal(cell.pillColor,'rgb(255, 255, 255)','STATUS_NOT_WHITE:'+label+':'+cell.status);assert(Number(cell.pillWeight)>=700,'STATUS_NOT_BOLD:'+label+':'+cell.status)}
   await page.screenshot({path:directory+'/'+label+'.png',fullPage:true});report.viewports.push(result);
   console.log('UI_CHECK='+JSON.stringify({label,width,count:result.cells.length,cols:result.cols,rows:result.rows,gridOverflowX:result.gridOverflowX,cardWidth:Math.round(result.cells[0].width),slotHeight:Math.round(result.slotHeight)}));
  }
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(250);
  const first=page.locator('[data-match-id]').first();assert(await first.count(),'MATCH_ROWS_MISSING');const id=await first.getAttribute('data-match-id');
  await first.click();assert((await page.locator('[data-match-id="'+id+'"]').getAttribute('class')).includes('active'),'MATCH_CLICK_BROKEN');
  const search=page.locator('[data-search]');await search.fill('zz-no-fixture-test');assert.equal(await page.locator('[data-match-id]').count(),0);await search.fill('');assert(await page.locator('[data-match-id]').count()>0,'SEARCH_RESTORE_BROKEN');
  report.navigation='PASS';
  const before=await read();if(watchMs)await page.waitForTimeout(watchMs);const after=await read();
  assert.equal(after.cells.length,10,'CARD_COUNT_CHANGED_AFTER_WAIT');assert.equal(after.rows,before.rows,'CARD_ROWS_CHANGED_AFTER_WAIT');
  report.stability={beforeHeight:before.slotHeight,afterHeight:after.slotHeight,cardCount:after.cells.length,status:'PASS'};
  assert.equal(report.errors.length,0,'PAGE_ERRORS:'+report.errors.join('|'));
  writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));return report;
 }finally{await browser.close()}
}
