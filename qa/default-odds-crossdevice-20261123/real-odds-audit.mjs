import {chromium,devices} from 'playwright';
const base='https://ball46-default-odds-crossdevice-test-20261123.mccarey-supon.workers.dev/?view=live&liveAudit=20261123';
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ['desktop-dark','mobile-dark']){
  const ctx=await browser.newContext(mode.startsWith('mobile')?{...devices['iPhone 13'],serviceWorkers:'block'}:{viewport:{width:1440,height:900},serviceWorkers:'block'});
  const p=await ctx.newPage();const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('nomad343_dashboard_theme_v1','dark'));
  await p.goto(base+'&device='+mode,{waitUntil:'domcontentloaded',timeout:70000});
  const sample=()=>p.evaluate(()=>{
   const out=[];for(const el of document.querySelectorAll('.match-row[data-match-id] .market-cell strong[data-nomad-odds-raw]')){
    if(!el.closest('.match-row[data-b46-kind="live"]'))continue;
    const cell=el.closest('.market-cell');if(!cell?.getAttribute('title')?.includes('LIVE'))continue;
    out.push({fixture:el.closest('.match-row').dataset.matchId,book:cell.title,side:el.parentElement.querySelector('i')?.textContent.trim()||'',line:el.parentElement.querySelector('em')?.textContent.trim()||'',price:el.getAttribute('data-nomad-odds-raw'),shown:el.textContent.trim(),box:el.parentElement.className,visible:el.getBoundingClientRect().width>0});
   }
   return {quotes:out.slice(0,100),all:out.length,view:document.body.dataset.workspaceView,theme:document.documentElement.dataset.theme,testScripts:!!window.__b46NativeMobileOddsStats,desktop:window.__b46OddsMovementStats?{...window.__b46OddsMovementStats}:null,cross:window.__b46OddsCrossDeviceStats?{...window.__b46OddsCrossDeviceStats}:null,mobile:window.__b46NativeMobileOddsStats?{...window.__b46NativeMobileOddsStats}:null};
  });
  const first=await sample();
  await p.waitForTimeout(15000);
  const second=await sample();
  const before=new Map(first.quotes.map(x=>[x.fixture+'|'+x.book+'|'+x.side+'|'+x.line,x.price+'|'+x.shown]));
  const changes=second.quotes.filter(x=>before.has(x.fixture+'|'+x.book+'|'+x.side+'|'+x.line)&&before.get(x.fixture+'|'+x.book+'|'+x.side+'|'+x.line)!==x.price+'|'+x.shown);
  console.log('B46_REAL_QUOTES_DIAGNOSTIC '+JSON.stringify({mode,first:{count:first.all,stats:{desktop:first.desktop,cross:first.cross,mobile:first.mobile},examples:first.quotes.slice(0,4)},second:{count:second.all,stats:{desktop:second.desktop,cross:second.cross,mobile:second.mobile},examples:second.quotes.slice(0,4)},changes:changes.slice(0,10),errors:errs.slice(0,10)}));
  await ctx.close();
 }
}finally{await browser.close()}
