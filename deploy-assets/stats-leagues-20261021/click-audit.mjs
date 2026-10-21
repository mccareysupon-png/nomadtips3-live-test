import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('proof2',{recursive:true});
const b=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const reports=[];
const sleep=t=>new Promise(r=>setTimeout(r,t));
try{
 for(const [width,view] of [[1440,'statistics'],[390,'statistics'],[1440,'all'],[390,'all']]){
 const page=await b.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,160)));
 await page.setViewport({width,height:950,isMobile:width<768,deviceScaleFactor:1});
 try{
 await page.goto('https://ball46.com/?view='+view+'&b46statsnav2='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForSelector('.workspace.singlepage',{timeout:50000});
 await sleep(7500);
 const snapshot=async stage=>page.evaluate(stage=>{
  const pick=(selector)=>[...document.querySelectorAll(selector)].slice(0,7).map(el=>{
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return {tag:el.tagName,text:el.innerText?.replace(/\s+/g,' ').slice(0,100),class:String(el.className).slice(0,100),html:el.outerHTML.slice(0,900),active:el.classList.contains('active'),hidden:style.display==='none',x:rect.x,y:rect.y,w:rect.width,h:rect.height};
  });
  return {stage,href:location.href,bodyView:document.body.dataset.workspaceView,
    boards:document.querySelectorAll('article.match-row[data-match-id]').length,
    tabs:pick('.b46m-filterselect,.b46m-nav-toggle,.b46m-hamburger,.b46m-drawer button,.b46-mobile-workspace-nav button,.left-rail button.active'),
    leagues:pick('[data-league-filter]'),stats:pick('[data-statistics-tab], [data-statistics-view], [data-stats-view]'),
    leagueCard:pick('.leagues-card'),menu:pick('[class*="menu"],[class*="drawer"]'),
    overlay:pick('[role=dialog],[class*="consent"]'),
    scrollWidth:document.documentElement.scrollWidth,windowWidth:innerWidth};
 },stage);
 const initial=await snapshot('initial');
 let clicked={found:false};
 if(width>=768){
    try{
    const selector='[data-league-filter]:not([disabled])';
    const el=await page.$(selector);
    if(el){await el.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));await sleep(300);
       const pre=await page.evaluate(sel=>{const n=document.querySelector(sel),r=n.getBoundingClientRect(),p=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {button:n?.outerHTML.slice(0,500),elementAtPoint:p?.outerHTML.slice(0,440)}},selector);
       await el.click({delay:110,timeout:8000});clicked={found:true,pre};}
    }catch(e){clicked={failed:String(e).slice(0,450)};}
 }else{
    // open the existing top-left hamburger and inspect actual drawer options.
    const c=await page.evaluate(()=>{
      const el=[...document.querySelectorAll('button')].find(x=>{const r=x.getBoundingClientRect();return r.width>20&&r.x<90&&r.y<110&&r.y>=0});
      if(el){const desc={html:el.outerHTML.slice(0,550)};el.click();return desc;}return null;});
    clicked={hamburger:c};
 }
 await sleep(800);
 const after=await snapshot('after click');
 const r={width,view,initial,clicked,after,errors};
 reports.push(r);
 console.log('B46_STATS_LEAGUES_FOCUSED',JSON.stringify({width,view,
   initial:{bodyView:initial.bodyView,leagues:initial.leagues.slice(0,2),leagueCard:initial.leagueCard,tabs:initial.tabs.slice(0,7),overlay:initial.overlay.slice(0,2)},
   clicked,
   after:{bodyView:after.bodyView,leagues:after.leagues.slice(0,2),tabs:after.tabs.slice(0,25),menu:after.menu.slice(0,7),leagueCard:after.leagueCard,overlay:after.overlay.slice(0,2)},
   errors}).slice(0,26000));
 await page.screenshot({path:'proof2/'+width+'-'+view+'.png',fullPage:false});
 }finally{await page.close();}
 }
 for(const path of ['/singlepage-workspace-343.js','/dashboard-v2-stage3-featured-facts-20261013a.js','/']){
  const s=await (await fetch('https://ball46.com'+path+'?statnav_source2='+Date.now())).text();
  const t=['data-league-filter','leagueFilter','activeLeague','data-workspace-view','b46m-filterselect','b46m-drawer','statistics','addEventListener'];
  for(const needle of t){
    let i=0,c=0;while((i=s.indexOf(needle,i))>=0&&c<7){console.log('B46_NAV_SOURCE2',JSON.stringify({path,needle,pos:i,context:s.slice(Math.max(0,i-430),i+1000)}));i+=needle.length;c++;}
  }
 }
}finally{await b.close();}
writeFileSync('proof2/report.json',JSON.stringify(reports,null,2));