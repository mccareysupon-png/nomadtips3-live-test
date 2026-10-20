import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const api='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/ball46-production/deployments?per_page=1';
const rr=await fetch(api,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}});const jj=await rr.json();assert(jj.success);console.log('ACTIVE_VERSION',jj.result.deployments[0].versions);
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);const b=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
try{
 for(const width of [1440,1024,390]){
  const p=await b.newPage();await p.setViewport({width,height:900,isMobile:width<768,deviceScaleFactor:1});
  await p.setCacheEnabled(false);await p.goto('https://ball46.com/?pc_gap_audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:75000});
  await new Promise(r=>setTimeout(r,6500));
  const state=await p.evaluate(()=>{
   const rect=e=>{if(!e)return null;const q=e.getBoundingClientRect(),s=getComputedStyle(e);return{tag:e.tagName,id:e.id,cls:String(e.className||'').slice(0,170),top:+q.top.toFixed(1),bottom:+q.bottom.toFixed(1),height:+q.height.toFixed(1),left:+q.left.toFixed(1),width:+q.width.toFixed(1),display:s.display,position:s.position,margin:s.margin,padding:s.padding,transform:s.transform,border:s.borderWidth,gridRowGap:s.rowGap,visibility:s.visibility};};
   const selectors=['html','body','body>.dash-shell','.dash-heading','.workspace.singlepage','.workspace-stage','.workspace-stable-head','.workspace-scorebar-slot','.b46-signal-ticker','#ball46-daily-performance','.b46-perf-grid','.live-stage-grid','.main-board','.workspace-panel','.workspace-toolbar-shared','.b46m-header','#b46m-teal-shell'];
   const nodes=Object.fromEntries(selectors.map(x=>[x,rect(document.querySelector(x))]));
   const perf=document.querySelector('#ball46-daily-performance');let e=perf,ancestors=[];while(e&&ancestors.length<12){ancestors.push(rect(e));e=e.parentElement;}
   const moving=[...document.querySelectorAll('.workspace-scorebar-slot,.b46-signal-ticker')].map(rect);
   const styleSheets=[...document.querySelectorAll('style')].filter(e=>/workspace|ticker|performance/i.test(e.id)).slice(-15).map(e=>e.id);
   return{width:innerWidth,theme:document.documentElement.dataset.theme,nodes,ancestors,moving,styleSheets,scrollY:scrollY};
  });
  console.log('GAP_GEOMETRY',width,JSON.stringify(state));
  await p.close();
 }
}finally{await b.close()}
console.log('PC_GAP_READ_ONLY_DONE');
