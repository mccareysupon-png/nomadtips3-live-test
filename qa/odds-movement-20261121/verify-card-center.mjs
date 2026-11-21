import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {oddsMovementStyles,oddsMovementScript} from './odds-movement.mjs';
const BASE='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const sleep=n=>new Promise(r=>setTimeout(r,n));
let h;
for(let k=0;k<24;k++){
 try{const r=await fetch(BASE+'/_premium_health',{signal:AbortSignal.timeout(10000)});if(r.ok){const value=await r.json();if(value.oddsMovementStyle===oddsMovementStyles&&value.oddsMovementScript===oddsMovementScript){h=value;break}}}catch{}
 await sleep(1300);
}
assert(h?.scope==='TEST_ONLY_CSS','TEST_WORKER_NOT_RUNNING_EXPECTED_VERSION');
assert(h.oddsMovementScript.includes('DURATION=6000')&&!h.oddsMovementScript.includes('--b46-odds-arrow-y'),'JS_STILL_NUMBER_RELATIVE');
assert(h.oddsMovementStyle.includes('top:50%!important')&&!h.oddsMovementStyle.includes('--b46-odds-arrow-y'),'CSS_STILL_NUMBER_RELATIVE');
assert(h.oddsMovementStyle.includes('inset:0 -1px 0 0!important'),'3PX_SHEET_GAP_LOST');
assert(h.oddsMovementStyle.includes('b46-odds-card-pulse-6x'),'6_CYCLE_ANIMATION_LOST');
console.log('TEST_ONLY_SOURCE_PIN_PASS',JSON.stringify({scriptSize:h.oddsMovementScript.length,cssSize:h.oddsMovementStyle.length}));
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',serviceWorkers:'block'});
 const page=await ctx.newPage(),errors=[];
 await page.addInitScript(()=>localStorage.setItem('nomad343_dashboard_theme_v1','dark'));
 page.on('pageerror',e=>errors.push(e.message.slice(0,300)));
 await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 const resp=await page.goto(BASE+'/index.html?arrowCenterQA=1',{waitUntil:'domcontentloaded',timeout:80000});
 assert(resp.ok(),'TEST_SITE_HTTP_ERROR');
 await page.waitForFunction(()=>window.__b46OddsMovementStats?.ready===true,null,{timeout:30000});
 const proof=await page.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const f=document.createElement('div');
  f.className='match-row';
  f.setAttribute('data-match-id','B46_LOCAL_ARROW_CENTER_QA_20261121');
  f.style.cssText='position:fixed;left:-250px;top:-250px;width:180px;height:100px;pointer-events:none;';
  f.innerHTML='<div class="market-cell market-cell-1x2" title="QA · LOCAL ONLY"><div class="market-prices b46-v3-quotes" style="--b46-quote-count:3"><div class="market-quote b46-v3-quote" data-side="H"><i>H</i><strong data-b46-align="1x2-H" data-nomad-odds-raw="1.90">1.90</strong></div><div class="market-quote b46-v3-quote" data-side="D"><i>D</i><strong data-b46-align="1x2-D" data-nomad-odds-raw="1.80">1.80</strong></div><div class="market-quote b46-v3-quote" data-side="A"><i>A</i><strong data-b46-align="1x2-A" data-nomad-odds-raw="2.20">2.20</strong></div></div><small>QA</small></div>';
  document.body.append(f);
  const quote=f.querySelector('.b46-v3-quote'),number=quote.querySelector('strong'),middle=f.querySelectorAll('.b46-v3-quote')[1];
  const sample=()=>{
   const r=quote.getBoundingClientRect(),n=number.getBoundingClientRect(),m=middle.getBoundingClientRect(),p=getComputedStyle(quote,'::after'),bg=getComputedStyle(quote,'::before'),s=getComputedStyle(quote);
   return {direction:quote.getAttribute('data-b46-odds-move'),qWidth:r.width,qHeight:r.height,nWidth:n.width,offsetFromCardCenter:parseFloat(p.top)-r.height/2,offsetFromNumberCenter:r.top+parseFloat(p.top)-n.top-n.height/2,cardTop:parseFloat(p.top),arrow:p.content,arrowColor:p.color,priceColor:getComputedStyle(number).color,plateColor:bg.backgroundColor,plateRight:bg.right,plateRadius:bg.borderTopLeftRadius,quoteBackground:s.backgroundColor,quoteAnimation:s.animationName,quoteDuration:s.animationDuration,quoteCycles:s.animationIterationCount,quoteFilter:s.filter,rawGap:m.left-r.right,sheetGap:m.left-r.right-1};
  };
  try{
   await sleep(450);const idle=sample();
   if(!(idle.qHeight>10&&idle.qWidth>10))return {error:'QUOTE_GEOMETRY_ZERO',idle};
   const transition=async(raw)=>{
    number.setAttribute('data-nomad-odds-raw',raw);number.textContent=raw;
    await sleep(180);
    const started=sample();
    await sleep(2400);const mid=sample();
    await sleep(3000);const late=sample();
    await sleep(650);const stopped=sample();
    return {started,mid,late,stopped};
   };
   const up=await transition('1.97'),down=await transition('1.90');
   return {idle,up,down,stats:{...window.__b46OddsMovementStats}};
  }finally{f.remove()}
 });
 console.log('CENTERED_ARROW_LIVE_DOM_PROOF',JSON.stringify(proof));
 assert(!proof.error,'FIXTURE_GEOMETRY_FAILED');
 assert.equal(proof.idle.direction,null,'INIT_FLASH_UNEXPECTED');
 for(const [name,d,color,arrow,plateColor] of [
  ['UP',proof.up,'rgb(121, 225, 172)','↑','rgba(42, 163, 103, 0.2)'],
  ['DOWN',proof.down,'rgb(255, 159, 165)','↓','rgba(178, 65, 74, 0.19)']]){
  const s=d.started;
  assert.equal(s.direction,name.toLowerCase(),'FLASH_NOT_DETECTED_'+name);
  assert(s.arrow.includes(arrow),'ARROW_MISSING_'+name);
  assert.equal(s.priceColor,color,'PRICE_COLOR_WRONG_'+name);
  assert.equal(s.arrowColor,color,'ARROW_COLOR_WRONG_'+name);
  assert.equal(s.plateColor,plateColor,'CARD_PLATE_LOST_'+name);
  assert.equal(s.plateRight,'-1px','CARD_GUTTER_EXTENSION_CHANGED_'+name);
  assert.equal(s.plateRadius,'6px','CARD_RADIUS_CHANGED_'+name);
  assert(Math.abs(s.offsetFromCardCenter)<.65,'ARROW_NOT_AT_CARD_CENTER_'+name);
  assert.equal(s.quoteDuration,'1s','PULSE_NOT_ONE_SECOND_'+name);
  assert.equal(s.quoteCycles,'6','NOT_SIX_PULSES_'+name);
  assert.equal(s.quoteAnimation,'b46-odds-card-pulse-6x','PULSE_ANIMATION_MISSING_'+name);
  // The offscreen synthetic fixture tests positioning, not native grid gutters.
  // Verify real 1X2 quote gutters below against live table DOM.
  assert(Math.abs(s.qWidth-proof.idle.qWidth)<.7,'QUOTE_WIDTH_CHANGED_'+name);
  assert.equal(d.mid.direction,name.toLowerCase(),'PULSE_CLEARED_BEFORE_THREE_SECONDS_'+name);
  assert.equal(d.late.direction,name.toLowerCase(),'PULSE_CLEARED_BEFORE_SIX_SECONDS_'+name);
  assert.equal(d.stopped.direction,null,'PULSE_NOT_CLEARED_AFTER_SIX_SECONDS_'+name);
  console.log('ARROW_MIDDLE_OF_CARD_PASS '+name+' '+JSON.stringify({quoteHeight:s.qHeight,arrowTop:s.cardTop,offsetFromCardCenter:s.offsetFromCardCenter,offsetFromNumberCenter:s.offsetFromNumberCenter,visualGap:s.sheetGap,cycle:s.quoteCycles,duration:s.quoteDuration,activeNearSixSeconds:!!d.late.direction,clearedAfterSixSeconds:!d.stopped.direction}));
 }
 const nativeSpacing=await page.evaluate(()=>{
  const pairs=[];
  for(const cell of document.querySelectorAll('[data-match-id].match-row .market-cell')){
   if(cell.getBoundingClientRect().width<50)continue;
   const cards=[...cell.querySelectorAll('.b46-v3-quote')].filter(x=>x.getBoundingClientRect().width>5);
   for(let i=0;i<cards.length-1;i++){
    const a=cards[i].getBoundingClientRect(),b=cards[i+1].getBoundingClientRect();
    if(b.left>a.right)pairs.push({raw:b.left-a.right,visible:b.left-a.right-1,market:cell.className});
   }
   if(pairs.length>=3)break;
  }
  return pairs;
 });
 console.log('LIVE_NATIVE_QUOTE_GAP_PROOF',JSON.stringify(nativeSpacing));
 assert(nativeSpacing.some(x=>Math.abs(x.visible-3)<.65),'NATIVE_3PX_SEPARATION_NOT_FOUND');
 assert(proof.stats.ups>=1&&proof.stats.downs>=1,'ODDS_DIFFERENTIAL_DETECTOR_NOT_WORKING');
 assert.deepEqual(errors,[],'BROWSER_ERRORS_'+JSON.stringify(errors));
 console.log('BALL46_ODDS_ARROW_CENTRED_TEST_PASS');
 await ctx.close();
}finally{await browser.close()}
