import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'SECRETS_REQUIRED');
const worker='ball46-prematch-only-test-20261120';
const base='https://'+worker+'.mccarey-supon.workers.dev';
const frontend='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const headers={authorization:'Bearer '+token};
const now=new Date();
console.log('B46_PREMATCH_NOW '+JSON.stringify({utc:now.toISOString(),thailand:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',dateStyle:'full',timeStyle:'long'}).format(now),
 london:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'full',timeStyle:'long'}).format(now)}));
for(const path of ['/scripts/'+worker+'/schedules','/scripts/'+worker+'/deployments?per_page=1']){
 try{
 const r=await fetch(root+path,{headers,signal:AbortSignal.timeout(22000)});
 const j=await r.json();
 console.log('B46_PREMATCH_CLOUDFLARE '+JSON.stringify({path,http:r.status,success:j.success,
  result:path.includes('schedules')?j.result:{deployments:j.result?.deployments?.slice(0,1)},errors:j.errors}).slice(0,3400));
 }catch(e){console.log('B46_PREMATCH_CF_FAIL '+JSON.stringify({path,error:String(e)}))}
}
for(const path of ['/daily-mission-state','/history-round-state','/bot-state',
 '/prematch-ou-engine-state','/ou-value-v2-state']){
 try{
  const r=await fetch(base+path,{headers:{accept:'application/json'},signal:AbortSignal.timeout(24000),cache:'no-store'});
  const j=await r.json().catch(()=>null);
  let summary=null;
  if(path==='/daily-mission-state')
   summary={mission:j?.mission,history:j?.history,bot:j?.bot,feed:j?.feed};
  else if(path==='/history-round-state')summary=j;
  else if(path==='/bot-state')
   summary={mission:j?.mission,dailyWindow:j?.dailyBook?.window,
    selectedToday:j?.dailyBook?.selected,settledToday:j?.dailyBook?.settled,
    lastRun:j?.lastRun,inputs:j?.inputs,feed:j?.feed};
  else summary=j;
  console.log('B46_PREMATCH_STATE '+JSON.stringify({path,http:r.status,summary}).slice(0,5500));
 }catch(e){console.log('B46_PREMATCH_GET_FAIL '+JSON.stringify({path,error:String(e)}))}
}
for(const path of ['/__b46_prematch_data','/__b46_pm_adaptive_research']){
 try{
  const r=await fetch(frontend+path,{headers:{accept:'application/json'},signal:AbortSignal.timeout(30000),cache:'no-store'});
  const j=await r.json().catch(()=>null);
  let summary=null;
  if(path.includes('prematch_data')){
   const w=j?.dailyBook?.window;
   const lg=j?.ouLedger?.rows??[];
   summary={dateBusinessDay:w?.businessDay,cutoff:w?.cutoffLocal,begin:w?.begin,end:w?.end,
    oneX2:j?.dailyBook?.selected,historyRounds:j?.historyRounds,
    ou:{total:lg.length,selectedToday:lg.filter(x=>x.picked_at>=w?.begin&&x.picked_at<w?.end).length,
      lastPick:lg.map(x=>x.picked_at).sort((a,b)=>b-a)[0]||null},btts:j?.bttsLedger?.stats};
  }else{
   summary={code:j?.code,formulas:j?.formulas?.length,records:j?.records?.length,
    lastPick:j?.records?.map(x=>x.picked_at).sort((a,b)=>b-a)?.[0]||null,
    selectedToday:j?.records?.filter(x=>x.picked_at>=1795500000)?.length};
  }
  console.log('B46_PREMATCH_PUBLIC_SNAPSHOT '+JSON.stringify({path,http:r.status,summary}).slice(0,3800));
 }catch(e){console.log('B46_PREMATCH_PUBLIC_FAIL '+JSON.stringify({path,error:String(e)}))}
}
