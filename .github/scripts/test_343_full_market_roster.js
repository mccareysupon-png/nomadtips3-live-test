const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  let detailCalls=0;
  page.on('request',r=>{if(r.url().includes('/api/full-market/fixture-odds'))detailCalls++});
  await page.goto(process.env.TARGET_URL+'/?books='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.NOMAD343_FULL_ODDS_BULK?.version==='343-full-odds-bulk-v2-fixed-10book-roster',{timeout:30000});
  const result=await page.evaluate(()=>{
    const card=document.createElement('article');
    card.className='match-card'; card.dataset.matchId='synthetic';
    card.innerHTML='<span class="team-name">HOME</span><span class="team-name">AWAY</span><div class="event-details"><div data-full-odds-main></div></div>';
    document.body.appendChild(card);
    const empty=slug=>({slug,name:slug,odds:{}});
    const fixture={fixtureId:'synthetic',providerOdds:{success:true,data:{fixture_id:'synthetic',bookmakers:[
      {slug:'bet365',name:'Bet 365',odds:{asian_handicap:{opening:{line:-0.5,home:1.91,away:1.95},inplay:{line:-0.25,home:1.88,away:2.01}}}},
      empty('pinnacle'),empty('crown'),empty('1xbet'),empty('12bet'),empty('interwetten'),empty('macauslot'),empty('18bet'),empty('vcbet'),empty('easybets')
    ]}}};
    window.NOMAD343_FULL_ODDS_BULK.renderCard(card,fixture);
    const market=card.querySelector('.fom-market');
    const books=[...market.querySelectorAll('.fom-book')];
    const p=market.querySelector('[data-book="pinnacle"]');
    const out={bookCount:books.length,names:books.map(x=>x.querySelector('header b')?.textContent.trim()),pinnaclePriceText:[...p.querySelectorAll('.fom-price')].map(x=>x.textContent),pinnacleRows:p.querySelectorAll('.fom-price-row').length,marketBadge:market.querySelector('.fom-market-head>span')?.textContent};
    card.remove();return out;
  });
  const expected=['Bet365','Pinnacle','Crown','1xBet','12Bet','Interwetten','Macau Slot','18Bet','VCBet','Easybets'];
  if(result.bookCount!==10||JSON.stringify(result.names)!==JSON.stringify(expected))throw Error('BOOK_ROSTER '+JSON.stringify(result));
  if(result.pinnacleRows<1||result.pinnaclePriceText.some(x=>x.trim()!==''))throw Error('BLANK_PRICE_CELLS '+JSON.stringify(result));
  if(result.marketBadge!=='10 BOOKS')throw Error('BAD_MARKET_BADGE '+JSON.stringify(result));
  if(detailCalls!==0)throw Error('VIEWER_DETAIL_CALLS='+detailCalls);
  console.log('FULL MARKET 10 BOOK ROSTER OK',result,{detailCalls});
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
