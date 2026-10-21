import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const sleep=t=>new Promise(r=>setTimeout(r,t));
try{
 for(const [width,mode] of [[390,'dark'],[390,'light'],[1440,'dark']]){
 const page=await browser.newPage(); const errs=[];
 page.on('pageerror',e=>errs.push(String(e).slice(0,160)));
 await page.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});
 await page.goto('https://ball46.com/?view=live&expanded_dom_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
 await page.evaluate(m=>document.documentElement.dataset.theme=m,mode);
 await sleep(5000);
 const snapshot=async(stage)=>page.evaluate((stage)=>{
 const sel=['[class*="expand"]','[class*="match-card"]','[class*="fixture"]','[class*="match-row"]','[class*="signal"]','[data-match-id]','[data-fixture-id]','[aria-expanded]','[class*="detail"]','[class*="event-flow"]','.right-rail','.featured-card'];
 const reduce=e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return{tag:e.tagName,cl:typeof e.className==='string'?e.className.slice(0,150):'',id:e.id,role:e.getAttribute('role'),dataFixture:e.getAttribute('data-fixture-id'),dataMatch:e.getAttribute('data-match-id'),aria:e.getAttribute('aria-expanded'),display:c.display,rect:{w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)},text:e.textContent?.trim().replace(/\s+/g,' ').slice(0,180)}};
 const matches=Object.fromEntries(sel.map(s=>[s,{count:document.querySelectorAll(s).length,top:[...document.querySelectorAll(s)].slice(0,4).map(reduce)}]));
 const clickables=[...document.querySelectorAll('button,[role=button],[onclick],summary')].filter(e=>/match|live|expand|fixture|goal|signal|corner|score/i.test((e.className||'')+' '+e.textContent?.slice(0,70))).slice(0,24).map(reduce);
 const data={stage,width:innerWidth,docWidth:document.documentElement.scrollWidth,body:document.body.innerText.slice(0,1800),matches,clickables,href:location.pathname,loading:!!document.querySelector('[class*="loader"]')};
 return data;
 },stage);
 const before=await snapshot('before');
 console.log('EXPANDED_AUDIT_BEFORE',JSON.stringify({width,mode,...before}).slice(0,44000));
 const attempts=await page.evaluate(()=>{
 const candidates=[...document.querySelectorAll('[data-match-id],[data-fixture-id],.match-row,.match-card,.match-list [role=button],.fixture-row,[class*=match-card]')];
 return candidates.filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>120&&r.height>18&&c.display!=='none'}).slice(0,7).map(e=>({tag:e.tagName,cl:String(e.className).slice(0,100),text:e.innerText?.slice(0,110)}));
 });
 console.log('EXPANDED_AUDIT_CANDIDATES',JSON.stringify({width,mode,attempts}));
 if(width>=768) {
  const row=await page.$('article.match-row[data-match-id]');
  if(row){
   await row.click();await sleep(6500);
   const expanded=await page.evaluate(()=>{
    const globalKeys=Object.keys(window).filter(k=>/match|fixture|flow|market|signal|live|data|ball|feed|snapshot|store/i.test(k)&&!k.startsWith('on')).slice(0,90);
    const row=document.querySelector('article.match-row[data-match-id]');
    const sib=row?.nextElementSibling;
    const par=row?.parentElement;
    const normalize=e=>{if(!e)return null;const rc=e.getBoundingClientRect(),st=getComputedStyle(e);return{tag:e.tagName,cl:String(e.className).slice(0,180),outer:e.outerHTML.slice(0,8500),text:e.innerText?.slice(0,1000),rect:{w:rc.width,h:rc.height},display:st.display}};
    const all=[...document.querySelectorAll('*')].filter(e=>{const cl=String(e.className||'');return /(expand|detail|event-flow|timeline|signal|match-stats|stat-block|market-card|corner|card|odds)/i.test(cl)}).filter(e=>e.getBoundingClientRect().width>200&&e.getBoundingClientRect().height>35).slice(0,30).map(e=>({tag:e.tagName,cl:String(e.className).slice(0,130),html:e.outerHTML.slice(0,1600)}));
    return {row:normalize(row),nextSibling:normalize(sib),parent:normalize(par),related:all,globalKeys,expandedInner:document.querySelector('.match-expanded .match-expanded-inner')?.outerHTML.slice(0,13500)};
   });
   console.log('EXPANDED_AUDIT_CLICKED',JSON.stringify({width,mode,...expanded}).slice(0,74000));
  }
 }
 await page.close();
 }
}finally{await browser.close()}