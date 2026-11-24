import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const name='ball46-premium-match-colors-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path){const r=await fetch(root+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status);return j.result}
const v=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const deployed=await cf('/workers/'+name+'/versions/'+v+'?include=modules');
const m=Object.fromEntries(deployed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
const x=m[deployed.main_module].match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(x);const src=JSON.parse(x[1]);
for(const needle of ['function navRow(route){','function updateMenu(){','function syncRoute(){','function ensure(){','function perfSource(){','function b46AdaptivePanel(content){','b46AdaptiveData=d;','const navRoutes=','const routes = [','async function load(){','b46PmPeriod','ouLedger?.stats','ouLedger.stats','toFixed(2)+\'%\'','formatPct']){
 let all=[],i=-1;
 while((i=src.indexOf(needle,i+1))>=0&&all.length<3)all.push(i);
 console.log('B46_OU_SIDEBAR_SOURCE '+JSON.stringify({needle,count:all.length,parts:all.map(j=>src.slice(Math.max(0,j-270),Math.min(src.length,j+6900)))}));
}

for(const part of [
 {term:'b46AdaptivePanel',start:"  function b46AdaptivePanel(content){"},
 {term:'AdaptiveLatestRecords',start:"      panel.append(mk('strong','SEPARATE FORMULA STATISTICS'"},
 {term:'CoreDisplay',start:"  function updateMenu(){"},
 {term:'LoadingAndRefresh',start:"  async function load(){"}
 ]){
 const i=src.indexOf(part.start);
 if(i>=0)console.log('B46_OU_SIDEBAR_FOCUS '+JSON.stringify({term:part.term,index:i,source:src.slice(i,i+14300)}));
}

console.log('B46_OU_SIDEBAR_VERSION '+JSON.stringify({version:v,clientSize:src.length,mainSize:m[deployed.main_module].length}));
