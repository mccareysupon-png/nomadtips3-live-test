import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
const expected='4d1e8a2b-ca44-4cad-bd45-ffc22c74127e';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token);
const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(35000)});
const data=await res.json();assert(data.success,'CF_READ_FAILED');
const active=data.result.deployments[0].versions[0];
assert.equal(active.version_id,expected,'OTHER_PRODUCTION_VERSION_ACTIVE');
assert.equal(Number(active.percentage),100,'NOT_100_PERCENT_ACTIVE');
const html=await fetch('https://ball46.com/?ultrasoft_verification='+Date.now(),{signal:AbortSignal.timeout(45000)}).then(r=>r.text());
assert(html.includes('b46-mobile-ultrasoft-flow-v3-20261020'),'ULTRASOFT_INLINE_OVERLAY_NOT_PUBLIC');
assert(html.includes('b46-pc-seamless-drawer-20261020'),'PC_DRAWER_VERSION_LOST');
const remote=await fetch('https://ball46.com/expanded-match-343.js?ultrasoft_audit='+Date.now(),{signal:AbortSignal.timeout(45000)}).then(r=>r.text());
assert(remote.includes('function renderMobileFlow(f,history,signals){'),'MOBILE_RENDERER_UNEXPECTED');
assert(!remote.includes('B46_MOBILE_ULTRASOFT_EVENTFLOW_20261020'),'STATIC_ASSET_UNEXPECTEDLY_CHANGED');
mkdirSync('audit/verification',{recursive:true});
const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(executablePath);
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
const summary={activeVersion:active.version_id,htmlMarker:true,staticJSUnchanged:true,browsers:[]};
try{
 for(const width of [390,1440]){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',x=>errors.push(String(x).slice(0,200)));
  await page.setViewport({width,height:940,isMobile:width<767,deviceScaleFactor:1});
  await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?flow_postcheck='+Date.now(),{waitUntil:'domcontentloaded',timeout:80000});
  await new Promise(r=>setTimeout(r,6000));
  const before=await page.evaluate(()=>{
   const s=innerWidth<767?'.b46gn-card':'.workspace.singlepage article.match-row';
   return {cards:document.querySelectorAll(s).length,installed:!!window.__b46MobileFlowUltraSoftV3Installed,marker:!!document.querySelector('#b46-mobile-ultrasoft-flow-v3-20261020')};
  });
  assert(before.cards>0,'MATCH_CARDS_MISSING '+width);
  assert(before.installed&&before.marker,'ULTRASOFT_NOT_LOADED '+width);
  await page.evaluate(()=>{
   const points=Array.from({length:81},(_,i)=>[36+i*3.75,140+(i%2?67:-67)]);
   const other=Array.from({length:81},(_,i)=>[36+i*3.75,145+(i%2?-43:43)]);
   const path=arr=>arr.map(([x,y],i)=>(i?' L ':'M ')+x.toFixed(2)+' '+y.toFixed(2)).join('');
   const h=path(points),a=path(other);
   const root=document.createElement('div');root.id='b46-ultrasoft-qa-fixture';root.style.cssText='position:fixed;left:-10000px;top:0;width:350px';
   root.innerHTML='<section class="expand-card expand-flow-card"><div class="expand-card-head"><b>0′ → 80′</b></div><div class="expand-flow-chart b46-mf-chart"><svg viewBox="0 0 360 300"><defs></defs><path class="expand-flow-area" d="'+h+'"/><path class="expand-flow-area" d="'+a+'"/><path class="expand-flow-line home" d="'+h+'"/><path class="expand-flow-line away" d="'+a+'"/></svg></div></section>';
   document.body.appendChild(root);
  });
  await new Promise(r=>setTimeout(r,900));
  const result=await page.evaluate(()=>{
   const svg=document.querySelector('#b46-ultrasoft-qa-fixture svg'),home=svg?.querySelector('.expand-flow-line.home'),away=svg?.querySelector('.expand-flow-line.away');
   const areas=svg?.querySelectorAll('.expand-flow-area')||[];
   const svgPath=home?.getAttribute('d')||'';
   const lineCount=(svgPath.match(/ C /g)||[]).length;
   const answer={homeCurves:lineCount,awayCurves:(away?.getAttribute('d')?.match(/ C /g)||[]).length,halos:svg?.querySelectorAll('.b46-mf-ultrasoft-halo').length||0,homeStroke:home?getComputedStyle(home).strokeWidth:null,awayStroke:away?getComputedStyle(away).strokeWidth:null,areaSoftened:[...areas].every(a=>(a.getAttribute('d')||'').includes(' C ')),percentLabelsPreserved:!!document.querySelector('#b46-ultrasoft-qa-fixture .expand-card-head b'),rawDataAvailable:!!document.querySelector('.expand-flow-card')};
   document.querySelector('#b46-ultrasoft-qa-fixture')?.remove();return answer;
  });
  if(width<767){
   assert(result.homeCurves>=79&&result.awayCurves>=79,'ELEVEN_MINUTE_CURVES_NOT_RENDERED');
   assert.equal(result.halos,2,'MOBILE_GLOW_1X_PER_LINE_MISSING');
   assert.equal(result.homeStroke,'1.05px','HOME_STROKE_INCORRECT');
   assert.equal(result.awayStroke,'0.95px','AWAY_STROKE_INCORRECT');
   assert(result.areaSoftened,'MOBILE_SOFT_AREA_MISSING');
  }else{
   assert.equal(result.homeCurves,0,'PC_CURVE_MODIFIED');
   assert.equal(result.awayCurves,0,'PC_CURVE_MODIFIED');
   assert.equal(result.halos,0,'PC_GLOW_MODIFIED');
  }
  assert.equal(errors.length,0,'SCRIPT_RUNTIME_ERROR '+errors.join(';'));
  await page.screenshot({path:'audit/verification/'+width+'.png',fullPage:false});
  summary.browsers.push({width,...before,...result});
  await page.close();
 }
}finally{await browser.close();}
writeFileSync('audit/verification/report.json',JSON.stringify(summary,null,2));
console.log('BALL46_MOBILE_ULTRASOFT_READONLY_VERIFIED',JSON.stringify(summary));
