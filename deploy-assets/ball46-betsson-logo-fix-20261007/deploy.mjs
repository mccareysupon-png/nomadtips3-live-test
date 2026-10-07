import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const AFF='https://www.betsson.mx/apuestas-deportivas/futbol/copa-libertadores/copa-libertadores?from=m-W7IdPQSGxx3x_byoiPYGNd7ZgqdRLk-AV3462274676&affcode=AV3462274676&utm_medium=Affiliates&utm_source=10685357&tab=liveAndUpcoming';
const OLD_LOGO='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/ops/ball46-betsson-affiliate-20261005/assets/affiliate/betsson-logo.png';
const LOCAL='/assets/affiliate/betsson-logo.png';
const LOGO_PATH='assets/affiliate/betsson-logo.png';
const LOGO=Buffer.from('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','base64');
const LOGO_SHA='000415b04f23d56273508da3302fc64a5f07aabc46356e40e588c7aefd09d153';
const NEW_JS_Q='full-market-bookmaker-343.js?v=343-betsson-local-logo-20261007a';
const PRESERVE_AFF=['assets/affiliate/easybet-logo.png','assets/affiliate/12bet-logo.png','assets/affiliate/12bet-logo-dark.png'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'Betsson logo repair only: replace corrupted remote PNG with clean local PNG, preserve affiliate URL, CSS, Engine, Statistics, EventFlow, worker/settings/crons and unrelated assets.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null;

async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback Betsson local logo repair'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(sha(LOGO),LOGO_SHA,'LOGO_BYTES_MISMATCH');
  const current=await inspect(); base=current.restore.version;
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
  const cssSha=sha(Buffer.from(beforeCss));
  const indexSha=sha(Buffer.from(beforeIndex));

  assert(beforeJs.includes("'betsson':\""+AFF+"\""),'STOP_BETSSON_AFFILIATE_NOT_CURRENT');
  assert(beforeJs.includes("'betsson':\""+OLD_LOGO+"\""),'STOP_BETSSON_LOGO_MAPPING_NOT_CURRENT');

  const afterJs=beforeJs.replace("'betsson':\""+OLD_LOGO+"\"","'betsson':'"+LOCAL+"'");
  assert(afterJs!==beforeJs,'BETSSON_JS_NOT_CHANGED');
  writeFileSync(jsPath,afterJs);

  const logoTarget=resolve(staged.runtime,'assets',LOGO_PATH);
  mkdirSync(dirname(logoTarget),{recursive:true});
  writeFileSync(logoTarget,LOGO);

  const preserved={};
  for(const p of PRESERVE_AFF){
    try{
      const b=await publicFile('/'+p,'image');
      preserved[p]=sha(b);
      const t=resolve(staged.runtime,'assets',p);
      mkdirSync(dirname(t),{recursive:true});
      writeFileSync(t,b);
    }catch{}
  }

  const re=/full-market-bookmaker-343\.js\?v=[^"'\s>]+/;
  assert(re.test(beforeIndex),'JS_QUERY_MARKER_MISSING');
  const afterIndex=beforeIndex.replace(re,NEW_JS_Q);
  writeFileSync(indexPath,afterIndex);

  const protectedHashes={...staged.hashes};
  delete protectedHashes['full-market-bookmaker-343.js'];
  delete protectedHashes['index.html'];

  report.before={version:base,jsSha:sha(Buffer.from(beforeJs)),cssSha,indexSha,oldLogo:OLD_LOGO,preserved};
  report.after={jsSha:sha(Buffer.from(afterJs)),cssSha,indexSha:sha(Buffer.from(afterIndex)),logoSha:LOGO_SHA,logoPath:LOCAL};
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
        const pubCss=await publicFile('/full-market-bookmaker-343.css','css');
        const pubIndex=(await publicFile('/index.html','html')).toString('utf8');
        const pubLogo=await publicFile('/'+LOGO_PATH,'image');
        let preserveOk=true;
        for(const [p,h] of Object.entries(preserved))preserveOk=preserveOk&&sha(await publicFile('/'+p,'image'))===h;
        if(pubJs.includes("'betsson':'"+LOCAL+"'") &&
           pubJs.includes("'betsson':\""+AFF+"\"") &&
           sha(pubCss)===cssSha &&
           pubIndex.includes(NEW_JS_Q) &&
           sha(pubLogo)===LOGO_SHA &&
           preserveOk){ok=true;break}
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
    console.log('BALL46_BETSSON_LOCAL_LOGO_FIX_SUCCESS',JSON.stringify({base,candidate,logoSha:LOGO_SHA,logoPath:LOCAL,affiliateUrl:AFF,jsSha:report.after.jsSha,cssSha}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
