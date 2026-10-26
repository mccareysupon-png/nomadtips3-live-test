import {prepareCachedSnapshot} from './cached-snapshot.mjs';

/**
 * READ-ONLY snapshot extraction from the already deployed HistoryGate Durable Object
 * storage. DO NOT invoke HistoryGate.read (that would call 5USD on a cache miss).
 * Key contract from history-store.mjs: 'team:'+teamId+':'+cutoff.
 * Storage access must run *inside* the history Durable Object, not the public Worker.
 */
export async function prepareFromHistoryGateStorage({storage,board,revision,now=Date.now()}){
 if(!storage||typeof storage.get!=='function')throw Error('HISTORY_STORAGE_UNAVAILABLE');
 if(!board||board.ok!==true||board.stale===true||!Array.isArray(board.fixtures))throw Error('BOARD_UNAVAILABLE');
 const keys=new Set();
 for(const fixture of board.fixtures){
  const cutoff=Date.parse(fixture.kickoffUtc||'');
  if(!Number.isFinite(cutoff))continue;
  for(const side of ['home','away']){
   const id=String(fixture[side]?.id??'');
   if(/^\d{1,18}$/.test(id))keys.add('team:'+id+':'+cutoff);
  }
 }
 // Bounded batch: never read all storage or issue provider calls.
 if(keys.size>500)throw Error('HISTORY_SNAPSHOT_BUDGET_EXCEEDED');
 const entries=[];
 for(const key of keys){
  const entry=await storage.get(key);
  if(entry&&entry.expires>now)entries.push(entry);
 }
 return {...prepareCachedSnapshot({board,revision,entries,now}),storageReads:keys.size,providerRequests:0};
}
