const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.addInitScript(()=>{
    const realSetInterval=window.setInterval.bind(window);
    window.setInterval=(fn,ms,...args)=>realSetInterval(fn,ms===30000?900:ms,...args);
  });
  let calls=0;
  const payload=minute=>({ok:true,signals:[{
    fixtureId:'donut-test-1',id:'sig-donut-1',createdAt:1000,market:'ft_ah',marketLabel:'Asian Handicap - Full Time',selection:'HOME',line:.25,odds:1.825,bookmaker:'Bet365',
    home:{name:'HOME FC'},away:{name:'AWAY FC'},league:{country:'TEST',name:'Signal League'},mirrorMinute:minute,mirrorScore:{home:2,away:0},
    liveStatistics:{attacks:{home:28,away:53},dangerousAttacks:{home:21,away:30},shotsOnTarget:{home:3,away:1},shotsOffTarget:{home:2,away:3},corners:{home:4,away:5},possession:{home:30,away:70}},
    entryStats:{attacks:{home:18,away:40},dangerousAttacks:{home:10,away:26},shotsOnTarget:{home:2,away:1},shotsOffTarget:{home:1,away:3},corners:{home:2,away:5},possession:{home:28,away:72}},
    entryMinute:50,entryScore:{home:1,away:0},evidence:{count:3,required:3,mode:'OR',side:'HOME',items:[]}
  }],mirror:{hubAgeMs:500}});
  await page.route('**/api/engine/signals**',route=>{calls++;route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload(calls===1?72:73))})});
  await page.route('**/api/engine/history**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rows:[]})}));
  const base=process.env.TARGET_URL;
  await page.goto(base+'/signal.html?donut='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('.active-signal-card',{timeout:30000});
  await page.locator('.active-signal-card').first().click();
  await page.waitForSelector('[data-entry-donut="343-entry-donut-v1"]',{timeout:10000});
  const card=page.locator('.active-signal-card').first();
  await card.evaluate(el=>window.__donutCardRef=el);
  const result=await page.evaluate(()=>{
    const entry=document.querySelector('[data-entry-donut="343-entry-donut-v1"]');
    const donuts=[...entry.querySelectorAll('.signal-entry-donut-item')];
    const liveRows=document.querySelectorAll('.signal-live-section .signal-mirror-row');
    const first=donuts[0],rings=[...entry.querySelectorAll('.signal-entry-donut-ring')];
    return {
      donutCount:donuts.length,
      liveBarCount:liveRows.length,
      liveDonutCount:document.querySelectorAll('.signal-live-section .signal-entry-donut-grid').length,
      labels:donuts.map(x=>x.querySelector('.signal-entry-donut-label')?.textContent.trim()),
      values:donuts.map(x=>[...x.querySelectorAll('.signal-entry-donut-values span')].map(v=>v.textContent.trim())),
      firstDeg:getComputedStyle(first.querySelector('.signal-entry-donut-ring')).getPropertyValue('--home-deg').trim(),
      maxRing:Math.max(...rings.map(r=>r.getBoundingClientRect().width)),
      homeColor:getComputedStyle(first.querySelector('.signal-entry-donut-values .home')).color,
      awayColor:getComputedStyle(first.querySelector('.signal-entry-donut-values .away')).color,
      expanded:document.querySelector('.active-signal-card')?.getAttribute('aria-expanded')
    };
  });
  if(result.donutCount!==6)throw Error('DONUT_COUNT '+JSON.stringify(result));
  if(result.liveBarCount!==6||result.liveDonutCount!==0)throw Error('LIVE_BARS_CHANGED '+JSON.stringify(result));
  if(result.labels.join('|')!=='ATTACKS|DANGEROUS|SOT|SHOT OFF|CORNERS|POSSESSION')throw Error('LABELS_BAD '+JSON.stringify(result));
  if(result.values[0].join('/')!=='18/40'||result.values[5].join('/')!=='28%/72%')throw Error('VALUES_BAD '+JSON.stringify(result));
  if(Math.abs(parseFloat(result.firstDeg)-111.72)>.2)throw Error('RATIO_BAD '+JSON.stringify(result));
  if(result.maxRing>55)throw Error('RING_TOO_LARGE '+JSON.stringify(result));
  if(result.homeColor!=='rgb(74, 195, 120)'||result.awayColor!=='rgb(207, 191, 81)')throw Error('TEAM_COLORS_BAD '+JSON.stringify(result));
  if(result.expanded!=='true')throw Error('EXPANDED_BAD '+JSON.stringify(result));
  await page.waitForFunction(()=>document.querySelector('.active-signal-score .live-minute-343')?.textContent.includes('73'),{timeout:8000});
  const stable=await page.evaluate(()=>window.__donutCardRef===document.querySelector('.active-signal-card'));
  if(!stable)throw Error('REFRESH_REPLACED_CARD');
  console.log('SIGNAL ENTRY DONUT OK',result,{refreshCalls:calls,stable});
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
