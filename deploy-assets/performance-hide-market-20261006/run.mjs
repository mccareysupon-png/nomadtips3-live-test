import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='index.html';
const BRANCH='work/ball46-performance-hide-market-20261006';
const STYLE_ID='b46-performance-summary-only-20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),
scope:'Performance Card only: hide market-breakdown UI and remove duplicate per-row market classification/counters. Do not change totals, win/loss/push/pending, avg odds, win rate, Statistics API, engine, settlement, signals, Worker source, bindings or schedules.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patch(html){
  const sid='b46-daily-performance-runtime';
  const open='<script id="'+sid+'">';
  const s=html.indexOf(open),bs=html.indexOf('>',s)+1,e=html.indexOf('</script>',bs);
  assert(s>=0&&e>bs,'PERFORMANCE_RUNTIME_MISSING');
  let js=html.slice(bs,e);

  const marketFn="function market(r){const x=String(r?.marketLabel??r?.market??r?.marketType??'').toLowerCase().replace(/[_-]+/g,' ');if(/asian|handicap|\\bah\\b/.test(x))return'AH';if(/over\\s*\\/?\\s*under|\\bover\\b|\\bunder\\b|o\\s*\\/?\\s*u|goal line|total|corner/.test(x))return'O/U';if(/1x2|match result|moneyline/.test(x))return'1X2';return null}";
  const oldBucket="function bucket(){return{win:0,loss:0,push:0,pending:0,oddsSum:0,oddsCount:0,markets:{AH:{win:0,loss:0,push:0},'O/U':{win:0,loss:0,push:0},'1X2':{win:0,loss:0,push:0}}}}";
  const newBucket="function bucket(){return{win:0,loss:0,push:0,pending:0,oddsSum:0,oddsCount:0}}";
  const oldAdd="function addSettled(b,r,o){b[o]++;addOdds(b,r);const m=market(r);if(m)b.markets[m][o]++}";
  const newAdd="function addSettled(b,r,o){b[o]++;addOdds(b,r)}";
  const marketHtml=/function marketHtml\(b\)\{return\['AH','O\/U','1X2'\]\.map\(m=>`<span class="b46-market"><b>\$\{m\}<\/b><span>W \$\{b\.markets\[m\]\.win\} · L \$\{b\.markets\[m\]\.loss\} · P \$\{b\.markets\[m\]\.push\}<\/span><\/span>`\)\.join\(''\)\}/;
  const oldPaint="const box=$(`[data-b46-markets="${day}"]`,r),h=marketHtml(b);if(box&&box.innerHTML!==h)box.innerHTML=h";

  assert(js.includes(marketFn),'MARKET_FUNCTION_SHAPE_CHANGED');
  assert(js.includes(oldBucket),'BUCKET_SHAPE_CHANGED');
  assert(js.includes(oldAdd),'ADD_SETTLED_SHAPE_CHANGED');
  assert(marketHtml.test(js),'MARKET_HTML_SHAPE_CHANGED');
  assert(js.includes(oldPaint),'MARKET_PAINT_SHAPE_CHANGED');

  js=js.replace(marketFn,'')
       .replace(oldBucket,newBucket)
       .replace(oldAdd,newAdd)
       .replace(marketHtml,'')
       .replace(oldPaint,'');

  assert(!/function\s+market\s*\(/.test(js),'MARKET_FUNCTION_STILL_PRESENT');
  assert(!js.includes('b.markets'),'MARKET_COUNTER_STILL_REFERENCED');
  assert(!js.includes('marketHtml('),'MARKET_HTML_STILL_REFERENCED');

  let out=html.slice(0,bs)+js+html.slice(e);
  const style=`<style id="${STYLE_ID}">#ball46-daily-performance [data-b46-markets]{display:none!important}</style>`;
  assert(!out.includes(`id="${STYLE_ID}"`),'SUMMARY_ONLY_STYLE_ALREADY_PRESENT');
  out=out.slice(0,s)+style+'\n'+out.slice(s);
  assert(out.includes('data-b46-stat="today-win"')||out.includes('data-b46-stat=\\\"today-win\\\"')||out.includes('today-win'),'TOTAL_STAT_MARKUP_MISSING');
  return out;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version){report.rollback={status:'base-still-active',version:a};save();return}
  if(candidate&&a!==candidate){report.rollback={status:'skipped-foreign-active',version:a};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Performance summary-only ${report.run}`}})});
  for(let i=0;i<20;i++){if(await activeVersion()===current.restore.version)break;await delay(1000)}
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();
  const base=current.restore.version;report.baseVersion=base;report.rollbackVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();

  const beforeBytes=await publicFile('/index.html','html'),before=beforeBytes.toString('utf8');
  report.indexBeforeSha=sha(beforeBytes);writeFileSync('audit/index-before.html',beforeBytes);
  assert(before.includes('b46-daily-performance-runtime'),'PERFORMANCE_RUNTIME_NOT_CURRENT');
  const after=patch(before),afterBytes=Buffer.from(after),afterSha=sha(afterBytes);
  assert.notEqual(afterSha,report.indexBeforeSha,'INDEX_UNCHANGED');
  report.indexAfterSha=afterSha;writeFileSync('audit/index-after.html',afterBytes);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],report.indexBeforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
  report.protectedAssetCount=Object.keys(protectedAssets).length;save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.completedAt=new Date().toISOString();save();console.log('ROLLBACK_VERSION='+base);console.log('BALL46_PERFORMANCE_SUMMARY_ONLY_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');try{const b=await publicFile('/index.html','html',directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes(STYLE_ID)&&!t.includes('function market(r)')&&!t.includes('marketHtml(b)')){directOk=true;break}}catch{}await delay(1000)}
    assert(directOk,'SUMMARY_ONLY_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const b=await publicFile('/index.html','html'),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes(STYLE_ID)&&!t.includes('function market(r)')&&!t.includes('marketHtml(b)')){publicOk=true;break}}catch{}await delay(1200)}
    assert(publicOk,'SUMMARY_ONLY_NOT_PUBLIC');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const [boardJson,signalsJson,statsJson]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1'].map(async p=>JSON.parse((await publicFile(p,'json')).toString?.()||'{}')));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');
    assert.equal(sha(Buffer.from(finalSource)),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    report.finalVersion=candidate;report.workerSourceUntouched=true;report.engineUntouched=true;report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('ROLLBACK_VERSION='+base);console.log('FINAL_PRODUCTION='+candidate);console.log('INDEX_SHA='+afterSha);console.log('BALL46_PERFORMANCE_SUMMARY_ONLY_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}