// BALL46 PREMATCH O/U V2 — TEST-ONLY immutable FT settlement + delta snapshots.
// No provider requests. Authoritative pick odds/model remain in V2 shadow.
import {londonAccountingWindow} from './london-cutoff.mjs';
import {profitForOuResult} from './ou-value-screener-v2-test.mjs';
const get=(db,q,...a)=>Array.from(db.exec(q,...a));
const whole=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const clock=x=>{
 if(Number.isSafeInteger(x)&&x>1e12)return Math.floor(x/1000);
 if(Number.isSafeInteger(x)&&x>1e9)return x;
 if(typeof x==='string'&&x){const t=Date.parse(x);if(Number.isFinite(t))return Math.floor(t/1000);}
 return null;
};
export const OU_V2_SETTLEMENT_POLICY=Object.freeze({
 mode:'B46_OU_V2_TEST_FT_SETTLEMENT',source:'CACHED_HUB_FINISHED_OR_EXISTING_FT_ARCHIVE',
 immutablePick:true,oneResultPerFixture:true,asianQuarterExact:true,
 halfWinsCountAsWin:true,halfLossesCountAsLoss:true,
 noProviderRequests:true,productionWrites:0
});
export function initOuV2Settlement(db){
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_v2_settlement_test(fixture_id INTEGER PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('WIN','LOSS','PUSH')),kind TEXT NOT NULL,hg INTEGER NOT NULL,ag INTEGER NOT NULL,units REAL NOT NULL,settled_at INTEGER NOT NULL,result_observed_at INTEGER NOT NULL,result_source TEXT NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS b46_ou_v2_settle_time_test ON b46_ou_v2_settlement_test(settled_at)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_v2_event_test(fixture_id INTEGER PRIMARY KEY,picked_at INTEGER NOT NULL,status TEXT NOT NULL,settled_at INTEGER,units REAL,revision INTEGER NOT NULL)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_v2_snapshot_test(id INTEGER PRIMARY KEY CHECK(id=1),total INTEGER NOT NULL DEFAULT 0,pending INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,push INTEGER NOT NULL DEFAULT 0,units REAL NOT NULL DEFAULT 0,priced_settled INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)");
 db.exec("INSERT OR IGNORE INTO b46_ou_v2_snapshot_test(id) VALUES(1)");
 db.exec("CREATE TABLE IF NOT EXISTS b46_ou_v2_daily_test(business_day TEXT PRIMARY KEY,selected INTEGER NOT NULL DEFAULT 0,settled INTEGER NOT NULL DEFAULT 0,win INTEGER NOT NULL DEFAULT 0,loss INTEGER NOT NULL DEFAULT 0,push INTEGER NOT NULL DEFAULT 0,units REAL NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)");
}
function finishedHub(snapshot,now){
 if(snapshot?.ok!==true||snapshot?.cacheOnly!==true||snapshot?.stale===true||
  !Array.isArray(snapshot.fixtures))return new Map();
 const observed=clock(snapshot.fetchedAt);
 if(!observed||observed>now+60||now-observed>3600)return new Map();
 const result=new Map();
 for(const r of snapshot.fixtures){
  if(String(r?.status??'').toLowerCase()!=='finished'||
    String(r?.boardState??'').toLowerCase()!=='finished'||
    !['full','ft'].includes(String(r?.statusCode??r?.status_code??'').toLowerCase()))continue;
  const id=Number(r.fixtureId??r.id),homeId=Number(r.home?.id??r.teams?.home?.id),
   awayId=Number(r.away?.id??r.teams?.away?.id),
   hg=r.goals?.home,ag=r.goals?.away;
  if(!positive(id)||!positive(homeId)||!positive(awayId)||!whole(hg)||!whole(ag))continue;
  const kickoff=clock(r.kickoffUtc??r.kickoffAt??r.kickoff_ts);
  if(!kickoff||kickoff>=observed)continue;
  result.set(id,{fixtureId:id,homeId,awayId,hg:Number(hg),ag:Number(ag),
   kickoff,observed,source:'HUB_FINISHED_CACHED'});
 }
 return result;
}
function archivedResult(db,pick,now){
 const rows=get(db,"SELECT fixture_id,home_id,away_id,hg,ag,kickoff,observed,status FROM result_version WHERE fixture_id=? AND home_id=? AND away_id=? AND status='finished' AND observed<=? ORDER BY observed DESC LIMIT 1",
  pick.fixture_id,pick.home_id,pick.away_id,now);
 const r=rows[0];
 if(!r||!whole(r.hg)||!whole(r.ag)||!positive(r.kickoff)||
   !positive(r.observed)||r.kickoff>=r.observed||r.kickoff<=pick.picked_at)return null;
 return {fixtureId:r.fixture_id,homeId:r.home_id,awayId:r.away_id,
  hg:Number(r.hg),ag:Number(r.ag),kickoff:Number(r.kickoff),
  observed:Number(r.observed),source:'FT_ARCHIVE_RESULT_VERSION'};
}
function kindFor(units,price){
 if(Math.abs(units)<1e-8)return {status:'PUSH',kind:'PUSH'};
 if(units>0)return {status:'WIN',kind:Math.abs(units-(price-1))<1e-8?'FULL_WIN':'HALF_WIN'};
 return {status:'LOSS',kind:Math.abs(units+1)<1e-8?'FULL_LOSS':'HALF_LOSS'};
}
function daily(db,day,values,now){
 db.exec("INSERT INTO b46_ou_v2_daily_test(business_day,selected,settled,win,loss,push,units,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(business_day) DO UPDATE SET selected=selected+excluded.selected,settled=settled+excluded.settled,win=win+excluded.win,loss=loss+excluded.loss,push=push+excluded.push,units=units+excluded.units,updated_at=excluded.updated_at",
  day,values.selected??0,values.settled??0,values.win??0,values.loss??0,
  values.push??0,values.units??0,now);
}
function applyEvent(db,event,sign,now){
 const status=event.status;
 const pending=Number(status==='PENDING'),win=Number(status==='WIN'),
  loss=Number(status==='LOSS'),push=Number(status==='PUSH');
 const settled=win+loss+push,units=settled?Number(event.units):0;
 db.exec("UPDATE b46_ou_v2_snapshot_test SET total=total+?,pending=pending+?,win=win+?,loss=loss+?,push=push+?,units=units+?,priced_settled=priced_settled+?,updated_at=? WHERE id=1",
  sign,sign*pending,sign*win,sign*loss,sign*push,sign*units,sign*settled,now);
 const selectedDay=londonAccountingWindow(event.picked_at).businessDay;
 daily(db,selectedDay,{selected:sign},now);
 if(settled&&positive(event.settled_at)){
  const settledDay=londonAccountingWindow(event.settled_at).businessDay;
  daily(db,settledDay,{settled:sign,win:sign*win,loss:sign*loss,
   push:sign*push,units:sign*units},now);
 }
}
export function syncOuV2SettlementSnapshot(db,now){
 initOuV2Settlement(db);
 const pending=get(db,"SELECT s.fixture_id,s.picked_at,COALESCE(t.status,'PENDING') AS status,t.settled_at,t.units,e.picked_at AS previous_picked,e.status AS previous_status,e.settled_at AS previous_settled,e.units AS previous_units,e.revision AS previous_revision FROM b46_ou_value_v2_shadow_test s LEFT JOIN b46_ou_v2_settlement_test t ON t.fixture_id=s.fixture_id LEFT JOIN b46_ou_v2_event_test e ON e.fixture_id=s.fixture_id WHERE e.fixture_id IS NULL OR e.picked_at IS NOT s.picked_at OR e.status IS NOT COALESCE(t.status,'PENDING') OR e.settled_at IS NOT t.settled_at OR e.units IS NOT t.units ORDER BY s.fixture_id LIMIT 1000");
 let changed=0;
 db.transaction(()=>{
  for(const row of pending){
   if(row.previous_revision!=null)applyEvent(db,{picked_at:row.previous_picked,
    status:row.previous_status,settled_at:row.previous_settled,units:row.previous_units},-1,now);
   applyEvent(db,row,1,now);
   db.exec("INSERT INTO b46_ou_v2_event_test(fixture_id,picked_at,status,settled_at,units,revision) VALUES(?,?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET picked_at=excluded.picked_at,status=excluded.status,settled_at=excluded.settled_at,units=excluded.units,revision=revision+1",
    row.fixture_id,row.picked_at,row.status,row.settled_at,row.units,row.previous_revision==null?1:row.previous_revision+1);
   changed++;
  }
  const snap=get(db,"SELECT * FROM b46_ou_v2_snapshot_test WHERE id=1")[0];
  if(snap.total!==snap.pending+snap.win+snap.loss+snap.push||
    [snap.total,snap.pending,snap.win,snap.loss,snap.push,snap.priced_settled].some(v=>v<0))
    throw Error('OU_V2_SNAPSHOT_INVARIANT');
 });
 return {changed,providerCalls:0,productionWrites:0};
}
export function settleOuV2FromExistingResults(db,{now,snapshot=null}={}){
 if(!positive(now))throw Error('OU_V2_SETTLEMENT_BAD_CLOCK');
 initOuV2Settlement(db);
 const finished=finishedHub(snapshot,now);
 const pending=get(db,"SELECT s.fixture_id,s.home_id,s.away_id,s.kickoff,s.picked_at,s.pick,s.line,s.price FROM b46_ou_value_v2_shadow_test s LEFT JOIN b46_ou_v2_settlement_test t ON t.fixture_id=s.fixture_id WHERE t.fixture_id IS NULL AND s.kickoff<? ORDER BY s.kickoff,s.fixture_id LIMIT 1000",now);
 let inserted=0,fromHub=0,fromArchive=0,noVerifiedFt=0;
 db.transaction(()=>{
  for(const p of pending){
   const result=finished.get(Number(p.fixture_id))??archivedResult(db,p,now);
   if(!result||Number(result.homeId)!==Number(p.home_id)||
    Number(result.awayId)!==Number(p.away_id)||
    !positive(result.kickoff)||result.kickoff<=p.picked_at||
    result.observed<result.kickoff){noVerifiedFt++;continue;}
   const units=profitForOuResult(result.hg+result.ag,Number(p.line),String(p.pick),Number(p.price));
   const status=kindFor(units,Number(p.price));
   db.exec("INSERT OR IGNORE INTO b46_ou_v2_settlement_test(fixture_id,status,kind,hg,ag,units,settled_at,result_observed_at,result_source) VALUES(?,?,?,?,?,?,?,?,?)",
    p.fixture_id,status.status,status.kind,result.hg,result.ag,units,now,result.observed,result.source);
   if(Number(get(db,'SELECT changes() AS n')[0]?.n??0)===1){
    inserted++;if(result.source==='HUB_FINISHED_CACHED')fromHub++;else fromArchive++;
   }
  }
 });
 const synced=syncOuV2SettlementSnapshot(db,now);
 return {status:'OU_V2_FT_RECONCILED',seen:pending.length,settled:inserted,
  fromHub,fromArchive,noVerifiedFt,snapshotChanges:synced.changed,
  providerCalls:0,productionWrites:0};
}
export function readOuV2SettlementState(db,now){
 const exists=get(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='b46_ou_v2_snapshot_test'").length>0;
 const fallback={total:0,pending:0,win:0,loss:0,push:0,units:0,priced_settled:0};
 const s=exists?(get(db,"SELECT * FROM b46_ou_v2_snapshot_test WHERE id=1")[0]??fallback):fallback;
 const win=Number(s.win),loss=Number(s.loss),push=Number(s.push),settled=win+loss+push;
 const stats={total:Number(s.total),pending:Number(s.pending),win,loss,push,draw:push,settled,
  winRate:win+loss?100*win/(win+loss):null,
  units:settled?Number(s.units):null,pricedSettled:settled,pricedPending:Number(s.pending)};
 const window=londonAccountingWindow(now),today=window.businessDay;
 const rows=exists?get(db,"SELECT * FROM b46_ou_v2_daily_test WHERE business_day<=? ORDER BY business_day DESC LIMIT 90",today).reverse():[];
 const d=rows.find(x=>x.business_day===today),w=Number(d?.win??0),l=Number(d?.loss??0),p=Number(d?.push??0);
 const dailyBook={window,selected:{total:Number(d?.selected??0),pending:null},
  settled:{total:Number(d?.settled??0),win:w,loss:l,push:p,draw:p,
   winRate:w+l?100*w/(w+l):null,units:Number(d?.settled??0)?Number(d.units):null},
  basis:'SETTLED_AT_ASIAN_ODDS_LOCKED',model:'LONDON_06_SHARED_WITH_LIVE',
  source:'O_U_V2_IMMUTABLE_FT_SNAPSHOT_TEST',providerCalls:0};
 let cumulative=0;
 const dailySeries=rows.map(r=>{
  cumulative+=Number(r.units)||0;
  return {date:r.business_day,selected:r.selected,settled:r.settled,
   win:r.win,loss:r.loss,draw:r.push,stakedUnits:r.settled,
   netUnits:r.settled?Number(r.units):null,cumulativeUnits:r.settled?cumulative:null};
 });
 const settlementRows=exists?get(db,"SELECT fixture_id,status,kind,hg,ag,units,settled_at,result_source FROM b46_ou_v2_settlement_test ORDER BY fixture_id LIMIT 2000"):[];
 return {mode:OU_V2_SETTLEMENT_POLICY.mode,stats,dailyBook,dailySeries,
  settlements:Object.fromEntries(settlementRows.map(x=>[String(x.fixture_id),x])),
  providerCallsThisRead:0,fullLedgerRecalculationOnRead:false};
}
