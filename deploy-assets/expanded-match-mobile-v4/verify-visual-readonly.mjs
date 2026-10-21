import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
mkdirSync('visual-proof',{recursive:true});
const report={checked:new Date().toISOString(),target:'https://ball46.com',productionChanges:0,cases:[]};
try{
for(const w of [320,390,430]){
const page=await browser.newPage();
await page.setViewport({width:w,height:950,deviceScaleFactor:1,isMobile:true});
await page.goto('https://ball46.com/?view=live&b46_expanded_readonly_v4='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('.workspace.singlepage',{timeout:40000});
await page.evaluate(()=>{
 const fixture=document.createElement('section');
 fixture.id='b46-visual-only-qa-fixture';
 fixture.innerHTML='<section class="league-block"><header class="league-head"><strong>QA League</strong></header>'+
 '<article class="match-row active" data-match-id="qa-v4-visible" aria-expanded="true"><div class="teams-cell"><b>QA Home</b><strong class="desktop-team-score">2</strong><b>QA Away</b><strong class="desktop-team-score">1</strong></div><span>LIVE · 62'+String.fromCharCode(39)+' HT 1–0</span></article>'+
 '<section class="match-expanded" data-expanded-match="qa-v4-visible"><div class="match-expanded-inner"><section class="expand-card b46qa-flow-standin" data-qa-flow>FLOW KEEP</section><section class="expand-card b46qa-market-standin" data-qa-market>MARKET KEEP</section></div></section></section>';
 document.querySelector('.workspace.singlepage').appendChild(fixture);
});
await new Promise(r=>setTimeout(r,2100));
const inspected=await page.evaluate(()=>{
 const fixture=document.getElementById('b46-visual-only-qa-fixture');
 const panel=fixture.querySelector('.b46x-live-detail');
 assertPlaceholder();
 function assertPlaceholder(){if(!panel)throw Error('V4_PANEL_NOT_ADDED');}
 panel.scrollIntoView({block:'start',behavior:'instant'});
 for(const n of document.querySelectorAll('body *')){
  if(n===fixture||fixture.contains(n))continue;
  const style=getComputedStyle(n),rect=n.getBoundingClientRect();
  if(style.position==='fixed' && rect.width>=innerWidth*.6 && rect.height>=150){
   n.style.setProperty('display','none','important');
  }
 }
 const rect=panel.getBoundingClientRect(),fact=[...panel.querySelectorAll('.b46x-fact')];
 return {width:innerWidth,docWidth:document.documentElement.scrollWidth,panel:{width:rect.width,height:rect.height,top:rect.top},factCount:fact.length,shadow:getComputedStyle(fact[0]).boxShadow,
  cards:[...fact].map(n=>({text:n.innerText,background:getComputedStyle(n).backgroundImage,rect:n.getBoundingClientRect().width})),
  mainCardUntouched:fixture.querySelector('.match-row')?.getAttribute('aria-expanded')==='true',
  flowText:fixture.querySelector('[data-qa-flow]')?.textContent,
  marketText:fixture.querySelector('[data-qa-market]')?.textContent};
});
if(inspected.factCount!==4||inspected.panel.width<240||inspected.docWidth>w+5||!inspected.shadow.includes('inset')||!inspected.mainCardUntouched||inspected.flowText!=='FLOW KEEP'||inspected.marketText!=='MARKET KEEP')throw Error('V4_VISUAL_QA_FAILED '+JSON.stringify(inspected));
await page.screenshot({path:'visual-proof/live-'+w+'.png',fullPage:false});
report.cases.push(inspected);
console.log('BALL46_V4_VISUAL_READONLY_PASS',JSON.stringify(inspected));
await page.close();
}
writeFileSync('visual-proof/report.json',JSON.stringify(report,null,2));
}finally{await browser.close()}