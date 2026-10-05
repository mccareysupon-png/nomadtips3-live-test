import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
export async function verify({patched,directory='audit/ui',watchMs=0}={}){
 mkdirSync(directory,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.QA_BROWSER_CHANNEL?{channel:process.env.QA_BROWSER_CHANNEL}:{})});
 const report={viewports:[],errors:[],navigation:'PENDING'};
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{localStorage.setItem('nomad343_dashboard_theme_v1','dark')});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  if(patched)await page.route('**/dashboard-v2-stage3.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:patched}));
  await page.goto('https://www.ball46.com/index.html?view=signal',{waitUntil:'domcontentloaded',timeout:60000});
  const slot=page.locator('[data-workspace-scorebar-slot]');
  await page.waitForFunction(()=>document.querySelector('[data-workspace-scorebar-slot] .workspace-scorebar-signal-result'),{},{timeout:60000});
  await page.waitForFunction(()=>window.NOMAD343_DASHBOARD_V2?.getSignals().length>0,{},{timeout:60000});
  await page.evaluate(()=>document.dispatchEvent(new Event('ball46:stable-chrome-ready')));
  const read=()=>page.evaluate(()=>{
   const slot=document.querySelector('[data-workspace-scorebar-slot]'),grid=slot.querySelector('.workspace-scorebar-grid');
   const style=getComputedStyle(slot),box=slot.getBoundingClientRect(),cols=innerWidth<=760?2:innerWidth<=1180?5:10;
   const cells=[...grid.children].map(e=>{const s=getComputedStyle(e),b=e.getBoundingClientRect(),pill=e.querySelector('.workspace-scorebar-meta i'),p=getComputedStyle(pill);return{width:b.width,height:b.height,top:b.top,right:b.right,bottom:b.bottom,status:pill.textContent,pillColor:p.color,pillWeight:p.fontWeight,pillBackground:p.backgroundColor,border:s.borderTopColor,shadow:s.boxShadow,background:s.backgroundColor,image:s.backgroundImage,before:getComputedStyle(e,'::before').content,after:getComputedStyle(e,'::after').content,text:e.textContent,children:[...e.children].map(c=>{const r=c.getBoundingClientRect(),cs=getComputedStyle(c);return{class:c.className,font:cs.fontSize,width:r.width,top:r.top,bottom:r.bottom,scrollHeight:c.scrollHeight,height:c.clientHeight,overflow:cs.overflow,whiteSpace:cs.whiteSpace}})}});
   return{viewport:innerWidth,slotWidth:box.width,slotHeight:box.height,background:style.backgroundColor,image:style.backgroundImage,border:style.borderTopWidth,shadow:style.boxShadow,overflow:style.overflow,scrollWidth:slot.scrollWidth,clientWidth:slot.clientWidth,gridScrollWidth:grid.scrollWidth,gridClientWidth:grid.clientWidth,ratio:slot.dataset.scorebarRatio,settled:Number(slot.dataset.scorebarSettled),waiting:Number(slot.dataset.scorebarWaiting),capacity:10,cols,rows:new Set(cells.map(c=>Math.round(c.top))).size,cells};
  });
  for(const [label,width,height] of [['Desktop',1440,1000],['Desktop-wide',2560,1100],['Tablet',1024,1000],['Mobile',390,844],['Mobile-small',320,740]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(400);
   const result=await read();result.label=label;
   assert(result.cells.length>0&&result.cells.length<=10,'CARD_COUNT:'+label);
   assert.equal(result.rows,Math.ceil(result.cells.length/result.cols),'ROW_COUNT:'+label);
   assert.equal(result.background,'rgba(0, 0, 0, 0)','WRAPPER_BACKGROUND');assert.equal(result.image,'none');assert.equal(result.border,'0px');assert.equal(result.shadow,'none');
   assert(result.scrollWidth<=result.clientWidth+1&&result.gridScrollWidth<=result.gridClientWidth+1,'HORIZONTAL_OVERFLOW:'+label);
   const colors={WIN:'rgb(34, 197, 94)',LOSS:'rgb(239, 68, 68)',LIVE:'rgb(56, 189, 248)',PENDING:'rgb(234, 179, 8)',DRAW:'rgb(203, 213, 225)',PUSH:'rgb(203, 213, 225)'};
   for(const cell of result.cells){
    assert(cell.width>0,'CARD_ZERO_WIDTH:'+label);assert.equal(cell.pillColor,'rgb(255, 255, 255)');assert(Number(cell.pillWeight)>=700);
    assert.equal(cell.border,colors[cell.status.split(' ')[0]],'STATUS_BORDER');assert.equal(cell.image,'none');assert.equal(cell.before,'none');assert.equal(cell.after,'none');assert(cell.shadow.includes('3px'),'BORDER_GLOW');
    const children=cell.children;for(const c of children){assert(c.bottom<=cell.bottom-8,'TEXT_OUTSIDE_CARD:'+label+':'+c.class);assert(c.top>=cell.top,'TEXT_OUTSIDE_TOP')}
    for(let i=1;i<children.length;i++)assert(children[i].top>=children[i-1].bottom-1,'TEXT_OVERLAP:'+label);
    const name=children.find(c=>c.class.includes('scorebar-match'));assert.equal(name.font,'12px');assert(name.scrollHeight<=name.height+1,'NAME_CLIPPED');
   }
   if(result.ratio==='PASS')assert.equal(result.settled,Math.round(result.cells.length*.6));
   await page.screenshot({path:directory+'/'+label+'.png',fullPage:true});report.viewports.push(result);
   console.log('UI_CHECK='+JSON.stringify({label,width,count:result.cells.length,settled:result.settled,waiting:result.waiting,cols:result.cols,rows:result.rows,ratio:result.ratio,cardWidth:result.cells[0].width,slotHeight:result.slotHeight}));
  }
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(300);
  const first=page.locator('[data-match-id]').first(),id=await first.getAttribute('data-match-id');
  await first.click();assert(await page.locator('[data-match-id="'+id+'"]').getAttribute('class').then(x=>x.includes('active')),'MATCH_CLICK_BROKEN');
  const search=page.locator('[data-search]');await search.fill('zz-no-fixture-test');assert.equal(await page.locator('[data-match-id]').count(),0);await search.fill('');assert(await page.locator('[data-match-id]').count()>0);
  report.navigation='PASS';
  const before=await read();await page.evaluate(()=>{const grid=document.querySelector('.workspace-scorebar-grid');window.__scorebarGrid=grid;window.__scorebarCells=[...grid.children];window.__scorebarShifts=[];window.__scorebarObserver=new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__scorebarShifts.push({value:e.value,sources:(e.sources||[]).map(s=>({class:s.node?.className,tag:s.node?.tagName,inRail:!!s.node?.closest?.('[data-workspace-scorebar-slot]'),previous:s.previousRect.toJSON(),current:s.currentRect.toJSON()}))})});window.__scorebarObserver.observe({type:'layout-shift',buffered:false})});
  await search.fill('zz-no-fixture-test');await search.fill('');
  assert(await page.evaluate(()=>window.__scorebarGrid===document.querySelector('.workspace-scorebar-grid')&&window.__scorebarCells.every((c,i)=>c===window.__scorebarGrid.children[i])),'UNCHANGED_CARDS_REPLACED');
  if(watchMs)await page.waitForTimeout(watchMs);
  const after=await read();assert.equal(after.slotHeight,before.slotHeight,'POLLING_HEIGHT_SHIFT');
  report.stability={wrapperHeight:after.slotHeight,unchangedNodeReuse:'PASS',shifts:await page.evaluate(()=>window.__scorebarShifts)};
  assert(report.stability.shifts.every(s=>s.sources.every(n=>!n.inRail)),'COMPONENT_LAYOUT_SHIFT');
  assert.equal(report.errors.length,0,'PAGE_ERRORS');
  writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));return report;
 }finally{await browser.close()}
}
