import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const EASY_PATH='assets/affiliate/easybet-logo.png';
const AFF='https://track.matchbook-gaming.com/o/RjE8Gt?site_id=101060';
const CSS_MARK='/* BALL46 EASYBET SIZE 120 20261007 */';
const CSS_PATCH=`
${CSS_MARK}
.fmb-book-logo[data-b46-book-logo="easybets"]{
  max-width:60px;
  height:14.4px;
  max-height:14.4px;
}
.fmb-book-logo[data-b46-book-logo="easybets"] img{
  max-width:60px;
  height:14.4px;
  max-height:14.4px;
  width:auto;
  object-fit:contain;
}
`;
const NEW_Q='full-market-bookmaker-343.css?v=343-easybet-size120-20261007a';
const delay=ms=>new Promise(r=>setTimeout(r,ms));

mkdirSync('audit',{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'EasyBet logo display size +20% only. Preserve current Production rail, EasyBet logo bytes, JS, affiliate URL, Engine, Statistics, EventFlow, worker, settings, crons and unrelated assets.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null;

async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback EasyBet +20% logo size 20261007'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  const current=await inspect(); base=current.restore.version; report.baseVersion=base;
  const settings=await api(`/scripts/${script}/settings`);
  const crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const jsPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.js');
  const cssPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.css');
  const indexPath=resolve(staged.runtime,'assets','index.html');
  const beforeJs=readFileSync(jsPath,'utf8');
  const beforeCss=readFileSync(cssPath,'utf8');
  const beforeIndex=readFileSync(indexPath,'utf8');
  const jsSha=sha(Buffer.from(beforeJs)), cssSha=sha(Buffer.from(beforeCss)), indexSha=sha(Buffer.from(beforeIndex));

  assert(beforeJs.includes("'easybets':'"+AFF+"'"),'STOP_EASYBET_AFFILIATE_NOT_CURRENT');
  assert(beforeJs.includes("'easybets':'/assets/affiliate/easybet-logo.png'"),'STOP_EASYBET_LOGO_MAPPING_NOT_CURRENT');
  assert(!beforeCss.includes(CSS_MARK),'SIZE_PATCH_ALREADY_PRESENT');

  const logo=await publicFile('/'+EASY_PATH,'image');
  const logoSha=sha(logo);
  const logoTarget=resolve(staged.runtime,'assets',EASY_PATH);
  mkdirSync(dirname(logoTarget),{recursive:true});
  writeFileSync(logoTarget,logo);

  const afterCss=beforeCss+CSS_PATCH;
  const re=/full-market-bookmaker-343\.css\?v=[^"'\s>]+/;
  assert(re.test(beforeIndex),'CSS_QUERY_MARKER_MISSING');
  const afterIndex=beforeIndex.replace(re,NEW_Q);
  writeFileSync(cssPath,afterCss);
  writeFileSync(indexPath,afterIndex);

  const protectedHashes={...staged.hashes};
  delete protectedHashes['full-market-bookmaker-343.css'];
  delete protectedHashes['index.html'];

  report.before={version:base,jsSha,cssSha,indexSha,logoSha};
  report.after={jsSha,cssSha:sha(Buffer.from(afterCss)),indexSha:sha(Buffer.from(afterIndex)),logoSha,width:'60px',height:'14.4px'};
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
        const pubJs=(await publicFile('/full-market-bookmaker-343.js','javascript')).toString('utf8');
        const pubCss=(await publicFile('/full-market-bookmaker-343.css','css')).toString('utf8');
        const pubIndex=(await publicFile('/index.html','html')).toString('utf8');
        const pubLogo=await publicFile('/'+EASY_PATH,'image');
        if(sha(Buffer.from(pubJs))===jsSha &&
           pubCss.includes(CSS_MARK) &&
           pubCss.includes('max-width:60px') &&
           pubCss.includes('height:14.4px') &&
           pubIndex.includes(NEW_Q) &&
           sha(pubLogo)===logoSha &&
           pubJs.includes("'easybets':'"+AFF+"'")){ok=true;break}
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
    console.log('BALL46_EASYBET_SIZE120_20261007_SUCCESS',JSON.stringify({base,candidate,jsSha,oldCssSha:cssSha,newCssSha:report.after.cssSha,logoSha,affiliateUrl:AFF,width:'60px',height:'14.4px'}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
