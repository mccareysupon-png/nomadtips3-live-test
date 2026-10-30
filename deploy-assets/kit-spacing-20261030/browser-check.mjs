import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const c=JSON.parse(await readFile('audit/candidate.json','utf8'));
const host=process.argv[2]||'https://'+c.candidate.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
await mkdir('audit',{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[],errors=[];
try{
 for(const width of [1440,1024,760,390,360]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push({width,message:e.message}));
  page.on('console',m=>{if(m.type()==='error')errors.push({width,message:m.text()});});
  await page.goto(host+'/?status=live',{waitUntil:'domcontentloaded',timeout:60000});
  const mobile=width<=760;
  const selector=mobile?'#b46gn-cards [data-b46gn-fixture] .b46-shared-kit':'article.match-row .b46-shared-kit';
  await page.locator(selector).first().waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(s=>[...document.querySelectorAll(s+' img')].filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete&&i.naturalWidth>0),selector,{timeout:30000});
  const rows=await page.evaluate(({mobile})=>{
   const hosts=[...document.querySelectorAll(mobile?'#b46gn-cards [data-b46gn-fixture]':'article.match-row')];
   return hosts.map(host=>{
    const kits=[...host.querySelectorAll('.b46-shared-kit')].filter(k=>k.getBoundingClientRect().width>0);
    if(kits.length!==2)return null;
    const rects=kits.map(k=>{const r=k.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};});
    const name=host.querySelector(mobile?'.b46gn-team-name':'.teams-cell>b');
    let textGap;
    if(mobile)textGap=name.getBoundingClientRect().left-rects[0].x-rects[0].width;
    else {const range=document.createRange();const node=[...name.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());if(node){range.selectNode(node);textGap=range.getBoundingClientRect().left-rects[0].x-rects[0].width;}}
    return {id:host.dataset.matchId||host.dataset.b46gnFixture,kits:rects,gap:rects[1].y-rects[0].bottom,textGap,imagesLoaded:kits.every(k=>k.querySelector('img')?.naturalWidth>0)};
   }).filter(Boolean);
  },{mobile});
  assert(rows.length>0,'NO_MATCH_ROWS:'+width);
  for(const row of rows){
   assert(row.gap>= (mobile?12:5.9),'SHIRT_OVERLAP:'+width+':'+JSON.stringify(row));
   assert(row.imagesLoaded);
   assert.equal(row.kits[0].width,mobile?24:20);
   assert.equal(row.kits[0].height,mobile?26:22);
   if(row.textGap!==undefined)assert(row.textGap>=7.9,'NAME_TOO_CLOSE:'+JSON.stringify(row));
  }
  await page.screenshot({path:'audit/spacing-'+width+'.png',fullPage:false});
  results.push({width,mobile,rowCount:rows.length,minGap:Math.min(...rows.map(r=>r.gap)),rows});
  await context.close();
 }
 assert.equal(errors.length,0,'BROWSER_ERRORS:'+JSON.stringify(errors));
 const proof={ok:true,candidate:c.candidate,host,desktop:true,mobile:true,noOverlap:true,consoleErrors:errors.length,errors,results,at:new Date().toISOString()};
 await writeFile(host.includes('workers.dev')?'browser-proof.json':'audit/production-browser-proof.json',JSON.stringify(proof,null,2));
 console.log(JSON.stringify({ok:proof.ok,host,viewports:results.map(({width,rowCount,minGap})=>({width,rowCount,minGap}))}));
}finally{await browser.close();}
