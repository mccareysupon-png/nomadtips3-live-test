import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('proof',{recursive:true});
const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const reports=[];
const delay=t=>new Promise(r=>setTimeout(r,t));
try{
 for(const [width,height,origin] of [[1440,930,'home'],[390,930,'home'],[1440,930,'statsurl'],[390,930,'statsurl']]){
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e).slice(0,240)));
  await page.setViewport({width,height,isMobile:width<768,deviceScaleFactor:1});
  try{
   const suffix=origin==='statsurl'?'?view=statistics':'?view=all';
   await page.goto('https://ball46.com/'+suffix+'&nav_league_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
   await page.waitForSelector('.workspace.singlepage',{timeout:40000});
   await delay(2500);
   const snap=async(stage)=>page.evaluate(stage=>{
    const candidates=[...document.querySelectorAll('button,a,[role=tab],[role=button],[data-view],[data-tab],[data-panel],summary')].filter(n=>/statistics|leagues|league|all matches|signal/i.test((n.textContent||'').slice(0,140)+' '+String(n.className||'')+' '+(n.getAttribute('aria-label')||''))).slice(0,110);
    const fmt=n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();let cover=null;if(r.width>0&&r.height>0){const x=Math.min(innerWidth-1,Math.max(1,r.left+r.width/2)),y=Math.min(innerHeight-1,Math.max(1,r.top+r.height/2));const z=document.elementFromPoint(x,y);cover=z===n||n.contains(z)?null:z?{tag:z.tagName,cls:String(z.className||'').slice(0,100),text:z.innerText?.slice(0,75)}:null;}
     return {tag:n.tagName,txt:n.innerText?.replace(/\s+/g,' ').trim().slice(0,125),id:n.id,cls:String(n.className||'').slice(0,175),attrs:Object.fromEntries([...n.attributes].filter(a=>/data-|aria-|href|onclick|role|tabindex/i.test(a.name)).slice(0,16).map(a=>[a.name,a.value.slice(0,145)])),css:{display:s.display,visibility:s.visibility,pointerEvents:s.pointerEvents,z:s.zIndex},rect:{w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)},cover};
    };
    const selectors=['[data-league-filter]','[data-league-filters]','.leagues-card','.statistics-stage','[data-statistics]','[data-view]','[data-page]','[data-workspace-nav]'];
    const sections=Object.fromEntries(selectors.map(k=>{const es=[...document.querySelectorAll(k)];return [k,{count:es.length,top:es.slice(0,3).map(fmt)}]}));
    const navText=[...document.querySelectorAll('header,nav,aside,.topbar,.toolbar')].filter(e=>/statistics|leagues/i.test(e.textContent)).slice(0,10).map(e=>({cls:String(e.className||''),txt:e.textContent.replace(/\s+/g,' ').slice(0,250)}));
    return {stage,href:location.href,body:document.body.innerText.slice(0,950),candidates:candidates.map(fmt),sections,navText,scroll:[scrollX,scrollY],docWidth:document.documentElement.scrollWidth};
   },stage);
   const before=await snap('initial');
   const click=async(regex)=>page.evaluate(needle=>{
    const re=new RegExp(needle,'i');
    const els=[...document.querySelectorAll('a,button,[role=tab],[role=button]')].filter(e=>re.test((e.innerText||'').trim())&&e.getBoundingClientRect().width>20);
    const ranked=els.sort((a,b)=>{const aText=(a.innerText||'').trim(),bText=(b.innerText||'').trim();const ex=aText.toLowerCase()===needle.toLowerCase()?0:1;const ey=bText.toLowerCase()===needle.toLowerCase()?0:1;return ex-ey;});
    const el=ranked[0];if(!el)return {found:false,candidates:els.length};
    const d={found:true,tag:el.tagName,text:el.innerText.slice(0,150),cls:String(el.className),href:el.getAttribute('href')};
    el.click();return d;
   },regex);
   const stat=origin==='home'?await click('statistics'):{skip:true};
   await delay(1100);
   const afterStats=await snap('after_statistics');
   const league=await click('leagues');
   await delay(1100);
   const afterLeague=await snap('after_leagues');
   await page.screenshot({path:'proof/'+width+'-'+origin+'.png',fullPage:false});
   const rec={width,origin,stat,league,before,afterStats,afterLeague,errors};
   console.log('B46_NAV_AUDIT',JSON.stringify(rec).slice(0,51000));reports.push(rec);
  }finally{await page.close();}
 }
 // Public JS text inspection for cross-navigation markup & event functions.
 for(const path of ['/', '/singlepage-workspace-343.js','/statistics-343.js','/league-flags-343.js']){
   const r=await fetch('https://ball46.com'+path+'?b46_nav_source='+Date.now()),s=await r.text();
   console.log('B46_NAV_SOURCE',JSON.stringify({path,status:r.status,len:s.length,terms:[...s.matchAll(/leagues|statistics|data-league-card|data-league-filter|data-workspace-nav|showStatistics|showLeagues|nav-tab|setView/g)].slice(0,22).map(x=>({pos:x.index,term:x[0],snippet:s.slice(Math.max(0,x.index-350),x.index+700)}))}).slice(0,31000));
 }
}finally{await browser.close();}
writeFileSync('proof/navigation-audit.json',JSON.stringify(reports,null,2));