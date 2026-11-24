import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'MISSING_TEST_SECRETS');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function get(p){const r=await fetch(root+p,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});const x=await r.json();assert(r.ok&&x.success,'CF_'+p);return x.result}
for(const worker of ['ball46-premium-match-colors-test-20261120','ball46-prematch-only-test-20261120']){
 const id=(await get('/scripts/'+worker+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 const v=await get('/workers/'+worker+'/versions/'+id+'?include=modules');
 const code=Object.fromEntries(v.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64').toString()]));
 const main=code[v.main_module];
 const clientMatch=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
 const client=clientMatch?JSON.parse(clientMatch[1]):'';
 const targets=worker.includes('colors')?[
  'prematchClientScript','b46pm','PREMATCH_STORE','renderEmptyOuScreen',
  "mode==='ou'","mode==='ou-predictions'",'b46pm-performance',
  'function renderEmptyOuScreen','function renderPreMatch','fetch(req','fetch(request',
  'new URL(req.url)','ou-predictions',"data-b46pm","function buildPreMatch",
  'b46pm-stats-grid','function route','function mount'
 ]:[
  "path==='/ou-adaptive-research-run-test'",
  "path==='/ou-adaptive-research-state-test'",
  "async scheduled(event,env,ctx)",
  "const adaptiveFt=settleAdaptiveOu",
  "fullmarket.internal/board-cache",
  "function verifiedHubFt"
 ];
 const find=(s,t)=>{const i=s.indexOf(t);return i<0?null:{index:i,sample:s.slice(Math.max(0,i-380),Math.min(s.length,i+780))}};
 console.log('B46_UI_PRICE_SOURCE_INSPECT '+JSON.stringify({
  worker,version:id,main:v.main_module,mainChars:main.length,
  clientChars:client.length,clientMatch:!!clientMatch,modules:v.modules.length,
  mainHits:targets.map(t=>({term:t,match:find(main,t)})).filter(x=>x.match).slice(0,17),
  clientHits:targets.map(t=>({term:t,match:find(client,t)})).filter(x=>x.match).slice(0,17)
 }).slice(0,24000));
}
