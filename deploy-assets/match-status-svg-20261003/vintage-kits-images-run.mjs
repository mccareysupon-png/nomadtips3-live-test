import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { inspect, activeVersion, api, script, origin, directOrigin, sha, canonical, publicFile, backend } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';

const deploy=process.env.DEPLOY_ENABLED==='true';
const OLD_VERSION='343-team-kits-v6-vintage24-live-row-20261004b';
const VERSION='343-team-kits-v7-vintage24-original-images-20261004c';
const OLD_LOADER=`<script src="team-kits-343.js?v=${OLD_VERSION}" defer></script>`;
const LOADER=`<script src="team-kits-343.js?v=${VERSION}" defer></script>`;
const SPRITE_PUBLIC='/vintage-kits-24-sprite.webp';
const SPRITE_TOKEN='vintage-original-24-q84-20261004';
const SPRITE_REPO='vintage-kits-24-sprite.webp';
const SPRITE_SHA='14f278d69a222a0e0d4892bfb0412aaf51b15e4697dd1c25842914ac08806515';
const auditDir='audit/vintage-kits-images';
mkdirSync(auditDir,{recursive:true});
const report={startedAt:new Date().toISOString(),run:process.env.GITHUB_RUN_ID||'local',commit:process.env.GITHUB_SHA||'local',deploy,scope:'Ball46 vintage team-kit image upgrade only: current live-row kit renderer + cleaned original 24-shirt sprite. Assets: index.html, team-kits-343.js, vintage-kits-24-sprite.webp. No worker logic, APIs, engine, signals, statistics, odds, Event Flow, flags, score markup, or other assets.'};
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const functionalSettings=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='annotations'));

function replaceOnce(source,needle,replacement,label){
  assert.equal(source.split(needle).length-1,1,label);
  return source.replace(needle,replacement);
}
function patchIndex(source){
  if(source.includes(LOADER))return source;
  assert(source.includes(OLD_LOADER),'OLD_IMAGE_KIT_LOADER_MISSING_STOP');
  return replaceOnce(source,OLD_LOADER,LOADER,'OLD_IMAGE_KIT_LOADER_NOT_UNIQUE');
}
function patchKitSource(source){
  assert(source.includes(`const VERSION='${OLD_VERSION}'`),'OLD_LIVE_ROW_KIT_VERSION_MISSING');
  assert(!source.includes(VERSION),'NEW_IMAGE_KIT_VERSION_ALREADY_PRESENT');
  let out=replaceOnce(source,`const VERSION='${OLD_VERSION}'`,`const VERSION='${VERSION}'`,'KIT_VERSION_TARGET_MOVED');
  const liveStyle='    .b46-home>.team-kit-icon.live-row-kit,.b46-away>.team-kit-icon.live-row-kit{display:inline-block;width:1.28em;height:1.28em;flex:none;vertical-align:-.22em;margin:0 .42em 0 0;pointer-events:none}\n';
  const imageStyle=liveStyle+
    `    .team-kit-icon{background-image:url("${SPRITE_PUBLIC}?v=${SPRITE_TOKEN}")!important;background-repeat:no-repeat!important;background-size:600% 400%!important;background-color:transparent!important;clip-path:none!important;border-radius:0!important;box-shadow:none!important;filter:none!important;opacity:1!important}\n`+
    '    .team-kit-icon::before,.team-kit-icon::after{display:none!important;content:none!important}\n'+
    '    .b46-home>.team-kit-icon.live-row-kit,.b46-away>.team-kit-icon.live-row-kit{width:1.42em;height:1.42em;vertical-align:-.27em;margin-right:.36em}\n';
  out=replaceOnce(out,liveStyle,imageStyle,'LIVE_ROW_IMAGE_STYLE_TARGET_MOVED');
  const iconNeedle="  el.style.setProperty('--kit-collar',kit.collar);\n  return el;";
  const iconReplacement="  el.style.setProperty('--kit-collar',kit.collar);\n  const col=index%6,row=Math.floor(index/6);\n  el.style.backgroundPosition=`${col*20}% ${row*(100/3)}%`;\n  el.dataset.kitAsset='original-image';\n  return el;";
  out=replaceOnce(out,iconNeedle,iconReplacement,'KIT_ICON_IMAGE_POSITION_TARGET_MOVED');
  assert.equal((out.match(/\{bg:/g)||[]).length,24,'KIT_VARIANT_COUNT_NOT_24');
  assert(out.includes("row.querySelector('.teams-cell')"),'LIVE_ROW_SELECTOR_LOST');
  assert(out.includes("homeName.insertBefore(homeIcon,homeName.firstChild)"),'HOME_LIVE_ROW_INSERT_LOST');
  assert(out.includes("awayName.insertBefore(awayIcon,awayName.firstChild)"),'AWAY_LIVE_ROW_INSERT_LOST');
  assert(out.includes(SPRITE_PUBLIC),'SPRITE_URL_MISSING');
  new Function(out);
  return out;
}

async function inspectLivePage(page){
  return page.evaluate(()=>{
    window.NOMAD_TEAM_KITS_343?.refresh?.();
    const rows=[...document.querySelectorAll('article.match-row')];
    const details=rows.map((row,i)=>{
      const cell=row.querySelector('.teams-cell');
      const home=cell?.querySelector(':scope > .b46-home');
      const away=cell?.querySelector(':scope > .b46-away');
      const homeKit=home?.querySelector(':scope > .team-kit-icon.live-row-kit');
      const awayKit=away?.querySelector(':scope > .team-kit-icon.live-row-kit');
      const hk=homeKit?.getBoundingClientRect(),ak=awayKit?.getBoundingClientRect();
      const cs=cell?getComputedStyle(cell):null,cr=cell?.getBoundingClientRect();
      const hcs=homeKit?getComputedStyle(homeKit):null,acs=awayKit?getComputedStyle(awayKit):null;
      return {i,matchId:row.dataset.matchId||null,home:(home?.textContent||'').trim(),away:(away?.textContent||'').trim(),homeKit:homeKit?.dataset.kit||null,awayKit:awayKit?.dataset.kit||null,homeAsset:homeKit?.dataset.kitAsset||null,awayAsset:awayKit?.dataset.kitAsset||null,homeFirst:Boolean(homeKit&&home?.firstChild===homeKit),awayFirst:Boolean(awayKit&&away?.firstChild===awayKit),homeVisible:Boolean(hk&&hk.width>0&&hk.height>0),awayVisible:Boolean(ak&&ak.width>0&&ak.height>0),homeBg:hcs?.backgroundImage||null,awayBg:acs?.backgroundImage||null,homePos:hcs?.backgroundPosition||null,awayPos:acs?.backgroundPosition||null,cellDisplay:cs?.display||null,gridTemplateColumns:cs?.gridTemplateColumns||null,cellHeight:cr?.height||null};
    });
    return {version:window.NOMAD_TEAM_KITS_343?.version||null,variantCount:window.NOMAD_TEAM_KITS_343?.variantCount||null,rowCount:rows.length,details};
  });
}

async function browserCheck({assetSource=null,spriteBytes=null,phase}){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const out=[];
  try{
    for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const errors=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('requestfailed',r=>{if(/vintage-kits-24-sprite|team-kits-343/i.test(r.url()))failed.push({url:r.url(),error:r.failure()?.errorText||'failed'});});
      if(spriteBytes){
        await page.route('**/vintage-kits-24-sprite.webp*',route=>route.fulfill({status:200,contentType:'image/webp',body:spriteBytes}));
      }
      await page.goto(`${origin}/index.html?vintageImageQA=${report.run}-${phase}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      if(assetSource){
        await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,OLD_VERSION,{timeout:45000});
        await page.waitForTimeout(4500);
        const before=await inspectLivePage(page);
        assert(before.rowCount>0,`PREVIEW_NO_REAL_ROWS:${vp.name}`);
        await page.addScriptTag({content:assetSource});
        await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:15000});
        await page.waitForTimeout(800);
        const after=await inspectLivePage(page);
        const bad=after.details.filter(x=>!x.homeFirst||!x.awayFirst||!x.homeVisible||!x.awayVisible||x.homeAsset!=='original-image'||x.awayAsset!=='original-image'||!/vintage-kits-24-sprite\.webp/.test(x.homeBg||'')||!/vintage-kits-24-sprite\.webp/.test(x.awayBg||''));
        assert.equal(after.variantCount,24,`PREVIEW_VARIANTS_WRONG:${vp.name}`);
        assert.equal(bad.length,0,`PREVIEW_IMAGE_KIT_BAD:${vp.name}:${JSON.stringify(bad.slice(0,2))}`);
        const n=Math.min(before.details.length,after.details.length,8);
        for(let i=0;i<n;i++){
          assert.equal(after.details[i].cellDisplay,before.details[i].cellDisplay,`PREVIEW_CELL_DISPLAY_CHANGED:${vp.name}:${i}`);
          assert.equal(after.details[i].gridTemplateColumns,before.details[i].gridTemplateColumns,`PREVIEW_GRID_CHANGED:${vp.name}:${i}`);
          assert(Math.abs((after.details[i].cellHeight||0)-(before.details[i].cellHeight||0))<1,`PREVIEW_HEIGHT_CHANGED:${vp.name}:${i}`);
        }
        await page.screenshot({path:`${auditDir}/preview-${vp.name}.png`,fullPage:true});
        out.push({viewport:vp.name,beforeRows:before.rowCount,afterRows:after.rowCount,badCount:bad.length,sample:after.details.slice(0,12),pageErrors:errors,requestFailures:failed});
      }else{
        await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:45000});
        await page.waitForTimeout(7000);
        const data=await inspectLivePage(page);
        const bad=data.details.filter(x=>!x.homeFirst||!x.awayFirst||!x.homeVisible||!x.awayVisible||x.homeAsset!=='original-image'||x.awayAsset!=='original-image'||!/vintage-kits-24-sprite\.webp/.test(x.homeBg||'')||!/vintage-kits-24-sprite\.webp/.test(x.awayBg||''));
        assert(data.rowCount>0,`UI_NO_REAL_ROWS:${vp.name}`);
        assert.equal(data.variantCount,24,`UI_VARIANTS_WRONG:${vp.name}`);
        assert.equal(bad.length,0,`UI_IMAGE_KIT_BAD:${vp.name}:${JSON.stringify(bad.slice(0,2))}`);
        assert.equal(failed.length,0,`UI_IMAGE_ASSET_REQUEST_FAILED:${vp.name}`);
        await page.screenshot({path:`${auditDir}/${vp.name}.png`,fullPage:true});
        out.push({viewport:vp.name,rowCount:data.rowCount,badCount:bad.length,sample:data.details.slice(0,12),pageErrors:errors,requestFailures:failed});
      }
      await page.close();
    }
  } finally { await browser.close(); }
  return out;
}

let base=null,candidate=null,newTeamKitsSha=null,newIndexSha=null,spriteSha=null;
async function rollback(){
  const now=await activeVersion();
  if(now===base){report.rollback={status:'base-still-active',version:base};return;}
  if(!candidate||now!==candidate){report.rollback={status:'skipped-foreign-deployment',version:now};return;}
  const liveKitSha=sha(await publicFile('/team-kits-343.js',undefined,directOrigin));
  const liveSpriteSha=sha(await publicFile(SPRITE_PUBLIC,undefined,directOrigin));
  if(liveKitSha!==newTeamKitsSha||liveSpriteSha!==spriteSha){report.rollback={status:'skipped-candidate-not-owned',version:now};return;}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Ball46 vintage image kits ${report.run}`}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:base};
}

try{
  const spriteRepoPath=resolve(SPRITE_REPO);
  assert(existsSync(spriteRepoPath),'SPRITE_REPO_ASSET_MISSING');
  const spriteBytes=readFileSync(spriteRepoPath);
  spriteSha=sha(spriteBytes);
  assert.equal(spriteSha,SPRITE_SHA,'SPRITE_SHA_MISMATCH');
  report.sprite={path:SPRITE_REPO,publicPath:SPRITE_PUBLIC,sha256:spriteSha,bytes:spriteBytes.length,variants:24};

  const {restore,version,source}=await inspect();
  base=restore.version;
  report.baseVersion=base;
  report.backendBefore=restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`);
  report.configBeforeFunctionalSha=sha(canonical(functionalSettings(settingsBefore)));
  const cronsBefore=await schedules();
  report.cronsBefore=cronsBefore;
  const staged=await stageCurrentRail(version,settingsBefore,cronsBefore,source);
  const indexPath=resolve(staged.runtime,'assets/index.html');
  const kitsPath=resolve(staged.runtime,'assets/team-kits-343.js');
  const spritePath=resolve(staged.runtime,'assets',SPRITE_PUBLIC.slice(1));
  const beforeIndex=readFileSync(indexPath,'utf8');
  const beforeKits=readFileSync(kitsPath,'utf8');
  report.currentIndexSha=sha(beforeIndex);
  report.currentTeamKitsSha=sha(beforeKits);
  report.currentProductionVersionMarker=beforeKits.match(/const VERSION='([^']+)'/)?.[1]||null;

  if(beforeKits.includes(`const VERSION='${VERSION}'`)&&beforeIndex.includes(LOADER)&&existsSync(spritePath)&&sha(readFileSync(spritePath))===spriteSha){
    report.result='ALREADY_DEPLOYED';report.finalVersion=base;report.ui=await browserCheck({phase:'already'});report.completedAt=new Date().toISOString();save();console.log(report.result);process.exit(0);
  }
  assert(beforeKits.includes(`const VERSION='${OLD_VERSION}'`),'CURRENT_TEAM_KIT_VERSION_MOVED_STOP');
  assert(beforeIndex.includes(OLD_LOADER),'CURRENT_INDEX_KIT_LOADER_MOVED_STOP');
  assert(!existsSync(spritePath),'SPRITE_PATH_ALREADY_EXISTS_WITH_UNKNOWN_CONTENT_STOP');

  const afterKits=patchKitSource(beforeKits);
  const afterIndex=patchIndex(beforeIndex);
  newTeamKitsSha=sha(afterKits);newIndexSha=sha(afterIndex);
  writeFileSync(kitsPath,afterKits);
  writeFileSync(indexPath,afterIndex);
  copyFileSync(spriteRepoPath,spritePath);

  const changedExisting=[];
  for(const [path,beforeSha] of Object.entries(staged.hashes))if(sha(readFileSync(resolve(staged.runtime,'assets',path)))!==beforeSha)changedExisting.push(path);
  changedExisting.sort();
  assert.deepEqual(changedExisting,['index.html','team-kits-343.js'],'SURGICAL_EXISTING_DIFF_GATE_FAILED');
  assert.equal(sha(readFileSync(spritePath)),spriteSha,'STAGED_SPRITE_SHA_MISMATCH');
  report.changedPaths=['index.html','team-kits-343.js',SPRITE_PUBLIC.slice(1)];
  report.changedAssets={index:{before:staged.hashes['index.html'],after:newIndexSha},teamKits:{before:staged.hashes['team-kits-343.js'],after:newTeamKitsSha},sprite:{before:null,after:spriteSha}};
  report.previewUi=await browserCheck({assetSource:afterKits,spriteBytes,phase:'preview'});
  wrangler(staged,true);
  save();
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log(report.result);process.exit(0);}

  assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_STOP');
  assert.equal(sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`)))),report.configBeforeFunctionalSha,'FUNCTIONAL_CONFIG_CHANGED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_BEFORE_WRANGLER_STOP');
  try{
    wrangler(staged);
    for(let attempt=0;attempt<40;attempt++){
      const current=await activeVersion();
      if(current!==base){candidate=current;break;}
      await delay(1500);
    }
    assert(candidate,'NO_PRODUCTION_CANDIDATE');
    report.candidateVersion=candidate;save();
    let directReady=false;
    for(let attempt=0;attempt<40;attempt++){
      const i=sha(await publicFile('/index.html',undefined,directOrigin));
      const k=sha(await publicFile('/team-kits-343.js',undefined,directOrigin));
      const s=sha(await publicFile(SPRITE_PUBLIC,undefined,directOrigin));
      if(i===newIndexSha&&k===newTeamKitsSha&&s===spriteSha){directReady=true;break;}
      await delay(1500);
    }
    assert(directReady,'DIRECT_IMAGE_KIT_ASSETS_NOT_PUBLISHED');
    let publicReady=false;
    for(let attempt=0;attempt<60;attempt++){
      const i=sha(await publicFile('/index.html'));
      const k=sha(await publicFile('/team-kits-343.js'));
      const s=sha(await publicFile(SPRITE_PUBLIC));
      if(i===newIndexSha&&k===newTeamKitsSha&&s===spriteSha){publicReady=true;break;}
      await delay(2000);
    }
    assert(publicReady,'PUBLIC_IMAGE_KIT_ASSETS_NOT_PUBLISHED');
    for(const [path,expected] of Object.entries(staged.hashes)){
      if(path==='index.html'||path==='team-kits-343.js')continue;
      assert.equal(sha(await publicFile('/'+path,undefined,directOrigin)),expected,`UNRELATED_DIRECT_ASSET_CHANGED_STOP:${path}`);
    }
    report.backendAfter=await backend();
    assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');
    report.configAfterFunctionalSha=sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`))));
    assert.equal(report.configAfterFunctionalSha,report.configBeforeFunctionalSha,'PRODUCTION_FUNCTIONAL_CONFIG_CHANGED_STOP');
    report.cronsAfter=await schedules();
    assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');
    report.ui=await browserCheck({phase:'production'});
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_STOP');
    report.finalVersion=candidate;report.result='SUCCESS';report.unrelatedAssetsUnchanged=true;report.workerLogicUnchanged=true;report.backendUnchanged=true;
    console.log(`FINAL_PRODUCTION=${candidate}`);
  }catch(error){
    try{await rollback();}catch(rollbackError){report.rollbackError=rollbackError.message;}
    throw error;
  }
  report.completedAt=new Date().toISOString();save();
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 Vintage Image Kits\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nScope: index.html + team-kits-343.js + vintage-kits-24-sprite.webp\n\nVariants: 24 original cleaned jerseys\n`);
  console.log(report.result);
}catch(error){report.result='FAIL_STOPPED';report.error=error.stack||error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack||error);process.exitCode=1;}
