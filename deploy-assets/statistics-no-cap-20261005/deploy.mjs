import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {api,inspect,activeVersion,getVersion,literals,sha,canonical,publicFile,script} from '../daily-performance-20261005/production.mjs';
import {stageCurrentRail,verifyRailBase,schedules,wrangler} from '../daily-performance-20261005/rail.mjs';
import {patchEngine,patchFrontend,dailyPatch,frontFunctions,nodes} from './patch.mjs';
const engineName='nomadtips3-engine-343',audit='audit-statistics';
mkdirSync(audit,{recursive:true});
const save=(name,data)=>writeFileSync(audit+'/'+name,typeof data==='string'?data:JSON.stringify(data,null,2));
async function engineActive(){const d=await api(`/scripts/${engineName}/deployments`),v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'ENGINE_ACTIVE_AMBIGUOUS');return v[0].version_id}
const engineVersion=id=>api(`/workers/${engineName}/versions/${id}?include=modules`);
const activate=(name,id,message)=>api(`/scripts/${name}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}})});
const settingsView=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!['annotations'].includes(k)));
const bindings=v=>canonical(v.bindings.map(b=>({...b})).sort((a,b)=>a.name.localeCompare(b.name)));
async function stats(params={}){const q=new URLSearchParams({...params,_:String(Date.now())}),r=await fetch('https://ball46.com/api/engine/statistics?'+q,{signal:AbortSignal.timeout(60000),cache:'no-store'});assert(r.ok,'STATISTICS_HTTP:'+r.status);const j=await r.json();assert(j.ok===true&&Array.isArray(j.rows),'STATISTICS_SHAPE');return j}
function verifyStats(j){const counts={WIN:0,LOSS:0,PUSH:0,HALF_WIN:0,HALF_LOSS:0},ids=new Set();for(const r of j.rows){assert(r.id&&!ids.has(r.id),'DUPLICATE_LEDGER_ID');ids.add(r.id);if(r.status==='SETTLED'){assert(r.result in counts,'UNKNOWN_SETTLED_RESULT');counts[r.result]++}}assert.equal(j.rows.length,j.ledgerTotal,'LEDGER_INCOMPLETE');assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),j.total,'SETTLED_INCOMPLETE');for(const [result,key]of Object.entries({WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'}))assert.equal(counts[result],j[key],key);assert.equal(j.rows.filter(r=>r.status==='PENDING').length,j.pending,'PENDING_MISMATCH');return ids}
async function fullPaged(){for(let attempt=0;attempt<3;attempt++){let first=await stats({paged:'1'}),page=first,rows=[],seen=new Set(),changed=false;assert.equal(first.statisticsPagination,'CURSOR_NO_TOTAL_CAP_V1');const signature=j=>canonical([j.ledgerTotal,j.total,j.pending,j.unresolved,j.win,j.loss,j.push,j.halfWin,j.halfLoss,j.ledgerUpdatedAt]);while(true){if(signature(first)!==signature(page)){changed=true;break}rows.push(...page.rows);if(!page.nextCursor)break;assert(!seen.has(page.nextCursor),'CURSOR_CYCLE');seen.add(page.nextCursor);page=await stats({paged:'1',cursor:page.nextCursor})}if(changed)continue;const result={...first,rows,returned:rows.length,nextCursor:null,hasMore:false};verifyStats(result);return result}throw Error('LEDGER_CHANGED_DURING_ALL_RETRIES')}

let engineBefore,frontBefore,engineCandidate,frontCandidate,expectedFrontSource;
try{
  const front=await inspect();frontBefore=front.restore.version;
  engineBefore=await engineActive();
  const engine=await engineVersion(engineBefore),engineSettings=await api(`/scripts/${engineName}/settings`),engineCron=await api(`/scripts/${engineName}/schedules`);
  const frontSettings=await api(`/scripts/${script}/settings`),frontCron=await schedules();
  save('restore-point.json',{engineBefore,frontBefore,engineSettings,engineCron,frontSettings,frontCron,sourceCommit:process.env.GITHUB_SHA});
  save('engine-before.json',engine);save('frontend-before.json',front.version);
  const main=engine.modules.find(m=>m.name===engine.main_module);assert(main,'ENGINE_MAIN_MISSING');
  const engineSource=Buffer.from(main.content_base64,'base64').toString('utf8'),enginePatched=patchEngine(engineSource);
  save('engine-before.js',engineSource);save('engine-after.js',enginePatched);
  const initial=await stats(),before=await stats({limit:String(initial.ledgerTotal)});verifyStats(before);save('statistics-before.json',before);
  const staged=await stageCurrentRail(front.version,frontSettings,frontCron,front.source);
  const replacements=JSON.parse(readFileSync('patch-data.json','utf8'));
  const expected={};
  for(const name of Object.keys(frontFunctions)){
    const path=resolve(staged.runtime,'assets',name),source=readFileSync(path,'utf8');
    expected[name]=patchFrontend(source,replacements[name],name);
  }
  expected['singlepage-workspace-343.js']=readFileSync('statistics-client.js','utf8')+'\n'+expected['singlepage-workspace-343.js'];
  expected['index.html']=dailyPatch(readFileSync(resolve(staged.runtime,'assets/index.html'),'utf8'));
  const lit=literals(front.source).get('__B46_MULTI_SIGNAL_STAGE3_JS__');assert(lit,'DASHBOARD_LITERAL_MISSING');
  assert.equal(sha(lit.value),staged.hashes['dashboard-v2-stage3.js'],'DASHBOARD_LITERAL_DIFFERS_FROM_PUBLIC');
  const frontPatched=front.source.slice(0,lit.start)+JSON.stringify(expected['dashboard-v2-stage3.js'])+front.source.slice(lit.end);nodes(frontPatched);
  expectedFrontSource=frontPatched;
  save('frontend-after.js',frontPatched);
  writeFileSync(resolve(staged.runtime,'index.js'),frontPatched);
  for(const [name,source]of Object.entries(expected)){writeFileSync(resolve(staged.runtime,'assets',name),source);save(name,source)}
  wrangler(staged,true);
  await verifyRailBase(staged);
  assert.equal(await engineActive(),engineBefore,'ENGINE_CHANGED_DURING_STAGE');assert.equal(await activeVersion(),frontBefore,'FRONTEND_CHANGED_DURING_STAGE');
  // This account's upload API only accepts "latest" for secret inheritance.
  // Pin every non-secret resource explicitly, then verify the uploaded namespace.
  const metadata={main_module:engine.main_module,compatibility_date:engine.compatibility_date,compatibility_flags:engineSettings.compatibility_flags||[],bindings:engine.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:'latest'}:{...b}),annotations:{'workers/message':'Statistics complete cursor ledger; no total cap; preserve settlement and durable namespace','workers/commit_sha':process.env.GITHUB_SHA}};
  for(const key of ['logpush','observability','limits','placement','tail_consumers'])if(engineSettings[key]!=null)metadata[key]=engineSettings[key];
  const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const m of engine.modules){const bytes=m.name===engine.main_module?Buffer.from(enginePatched):Buffer.from(m.content_base64,'base64');form.set(m.name,new Blob([bytes],{type:m.content_type}),m.name)}
  const candidate=await api(`/scripts/${engineName}/versions?bindings_inherit=strict`,{method:'POST',body:form});engineCandidate=candidate.id;assert(engineCandidate,'ENGINE_CANDIDATE_ID_MISSING');
  const version=await engineVersion(engineCandidate);save('engine-candidate.json',version);
  assert.equal(bindings(version),bindings(engine),'DURABLE_NAMESPACE_OR_BINDINGS_CHANGED');assert.equal(version.compatibility_date,engine.compatibility_date);
  assert.equal(sha(Buffer.from(version.modules.find(m=>m.name===engine.main_module).content_base64,'base64')),sha(enginePatched),'ENGINE_UPLOAD_BYTES_CHANGED');
  assert.equal(await engineActive(),engineBefore,'ENGINE_CHANGED_BEFORE_ACTIVATION');assert.equal(await activeVersion(),frontBefore,'FRONTEND_CHANGED_BEFORE_ACTIVATION');
  console.log('ENGINE_ACTIVATE',engineCandidate);await activate(engineName,engineCandidate,'Remove statistics total cap only');
  let full;for(let i=0;i<12;i++){const j=await stats();if(j.statisticsPagination==='CURSOR_NO_TOTAL_CAP_V1'){full=j;break}await new Promise(r=>setTimeout(r,5000))}assert(full,'ENGINE_DEPLOY_NOT_VISIBLE');verifyStats(full);
  const paged=await fullPaged();save('statistics-after.json',paged);
  const afterIds=new Map(paged.rows.map(r=>[r.id,r]));for(const row of before.rows){assert(afterIds.has(row.id),'EXISTING_HISTORY_ID_LOST:'+row.id);if(row.status==='SETTLED'){const next=afterIds.get(row.id);for(const key of ['result','settledAt','createdAt','market','selection','line','odds'])assert.equal(canonical(next[key]),canonical(row[key]),'SETTLED_RECORD_CHANGED:'+row.id+':'+key)}}
  assert.equal(await activeVersion(),frontBefore,'FRONTEND_CHANGED_BEFORE_DEPLOY');
  console.log('FRONTEND_DEPLOY_CURRENT_RAIL');wrangler(staged);frontCandidate=await activeVersion();assert.notEqual(frontCandidate,frontBefore);
  save('deployed-versions.json',{engineBefore,engineCandidate,frontBefore,frontCandidate});
  const deployed=await getVersion(frontCandidate);assert.equal(bindings(deployed),bindings(front.version),'FRONTEND_BINDINGS_CHANGED');
  const deployedSource=Buffer.from(deployed.modules.find(m=>m.name===deployed.main_module).content_base64,'base64').toString('utf8');assert.equal(sha(deployedSource),sha(frontPatched),'FRONTEND_SOURCE_NOT_IDENTICAL');
  for(const [path,hash]of Object.entries(staged.hashes)){const actual=sha(await publicFile('/'+path));assert.equal(actual,expected[path]!==undefined?sha(expected[path]):hash,'PUBLIC_ASSET_VERIFY:'+path)}
  assert.equal(canonical(await schedules()),canonical(frontCron),'FRONTEND_CRON_CHANGED');
  assert.equal(canonical(await api(`/scripts/${engineName}/schedules`)),canonical(engineCron),'ENGINE_CRON_CHANGED');
  assert.equal(canonical(settingsView(await api(`/scripts/${engineName}/settings`))),canonical(settingsView(engineSettings)),'ENGINE_SETTINGS_CHANGED');
  const final=await fullPaged();verifyStats(final);save('statistics-final.json',final);
  for(const path of ['/api/engine/health','/api/full-market/health']){const j=JSON.parse(await publicFile(path,'json'));assert(j.ok===true,'HEALTH_FAILED:'+path)}
  save('success.json',{engineBefore,engineCandidate,frontBefore,frontCandidate,total:final.total,ledgerTotal:final.ledgerTotal,pending:final.pending,win:final.win,loss:final.loss,push:final.push,halfWin:final.halfWin,halfLoss:final.halfLoss,byMarket:final.byMarket,protectedAssets:Object.keys(staged.hashes).length-Object.keys(expected).length,statisticsPagination:final.statisticsPagination});
  console.log('STATISTICS_NO_TOTAL_CAP_DEPLOY_SUCCESS',JSON.stringify({engineCandidate,frontCandidate,total:final.total,ledgerTotal:final.ledgerTotal,pending:final.pending}));
}catch(error){
  save('failure.txt',error.stack||String(error));console.error(error);
  if(!frontCandidate&&frontBefore&&expectedFrontSource){const id=await activeVersion();if(id!==frontBefore){const v=await getVersion(id),m=v.modules.find(m=>m.name===v.main_module);if(m&&sha(Buffer.from(m.content_base64,'base64'))===sha(expectedFrontSource))frontCandidate=id}}
  if(frontCandidate&&await activeVersion()===frontCandidate){await activate(script,frontBefore,'Rollback failed statistics no-cap verification');console.log('FRONTEND_ROLLED_BACK',frontBefore)}
  if(engineCandidate&&await engineActive()===engineCandidate){await activate(engineName,engineBefore,'Rollback failed statistics no-cap verification');console.log('ENGINE_ROLLED_BACK',engineBefore)}
  throw error;
}

