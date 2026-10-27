// Read-only visual CSS theme parity probe against current https://www.ball46.com.
// No Cloudflare writes, no user credentials, no account data; browser only visits public homepage.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const base='https://www.ball46.com/';
const selectors=[
'html','body','header','nav','main','aside','footer',
'.workspace','.site-shell','.main-content','.sidebar','.sidebar-panel','.topbar',
'.live-stage-grid','.right-rail','.featured-card','.feature-signal',
'.live-card','.match-card','.fixture-card','.match-row','.league-row',
'.statistics-card','.stats-card','.stat-card','.mobile-card','.mobile-menu',
'.mobile-nav','.bottom-nav','.bottom-menu','.hamburger-menu',
'.signal-card','.panel','.card','.b46gn-featured',
'[data-featured]','[data-featured-signal]','[data-fixture-id]','[data-theme]'
];
const devices=[{name:'pc',width:1440,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true},{name:'tablet',width:768,height:1024,mobile:true}];
await fs.mkdir('reports',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results={atUtc:new Date().toISOString(),origin:base,devices:[],note:'read-only computed browser styles; selectors may refer to different responsive element instances'};
try{
 for(const device of devices){
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.mobile,deviceScaleFactor:1,hasTouch:device.mobile});
  const page=await context.newPage();
  const consoleErrors=[];page.on('pageerror',e=>consoleErrors.push(String(e.message||'unknown').slice(0,100)));
  const start=Date.now();const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(5000);
  const audit=await page.evaluate((selectors)=>{
   const styleOf=el=>{
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return {tag:el.tagName.toLowerCase(),cls:String(el.className||'').slice(0,150),
     background:s.backgroundColor,backgroundImage:s.backgroundImage.slice(0,280),color:s.color,borderColor:s.borderTopColor,
     boxShadow:s.boxShadow.slice(0,190),display:s.display,visibility:s.visibility,opacity:s.opacity,
     rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]};
   };
   const explicit={};
   for(const sel of selectors){let nodes=[];try{nodes=[...document.querySelectorAll(sel)]}catch{}
    const valid=nodes.filter(el=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>20&&r.height>8&&s.display!=='none'&&s.visibility!=='hidden'});
    if(valid.length)explicit[sel]={count:valid.length,examples:valid.slice(0,3).map(styleOf)};
   }
   const cards=[];
   const candidates=[...document.querySelectorAll('div,article,section,li,button,a')].filter(el=>{
    const r=el.getBoundingClientRect();const s=getComputedStyle(el);
    return r.width>100&&r.height>22&&r.y>-120&&r.y<1600&&s.display!=='none'
      &&(s.backgroundImage!=='none'||!['rgba(0, 0, 0, 0)','transparent'].includes(s.backgroundColor))
      &&String(el.className||'').length>2;
   });
   for(const el of candidates.slice(0,35))cards.push(styleOf(el));
   const vars={};
   const cs=getComputedStyle(document.documentElement);
   for(const p of [...cs])if(p.startsWith('--')&&/theme|primary|background|surface|card|home|away|accent|green|orange|graphite|teal|sidebar/i.test(p))vars[p]=cs.getPropertyValue(p).trim().slice(0,120);
   const stylesheets=[...document.styleSheets].map(s=>({href:s.href||'inline',disabled:s.disabled})).slice(0,35);
   const viewport=document.querySelector('meta[name="viewport"]')?.content||null;
   return {title:document.title,viewport,bodyClass:document.body.className,explicit,cards,vars,stylesheets};
  },selectors);
  results.devices.push({name:device.name,viewport:[device.width,device.height],http:response.status(),ms:Date.now()-start,consoleErrors:consoleErrors.slice(0,10),audit});
  await page.screenshot({path:'reports/theme-'+device.name+'.png',fullPage:false});
  await context.close();
 }
}finally{await browser.close();}
await fs.mkdir('reports',{recursive:true});
await fs.writeFile('reports/theme-computed.json',JSON.stringify(results,null,2));
const compact={atUtc:results.atUtc,devices:results.devices.map(d=>({device:d.name,http:d.http,ms:d.ms,bodyClass:d.audit.bodyClass,vars:d.audit.vars,
 computed:Object.fromEntries(Object.entries(d.audit.explicit).map(([k,v])=>[k,{count:v.count,examples:v.examples.map(x=>({cls:x.cls,background:x.background,backgroundImage:x.backgroundImage,color:x.color,borderColor:x.borderColor,shadow:x.boxShadow,rect:x.rect}))}])),
 cards:d.audit.cards.slice(0,16).map(x=>({cls:x.cls,background:x.background,backgroundImage:x.backgroundImage,color:x.color,rect:x.rect})),
 consoleErrors:d.consoleErrors}))};
console.log('BALL46_THEME_COMPUTED='+JSON.stringify(compact));
