/**
 * Durable routing state manager. A completed match is tombstoned and never
 * sent to Goaloo again. Native Ledger V2 remains the only settlement owner.
 */
import {readPendingFromLedgerV2} from './pending-ledger-reader.mjs';
import {readSettledReceipt} from './ledger-settlement-readback.mjs';
import {routeOverduePending,closeAfterLedgerSettlement} from './pending-ten-minute-failover.mjs';
const PREFIX='ball46:verified-fixture-crosswalk:v3:route:';
export const routeStorageKey=id=>PREFIX+encodeURIComponent(String(id));
export async function refreshPendingGoalooRoutes(storage,engine,{at=new Date().toISOString(),maxPages=30}={}){
 if(!storage?.list||!storage?.put||!engine?.fetch)
  return{ok:false,state:'REQUIRED_LEDGER_ROUTE_BINDINGS_MISSING',eligibleIds:[],selectedRows:[]};
 let ledger;
 try{ledger=await readPendingFromLedgerV2(engine,{maxPages})}
 catch{return{ok:false,state:'LEDGER_READ_FAILED',eligibleIds:[],selectedRows:[]}}
 if(!ledger.ok)return{ok:false,state:ledger.state,eligibleIds:[],selectedRows:[]};
 const persisted=await storage.list({prefix:PREFIX}),routes={};
 for(const [key,value] of persisted){
  const id=decodeURIComponent(key.slice(PREFIX.length));
  routes[id]=value;
 }
 const planned=routeOverduePending({rows:ledger.rows,routes,now:at});
 if(!planned.ok)return{ok:false,state:planned.state,eligibleIds:[],selectedRows:[]};
 for(const change of planned.updates){
  await storage.put(routeStorageKey(change.fixtureId),change.record);
  routes[change.fixtureId]=change.record;
 }
 // 5USD might settle the same fixture while the Goaloo route is queued.
 // A full native Ledger V2 readback, not absence of a live card, is required
 // before installing a terminal DONE record.
 let nativeCompleted=0,checks=0;
 const pendingFixtures=new Set(ledger.rows.map(x=>String(x.fixtureId)));
 for(const [fixtureId,route] of Object.entries(routes)){
  if(checks>=3)break;
  if(route?.state!=='GOALOO'||pendingFixtures.has(fixtureId))continue;
  checks++;
  let receipt;
  try{receipt=await readSettledReceipt(engine,route.signalIds,{maxPages})}
  catch{continue}
  const done=closeAfterLedgerSettlement({fixtureId,route,
   ledgerRows:ledger.rows,verifiedReadback:receipt,now:at});
  if(done.ok){
   await storage.put(routeStorageKey(fixtureId),done.record);
   routes[fixtureId]=done.record;
   nativeCompleted++;
  }
 }
 const eligibleIds=planned.eligible.filter(x=>routes[x.fixtureId]?.state==='GOALOO')
  .map(x=>x.fixtureId);
 const allowed=new Set(eligibleIds);
 return{ok:true,state:'PENDING_OVER_10M_ROUTER',eligibleIds,
  selectedRows:ledger.rows.filter(x=>allowed.has(String(x.fixtureId))),
  pending:ledger.rows.length,eligible:eligibleIds.length,
  routedThisPoll:planned.updates.filter(x=>x.record.state==='GOALOO').length,
  completedByPrimary:nativeCompleted,hold:planned.holds.length,
  ledgerTotal:ledger.ledgerTotal,ledgerPages:ledger.pages,
  authoritative:ledger.authority==='LEDGER_V2_ONLY',
  thresholdMinutes:10,engineWrites:0};
}
export async function markGoalooRouteDone(storage,engine,{
 fixtureId,signalIds,at=new Date().toISOString(),maxPages=30
}={}){
 const route=await storage.get(routeStorageKey(fixtureId));
 if(route?.state==='DONE')return{ok:true,state:'DONE_ALREADY'};
 if(route?.state!=='GOALOO')return{ok:false,state:'GOALOO_ROUTE_NOT_ACTIVE'};
 const expected=[...(route.signalIds||[])].sort();
 const given=[...signalIds].sort();
 if(JSON.stringify(expected)!==JSON.stringify(given))
  return{ok:false,state:'SIGNAL_SET_CHANGED'};
 const ledger=await readPendingFromLedgerV2(engine,{maxPages});
 if(!ledger.ok)return{ok:false,state:ledger.state};
 const receipt=await readSettledReceipt(engine,signalIds,{maxPages});
 const done=closeAfterLedgerSettlement({fixtureId,route,
  ledgerRows:ledger.rows,verifiedReadback:receipt,now:at});
 if(!done.ok)return done;
 await storage.put(routeStorageKey(fixtureId),done.record);
 return{ok:true,state:'DONE_NEVER_POLL_GOALOO_AGAIN'};
}
