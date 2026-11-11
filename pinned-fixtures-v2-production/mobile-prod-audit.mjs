import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const active=d.deployments?.[0]?.versions?.[0]?.version_id;
console.log('ACTIVE_VERSION='+active);
const v=await api('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
const htmlMod=v.modules.find(m=>m.name==='assets/index.html');
const html=Buffer.from(htmlMod.content_base64,'base64').toString('utf8');
console.log('HTML_HAS_GREEN='+(html.includes('color:#31D4A3')?1:0));
console.log('HTML_HAS_DOC_CAPTURE='+(html.includes("document.addEventListener('click'")?1:0));
console.log('HTML_HAS_OLD_RESULT_CAPTURE='+(html.includes("r.addEventListener('click'")?1:0));
console.log('HTML_RUNTIME_COUNT='+(html.split('b46-pin-v2-mobile-runtime').length-1));

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();
await page.goto('https://ball46.com/?mobile-pin-audit='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('#b46gn-cards [data-b46gn-fixture]',{state:'visible',timeout:90000});
await page.waitForTimeout(1500);

const before=await page.evaluate(()=>{
 const stars=[...document.querySelectorAll('[data-b46-pin-mobile]')];
 const cards=[...document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]')];
 const first=stars[0], r=first?.getBoundingClientRect(), top=r?document.elementFromPoint(r.left+r.width/2,r.top+r.height/2):null;
 return {
   cards:cards.length,stars:stars.length,
   runtimeScripts:document.querySelectorAll('#b46-pin-v2-mobile-runtime').length,
   bound:document.documentElement.dataset.b46PinV2MobileBound||null,
   first:first?{id:first.dataset.b46PinMobile,text:first.textContent,connected:first.isConnected,z:getComputedStyle(first).zIndex,color:getComputedStyle(first).color,pe:getComputedStyle(first).pointerEvents,topSame:top===first||first.contains(top)}:null
 };
});
console.log('BROWSER_BEFORE='+JSON.stringify(before));

const samples=[];
for(let i=0;i<20;i++){
 await page.waitForTimeout(500);
 samples.push(await page.evaluate(()=>({
   t:performance.now(),
   cards:document.querySelectorAll('#b46gn-cards [data-b46gn-fixture]').length,
   stars:document.querySelectorAll('[data-b46-pin-mobile]').length,
   firstId:document.querySelector('[data-b46-pin-mobile]')?.dataset.b46PinMobile||null,
   firstText:document.querySelector('[data-b46-pin-mobile]')?.textContent||null
 })));
}
console.log('STAR_SAMPLES='+JSON.stringify(samples));

const firstStar=page.locator('[data-b46-pin-mobile]').first();
if(await firstStar.count()){
 const id=await firstStar.getAttribute('data-b46-pin-mobile');
 const pre=await page.evaluate(id=>({pinned:window.BALL46_PIN_V2?.isPinned?.(id)||false,ids:window.BALL46_PIN_V2?.getIds?.()||[]}),id);
 console.log('CLICK_PRE='+JSON.stringify({id,...pre}));
 let clickErr=null;
 try{await firstStar.tap({timeout:5000})}catch(e){clickErr=String(e)}
 await page.waitForTimeout(600);
 const post=await page.evaluate(id=>({pinned:window.BALL46_PIN_V2?.isPinned?.(id)||false,ids:window.BALL46_PIN_V2?.getIds?.()||[],detailHidden:document.querySelector('#b46gn-detail')?.getAttribute('aria-hidden')}),id);
 console.log('CLICK_POST='+JSON.stringify({clickErr,...post}));
}

await page.screenshot({path:'pinned-fixtures-v2-production/mobile-prod-audit.png',fullPage:false});
await browser.close();
