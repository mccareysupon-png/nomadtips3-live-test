import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const dir='candidate',name='ball46-total-test-20261119',prod='ball46-production';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_AUTH_MISSING');
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(40000)});const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE '+path+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result}
async function active(){const d=await api('/scripts/'+prod+'/deployments?per_page=1');return d.deployments[0].versions}
async function get(path){const r=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(35000)});assert(r.ok,'PUBLIC_READ '+path+' '+r.status);return r.text()}
const before=await active();
const finance=fs.readFileSync(dir+'/finance.test.js','utf8'),visual=fs.readFileSync(dir+'/visual.test.js','utf8');
assert.equal(sha(finance),'98b2ee71e447acc4e4128fb042a8ddd1d3eb4a86948cfe346d054cb9f7d54000','TESTED_FINANCE_HASH_DRIFT');
assert.equal(sha(visual),'22aceda83f92a736b9888fb374803a3c241cc746b8cf1ea6c1a2c4909f12698e','TESTED_VISUAL_HASH_DRIFT');
const graph=JSON.parse(await get('/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all'));
assert(graph.ok&&graph.source==='RECEIVER'&&graph.summary.rows===graph.summary.wins+graph.summary.pushes+graph.summary.losses);
const css=await get('/b46-statistics-card-20261116.css');
const originalPage=await get('/index.html?view=statistics');
const styleBlocks=[...originalPage.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).filter(s=>s.includes('.f46-overview')||s.includes('.b46-stage-summary-grid')||s.includes('.b46-finance-chart-card'));
const fixtureTime=new Date().toISOString();
const page='<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BALL46 · TOTAL TEST ONLY</title><link rel="stylesheet" href="/stage.css"><style>html,body{margin:0;background:#101f1b;color:#dae9e2;font:14px system-ui,sans-serif}*{box-sizing:border-box}.test-wrap{width:min(1400px,98%);margin:18px auto}.test-top{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#172b24;border-radius:12px;margin-bottom:14px}.test-top b{font-size:26px;letter-spacing:-1.5px}.test-top em{color:#30db9d;font-style:normal}.test-label{color:#b2cec2;font-size:12px}.sp-stats-content{display:block}.sp-trend{width:100%}.test-caption{margin:0 0 14px;color:#adcbbd}.f46-details{color:#9fbcb1}</style></head><body data-workspace-view="statistics"><main class="test-wrap"><header class="test-top"><b>ball<em>46</em></b><span class="test-label">ISOLATED TOTAL TEST · READ ONLY · SNAPSHOT</span></header><p class="test-caption">Receiver snapshot · '+fixtureTime+' · Candidate scripts from verified browser test. No production calls from this preview.</p><section data-workspace-panel="statistics"><h2 data-sp-market-title>Total · All Markets</h2><div class="sp-stats-content"><div class="sp-trend"></div></div></section></main><script>window.__B46_FAST_DETAILS_REQUESTED=true;</script><script src="/visual.js" defer></script><script src="/finance.js" defer></script></body></html>';
const proof={mode:'ISOLATED_TEST_WORKER_NO_BINDINGS',snapshot:fixtureTime,sequence:graph.sequence,financeSha:sha(finance),visualSha:sha(visual),productionBefore:before};
const files={'/':{body:page,type:'text/html'},'/index.html':{body:page,type:'text/html'},'/finance.js':{body:finance,type:'application/javascript'},'/visual.js':{body:visual,type:'application/javascript'},'/stage.css':{body:styleBlocks.join('\n')+'\n'+css,type:'text/css'},'/health':{body:JSON.stringify(proof),type:'application/json'}};
const source='const files='+JSON.stringify(files)+';\nconst graph='+JSON.stringify(graph)+';\nexport default {async fetch(req){const u=new URL(req.url),p=u.pathname;const h={"Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff"};if(!["GET","HEAD"].includes(req.method))return new Response("Test only",{status:405,headers:h});if(p==="/b46-receiver-v1/graph"){if(["market","variant","filter","range"].some(k=>u.searchParams.get(k)!=="all"))return new Response("Snapshot supports TOTAL All time only",{status:404,headers:h});return new Response(req.method==="HEAD"?null:JSON.stringify(graph),{headers:{...h,"Content-Type":"application/json"}})}const f=files[p];return f?new Response(req.method==="HEAD"?null:f.body,{headers:{...h,"Content-Type":f.type+"; charset=utf-8"}}):new Response("Test only",{status:404,headers:h})}};';
const sub=await api('/subdomain');assert(sub.subdomain);
const list=await api('/scripts');assert(Array.isArray(list));assert(!list.some(w=>w.id===name),'TEST_WORKER_ALREADY_EXISTS');
assert(name!==prod&&name.startsWith('ball46-total-test-'));
const f=new FormData();
f.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-11-19',bindings:[]})],{type:'application/json'}),'metadata.json');
f.append('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
await api('/scripts/'+name,{method:'PUT',body:f});
await api('/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
const url='https://'+name+'.'+sub.subdomain+'.workers.dev';
let ok=false;
for(let i=0;i<30;i++){try{const r=await fetch(url+'/health',{signal:AbortSignal.timeout(5000)});if(r.ok&&(await r.json()).financeSha===proof.financeSha){ok=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}
assert(ok,'TEST_WORKER_NOT_REACHABLE');
for(const [p,hash]of [['/finance.js',proof.financeSha],['/visual.js',proof.visualSha]]){let r=await fetch(url+p);assert(r.ok&&sha(await r.text())===hash,'SERVED_HASH_BAD '+p)}
const after=await active();assert.deepEqual(after,before,'PRODUCTION_CHANGED_DURING_TEST');
fs.writeFileSync(dir+'/worker-report.json',JSON.stringify({...proof,url,productionAfter:after,productionUnchanged:true,summary:graph.summary},null,2));
console.log('TOTAL_TEST_WORKER_READY '+JSON.stringify({url,sequence:graph.sequence,productionUnchanged:true,financeSha:proof.financeSha,visualSha:proof.visualSha}));
