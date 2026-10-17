import assert from 'node:assert/strict';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
assert(A&&T,'CLOUDFLARE_AUTH_MISSING');
const DRY=process.env.JOHN_DRY_RUN!=='0';
const base='https://api.cloudflare.com/client/v4/accounts/'+A+'/workers';
const targets=[
 {name:'ball46-production',version:'86dfa3f2-9d48-4c8b-b624-ba5a494a29d9',schedule:'* * * * *'},
 {name:'nomadtips3-343-central-cache',version:'0892ccba-7187-4d42-96a3-5ed87f6069cf',schedule:'* * * * *'}
];
const protectedWorkers=[
 {name:'nomadtips3-engine-343',version:'9b363777-64fc-4a48-a10a-0fad822640cb',schedule:'* * * * *'},
 {name:'nomadtips3-5usd-hub-343',version:'2b01dc85-a525-4283-959e-8f6db796c81e',schedule:'*/2 * * * *'},
 {name:'nomadtips3-full-market-343-ball46',version:'3a53ee1a-467c-4a20-9f50-ba749e8adab4',schedule:'1-59/2 * * * *'}
];
async function cf(path,method='GET',data){
 const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+T,...(method==='PUT'?{'Content-Type':'application/json'}:{})},body:method==='PUT'?JSON.stringify(data):undefined,signal:AbortSignal.timeout(25000)});
 const j=await r.json();assert(r.ok&&j?.success,'CF_FAILED_'+r.status+'_'+path+'_'+JSON.stringify(j.errors||[]).slice(0,200));return j.result;
}
async function current(name){
 const [dep,cron]=await Promise.all([cf('/scripts/'+name+'/deployments?per_page=1'),cf('/scripts/'+name+'/schedules')]);
 const versions=dep.deployments?.[0]?.versions||[];
 assert(versions.length===1&&Number(versions[0].percentage)===100,'SPLIT_DEPLOY_'+name);
 return {version:versions[0].version_id,cron:cron.schedules.map(x=>x.cron)};
}
async function smoke(){
 const paths=[
 ['hub','https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/health'],
 ['engine','https://nomadtips3-engine-343.mccarey-supon.workers.dev/health'],
 ['signals','https://ball46-production.mccarey-supon.workers.dev/api/engine/signals'],
 ['fullmarket','https://ball46-production.mccarey-supon.workers.dev/api/full-market/health'],
 ['ledger','https://ball46-production.mccarey-supon.workers.dev/api/engine/ledger-health']
 ];
 const result={};
 for(const [name,url] of paths){
  const r=await fetch(url+'?john_repair='+Date.now(),{signal:AbortSignal.timeout(18000),cache:'no-store'});
  const j=await r.json();assert(r.ok&&j.ok===true,'SMOKE_FAILED_'+name+'_'+r.status);
  if(name==='signals')assert(Array.isArray(j.signals),'SIGNAL_FORMAT');
  result[name]={status:r.status,version:j.version,signals:j.signals?.length,ledgerTotal:j.ledgerTotal,settledTotal:j.settledTotal,mode:j.mode};
 }
 return result;
}
const all=[...targets,...protectedWorkers],snapshot={};
for(const item of all){
 const state=await current(item.name);
 assert.equal(state.version,item.version,'VERSION_DRIFT_'+item.name);
 assert.deepEqual(state.cron,[item.schedule],'CRON_DRIFT_'+item.name);
 snapshot[item.name]=state;
}
const before=await smoke();
console.log('JOHN_PREFLIGHT_OK',JSON.stringify({dry:DRY,snapshot,before}));
if(DRY)process.exit(0);
const changed=[];
try{
 for(const item of targets){
  const actual=await current(item.name);
  assert.deepEqual(actual,snapshot[item.name],'CONCURRENT_CHANGE_'+item.name);
  const result=await cf('/scripts/'+item.name+'/schedules','PUT',[]);
  assert.deepEqual(result.schedules.map(x=>x.cron),[],'WRITE_FAILED_'+item.name);
  changed.push(item.name);
  assert.deepEqual((await current(item.name)).cron,[],'READBACK_FAILED_'+item.name);
  console.log('JOHN_REDUNDANT_CRON_STOPPED',item.name);
 }
 for(const item of all){
  const result=await current(item.name);
  assert.equal(result.version,item.version,'DEPLOY_DRIFT_'+item.name);
  assert.deepEqual(result.cron,targets.some(x=>x.name===item.name)?[]:[item.schedule],'CRON_POST_DRIFT_'+item.name);
 }
 const after=await smoke();
 assert(after.ledger.ledgerTotal>=before.ledger.ledgerTotal,'LEDGER_REGRESSION');
 assert(after.ledger.settledTotal>=before.ledger.settledTotal,'SETTLEMENT_REGRESSION');
 console.log('JOHN_REPAIR_SUCCESS',JSON.stringify({stopped:changed,protected:protectedWorkers.map(x=>x.name),before,after}));
}catch(e){
 console.error('JOHN_REPAIR_FAILED',String(e));
 for(const name of changed.reverse()){
  const item=targets.find(x=>x.name===name);
  try{
   if((await current(name)).version===item.version){
    await cf('/scripts/'+name+'/schedules','PUT',[{cron:item.schedule}]);
    assert.deepEqual((await current(name)).cron,[item.schedule],'RESTORE_FAILED');
    console.log('JOHN_ROLLBACK_OK',name);
   }
  }catch(err){console.error('JOHN_ROLLBACK_FAILED',name,String(err))}
 }
 process.exitCode=1;
}
