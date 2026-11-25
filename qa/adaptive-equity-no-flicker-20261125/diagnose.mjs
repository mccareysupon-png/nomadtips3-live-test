import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const script='ball46-premium-match-colors-test-20261120';
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers'+path,{headers:{authorization:'Bearer '+token}});const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result;}
const d=await cf('/scripts/'+script+'/deployments?per_page=1'),ver=d.deployments[0].versions[0].version_id;
const v=await cf('/workers/'+script+'/versions/'+ver+'?include=modules');
const main=v.main_module,mods=v.modules.map(x=>({name:x.name,bytes:Buffer.from(x.content_base64,'base64').length}));
const mainSource=Buffer.from(v.modules.find(x=>x.name===main).content_base64,'base64').toString('utf8');
const match=mainSource.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
assert(match,'CLIENT_NOT_FOUND');
const client=JSON.parse(match[1]);
const terms=['function b46AdaptivePanel','const b46AdaptivePanel','b46AdaptivePanel(content)','b46-adaptive-research-equity','b46AdaptiveChartDays','function b46Adaptive','B46_ADAPTIVE_NATIVE_CHART_30_90_V3','30D','7D','series30?.byFormula','series90?.byFormula','b46-adaptive-research-isolated'];
const sections=Object.fromEntries(terms.map(term=>{let loc=client.indexOf(term);return [term,{at:loc,snippet:loc>=0?client.slice(Math.max(0,loc-380),loc+1700):null}]}));
console.log('B46_ADAPTIVE_UI_DIAGNOSTIC '+JSON.stringify({version:ver,main,modules:mods,clientSize:client.length,mainSourceSize:mainSource.length,sections}));
