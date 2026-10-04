import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { inspect, activeVersion, api, script, origin, directOrigin, sha, canonical, publicFile, backend } from './production.mjs';
import { schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';

const deploy=process.env.DEPLOY_ENABLED==='true';
const VERSION='343-team-kits-v6-vintage24-frontname-20261004a';
const LOADER=`<script src="team-kits-343.js?v=${VERSION}" defer></script>`;
const EXPECTED_OLD_KITS_SHA='a9ec3300cd3e91b31a09e46637292e3958aed1c154ab05d242061e9bdf7888d2';
const assetSource=readFileSync('team-kits-vintage-24.asset.js','utf8');
new Function(assetSource);
assert(assetSource.includes(`const VERSION='${VERSION}'`),'KIT_VERSION_MISMATCH');
assert(assetSource.includes('homeSlot.insertBefore(icon(homeIndex,homeKey),homeName)'),'HOME_ICON_NOT_BEFORE_NAME');
assert(assetSource.includes('awaySlot.insertBefore(icon(awayIndex,awayKey),awayName)'),'AWAY_ICON_NOT_BEFORE_NAME');
assert.equal((assetSource.match(/\{bg:/g)||[]).length,24,'VINTAGE_KIT_COUNT_NOT_24');

const auditDir='audit/vintage-kits-deploy';
mkdirSync(auditDir,{recursive:true});
const report={startedAt:new Date().toISOString(),run:process.env.GITHUB_RUN_ID||'local',commit:process.env.GITHUB_SHA||'local',deploy,scope:'Ball46 match-card vintage kit icons only: index.html loader + team-kits-343.js. No worker logic, API, engine, signals, statistics, odds, Event Flow, flags, or other assets.'};
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const functionalSettings=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='annotations'));

let base=null,candidate=null;
async function rollback(){
  const now=await activeVersion();
  if(now===base){report.rollback={status:'base-still-active',version:base};return;}
  if(!candidate||now!==candidate){report.rollback={status:'skipped-foreign-deployment',version:now};return;}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Ball46 vintage kits ${report.run}`}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:base};
}

function patchIndex(source){
  if(source.includes(LOADER))return source;
  assert(!source.includes('team-kits-343.js'),'TEAM_KITS_LOADER_ALREADY_DIFFERENT_STOP');
  assert.equal((source.match(/<\/body>/g)||[]).length,1,'INDEX_BODY_CLOSE_NOT_UNIQUE');
  return source.replace('</body>',`${LOADER}</body>`);
}

async function uiCheck(){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const rows=[];
  try{
    for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const errors=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('requestfailed',r=>{if(/team-kits-343\.js/i.test(r.url()))failed.push({url:r.url(),error:r.failure()?.errorText||'failed'});});
      await page.goto(`${origin}/index.html?vintageKitAudit=${report.run}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(v=>window.NOMAD_TEAM_KITS_343?.version===v,VERSION,{timeout:45000});
      const result=await page.evaluate(version=>{
        const api=window.NOMAD_TEAM_KITS_343;
        const real=[...document.querySelectorAll('.match-card .fixture-scoreboard')].map(board=>board.closest('.match-card')).filter(Boolean);
        const inspect=card=>{
          const hs=card.querySelector('.home-slot'),as=card.querySelector('.away-slot');
          const hn=hs?.querySelector('.team-name'),an=as?.querySelector('.team-name');
          const hi=hs?.querySelector('.team-kit-icon'),ai=as?.querySelector('.team-kit-icon');
          return {home:Boolean(hi&&hn&&hi.nextElementSibling===hn),away:Boolean(ai&&an&&ai.nextElementSibling===an),homeKit:hi?.dataset.kit||null,awayKit:ai?.dataset.kit||null};
        };
        api.refresh();
        const realRows=real.slice(0,20).map(inspect);
        const root=document.querySelector('.score-board')||document.body;
        const test=document.createElement('article');
        test.className='match-card';test.dataset.vintageKitQa='1';
        test.innerHTML='<div class="fixture-scoreboard"><div class="team-slot home-slot"><span class="team-name">Vintage Home Test</span></div><div class="team-slot away-slot"><span class="team-name">Vintage Away Test</span></div></div>';
        root.appendChild(test);api.refresh();
        const synthetic=inspect(test);test.remove();
        return {version:api.version,variantCount:api.variantCount,realCount:real.length,realRows,synthetic};
      },VERSION);
      assert.equal(result.version,VERSION,'UI_KIT_VERSION_WRONG');
      assert.equal(result.variantCount,24,'UI_VARIANT_COUNT_WRONG');
      assert(result.synthetic.home&&result.synthetic.away,'UI_SYNTHETIC_ICON_NOT_BEFORE_TEAM_NAME');
      assert(result.realRows.every(x=>x.home&&x.away),'UI_REAL_MATCH_ICON_NOT_BEFORE_TEAM_NAME');
      assert.equal(failed.length,0,'UI_TEAM_KIT_REQUEST_FAILED');
      assert(!errors.some(x=>/team.?kit|vintage.?kit/i.test(x)),`UI_TEAM_KIT_PAGE_ERROR:${errors.join('|')}`);
      await page.screenshot({path:`${auditDir}/${vp.name}.png`,fullPage:true});
      rows.push({viewport:vp.name,...result,pageErrors:errors,requestFailures:failed});
      await page.close();
    }
  }finally{await browser.close();}
  return rows;
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
  const newKitsSha=sha(assetSource);
  const oldKitsSha=sha(beforeKits);
  report.currentTeamKitsSha=oldKitsSha;
  report.newTeamKitsSha=newKitsSha;
  report.currentIndexSha=sha(beforeIndex);
  if(oldKitsSha===newKitsSha&&beforeIndex.includes(LOADER)){
    report.result='ALREADY_DEPLOYED';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log(report.result);process.exit(0);
  }
  assert.equal(oldKitsSha,EXPECTED_OLD_KITS_SHA,'TEAM_KITS_BASE_MOVED_STOP');
  const afterIndex=patchIndex(beforeIndex);
  writeFileSync(indexPath,afterIndex);
  writeFileSync(kitsPath,assetSource);
  const changed=[];
  for(const [path,beforeSha] of Object.entries(staged.hashes))if(sha(readFileSync(resolve(staged.runtime,'assets',path)))!==beforeSha)changed.push(path);
  changed.sort();
  assert.deepEqual(changed,['index.html','team-kits-343.js'],'SURGICAL_DIFF_GATE_FAILED');
  const expectedIndexSha=sha(afterIndex);
  report.changedAssets={index:{before:staged.hashes['index.html'],after:expectedIndexSha},teamKits:{before:oldKitsSha,after:newKitsSha}};
  report.changedPaths=changed;
  const protectedFiles=Object.fromEntries(Object.entries(staged.hashes).filter(([path])=>!changed.includes(path)));
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
    for(const [path,expected] of Object.entries(protectedFiles))assert.equal(sha(await publicFile('/'+path,undefined,directOrigin)),expected,`UNRELATED_DIRECT_ASSET_CHANGED_STOP:${path}`);
    report.backendAfter=await backend();
    assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');
    report.configAfterFunctionalSha=sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`))));
    assert.equal(report.configAfterFunctionalSha,report.configBeforeFunctionalSha,'PRODUCTION_FUNCTIONAL_CONFIG_CHANGED_STOP');
    report.cronsAfter=await schedules();
    assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');
    report.ui=await uiCheck();
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_STOP');
    report.finalVersion=candidate;
    report.result='SUCCESS';
    report.unrelatedAssetsUnchanged=true;
    report.workerLogicUnchanged=true;
    report.backendUnchanged=true;
    console.log(`FINAL_PRODUCTION=${candidate}`);
  }catch(error){
    try{await rollback();}catch(rollbackError){report.rollbackError=rollbackError.message;}
    throw error;
  }
  report.completedAt=new Date().toISOString();save();
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 Vintage Kits\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nScope: index.html + team-kits-343.js only\n\nVariants: 24\n`);
  console.log(report.result);
}catch(error){
  report.result='FAIL_STOPPED';report.error=error.stack||error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack||error);process.exitCode=1;
}
