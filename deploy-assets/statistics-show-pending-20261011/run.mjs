import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='singlepage-workspace-343.js';
const BRANCH='work/ball46-statistics-show-pending-20261011';
const deploy=process.env.DEPLOY_ENABLED==='true';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),scope:'Statistics display only: include ledger PENDING rows; keep KPI/win-rate/trend settled-only; no Engine, settlement, Performance Card, EventFlow, HTML or unrelated asset changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function fnNode(source,name){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'}),hits=[];
  const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id?.name===name)hits.push(n);for(const [k,v] of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}};
  walk(ast);assert.equal(hits.length,1,'FUNCTION_SHAPE:'+name);return hits[0];
}
function injectStart(source,name,code){
  const n=fnNode(source,name),open=source.indexOf('{',n.start);
  assert(open>n.start&&open<n.end,'FUNCTION_BODY_OPEN_MISSING:'+name);
  return source.slice(0,open+1)+code+source.slice(open+1);
}
function patchAsset(source){
  let s=source;
  const loadOld="state.rows=j.rows;state.statisticsTotal=j.total;";
  const loadNew="state.rows=Array.isArray(j.ledgerRows)?j.ledgerRows:j.rows;state.statisticsTotal=Number.isFinite(Number(j.ledgerTotal))?Number(j.ledgerTotal):j.total;";
  assert.equal(s.split(loadOld).length-1,1,'LOAD_STATE_ANCHOR_COUNT');
  s=s.replace(loadOld,loadNew);

  const eventOld="state.rows=e.detail.rows;state.statisticsTotal=e.detail.total;";
  const eventNew="state.rows=Array.isArray(e.detail.ledgerRows)?e.detail.ledgerRows:e.detail.rows;state.statisticsTotal=Number.isFinite(Number(e.detail.ledgerTotal))?Number(e.detail.ledgerTotal):e.detail.total;";
  assert.equal(s.split(eventOld).length-1,1,'EVENT_STATE_ANCHOR_COUNT');
  s=s.replace(eventOld,eventNew);

  s=injectStart(s,'renderKpis',"const settled=rows.filter(window.BALL46_STATISTICS_DATA.isSettled);rows=settled;");
  s=injectStart(s,'renderGraph',"const settled=rows.filter(window.BALL46_STATISTICS_DATA.isSettled);rows=settled;");

  const resultOld="res=outcome(r)||'PUSH'";
  const resultNew="res=window.BALL46_STATISTICS_DATA.isSettled(r)?(outcome(r)||'PUSH'):String(r?.status||'PENDING').toUpperCase()";
  assert.equal(s.split(resultOld).length-1,1,'TABLE_RESULT_ANCHOR_COUNT');
  s=s.replace(resultOld,resultNew);

  parse(s,{ecmaVersion:'latest',sourceType:'script'});
  assert(s.includes('Array.isArray(j.ledgerRows)?j.ledgerRows:j.rows'),'LEDGER_ROWS_LOAD_MISSING');
  assert(s.includes("rows.filter(window.BALL46_STATISTICS_DATA.isSettled)"),'SETTLED_GUARD_MISSING');
  assert(s.includes("String(r?.status||'PENDING').toUpperCase()"),'PENDING_LABEL_MISSING');
  return s;
}
async function statsSnapshot(){
  const first=JSON.parse(await publicFile('/api/engine/statistics?paged=1','json'));
  assert(first?.ok===true&&Array.isArray(first?.rows),'STATISTICS_API_BAD');
  const rows=[...first.rows],seen=new Set();let cursor=first.nextCursor;
  while(cursor){
    assert(!seen.has(cursor),'STAT_CURSOR_CYCLE');seen.add(cursor);
    const page=JSON.parse(await publicFile('/api/engine/statistics?paged=1&cursor='+encodeURIComponent(cursor),'json'));
    assert(page?.ok===true&&Array.isArray(page?.rows),'STATISTICS_PAGE_BAD');
    rows.push(...page.rows);cursor=page.nextCursor||null;
  }
  assert.equal(rows.length,Number(first.ledgerTotal),'STATISTICS_LEDGER_INCOMPLETE');
  return {...first,rows};
}
const pendingIds=rows=>rows.filter(r=>String(r?.status||'').toUpperCase()==='PENDING').map(r=>String(r?.id||'')).filter(Boolean);

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version)return;
  if(candidate&&active!==candidate)return;
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback Statistics pending display '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}
try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const beforeStats=await statsSnapshot(),knownPending=pendingIds(beforeStats.rows);
  report.before={ledgerTotal:beforeStats.ledgerTotal,total:beforeStats.total,pending:beforeStats.pending};
  assert(knownPending.length>0,'NO_PENDING_TO_VERIFY');

  const targetBytes=await publicFile('/'+TARGET),target=targetBytes.toString('utf8');
  report.targetBeforeSha=sha(targetBytes);
  assert(target.includes('window.BALL46_STATISTICS_DATA'),'STAT_RUNTIME_MISSING');
  assert(target.includes("state.rows=j.rows;state.statisticsTotal=j.total;"),'SETTLED_ONLY_LOAD_NOT_FOUND');
  const after=patchAsset(target),afterBytes=Buffer.from(after),afterSha=sha(afterBytes);
  assert.notEqual(afterSha,report.targetBeforeSha,'TARGET_UNCHANGED');
  writeFileSync('audit/target-before.js',targetBytes);writeFileSync('audit/target-after.js',afterBytes);

  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  assert.equal(staged.hashes[TARGET],report.targetBeforeSha,'STAGED_TARGET_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),afterBytes);

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  await verifyRailBase(staged);

  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';save();console.log('BALL46_STATISTICS_PENDING_DISPLAY_PREVIEW_PASS');process.exit(0)}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');

    let directOk=false,publicOk=false;
    for(let i=0;i<40;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{const b=await publicFile('/'+TARGET,undefined,directOrigin),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('Array.isArray(j.ledgerRows)?j.ledgerRows:j.rows')&&t.includes("String(r?.status||'PENDING').toUpperCase()")){directOk=true;break}}catch{}
      await delay(1000);
    }
    assert(directOk,'PATCH_NOT_DIRECT_PRODUCTION');
    for(let i=0;i<40;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_PUBLIC_VERIFY');
      try{const b=await publicFile('/'+TARGET),t=b.toString('utf8');if(sha(b)===afterSha&&t.includes('Array.isArray(j.ledgerRows)?j.ledgerRows:j.rows')&&t.includes("String(r?.status||'PENDING').toUpperCase()")){publicOk=true;break}}catch{}
      await delay(1200);
    }
    assert(publicOk,'PATCH_NOT_PUBLIC');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const afterStats=await statsSnapshot(),pendingAfter=pendingIds(afterStats.rows);
    assert(pendingAfter.length>0,'PENDING_DISAPPEARED');
    for(const id of knownPending.slice(-10))assert(pendingAfter.includes(id),'KNOWN_PENDING_MISSING:'+id);

    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    report.finalVersion=candidate;report.after={ledgerTotal:afterStats.ledgerTotal,total:afterStats.total,pending:afterStats.pending};report.result='SUCCESS';save();
    console.log('BALL46_STATISTICS_PENDING_DISPLAY_SUCCESS '+JSON.stringify({base,candidate,ledgerTotal:afterStats.ledgerTotal,settled:afterStats.total,pending:afterStats.pending}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
