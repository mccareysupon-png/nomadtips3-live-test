import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const AFF='https://www.betsson.mx/apuestas-deportivas/futbol/copa-libertadores/copa-libertadores?from=m-W7IdPQSGxx3x_byoiPYGNd7ZgqdRLk-AV3462274676&affcode=AV3462274676&utm_medium=Affiliates&utm_source=10685357&tab=liveAndUpcoming';
const OLD_LOGO='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/ops/ball46-betsson-affiliate-20261005/assets/affiliate/betsson-logo.png';
const LOCAL='/assets/affiliate/betsson-logo.png';
const LOGO_PATH='assets/affiliate/betsson-logo.png';
let LOGO=null;
let LOGO_SHA=null;
async function buildCleanLogo(){
  const r=await fetch(OLD_LOGO,{cache:'no-store'});
  assert(r.ok,'BETSSON_REMOTE_HTTP_'+r.status);
  const raw=Buffer.from(await r.arrayBuffer());
  mkdirSync('audit',{recursive:true});
  const src=resolve('audit','betsson-remote-broken.png');
  const out=resolve('audit','betsson-logo-clean.png');
  writeFileSync(src,raw);
  const py=[
    'from PIL import Image, ImageFile',
    'import sys',
    'ImageFile.LOAD_TRUNCATED_IMAGES=True',
    'im=Image.open(sys.argv[1]).convert("RGBA")',
    'im.load()',
    'bbox=im.getbbox()',
    'assert bbox is not None',
    'crop=im.crop(bbox)',
    'canvas=Image.new("RGBA",(200,40),(0,0,0,0))',
    'canvas.alpha_composite(crop,(0,(40-crop.height)//2))',
    'canvas.save(sys.argv[2],format="PNG",optimize=True)'
  ].join(';');
  execFileSync('python3',['-c',py,src,out],{stdio:'inherit'});
  LOGO=readFileSync(out);
  LOGO_SHA=sha(LOGO);
  assert(LOGO.length>1000,'CLEAN_LOGO_TOO_SMALL');
}
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
  await buildCleanLogo();
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
