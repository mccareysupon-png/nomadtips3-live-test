// STAGING PROTOTYPE ONLY. Changes storage inside the statistics writer, never detection logic.
// Do not deploy: transaction failure blocks legacy write; must validate isolation and live storage first.
// Outbox records correction separately; consumer must acknowledge and seed using the same sequence.
export async function persistStatisticsChunk(storage,writes,existing){
 const keys=Object.keys(writes);
 if(!keys.length)return 0;
 return storage.transaction(async tx=>{
  let seq=await tx.get('shadow:v1:sequence')??0;
  if(!Number.isSafeInteger(seq)||seq<0)throw Error('SHADOW_SEQUENCE_INVALID');
  let added=0;
  for(const key of keys){
   const row=writes[key],old=existing.get(key);
   if(row?.status!=='SETTLED')continue;
   const previous=old?.status==='SETTLED'?old:null;
   if(previous&&previous.result===row.result&&previous.odds===row.odds&&previous.market===row.market&&previous.createdAt===row.createdAt&&previous.settledAt===row.settledAt)continue;
   if(!row.id||!['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(row.result))throw Error('SHADOW_INVALID_SETTLEMENT');
   const ts=Number(row.settledAt);
   if(!Number.isFinite(ts)||ts<=0)throw Error('SHADOW_SETTLED_AT_INVALID');
   if(!Number.isSafeInteger(seq+1))throw Error('SHADOW_SEQUENCE_OVERFLOW');
   seq++;
   const brief=r=>r?{id:String(r.id),status:r.status,result:r.result,odds:r.odds??null,market:r.market??null,createdAt:r.createdAt??null,settledAt:r.settledAt??null}:null;
   await tx.put('shadow:v1:outbox:'+String(seq).padStart(16,'0'),{signal_id:String(row.id),settled_seq:seq,settled_at:new Date(ts).toISOString(),result:row.result,oldRow:brief(previous),newRow:brief(row),correction:!!previous});
   added++;
  }
  for(const key of keys)await tx.put(key,writes[key]);
  if(added)await tx.put('shadow:v1:sequence',seq);
  return added;
 });
}

export function patchStatisticsWriter(source){
 const start='async __b46UpsertLedgerUnlocked(sourceRows, fixtureMap = null) {';
 const end='async syncStatisticsLedger(finalFixture = null) {';
 const anchor='if (Object.keys(writes).length) await this.ctx.storage.put(writes);';
 if(source.split(start).length!==2||source.split(end).length!==2)throw Error('CANONICAL_METHOD_DRIFT');
 const a=source.indexOf(start),b=source.indexOf(end,a);
 if(b<=a)throw Error('CANONICAL_BOUNDARY_DRIFT');
 const method=source.slice(a,b);
 if(method.split(anchor).length!==2)throw Error('CANONICAL_WRITE_ANCHOR_DRIFT');
 const insertion='if (Object.keys(writes).length) {\n const persistStatisticsChunk = '+persistStatisticsChunk.toString()+';\n await persistStatisticsChunk(this.ctx.storage,writes,existing);\n }';
 return source.slice(0,a)+method.replace(anchor,insertion)+source.slice(b);
}
