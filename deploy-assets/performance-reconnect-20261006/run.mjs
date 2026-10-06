import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const TARGET='index.html';
const CARD_ID='b46-daily-performance-runtime';
const BRANCH='work/ball46-performance-reconnect-20261006';
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
  js=replaceFn(js,'outcome',`function outcome(r){const x=String(r?.result??r?.settlement??r?.outcome??'').trim().toUpperCase();if(x==='WIN'||x==='HALF_WIN')return'win';if(x==='LOSS'||x==='HALF_LOSS')return'loss';if(x==='PUSH'||x==='VOID')return'push';return null}`);
  js=replaceFn(js,'isPending',`function isPending(r){return String(r?.status||'').toUpperCase()==='PENDING'}`);
  js=replaceFn(js,'refresh',`async function refresh(){if(busy)return;busy=true;try{let st=await json('/api/engine/statistics?paged=1&_='+Date.now());if(st?.ok!==true||!Array.isArray(st?.rows))throw Error('STATISTICS_SHAPE');const sig=JSON.stringify([st.ledgerTotal,st.total,st.pending,st.unresolved,st.win,st.loss,st.push,st.halfWin,st.halfLoss,st.ledgerUpdatedAt]);let rows=[...st.rows],cursor=st.nextCursor,seen=new Set();while(cursor){if(seen.has(cursor))throw Error('STATISTICS_CURSOR_CYCLE');seen.add(cursor);const page=await json('/api/engine/statistics?paged=1&cursor='+encodeURIComponent(cursor)+'&_='+Date.now());if(page?.ok!==true||!Array.isArray(page?.rows))throw Error('STATISTICS_PAGE_SHAPE');const pageSig=JSON.stringify([page.ledgerTotal,page.total,page.pending,page.unresolved,page.win,page.loss,page.push,page.halfWin,page.halfLoss,page.ledgerUpdatedAt]);if(pageSig!==sig)throw Error('STATISTICS_CHANGED_DURING_READ');rows.push(...page.rows);cursor=page.nextCursor||null}if(Number.isFinite(Number(st.ledgerTotal))&&rows.length!==Number(st.ledgerTotal))throw Error('STATISTICS_LEDGER_INCOMPLETE:'+rows.length+'/'+st.ledgerTotal);lastGood=aggregate(rows);render(lastGood)}catch(e){if(lastGood)render(lastGood);console.warn('B46 Daily Performance refresh skipped:',e?.message||e)}finally{busy=false}}`);
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
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':`Rollback Performance reconnect ${report.run}`}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:current.restore.version};save();
}
try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();const base=current.restore.version;report.baseVersion=base;
  const workerSha=sha(Buffer.from(current.source));
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const beforeStats=await statsSnapshot();report.statisticsBefore={ledgerTotal:beforeStats.ledgerTotal,total:beforeStats.total,pending:beforeStats.pending,rows:beforeStats.rows.length};
  const target=beforeStats.rows.filter(r=>/nasinu/i.test(String(r?.home?.name??r?.homeName??r?.home??''))&&/rewa/i.test(String(r?.away?.name??r?.awayName??r?.away??'')));
  report.nasinuRewa=target.map(r=>({id:r.id,status:r.status,result:r.result,createdAt:r.createdAt,settledAt:r.settledAt,market:r.market,selection:r.selection,line:r.line,odds:r.odds,classify:classify(r)}));
  assert(target.length>0,'NASINU_REWA_NOT_IN_STATISTICS');
  assert(target.some(r=>String(r?.result||'').toUpperCase()==='HALF_LOSS'),'NASINU_REWA_HALF_LOSS_NOT_FOUND');
  assert(target.some(r=>classify(r)==='loss'),'NASINU_REWA_NOT_COUNTED_AS_LOSS');

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
    const finalStats=await statsSnapshot();assert(finalStats.rows.some(r=>/nasinu/i.test(String(r?.home?.name??r?.homeName??r?.home??''))&&/rewa/i.test(String(r?.away?.name??r?.awayName??r?.away??''))),'NASINU_REWA_LOST_AFTER_DEPLOY');
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    const finalSource=Buffer.from(cm.content_base64,'base64').toString('utf8');assert.equal(sha(Buffer.from(finalSource)),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
    report.finalVersion=candidate;report.indexAfterSha=afterSha;report.workerSourceUntouched=true;report.engineUntouched=true;report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('BALL46_PERFORMANCE_RECONNECT_SUCCESS',JSON.stringify({base,candidate,target:report.nasinuRewa}));
  }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
