import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const EXPECTED_VERSION='4b586772-14c6-4269-85c2-4b1d8399ea2e';
const EXPECTED_INDEX_SHA='a1fa5dfe64bc20efc3206d4a9d1d7e5269eef9952aafd205a61ca0159958166d';
const EXPECTED_CSS_SHA='c7691e937a87c4424eea4e89ba07187917f50f520537d073b556434fe735048c';
const EXPECTED_JS_SHA='fc4a620148d47d10b24798ade6607daa543ecd55f5c1453e92d89c365ab5ca3e';
const LIGHT_PATH='assets/affiliate/12bet-logo.png';
const DARK_PATH='assets/affiliate/12bet-logo-dark.png';
const LIGHT_SHA='da95a4d89533a4b1240e7b4fcf8a67f088c02d0fc4215c63fc774faea35f66d8';
const DARK_LOGO=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAAAYCAYAAAAMAljuAAAFNklEQVR42u2Yz6td1RXHP9+9z7nJM94Q2mhaqIUGUWyhLR1YHTkRtJRi4sCBww4KBU1B+g9UkUId1YlQoQPRiuhAB6ItDsRS27TYijiooVhQxBICNnk0ee/uH18HZ5/3Tt6LzWvgBR+9C/Y9996zf66113d914KlLGUpS1nKUq5MtNsL2N5YQ5Knv//rxiRvzAFhh4fx0H1jnHZ4Rv+v+hDUPWftrcrfqTGutP/ECBji0kMuVmaUVGwH4ACwkLRu+wCwAnh1dVXz+ZzV1dWLxs7ncySdaYrtgS+vQdg/uf0X2nNlsqTgg9EoAhuuBQ6PHrDWzjuZxwze92+gAF+8MMyj/ZMx4/cLm+tVwYd7xiC2JcmnTp3ad/To0d9JuglYDyHcWUr5Xozx4ZxzArpLwY4kAX8PMd7PwYOr6fz591XrSlMaW2AJQBEw/ks09wn+leGHUXo44y+APMKesDeP7dyhWZEfoXImSr9MMO5LG70wIAMOw+BznX1kL0FVTCndXUp5w7ZzSrbtlNJdOeeHfBlJaVFtu9jPGK5NXbduyVmyJTu0Z2tZ8kLKlpwDDxiuH97hJOq072ajNbmIR3LgxPRdEc6t1dZvbAsp7Zbuul2atwdeCCEcyDmldiMjcE2M8WngJJBISQnU9z1AyTnPgWelcBiohhtWYf+Ka07QRVDGTzjwnMysKywS3BqkX2i42VTYV+GmHkiwFtG+ih+t5rW2hzo6VgcGhwD//I9ZP4D/CtQ0kIpfBfg6mILesv2TNt4TT90zBomSXqu1Vin8wDZAkNRLOg2c/qyBOaezMcbrG3ylOXi0aAAV8d4s88YEsj4yPJYHSIrtTKPSQwAl8/IM/riDfX88fklwrsETBX8ygzevBrrslkHWu647ZvsW4HiLF1CKB6Xnn8YYby+ltEs9xA7DNba/Ukpei7Hr3ZS7JdDNk3i8QzcnSBm+JqgBVGGtr5zMMBumHLhzgBuTuD+gQxUyWB46lA71RXo11vps8+wKOONuZM0Bd421hcl+y14yiG0rpXSowdHwZwhnc84/ijE+BhDjZZnpS8DCIQTV3JSDDPchjvQtoi+g9NBXeP95+P1xuHvKWGrgUG890LxsG5exK4LfvAt8A4oGr/Tog3VQVPHAwOpe9BAkebFYlG3r1fp9YiyllGL7NPBiAE9OGUIIcinvxL5/8vzKypf69bUC6pseq8TPqvlqhXXDtzo4lmHRw833wr2xQc+E236S8c87OJihhE2DlIB7Aq9TBmNsZ6Cakro9C1lDZO/7rScJhFAH54gx5/zbvu8fvFyilyTT6GqFs7PKE6OSzsMNvXSsDu9N4HCqfNy32yxgVvmH4Ontiflolg3Vl01O3CoFahnOVTLKrhokpUTf96UdOXRQU62Og4cY+GbO+cSE/QwuUKv7EEKO8QOkP0hULFdTgDtyIDOwqSTznToosjR8qQ2ZZFwrKlX8eCG+Pa4zBoIANUKk8rbgzZarjFBVQWX45b1XJtmahwAsFovbLs4v0j0551e8Q8n2e+fguhyDL51LbG8L+K7hSJby1nzlki3ISfy6+U03ekgS747jkwaGttOa2ucyqDfIOgv8qZSSY4xd13Vncs7vAIdKKRmQ7SqJRo3H+FOi1DmEt+eQs/nzkF/YQtUbzMvjZwxwweLJmTkJkOx7gBN5KJ/UxuImAUJUKL3dWfxtc6oBpCyewj7eiMBbyzr0ld8E+SpUsf/vyu+XKsPvoMobxvzAm1m1d6gIb5kvTMfqalKtpSxlKUtZylKuQD4F3qVFkN3JO1IAAAAASUVORK5CYII=','base64');
const DARK_SHA='5ec92e197ea9f7c832c15185cf03b5ac1b9d9d0b7916d699f9296a31cdb6aced';
const OLD_CSS_HREF='full-market-bookmaker-343.css?v=343-affiliate-logo-click-20260928a';
const NEW_CSS_HREF='full-market-bookmaker-343.css?v=343-12bet-theme-logo-20261006a';
const CSS_PATCH='\n/* BALL46 12BET THEME LOGO 20261006 */\n.fmb-book-logo[data-b46-book-logo="12bet"]{background:url("/assets/affiliate/12bet-logo.png") left center/contain no-repeat}\n.fmb-book-logo[data-b46-book-logo="12bet"] img{opacity:0}\nhtml[data-theme="dark"] .fmb-book-logo[data-b46-book-logo="12bet"]{background-image:url("/assets/affiliate/12bet-logo-dark.png")}\n';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={startedAt:new Date().toISOString(),scope:'12BET theme logo only: light uses dark 12; dark uses white 12. No bookmaker JS/affiliate URL/odds logic changes.'};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null;
async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback 12BET theme-logo split'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(sha(DARK_LOGO),DARK_SHA,'DARK_LOGO_BYTES_MISMATCH');
  const cur=await inspect(); base=cur.restore.version;
  assert.equal(base,EXPECTED_VERSION,'STOP_PRODUCTION_VERSION_MOVED');
  const settings=await api(`/scripts/${script}/settings`), crons=await schedules();
  const settingsSha=sha(canonical(settings)), workerSha=sha(Buffer.from(cur.source));
  const staged=await stageCurrentRail(cur.version,settings,crons,cur.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const indexPath=resolve(staged.runtime,'assets','index.html');
  const cssPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.css');
  const jsPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.js');
  const beforeIndex=readFileSync(indexPath,'utf8'), beforeCss=readFileSync(cssPath,'utf8'), beforeJs=readFileSync(jsPath,'utf8');
  assert.equal(sha(Buffer.from(beforeIndex)),EXPECTED_INDEX_SHA,'STOP_INDEX_MOVED');
  assert.equal(sha(Buffer.from(beforeCss)),EXPECTED_CSS_SHA,'STOP_CSS_MOVED');
  assert.equal(sha(Buffer.from(beforeJs)),EXPECTED_JS_SHA,'STOP_JS_MOVED');
  assert(beforeIndex.includes(OLD_CSS_HREF),'CSS_HREF_MARKER_MISSING');
  assert(!beforeCss.includes('BALL46 12BET THEME LOGO 20261006'),'THEME_PATCH_ALREADY_PRESENT');

  const liveLight=await publicFile('/'+LIGHT_PATH,'image');
  assert.equal(sha(liveLight),LIGHT_SHA,'STOP_LIGHT_LOGO_MOVED');

  const lightFile=resolve(staged.runtime,'assets',LIGHT_PATH);
  const darkFile=resolve(staged.runtime,'assets',DARK_PATH);
  mkdirSync(dirname(lightFile),{recursive:true});
  writeFileSync(lightFile,liveLight);
  writeFileSync(darkFile,DARK_LOGO);

  const afterIndex=beforeIndex.replace(OLD_CSS_HREF,NEW_CSS_HREF);
  const afterCss=beforeCss+CSS_PATCH;
  writeFileSync(indexPath,afterIndex);
  writeFileSync(cssPath,afterCss);

  const protectedHashes={...staged.hashes};
  delete protectedHashes['index.html'];
  delete protectedHashes['full-market-bookmaker-343.css'];

  report.before={version:base,indexSha:EXPECTED_INDEX_SHA,cssSha:EXPECTED_CSS_SHA,jsSha:EXPECTED_JS_SHA,lightLogoSha:LIGHT_SHA};
  report.after={indexSha:sha(Buffer.from(afterIndex)),cssSha:sha(Buffer.from(afterCss)),jsSha:EXPECTED_JS_SHA,lightLogoSha:LIGHT_SHA,darkLogoSha:DARK_SHA,darkPath:DARK_PATH};
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
        const pubIndex=(await publicFile('/index.html','html')).toString('utf8');
        const pubCss=(await publicFile('/full-market-bookmaker-343.css','css')).toString('utf8');
        const pubJs=await publicFile('/full-market-bookmaker-343.js','javascript');
        const pubLight=await publicFile('/'+LIGHT_PATH,'image');
        const pubDark=await publicFile('/'+DARK_PATH,'image');
        if(pubIndex.includes(NEW_CSS_HREF)&&pubCss.includes('html[data-theme="dark"] .fmb-book-logo[data-b46-book-logo="12bet"]')&&sha(pubJs)===EXPECTED_JS_SHA&&sha(pubLight)===LIGHT_SHA&&sha(pubDark)===DARK_SHA){ok=true;break}
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
    console.log('BALL46_12BET_THEME_LOGO_SUCCESS',JSON.stringify({base,candidate,indexSha:report.after.indexSha,cssSha:report.after.cssSha,jsSha:EXPECTED_JS_SHA,lightLogoSha:LIGHT_SHA,darkLogoSha:DARK_SHA}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
