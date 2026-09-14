const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.addInitScript(()=>{
    const realSetInterval=window.setInterval.bind(window);
    window.setInterval=(fn,ms,...args)=>realSetInterval(fn,ms===30000?700:ms,...args);
  });
  let signalCalls=0;
  const mk=(minute,attacks)=>({ok:true,signals:[{
    fixtureId:'stable-refresh-1',id:'sig-1',createdAt:1000,market:'ft_ah',marketLabel:'Asian Handicap',selection:'HOME',line:-0.25,odds:1.91,bookmaker:'Bet365',
    home:{name:'HOME FC'},away:{name:'AWAY FC'},league:{country:'TEST',name:'Signal League'},mirrorMinute:minute,mirrorScore:{home:1,away:0},
    liveStatistics:{attacks:{home:attacks,away:40},dangerousAttacks:{home:24,away:18},shotsOnTarget:{home:5,away:2},shotsOffTarget:{home:6,away:3},corners:{home:4,away:2},possession:{home:55,away:45}},
    entryStats:{attacks:{home:45,away:35},dangerousAttacks:{home:20,away:14},shotsOnTarget:{home:4,away:2},shotsOffTarget:{home:5,away:3},corners:{home:3,away:2},possession:{home:54,away:46}},
    entryMinute:51,entryScore:{home:1,away:0},evidence:{count:1,required:1,mode:'OR',side:'HOME',items:[]}
  }],mirror:{hubAgeMs:1000}});
  await page.route('**/api/engine/signals**',route=>{
    signalCalls++;
    const body=signalCalls===1?mk(55,50):mk(56,52);
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route('**/api/engine/history**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rows:[]})}));
  await page.goto(process.env.TARGET_URL+'/signal.html?stable='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('.active-signal-card',{timeout:30000});
  await page.locator('.active-signal-card').first().click();
  await page.waitForFunction(()=>document.querySelector('.active-signal-card')?.getAttribute('aria-expanded')==='true',{timeout:10000});
  await page.evaluate(()=>{
    const card=document.querySelector('.active-signal-card');
    window.__signalCardRef=card;
    window.__signalDetailRef=card.querySelector('[data-match-detail]');
    window.__signalFlowRef=card.querySelector('.nomad-event-flow-card');
    window.__signalTop=card.getBoundingClientRect().top;
  });
  await page.waitForFunction(()=>document.querySelector('.active-signal-score .live-minute-343')?.textContent.includes('56'),{timeout:10000});
  const result=await page.evaluate(()=>{
    const card=document.querySelector('.active-signal-card');
    return {
      sameCard:window.__signalCardRef===card,
      sameDetail:window.__signalDetailRef===card.querySelector('[data-match-detail]'),
      sameFlow:window.__signalFlowRef===card.querySelector('.nomad-event-flow-card'),
      expanded:card.getAttribute('aria-expanded'),
      minute:card.querySelector('.active-signal-score .live-minute-343')?.textContent,
      topDelta:Math.abs(card.getBoundingClientRect().top-window.__signalTop)
    };
  });
  if(!result.sameCard||!result.sameDetail||!result.sameFlow)throw Error('DOM_REPLACED '+JSON.stringify(result));
  if(result.expanded!=='true')throw Error('EXPANDED_LOST '+JSON.stringify(result));
  if(result.topDelta>1.5)throw Error('CARD_JUMP '+JSON.stringify(result));
  if(signalCalls<2)throw Error('REFRESH_NOT_OBSERVED '+JSON.stringify({...result,signalCalls}));
  console.log('SIGNAL STABLE REFRESH OK',{...result,signalCalls});
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
