import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {inspect,activeVersion,getVersion,api,script,directOrigin,sha,canonical,publicFile} from './production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler,verifyPublishedModules} from './rail.mjs';
import {verifyConfiguration,verifyVersionConfiguration} from './statistics-config.mjs';
import {traceRuntime} from './runtime-trace.mjs';
const assets=['singlepage-workspace-343.js','ui-sync-fixes-343-v2.js'];
const hashes=['68b420a633081ac0b0c37bfe747315b846ffb8021ec78c254bdfb2e91f050325','8b1ad2f177218f852a6166d8b9dd087550690a95881a0dd36af7161fe58554ab'];
const report={scope:'Only two proven sidebar Total writers; both use response.total; no ENGINE/ledger/settlement/cache changes',run:process.env.GITHUB_RUN_ID};
const save=()=>writeFileSync('audit/sidebar-total-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let base=null,candidate=null;
function once(s,a,b){assert.equal(s.split(a).length-1,1,`ANCHOR_MOVED:${a}`);return s.replace(a,b)}
function patch(source,name){
  if(name===assets[0])return once(source,'out.all=state.rows.length;','out.all=state.statisticsTotal??0;');
  return once(once(source,'function paintStatCounts(rows){const counts={all:rows.length,','function paintStatCounts(rows,total){const counts={all:total??0,'),'paintStatCounts(j.rows)','paintStatCounts(j.rows,j.total)');
}
function unit(sources){
  const rows=Array.from({length:2000},()=>({market:'ou'}));
  const code=sources[0].split('\n').find(x=>x.startsWith('function marketCounts('));
  for(const total of [1707,0]){
    const context={state:{rows,statisticsTotal:total},MARKETS:[{id:'all'},{id:'ou'}],marketKey:()=> 'ou'};
    const value=vm.runInNewContext(code+'\nmarketCounts();',context);assert.equal(value.all,total);assert.equal(value.ou,2000);
    let written=null;
    const menuCode=sources[1].split('\n').find(x=>x.startsWith('function paintStatCounts('));
    vm.runInNewContext(menuCode+'\npaintStatCounts(rows,total);',{rows,total,marketKey:()=> 'ou',document:{querySelectorAll:()=>[{dataset:{statMarket:'all'},querySelector:()=>({set textContent(v){written=v}})}]}});
    assert.equal(written,String(total));
  }
  return {bothWritersUseApiTotal1707:'PASS',zeroTotal:'PASS',marketSampleCountsUnchanged:'PASS'};
}
async function engineVersion(){const d=await api('/scripts/nomadtips3-engine-343/deployments');return canonical(d.deployments[0].versions)}
try{
  assert.equal(process.env.GITHUB_REF_NAME,'safe/ball46-statistics-runtime-total-20261004');
  const current=await inspect();base=current.restore.version;report.baseVersion=base;
  // Mandatory runtime evidence gate: never deploy from source inspection alone.
  const evidence=await traceRuntime({directory:'audit/pre-runtime',watchMs:3000});
  assert(evidence.has2000Writer,'NO_PROVEN_2000_WRITER_STOP');
  assert(evidence.pauses.some(p=>p.frames.some(f=>f.function==='renderStatNav')),'SPA_WRITER_NOT_CAPTURED');
  assert(evidence.pauses.some(p=>p.frames.some(f=>f.function==='paintStatCounts')&&p.values.some(v=>v.expression.includes('counts.all')&&v.value===2000)),'OVERRIDE_WRITER_NOT_CAPTURED');
  report.runtimeEvidence={writerFunctions:['renderStatNav:96','paintStatCounts:64'],loaded:evidence.loaded,serviceWorkers:evidence.serviceWorkers,cacheStorage:evidence.cacheStorage};
  const settings=await api(`/scripts/${script}/settings`),crons=await schedules(),engineBefore=await engineVersion();
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  const after=[];report.assetChanges={};
  for(let i=0;i<assets.length;i++){
    const name=assets[i],file=resolve(staged.runtime,'assets',name),before=readFileSync(file,'utf8');
    assert.equal(sha(before),hashes[i],`SOURCE_CHANGED_STOP:${name}`);
    const result=patch(before,name);new Function(result);after.push(result);
    writeFileSync('audit/before-'+name,before);writeFileSync('audit/after-'+name,result);writeFileSync(file,result);
    report.assetChanges[name]={before:hashes[i],after:sha(result)};
  }
  report.unitTests=unit(after);
  const changed=Object.entries(staged.hashes).filter(([p,h])=>sha(readFileSync(resolve(staged.runtime,'assets',p)))!==h).map(([p])=>p).sort();
  assert.deepEqual(changed,[...assets].sort(),'ONLY_PROVEN_ASSETS_MAY_CHANGE');save();
  wrangler(staged,true);await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_STOP');
  assert.equal(canonical(await api(`/scripts/${script}/settings`)),canonical(settings),'SETTINGS_MOVED_STOP');
  assert.equal(await engineVersion(),engineBefore,'ENGINE_MOVED_STOP');
  wrangler(staged);
  for(let i=0;i<25;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
  assert(candidate,'NO_NEW_VERSION');report.candidateVersion=candidate;save();
  for(let n=0;n<assets.length;n++){
    let ready=false;for(let i=0;i<25;i++){if(sha(await publicFile('/'+assets[n]))===sha(after[n])){ready=true;break}await delay(1500)}assert(ready,`NEW_ASSET_NOT_PUBLIC:${assets[n]}`);
  }
  const expected={...staged.hashes};for(let i=0;i<assets.length;i++)expected[assets[i]]=sha(after[i]);
  for(const [p,h] of Object.entries(expected))assert.equal(sha(await publicFile('/'+p,undefined,directOrigin)),h,`UNRELATED_ASSET_CHANGED:${p}`);
  report.configuration=verifyConfiguration(settings,await api(`/scripts/${script}/settings`));
  const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);
  verifyPublishedModules(cv,current.version,current.source,Object.fromEntries(Object.entries(expected).map(([p,h])=>['/'+p,h])));
  assert.equal(await engineVersion(),engineBefore,'ENGINE_CHANGED_STOP');
  assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED_STOP');
  const post=await traceRuntime({directory:'audit/post-runtime',watchMs:65000,expectFixed:true});
  assert(!post.has2000Writer,'TOTAL_2000_STILL_WRITTEN');
  for(let i=0;i<assets.length;i++)assert(post.loaded.filter(l=>l.url.includes(assets[i])).every(l=>l.sha256===sha(after[i])),`WRONG_BROWSER_LOADED_HASH:${assets[i]}`);
  report.postRuntime={loaded:post.loaded,snapshots:post.snapshots,statisticsResponses:post.statisticsResponses,serviceWorkers:post.serviceWorkers,cacheStorage:post.cacheStorage};
  assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFICATION');
  assert.equal(await engineVersion(),engineBefore,'ENGINE_CHANGED_DURING_POLLING');
  report.status='DEPLOYED';report.version=candidate;report.engineUnchanged=true;save();console.log(JSON.stringify(report));
}catch(e){
  report.status='STOPPED';report.error=e.message;
  if(base&&candidate&&await activeVersion()===candidate){
    await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback failed sidebar TOTAL runtime verification'}})});
    assert.equal(await activeVersion(),base);report.rollback=base;
  }
  save();console.error(e.stack);process.exitCode=1;
}

