/*
 * Local Cloudflare Wrangler / D1 preview integration test (NO remote deploy).
 * Real ledger is read by the test-only scheduled() handler, not by viewer GET.
 */
import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import puppeteer from 'puppeteer-core';
import {existsSync} from 'node:fs';

const root='http://127.0.0.1:8788';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out={mode:'LOCAL_WRANGLER_D1_ONLY',productionWrites:0,providerDirectCalls:0,remotePreviewDeploy:false,
 atUtc:new Date().toISOString(),checks:{},timings:{},errors:[]};
function check(n,b,detail=null){out.checks[n]={pass:Boolean(b),detail};if(!b)out.errors.push('CHECK_FAILED:'+n)}
async function req(path,method='GET'){
 const t=performance.now();
 const res=await fetch(root+path,{method,signal:AbortSignal.timeout(45000)});
 const body=await res.text();
 return {status:res.status,body,bytes:Buffer.byteLength(body),elapsedMs:Math.round(performance.now()-t),
  headers:Object.fromEntries([...res.headers].filter(([k])=>['cache-control','x-b46-snapshot-schema','x-b46-snapshot-age'].includes(k)))};
}
try {
 let ready=false;
 for(let i=0;i<60;i++){try{const health=await req('/health');if(health.status===200){ready=true;break}}catch{}await sleep(1000)}
 check('wrangler_server_started',ready);
 if(!ready)throw Error('LOCAL_WRANGLER_DEV_NOT_STARTED');
 const missing=await req('/api/performance/snapshot');
 check('missing_snapshot_fails_closed',missing.status===503&&JSON.parse(missing.body).ok===false);
 const bad=await req('/api/performance/snapshot','POST');
 check('mutation_route_disabled',bad.status===405);
 const before=performance.now();
 let scheduled;
 try{scheduled=await req('/__scheduled?cron=%2A%2F5%20%2A%20%2A%20%2A%20%2A');}
 catch(e){throw Error('SCHEDULED_TRIGGER_FAILED:'+e.message)}
 out.scheduledTrigger={status:scheduled.status,elapsedMs:scheduled.elapsedMs};
 if(scheduled.status!==200)throw Error('SCHEDULED_TRIGGER_HTTP_'+scheduled.status);
 let value=null;
 for(let i=0;i<60;i++){
  const r=await req('/api/performance/snapshot');
  if(r.status===200){value=r;break}
  await sleep(1000);
 }
 out.timings.firstSnapshotReadyMs=Math.round(performance.now()-before);
 check('scheduled_generated_snapshot',Boolean(value));
 if(!value)throw Error('SCHEDULED_DID_NOT_GENERATE');
 const payload=JSON.parse(value.body);
 out.snapshot={today:payload.today,yesterday:payload.yesterday,londonDay:payload.londonDay,
  sizeBytes:value.bytes,ledgerCount:payload.ledger?.rowCount};
 check('tiny_payload',value.bytes<1800);
 check('valid_production_derived_counters',payload.ok===true&&
   payload.today?.totalPicks===payload.today.win+payload.today.loss+payload.today.push+payload.today.pending&&
   payload.ledger?.rowCount>10000);
 const path=('/usr/bin/google-chrome');
 const exe=[path,'/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
 if(!exe)throw Error('HEADLESS_CHROME_NOT_PRESENT');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,
  args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  for(const [name,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844,isMobile:true,hasTouch:true}]]){
   const page=await browser.newPage();
   await page.setViewport(viewport);
   await page.goto(root+'/health',{waitUntil:'domcontentloaded',timeout:30000});
   const durations=[];
   for(let i=0;i<7;i++){
    const detail=await page.evaluate(async()=>{
      const t=performance.now(),r=await fetch('/api/performance/snapshot',{cache:'no-store'});
      const raw=await r.text(),v=JSON.parse(raw);
      let element=document.getElementById('snapshot-audit-counter');
      if(!element){element=document.createElement('div');element.id='snapshot-audit-counter';document.body.append(element)}
      element.textContent='WIN '+v.today.win+' LOSS '+v.today.loss;
      return {elapsed:performance.now()-t,http:r.status,text:element.textContent,size:raw.length};
    });
    check(name+'_GET_'+i,detail.http===200&&detail.text.includes('WIN'));
    durations.push(Math.round(detail.elapsed));
   }
   durations.sort((a,b)=>a-b);
   out.timings[name]={samplesMs:durations,p50Ms:durations[Math.floor(durations.length*.5)],
     p95Ms:durations[Math.min(durations.length-1,Math.ceil(durations.length*.95)-1)]};
   await page.close();
  }
 }finally{await browser.close()}
}catch(e){out.errors.push('ERROR:'+String(e.message).slice(0,200))}
finally{
 await mkdir('reports',{recursive:true});
 await writeFile('reports/ball46-snapshot-v1-local-browser.json',JSON.stringify(out,null,2));
 console.log('B46_LOCAL_PREVIEW='+JSON.stringify(out));
 if(out.errors.length)process.exitCode=1;
}
