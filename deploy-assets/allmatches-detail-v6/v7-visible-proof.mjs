import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('v7-visual',{recursive:true});
const b=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const proof=[];
try {
 for(const mode of ['dark','light']){
  const p=await b.newPage();
  await p.setViewport({width:1440,height:950,isMobile:false,deviceScaleFactor:1});
  await p.goto('https://ball46.com/?pc-featured-v7-readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await p.evaluate(x=>document.documentElement.dataset.theme=x,mode);
  await p.waitForSelector('.featured-card[data-featured]',{timeout:45000});
  await new Promise(r=>setTimeout(r,4500));
  const clicked=await p.evaluate(()=>{
   const candidate=[...document.querySelectorAll('article.match-row[data-match-id]')].find(x=>{
     const r=x.getBoundingClientRect();return r.width>300&&r.height>30;
   });
   if(candidate){candidate.click();return {fixture:candidate.dataset.matchId,selected:true};}
   return {selected:false};
  });
  await new Promise(r=>setTimeout(r,1200));
  const d=await p.evaluate(()=>{
   const card=document.querySelector('.right-rail > .featured-card[data-featured]'),facts=[...card.querySelectorAll('.feature-facts>div')];
   // Visual-only remove loading and blocking modal; never sent to Production.
   for(const sel of ['#b46-data-orbit-loading','#b46-cookie-consent','.b46-consent-modal']){
    const n=document.querySelector(sel);if(n)n.style.setProperty('display','none','important');
   }
   const rect=card.getBoundingClientRect();
   card.scrollIntoView({block:'center',behavior:'instant'});
   const middle=card.querySelector('.feature-facts'),outer=getComputedStyle(card);
   return {
    cardWidth:rect.width,factCount:facts.length,facts:facts.map(x=>({text:x.textContent.trim().slice(0,90),
      bg:getComputedStyle(x).backgroundImage,shadow:getComputedStyle(x).boxShadow,
      size:[x.getBoundingClientRect().width,x.getBoundingClientRect().height]})),
    theme:document.documentElement.dataset.theme,
    cardBackground:outer.backgroundImage,
    dataLeague:card.querySelector('[data-featured-league]')?.textContent?.trim(),
    groupBg:getComputedStyle(middle).backgroundImage
   };
  });
  assert.equal(d.factCount,4);
  assert(d.facts.every(x=>x.bg.includes('linear-gradient')&&x.shadow.includes('inset')&&x.size[1]>=59),'SUNKEN_VISUAL_MISSING');
  assert(d.cardBackground.includes('linear-gradient'),'PC_CARD_MISSING');
  await p.screenshot({path:'v7-visual/production-1440-'+mode+'-visible.png',fullPage:false});
  console.log('B46_V7_PC_VISIBLE_SCREENSHOT_PASS',JSON.stringify({mode,clicked,...d}));
  proof.push({mode,clicked,...d});
  await p.close();
 }
}finally{await b.close();}
writeFileSync('v7-visual/report.json',JSON.stringify(proof,null,2));