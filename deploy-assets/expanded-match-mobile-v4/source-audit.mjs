import puppeteer from 'puppeteer-core';
import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('source-proof',{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
for(const w of [390,1440]){
const page=await browser.newPage();
await page.setViewport({width:w,height:1100,isMobile:w<768});
const links=[];
page.on('response',r=>{const u=r.url();if(/\.(js|mjs|css)(\?|$)/i.test(u))links.push({url:u,status:r.status()})});
await page.goto('https://ball46.com/?view=live&introspection='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await new Promise(r=>setTimeout(r,8500));
if(w>=768){
const row=await page.$('article.match-row[data-match-id]');
if(row){await row.click();await new Promise(r=>setTimeout(r,7200));}
}
const info=await page.evaluate(()=>{
const section=document.querySelector('section.match-expanded[data-expanded-match]'),inner=section?.querySelector('.match-expanded-inner');
const pick=e=>e?{tag:e.tagName,cls:e.className,html:e.outerHTML.slice(0,24000),styles:{display:getComputedStyle(e).display,overflow:getComputedStyle(e).overflow},height:e.getBoundingClientRect().height}:null;
return {hasRows:document.querySelectorAll('article.match-row').length,hasExpanded:!!section,expanded:pick(section),children:[...inner?.children||[]].map(pick),
  scripts:[...document.scripts].map(s=>({src:s.src,size:s.textContent.length,inlineMatch:s.textContent.includes('match-expanded')})),
  links:[...document.querySelectorAll('link[rel=stylesheet]')].map(x=>x.href),
  allmatches:document.querySelector('[data-status-filter=all]')?.outerHTML.slice(0,700),
  bodyText:document.body.innerText.slice(0,550)};
});
console.log('LIVE_SOURCE_MAP',JSON.stringify({width:w,info,links}).slice(0,50000));
try{
 const payload=await page.evaluate(async()=>{
  const r=await fetch('/api/engine/board',{cache:'no-store'}),data=await r.json(),fixtures=data.fixtures||[],fixture=fixtures.find(f=>f?.fixtureId)||fixtures[0]||{};
  const keys=(o)=>o&&typeof o==='object'?Object.keys(o):[];
  return {status:r.status,count:fixtures.length,fixtureKeys:keys(fixture),fixtureSample:fixture,
   statsKeys:keys(fixture.stats),statisticsKeys:keys(fixture.statistics),
   goalsKeys:keys(fixture.goals),homeKeys:keys(fixture.home),
   resultKeys:keys(data)};
 });
 console.log('BALL46_BOARD_FIELDS',JSON.stringify({width:w,...payload}).slice(0,11000));
}catch(e){console.log('BALL46_BOARD_FIELDS_ERROR',String(e));}

writeFileSync('source-proof/map-'+w+'.json',JSON.stringify({info,links},null,2));
const checked=[];
for(const item of [...links,...info.scripts.filter(x=>x.src).map(x=>({url:x.src}))]){
 if(checked.includes(item.url))continue;checked.push(item.url);
 try{
 const txt=await page.evaluate(async u=>{const r=await fetch(u,{credentials:'same-origin'});if(!r.ok)return '';return r.text()},item.url);
 const matches=['match-expanded-inner','expand-flow-card','expand-full-market-card','b46x-live-detail','feature-facts','match-expanded'].map(k=>({key:k,at:txt.indexOf(k)})).filter(x=>x.at>=0);
 if(matches.length){const n=matches.filter(x=>x.key.includes('match-expanded')||x.key.includes('expand-flow')||x.key.includes('full-market')||x.key==='b46x-live-detail');
 console.log('SOURCE_SCRIPT_MATCH',JSON.stringify({w,url:item.url,len:txt.length,matches,snips:n.slice(0,5).map(x=>({key:x.key,before:txt.slice(Math.max(0,x.at-550),x.at),after:txt.slice(x.at,x.at+1150)}))}).slice(0,16000));
 const name=(new URL(item.url)).pathname.split('/').pop()||'script';writeFileSync('source-proof/'+w+'-'+name.replace(/[^-a-zA-Z0-9_.]/g,'_'),txt);
 }
 }catch(e){console.log('READ_SCRIPT_FAIL',item.url,String(e).slice(0,130));}
}
await page.close();
}
}finally{await browser.close()}