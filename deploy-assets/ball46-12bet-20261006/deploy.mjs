import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const EXPECTED_VERSION='ad5a7a11-0218-4072-8baf-8f060cae64ce';
const EXPECTED_JS_SHA='44d036288934864e12ff61f2acceddfac0dd8342fb7e4fdc4d5b9eb24899aa4d';
const EXPECTED_CSS_SHA='c7691e937a87c4424eea4e89ba07187917f50f520537d073b556434fe735048c';
const AFF='https://goto.elv520.com/join/49549/id/facebook/index.html';
const LOGO_PATH='assets/affiliate/12bet-logo.png';
const LOGO=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAAAYCAYAAAAMAljuAAAFNklEQVR42u2Yz6td1RXHP9+9z7nJM94Q2mhaqIUGUWyhLR1YHTkRtJRi4sCBww4KBU1B+g9UkUId1YlQoQPRiuhAB6ItDsRS27TYijiooVhQxBICNnk0ee/uH18HZ5/3Tt6LzWvgBR+9C/Y9996zf66113d914KlLGUpS1nKUq5MtNsL2N5YQ5Knv//rxiRvzAFhh4fx0H1jnHZ4Rv+v+hDUPWftrcrfqTGutP/ECBji0kMuVmaUVGwH4ACwkLRu+wCwAnh1dVXz+ZzV1dWLxs7ncySdaYrtgS+vQdg/uf0X2nNlsqTgg9EoAhuuBQ6PHrDWzjuZxwze92+gAF+8MMyj/ZMx4/cLm+tVwYd7xiC2JcmnTp3ad/To0d9JuglYDyHcWUr5Xozx4ZxzArpLwY4kAX8PMd7PwYOr6fz591XrSlMaW2AJQBEw/ks09wn+leGHUXo44y+APMKesDeP7dyhWZEfoXImSr9MMO5LG70wIAMOw+BznX1kL0FVTCndXUp5w7ZzSrbtlNJdOeeHfBlJaVFtu9jPGK5NXbduyVmyJTu0Z2tZ8kLKlpwDDxiuH97hJOq072ajNbmIR3LgxPRdEc6t1dZvbAsp7Zbuul2atwdeCCEcyDmldiMjcE2M8WngJJBISQnU9z1AyTnPgWelcBiohhtWYf+Ka07QRVDGTzjwnMysKywS3BqkX2i42VTYV+GmHkiwFtG+ih+t5rW2hzo6VgcGhwD//I9ZP4D/CtQ0kIpfBfg6mILesv2TNt4TT90zBomSXqu1Vin8wDZAkNRLOg2c/qyBOaezMcbrG3ylOXi0aAAV8d4s88YEsj4yPJYHSIrtTKPSQwAl8/IM/riDfX88fklwrsETBX8ygzevBrrslkHWu647ZvsW4HiLF1CKB6Xnn8YYby+ltEs9xA7DNba/Ukpei7Hr3ZS7JdDNk3i8QzcnSBm+JqgBVGGtr5zMMBumHLhzgBuTuD+gQxUyWB46lA71RXo11vps8+wKOONuZM0Bd421hcl+y14yiG0rpXSowdHwZwhnc84/ijE+BhDjZZnpS8DCIQTV3JSDDPchjvQtoi+g9NBXeP95+P1xuHvKWGrgUG890LxsG5exK4LfvAt8A4oGr/Tog3VQVPHAwOpe9BAkebFYlG3r1fp9YiyllGL7NPBiAE9OGUIIcinvxL5/8vzKypf69bUC6pseq8TPqvlqhXXDtzo4lmHRw833wr2xQc+E236S8c87OJihhE2DlIB7Aq9TBmNsZ6Cakro9C1lDZO/7rScJhFAH54gx5/zbvu8fvFyilyTT6GqFs7PKE6OSzsMNvXSsDu9N4HCqfNy32yxgVvmH4Ontiflolg3Vl01O3CoFahnOVTLKrhokpUTf96UdOXRQU62Og4cY+GbO+cSE/QwuUKv7EEKO8QOkP0hULFdTgDtyIDOwqSTznToosjR8qQ2ZZFwrKlX8eCG+Pa4zBoIANUKk8rbgzZarjFBVQWX45b1XJtmahwAsFovbLs4v0j0551e8Q8n2e+fguhyDL51LbG8L+K7hSJby1nzlki3ISfy6+U03ekgS747jkwaGttOa2ucyqDfIOgv8qZSSY4xd13Vncs7vAIdKKRmQ7SqJRo3H+FOi1DmEt+eQs/nzkF/YQtUbzMvjZwxwweLJmTkJkOx7gBN5KJ/UxuImAUJUKL3dWfxtc6oBpCyewj7eiMBbyzr0ld8E+SpUsf/vyu+XKsPvoMobxvzAm1m1d6gIb5kvTMfqalKtpSxlKUtZylKuQD4F3qVFkN3JO1IAAAAASUVORK5CYII=','base64');

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={startedAt:new Date().toISOString(),scope:'12BET only: add non-clickable logo asset and affiliate links on odds values only.'};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

let base=null,candidate=null;
async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback 12BET affiliate patch'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  const current=await inspect();
  base=current.restore.version;
  report.baseVersion=base;
  assert.equal(base,EXPECTED_VERSION,'STOP_PRODUCTION_VERSION_MOVED');

  const settings=await api(`/scripts/${script}/settings`);
  const crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const jsPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.js');
  const cssPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.css');
  const beforeJs=readFileSync(jsPath,'utf8');
  const beforeCss=readFileSync(cssPath,'utf8');
  assert.equal(sha(Buffer.from(beforeJs)),EXPECTED_JS_SHA,'STOP_FULL_MARKET_JS_MOVED');
  assert.equal(sha(Buffer.from(beforeCss)),EXPECTED_CSS_SHA,'STOP_FULL_MARKET_CSS_MOVED');
  assert(!beforeJs.includes("'12bet':'https://goto.elv520.com"),'STOP_12BET_AFF_ALREADY_PRESENT');
  assert(!beforeJs.includes("'12bet':'/assets/affiliate/12bet-logo.png'"),'STOP_12BET_LOGO_ALREADY_PRESENT');

  const oldAff='  \'betsson\':"https://www.betsson.mx/apuestas-deportivas/futbol/copa-libertadores/copa-libertadores?from=m-W7IdPQSGxx3x_byoiPYGNd7ZgqdRLk-AV3462274676&affcode=AV3462274676&utm_medium=Affiliates&utm_source=10685357&tab=liveAndUpcoming"\n});';
  const newAff='  \'betsson\':"https://www.betsson.mx/apuestas-deportivas/futbol/copa-libertadores/copa-libertadores?from=m-W7IdPQSGxx3x_byoiPYGNd7ZgqdRLk-AV3462274676&affcode=AV3462274676&utm_medium=Affiliates&utm_source=10685357&tab=liveAndUpcoming",\n  \'12bet\':\''+AFF+'\'\n});';
  assert(beforeJs.includes(oldAff),'AFFILIATE_MAP_MARKER_MISSING');
  let afterJs=beforeJs.replace(oldAff,newAff);

  const oldLogo='  \'betsson\':"https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/ops/ball46-betsson-affiliate-20261005/assets/affiliate/betsson-logo.png"\n});';
  const newLogo='  \'betsson\':"https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/ops/ball46-betsson-affiliate-20261005/assets/affiliate/betsson-logo.png",\n  \'12bet\':\'/assets/affiliate/12bet-logo.png\'\n});';
  assert(afterJs.includes(oldLogo),'BOOK_LOGO_MAP_MARKER_MISSING');
  afterJs=afterJs.replace(oldLogo,newLogo);

  assert(afterJs.includes("'12bet':'"+AFF+"'"),'AFFILIATE_PATCH_MISSING');
  assert(afterJs.includes("'12bet':'/assets/affiliate/12bet-logo.png'"),'LOGO_PATCH_MISSING');
  assert(afterJs.includes('function affiliatePriceHtml(v,slug)'),'PRICE_LINK_FUNCTION_CHANGED');
  assert(afterJs.includes('function bookLabelHtml(b)'),'LOGO_FUNCTION_CHANGED');
  assert(beforeCss===readFileSync(cssPath,'utf8'),'CSS_CHANGED_BEFORE_WRITE');
  assert(beforeCss.includes('.fmb-book-logo{display:flex;align-items:center;justify-content:flex-start;width:auto;max-width:50px;height:12px;max-height:12px;overflow:hidden;pointer-events:none}'),'NON_CLICKABLE_LOGO_GUARD_MISSING');

  writeFileSync(jsPath,afterJs);
  const logoTarget=resolve(staged.runtime,'assets',LOGO_PATH);
  mkdirSync(dirname(logoTarget),{recursive:true});
  writeFileSync(logoTarget,LOGO);

  const protectedHashes={...staged.hashes};
  delete protectedHashes['full-market-bookmaker-343.js'];
  const cssExpected=protectedHashes['full-market-bookmaker-343.css'];

  report.before={jsSha:EXPECTED_JS_SHA,cssSha:EXPECTED_CSS_SHA,version:base};
  report.after={jsSha:sha(Buffer.from(afterJs)),logoSha:sha(LOGO),logoBytes:LOGO.length,logoPath:LOGO_PATH,affiliateUrl:AFF};
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_DRY_RUN');

  try{
    wrangler(staged,false);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');

    for(let i=0;i<25;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        const pubJs=(await publicFile('/full-market-bookmaker-343.js','javascript')).toString('utf8');
        const pubCss=await publicFile('/full-market-bookmaker-343.css','css');
        const pubLogo=await publicFile('/assets/affiliate/12bet-logo.png','image');
        if(pubJs.includes("'12bet':'"+AFF+"'")&&pubJs.includes("'12bet':'/assets/affiliate/12bet-logo.png'")&&sha(pubCss)===cssExpected&&sha(pubLogo)===sha(LOGO))break;
        if(i===24)throw new Error('PUBLIC_VERIFY_NOT_CONVERGED');
      }catch(e){if(i===24)throw e}
      await delay(1000);
    }

    for(const [p,h] of Object.entries(protectedHashes))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),main=cv.modules.find(m=>m.name===cv.main_module);assert(main,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(Buffer.from(main.content_base64,'base64').toString('utf8'))),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED');

    report.result='SUCCESS';report.candidateVersion=candidate;report.completedAt=new Date().toISOString();save();
    console.log('BALL46_12BET_DEPLOY_SUCCESS',JSON.stringify({base,candidate,jsSha:report.after.jsSha,logoSha:report.after.logoSha,affiliateUrl:AFF}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
