import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,worker='ball46-premium-match-colors-test-20261120';
assert(token&&account);
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function get(path){const r=await fetch(base+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(50000)});const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result}
const d=await get('/scripts/'+worker+'/deployments?per_page=1'),id=d.deployments[0].versions[0].version_id,v=await get('/workers/'+worker+'/versions/'+id+'?include=modules');
const code=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
const match=code.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);assert(match);
const s=JSON.parse(match[1]),sections={
 perf:s.slice(s.indexOf('function performancePanel(){'),s.indexOf('function performancePanel(){')+14500),
 draw:s.slice(s.indexOf('function draw(pageOnly=false){'),s.indexOf('function draw(pageOnly=false){')+4500),
 change:s.slice(s.indexOf("const perf=e.target.closest"),s.indexOf("const perf=e.target.closest")+1300),
 load:s.slice(s.indexOf('function loadPerformanceGraph(force=false){'),s.indexOf('function loadPerformanceGraph(force=false){')+2300)
};
console.log('B46_PERF_SOURCE '+JSON.stringify({version:id,main:v.main_module,clientBytes:s.length,sections}));
