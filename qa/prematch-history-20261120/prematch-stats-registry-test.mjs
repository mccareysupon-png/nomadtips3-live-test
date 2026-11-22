// BALL46 PRE-MATCH STATISTICS REGISTRY V1 — TEST ONLY
// Event journal + daily/lifetime immutable-source Snapshots in Durable Object.
// Read-only source ledgers: test_pick_1x2, test_pick_btts. No provider calls.
import {londonAccountingWindow} from './london-cutoff.mjs';
const all=(db,sql,...args)=>Array.from(db.exec(sql,...args));
const markets=['1X2','BTTS','TOTAL'];
const sources={'1X2':'test_pick_1x2',BTTS:'test_pick_btts'};
const fields=['total','pending','win','loss','push','units'];
const dfields=['selected','settled','win','loss','push','units'];
const good=new Set(['PENDING','WIN','LOSS','PUSH']);
const num=x=>typeof x==='number'&&Number.isFinite(x)?x:0;
const positive=x=>Number.isSafeInteger(x)&&x>0;
function normalize(raw,market){
 const status=String(raw.status).toUpperCase(),pickedAt=Number(raw.picked_at),kickoff=Number(raw.kickoff);
 if(!good.has(status)||!positive(Number(raw.fixture_id))||!positive(pickedAt)||
  !positive(kickoff)||pickedAt>=kickoff)throw Error('INVALID_STATS_EVENT_'+market+'_'+raw.fixture_id);
 const settledAt=status==='PENDING'?null:Number(raw.settled_at);
 if(status!=='PENDING'&&(!positive(settledAt)||settledAt<kickoff))throw Error('INVALID_SETTLEMENT_TIME');
 if(status==='PENDING'&&(raw.settled_at!=null||raw.units!=null))throw Error('PENDING_HAS_RESULT');
 const units=status==='PENDING'||status==='PUSH'?0:Number(raw.units);
 if(!Number.isFinite(units)||status==='WIN'&&units<=0||status==='LOSS'&&units>=0||
  status==='PUSH'&&raw.units!=null&&num(raw.units)!==0)throw Error('INVALID_RESULT_UNITS');
 return {market,fixtureId:Number(raw.fixture_id),pickedAt,kickoff,status,settledAt,units};
}
function vec(e){
 return {total:1,pending:e.status==='PENDING'?1:0,win:e.status==='WIN'?1:0,
  loss:e.status==='LOSS'?1:0,push:e.status==='PUSH'?1:0,units:e.units};
}
function marketDelta(db,market,vector,sign,now){
 const vals=fields.map(k=>sign*num(vector[k]));
 db.exec("INSERT INTO b46_pre_market_snapshot_test(market,total,pending,win,loss,push,units,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(market) DO UPDATE SET total=total+excluded.total,pending=pending+excluded.pending,win=win+excluded.win,loss=loss+excluded.loss,push=push+excluded.push,units=units+excluded.units,updated_at=excluded.updated_at",
  market,...vals,now);
}
function dayDelta(db,market,day,vector,sign,now){
 const vals=dfields.map(k=>sign*num(vector[k]));
 db.exec("INSERT INTO b46_pre_daily_snapshot_test(market,business_day,selected,settled,win,loss,push,units,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(market,business_day) DO UPDATE SET selected=selected+excluded.selected,settled=settled+excluded.settled,win=win+excluded.win,loss=loss+excluded.loss,push=push+excluded.push,units=units+excluded.units,updated_at=excluded.updated_at",
  market,day,...vals,now);
}
function applyEvent(db,e,sign,now){
 if(!e)return;
 const selectedDay=londonAccountingWindow(e.pickedAt).businessDay;
 const settleDay=e.settledAt==null?null:londonAccountingWindow(e.settledAt).businessDay;
 for(const market of [e.market,'TOTAL']){
  marketDelta(db,market,vec(e),sign,now);
  dayDelta(db,market,selectedDay,{selected:1},sign,now);
  if(settleDay)dayDelta(db,market,settleDay,{
   settled:1,win:e.status==='WIN'?1:0,loss:e.status==='LOSS'?1:0,
   push:e.status==='PUSH'?1:0,units:e.units},sign,now);
 }
}
export function initPreMarketStatsRegistry(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_pre_stats_event_test (market TEXT NOT NULL CHECK(market IN ('1X2','BTTS')), fixture_id INTEGER NOT NULL, picked_at INTEGER NOT NULL, kickoff INTEGER NOT NULL, status TEXT NOT NULL, settled_at INTEGER, units REAL NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, indexed_at INTEGER NOT NULL, PRIMARY KEY(market,fixture_id))");
 db.exec("CREATE TABLE IF NOT EXISTS b46_pre_market_snapshot_test (market TEXT PRIMARY KEY CHECK(market IN ('1X2','BTTS','TOTAL')), total INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0, win INTEGER NOT NULL DEFAULT 0, loss INTEGER NOT NULL DEFAULT 0, push INTEGER NOT NULL DEFAULT 0, units REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_pre_daily_snapshot_test (market TEXT NOT NULL CHECK(market IN ('1X2','BTTS','TOTAL')), business_day TEXT NOT NULL, selected INTEGER NOT NULL DEFAULT 0, settled INTEGER NOT NULL DEFAULT 0, win INTEGER NOT NULL DEFAULT 0, loss INTEGER NOT NULL DEFAULT 0, push INTEGER NOT NULL DEFAULT 0, units REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(market,business_day))");
 db.exec("CREATE INDEX IF NOT EXISTS b46_pre_stats_event_status ON b46_pre_stats_event_test(market,status)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_pre_daily_market_day ON b46_pre_daily_snapshot_test(market,business_day)");
 for(const market of markets)db.exec("INSERT OR IGNORE INTO b46_pre_market_snapshot_test(market) VALUES(?)",market);
}
export function syncPreMarketStatsRegistry(db,now,limit=1000){
 if(!positive(now)||!Number.isInteger(limit)||limit<1||limit>2000)throw Error('INVALID_STATS_SYNC');
 const report={code:'B46_PREMATCH_STATS_REGISTRY_V1',processed:0,newEvents:0,settlements:0,
  revisions:0,byMarket:{'1X2':{newEvents:0,settlements:0,revisions:0},BTTS:{newEvents:0,settlements:0,revisions:0}},
  complete:true,providerCalls:0,sourceLedgersModified:false};
 db.transaction(()=>{
  for(const [market,table] of Object.entries(sources)){
   const query="SELECT p.fixture_id,p.picked_at,p.kickoff,p.status,p.settled_at,p.units,"+
    "r.picked_at old_picked_at,r.kickoff old_kickoff,r.status old_status,"+
    "r.settled_at old_settled_at,r.units old_units,r.revision old_revision "+
    "FROM "+table+" p LEFT JOIN b46_pre_stats_event_test r ON r.market=? AND r.fixture_id=p.fixture_id "+
    "WHERE r.fixture_id IS NULL OR r.picked_at IS NOT p.picked_at OR r.kickoff IS NOT p.kickoff "+
    "OR r.status IS NOT p.status OR r.settled_at IS NOT p.settled_at "+
    "OR r.units IS NOT COALESCE(p.units,0) ORDER BY p.fixture_id LIMIT ?";
   const changed=all(db,query,market,limit);
   report.complete&&=changed.length<limit;
   for(const item of changed){
    const fresh=normalize(item,market);
    const prior=item.old_revision==null?null:{
     market,fixtureId:fresh.fixtureId,pickedAt:item.old_picked_at,kickoff:item.old_kickoff,
     status:item.old_status,settledAt:item.old_settled_at,units:num(item.old_units)};
    if(prior)applyEvent(db,prior,-1,now);
    applyEvent(db,fresh,1,now);
    db.exec("INSERT INTO b46_pre_stats_event_test(market,fixture_id,picked_at,kickoff,status,settled_at,units,revision,indexed_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(market,fixture_id) DO UPDATE SET picked_at=excluded.picked_at,kickoff=excluded.kickoff,status=excluded.status,settled_at=excluded.settled_at,units=excluded.units,revision=excluded.revision,indexed_at=excluded.indexed_at",
     market,fresh.fixtureId,fresh.pickedAt,fresh.kickoff,fresh.status,fresh.settledAt,
     fresh.units,prior?Number(item.old_revision)+1:1,now);
    report.processed++;
    if(prior){report.revisions++;report.byMarket[market].revisions++}
    else{report.newEvents++;report.byMarket[market].newEvents++}
    if(fresh.status!=='PENDING'&&prior?.status==='PENDING'){
     report.settlements++;report.byMarket[market].settlements++;
    }
   }
  }
  for(const row of all(db,'SELECT market,total,pending,win,loss,push FROM b46_pre_market_snapshot_test')){
   if([row.total,row.pending,row.win,row.loss,row.push].some(x=>x<0)||
    row.total!==row.pending+row.win+row.loss+row.push)
    throw Error('SNAPSHOT_INVARIANT_'+row.market);
  }
 });
 return report;
}
function summary(row){
 const win=Number(row?.win||0),loss=Number(row?.loss||0),push=Number(row?.push||0);
 return {total:Number(row?.total||0),pending:Number(row?.pending||0),win,loss,
  push,draw:push,settled:win+loss+push,units:num(row?.units),
  winRate:win+loss?100*win/(win+loss):null,updatedAt:Number(row?.updated_at||0)};
}
function readSeries(db,market,now,rangeDays){
 const current=londonAccountingWindow(now);
 const start=new Date(Date.parse(current.businessDay+'T00:00:00Z')-(rangeDays-1)*86400000).toISOString().slice(0,10);
 const earlier=all(db,'SELECT COALESCE(SUM(units),0) AS units FROM b46_pre_daily_snapshot_test WHERE market=? AND business_day<?',market,start)[0];
 let cumulativeUnits=num(earlier?.units);
 const result=[];
 for(const r of all(db,'SELECT business_day,selected,settled,win,loss,push,units FROM b46_pre_daily_snapshot_test WHERE market=? AND business_day>=? AND business_day<=? ORDER BY business_day',market,start,current.businessDay)){
  cumulativeUnits+=num(r.units);
  result.push({date:r.business_day,selected:r.selected,settled:r.settled,
   netUnits:num(r.units),cumulativeUnits,win:r.win,loss:r.loss,draw:r.push,push:r.push,
   winRate:r.win+r.loss?100*r.win/(r.win+r.loss):null});
 }
 return result;
}
export function readPreMarketStatsRegistry(db,now,{rangeDays=90}={}){
 if(!positive(now)||![30,90].includes(rangeDays))throw Error('INVALID_STATS_RANGE');
 const window=londonAccountingWindow(now),summaries={},dailyBooks={},dailySeries={};
 for(const market of markets){
  const record=all(db,'SELECT * FROM b46_pre_market_snapshot_test WHERE market=?',market)[0];
  const total=summary(record);
  summaries[market]=total;
  const t=all(db,'SELECT * FROM b46_pre_daily_snapshot_test WHERE market=? AND business_day=?',market,window.businessDay)[0];
  const win=Number(t?.win||0),loss=Number(t?.loss||0),push=Number(t?.push||0);
  dailyBooks[market]={window,selected:{total:Number(t?.selected||0),pending:null},
   settled:{total:Number(t?.settled||0),win,loss,push,draw:push,
    winRate:win+loss?100*win/(win+loss):null,units:num(t?.units)},
   carriedPending:total.pending,basis:'SETTLED_AT_FOR_WINRATE_AND_PL',
   model:'LONDON_06_SHARED_WITH_LIVE',source:'SNAPSHOT_V1',providerCalls:0};
  dailySeries[market]=readSeries(db,market,now,rangeDays);
 }
 const state=all(db,'SELECT COUNT(*) AS entries,COALESCE(SUM(revision-1),0) AS revisions FROM b46_pre_stats_event_test')[0];
 return {code:'B46_PREMATCH_STATS_REGISTRY_V1',mode:'TEST_ONLY',source:'PERSISTED_DURABLE_OBJECT_SQL',
  rangeDays,window,markets:summaries,dailyBooks,dailySeries,
  registryEvents:Number(state?.entries||0),revisions:Number(state?.revisions||0),
  providerCalls:0,productionWrites:0,fullLedgerRecalculationOnRead:false};
}
export function auditPreMarketStatsRegistry(db){
 const marketsOut={};
 for(const [market,table] of Object.entries(sources)){
  const src=all(db,"SELECT COUNT(*) total,COALESCE(SUM(status='PENDING'),0) pending,COALESCE(SUM(status='WIN'),0) win,COALESCE(SUM(status='LOSS'),0) loss,COALESCE(SUM(status='PUSH'),0) push,COALESCE(SUM(units),0) units FROM "+table)[0];
  const snap=all(db,'SELECT * FROM b46_pre_market_snapshot_test WHERE market=?',market)[0];
  marketsOut[market]={sourceRows:src.total,snapshotRows:snap.total,
   valid:fields.every(k=>Math.abs(num(src[k])-num(snap[k]))<1e-8)};
 }
 const total=all(db,"SELECT * FROM b46_pre_market_snapshot_test WHERE market='TOTAL'")[0];
 const parts=all(db,"SELECT * FROM b46_pre_market_snapshot_test WHERE market IN ('1X2','BTTS')");
 const totalValid=fields.every(k=>Math.abs(num(total[k])-parts.reduce((sum,r)=>sum+num(r[k]),0))<1e-8);
 return {code:'B46_PREMATCH_STATS_REGISTRY_AUDIT_V1',markets:marketsOut,totalValid,
  verified:Object.values(marketsOut).every(x=>x.valid)&&totalValid,
  auditOnly:true,providerCalls:0,sourceLedgersModified:false};
}
