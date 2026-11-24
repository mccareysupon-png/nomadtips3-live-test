// BALL46 PreMatch TEST read-only path trace: native O/U V2 vs Adaptive isolated.
// No deployments, no writes and no paid API calls.
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CF_TEST_CREDENTIALS_REQUIRED');
const worker='ball46-premium-match-colors-test-20261120';
const cfRoot='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
async function cf(p){
 const r=await fetch(cfRoot+p,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(38000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_READ_'+r.status+'_'+p);return j.result;
}
const id=(await cf('/scripts/'+worker+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const version=await cf('/workers/'+worker+'/versions/'+id+'?include=modules');
const mods=Object.fromEntries(version.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const source=mods[version.main_module];
const embedded=source.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(embedded,'FRONTEND_EMBED_NOT_FOUND');
const client=JSON.parse(embedded[1]);
const focus=['function perfSource(){','function buildPerformance','function performanceChart','function drawPerformance',
 'function perfGraph','function performanceWidget','function performancePanel','function makePerformance',
 "CUMULATIVE UNITS","Cumulative units",'cumulativeUnits','ouDailySeries','ouDailyBook',
 'function b46AdaptivePanel(content)','b46AdaptiveChartFormula','series30?.byFormula',
 'function draw(pageOnly=false)','const selectedBook=','function loadPerformanceGraph','function receiverDataForView',
 'if(mode===\'ou\')','b46pm-performance-chart'];
for(const needle of focus){
 const spots=[];let idx=0;
 while((idx=client.indexOf(needle,idx))!==-1&&spots.length<12){
  spots.push(idx);idx+=needle.length;
 }
 if(!spots.length)continue;
 console.log('B46_PATH_TRACE '+JSON.stringify({needle,count:spots.length,contexts:spots.slice(0,5).map(at=>client.slice(Math.max(0,at-320),Math.min(client.length,at+1950)))}));
}
const [native,adaptive]=await Promise.all(['/__b46_prematch_data','/__b46_pm_adaptive_research'].map(async p=>{
 const r=await fetch(host+p,{cache:'no-store',signal:AbortSignal.timeout(38000)});
 assert(r.ok,'LIVE_TEST_API_'+p+'_'+r.status);return r.json()
}));
console.log('B46_PATH_TRACE_API '+JSON.stringify({version:id,native:{
 ouLedger:native.ouLedger?.stats,
 ouRows:native.ouLedger?.rows?.map(r=>({fixture:r.fixture_id,status:r.status,units:r.units,market:r.market})).slice(0,15),
 ouDailySeries:native.ouDailySeries?.slice(-8),
 ouDailyBook:native.ouDailyBook,
},adaptive:{
 code:adaptive.code,formulas:adaptive.formulas?.length,
 selected:adaptive.formulas?.filter(f=>['A02','A03','A04','A05'].includes(f.formula)),
 series30:Object.fromEntries(['A02','A03','A04','A05'].map(f=>[f,adaptive.series30?.byFormula?.[f]?.at(-1)])),
}});
console.log('B46_PATH_TRACE_END');
