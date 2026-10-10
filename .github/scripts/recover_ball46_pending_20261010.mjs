import {writeFileSync} from 'node:fs';

const key=process.env.FIVEDOLLAR_API_KEY;
if(!key||key.length<16)throw Error('RECOVERY_API_KEY_UNAVAILABLE');
const host='https://www.ball46.com/api/engine';
const provider='https://api.5dollarfootballapi.com/v1/fixtures/';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=ms=>AbortSignal.timeout(ms);
const at=Date.now();
const minAge=10*60_000;
const paceMs=2250;  // keep below 30 provider calls/minute, leaving headroom for live Hub
const maxCalls=230;
const report={
  startedAt:new Date(at).toISOString(),mode:'AUTHORITATIVE_FINISHED_FIXTURES_ONLY',
  safety:'No Engine deploy, no ledger reset, existing authenticated final settlement bridge',
  totalLedgerRows:0,baselinePending:0,eligibleFixtures:0,
  attempted:0,finishedProvider:0,providerLive:0,providerUnknown:0,
  providerErrors:0,bridgeErrors:0,recoveredFixtures:0,recoveredSignals:0,
  noWorkingSignal:0,recovered:[],errors:[],skipped:[],
  matchedPendingBefore:0,matchedPendingAfter:null
};
const getJson=async(url,opts={})=>{
  const res=await fetch(url,{cache:'no-store',signal:timeout(opts.ms||28000),...opts});
  const json=await res.json().catch(()=>null);
  return {status:res.status,ok:res.ok,json};
};
const recent=new Map();
let cursor=null,pages=0;
while(pages<30){
  const u=new URL(host+'/statistics');u.searchParams.set('paged','1');
  if(cursor)u.searchParams.set('cursor',cursor);
  u.searchParams.set('_restore',String(at));
  const r=await getJson(u.toString());
  if(!r.ok||r.json?.ok===false||!Array.isArray(r.json?.rows))throw Error('LEDGER_SNAPSHOT_FAILED_PAGE_'+pages+'_'+r.status);
  for(const row of r.json.rows){
    if(!row?.id)continue;
    if(!recent.has(String(row.id)))recent.set(String(row.id),row);
  }
  pages++;
  cursor=r.json.nextCursor||null;
  if(!(r.json.hasMore===true&&cursor))break;
}
if(cursor&&pages>=30)throw Error('LEDGER_PAGINATION_TRUNCATED');
const board=await getJson(host+'/board?_restore='+at);
if(!board.ok||board.json?.ok!==true||!Array.isArray(board.json.fixtures))throw Error('PRODUCTION_BOARD_UNAVAILABLE');
const liveIds=new Set(board.json.fixtures.filter(f=>String(f.status||f.boardState||'').toLowerCase().match(/in_play|live|playing/)).map(f=>String(f.fixtureId)));
const pending=[...recent.values()].filter(x=>String(x.status).toUpperCase()==='PENDING');
const groups=new Map();
for(const row of pending){
  const id=String(row.fixtureId||'');
  const created=Number(row.createdAt);
  if(!id||!Number.isFinite(created)||at-created<minAge)continue;
  if(liveIds.has(id))continue; // still on the live board; normal Engine will settle
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(row);
}
const candidates=[...groups].sort((a,b)=>Math.min(...a[1].map(x=>Number(x.createdAt)))-Math.min(...b[1].map(x=>Number(x.createdAt))));
report.totalLedgerRows=recent.size;report.baselinePending=pending.length;
report.eligibleFixtures=candidates.length;
writeFileSync('recovery-baseline.json',JSON.stringify({at:report.startedAt,rows:pending},null,2));
console.log('RECOVERY_BASELINE',JSON.stringify({totalLedgerRows:report.totalLedgerRows,baselinePending:report.baselinePending,eligibleFixtures:candidates.length,liveOnBoard:liveIds.size,pageCount:pages}));
let nextAllowedAt=0,consecutiveErrors=0;
for(const [fixtureId,rows] of candidates){
  if(report.attempted>=maxCalls)break;
  const now=Date.now();if(now<nextAllowedAt)await wait(nextAllowedAt-now);
  nextAllowedAt=Date.now()+paceMs;
  report.attempted++;
  try{
    const r=await getJson(provider+encodeURIComponent(fixtureId)+'?include=events,stats',{
      headers:{Authorization:'Bearer '+key,Accept:'application/json'},ms:22000
    });
    if(r.status===429){
      report.providerErrors++;
      report.errors.push({fixtureId,stage:'provider',http:429});
      await wait(65_000);
      consecutiveErrors++;
      if(consecutiveErrors>=4)break;
      continue;
    }
    if(!r.ok||r.json?.success!==1||!r.json?.data){
      report.providerErrors++;
      report.errors.push({fixtureId,stage:'provider',http:r.status});
      consecutiveErrors++;
      if(consecutiveErrors>=8)break;
      continue;
    }
    consecutiveErrors=0;
    const d=r.json.data;
    if(String(d.id??d.fixture_id)!==fixtureId){report.errors.push({fixtureId,stage:'id-mismatch'});continue}
    const status=String(d.status??'').toLowerCase();
    if(status!=='finished'){
      if(/live|play/.test(status))report.providerLive++;
      else report.providerUnknown++;
      continue;
    }
    const home=Number(d.goals?.home),away=Number(d.goals?.away);
    if(!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0){
      report.errors.push({fixtureId,stage:'final-score-missing'});continue;
    }
    if(!/^(full|ft|finished|full_time)$/.test(String(d.status_code||'').toLowerCase())){
      report.errors.push({fixtureId,stage:'not-regulation-final',statusCode:String(d.status_code||'')});continue;
    }
    report.finishedProvider++;
    const bridge=await getJson(host+'/reconcile-final',{
      method:'POST',
      headers:{'x-settlement-token':key,'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify(r.json),ms:45000
    });
    if(!bridge.ok||bridge.json?.ok!==true){
      report.bridgeErrors++;report.errors.push({fixtureId,stage:'bridge',http:bridge.status,error:String(bridge.json?.error||'').slice(0,100)});
      if(bridge.status===401||bridge.status===403)throw Error('RECOVERY_BRIDGE_AUTH_REJECTED_'+bridge.status);
      continue;
    }
    const settled=Number(bridge.json.settled||0);
    if(settled>0){
      report.recoveredFixtures++;
      report.recoveredSignals+=settled;
      report.recovered.push({fixtureId,settled,verifiedGoals:[home,away],
        results:(bridge.json.rows||[]).map(x=>({id:String(x.id||''),market:x.market,result:x.result})).slice(0,8)});
    }else{
      report.noWorkingSignal++;
    }
    if(report.attempted%15===0)console.log('RECOVERY_CHECKPOINT',JSON.stringify({attempted:report.attempted,recoveredFixtures:report.recoveredFixtures,recoveredSignals:report.recoveredSignals,providerErrors:report.providerErrors,bridgeErrors:report.bridgeErrors,noWorkingSignal:report.noWorkingSignal}));
  }catch(e){
    report.errors.push({fixtureId,stage:'exception',detail:String(e?.message||e).slice(0,140)});
    if(String(e?.message||'').includes('AUTH_REJECTED'))break;
  }
}
const after=new Map();
let cursor2=null,pages2=0;
while(pages2<30){
  const u=new URL(host+'/statistics');u.searchParams.set('paged','1');
  if(cursor2)u.searchParams.set('cursor',cursor2);
  u.searchParams.set('_restore_verify',String(Date.now()));
  const r=await getJson(u.toString(),{ms:30000});
  if(!r.ok||!Array.isArray(r.json?.rows))break;
  for(const row of r.json.rows)if(row?.id&&!after.has(String(row.id)))after.set(String(row.id),row);
  pages2++;cursor2=r.json.nextCursor||null;
  if(!(r.json.hasMore===true&&cursor2))break;
}
report.matchedPendingBefore=pending.length;
report.matchedPendingAfter=pending.filter(x=>String(after.get(String(x.id))?.status||x.status).toUpperCase()==='PENDING').length;
report.finishedAt=new Date().toISOString();
report.verification={pages:pages2,afterLedgerCount:after.size,baselinePendingReduction:report.matchedPendingBefore-report.matchedPendingAfter,
remainingPendingFromBaseline:report.matchedPendingAfter};
writeFileSync('recovery-report.json',JSON.stringify(report,null,2));
console.log('RECOVERY_FINAL_REPORT',JSON.stringify({...report,recovered:report.recovered.slice(0,8),errors:report.errors.slice(0,16)}).slice(0,12000));
if(report.recoveredSignals===0)throw Error('NO_SIGNALS_RECOVERED');
