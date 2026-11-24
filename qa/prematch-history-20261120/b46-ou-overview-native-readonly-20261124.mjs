import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const name='ball46-premium-match-colors-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path){const r=await fetch(root+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)});
const j=await r.json();assert(r.ok&&j.success,path+'_'+r.status);return j.result;}
const dep=await cf('/scripts/'+name+'/deployments?per_page=1'),v=dep.deployments[0].versions[0].version_id;
const wr=await cf('/workers/'+name+'/versions/'+v+'?include=modules');
const mods=Object.fromEntries(wr.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
const m=mods[wr.main_module].match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(m);
const c=JSON.parse(m[1]);
for(const term of ['function perfSource(){','function performancePanel(','function draw(pageOnly=false){',
'function b46AdaptivePanel(content){','if(mode===\'ou\'','function performanceGraph','function perfChart','function perf','CUMULATIVE UNITS','CUMULATIVE','function drawPerformance',
'const activeLedger=','const selectedBook=','if(!b46AdaptiveLoading','b46AdaptiveData=d',
'function renderPerformance','b46pm-performance-chart','ouDailySeries',
'const finish=()=>{','function show(modeNext){']){
 const i=c.indexOf(term);if(i<0){console.log('B46_OV_SOURCE '+JSON.stringify({term,found:false}));continue;}
 console.log('B46_OV_SOURCE '+JSON.stringify({term,index:i,code:c.slice(Math.max(0,i-250),Math.min(c.length,i+7500))}));
}
console.log('B46_OV_ACTIVE '+JSON.stringify({version:v,clientSize:c.length,mainSize:mods[wr.main_module].length}));
