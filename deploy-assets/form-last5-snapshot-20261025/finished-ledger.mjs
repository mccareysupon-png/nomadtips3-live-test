import {verifiedFt,buildLast5Snapshot} from './snapshot-core.mjs';

// Persistent FT-history logic only. The caller owns a durable storage adapter.
// Consume existing scheduled/bulk response; never fetch the provider here.
export function mergeFinishedHistory(existing, feed, {maxRecords=100000}={}) {
 if(!Array.isArray(existing)||!Array.isArray(feed))throw Error('INVALID_FT_FEED');
 const byId=new Map();
 for(const raw of [...existing,...feed]){
  const row=verifiedFt(raw);
  if(!row)continue;
  const prior=byId.get(row.fixtureId);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw Error('CONFLICTING_FINAL_RESULT_'+row.fixtureId);
  byId.set(row.fixtureId,row);
 }
 // Do not silently truncate a team history: fail closed until durable retention policy is established.
 if(byId.size>maxRecords)throw Error('FT_RETENTION_LIMIT');
 return [...byId.values()].sort((a,b)=>Date.parse(a.kickoffUtc)-Date.parse(b.kickoffUtc));
}
export function buildFromFinishedLedger({board,history,revision,now=Date.now()}){
 if(!board||board.ok!==true||board.stale===true||!Array.isArray(board.fixtures))throw Error('BOARD_UNAVAILABLE');
 if(typeof revision!=='string'||!revision)throw Error('MISSING_BOARD_REVISION');
 const snapshot=buildLast5Snapshot(board.fixtures,history,new Date(now).toISOString());
 const total=Object.keys(snapshot.fixtures).length;
 const full=Object.values(snapshot.fixtures).filter(x=>x.home.count===5&&x.away.count===5).length;
 return {revision,snapshot,quality:{total,full,coverage:total?full/total:0},providerRequests:0};
}
