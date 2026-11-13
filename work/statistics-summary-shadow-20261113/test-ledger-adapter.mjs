import {ShadowSummary} from './summary.mjs';
// TEST STORAGE ONLY. No route/binding imports. This adapter is never installed
// on Production; its atomicity is exercised with the actual recorded writer.
export async function ledgerTestAdapter(storage,epoch,source,{mode}={}) {
 if(mode!=='ISOLATED_TEST_STORAGE')throw Error('TEST_STORAGE_REQUIRED');
 const p='b46:statistics:shadow:v1:'+epoch+':';
 if(!await storage.get(p+'manifest'))await new ShadowSummary(storage,epoch).initialize(source);
 const relevant=row=>row===null?null:JSON.stringify([row.id,row.market,row.createdAt,row.settledAt,row.status,row.result,row.odds]);
 function facade(tx) {
  async function project(key,row) {
   if(!key.startsWith('stat:v2:row:'))return;
   const old=await tx.get(key),id=row?.id??old?.id;
   if(!id)return;
   if(old?.id&&row?.id&&old.id!==row.id)throw Error('LEDGER_ID_CHANGED');
   const index=p+'source/'+encodeURIComponent(String(id)),seen=await tx.get(index),signature=relevant(row);
   if(seen&&seen.key!==key)throw Error('SOURCE_KEY_CHANGED_REBUILD');
   if(seen?.signature===signature)return;
   const revision=(await tx.get(p+'source-clock')||0)+1;
   if(!Number.isSafeInteger(revision))throw Error('SOURCE_SEQUENCE_EXHAUSTED');
   const shadow=new ShadowSummary({transaction:fn=>fn(tx)},epoch);
   await shadow.apply({id:String(id),revision,row});
   await tx.put({[p+'source-clock']:revision,[index]:{key,signature}});
  }
  return {
   get:tx.get.bind(tx),
   list:tx.list?.bind(tx),
   put:async(key,value)=>{
    const entries=typeof key==='string'?[[key,value]]:Object.entries(key);
    for(const [k,v] of entries)await project(k,v);
    await tx.put(key,value);
   },
   delete:async key=>{
    for(const k of Array.isArray(key)?key:[key])await project(k,null);
    return tx.delete(key);
   }
  };
 }
 return {
  get:storage.get.bind(storage),list:storage.list?.bind(storage),
  put:(k,v)=>storage.transaction(tx=>facade(tx).put(k,v)),
  delete:k=>storage.transaction(tx=>facade(tx).delete(k)),
  transaction:fn=>storage.transaction(tx=>fn(facade(tx)))
 };
}
