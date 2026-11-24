import {chromium} from 'playwright';
const url='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=ou';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
for(const v of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
 const page=await b.newPage({viewport:{width:v.width,height:v.height}});
 await page.route('**/__b46_prematch_data',async r=>{const f=await r.fetch({timeout:25000});await new Promise(ok=>setTimeout(ok,3500));await r.fulfill({response:f})});
 const inspect=async phase=>{
  const out=await page.evaluate(()=>{
   const rect=e=>{let q=e.getBoundingClientRect();return [Math.round(q.x),Math.round(q.y),Math.round(q.width),Math.round(q.height)]};
   const visible=e=>{let s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getBoundingClientRect().height>0};
   const tops=[...document.querySelectorAll('body > *,section.workspace.singlepage > *,section.workspace.singlepage > * > *')];
   const els=tops.filter(visible).slice(0,55).map(e=>({tag:e.tagName.toLowerCase(),id:e.id,cls:String(e.className||'').slice(0,110),box:rect(e),text:(e.textContent||'').trim().slice(0,65)}));
   const selections=['.workspace-stage','.workspace-view','.workspace-panel','#b46-prematch-panel',
     '#b46-data-orbit-loading','[data-workspace-heading]','section.workspace.singlepage',
     '.workspace-content','.workspace-body','.workspace-main','main'];
   const selected=selections.map(s=>[s,[...document.querySelectorAll(s)].slice(0,3).map(e=>({box:rect(e),visible:visible(e),parent:e.parentElement?.tagName+'.'+String(e.parentElement?.className).slice(0,75)}))]);
   return {html:document.documentElement.outerHTML.slice(0,500),boot:document.documentElement.dataset.b46PmBoot,bodyFlag:document.body.dataset.b46PrematchView,phase:document.readyState,els,selected}
  });
  console.log('FIRSTPAINT_DOM '+JSON.stringify({device:v.name,phase,...out}).slice(0,13000));
 };
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 await inspect('early');
 await page.waitForTimeout(1400);
 await inspect('during');
 await page.waitForTimeout(4000);
 await inspect('after');
 await page.close();
}
await b.close();
