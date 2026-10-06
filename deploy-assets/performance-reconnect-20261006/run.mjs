import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='index.html';
const CARD_ID='b46-daily-performance-runtime';
const BRANCH='work/ball46-tab-performance-20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),
scope:'Use current Production Daily Performance reconnect runtime only. Preserve its new paged Statistics ledger logic and mirror computed TODAY win rate + W/L into document.title. Preserve engine, signal detection, settlement, Worker source, bindings, schedules and every unrelated public asset.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function fnNode(source,name){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'});
  const hits=[];
  const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id?.name===name)hits.push(n);for(const [k,v] of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}};
  walk(ast);assert.equal(hits.length,1,'FUNCTION_SHAPE:'+name);return hits[0];
}
function replaceFn(source,name,text){
  const n=fnNode(source,name);return source.slice(0,n.start)+text+source.slice(n.end);
}
function patchCard(html){
  const open='<script id="'+CARD_ID+'">',start=html.indexOf(open);assert(start>=0,'PERFORMANCE_RUNTIME_MISSING');
  const bodyStart=html.indexOf('>',start)+1,end=html.indexOf('</script>',bodyStart);assert(end>bodyStart,'PERFORMANCE_RUNTIME_END_MISSING');
  let js=html.slice(bodyStart,end);
  // New-card-only guard: STOP if current Production is not the repaired Daily Performance runtime.
  assert(js.includes('STATISTICS_LEDGER_INCOMPLETE'),'LATEST_LEDGER_GUARD_MISSING_STOP');
  assert(js.includes("x==='LOSS'||x==='HALF_LOSS'"),'LATEST_HALF_LOSS_MAPPING_MISSING_STOP');
  assert(js.includes("status||'').toUpperCase()==='PENDING'"),'LATEST_PENDING_MAPPING_MISSING_STOP');
  assert(!js.includes('TODAY ${wr}'),'TAB_TITLE_ALREADY_PRESENT_STOP');
  js=replaceFn(js,'render',`function render(d){const b=d?.today;if(b){const wr=rate(b);document.title=\`TODAY \${wr} · \${b.win}W–\${b.loss}L | BALL46\`}const r=ensure();if(!r)return;paint(r,d)}`);
  parse(js,{ecmaVersion:'latest',sourceType:'script'});
  assert(js.includes("x==='LOSS'||x==='HALF_LOSS'"),'HALF_LOSS_MAPPING_MISSING');
  assert(js.includes("status||'').toUpperCase()==='PENDING'"),'PENDING_MAPPING_MISSING');
  assert(js.includes('STATISTICS_LEDGER_INCOMPLETE'),'LEDGER_GUARD_MISSING');
  assert(js.includes('document.title'),'TAB_TITLE_PATCH_MISSING');
  return html.slice(0,bodyStart)+js+html.slice(end);
}
function classify(row){
  const x=String(row?.result??row?.settlement??row?.outcome??'').trim().toUpperCase();
  if(x==='WIN'||x==='HALF_WIN')return'win';if(x==='LOSS'||x==='HALF_LOSS')return'loss';if(x==='PUSH'||x==='VOID')return'push';
  return String(row?.status||'').toUpperCase()==='PENDING'?'pending':null;
}
async function statsSnapshot(){
  const first=JSON.parse(await publicFile('/api/engine/statistics','json'));
  assert(first?.ok===true&&Array.isArray(first?.rows),'STATISTICS_API_BAD');
  let full=first;
  if(Number.isFinite(Number(first.ledgerTotal))&&first.rows.length<Number(first.ledgerTotal)){
    full=JSON.parse(await publicFile('/api/engine/statistics?limit='+Number(first.ledgerTotal),'json'));
  }
  assert(Array.isArray(full.rows),'STATISTICS_ROWS_BAD');
  return full;
}
let current=null,candidate=null;
async function rollback(){
  if(!current)return;const active=await activeVersion();
  if(active===current.restore.version){report.rollback={status:'base-still-active',version:active};save();return}
  if(candidate&&active!==candidate){report.rollback={status:'skipped-foreign-active',version:active};save();return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Ball46 tab performance ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}
try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const beforeStats=await statsSnapshot();report.statisticsBefore={ledgerTotal:beforeStats.ledgerTotal,total:beforeStats.total,pending:beforeStats.pending,rows:beforeStats.rows.length};
  const beforeBytes=await publicFile('/index.html','html'),before=beforeBytes.toString('utf8');report.indexBeforeSha=sha(beforeBytes);
  const after=patchCard(before),afterBytes=Buffer.from(after),afterSha=sha(afterBytes);assert.notEqual(afterSha,report.indexBeforeSha,'INDEX_UNCHANGED');
  writeFileSync('audit/index-before.html',beforeBytes);writeFileSync('audit/index-after.html',afterBytes);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);assert.equal(staged.hashes[TARGET],report.indexBeforeSha,'STAGED_INDEX_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);
  report.protectedAssetCount=Object.keys(protectedAssets).length;save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_BEFORE_DEPLOY');
  await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.completedAt=new Date().toISOString();save();console.log('BALL46_PERFORMANCE_RECONNECT_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    let directOk=false,publicOk=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const b=await publicFile('/index.html','html',directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('STATISTICS_LEDGER_INCOMPLETE')&&t.includes("HALF_LOSS")){directOk=true;break}}catch{}await delay(1000)}
    assert(directOk,'RECONNECT_NOT_DIRECT_PRODUCTION');
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');try{const b=await publicFile('/index.html','html'),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('STATISTICS_LEDGER_INCOMPLETE')&&t.includes("HALF_LOSS")){publicOk=true;break}}catch{}await delay(1200)}
    assert(publicOk,'RECONNECT_NOT_PUBLIC');
    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const finalStats=await statsSnapshot();assert(finalStats?.ok===true&&Array.isArray(finalStats.rows),'STATISTICS_UNHEALTHY_AFTER_DEPLOY');
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');assert.equal(sha(Buffer.from(finalSource)),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.indexAfterSha=afterSha;report.workerSourceUntouched=true;report.engineUntouched=true;report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('BALL46_TAB_PERFORMANCE_SUCCESS',JSON.stringify({base,candidate,indexAfterSha:afterSha}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
