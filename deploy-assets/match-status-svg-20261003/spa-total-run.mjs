import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {chromium} from 'playwright';
import {inspect,activeVersion,getVersion,api,script,origin,directOrigin,sha,canonical,publicFile} from './production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler,verifyPublishedModules} from './rail.mjs';
import {verifyConfiguration,verifyVersionConfiguration} from './statistics-config.mjs';
const asset='singlepage-workspace-343.js';
const report={scope:'SPA Statistics TOTAL only: response.total; no ENGINE or ledger changes',run:process.env.GITHUB_RUN_ID};
const save=()=>writeFileSync('audit/spa-total-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let base=null,candidate=null;
function replaceOnce(s,a,b){assert.equal(s.split(a).length-1,1,`ANCHOR_MOVED:${a}`);return s.replace(a,b)}
function patch(s){
  let out=replaceOnce(s,'page:1,rows:[],statsLoaded:false','page:1,rows:[],statisticsTotal:null,statsLoaded:false');
  out=replaceOnce(out,'const vals={total:rows.length,win,loss,push,','const vals={total:state.statisticsTotal??\'—\',win,loss,push,');
  out=replaceOnce(out,'state.rows=j.rows;state.statsLoaded=true;','state.rows=j.rows;state.statisticsTotal=j.total;state.statsLoaded=true;');
  assert.equal((s.match(/\bfetch\(/g)||[]).length,(out.match(/\bfetch\(/g)||[]).length);
  new Function(out);return out;
}
function unit(before,after){
  function render(source,rows,total){
    const line=source.split('\n').find(l=>l.startsWith('function renderKpis('));
    const values={};vm.runInNewContext(line+'\nrenderKpis(rows);',{rows,state:{statisticsTotal:total},outcome:r=>r.result,outcomeClass:x=>x==='WIN'?'win':x==='LOSS'?'loss':'push',num:x=>Number(x),$:q=>({set textContent(v){values[q]=v}})});return values;
  }
  const rows=Array.from({length:2000},(_,i)=>({result:i%2?'WIN':'LOSS',odds:1.9}));
  const prior=render(before,rows,1707),current=render(after,rows,1707);
  assert.equal(prior['[data-sp-kpi="total"]'],2000);assert.equal(current['[data-sp-kpi="total"]'],1707);
  for(const key of Object.keys(prior).filter(k=>!k.includes('"total"')))assert.equal(current[key],prior[key]);
  assert.equal(render(after,[],1707)['[data-sp-kpi="total"]'],1707);
  assert.equal(render(after,rows,0)['[data-sp-kpi="total"]'],0);
  assert.equal(render(after,rows,undefined)['[data-sp-kpi="total"]'],'—');
  return {rows2000Response1707:'PASS',filteredOrEmptyRows:'PASS',zeroTotal:'PASS',missingTotalNoRowFallback:'PASS',otherKpisUnchanged:'PASS'};
}
async function browserTest(patched,preview=false){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    let response=null;
    if(preview){
      const live=JSON.parse(await publicFile('/api/engine/statistics','json'));
      assert.equal(live.rows.length,2000,'DEFAULT_SAMPLE_NO_LONGER_2000');
      live.total=1707;
      await page.route('**/singlepage-workspace-343.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:patched}));
      await page.route('**/api/engine/statistics*',route=>{response=live;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(live)})});
    }else{
      page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/engine/statistics'&&r.ok())response=await r.json()});
    }
    await page.goto(`${origin}/index.html?view=statistics&totalVerification=${report.run}-${preview?'preview':'production'}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>/^\d+$/.test(document.querySelector('[data-sp-kpi="total"]')?.textContent||''),{timeout:45000});
    await page.waitForTimeout(1200);
    const displayed=Number(await page.locator('[data-sp-kpi="total"]').textContent());
    assert(response?.ok&&Number.isFinite(response.total),'BROWSER_API_NOT_CAPTURED');
    assert.equal(displayed,response.total,'BROWSER_TOTAL_NOT_RESPONSE_TOTAL');
    await page.screenshot({path:`audit/spa-total-${preview?'preview':'production'}.png`,fullPage:true});
    return {displayed,apiTotal:response.total,returned:response.returned,ledgerTotal:response.ledgerTotal,path:'/index.html?view=statistics'};
  }finally{await browser.close()}
}
async function engineVersion(){const d=await api('/scripts/nomadtips3-engine-343/deployments');return canonical(d.deployments[0].versions)}
try{
  assert.equal(process.env.GITHUB_REF_NAME,'safe/ball46-spa-statistics-total-20261004');
  const current=await inspect();base=current.restore.version;
  const settings=await api(`/scripts/${script}/settings`),crons=await schedules(),engineBefore=await engineVersion();
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  const file=resolve(staged.runtime,'assets',asset),before=readFileSync(file,'utf8');
  assert.equal(sha(before),'caba0dc07cba428d5eb7b5a52d7597bb12aa3fea09f70460a58b88edea50133a','SPA_SOURCE_CHANGED_STOP');
  const after=patch(before);report.unitTests=unit(before,after);
  writeFileSync('audit/spa-before.js',before);writeFileSync('audit/spa-after.js',after);
  writeFileSync(file,after);
  const changed=Object.entries(staged.hashes).filter(([p,h])=>sha(readFileSync(resolve(staged.runtime,'assets',p)))!==h).map(([p])=>p);
  assert.deepEqual(changed,[asset],'ONLY_SPA_ASSET_MAY_CHANGE');
  report.changedAssets=changed;report.beforeSha=sha(before);report.afterSha=sha(after);report.baseVersion=base;save();
  report.preview=await browserTest(after,true);save();
  wrangler(staged,true);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_STOP');
  assert.equal(canonical(await api(`/scripts/${script}/settings`)),canonical(settings),'SETTINGS_MOVED_STOP');
  assert.equal(await engineVersion(),engineBefore,'ENGINE_MOVED_STOP');
  wrangler(staged);
  for(let i=0;i<25;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
  assert(candidate,'NO_NEW_VERSION');report.candidateVersion=candidate;save();
  let ready=false;for(let i=0;i<25;i++){if(sha(await publicFile('/'+asset))===sha(after)){ready=true;break}await delay(1500)}
  assert(ready,'PATCHED_ASSET_NOT_PUBLIC');
  const expected={...staged.hashes,[asset]:sha(after)};
  for(const [p,h] of Object.entries(expected))assert.equal(sha(await publicFile('/'+p,undefined,directOrigin)),h,`UNRELATED_ASSET_CHANGED:${p}`);
  report.configuration=verifyConfiguration(settings,await api(`/scripts/${script}/settings`));
  const cv=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,cv);
  verifyPublishedModules(cv,current.version,current.source,Object.fromEntries(Object.entries(expected).map(([p,h])=>['/'+p,h])));
  assert.equal(await engineVersion(),engineBefore,'ENGINE_CHANGED_STOP');
  assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED_STOP');
  report.production=await browserTest(after);
  assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFICATION');
  report.status='DEPLOYED';report.version=candidate;report.engineUnchanged=true;save();console.log(JSON.stringify(report));
}catch(e){
  report.status='STOPPED';report.error=e.message;
  if(base&&candidate&&await activeVersion()===candidate){
    await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback failed SPA Statistics TOTAL verification'}})});
    assert.equal(await activeVersion(),base);report.rollback=base;
  }
  save();console.error(e.stack);process.exitCode=1;
}

