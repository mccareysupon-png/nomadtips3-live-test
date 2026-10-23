import assert from'node:assert/strict';
import{readFile,writeFile}from'node:fs/promises';
import{chromium}from'playwright-core';
import{WORKER,BASE,JS_PATH,HTML_PATH,sha}from'./patch.mjs';
const dir='deploy-assets/signal-repair-20261023/audit';
const c=JSON.parse(await readFile(dir+'/candidate.json','utf8')),qa=JSON.parse(await readFile(dir+'/browser.json','utf8'));
assert(c.ok&&!c.trafficChanged&&c.base===BASE&&qa.ok&&qa.tests.length===2&&qa.tests.every(x=>x.pass),'CANDIDATE_OR_BROWSER_QA_NOT_PASSED');
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
const root='https://api.cloudflare.com/client/v4/accounts/'+A,hosts=['https://ball46.com','https://www.ball46.com'];
const out={at:new Date().toISOString(),ok:false,candidate:c.candidate,base:BASE,checks:[],liveQA:[]};
const canonical=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function api(p,body){if(body!==undefined)assert.equal(p,'/workers/scripts/'+WORKER+'/deployments','ONLY_WORKER_DEPLOYMENTS_WRITE');
 const r=await fetch(root+p,{method:body?'POST':'GET',headers:{authorization:'Bearer '+T,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(55000)}),j=await r.json();
 if(!r.ok||!j.success)throw Error('CF_'+r.status+JSON.stringify(j.errors).slice(0,250));return j.result;}
async function active(){const d=(await api('/workers/scripts/'+WORKER+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return{id:d.versions[0].version_id,deployment:d.id};}
async function get(host,p){const u=new URL(p,host);u.searchParams.set('signalRepairCheck',Date.now()+'-'+Math.random());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,sha:sha(b),headers:Object.fromEntries(r.headers),json:()=>JSON.parse(b.toString())};}
async function traffic(id,from,msg){assert.equal((await active()).id,from,'ANOTHER_DEPLOY_IN_PROGRESS');return(await api('/workers/scripts/'+WORKER+'/deployments',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})).id;}
async function expectAssets(stage){for(const host of hosts){
 for(const [p,expected]of [[JS_PATH,stage==='after'?c.newJsSha:c.jsOriginalSha],[HTML_PATH,stage==='after'?c.newHtmlSha:c.htmlOriginalSha]]){
  const r=await get(host,p);assert.equal(r.status,200);assert.equal(r.sha,expected,'SHA_CHANGED_'+host+p+'_'+stage);out.checks.push({host,p,stage,sha:r.sha});
 }
 for(const [p,expected]of Object.entries(c.assets)){
  const r=await get(host,p);assert.equal(r.status,200);assert.equal(r.sha,expected,'OTHER_ASSET_CHANGED_'+host+p);
 }
 for(const p of ['/api/engine/health','/api/engine/signals','/api/full-market/health']){
  const r=await get(host,p);assert.equal(r.status,200,'API_HTTP_'+p);assert.equal(r.json().ok,true,'API_NOT_OK_'+p);
 }
}}
async function verifyBrowserLive(){
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  for(const dim of[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
   const context=await browser.newContext({viewport:{width:dim.width,height:dim.height}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const responsePromise=page.waitForResponse(r=>r.url().includes('/api/engine/signals'),{timeout:50000});
   const r=await page.goto('https://ball46.com/signal.html?signalFixed='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
   assert.equal(r.status(),200);
   const response=await responsePromise;assert.equal(response.status(),200);
   const json=await response.json();assert.equal(json.ok,true);
   await page.waitForFunction(n=>{const el=document.querySelector('[data-next-signal-list]');return el&&(n===0?el.innerText.includes('No active live signals'):el.querySelector('.next-signal-card')!==null);},json.signals.length,{timeout:30000});
   const rendered=await page.evaluate(()=>({cards:document.querySelectorAll('[data-next-signal-list] .next-signal-card').length,text:document.querySelector('[data-next-signal-list]')?.innerText.slice(0,450)}));
   assert.equal(errors.length,0,'PAGE_JS_ERROR_'+dim.name);assert(rendered.text?.trim());
   out.liveQA.push({name:dim.name,apiSignals:json.signals.length,...rendered,pass:true});
   await context.close();
  }
 }finally{await browser.close()}
}
async function converge(){const deadline=Date.now()+95000,expected=[[JS_PATH,c.newJsSha],[HTML_PATH,c.newHtmlSha]];
 let stable=0;
 while(Date.now()<deadline){assert.equal((await active()).id,c.candidate,'PARALLEL_CUTOVER_DETECTED');
  let all=true;for(const host of hosts)for(const [p,s]of expected){const r=await get(host,p);if(r.status!==200||r.sha!==s){if(![c.htmlOriginalSha,c.jsOriginalSha].includes(r.sha))throw Error('UNEXPECTED_CUTOVER_BYTES_'+host+p);all=false;}}
  stable=all?stable+1:0;if(stable>=2)return;await new Promise(res=>setTimeout(res,2000));
 }
 throw Error('CUTOVER_PROPAGATION_TIMEOUT');
}
let attempted=false;
try{
 assert.equal((await active()).id,BASE,'SOURCE_PRODUCTION_DRIFT');await expectAssets('before');
 const [jh,hh]=await Promise.all([get(c.preview,JS_PATH),get(c.preview,HTML_PATH)]);
 assert.equal(jh.sha,c.newJsSha);assert.equal(hh.sha,c.newHtmlSha);
 assert.equal(canonical(await api('/workers/scripts/'+WORKER+'/settings')),canonical(c.originalVersionSettings),'SETTINGS_CHANGED');
 attempted=true;out.deployment=await traffic(c.candidate,BASE,'Repair standalone signal.html LIVE feed only; preserve current Engine343 and statistics');
 await converge();await expectAssets('after');await verifyBrowserLive();
 assert.equal((await active()).id,c.candidate);
 assert.equal(canonical(await api('/workers/scripts/'+WORKER+'/settings')),canonical(c.originalVersionSettings),'SETTINGS_CHANGED_AFTER_DEPLOY');
 out.after=await active();out.ok=true;
 console.log('B46_SIGNAL_PRODUCTION_REPAIRED='+JSON.stringify({ok:true,worker:WORKER,active:out.after,liveQA:out.liveQA,retainedAssets:Object.keys(c.assets).length,checks:out.checks.length}));
}catch(e){
 out.error=String(e.stack||e);console.error('B46_SIGNAL_PRODUCTION_REPAIR_FAILED='+String(e.message||e));
 if(attempted){try{const a=await active();if(a.id===c.candidate){out.rollbackDeployment=await traffic(BASE,c.candidate,'Rollback failed SIGNAL standalone runtime repair');out.rollback=await active();}else out.rollbackSkippedNewActive=a}catch(err){out.rollbackError=String(err.message||err)}}
 process.exitCode=1;
}
await writeFile(dir+'/activation.json',JSON.stringify(out,null,2));
