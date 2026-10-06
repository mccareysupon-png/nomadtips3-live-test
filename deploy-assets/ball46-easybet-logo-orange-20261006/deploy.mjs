import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const EASY_PATH='assets/affiliate/easybet-logo.png';
const OLD_SHA='7f6c5de619edb23be0419c720a1e714520daf51c7c4af1150575f9bbcd53f3ec';
const NEW_LOGO=Buffer.from('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','base64');
const NEW_SHA='166b11b7ea5f25550719376d9c45f29e48780fc889baad0d95451559b78ba10b';
const AFF='https://track.matchbook-gaming.com/o/RjE8Gt?site_id=101060';
const EXTRA_ASSETS=['assets/affiliate/12bet-logo.png','assets/affiliate/12bet-logo-dark.png'];

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={startedAt:new Date().toISOString(),scope:'EasyBet logo asset swap only. Orange wordmark, transparent background, same public path. Preserve affiliate URL, JS, CSS, Engine, Statistics, EventFlow, worker, settings, crons, and unrelated assets.'};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

let base=null,candidate=null;
async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback EasyBet logo-only swap'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(sha(NEW_LOGO),NEW_SHA,'NEW_LOGO_BYTES_MISMATCH');
  const current=await inspect(); base=current.restore.version;
  const settings=await api(`/scripts/${script}/settings`);
  const crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const liveJs=(await publicFile('/full-market-bookmaker-343.js','javascript')).toString('utf8');
  const liveCss=await publicFile('/full-market-bookmaker-343.css','css');
  assert(liveJs.includes("'easybets':'"+AFF+"'"),'STOP_EASYBET_AFFILIATE_NOT_CURRENT');
  assert(liveJs.includes("'easybets':'/assets/affiliate/easybet-logo.png'"),'STOP_EASYBET_LOGO_MAPPING_NOT_CURRENT');
  const jsSha=sha(Buffer.from(liveJs)), cssSha=sha(liveCss);

  let currentLogoSha=null;
  try { currentLogoSha=sha(await publicFile('/'+EASY_PATH,'image')); } catch {}

  const extraHashes={};
  for(const p of EXTRA_ASSETS){
    try{
      const bytes=await publicFile('/'+p,'image');
      extraHashes[p]=sha(bytes);
      const target=resolve(staged.runtime,'assets',p);
      mkdirSync(dirname(target),{recursive:true});
      writeFileSync(target,bytes);
    }catch{}
  }

  const logoFile=resolve(staged.runtime,'assets',EASY_PATH);
  mkdirSync(dirname(logoFile),{recursive:true});
  writeFileSync(logoFile,NEW_LOGO);

  const protectedHashes={...staged.hashes};
  report.before={version:base,logoSha:currentLogoSha,jsSha,cssSha,extraHashes};
  report.after={logoSha:NEW_SHA,logoBytes:NEW_LOGO.length,path:EASY_PATH};
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_DRY_RUN');

  try{
    wrangler(staged,false);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');

    let ok=false;
    for(let i=0;i<25;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        const pubLogo=await publicFile('/'+EASY_PATH,'image');
        const pubJs=(await publicFile('/full-market-bookmaker-343.js','javascript')).toString('utf8');
        const pubCss=await publicFile('/full-market-bookmaker-343.css','css');
        let extrasOk=true;
        for(const [p,h] of Object.entries(extraHashes))extrasOk=extrasOk&&sha(await publicFile('/'+p,'image'))===h;
        if(sha(pubLogo)===NEW_SHA&&sha(Buffer.from(pubJs))===jsSha&&sha(pubCss)===cssSha&&pubJs.includes("'easybets':'"+AFF+"'")&&extrasOk){ok=true;break}
      }catch{}
      await delay(1000);
    }
    assert(ok,'PUBLIC_VERIFY_NOT_CONVERGED');

    for(const [p,h] of Object.entries(protectedHashes))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),main=cv.modules.find(m=>m.name===cv.main_module);assert(main,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(Buffer.from(main.content_base64,'base64').toString('utf8'))),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED');

    report.result='SUCCESS';report.candidateVersion=candidate;report.completedAt=new Date().toISOString();save();
    console.log('BALL46_EASYBET_ORANGE_LOGO_SUCCESS',JSON.stringify({base,candidate,oldLogoSha:currentLogoSha,newLogoSha:NEW_SHA,path:EASY_PATH,jsSha,cssSha,affiliateUrl:AFF}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
