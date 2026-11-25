// Restored original 2026-11-22 PreMatch TEST deployment lane.
// Re-activate the latest confirmed good NO-FLICKER frontend version on the
// ORIGINAL Worker/URL. Never run the old Nov 22 UI-clone patch against modern code.
// No Production deployment, no backend/version/data/ledger writes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_CREDENTIALS_NOT_AVAILABLE');
const front='ball46-premium-match-colors-test-20261120';
const expected='753e3a3b-3236-4d0d-885f-0209729a9e16';
const host='https://'+front+'.mccarey-supon.workers.dev';
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const path='qa/prematch-history-20261120/audit-original-20261122-route';
mkdirSync(path,{recursive:true});
let report={task:'B46_RESTORED_ORIGINAL_TEST_DEPLOY_LANE_20261122',frontend:front,expected,run:process.env.GITHUB_RUN_ID};
function save(){writeFileSync(path+'/release.json',JSON.stringify(report,null,2));}
async function cf(s,method='GET',body){
 const headers={authorization:'Bearer '+token};
 const options={method,headers,signal:AbortSignal.timeout(65000)};
 if(body){headers['content-type']='application/json';options.body=JSON.stringify(body);}
 const response=await fetch(api+s,options),data=await response.json();
 assert(response.ok&&data.success,'CLOUDFLARE_'+method+'_'+s+'_'+response.status+' '+JSON.stringify(data.errors||[]).slice(0,400));
 return data.result;
}
async function deployment(name){
 const x=await cf('/scripts/'+name+'/deployments?per_page=1'),d=x.deployments?.[0],v=d?.versions;
 assert(d?.id&&v?.length===1&&Number(v[0].percentage)===100,'AMBIGUOUS_DEPLOYMENT_'+name);
 return {id:d.id,version:v[0].version_id};
}
const protectedNames=['ball46-production','ball46-prematch-only-test-20261120','nomadtips3-engine-343','nomadtips3-5usd-hub-343','nomadtips3-full-market-343-ball46'];
try{
 const starting=await deployment(front);
 assert.equal(starting.version,expected,'TEST_WORKER_MOVED_ABORT');
 const v=await cf('/workers/'+front+'/versions/'+expected+'?include=modules');
 assert.equal(v.main_module,'worker.js');assert.equal(v.modules.length,1);
 const source=Buffer.from(v.modules[0].content_base64,'base64').toString();
 const match=source.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
 assert(match,'ORIGINAL_PREMATCH_CLIENT_MISSING');
 const client=JSON.parse(match[1]);
 for(const marker of ['B46_PERFORMANCE_RANGE_INPLACE_20261125','B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125','b46pm-adaptive-range-btn','b46AdaptivePanel(content)','b46UpdatePerformanceOnly()']){
  assert(client.includes(marker),'LATEST_RESEARCH_OR_NO_FLICKER_PATCH_MISSING_'+marker);
 }
 const initialProtected=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await deployment(name)])));
 const data=await fetch(host+'/__b46_pm_adaptive_research',{cache:'no-store',signal:AbortSignal.timeout(35000)});
 assert(data.ok,'42_FORMULA_TEST_SNAPSHOT_UNAVAILABLE_'+data.status);
 const json=await data.json();
 assert.equal(json.code,'B46_ADAPTIVE_OU_RESEARCH_V1');
 assert.equal(json.formulas?.length,42,'RESEARCH_FORMULAS_NOT_42');
 const original=await fetch(host+'/?b46pm=ou',{cache:'no-store',signal:AbortSignal.timeout(35000)});
 assert(original.ok,'ORIGINAL_OU_PAGE_UNAVAILABLE');
 const page=await original.text();
 assert(page.includes('/__b46_prematch_client.js'),'ORIGINAL_TEST_PAGE_MISSING_PREMATCH_BOOTSTRAP');
 report.before=starting;report.frontendVersion=expected;report.formulas=json.formulas.length;
 report.protectedBefore=initialProtected;report.codeKeepsNewestWork=true;save();
 assert.equal((await deployment(front)).version,expected,'CONCURRENT_FRONTEND_CHANGE_ABORT');
 // Re-release only the already audited, still-live latest TEST version,
 // via Cloudflare's original Worker deployment endpoint. No obsolete patch.
 const activated=await cf('/scripts/'+front+'/deployments','POST',{
  strategy:'percentage',versions:[{version_id:expected,percentage:100}],
  annotations:{'workers/message':'Restore original Nov22 TEST release lane with Nov25 Adaptive + no-flicker UI; preserve current source and backend'}
 });
 report.redeployment=activated.id;save();
 const current=await deployment(front);
 assert.equal(current.version,expected,'REDEPLOYED_VERSION_DIFFERENT');
 const afterProtected=Object.fromEntries(await Promise.all(protectedNames.map(async name=>[name,await deployment(name)])));
 // Backend may be updated independently in parallel. Never modify it here.
 for(const name of protectedNames){
  if(afterProtected[name].version!==initialProtected[name].version)
   report.concurrentProtectedChange=(report.concurrentProtectedChange||[]).concat(name);
 }
 report.status='ORIGINAL_TEST_ROUTE_REDEPLOYED_PENDING_QA';save();
 console.log('B46_ORIGINAL_TEST_DEPLOY_ROUTE_RESTORED '+JSON.stringify({
  worker:front,url:host+'/?b46pm=ou',version:current.version,deploy:activated.id,
  researchFormulas:42,performanceNoFlicker:true,equityNoFlicker:true,
  productionWrite:false,backendWrite:false,engineWrite:false,
  protectedChangesByThisJob:0,concurrentProtectedChange:report.concurrentProtectedChange||[]
 }));
}catch(error){report.failure=String(error.stack||error);save();throw error;}
