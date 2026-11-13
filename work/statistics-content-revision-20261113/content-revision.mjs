// TEST candidate utility. Used only by the three audited Ledger writer paths.
// A short transaction commits rows, counters and revision together. Timestamp
// changes remain stored but are not statistical content changes.
export const B46_STATS_REVISION_KEY='b46:statistics:content-revision:v1';
const B46_STATS_META_KEY='stat:v2:meta',B46_STATS_ROW_PREFIX='stat:v2:row:';
const B46_STATS_COUNTERS=['ledgerTotal','settledTotal','pending','unresolved','win','loss','push','halfWin','halfLoss'];
function b46StatsCanonical(value){
 if(Array.isArray(value))return value.map(b46StatsCanonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,b46StatsCanonical(value[k])]));
 return value;
}
function b46StatsContent(key,value){
 if(key===B46_STATS_META_KEY){const m=value||{};return JSON.stringify(b46StatsCanonical({...Object.fromEntries(B46_STATS_COUNTERS.map(k=>[k,Number(m[k]||0)])),byMarket:m.byMarket||{}}));}
 return JSON.stringify(b46StatsCanonical(value));
}
export async function b46StatsTransaction(storage,operation){
 return storage.transaction(async raw=>{
  const originals=new Map();
  async function remember(key){if((key===B46_STATS_META_KEY||key.startsWith(B46_STATS_ROW_PREFIX))&&!originals.has(key))originals.set(key,await raw.get(key));}
  const txn=new Proxy(raw,{get(target,key){
   if(key==='put')return async(k,v)=>{const entries=typeof k==='string'?[[k,v]]:Object.entries(k);for(const [name]of entries){if(name===B46_STATS_REVISION_KEY)throw Error('REVISION_KEY_RESERVED');await remember(name);}return raw.put(k,v);};
   if(key==='delete')return async k=>{for(const name of Array.isArray(k)?k:[k]){if(name===B46_STATS_REVISION_KEY)throw Error('REVISION_KEY_RESERVED');await remember(name);}return raw.delete(k);};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const result=await operation(txn);let changed=false;
  for(const [key,value]of originals)if(b46StatsContent(key,value)!==b46StatsContent(key,await raw.get(key))){changed=true;break;}
  if(changed){const old=Number(await raw.get(B46_STATS_REVISION_KEY)||0);if(!Number.isSafeInteger(old)||old<0||old===Number.MAX_SAFE_INTEGER)throw Error('CONTENT_REVISION_EXHAUSTED');await raw.put(B46_STATS_REVISION_KEY,old+1);}
  return result;
 });
}
export async function b46StatsReadMetadata(storage,normalize){
 return storage.transaction(async txn=>{
  const meta=normalize(await txn.get(B46_STATS_META_KEY)),revision=Number(await txn.get(B46_STATS_REVISION_KEY)||0);
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('INVALID_CONTENT_REVISION');
  return {...meta,contentRevision:revision};
 });
}
