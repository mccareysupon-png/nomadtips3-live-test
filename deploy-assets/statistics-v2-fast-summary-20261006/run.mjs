import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const BRANCH='work/ball46-statistics-v2-fast-summary-20261006';
const deploy=process.env.DEPLOY_ENABLED==='true';
const TARGETS=['singlepage-workspace-343.js','ui-sync-fixes-343-v2.js'];
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,branch:process.env.PATCH_SOURCE_BRANCH,startedAt:new Date().toISOString(),scope:'Statistics V2 recovery only: fast live summary counts + direct full ledger fallback. Preserve index/UI layout, engine, bindings, crons, EventFlow and unrelated assets.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchWorkspace(src){
  assert(src.includes("const CACHE_MS = 60000;"),'WORKSPACE_CACHE_MARKER_MISSING');
  src=src.replace("const CACHE_MS = 60000;","const CACHE_MS = 10000;");

  const marker="async function readAll() {\n  let first = await page();";
  assert(src.includes(marker),'WORKSPACE_READALL_MARKER_MISSING');
  const direct=`async function directAll() {
  const response = await fetch(\`${API}?_=${Date.now()}\`, {
    credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true || !Array.isArray(data.rows)) throw new Error('Statistics direct feed unavailable');
  if (!Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.ledgerTotal)) throw new Error('Statistics direct totals missing');
  const settled = data.rows.filter(isSettled);
  if (data.rows.length !== data.ledgerTotal || settled.length !== data.total) throw new Error('Statistics direct ledger incomplete');
  const c = counts(settled);
  for (const [result, field] of Object.entries(FIELDS)) if (c[result] !== data[field]) throw new Error('Statistics direct '+field+' mismatch');
  return Object.freeze({...data, rows:Object.freeze(settled), ledgerRows:Object.freeze(data.rows),
    returned:data.rows.length, nextCursor:null, hasMore:false});
}
async function readAll() {
  try { return await directAll(); } catch (error) { console.warn('Statistics direct read fallback', error?.message || error); }
  let first = await page();`;
  src=src.replace(marker,direct);

  return src;
}

function patchUiSync(src){
  const old=`async function loadStatCountsOnce(){if(statLoaded)return;statLoaded=true;try{const j=await window.BALL46_STATISTICS_DATA.load();paintStatCounts(j.rows,j.total)}catch(err){statLoaded=false;document.querySelectorAll('[data-stat-market] b').forEach(b=>b.textContent='—');console.warn('Statistics menu count preload failed',err)}}`;
  assert(src.includes(old),'UI_SYNC_STATS_LOADER_MARKER_MISSING');
  const neu=`function summaryFamily(key,def){const label=String(def?.label||key||'').toLowerCase(),kind=String(def?.kind||'').toUpperCase();if(/corner/.test(label))return'corners';if(/card/.test(label))return'cards';if(/btts|both teams/.test(label))return'btts';if(kind==='1X2'||/1x2|match result|moneyline/.test(label))return'1x2';if(kind==='AH'||/asian|handicap/.test(label))return'ah';if(kind==='OU'||/over|under|o\\/u|total|goal/.test(label))return'ou';return'other'}
function paintStatSummary(j){const counts={all:Number(j?.total)||0,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0},defs=j?.markets||{},by=j?.byMarket||{};for(const [key,n] of Object.entries(by)){const fam=summaryFamily(key,defs[key]);if(fam in counts)counts[fam]+=Number(n)||0}document.querySelectorAll('[data-stat-market]').forEach(btn=>{const b=btn.querySelector('b'),k=btn.dataset.statMarket;if(b&&k in counts)b.textContent=String(counts[k])})}
async function loadStatCountsOnce(){if(statLoaded)return;statLoaded=true;try{const r=await fetch('/api/engine/statistics?paged=1&limit=1&_='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});const j=await r.json();if(!r.ok||j?.ok!==true)throw Error('STAT_SUMMARY_BAD');paintStatSummary(j)}catch(err){statLoaded=false;console.warn('Statistics menu summary preload failed',err)}}
async function refreshStatCounts(){statLoaded=false;await loadStatCountsOnce()}`;
  src=src.replace(old,neu);
  const initOld="function init(){loadStatCountsOnce();const rows=window.NOMAD343_DASHBOARD_V2?.getSignals?.();";
  assert(src.includes(initOld),'UI_SYNC_INIT_MARKER_MISSING');
  src=src.replace(initOld,"function init(){loadStatCountsOnce();setInterval(refreshStatCounts,15000);const rows=window.NOMAD343_DASHBOARD_V2?.getSignals?.();");
  return src;
}

let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const active=await activeVersion();
  if(active===current.restore.version)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback Statistics V2 fast summary '+report.run}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(process.env.PATCH_SOURCE_BRANCH,BRANCH,'UNCONFIRMED_BRANCH_STOP');
  current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;
  const settingsBefore=await api(`/scripts/${script}/settings`),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);
  await verifyRailBase(staged);
  const protectedAssets={...staged.hashes};
  for(const target of TARGETS) delete protectedAssets[target];

  const p1=resolve(staged.runtime,'assets','singlepage-workspace-343.js');
  const p2=resolve(staged.runtime,'assets','ui-sync-fixes-343-v2.js');
  const before1=readFileSync(p1,'utf8'),before2=readFileSync(p2,'utf8');
  const after1=patchWorkspace(before1),after2=patchUiSync(before2);
  assert.notEqual(sha(Buffer.from(before1)),sha(Buffer.from(after1)),'WORKSPACE_UNCHANGED');
  assert.notEqual(sha(Buffer.from(before2)),sha(Buffer.from(after2)),'UI_SYNC_UNCHANGED');
  writeFileSync(p1,after1);writeFileSync(p2,after2);
  writeFileSync('audit/singlepage-before.js',before1);writeFileSync('audit/singlepage-after.js',after1);
  writeFileSync('audit/ui-sync-before.js',before2);writeFileSync('audit/ui-sync-after.js',after2);
  report.afterHashes={workspace:sha(Buffer.from(after1)),uiSync:sha(Buffer.from(after2))};save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  if(!deploy){report.result='PREVIEW_SUCCESS';save();console.log('BALL46_STATISTICS_V2_FAST_PREVIEW_OK');process.exit(0)}

  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');

    let ok=false;
    for(let i=0;i<30;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        const a=(await publicFile('/singlepage-workspace-343.js','js')).toString('utf8');
        const b=(await publicFile('/ui-sync-fixes-343-v2.js','js')).toString('utf8');
        if(a.includes('Statistics direct read fallback')&&a.includes('const CACHE_MS = 10000')&&b.includes('paintStatSummary')&&b.includes('setInterval(refreshStatCounts,15000)')){ok=true;break}
      }catch{}
      await delay(1000);
    }
    assert(ok,'PATCH_NOT_PUBLIC');

    for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(Buffer.from(cm.content_base64,'base64').toString('utf8'))),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');

    report.finalVersion=candidate;report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
    console.log('BALL46_STATISTICS_V2_FAST_DEPLOY_OK',JSON.stringify({base,candidate}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
