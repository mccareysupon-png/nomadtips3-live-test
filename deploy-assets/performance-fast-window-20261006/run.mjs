import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='index.html';
const CARD_ID='b46-daily-performance-runtime';
const BRANCH='work/ball46-performance-fast-window-20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),
scope:'Performance Card read-path optimization only: read newest Statistics pages until the full Today+Yesterday London-day window is covered, then stop. Preserve engine, settlement, Statistics page, signals, Worker source, bindings, schedules, card visuals and all unrelated assets.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function fnNode(source,name){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'});const hits=[];
  const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id?.name===name)hits.push(n);for(const [k,v] of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}};
  walk(ast);assert.equal(hits.length,1,'FUNCTION_SHAPE:'+name);return hits[0];
}
function replaceFn(source,name,text){const n=fnNode(source,name);return source.slice(0,n.start)+text+source.slice(n.end)}

const FAST_REFRESH = `async function refresh(){if(busy)return;busy=true;try{
let st=await json('/api/engine/statistics?paged=1&_='+Date.now());
if(st?.ok!==true||!Array.isArray(st?.rows))throw Error('STATISTICS_SHAPE');
const sig=JSON.stringify([st.ledgerTotal,st.total,st.pending,st.unresolved,st.win,st.loss,st.push,st.halfWin,st.halfLoss,st.ledgerUpdatedAt]);
const tk=sportDay(Date.now()),yk=prev(tk);
let rows=[...st.rows],cursor=st.nextCursor,seen=new Set(),pages=1,canEarlyStop=true,lastStamp=Infinity,crossed=false;
const inspectPage=(arr)=>{
  for(const row of arr){
    const t=createdStamp(row);
    if(t===null){canEarlyStop=false;continue}
    if(t>lastStamp){canEarlyStop=false}
    lastStamp=t;
  }
  if(canEarlyStop&&Number.isFinite(lastStamp)&&sportDay(lastStamp)<yk)crossed=true;
};
inspectPage(st.rows);
while(cursor&&!crossed){
  if(seen.has(cursor))throw Error('STATISTICS_CURSOR_CYCLE');
  seen.add(cursor);
  const page=await json('/api/engine/statistics?paged=1&cursor='+encodeURIComponent(cursor)+'&_='+Date.now());
  if(page?.ok!==true||!Array.isArray(page?.rows))throw Error('STATISTICS_PAGE_SHAPE');
  const pageSig=JSON.stringify([page.ledgerTotal,page.total,page.pending,page.unresolved,page.win,page.loss,page.push,page.halfWin,page.halfLoss,page.ledgerUpdatedAt]);
  if(pageSig!==sig)throw Error('STATISTICS_CHANGED_DURING_READ');
  rows.push(...page.rows);pages++;inspectPage(page.rows);cursor=page.nextCursor||null;
}
if(!crossed&&cursor)throw Error('PERFORMANCE_WINDOW_NOT_COVERED');
lastGood=aggregate(rows);
render(lastGood);
const r=document.getElementById(ID);if(r){r.dataset.b46PerfPages=String(pages);r.dataset.b46PerfRows=String(rows.length)}
}catch(e){if(lastGood)render(lastGood);console.warn('B46 Daily Performance refresh skipped:',e?.message||e)}finally{busy=false}}`;

function patchCard(html){
  const open='<script id="'+CARD_ID+'">',start=html.indexOf(open);assert(start>=0,'PERFORMANCE_RUNTIME_MISSING');
  const bodyStart=html.indexOf('>',start)+1,end=html.indexOf('</script>',bodyStart);assert(end>bodyStart,'PERFORMANCE_RUNTIME_END_MISSING');
  let js=html.slice(bodyStart,end);
  assert(js.includes('STATISTICS_LEDGER_INCOMPLETE'),'EXPECTED_FULL_LEDGER_REFRESH_NOT_FOUND');
  js=replaceFn(js,'refresh',FAST_REFRESH);
  parse(js,{ecmaVersion:'latest',sourceType:'script'});
  assert(js.includes('PERFORMANCE_WINDOW_NOT_COVERED'),'FAST_WINDOW_GUARD_MISSING');
  assert(!js.includes('STATISTICS_LEDGER_INCOMPLETE'),'OLD_FULL_LEDGER_GUARD_STILL_PRESENT');
  return html.slice(0,bodyStart)+js+html.slice(end);
}

async function statsWindowProbe(){
  const t0=Date.now();
  const first=JSON.parse((await publicFile('/api/engine/statistics?paged=1','json')).toString?.()||'{}');
  return {ms:Date.now()-t0,ledgerTotal:first.ledgerTotal,rows:Array.isArray(first.rows)?first.rows.length:null,nextCursor:Boolean(first.nextCursor)};
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Performance fast window ${report.run}`}})});
  for(let i=0;i<20;i++){if(await activeVersion()===current.restore.version)break;await delay(1000)}
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;report.rollbackVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();

  const beforeBytes=await publicFile('/index.html','html'),before=beforeBytes.toString('utf8');report.indexBeforeSha=sha(beforeBytes);
  assert(before.includes('b46-flat-result-cards-runtime'),'CURRENT_FLAT_CARD_DEPLOY_MISSING');
  writeFileSync('audit/index-before.html',beforeBytes);

  const after=patchCard(before),afterBytes=Buffer.from(after),afterSha=sha(afterBytes);assert.notEqual(afterSha,report.indexBeforeSha,'INDEX_UNCHANGED');
  writeFileSync('audit/index-after.html',afterBytes);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);assert.equal(staged.hashes[TARGET],report.indexBeforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);report.protectedAssetCount=Object.keys(protectedAssets).length;save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.completedAt=new Date().toISOString();save();console.log('ROLLBACK_VERSION='+base);console.log('BALL46_PERFORMANCE_FAST_WINDOW_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    report.candidateVersion=candidate;save();

    let directOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_DIRECT_VERIFY');try{const b=await publicFile('/index.html','html',directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('PERFORMANCE_WINDOW_NOT_COVERED')&&!t.includes('STATISTICS_LEDGER_INCOMPLETE')){directOk=true;break}}catch{}await delay(1000)}
    assert(directOk,'FAST_WINDOW_NOT_DIRECT_PRODUCTION');

    let publicOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const b=await publicFile('/index.html','html'),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('PERFORMANCE_WINDOW_NOT_COVERED')&&!t.includes('STATISTICS_LEDGER_INCOMPLETE')){publicOk=true;break}}catch{}await delay(1200)}
    assert(publicOk,'FAST_WINDOW_NOT_PUBLIC');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const [boardJson,signalsJson,statsJson]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1'].map(async p=>JSON.parse((await publicFile(p,'json')).toString?.()||'{}')));
    assert(boardJson?.ok===true&&Array.isArray(boardJson.fixtures),'BOARD_API_UNHEALTHY');
    assert(Array.isArray(signalsJson?.signals),'SIGNALS_API_UNHEALTHY');
    assert(statsJson?.ok===true&&Array.isArray(statsJson.rows),'STATISTICS_API_UNHEALTHY');
    report.apiCounts={fixtures:boardJson.fixtures.length,signals:signalsJson.signals.length,firstPageRows:statsJson.rows.length,ledgerTotal:statsJson.ledgerTotal,pending:statsJson.pending};

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');assert.equal(sha(Buffer.from(finalSource)),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    report.finalVersion=candidate;report.indexAfterSha=afterSha;report.workerSourceUntouched=true;report.engineUntouched=true;report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('ROLLBACK_VERSION='+base);console.log('FINAL_PRODUCTION='+candidate);console.log('INDEX_SHA='+afterSha);console.log('BALL46_PERFORMANCE_FAST_WINDOW_SUCCESS');
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}