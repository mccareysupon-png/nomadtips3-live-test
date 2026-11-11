import { chromium, devices } from 'playwright';
import fs from 'node:fs';

async function inspect(label, contextOptions){
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext(contextOptions);
  const page=await ctx.newPage();
  const requests=[];
  page.on('request',r=>requests.push(new URL(r.url()).pathname));
  await page.goto('https://ball46.com/?pinv2-audit='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
  await page.waitForTimeout(2500);

  const out=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('[data-board-sections] .match-row[data-match-id]')];
    const mobile=[...document.querySelectorAll('[data-b46gn-fixture]')];
    const first=rows[0];
    const parent=first?.parentElement;
    const gp=parent?.parentElement;
    const describe=el=>{
      if(!el)return null;
      const r=el.getBoundingClientRect();
      const cs=getComputedStyle(el);
      return {
        tag:el.tagName,
        id:el.id||'',
        cls:String(el.className||''),
        childCount:el.children.length,
        display:cs.display,
        flexDirection:cs.flexDirection,
        gridTemplateColumns:cs.gridTemplateColumns,
        position:cs.position,
        rect:{x:r.x,y:r.y,w:r.width,h:r.height}
      };
    };
    return {
      theme:document.documentElement.getAttribute('data-theme'),
      rowCount:rows.length,
      mobileCount:mobile.length,
      firstRowId:first?.getAttribute('data-match-id')||null,
      firstRowHtml:first?.outerHTML.slice(0,5000)||null,
      firstParent:describe(parent),
      firstGrandparent:describe(gp),
      boardSections:describe(document.querySelector('[data-board-sections]')),
      uniqueParents:[...new Set(rows.map(r=>r.parentElement))].map(describe),
      sectionSample:[...document.querySelectorAll('[data-board-sections] > *')].slice(0,20).map(el=>({
        tag:el.tagName,
        cls:String(el.className||''),
        id:el.id||'',
        rows:el.querySelectorAll('.match-row[data-match-id]').length,
        text:(el.textContent||'').trim().slice(0,120)
      })),
      scripts:[...document.scripts].map(s=>s.src).filter(Boolean),
      styles:[...document.styleSheets].map(s=>s.href).filter(Boolean)
    };
  });

  // Inspect public script sources for the actual board/render/order ownership.
  const sourceHits=[];
  for(const src of out.scripts){
    try{
      const u=new URL(src);
      if(u.origin!==locationOrigin(out.scripts[0]||'https://ball46.com') && u.origin!=='https://ball46.com') continue;
    }catch{}
    try{
      const t=await page.evaluate(async src=>await (await fetch(src,{cache:'no-store'})).text(),src);
      if(!/data-match-id|match-row|board-sections/.test(t)) continue;
      const terms=['data-match-id','match-row','board-sections','appendChild','insertBefore','.sort(','sort(','render'];
      const snippets={};
      for(const term of terms){
        const i=t.indexOf(term);
        if(i>=0) snippets[term]=t.slice(Math.max(0,i-1200),Math.min(t.length,i+3600));
      }
      sourceHits.push({src,length:t.length,snippets});
    }catch{}
  }

  const result={label,out,sourceHits,fullMarketApiRequests:requests.filter(p=>p.startsWith('/api/full-market/')).length};
  fs.writeFileSync('pinned-fixtures-v2/audit-'+label+'.json',JSON.stringify(result,null,2));
  console.log(label+'_AUDIT='+JSON.stringify({
    rowCount:out.rowCount,
    mobileCount:out.mobileCount,
    firstRowId:out.firstRowId,
    parent:out.firstParent,
    grandparent:out.firstGrandparent,
    board:out.boardSections,
    sourceHitCount:sourceHits.length
  }));
  await browser.close();
}

function locationOrigin(src){try{return new URL(src).origin}catch{return ''}}

await inspect('desktop',{viewport:{width:1440,height:1000}});
await inspect('mobile',{...devices['Pixel 7']});
console.log('PINNED_FIXTURES_V2_AUDIT_PASS=1');
