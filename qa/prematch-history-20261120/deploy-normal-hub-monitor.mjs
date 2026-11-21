import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,acct=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&acct,'CF credentials required');
const name='ball46-prematch-only-test-20261120',root='https://api.cloudflare.com/client/v4/accounts/'+acct+'/workers';
const host='https://'+name+'.mccarey-supon.workers.dev';
const secret=crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(p,options={}){
 const r=await fetch(root+p,{...options,headers:{authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(40000)});
 const j=await r.json();assert(r.ok&&j.success,'Cloudflare '+p+' '+r.status+' '+JSON.stringify(j.errors||[]));return j.result;
}
async function request(p){const r=await fetch(host+p,{headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(25000)});assert(r.ok,'TEST '+p+' '+r.status);return r.json()}
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
const before=await Promise.all(protectedNames.map(async n=>({name:n,versions:(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions})));
const old=await request('/test-ledger');assert.equal(old.mode,'TEST_ONLY');assert.equal(old.stats.total,8);
const modules=['prematch-only-worker.mjs','history.mjs','prematch-bot.mjs','stored-prematch-feed.mjs','stored-signal-adapter.mjs','evaluate-btts-signal.mjs','evaluate-1x2-signal.mjs','market-1x2.mjs','test-pick-ledger.mjs','normal-hub-monitor.mjs','london-cutoff.mjs','history-five-rounds.mjs'];
const main=fs.readFileSync('qa/prematch-history-20261120/prematch-only-worker.mjs','utf8');
assert(main.includes('this.env.HUB.fetch(\'https://hub.internal/snapshot\''));
assert(!main.includes('api.5dollarfootballapi.com'));
assert(main.includes('DISABLED_NO_ADDITIONAL_PROVIDER_RUNS'));
assert(main.includes('history-round-tick')&&main.includes('importHistoryRoundFromCache'));
const payload=new FormData();
payload.append('metadata',new Blob([JSON.stringify({main_module:modules[0],compatibility_date:'2026-11-20',bindings:[
 {name:'STORE',type:'durable_object_namespace',class_name:'PrematchStore'},
 {name:'OWNER_SECRET',type:'secret_text',text:secret},
 {name:'HUB',type:'service',service:'nomadtips3-5usd-hub-343',environment:'production'}
]})],{type:'application/json'}),'metadata.json');
for(const file of modules)payload.append(file,new Blob([fs.readFileSync('qa/prematch-history-20261120/'+file)],{type:'application/javascript+module'}),file);
const uploaded=await cf('/scripts/'+name,{method:'PUT',body:payload});
console.log('NORMAL_HUB_UPLOAD '+JSON.stringify({name,id:uploaded?.deployment_id||null}));
let active=null;
for(let i=0;i<30;i++){
 try{const h=await request('/health');
 if(h.hubReadOnly===true&&h.historyRounds?.maxRounds===5&&h.historyRounds?.maxPerRound===100&&h.historyRounds?.maxPerDay===500){active=uploaded?.deployment_id||'HTTP_ROUTE_VERIFIED';break}
 }catch(e){console.log('HISTORY_DEPLOY_PENDING '+i+' '+String(e.message).slice(0,130))}
 await new Promise(r=>setTimeout(r,1500));
}
assert(active,'TEST_HISTORY_FIVE_ROUNDS_NOT_SERVING');
let d;for(let i=0;i<25;i++){
 try{
  d=await request('/preview-data');
  if(d.testMonitor?.source==='NOMAD_343_HUB_CACHED_SNAPSHOT'&&!d.testMonitor.error&&d.testMonitor.details?.matches>=4&&d.testLedger?.stats?.total===8)break;
  console.log('HUB_MONITOR_WAIT '+JSON.stringify({i,error:d.testMonitor?.error,details:d.testMonitor?.details}));
 }catch(e){console.log('HUB_MONITOR_WAIT '+i+' '+String(e).slice(0,140))}
 await new Promise(r=>setTimeout(r,1400));
}
assert(d?.testMonitor?.details?.matches>=4&&!d.testMonitor.error,'CACHE_ONLY_HUB_CONNECTION_NOT_VERIFIED');
assert(d.testMonitor.cacheOnly===true&&d.testMonitor.providerCalls===0,'NOT_CACHE_ONLY');
assert.equal(d.historyRounds?.maxRounds,5);assert.equal(d.historyRounds?.maxPerRound,100);assert.equal(d.historyRounds?.maxPerDay,500);
const firstRound=await fetch(host+'/history-round-tick',{method:'POST',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000)});
assert.equal(firstRound.status,200);const firstRoundInfo=await firstRound.json();
assert.equal(firstRoundInfo.providerCalls,0);
assert(firstRoundInfo.rounds?.completed<=5&&firstRoundInfo.rounds?.imported<=500);
const secondRound=await fetch(host+'/history-round-tick',{method:'POST',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000)});
assert.equal(secondRound.status,200);const secondRoundInfo=await secondRound.json();
assert.equal(secondRoundInfo.providerCalls,0);
assert.equal(secondRoundInfo.rounds.completed,firstRoundInfo.rounds.completed,'DUPLICATE_ROUND');
assert.equal(secondRoundInfo.rounds.imported,firstRoundInfo.rounds.imported,'DUPLICATE_HISTORY_IMPORT');
console.log('PREMATCH_FIVE_ROUNDS_CHECK '+JSON.stringify({first:firstRoundInfo.rounds,second:secondRoundInfo.rounds,providerCalls:0}));
assert(d.dailyBook?.window?.timezone==='Europe/London'&&d.dailyBook?.window?.cutoffLocal==='06:00','LIVE_LONDON_CUTOFF_NOT_CONNECTED');
assert(d.dailyBook.window.begin<=Math.floor(Date.now()/1000)&&d.dailyBook.window.end>Math.floor(Date.now()/1000),'LONDON_DAY_WINDOW_INVALID');
assert(d.dailyBook.providerCalls===0&&d.dailyBook.selected&&d.dailyBook.settled&&Number.isInteger(d.dailyBook.carriedPending),'DAILY_ACCOUNT_MISSING');
assert(d.testLedger.stats.total===8,'PICKS_MISSING');
assert(d.testLedger.stats.settled>=3,'KNOWN_FULL_TIME_NOT_SETTLED');
const byId=new Map(d.testLedger.rows.map(x=>[x.fixture_id,x]));
for(const id of [204790068,203962150,204948736])assert(['WIN','LOSS'].includes(byId.get(id)?.status),'EXPECTED_FT_NOT_DECIDED_'+id);
const firstStats=d.testLedger.stats;
const second=await request('/preview-data');
assert.equal(second.testLedger.stats.total,8);
assert(second.testLedger.stats.settled>=firstStats.settled);
for(const id of [204790068,203962150,204948736])assert.equal(second.testLedger.rows.find(x=>x.fixture_id===id)?.status,byId.get(id).status);
const direct=await fetch(host+'/daily-run',{method:'POST',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(15000)});assert.equal(direct.status,409);
const stop=await direct.json();assert.equal(stop.providerCalls,0);
const settings=await cf('/scripts/'+name+'/settings');assert(settings.bindings?.some(b=>b.name==='HUB'&&b.type==='service'&&b.service==='nomadtips3-5usd-hub-343'));
const after=await Promise.all(protectedNames.map(async n=>({name:n,versions:(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions})));
console.log('NORMAL_HUB_MONITOR_VERIFIED '+JSON.stringify({url:host,activeVersion:active,source:d.testMonitor.source,hubCacheOnly:d.testMonitor.cacheOnly,hubDetails:d.testMonitor.details,monitor:d.testMonitor.monitor,stats:d.testLedger.stats,settled:d.testLedger.rows.filter(x=>x.status!=='PENDING').map(x=>({fixture:x.fixture_id,home:x.home,away:x.away,score:[x.hg,x.ag],status:x.status,units:x.units})),pending:d.testLedger.stats.pending,dailyBook:d.dailyBook,historyRounds:secondRoundInfo.rounds,extra5usdCalls:0,duplicateSettlement:false,protectedUnchanged:JSON.stringify(before)===JSON.stringify(after)}));
