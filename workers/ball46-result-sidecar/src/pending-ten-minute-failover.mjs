/**
 * BALL46 Pending-over-10m failover route.
 *
 * Native Signal/5USD remains unchanged. This is a durable per-fixture
 * work queue, not a new adjudicator. It only admits PENDING signals found
 * in an authoritative complete Ledger V2 read, at >=10m since pending.
 * Goaloo cannot settle an ongoing match: a verified FT is still required.
 */
import {pendingMarketEligible} from './pending-ledger-reader.mjs';
export const PENDING_FAILOVER_MS=10*60_000;
const clean=v=>String(v??'').trim();
const validNow=v=>typeof v==='string'&&/(?:Z|[+-]\d\d:\d\d)$/i.test(v)&&Number.isFinite(Date.parse(v));
export const pendingTimeMs=v=>{
 if(typeof v==='number'&&Number.isFinite(v)){
  if(v>=1e12&&v<1e14)return v;
  if(v>=1e9&&v<1e11)return v*1000;
 }
 if(typeof v==='string'&&/^\d{10,13}$/.test(v))return pendingTimeMs(Number(v));
 if(typeof v==='string'&&validNow(v))return Date.parse(v);
 return null;
};
export function routeOverduePending({
 rows=[],routes={},now=new Date().toISOString(),minimumMs=PENDING_FAILOVER_MS
}={}){
 if(!Array.isArray(rows)||!routes||typeof routes!=='object'||Array.isArray(routes)||
  !validNow(now)||minimumMs!==PENDING_FAILOVER_MS)
  return{ok:false,state:'BAD_ROUTE_INPUT',eligible:[],updates:[],holds:[]};
 const at=Date.parse(now),group=new Map(),holds=[],updates=[];
 const duplicated=new Set(),seenIds=new Set();
 for(const row of rows){
  if(!row||String(row.status).toUpperCase()!=='PENDING')continue;
  const id=clean(row.id),fid=clean(row.fixtureId);
  if(!id||!fid){holds.push({fixtureId:fid,reason:'MISSING_SIGNAL_ID'});continue}
  if(seenIds.has(id))duplicated.add(id);
  seenIds.add(id);
  if(!pendingMarketEligible(row)){holds.push({fixtureId:fid,reason:'NOT_GOAL_MARKET'});continue}
  const groupRows=group.get(fid)||[];groupRows.push(row);group.set(fid,groupRows);
 }
 const eligible=[];
 for(const [fixtureId,signals] of group){
  const prior=routes[fixtureId]||null;
  if(prior?.state==='DONE'){
   holds.push({fixtureId,reason:'ALREADY_FINAL_STOP'});
   continue;
  }
  if(signals.some(s=>duplicated.has(clean(s.id)))){
   holds.push({fixtureId,reason:'DUPLICATE_LEDGER_ID'});
   continue;
  }
  const firstObserved=pendingTimeMs(prior?.firstObservedAt)??at;
  const ages=signals.map(s=>pendingTimeMs(s.pendingSinceAt??s.pendingSince??s.createdAt)??firstObserved);
  // Every eligible signal under this fixture must be >=10m PENDING,
  // avoiding prematurely rerouting newly emitted bets on the same fixture.
  if(ages.some(x=>x>at||at-x<minimumMs)){
   holds.push({fixtureId,reason:'PENDING_LESS_THAN_10_MIN'});
   if(!prior)updates.push({fixtureId,
    record:{state:'PRIMARY',firstObservedAt:now,signalIds:signals.map(s=>clean(s.id))}});
   continue;
  }
  const signalIds=[...new Set(signals.map(s=>clean(s.id)))].sort();
  const record={
   state:'GOALOO',firstObservedAt:prior?.firstObservedAt||now,
   routedAt:prior?.routedAt||now,
   signalIds
  };
  eligible.push({fixtureId,signalIds,pendingDurationMs:at-Math.min(...ages),
   route:'GOALOO',reused:prior?.state==='GOALOO'});
  if(!prior||prior.state!=='GOALOO'||signalIds.join('|')!==[...(prior.signalIds||[])].sort().join('|'))
   updates.push({fixtureId,record});
 }
 eligible.sort((a,b)=>b.pendingDurationMs-a.pendingDurationMs||a.fixtureId.localeCompare(b.fixtureId));
 return{ok:true,state:'PENDING_10M_FAILOVER_ROUTED',eligible,updates,holds,
  totalPending:rows.filter(s=>String(s?.status).toUpperCase()==='PENDING').length,
  routedFixtureCount:eligible.length};
}
/**
 * Permanent tombstone: only after original native Ledger V2 proves each
 * target Signal is terminal with a graded result, no remaining PENDING
 * signals for this fixture (incl Corners) on a complete authoritative read.
 * No automatic reopening, even if Goaloo repeats the same FT indefinitely.
 */
export function closeAfterLedgerSettlement({
 fixtureId,route,ledgerRows,verifiedReadback,now=new Date().toISOString()
}={}){
 const fid=clean(fixtureId);
 if(!fid||!validNow(now)||!route||route.state!=='GOALOO')
  return{ok:false,state:'NO_GOALOO_ROUTE'};
 if(!Array.isArray(ledgerRows)||verifiedReadback?.ok!==true)
  return{ok:false,state:'NOT_AUTHORITATIVE_SETTLEMENT'};
 const relevant=ledgerRows.filter(r=>clean(r?.fixtureId)===fid);
 if(relevant.some(r=>String(r.status).toUpperCase()==='PENDING'))
  return{ok:false,state:'FIXTURE_STILL_HAS_PENDING'};
 const readback=Array.isArray(verifiedReadback.rows)?verifiedReadback.rows:[];
 const expected=new Set(route.signalIds||[]);
 if(!expected.size||readback.length!==expected.size)
  return{ok:false,state:'INCOMPLETE_SETTLED_SIGNAL_READBACK'};
 const permitted=new Set(['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS']);
 for(const row of readback){
  if(!expected.has(clean(row.id))||clean(row.fixtureId)!==fid||
   String(row.status).toUpperCase()!=='SETTLED'||
   !permitted.has(String(row.result).toUpperCase()))
   return{ok:false,state:'NATIVE_RESULT_NOT_TERMINAL'};
 }
 return{ok:true,state:'DONE',record:{...route,state:'DONE',
  completedAt:now,settledSignalIds:[...expected].sort(),
  settlementEvidence:'LEDGER_V2_AUTHORITATIVE_READBACK',
  neverInspectGoalooAgain:true}};
}
