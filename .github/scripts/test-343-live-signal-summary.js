const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const viewport of [{width:1366,height:900,name:'desktop'},{width:390,height:844,name:'mobile'}]){
    const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
    const live={ok:true,fixtures:[{fixtureId:'fx-summary-1',boardState:'live',status:'live',statusCode:'67',minute:67,kickoffAt:Date.now()-3600000,league:{country:'TEST',name:'Summary League'},home:{id:'h1',name:'HOME FC'},away:{id:'a1',name:'AWAY FC'},goals:{home:1,away:0},statistics:{shotsOnTarget:{home:3,away:1},shotsOffTarget:{home:4,away:2},attacks:{home:58,away:42},dangerousAttacks:{home:34,away:20},possession:{home:55,away:45}},corners:{home:5,away:2},events:[]}],ageMs:200,stale:false};
    const signals={ok:true,signals:[{fixtureId:'fx-summary-1',id:'sig-1',createdAt:Date.now(),market:'ft_ah',marketLabel:'Asian Handicap · Full Time',selection:'HOME',line:-0.25,odds:1.94,bookmaker:'Pinnacle'}]};
    await page.route('**/api/live/snapshot**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(live)}));
    await page.route('**/api/engine/signals**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(signals)}));
    await page.route('**/api/engine/history**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rows:[]})}));
    const base=process.env.TARGET_URL;
    await page.goto(base+'/index.html?summary='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
    const card=page.locator('.match-card[data-match-id="fx-summary-1"]');
    await card.waitFor({state:'visible',timeout:30000});
    await page.waitForFunction(()=>document.querySelector('[data-field="signal-summary"]')?.textContent.includes('Pinnacle'),null,{timeout:10000});
    const before=await card.evaluate(el=>({expanded:el.getAttribute('aria-expanded'),detailsHidden:el.querySelector('.event-details')?.hidden,state:el.querySelector('[data-field="signal-text"]')?.textContent.trim(),summary:el.querySelector('[data-field="signal-summary"]')?.textContent.trim(),summaryHidden:el.querySelector('[data-field="signal-summary"]')?.hidden,whiteSpace:getComputedStyle(el.querySelector('[data-field="signal-summary"]')).whiteSpace}));
    if(before.expanded!=='false'||before.detailsHidden!==true)throw Error(viewport.name+' DEFAULT_CARD_NOT_COLLAPSED '+JSON.stringify(before));
    if(before.state.toUpperCase()!=='SIGNAL LOCKED')throw Error(viewport.name+' SIGNAL_STATE_BAD '+JSON.stringify(before));
    if(before.summary!=='HOME · Pinnacle 1.94 · AH -0.25'||before.summaryHidden)throw Error(viewport.name+' SIGNAL_SUMMARY_BAD '+JSON.stringify(before));
    if(viewport.name==='desktop'&&before.whiteSpace!=='nowrap')throw Error('DESKTOP_SUMMARY_WRAP_BAD '+JSON.stringify(before));
    if(viewport.name==='mobile'&&before.whiteSpace!=='normal')throw Error('MOBILE_SUMMARY_RESPONSIVE_BAD '+JSON.stringify(before));
    await card.locator('.scoreboard-default').click();
    await page.waitForFunction(()=>document.querySelector('.match-card[data-match-id="fx-summary-1"]')?.getAttribute('aria-expanded')==='true');
    const after=await card.evaluate(el=>({expanded:el.getAttribute('aria-expanded'),summary:el.querySelector('[data-field="signal-summary"]')?.textContent.trim()}));
    if(after.expanded!=='true'||after.summary!=='HOME · Pinnacle 1.94 · AH -0.25')throw Error(viewport.name+' EXPAND_REGRESSION '+JSON.stringify(after));
    console.log('LIVE SIGNAL SUMMARY OK',viewport.name,before,after);
    await page.close();
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
