import {chromium} from "playwright";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],calls=[];
page.on("pageerror",e=>errors.push(String(e.message).slice(0,380)));
page.on("console",m=>{if(m.type()==="error")errors.push("console:"+m.text().slice(0,300))});
page.on("response",r=>{const u=r.url();if(/api\/engine\/(statistics|health|ledger)|\.js(\?|$)/.test(u))calls.push({url:u.slice(0,180),status:r.status()});});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function capture(stage){
  const d=await page.evaluate(()=>{const panel=document.querySelector('[data-workspace-panel="statistics"]');
   const qs=s=>[...document.querySelectorAll(s)].slice(0,30).map(e=>({tag:e.tagName,text:e.textContent?.trim().slice(0,100),hidden:e.hidden,id:e.id,
    classes:String(e.className||"").slice(0,90),value:e.getAttribute("data-stat-market")}));
   const text=panel?.innerText||"";
   const visible=panel?getComputedStyle(panel).display!=="none"&&!panel.hidden:null;
   return {href:location.href,view:document.body?.dataset.workspaceView,
    panelFound:!!panel,panelHidden:panel?.hidden,panelVisible:visible,panelText:text.slice(0,4500),
    nav:qs('[data-workspace-view="statistics"]'),markets:qs("[data-stat-market]"),
    state:qs("[data-sp-feed-state]"),statRows:document.querySelectorAll("[data-stat-market-row],.stat-row,[data-stat-row]").length,
    title:document.title,
    scripts:[...document.scripts].map(s=>({src:s.src.split("/").slice(-1)[0],type:s.type})).slice(-15)};
  });
  console.log("BROWSER_STATE",JSON.stringify({stage,...d,errorTail:errors.slice(-8),callsTail:calls.slice(-15)}));
}
try{
 await page.goto("https://www.ball46.com/index.html?view=statistics",{waitUntil:"domcontentloaded",timeout:40000});
 await pause(4500);await capture("direct-statistics");
 const nav=page.locator('[data-workspace-view="statistics"]').first();
 if(await nav.count()) {await nav.click({timeout:9000});await pause(4500);await capture("clicked-statistics");}
 const market=page.locator('[data-stat-market="total"]').first();
 if(await market.count()){await market.click({timeout:6000});await pause(2000);await capture("clicked-total");}
 await page.reload({waitUntil:"domcontentloaded",timeout:30000});await pause(3500);await capture("after-reload");
}catch(e){console.log("BROWSER_EXEC_ERROR",String(e.stack||e).slice(0,1300));}
const variants=[
  {url:"https://ball46.com/index.html?view=statistics",label:"apex-statistics"},
  {url:"https://ball46.com/statistics.html",label:"apex-legacy-stats"},
  {url:"https://www.ball46.com/statistics.html",label:"www-legacy-stats"}
];
for(const v of variants){
  try { await page.goto(v.url,{waitUntil:"domcontentloaded",timeout:35000});await pause(2500);
    const d=await page.evaluate(()=>({url:location.href,title:document.title,
      view:document.body?.dataset.workspaceView,statNav:document.querySelectorAll("[data-stat-market]").length,
      panel:document.querySelector('[data-workspace-panel="statistics"]')?.innerText?.slice(0,500),
      body:document.body?.innerText?.slice(0,400)}));
    console.log("BROWSER_VARIANT",JSON.stringify({label:v.label,...d,errors:errors.slice(-3)}));
  }catch(e){console.log("BROWSER_VARIANT_ERROR",JSON.stringify({label:v.label,error:String(e.message)}));}
}
await browser.close();
