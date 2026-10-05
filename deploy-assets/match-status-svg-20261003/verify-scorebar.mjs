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
  await context.addInitScript(()=>localStorage.setItem('nomad343_dashboard_theme_v1','dark'));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('https://www.ball46.com/index.html?view=signal',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('[data-workspace-scorebar-slot] .workspace-scorebar-grid',{timeout:60000});
  if(patchedCss)await page.addStyleTag({content:patchedCss});
  await page.evaluate(()=>{document.getElementById('qa-status-probes')?.remove();const host=document.createElement('div');host.id='qa-status-probes';host.setAttribute('data-workspace-scorebar-slot','qa');host.style.cssText='position:absolute;left:-10000px;top:0;width:600px;pointer-events:none';host.innerHTML=['WIN','LOSS','DRAW','PENDING'].map((label,i)=>'<div class="workspace-scorebar-cell '+(i===3?'workspace-scorebar-pending':'workspace-scorebar-signal-result')+'"><span class="workspace-scorebar-meta"><i>'+label+'</i><b>1–0</b></span></div>').join('');document.body.appendChild(host)});
  const read=()=>page.evaluate(()=>{
   const slot=[...document.querySelectorAll('[data-workspace-scorebar-slot]')].find(e=>e.id!=='qa-status-probes'&&e.querySelector('.workspace-scorebar-grid')),grid=slot?.querySelector('.workspace-scorebar-grid');if(!slot||!grid)return null;
   const ss=getComputedStyle(slot),gs=getComputedStyle(grid),box=slot.getBoundingClientRect(),cols=innerWidth<=760?2:innerWidth<=1180?5:10;
   const cells=[...grid.children].map(e=>{const b=e.getBoundingClientRect();return{width:b.width,height:b.height,top:b.top,left:b.left,style:e.getAttribute('style')||''}});
   const probes=[...document.querySelectorAll('#qa-status-probes .workspace-scorebar-meta i')].map(e=>{const s=getComputedStyle(e);return{status:e.textContent,color:s.color,weight:s.fontWeight}});
   return{viewport:innerWidth,slotWidth:box.width,slotHeight:box.height,slotBackground:ss.backgroundColor,slotBorder:ss.borderTopWidth,slotShadow:ss.boxShadow,slotScrollWidth:slot.scrollWidth,slotClientWidth:slot.clientWidth,gridScrollWidth:grid.scrollWidth,gridClientWidth:grid.clientWidth,gridOverflowX:gs.overflowX,gridDisplay:gs.display,gridTemplateColumns:gs.gridTemplateColumns,gridAutoFlow:gs.gridAutoFlow,gridFlexWrap:gs.flexWrap,gridInlineStyle:grid.getAttribute('style')||'',cols,rows:new Set(cells.map(c=>Math.round(c.top))).size,cells,probes};
  });
  for(const [label,width,height] of [['Desktop',1440,1000],['Desktop-wide',2560,1100],['Tablet',1024,1000],['Mobile',390,844],['Mobile-small',320,740]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(300);const result=await read();assert(result,'SCOREBAR_MISSING:'+label);result.label=label;
   console.log('STYLE_CHECK='+JSON.stringify({label,viewport:result.viewport,display:result.gridDisplay,template:result.gridTemplateColumns,autoFlow:result.gridAutoFlow,flexWrap:result.gridFlexWrap,inline:result.gridInlineStyle,rows:result.rows,colsExpected:result.cols,gridClientWidth:result.gridClientWidth,gridScrollWidth:result.gridScrollWidth}));
   assert.equal(result.cells.length,10,'TEN_CARDS_REQUIRED:'+label);assert.equal(result.rows,Math.ceil(10/result.cols),'ROW_COUNT:'+label);assert(result.cells.every(c=>c.width>0),'ZERO_WIDTH_CARD:'+label);assert(result.gridScrollWidth<=result.gridClientWidth+1,'HORIZONTAL_GRID_OVERFLOW:'+label);assert(result.slotScrollWidth<=result.slotClientWidth+1,'HORIZONTAL_SLOT_OVERFLOW:'+label);assert(!['auto','scroll'].includes(result.gridOverflowX),'HORIZONTAL_RAIL_STILL_SCROLLABLE:'+label);assert.equal(result.slotBackground,'rgba(0, 0, 0, 0)','SCOREBAR_WRAPPER_NOT_TRANSPARENT:'+label);assert.equal(result.slotBorder,'0px','SCOREBAR_WRAPPER_BORDER_PRESENT:'+label);assert.equal(result.slotShadow,'none','SCOREBAR_WRAPPER_SHADOW_PRESENT:'+label);assert.deepEqual(result.probes.map(x=>x.status),['WIN','LOSS','DRAW','PENDING'],'STATUS_PROBES_MISSING:'+label);for(const p of result.probes){assert.equal(p.color,'rgb(255, 255, 255)','STATUS_NOT_WHITE:'+label+':'+p.status);assert(Number(p.weight)>=700,'STATUS_NOT_BOLD:'+label+':'+p.status)}
   await page.screenshot({path:directory+'/'+label+'.png',fullPage:true});report.viewports.push(result);console.log('UI_CHECK='+JSON.stringify({label,width,count:result.cells.length,cols:result.cols,rows:result.rows,gridOverflowX:result.gridOverflowX,cardWidth:Math.round(result.cells[0].width),slotHeight:Math.round(result.slotHeight),statusWhite:true}));
  }
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(250);const search=page.locator('[data-search]');assert.equal(await search.count(),1,'SEARCH_CONTROL_MISSING');const rowCount=await page.locator('[data-match-id]').count();if(rowCount){const first=page.locator('[data-match-id]').first(),id=await first.getAttribute('data-match-id');await first.click();assert((await page.locator('[data-match-id="'+id+'"]').getAttribute('class')).includes('active'),'MATCH_CLICK_BROKEN');await search.fill('zz-no-fixture-test');assert.equal(await page.locator('[data-match-id]').count(),0);await search.fill('');assert(await page.locator('[data-match-id]').count()>0,'SEARCH_RESTORE_BROKEN');report.navigation='PASS'}else report.navigation='NOT_APPLICABLE_NO_MATCH_ROWS';
  const before=await read();if(watchMs)await page.waitForTimeout(watchMs);const after=await read();assert.equal(after.cells.length,10,'CARD_COUNT_CHANGED_AFTER_WAIT');assert.equal(after.rows,before.rows,'CARD_ROWS_CHANGED_AFTER_WAIT');report.stability={beforeHeight:before.slotHeight,afterHeight:after.slotHeight,cardCount:after.cells.length,status:'PASS'};assert.equal(report.errors.length,0,'PAGE_ERRORS:'+report.errors.join('|'));writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));return report;
 }finally{await browser.close()}
}
