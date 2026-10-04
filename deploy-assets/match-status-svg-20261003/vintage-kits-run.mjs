import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { inspect, activeVersion, api, script, origin, directOrigin, sha, canonical, publicFile, backend } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';

const deploy=process.env.DEPLOY_ENABLED==='true';
const OLD_VERSION='343-team-kits-v6-vintage24-frontname-20261004a';
const VERSION='343-team-kits-v6-vintage24-live-row-20261004b';
const OLD_LOADER=`<script src="team-kits-343.js?v=${OLD_VERSION}" defer></script>`;
const LOADER=`<script src="team-kits-343.js?v=${VERSION}" defer></script>`;
const EXPECTED_OLD_KITS_SHA='222bad07c35e6a03458f0f938d7ef6c6b3af95ec2af80f803ac9622dca84d796';
const auditDir='audit/vintage-kits-deploy';
mkdirSync(auditDir,{recursive:true});
const report={startedAt:new Date().toISOString(),run:process.env.GITHUB_RUN_ID||'local',commit:process.env.GITHUB_SHA||'local',deploy,scope:'Ball46 vintage kit icons on actual live match rows: place compact kit inside b.b46-home and b.b46-away before team text. Change index.html loader + team-kits-343.js only. No worker logic, APIs, engine, signals, statistics, odds, Event Flow, flags, or score markup.'};
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const functionalSettings=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='annotations'));

function replaceOnce(source,needle,replacement,label){
  assert.equal(source.split(needle).length-1,1,label);
  return source.replace(needle,replacement);
}

function patchKitSource(source){
  assert(source.includes(`const VERSION='${OLD_VERSION}'`),'OLD_KIT_VERSION_MISSING');
  assert(!source.includes(VERSION),'NEW_KIT_VERSION_ALREADY_PRESENT');
  let out=replaceOnce(source,`const VERSION='${OLD_VERSION}'`,`const VERSION='${VERSION}'`,'KIT_VERSION_TARGET_MOVED');
  const styleNeedle='    .team-slot.kit-ready>.team-kit-icon+.team-name{min-width:0}\n';
  const styleReplacement=styleNeedle+
    '    .b46-home>.team-kit-icon.live-row-kit,.b46-away>.team-kit-icon.live-row-kit{display:inline-block;width:1.28em;height:1.28em;flex:none;vertical-align:-.22em;margin:0 .42em 0 0;pointer-events:none}\n';
  out=replaceOnce(out,styleNeedle,styleReplacement,'LIVE_ROW_KIT_STYLE_TARGET_MOVED');
  const decorateNeedle=`function decorate(root=document){\n  root.querySelectorAll?.('.match-card .fixture-scoreboard').forEach(board=>decorateCard(board.closest('.match-card')));\n}\n`;
  const decorateReplacement=`function decorateLiveRow(row){\n  const cell=row.querySelector('.teams-cell');\n  const homeName=cell?.querySelector(':scope > .b46-home');\n  const awayName=cell?.querySelector(':scope > .b46-away');\n  if(!cell||!homeName||!awayName)return;\n  const homeText=homeName.textContent.trim(),awayText=awayName.textContent.trim();\n  if(!homeText||!awayText)return;\n  const homeKey=hash(homeText),awayKey=hash(awayText);\n  const homeExisting=homeName.querySelector(':scope > .team-kit-icon.live-row-kit');\n  const awayExisting=awayName.querySelector(':scope > .team-kit-icon.live-row-kit');\n  const homeCurrent=homeExisting?.dataset.kitVersion===VERSION&&homeExisting.dataset.teamKey===String(homeKey)&&homeName.firstChild===homeExisting;\n  const awayCurrent=awayExisting?.dataset.kitVersion===VERSION&&awayExisting.dataset.teamKey===String(awayKey)&&awayName.firstChild===awayExisting;\n  if(homeCurrent&&awayCurrent)return;\n  homeName.querySelectorAll(':scope > .team-kit-icon.live-row-kit').forEach(el=>el.remove());\n  awayName.querySelectorAll(':scope > .team-kit-icon.live-row-kit').forEach(el=>el.remove());\n  let homeIndex=homeKey%KITS.length;\n  let awayIndex=awayKey%KITS.length;\n  if(awayIndex===homeIndex)awayIndex=(awayIndex+11)%KITS.length;\n  const homeIcon=icon(homeIndex,homeKey),awayIcon=icon(awayIndex,awayKey);\n  homeIcon.classList.add('live-row-kit');awayIcon.classList.add('live-row-kit');\n  homeIcon.dataset.liveRowKit='1';awayIcon.dataset.liveRowKit='1';\n  homeName.insertBefore(homeIcon,homeName.firstChild);\n  awayName.insertBefore(awayIcon,awayName.firstChild);\n}\nfunction decorate(root=document){\n  root.querySelectorAll?.('.match-card .fixture-scoreboard').forEach(board=>decorateCard(board.closest('.match-card')));\n  root.querySelectorAll?.('article.match-row').forEach(decorateLiveRow);\n}\n`;
  out=replaceOnce(out,decorateNeedle,decorateReplacement,'LIVE_ROW_DECORATOR_TARGET_MOVED');
  out=replaceOnce(out,"  const root=document.querySelector('.score-board')||document.body;","  const root=document.body;",'KIT_OBSERVER_ROOT_TARGET_MOVED');
  out=replaceOnce(out,"  window.NOMAD_TEAM_KITS_343={version:VERSION,refresh:()=>decorate(root),variantCount:KITS.length};","  window.NOMAD_TEAM_KITS_343={version:VERSION,refresh:()=>decorate(document),variantCount:KITS.length};",'KIT_REFRESH_TARGET_MOVED');
  assert.equal((out.match(/\{bg:/g)||[]).length,24,'VINTAGE_KIT_COUNT_NOT_24');
  assert(out.includes("row.querySelector('.teams-cell')"),'LIVE_ROW_SELECTOR_MISSING');
  assert(out.includes("homeName.insertBefore(homeIcon,homeName.firstChild)"),'HOME_LIVE_KIT_NOT_BEFORE_TEXT');
  assert(out.includes("awayName.insertBefore(awayIcon,awayName.firstChild)"),'AWAY_LIVE_KIT_NOT_BEFORE_TEXT');
  new Function(out);
  return out;
}

function patchIndex(source){
  if(source.includes(LOADER))return source;
  if(source.includes(OLD_LOADER))return replaceOnce(source,OLD_LOADER,LOADER,'OLD_KIT_LOADER_NOT_UNIQUE');
  assert(!source.includes('team-kits-343.js'),'TEAM_KITS_LOADER_ALREADY_DIFFERENT_STOP');
  assert.equal((source.match(/<\/body>/g)||[]).length,1,'INDEX_BODY_CLOSE_NOT_UNIQUE');
  return source.replace('</body>',`${LOADER}</body>`);
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
      return {
        i,matchId:row.dataset.matchId||null,
        home:(home?.textContent||'').trim(),away:(away?.textContent||'').trim(),
        homeKit:homeKit?.dataset.kit||null,awayKit:awayKit?.dataset.kit||null,
        homeFirst:Boolean(homeKit&&home?.firstChild===homeKit),awayFirst:Boolean(awayKit&&away?.firstChild===awayKit),
        homeVisible:Boolean(hk&&hk.width>0&&hk.height>0),awayVisible:Boolean(ak&&ak.width>0&&ak.height>0),
        cellDisplay:cs?.display||null,gridTemplateColumns:cs?.gridTemplateColumns||null,cellHeight:cr?.height||null
      };
    });
    return {version:window.NOMAD_TEAM_KITS_343?.version||null,variantCount:window.NOMAD_TEAM_KITS_343?.variantCount||null,rowCount:rows.length,details};
  });
}

async function previewUi(assetSource){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const out=[];
  try{
    for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${origin}/index.html?vintagePreview=${report.run}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,OLD_VERSION,{timeout:45000});
      await page.waitForTimeout(5000);
      const before=await inspectLivePage(page);
      assert(before.rowCount>0,`PREVIEW_NO_REAL_MATCH_ROWS:${vp.name}`);
      await page.addScriptTag({content:assetSource});
      await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:15000});
      await page.waitForTimeout(500);
      const after=await inspectLivePage(page);
      assert.equal(after.variantCount,24,`PREVIEW_VARIANT_COUNT_WRONG:${vp.name}`);
      assert(after.rowCount>0,`PREVIEW_REAL_ROWS_DISAPPEARED:${vp.name}`);
      const bad=after.details.filter(x=>!x.homeFirst||!x.awayFirst||!x.homeVisible||!x.awayVisible||!x.homeKit||!x.awayKit);
      assert.equal(bad.length,0,`PREVIEW_LIVE_ROW_KIT_BAD:${vp.name}:${JSON.stringify(bad.slice(0,3))}`);
      const n=Math.min(before.details.length,after.details.length,5);
      for(let i=0;i<n;i++){
        assert.equal(after.details[i].cellDisplay,before.details[i].cellDisplay,`PREVIEW_CELL_DISPLAY_CHANGED:${vp.name}:${i}`);
        assert.equal(after.details[i].gridTemplateColumns,before.details[i].gridTemplateColumns,`PREVIEW_GRID_COLUMNS_CHANGED:${vp.name}:${i}`);
        assert(Math.abs((after.details[i].cellHeight||0)-(before.details[i].cellHeight||0))<1,`PREVIEW_CELL_HEIGHT_CHANGED:${vp.name}:${i}`);
      }
      await page.screenshot({path:`${auditDir}/preview-${vp.name}.png`,fullPage:true});
      out.push({viewport:vp.name,beforeRows:before.rowCount,afterRows:after.rowCount,badCount:bad.length,sample:after.details.slice(0,10),pageErrors:errors});
      await page.close();
    }
  } finally {await browser.close();}
  return out;
}

async function productionUiCheck(){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const out=[];
  try{
    for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const errors=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('requestfailed',r=>{if(/team-kits-343\.js/i.test(r.url()))failed.push({url:r.url(),error:r.failure()?.errorText||'failed'});});
      await page.goto(`${origin}/index.html?vintageLiveProduction=${report.run}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:45000});
      await page.waitForTimeout(7000);
      const data=await inspectLivePage(page);
      assert.equal(data.variantCount,24,`UI_VARIANT_COUNT_WRONG:${vp.name}`);
      assert(data.rowCount>0,`UI_NO_REAL_MATCH_ROWS:${vp.name}`);
      const bad=data.details.filter(x=>!x.homeFirst||!x.awayFirst||!x.homeVisible||!x.awayVisible||!x.homeKit||!x.awayKit);
      assert.equal(bad.length,0,`UI_LIVE_ROW_KIT_BAD:${vp.name}:${JSON.stringify(bad.slice(0,3))}`);
      assert.equal(failed.length,0,`UI_TEAM_KIT_REQUEST_FAILED:${vp.name}`);
      assert(!errors.some(x=>/team.?kit|vintage.?kit/i.test(x)),`UI_TEAM_KIT_PAGE_ERROR:${vp.name}:${errors.join('|')}`);
      await page.screenshot({path:`${auditDir}/${vp.name}.png`,fullPage:true});
      out.push({viewport:vp.name,rowCount:data.rowCount,badCount:bad.length,sample:data.details.slice(0,12),pageErrors:errors,requestFailures:failed});
      await page.close();
    }
  } finally {await browser.close();}
  return out;
}

let base=null,candidate=null;
async function rollback(){
  const now=await activeVersion();
  if(now===base){report.rollback={status:'base-still-active',version:base};return;}
  if(!candidate||now!==candidate){report.rollback={status:'skipped-foreign-deployment',version:now};return;}
  const currentKitSha=sha(await publicFile('/team-kits-343.js',undefined,directOrigin));
  if(currentKitSha!==report.newTeamKitsSha){report.rollback={status:'skipped-candidate-not-owned',version:now};return;}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Ball46 live-row vintage kits ${report.run}`}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:base};
}

try{
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
  const beforeIndex=readFileSync(indexPath,'utf8');
  const beforeKits=readFileSync(kitsPath,'utf8');
  if(beforeKits.includes(`const VERSION='${VERSION}'`)&&beforeIndex.includes(LOADER)){
    report.result='ALREADY_DEPLOYED';report.finalVersion=base;report.ui=await productionUiCheck();report.completedAt=new Date().toISOString();save();console.log(report.result);process.exit(0);
  }
  assert.equal(sha(beforeKits),EXPECTED_OLD_KITS_SHA,'TEAM_KITS_BASE_MOVED_STOP');
  assert(beforeIndex.includes(OLD_LOADER),'OLD_INDEX_KIT_LOADER_MISSING_STOP');
  const assetSource=patchKitSource(beforeKits);
  const afterIndex=patchIndex(beforeIndex);
  const newKitsSha=sha(assetSource);
  report.currentTeamKitsSha=sha(beforeKits);
  report.newTeamKitsSha=newKitsSha;
  writeFileSync(indexPath,afterIndex);
  writeFileSync(kitsPath,assetSource);
  const changed=[];
  for(const [path,beforeSha] of Object.entries(staged.hashes))if(sha(readFileSync(resolve(staged.runtime,'assets',path)))!==beforeSha)changed.push(path);
  changed.sort();
  assert.deepEqual(changed,['index.html','team-kits-343.js'],'SURGICAL_DIFF_GATE_FAILED');
  const expectedIndexSha=sha(afterIndex);
  report.changedAssets={index:{before:staged.hashes['index.html'],after:expectedIndexSha},teamKits:{before:sha(beforeKits),after:newKitsSha}};
  report.changedPaths=changed;
  report.previewUi=await previewUi(assetSource);
  wrangler(staged,true);
  save();
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log(report.result);process.exit(0);}

  assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_STOP');
  assert.equal(sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`)))),report.configBeforeFunctionalSha,'FUNCTIONAL_CONFIG_CHANGED_BEFORE_DEPLOY_STOP');
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_BEFORE_WRANGLER_STOP');
  try{
    wrangler(staged);
    for(let attempt=0;attempt<35;attempt++){
      const current=await activeVersion();
      if(current!==base){candidate=current;break;}
      await delay(1500);
    }
    assert(candidate,'NO_PRODUCTION_CANDIDATE');
    report.candidateVersion=candidate;save();
    let directReady=false;
    for(let attempt=0;attempt<35;attempt++){
      const i=sha(await publicFile('/index.html',undefined,directOrigin));
      const k=sha(await publicFile('/team-kits-343.js',undefined,directOrigin));
      if(i===expectedIndexSha&&k===newKitsSha){directReady=true;break;}
      await delay(1500);
    }
    assert(directReady,'DIRECT_KIT_ASSETS_NOT_PUBLISHED');
    let publicReady=false;
    for(let attempt=0;attempt<60;attempt++){
      const i=sha(await publicFile('/index.html'));
      const k=sha(await publicFile('/team-kits-343.js'));
      if(i===expectedIndexSha&&k===newKitsSha){publicReady=true;break;}
      await delay(2000);
    }
    assert(publicReady,'PUBLIC_KIT_ASSETS_NOT_PUBLISHED');
    report.backendAfter=await backend();
    assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');
    report.configAfterFunctionalSha=sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`))));
    assert.equal(report.configAfterFunctionalSha,report.configBeforeFunctionalSha,'PRODUCTION_FUNCTIONAL_CONFIG_CHANGED_STOP');
    report.cronsAfter=await schedules();
    assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');
    report.ui=await productionUiCheck();
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_STOP');
    report.finalVersion=candidate;
    report.result='SUCCESS';
    report.workerLogicUnchanged=true;report.backendUnchanged=true;
    console.log(`FINAL_PRODUCTION=${candidate}`);
  }catch(error){
    try{await rollback();}catch(rollbackError){report.rollbackError=rollbackError.message;}
    throw error;
  }
  report.completedAt=new Date().toISOString();save();
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 Vintage Kits — Live Rows\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nScope: index.html + team-kits-343.js only\n\nVariants: 24\n`);
  console.log(report.result);
}catch(error){
  report.result='FAIL_STOPPED';report.error=error.stack||error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack||error);process.exitCode=1;
}
