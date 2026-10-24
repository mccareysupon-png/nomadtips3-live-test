import assert from'node:assert/strict';
import{chromium}from'playwright-core';
import{createHash}from'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-production',OLD='dc158cd1-bf39-4b6a-a4eb-3e3c8b0c2db4',NEW='c8b2b85f-a722-472b-bdc9-d4f3c4f5d6fe';
assert.equal(A,'62cb0db544160e6591342abd6b4f35cc');assert(T);
const hosts=['https://ball46.com','https://www.ball46.com'];
const unchanged=['/signal.html','/signal-next.js','/statistics.html','/dashboard-v2-stage3-featured-facts-20261013a.js'];
async function cf(p,body){
 if(body)assert.equal(p,'/workers/scripts/'+W+'/deployments');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{method:body?'POST':'GET',headers:{authorization:'Bearer '+T,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)}),j=await r.json();
 if(!r.ok||!j.success)throw Error('CF_'+r.status+JSON.stringify(j.errors||[]));return j.result;
}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert.equal(d.versions.length,1);assert.equal(d.versions[0].percentage,100);return d.versions[0].version_id;}
const sha=b=>createHash('sha256').update(b).digest('hex');
async function read(host,p){const u=new URL(p,host);u.searchParams.set('v5deploycheck',Date.now()+Math.random());const r=await fetch(u,{signal:AbortSignal.timeout(60000)}),b=Buffer.from(await r.arrayBuffer());return{status:r.status,hash:sha(b),text:b.toString(),bytes:b}}
async function deploy(id,expected,msg){assert.equal(await active(),expected,'ACTIVE_CHANGED');return(await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})).id}
async function browserQA(){
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{for(const d of[{name:'desktop',width:1366,height:820},{name:'mobile',width:390,height:844}]){
  const page=await browser.newPage({viewport:{width:d.width,height:d.height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const r=await page.goto('https://ball46.com/?voteV5Final='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});assert.equal(r.status(),200);
  await page.waitForTimeout(12500);
  const info=await page.evaluate(()=>{const root=document.querySelector('[data-prediction-card] .b46-v5');
   return{visible:!!root&&root.getBoundingClientRect().width>100,buttons:root?.querySelectorAll('[data-vote]').length,
    jerseys:[...root?.querySelectorAll('.jersey-icon')||[]].map(x=>x.naturalWidth),text:root?.innerText.slice(0,900)}});
  assert(info.visible&&info.buttons===3,'CARD_HIDDEN_'+d.name);
  assert(info.jerseys.length===2&&info.jerseys.every(x=>x>0),'JERSEYS_MISSING_'+d.name);
  assert(info.text.includes('Audience Prediction')&&!info.text.includes('128 votes'),'FAKE_OR_MISSING_VOTE_'+d.name);
  assert.deepEqual(errors,[],'JS_ERRORS_'+d.name);
  console.log('B46_V5_DEVICE_PASS='+JSON.stringify({device:d.name,visible:true,shirts:2,buttons:3}));
  await page.close();
 }}finally{await browser.close()}
}
let switched=false;
try{
 assert.equal(await active(),OLD,'BASE_VERSION_CHANGED');
 const v=await cf('/workers/workers/'+W+'/versions/'+NEW+'?include=modules');
 assert.equal(v.annotations?.['workers/tag'],'BALL46_PREDICTION_VOTE_V5_20261024');
 assert.equal(v.modules.length,18);
 assert(v.bindings.some(x=>x.name==='PREDICTION_VOTES_KV'));
 const originals=new Map();
 for(const host of hosts)for(const p of unchanged)originals.set(host+p,await read(host,p));
 const config=JSON.stringify(await cf('/workers/scripts/'+W+'/settings'));
 const pre=await read('https://c8b2b85f-ball46-production.mccarey-supon.workers.dev','/live-prediction-343.js');
 assert(pre.status===200&&pre.text.includes('b46-v5-runtime-styles'),'CANDIDATE_NOT_READY');
 const deployment=await deploy(NEW,OLD,'Approved borderless V5 vote card; isolated KV votes and original six 3D jerseys');
 switched=true;
 let good=0;for(let n=0;n<35&&good<2;n++){
  assert.equal(await active(),NEW,'CONCURRENT_CUTOVER');
  let all=true;for(const h of hosts){const r=await read(h,'/live-prediction-343.js');if(r.status!==200||!r.text.includes('b46-v5-runtime-styles'))all=false;}
  good=all?good+1:0;if(good<2)await new Promise(r=>setTimeout(r,2000));
 }
 assert.equal(good,2,'V5_NOT_PROPAGATED');
 for(const [url,o]of originals){const u=new URL(url),r=await read(u.origin,u.pathname);assert.equal(r.status,o.status,'OTHER_HTTP_'+url);assert.equal(r.hash,o.hash,'OTHER_FILE_CHANGED_'+url);}
 for(const h of hosts){for(const p of['/api/engine/health','/api/engine/signals','/api/full-market/health','/api/prediction-vote?fixtureId=1234567']){
  const r=await read(h,p);assert.equal(r.status,200,'API_HTTP_'+p);assert(JSON.parse(r.text).ok,'API_NOT_OK_'+p);
 }}
 assert.equal(JSON.stringify(await cf('/workers/scripts/'+W+'/settings')),config,'SETTINGS_CHANGED');
 await browserQA();assert.equal(await active(),NEW,'LIVE_WORKER_CHANGED');
 console.log('B46_V5_DEPLOY_PASS='+JSON.stringify({ok:true,worker:W,active:NEW,deployment,domains:2,unchangedAssets:4,apiHealth:8,pcMobile:true}));
}catch(e){console.error('B46_V5_DEPLOY_FAIL='+String(e.stack||e).slice(0,900));
 if(switched){try{if(await active()===NEW)console.log('B46_V5_ROLLBACK='+await deploy(OLD,NEW,'Revert V5 due to failed live verification'))}catch(x){console.error('B46_V5_ROLLBACK_ERROR='+String(x.message||x))}}
 process.exitCode=1;
}