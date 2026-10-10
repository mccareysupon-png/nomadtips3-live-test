import {writeFileSync} from 'node:fs';
const key=process.env.FIVEDOLLAR_API_KEY;
if(!key||key.length<16)throw Error('MISSING_5DOLLAR_KEY');
const base='https://www.ball46.com/api/engine';
const api='https://api.5dollarfootballapi.com/v1/fixtures';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const start=Date.now();
const clock=new Date(start+7*3600000);
const dayStart=Date.UTC(clock.getUTCFullYear(),clock.getUTCMonth(),clock.getUTCDate())-7*3600000;
const windowStart=Math.floor(dayStart/1000),windowEnd=windowStart+86400;
const report={startedAt:new Date(start).toISOString(),dayStart:new Date(dayStart).toISOString(),strategy:'Bulk list of verified finished fixtures, authoritative settlement bridge',ledgerRows:0,pendingBefore:0,pendingEligible:0,providerPages:[],providerStatus429:0,providerErrors:0,bridgeErrors:0,matchedFixtures:0,providerFinished:0,settledFixtures:0,settledSignals:0,missingWorkingSignals:0,settledExamples:[],failures:[]};
const timed=(ms=30000)=>AbortSignal.timeout(ms);
const get=async(url,options={})=>{
  const response=await fetch(url,{cache:'no-store',signal:timed(options.timeout||30000),...options});
  const json=await response.json().catch(()=>null);
  return {response,json};
};
async function ledger(){
  const byId=new Map();let cursor=null;
  for(let n=0;n<30;n++){
    const u=new URL(base+'/statistics');u.searchParams.set('paged','1');u.searchParams.set('_recovery_batch',String(Date.now()));
    if(cursor)u.searchParams.set('cursor',cursor);
    const {response,json}=await get(u,{timeout:30000});
    if(!response.ok||!Array.isArray(json?.rows))throw Error('LEDGER_UNAVAILABLE_'+response.status);
    for(const s of json.rows)if(s?.id&&!byId.has(String(s.id)))byId.set(String(s.id),s);
    cursor=json.hasMore===true&&json.nextCursor?json.nextCursor:null;
    if(!cursor)return byId;
  }
  throw Error('LEDGER_PAGES_TRUNCATED');
}
const baseline=await ledger();
const boardResult=await get(base+'/board?_recovery_batch='+Date.now());
if(!boardResult.response.ok||!Array.isArray(boardResult.json?.fixtures))throw Error('BOARD_UNAVAILABLE');
const activeIds=new Set(boardResult.json.fixtures.filter(x=>/in_play|live|playing/i.test(String(x.status||x.boardState||''))).map(x=>String(x.fixtureId)));
const pending=[...baseline.values()].filter(x=>String(x.status).toUpperCase()==='PENDING');
const target=new Map();
for(const row of pending){
  if(!row?.fixtureId||!Number(row.createdAt)||start-Number(row.createdAt)<10*60_000)continue;
  if(activeIds.has(String(row.fixtureId)))continue;
  const fid=String(row.fixtureId);
  if(!target.has(fid))target.set(fid,[]);
  target.get(fid).push(row);
}
report.ledgerRows=baseline.size;report.pendingBefore=pending.length;report.pendingEligible=target.size;
writeFileSync('batch-recovery-baseline.json',JSON.stringify({createdAt:report.startedAt,pending},null,2));
console.log('BATCH_RECOVERY_BASELINE',JSON.stringify({ledgerRows:baseline.size,pendingSignals:pending.length,eligibleFixtureCount:target.size}));
const pages=[3,4,5,6,7,8,9,2,1,10,11,12,13,14,15];
let allEmpty=0,consecutiveBackoffs=0;
for(const page of pages){
  if(Date.now()-start>14*60_000)break;
  let success=false;
  for(let attempt=1;attempt<=5;attempt++){
    try{
      const url=new URL(api);
      for(const [k,v] of Object.entries({start_time:windowStart,end_time:windowEnd,status:'finished',per_page:100,page}))url.searchParams.set(k,String(v));
      const {response,json}=await get(url,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},timeout:28000});
      const remaining=response.headers.get('x-ratelimit-remaining'),reset=response.headers.get('x-ratelimit-reset');
      if(response.status===429){
        report.providerStatus429++;consecutiveBackoffs++;
        const sec=Number(reset),until=Number.isFinite(sec)&&sec>0?sec*1000+1500:Date.now()+65_000;
        const delayMs=Math.max(13000,Math.min(90000,until-Date.now()));
        console.log('BATCH_PROVIDER_BACKOFF',JSON.stringify({page,attempt,reset,delayMs,remaining}));
        if(consecutiveBackoffs>=8)break;
        await delay(delayMs);continue;
      }
      if(!response.ok||json?.success!==1||!Array.isArray(json.data)){
        report.providerErrors++;report.failures.push({page,stage:'provider',http:response.status});
        break;
      }
      success=true;consecutiveBackoffs=0;
      const fixtures=json.data;
      const candidates=fixtures.filter(f=>target.has(String(f.id??f.fixture_id))&&String(f.status)==='finished');
      report.providerPages.push({page,count:fixtures.length,matches:candidates.length,remaining,more:json.pagination?.has_more??null});
      console.log('BATCH_PROVIDER_PAGE',JSON.stringify({page,total:fixtures.length,eligibleMatches:candidates.length,remaining,hasMore:json.pagination?.has_more}));
      if(fixtures.length===0)allEmpty++;else allEmpty=0;
      for(const d of candidates){
        const fixtureId=String(d.id??d.fixture_id),h=Number(d.goals?.home),a=Number(d.goals?.away);
        if(!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0||!/^full|ft|finished|full_time$/i.test(String(d.status_code||''))){
          report.failures.push({fixtureId,stage:'invalid-final'});continue;
        }
        report.matchedFixtures++;
        try{
          const {response:bridge,json:b}=await get(base+'/reconcile-final',{
            method:'POST',
            headers:{'content-type':'application/json','x-settlement-token':key,Accept:'application/json'},
            body:JSON.stringify({success:1,data:d}),
            timeout:45000
          });
          if(!bridge.ok||b?.ok!==true){
            report.bridgeErrors++;report.failures.push({fixtureId,stage:'bridge',http:bridge.status});
            if(bridge.status===401||bridge.status===403)throw Error('BRIDGE_AUTH_REJECTED_'+bridge.status);
            continue;
          }
          const settled=Number(b.settled||0);
          if(settled>0){
            report.settledSignals+=settled;report.settledFixtures++;
            if(report.settledExamples.length<30)report.settledExamples.push({fixtureId,settled,score:[h,a],results:(b.rows||[]).map(x=>({id:x.id,result:x.result,market:x.market})).slice(0,6)});
          }else report.missingWorkingSignals++;
        }catch(e){
          report.bridgeErrors++;report.failures.push({fixtureId,stage:'bridge-exception',error:String(e?.message||e).slice(0,110)});
        }
      }
      report.providerFinished+=fixtures.length;
      console.log('BATCH_RECOVERY_CHECKPOINT',JSON.stringify({page,matchedFixtures:report.matchedFixtures,settledFixtures:report.settledFixtures,settledSignals:report.settledSignals,bridgeErrors:report.bridgeErrors}));
      break;
    }catch(e){
      report.providerErrors++;report.failures.push({page,stage:'exception',detail:String(e?.message||e).slice(0,120)});
      break;
    }
  }
  if(!success&&consecutiveBackoffs>=8)break;
  if(allEmpty>=2)break;
  await delay(1200);
}
const after=await ledger();
report.baselineRemainingPending=pending.filter(x=>String(after.get(String(x.id))?.status??x.status)==='PENDING').length;
report.baselineSettledReduction=report.pendingBefore-report.baselineRemainingPending;
report.finishedAt=new Date().toISOString();
writeFileSync('batch-recovery-report.json',JSON.stringify(report,null,2));
console.log('BATCH_RECOVERY_COMPLETE',JSON.stringify({...report,settledExamples:report.settledExamples.slice(0,8),failures:report.failures.slice(0,16)}).slice(0,13000));
if(report.settledSignals<=0)throw Error('BATCH_RECOVERY_NO_SETTLEMENTS');
