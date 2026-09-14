const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  const signalPayload={ok:true,signals:[{
    fixtureId:'stat-donut-test-1',id:'sig-stat-donut-1',createdAt:1000,market:'ft_ah',marketLabel:'Asian Handicap - Full Time',selection:'HOME',line:.25,odds:1.825,bookmaker:'Bet365',
    home:{name:'HOME FC'},away:{name:'AWAY FC'},league:{country:'TEST',name:'Statistics League'},mirrorMinute:73,mirrorScore:{home:2,away:0},
    liveStatistics:{attacks:{home:28,away:53},dangerousAttacks:{home:21,away:30},shotsOnTarget:{home:3,away:1},shotsOffTarget:{home:2,away:3},corners:{home:4,away:5},possession:{home:30,away:70}},
    entryStats:{attacks:{home:18,away:40},dangerousAttacks:{home:10,away:26},shotsOnTarget:{home:2,away:1},shotsOffTarget:{home:1,away:3},corners:{home:2,away:5},possession:{home:28,away:72}},
    entryMinute:50,entryScore:{home:1,away:0},evidence:{count:3,required:3,mode:'OR',side:'HOME',items:[]}
  }],mirror:{hubAgeMs:500}};
  const statsPayload={ok:true,total:1,win:1,loss:0,winRate:100,rows:[{
    id:'settled-1',fixtureId:'settled-fixture-1',createdAt:Date.now()-60000,market:'ft_ah',marketLabel:'Asian Handicap - Full Time',selection:'HOME',line:-.25,odds:1.91,bookmaker:'Bet365',entryMinute:55,entryScore:{home:1,away:0},finalScore:{home:2,away:0},result:'WIN',period:'FT',home:{name:'SETTLED HOME'},away:{name:'SETTLED AWAY'},league:{country:'TEST',name:'Results League'}
  }],markets:{ft_ah:{label:'Asian Handicap - Full Time',provider:'Bet365',period:'FT'}},byMarket:{ft_ah:1},settlementRevision:'TEST'};
  await page.route('**/api/engine/signals**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(signalPayload)}));
  await page.route('**/api/engine/statistics**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(statsPayload)}));
  await page.route('**/api/engine/history**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rows:[]})}));
  const base=process.env.TARGET_URL;
  await page.goto(base+'/statistics.html?donut='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('.statistics-live-mirror .active-signal-card',{timeout:30000});
  await page.locator('.statistics-live-mirror .active-signal-card').first().click();
  await page.waitForSelector('.statistics-live-mirror [data-entry-donut="343-entry-donut-v1"]',{timeout:10000});
  const result=await page.evaluate(()=>{
    const mirror=document.querySelector('.statistics-live-mirror');
    const entry=mirror.querySelector('[data-entry-donut="343-entry-donut-v1"]');
    const donuts=[...entry.querySelectorAll('.signal-entry-donut-item')];
    const liveRows=mirror.querySelectorAll('.signal-live-section .signal-mirror-row');
    const settled=document.querySelector('[data-stat-body] tr');
    const first=donuts[0];
    return {
      donutCount:donuts.length,
      liveBarCount:liveRows.length,
      liveDonutCount:mirror.querySelectorAll('.signal-live-section .signal-entry-donut-grid').length,
      values:donuts.map(x=>[...x.querySelectorAll('.signal-entry-donut-values span')].map(v=>v.textContent.trim())),
      homeColor:getComputedStyle(first.querySelector('.signal-entry-donut-values .home')).color,
      awayColor:getComputedStyle(first.querySelector('.signal-entry-donut-values .away')).color,
      expanded:mirror.querySelector('.active-signal-card')?.getAttribute('aria-expanded'),
      settledText:settled?.textContent||''
    };
  });
  if(result.donutCount!==6)throw Error('STAT_DONUT_COUNT '+JSON.stringify(result));
  if(result.liveBarCount!==6||result.liveDonutCount!==0)throw Error('STAT_LIVE_BARS_CHANGED '+JSON.stringify(result));
  if(result.values[0].join('/')!=='18/40'||result.values[5].join('/')!=='28%/72%')throw Error('STAT_VALUES_BAD '+JSON.stringify(result));
  if(result.homeColor!=='rgb(74, 195, 120)'||result.awayColor!=='rgb(207, 191, 81)')throw Error('STAT_TEAM_COLORS_BAD '+JSON.stringify(result));
  if(result.expanded!=='true')throw Error('STAT_EXPANDED_BAD '+JSON.stringify(result));
  if(!/SETTLED HOME/.test(result.settledText)||!/WIN/.test(result.settledText))throw Error('RESULTS_HISTORY_CHANGED '+JSON.stringify(result));
  console.log('STATISTICS ENTRY DONUT OK',result);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
