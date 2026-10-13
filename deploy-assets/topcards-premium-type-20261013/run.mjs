import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,backend,literals,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='dashboard-v2-tune.css';
const OWNER='__B46_SCOREBAR_TUNE_CSS__';
const MARK='B46_TOPCARDS_PREMIUM_TYPE_20261013';
const CSS=`
/* B46_TOPCARDS_PREMIUM_TYPE_20261013: typography only for the scorebar cards below search. No card geometry/color/border/background/data changes. */
.workspace-scorebar-grid .workspace-scorebar-cell,
.workspace-scorebar-grid .workspace-scorebar-cell *{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
}
.workspace-scorebar-grid .workspace-scorebar-meta{
  font-size:8px!important;
  font-weight:700!important;
  letter-spacing:.045em!important;
  line-height:1.1!important;
}
.workspace-scorebar-grid .workspace-scorebar-meta i{
  font-size:8px!important;
  font-weight:800!important;
  letter-spacing:.06em!important;
  line-height:1.1!important;
}
.workspace-scorebar-grid .workspace-scorebar-meta b{
  font-size:12px!important;
  font-weight:750!important;
  letter-spacing:-.01em!important;
  line-height:1!important;
  font-variant-numeric:tabular-nums lining-nums!important;
}
.workspace-scorebar-grid .workspace-scorebar-cell.workspace-scorebar-signal-result .workspace-scorebar-match,
.workspace-scorebar-grid .workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-match,
.workspace-scorebar-grid .workspace-scorebar-match{
  font-size:9.5px!important;
  font-weight:650!important;
  letter-spacing:-.012em!important;
  line-height:1.2!important;
}
.workspace-scorebar-grid .workspace-scorebar-pick strong{
  font-size:8px!important;
  font-weight:600!important;
  letter-spacing:0!important;
  line-height:1.1!important;
}
.workspace-scorebar-grid .workspace-scorebar-pick em{
  font-size:8px!important;
  font-weight:700!important;
  letter-spacing:-.005em!important;
  line-height:1.1!important;
  font-variant-numeric:tabular-nums lining-nums!important;
}
.workspace-scorebar-grid .workspace-scorebar-details{
  font-size:7px!important;
  font-weight:600!important;
  letter-spacing:.02em!important;
  line-height:1!important;
}
.workspace-scorebar-grid .workspace-scorebar-details i{
  font-size:6.5px!important;
  font-weight:650!important;
  letter-spacing:.065em!important;
  line-height:1!important;
}
.workspace-scorebar-grid .workspace-scorebar-details b{
  font-size:7.5px!important;
  font-weight:700!important;
  letter-spacing:-.005em!important;
  line-height:1!important;
  font-variant-numeric:tabular-nums lining-nums!important;
}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Top scorebar typography only; everything else preserved.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let current=null,candidate=null;

async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version)return;
  if(candidate&&a!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

async function runtimeCheck(){
  const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(p=>{try{return readFileSync(p),true}catch{return false}});
  assert(exe,'NO_CHROME');
  const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:1000});
    await page.setCacheEnabled(false);
    await page.goto('https://ball46.com/index.html?topcardsPremiumType='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector('.workspace-scorebar-grid .workspace-scorebar-cell',{timeout:60000});
    const q=await page.evaluate(()=>{
      const cell=document.querySelector('.workspace-scorebar-grid .workspace-scorebar-cell');
      const match=cell?.querySelector('.workspace-scorebar-match');
      const meta=cell?.querySelector('.workspace-scorebar-meta');
      const score=meta?.querySelector('b');
      const cs=e=>e?getComputedStyle(e):null;
      return {
        ok:Boolean(cell&&meta),
        card:{height:cs(cell)?.height,padding:cs(cell)?.padding,borderRadius:cs(cell)?.borderRadius,backgroundColor:cs(cell)?.backgroundColor},
        meta:{font:cs(meta)?.fontFamily,size:cs(meta)?.fontSize,weight:cs(meta)?.fontWeight,spacing:cs(meta)?.letterSpacing},
        score:score?{size:cs(score)?.fontSize,weight:cs(score)?.fontWeight}:null,
        match:match?{font:cs(match)?.fontFamily,size:cs(match)?.fontSize,weight:cs(match)?.fontWeight,spacing:cs(match)?.letterSpacing}:null
      };
    });
    report.runtime=q;save();
    assert(q.ok,'TOPCARD_DOM_MISSING');
    assert(q.meta.font.includes('IBM Plex Sans'),'PREMIUM_FONT_NOT_ACTIVE');
    if(q.match){
      assert(q.match.font.includes('IBM Plex Sans'),'MATCH_FONT_NOT_ACTIVE');
      assert.equal(q.match.size,'9.5px','MATCH_SIZE_CHANGED');
    }
  }finally{await browser.close()}
}

try{
  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;
  report.backendBefore=current.restore.backend;
  const settingsBefore=await api('/scripts/'+script+'/settings');
  const settingsSha=sha(canonical(settingsBefore));
  const cronsBefore=await schedules();
  const before=await publicFile('/'+TARGET,'css');
  const beforeText=before.toString('utf8');
  const beforeSha=sha(before);
  report.cssBeforeSha=beforeSha;
  assert(beforeText.includes('.workspace-scorebar-grid'),'TOPCARD_GRID_SELECTOR_MISSING');
  assert(beforeText.includes('.workspace-scorebar-match'),'TOPCARD_MATCH_SELECTOR_MISSING');
  assert(!beforeText.includes(MARK),'PREMIUM_TYPE_ALREADY_LIVE_STOP');

  const beforeLiterals=literals(current.source);
  const owner=beforeLiterals.get(OWNER);
  assert(owner,'SCOREBAR_CSS_OWNER_MISSING');
  assert.equal(sha(Buffer.from(owner.value)),beforeSha,'OWNER_NOT_CURRENT_PUBLIC_CSS');

  const afterText=beforeText+'\n'+CSS+'\n';
  const after=Buffer.from(afterText);
  const afterSha=sha(after);
  report.cssAfterSha=afterSha;
  writeFileSync('audit/css-before.css',before);
  writeFileSync('audit/css-after.css',after);

  const patchedSource=current.source.slice(0,owner.start)+JSON.stringify(afterText)+current.source.slice(owner.end);
  const patchedLiterals=literals(patchedSource);
  assert.equal(sha(Buffer.from(patchedLiterals.get(OWNER).value)),afterSha,'PATCHED_OWNER_BAD');
  for(const [name,lit] of beforeLiterals){
    if(name===OWNER)continue;
    const n=patchedLiterals.get(name);
    assert(n,'UNRELATED_LITERAL_REMOVED:'+name);
    assert.equal(sha(Buffer.from(n.value)),sha(Buffer.from(lit.value)),'UNRELATED_LITERAL_CHANGED:'+name);
  }

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,patchedSource);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],beforeSha,'STAGED_TARGET_NOT_CURRENT');
  const protectedAssets={...staged.hashes}; delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),after);

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  await verifyRailBase(staged);
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_MOVED_BEFORE_DEPLOY');

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    let live=false;
    for(let i=0;i<40;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        const d=await publicFile('/'+TARGET,'css',directOrigin);
        if(sha(d)===afterSha&&d.toString('utf8').includes(MARK)){live=true;break}
      }catch{}
      await delay(1000);
    }
    assert(live,'PREMIUM_TYPE_NOT_DIRECT_LIVE');

    let publicOk=false;
    for(let i=0;i<40;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{
        const p=await publicFile('/'+TARGET,'css');
        if(sha(p)===afterSha&&p.toString('utf8').includes(MARK)){publicOk=true;break}
      }catch{}
      await delay(1200);
    }
    assert(publicOk,'PREMIUM_TYPE_NOT_PUBLIC_LIVE');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    const cv=await getVersion(candidate);
    const cm=cv.modules.find(m=>m.name===cv.main_module); assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    const finalLits=literals(finalSource);
    assert.equal(sha(Buffer.from(finalLits.get(OWNER).value)),afterSha,'FINAL_OWNER_BAD');
    for(const [name,lit] of beforeLiterals){
      if(name===OWNER)continue;
      const n=finalLits.get(name);assert(n,'FINAL_LITERAL_REMOVED:'+name);
      assert.equal(sha(Buffer.from(n.value)),sha(Buffer.from(lit.value)),'FINAL_UNRELATED_LITERAL_CHANGED:'+name);
    }

    await runtimeCheck();
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');
    report.finalVersion=candidate;
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();save();
    console.log('BALL46_TOPCARDS_PREMIUM_TYPE_SUCCESS '+JSON.stringify({base,candidate,cssSha:afterSha,runtime:report.runtime}));
  }catch(e){
    report.error=e.message;
    try{await rollback()}catch(rb){report.rollbackError=rb.message}
    save();throw e;
  }
}catch(e){
  report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1;
}
