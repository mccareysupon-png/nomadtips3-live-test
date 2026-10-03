import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { inspect, activeVersion, getVersion, api, script, origin, directOrigin, sha, canonical, publicFile, backend } from './production.mjs';
import { rail, schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';
import { assetSource, patchIndex, registry, validateAsset, TOKEN } from './league-flags-patch.mjs';

const deploy=process.env.DEPLOY_ENABLED==='true';
const report={
  startedAt:new Date().toISOString(),
  commit:process.env.GITHUB_SHA||'local',
  run:process.env.GITHUB_RUN_ID||'local',
  deploy,
  scope:'Ball46 league flag presentation layer only: index.html loader + league-flags-343.js. No worker logic, API, engines, signals, statistics, odds, event flow, or other assets.'
};
const auditDir='audit/league-flags-143';
mkdirSync(auditDir,{recursive:true});
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const world=new Set(['international','world','worldwide','uefa','fifa','europe','global','international clubs','club international']);
const clean=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');

async function verifyPrimaryIconSet(){
  const codes=[...new Set(Object.values(registry().map))].sort();
  const failures=[];
  let cursor=0;
  async function worker(){
    while(cursor<codes.length){
      const index=cursor++;
      const code=codes[index];
      const url=`https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${code}.svg`;
      try{
        const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Ball46-Flag-Preflight/1.0'}});
        const body=await response.text();
        if(!response.ok||!body.includes('<svg')) failures.push({code,status:response.status,bytes:body.length});
      }catch(error){ failures.push({code,error:error.message}); }
    }
  }
  await Promise.all(Array.from({length:12},worker));
  assert.equal(failures.length,0,`FLAG_CDN_PREFLIGHT_FAILED:${JSON.stringify(failures)}`);
  return {checked:codes.length,base:'flag-icons@7.5.0/flags/4x3'};
}

async function liveCountryCoverage(){
  const data=JSON.parse(await publicFile('/api/engine/board','json'));
  assert(data?.ok===true&&Array.isArray(data.fixtures),'LIVE_BOARD_BAD');
  const countries=[...new Set(data.fixtures.map(f=>String(f?.league?.country||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const map=registry().map;
  const unknown=countries.filter(country=>!world.has(clean(country))&&!map[clean(country)]);
  assert.equal(unknown.length,0,`LIVE_COUNTRY_FLAG_MAPPING_MISSING:${unknown.join('|')}`);
  const leagues=new Set(data.fixtures.map(f=>[f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')).filter(Boolean));
  return {fixtures:data.fixtures.length,countries:countries.length,leagues:leagues.size,countryNames:countries};
}

async function uiCheck(phase){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const results=[];
  try{
    for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${origin}/index.html?leagueFlagAudit=${report.run}-${phase}-${viewport.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>window.NOMAD_LEAGUE_FLAGS_343?.iconCount===143&&window.NOMAD_LEAGUE_FLAGS_343?.aliasCount===167,{timeout:45000});
      await page.waitForTimeout(1200);
      const live=await page.evaluate(()=>{
        const api=window.NOMAD_LEAGUE_FLAGS_343;
        const buttons=[...document.querySelectorAll('[data-league-filter]')];
        return {
          version:api.version,
          iconCount:api.iconCount,
          aliasCount:api.aliasCount,
          northernIreland:api.codeFor('Northern Ireland'),
          thailand:api.codeFor('Thailand'),
          buttons:buttons.length,
          ready:buttons.filter(btn=>btn.querySelector(':scope > span.league-flag-ready')).length,
          unknown:buttons.filter(btn=>btn.querySelector(':scope > span')?.dataset?.leagueFlagCode==='unknown').map(btn=>btn.textContent.trim())
        };
      });
      assert.equal(live.northernIreland,'gb-nir','UI_NORTHERN_IRELAND_WRONG');
      assert.equal(live.thailand,'th','UI_THAILAND_WRONG');
      assert(live.buttons>0,'UI_NO_LEAGUE_FILTERS');
      assert.equal(live.ready,live.buttons,'UI_LEAGUE_FILTERS_NOT_ALL_DECORATED');
      assert.equal(live.unknown.length,0,`UI_UNKNOWN_LIVE_LEAGUE_FLAG:${live.unknown.join('|')}`);

      const synthetic=await page.evaluate(async()=>{
        const host=document.createElement('div');
        host.id='flag-audit-synthetic';
        host.style.cssText='position:fixed;left:-9999px;top:0';
        const labels=['Thailand · Test League','Northern Ireland · Test League','International · Test Cup'];
        for(const text of labels){
          const button=document.createElement('button');
          button.dataset.leagueFilter=text;
          const span=document.createElement('span');
          span.textContent=text;
          const count=document.createElement('b');count.textContent='1';
          button.append(span,count);host.append(button);
        }
        document.body.append(host);
        window.NOMAD_LEAGUE_FLAGS_343.refresh();
        await new Promise(resolve=>setTimeout(resolve,1000));
        return [...host.querySelectorAll('button>span')].map(span=>({
          code:span.dataset.leagueFlagCode,
          img:span.querySelector('img')?.src||null,
          globe:Boolean(span.querySelector('.league-globe')),
          width:getComputedStyle(span.querySelector('.league-flag,.league-globe')).width,
          height:getComputedStyle(span.querySelector('.league-flag,.league-globe')).height
        }));
      });
      assert.deepEqual(synthetic.map(x=>x.code),['th','gb-nir','WORLD'],'UI_SYNTHETIC_CODES_BAD');
      assert(synthetic[0].img?.endsWith('/th.svg')||synthetic[0].globe,'TH_FLAG_DID_NOT_RENDER_OR_FALLBACK');
      assert(synthetic[1].img?.endsWith('/gb-nir.svg')||synthetic[1].globe,'NIR_FLAG_DID_NOT_RENDER_OR_FALLBACK');
      assert.equal(synthetic[2].globe,true,'WORLD_GLOBE_MISSING');
      if(viewport.name==='desktop'){
        assert.equal(synthetic[0].width,'16px','DESKTOP_FLAG_WIDTH_BAD');
        assert.equal(synthetic[0].height,'12px','DESKTOP_FLAG_HEIGHT_BAD');
      }else{
        assert.equal(synthetic[0].width,'15px','MOBILE_FLAG_WIDTH_BAD');
        assert.equal(synthetic[0].height,'11px','MOBILE_FLAG_HEIGHT_BAD');
      }
      assert(!errors.some(message=>/league.?flag/i.test(message)),`FLAG_PAGE_ERROR:${errors.join('|')}`);
      results.push({viewport:viewport.name,live,synthetic,errors});
      await page.close();
    }
  }finally{await browser.close();}
  return results;
}

let base, originalVersion, expectedSource, originalProtectedFiles;
async function owned(versionId){
  const candidate=await getVersion(versionId);
  try{verifyPublishedModules(candidate,originalVersion,expectedSource,originalProtectedFiles);return true}catch{return false}
}
async function rollback(){
  const now=await activeVersion();
  if(now===base){report.rollback={status:'base-still-active',version:base};return}
  if(!originalVersion||!await owned(now)){report.rollback={status:'skipped-foreign-deployment',version:now};return}
  await api(`/scripts/${script}/deployments`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Ball46 league flags ${report.run}`}})
  });
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:base};
}

try{
  const {restore,version,source}=await inspect();
  assert.equal(process.env.GITHUB_REF_NAME,rail.branch,'UNCONFIRMED_DEPLOY_BRANCH_STOP');
  base=restore.version;
  report.baseVersion=base;
  report.deploymentRail=rail;
  report.registry=validateAsset();
  report.iconPreflight=await verifyPrimaryIconSet();
  report.liveCoverageBefore=await liveCountryCoverage();
  report.backendBefore=restore.backend;
  report.configBeforeSha=restore.settingsSha;

  const settingsBefore=await api(`/scripts/${script}/settings`);
  assert.equal(sha(canonical(settingsBefore)),restore.settingsSha,'CURRENT_CONFIG_MOVED_STOP');
  const cronsBefore=await schedules();
  const staged=await stageCurrentRail(version,settingsBefore,cronsBefore,source);

  const indexPath=resolve(staged.runtime,'assets/index.html');
  const flagsPath=resolve(staged.runtime,'assets/league-flags-343.js');
  const beforeIndex=readFileSync(indexPath,'utf8');
  const beforeFlags=readFileSync(flagsPath,'utf8');
  assert.equal(sha(beforeIndex),staged.hashes['index.html'],'STAGED_INDEX_NOT_CURRENT');
  assert.equal(sha(beforeFlags),staged.hashes['league-flags-343.js'],'STAGED_FLAGS_NOT_CURRENT');

  const afterIndex=patchIndex(beforeIndex);
  writeFileSync(indexPath,afterIndex);
  writeFileSync(flagsPath,assetSource);
  const changed=[];
  for(const [path,beforeSha] of Object.entries(staged.hashes)){
    const nowSha=sha(readFileSync(resolve(staged.runtime,'assets',path)));
    if(nowSha!==beforeSha) changed.push(path);
  }
  changed.sort();
  assert.deepEqual(changed,['index.html','league-flags-343.js'],'SURGICAL_DIFF_GATE_FAILED');
  const expectedIndexSha=sha(afterIndex), expectedFlagsSha=sha(assetSource);
  report.changedAssets={index:{before:staged.hashes['index.html'],after:expectedIndexSha},leagueFlags:{before:staged.hashes['league-flags-343.js'],after:expectedFlagsSha}};
  report.token=TOKEN;
  report.cronsBefore=cronsBefore;
  report.currentRailAssets=staged.hashes;

  const protectedFiles=Object.fromEntries(Object.entries(staged.hashes).filter(([path])=>!changed.includes(path)).map(([path,value])=>['/'+path,value]));
  originalVersion=version;
  expectedSource=source;
  originalProtectedFiles=Object.fromEntries(Object.entries(staged.hashes).map(([path,value])=>['/'+path,value]));

  wrangler(staged,true);
  save();

  if(!deploy){
    report.result='PREVIEW_SUCCESS_NO_DEPLOY';
    report.finalVersion=base;
  }else{
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_STOP');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),restore.settingsSha,'CONFIG_CHANGED_BEFORE_DEPLOY_STOP');
    await verifyRailBase(staged);
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_BEFORE_WRANGLER_STOP');
    try{
      wrangler(staged);
      let candidate;
      for(let attempt=0;attempt<30;attempt++){
        const current=await activeVersion();
        if(current!==base){assert(await owned(current),'FOREIGN_ACTIVE_VERSION_STOP');candidate=current;break}
        await delay(1500);
      }
      assert(candidate,'NO_OWNED_PRODUCTION_CANDIDATE');
      report.candidateVersion=candidate;
      save();

      let published=false;
      for(let attempt=0;attempt<25;attempt++){
        const directIndex=sha(await publicFile('/index.html',undefined,directOrigin));
        const directFlags=sha(await publicFile('/league-flags-343.js',undefined,directOrigin));
        if(directIndex===expectedIndexSha&&directFlags===expectedFlagsSha){published=true;break}
        await delay(1500);
      }
      assert(published,'FLAG_ASSETS_NOT_PUBLISHED');

      assert.equal(sha(await publicFile('/index.html')),expectedIndexSha,'PUBLIC_INDEX_NOT_UPDATED');
      assert.equal(sha(await publicFile('/league-flags-343.js')),expectedFlagsSha,'PUBLIC_FLAGS_NOT_UPDATED');
      for(const [path,expected] of Object.entries(protectedFiles)) assert.equal(sha(await publicFile(path)),expected,`UNRELATED_ASSET_CHANGED_STOP:${path}`);

      report.liveCoverageAfter=await liveCountryCoverage();
      report.backendAfter=await backend();
      assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');
      report.configAfterSha=sha(canonical(await api(`/scripts/${script}/settings`)));
      assert.equal(report.configAfterSha,report.configBeforeSha,'PRODUCTION_CONFIG_CHANGED_STOP');
      report.cronsAfter=await schedules();
      assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');
      report.ui=await uiCheck('production');
      assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_STOP');
      assert(await owned(candidate),'FINAL_MODULE_BYTES_CHANGED_STOP');
      report.finalVersion=candidate;
      report.result='SUCCESS';
      report.unrelatedAssetsUnchanged=true;
      report.workerLogicUnchanged=true;
      report.apiSignalsStatisticsOddsEventFlowUnchanged=true;
      console.log(`FINAL_PRODUCTION=${candidate}`);
    }catch(error){
      try{await rollback()}catch(rollbackError){report.rollbackError=rollbackError.message}
      throw error;
    }
  }
  report.completedAt=new Date().toISOString();
  save();
  if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 League Flags 143\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nIcons: 143 · aliases: 167\n\nScope: index.html + league-flags-343.js only\n`);
  console.log(report.result);
}catch(error){
  report.result='FAIL_STOPPED';
  report.error=error.message;
  report.completedAt=new Date().toISOString();
  save();
  console.error(error.stack);
  process.exitCode=1;
}
