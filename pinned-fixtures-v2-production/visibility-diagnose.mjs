import {chromium,devices} from 'playwright';

async function inspect(label,opts,theme){
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext(opts);
  const page=await ctx.newPage();
  await page.addInitScript(t=>localStorage.setItem('theme',t),theme);
  await page.goto('https://ball46.com/?pinv2-visibility-diag='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  const isMobile=label.startsWith('MOBILE');
  const starSel=isMobile?'#b46gn-cards [data-b46gn-fixture] [data-b46-pin-mobile]':'[data-board-sections] .match-row[data-match-id] [data-b46-pin-v2]';
  await page.waitForSelector(starSel,{state:'attached',timeout:90000});
  await page.waitForTimeout(700);
  const data=await page.locator(starSel).first().evaluate(el=>{
    const cs=getComputedStyle(el),r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    const top=document.elementFromPoint(cx,cy);
    const chain=[];let n=top;for(let i=0;n&&i<6;i++,n=n.parentElement)chain.push({tag:n.tagName,cls:n.className,id:n.id});
    return {
      text:el.textContent,html:el.outerHTML,
      rect:{x:r.x,y:r.y,w:r.width,h:r.height},
      style:{display:cs.display,visibility:cs.visibility,opacity:cs.opacity,color:cs.color,background:cs.backgroundColor,zIndex:cs.zIndex,fontSize:cs.fontSize,position:cs.position,pointerEvents:cs.pointerEvents},
      topAtCenter:{tag:top?.tagName,cls:top?.className,id:top?.id,same:top===el,contains:el.contains(top),chain},
      theme:document.documentElement.getAttribute('data-theme'),
      bodyTheme:document.body.getAttribute('data-theme'),
      pinCount:document.querySelectorAll('[data-b46-pin-v2],[data-b46-pin-mobile]').length
    };
  });
  console.log(label+'_VISIBILITY='+JSON.stringify(data));
  await page.screenshot({path:'pinned-fixtures-v2-production/'+label.toLowerCase()+'-visibility.png',fullPage:false});
  await browser.close();
}

await inspect('DESKTOP_LIGHT',{viewport:{width:1440,height:1000}},'light');
await inspect('DESKTOP_DARK',{viewport:{width:1440,height:1000}},'dark');
await inspect('MOBILE_LIGHT',{...devices['Pixel 7']},'light');
await inspect('MOBILE_DARK',{...devices['Pixel 7']},'dark');
