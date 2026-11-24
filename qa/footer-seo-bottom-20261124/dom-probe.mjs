import {chromium,devices} from 'playwright';
const b=await chromium.launch({headless:true});
for(const [name,opts] of [['desktop',{viewport:{width:1440,height:900}}],['mobile',{...devices['iPhone 13']}]]){
 const c=await b.newContext({...opts,serviceWorkers:'block'}),p=await c.newPage();
 const r=await p.goto('https://ball46.com/?view=live&footerAudit=20261124',{waitUntil:'domcontentloaded',timeout:70000});
 await p.waitForTimeout(8000);
 const out=await p.evaluate(()=>{
  const targets=[...document.querySelectorAll('body *')].filter(x=>x.children.length<3&&/Live Football Predictions, Scores & Odds Movement/i.test(x.textContent||'')).sort((a,b)=>a.textContent.length-b.textContent.length).slice(0,8);
  const summary=targets[0]||[...document.querySelectorAll('summary')].find(x=>/Odds Movement/.test(x.textContent||''));
  const footers=[...document.querySelectorAll('footer,[role="contentinfo"],.site-footer')].map(x=>({tag:x.tagName,cls:x.className,id:x.id,html:x.outerHTML.slice(0,1400),rect:x.getBoundingClientRect().toJSON()}));
  return {url:location.href,title:document.title,bodyText:document.body.innerText.slice(-1600),target:summary?{tag:summary.tagName,cls:summary.className,id:summary.id,outer:summary.outerHTML.slice(0,1800),parent:summary.parentElement?.outerHTML.slice(0,4100),grand:summary.parentElement?.parentElement?.outerHTML.slice(0,5100),rect:summary.getBoundingClientRect().toJSON()}:null,footers,count:document.querySelectorAll('a').length};
 });
 console.log('B46_FOOTER_DOM_PROBE '+JSON.stringify({name,http:r?.status(),...out}));
 await c.close();
}await b.close();