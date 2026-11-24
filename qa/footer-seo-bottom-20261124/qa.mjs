import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
const base='https://ball46-footer-seo-bottom-test-20261124.mccarey-supon.workers.dev';
let ready=false;
for(let i=0;i<30;i++){try{const r=await fetch(base+'/__footer_health');if(r.ok){const j=await r.json();assert(j.testOnly&&j.noApiCallsAdded);ready=true;break}}catch{}await new Promise(r=>setTimeout(r,1200))}
assert(ready,'WORKER_NOT_READY');
const b=await chromium.launch({headless:true});
try{
 for(const [label,options] of [['desktop',{viewport:{width:1440,height:900},serviceWorkers:'block'}],['mobile',{...devices['iPhone 13'],serviceWorkers:'block'}]]){
  const c=await b.newContext(options),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
  const response=await p.goto(base+'/?view=live&footerTest=20261124',{waitUntil:'domcontentloaded',timeout:80000});
  assert(response?.ok(),'PAGE_HTTP');
  await p.waitForFunction(()=>window.__b46FooterSeoBottomStats?.moved===true,null,{timeout:40000});
  const result=await p.evaluate(()=>{
    const f=document.getElementById('b46-site-footer-v1'),guide=document.querySelector('.b46-seo-guide[data-b46-seo-guide="home"]'),inner=f?.querySelector('.b46f-inner');
    const links=[...guide.querySelectorAll('nav[aria-label="Languages"] a')];
    const resources=[...guide.querySelectorAll('nav[aria-label="Football resources"] a')];
    return {guideCount:document.querySelectorAll('.b46-seo-guide[data-b46-seo-guide]').length,
      atEnd:guide===inner?.lastElementChild,insideFooter:f?.contains(guide),position:guide.getBoundingClientRect().top,footerBottom:f.getBoundingClientRect().bottom,
      languages:links.map(a=>({name:a.textContent,href:a.getAttribute('href'),hreflang:a.getAttribute('hreflang'),style:getComputedStyle(a).textDecorationLine,color:getComputedStyle(a).color})),
      resources:resources.map(a=>({href:a.getAttribute('href'),style:getComputedStyle(a).textDecorationLine})),
      horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2,
      summary:!!guide.querySelector('details>summary'),stats:window.__b46FooterSeoBottomStats};
  });
  console.log('B46_FOOTER_SEO_DEBUG '+JSON.stringify({label,...result}));
  assert(result.guideCount>=1,'MISSING_GUIDE');
  assert.equal(result.atEnd,true,'NOT_LAST_FOOTER_ITEM');
  assert.equal(result.insideFooter,true,'NOT_INSIDE_FOOTER');
  assert.equal(result.languages.length,13,'LANGUAGES_CHANGED');
  assert.equal(result.resources.length,3,'RESOURCES_CHANGED');
  assert(result.languages.every(a=>a.href&&a.hreflang&&a.style==='none'),'SEO_LANG_LINKS_OR_UNDERLINES');
  assert(result.resources.every(a=>a.href&&a.style==='none'),'RESOURCE_LINK_UNDERLINES');
  assert.equal(result.horizontalOverflow,false,'HORIZONTAL_OVERFLOW');
  assert.equal(result.summary,true,'GUIDE_LOST');
  assert.deepEqual(errors,[],'JS_ERRORS');
  console.log('B46_FOOTER_SEO_TEST_PASS '+JSON.stringify({label,...result}));
  await c.close();
 }
}finally{await b.close()}
