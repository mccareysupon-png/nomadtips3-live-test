import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
export async function unit(source){
 const start=source.indexOf('/* B46_SCOREBAR_RESPONSIVE_20261004');
 const end=source.indexOf("\ndocument.addEventListener('ball46:stable-chrome-ready'",start);
 assert(start>0&&end>start);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.QA_BROWSER_CHANNEL?{channel:process.env.QA_BROWSER_CHANNEL}:{})});
 const row=(status,result,id)=>({id:String(id),fixtureId:String(id),status,result,home:{name:'Alpha football club'},away:{name:'Beta athletic club'},league:{name:'Test league'},market:'1X2',marketLabel:'1X2 · Full Time',selection:'HOME',odds:2.05,entryScore:{home:0,away:0},finalScore:{home:1,away:0},mirrorScore:{home:0,away:0},entryMinute:15});
 const results=['WIN','HALF_WIN','LOSS','HALF_LOSS','DRAW','PUSH'];
 const settled=Array.from({length:12},(_,i)=>row('SETTLED',results[i%6],i));
 const waiting=Array.from({length:8},(_,i)=>row(i%2?'LIVE':'PENDING',null,100+i));
 const invalid=[row('UNKNOWN',null,200),row('LIVE','WIN',201),row('PENDING','DRAW',202),row('',null,203),{...row('PENDING',null,204),settledAt:1}];
 const report=[];
 try{
  for(const [label,width,available,done,pending,expected] of [
   ['desktop-full',2400,2200,settled,waiting,[6,4]],
   ['tablet-full',1100,1000,settled,waiting,[3,2]],
   ['mobile-full',740,600,settled,waiting,[2,1]],
   ['narrow-mobile',390,374,settled,waiting,[1,1]],
   ['short-waiting',2400,2200,settled,waiting.slice(0,1),[2,1]],
   ['only-settled',2400,2200,settled,[],[10,0]],
   ['only-live',740,600,[],waiting,[0,3]],
   ['empty',740,600,[],[],[0,0]],
   ['ambiguous-excluded',2400,2200,[row('SETTLED','UNKNOWN',205)],[...invalid],[0,0]]
  ]){
   const page=await browser.newPage();
   await page.setViewportSize({width,height:700});
   await page.setContent('<section data-workspace-scorebar-slot style="width:'+available+'px"></section>');
   await page.addStyleTag({content:'body{margin:0;width:'+available+'px}'});
   await page.addScriptTag({content:`const settledSignalRows=${JSON.stringify(done)},signalRows=${JSON.stringify(pending)};const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};const show=(v,d=0)=>Number(v).toFixed(d).replace(/\\.0+$/,'');${source.slice(start,end)}\nrenderWorkspaceScorebar();`});
   const observed=await page.evaluate(()=>{const slot=document.querySelector('[data-workspace-scorebar-slot]');return[Number(slot.dataset.scorebarSettled),Number(slot.dataset.scorebarWaiting)]});
   assert.deepEqual(observed,expected,label);assert.equal(await page.locator('.placeholder').count(),0);report.push({label,observed,status:'PASS'});
   if(label==='desktop-full'){
    const colors=await page.locator('.workspace-scorebar-cell').evaluateAll(c=>c.map(e=>({status:e.querySelector('i').textContent,border:getComputedStyle(e).borderColor,white:getComputedStyle(e.querySelector('i')).color})));
    assert(colors.every(c=>c.white==='rgb(255, 255, 255)'));assert(colors.some(c=>c.status==='PUSH'));assert(colors.some(c=>c.status==='DRAW'));assert(colors.some(c=>c.status.startsWith('LIVE')));
   }
   await page.close();
  }
  return report;
 }finally{await browser.close()}
}
