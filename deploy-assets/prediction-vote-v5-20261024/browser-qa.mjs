import assert from'node:assert/strict';
import{chromium}from'playwright-core';
import{readFile}from'node:fs/promises';
const stage=JSON.parse(await readFile('deploy-assets/prediction-vote-v5-20261024/audit/candidate.json','utf8'));
const host=stage.preview;assert(stage.ok);
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
let outcomes=[];
try{
 for(const d of[{name:'PC',width:1366,height:820},{name:'Mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:d.width,height:d.height}}),page=await context.newPage(),errors=[],reads=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/prediction-vote*',async route=>{
   const req=route.request(),post=req.method()==='POST';reads.push(req.method());
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(post?{ok:true,fixtureId:'1234',counts:[1,0,0],total:1,myPick:'1'}:{ok:true,fixtureId:'1234',counts:[0,0,0],total:0,myPick:null})});
  });
  const res=await page.goto(host+'/?v5candidateBrowser='+Date.now(),{waitUntil:'domcontentloaded',timeout:65000});
  assert.equal(res.status(),200);
  await page.waitForTimeout(13000);
  const before=await page.evaluate(()=>{
   const card=document.querySelector('[data-prediction-card]'),root=card?.querySelector('.b46-v5'),
    imgs=[...card?.querySelectorAll('.jersey-icon')||[]],
    buttons=[...card?.querySelectorAll('[data-vote]')||[]];
   return{present:!!root,innerText:root?.innerText.slice(0,1700),heading:root?.querySelector('.heading')?.innerText,
     buttons:buttons.length,shirts:imgs.map(i=>({src:i.getAttribute('src'),complete:i.complete,naturalWidth:i.naturalWidth})),
     fixtureId:card?.querySelector('.b46-v5 .prediction')?.dataset.fixtureId,
     dimensions:root?{width:root.getBoundingClientRect().width,height:root.getBoundingClientRect().height,display:getComputedStyle(root).display}:null,
     selectedScore:document.querySelector('[data-featured-score]')?.innerText,photo:false,ancestors:(()=>{let p=card;const arr=[];for(let i=0;i<6&&p;i++,p=p.parentElement)arr.push({tag:p.tagName,cls:p.className?.toString().slice(0,100),display:getComputedStyle(p).display,visibility:getComputedStyle(p).visibility,w:p.getBoundingClientRect().width,h:p.getBoundingClientRect().height});return arr})()};
  });
  assert(before.present,'V5_ROOT_ABSENT_'+d.name);
  assert(before.ancestors?.[0]?.h<720,'V5_CARD_TOO_TALL_'+d.name);assert.equal(before.buttons,3,'VOTE_BUTTONS_ABSENT_'+d.name);
  assert(before.shirts.length===2&&before.shirts.every(i=>i.complete&&i.naturalWidth>0),'ORIGINAL_3D_IMAGES_NOT_LOADED_'+d.name);
  assert(before.innerText.includes('Audience Prediction')&&before.innerText.includes('Awaiting verified last 5'),'REAL_DATA_DISCLOSURE_MISSING_'+d.name);
  assert(!before.innerText.includes('128 votes'),'FAKE_VOTES_DETECTED_'+d.name);
  console.log('B46_V5_BROWSER_BEFORE='+JSON.stringify({name:d.name,before}).slice(0,4500));
  if(before.ancestors?.every(a=>a.display!=='none'&&a.w>0))await page.locator('[data-prediction-card] [data-vote="0"]').click({force:true,timeout:8000});
  else throw Error('PREDICTION_HIDDEN_'+d.name);
  await page.waitForTimeout(800);
  const after=await page.evaluate(()=>({voteNote:document.querySelector('#voteNote')?.innerText,
     total:document.querySelector('#votesCount')?.innerText,selected:document.querySelector('[data-vote="0"]')?.getAttribute('aria-pressed')}));
  assert.equal(after.selected,'true');assert(after.total?.includes('1 vote'));assert(reads.includes('POST'),'NO_SUBMITTED_VOTE_'+d.name);
  assert.deepEqual(errors,[],'JS_ERRORS_'+d.name);
  outcomes.push({name:d.name,before,after,requests:reads,errors});
  await context.close();
 }
 console.log('B46_V5_BROWSER_QA='+JSON.stringify({ok:true,tests:outcomes}).slice(0,11000));
}catch(err){console.error('B46_V5_BROWSER_FAIL='+String(err.stack||err));process.exitCode=1}finally{await browser.close()}
