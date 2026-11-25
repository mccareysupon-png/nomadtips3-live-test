import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,name='ball46-premium-match-colors-test-20261120';
assert(token&&account);const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(p){let r=await fetch(root+p,{headers:{authorization:'Bearer '+token}}),j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result;}
const prod=await cf('/scripts/ball46-production/deployments?per_page=1'),test=await cf('/scripts/'+name+'/deployments?per_page=1');
const version=test.deployments[0].versions[0].version_id,v=await cf('/workers/'+name+'/versions/'+version+'?include=modules');
const m=v.modules.find(x=>x.name===v.main_module),main=Buffer.from(m.content_base64,'base64').toString();
const match=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
const client=match?JSON.parse(match[1]):null;
const phrases=['B46_PERFORMANCE_RANGE_INPLACE_20261125','B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125','B46_ADAPTIVE_NATIVE_CHART_30_90_V3','function performancePanel(){','function draw(pageOnly=false){','draw();if(range)loadPerformanceGraph(true);return;','b46UpdatePerformanceOnly()','b46pm-adaptive-range-btn','b46AdaptivePanel(content)'];
const terms=['B46_PRODUCTION_READ.fetch','env.B46_PRODUCTION_READ','__b46_prematch_client.js','__b46_pm_adaptive_research','b46pm=ou','B46_ADAPTIVE','new URL(request.url)','pathname===','async fetch(request'];const paths=Object.fromEntries(terms.map(term=>{const hits=[];let p=0;while((p=main.indexOf(term,p))>=0&&hits.length<7){hits.push({at:p,context:main.slice(Math.max(0,p-320),p+580)});p+=term.length}return [term,hits]}));console.log('B46_COMBINE_ROUTE_SOURCE '+JSON.stringify({version,paths}));
console.log('B46_COMBINE_CURRENT '+JSON.stringify({prodVersion:prod.deployments[0].versions[0].version_id,testVersion:version,testDeployment:test.deployments[0].id,mainModule:v.main_module,moduleCount:v.modules.length,clientBytes:client?.length,mainBytes:main.length,markers:Object.fromEntries(phrases.map(p=>[p,client?.includes(p)])),versionBindings:v.bindings?.map(b=>b.name),settingsBindings:(await cf('/scripts/'+name+'/settings')).bindings.map(b=>({name:b.name,type:b.type}))}));
