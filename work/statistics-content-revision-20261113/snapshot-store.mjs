// Independent Summary DO storage only. Never pass Engine/Ledger storage here.
// Immutable, content-addressed hour chunks; index pages and the active pointer
// are published only after the complete source-generation/count fence passes.
const P='b46:statistics:history:v1:',ACTIVE=P+'active',USAGE=P+'usage';
const check=(value,message)=>{if(!value)throw Error(message)};
const bytes=s=>new TextEncoder().encode(s).byteLength;
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export class SnapshotStore{
 constructor(storage,{clock=()=>Date.now(),ttlMs=120000,minBuildIntervalMs=10000,maxGenerations=12,maxBlobBytes=128*1024*1024,maxRows=100000}={}){
  this.storage=storage;this.clock=clock;this.ttlMs=ttlMs;this.minBuildIntervalMs=minBuildIntervalMs;this.maxGenerations=maxGenerations;this.maxBlobBytes=maxBlobBytes;this.maxRows=maxRows;this.pending=null;
 }
 async active(){const id=await this.storage.get(ACTIVE);return id?this.storage.get(P+'manifest:'+id):null;}
 async removePrefix(prefix){check(prefix.startsWith(P+'index:'),'CLEANUP_SCOPE');for(;;){const part=await this.storage.list({prefix,limit:128});if(!part.size)break;await this.storage.delete([...part.keys()]);}}
 async collect(){
  const active=await this.storage.get(ACTIVE),manifests=await this.storage.list({prefix:P+'manifest:',limit:this.maxGenerations+1});check(manifests.size<=this.maxGenerations,'MANIFEST_LIMIT');const live=new Set();let retained=0;
  for(const [key,m]of manifests){if(m.id!==active&&m.expiresAt<=this.clock()){await this.removePrefix(P+'index:'+m.id+':');await this.storage.delete(key);continue;}retained++;
   for(const block of m.index){const refs=await this.storage.get(P+'index:'+m.id+':'+block.part);check(Array.isArray(refs),'SNAPSHOT_INDEX_MISSING');for(const r of refs)live.add(r.hash);check(live.size<=100000,'CHUNK_REFERENCE_BUDGET');}
  }
  let start,blobBytes=0,blobs=0;
  for(;;){const entries=await this.storage.list({prefix:P+'blobmeta:',limit:128,...start?{start}: {}});if(!entries.size)break;for(const [key,m]of entries){const hash=key.slice((P+'blobmeta:').length);if(!live.has(hash))await this.storage.delete([key,P+'blob:'+hash]);else{blobBytes+=m.bytes;blobs++;}}start=[...entries.keys()].at(-1)+'\0';}
  await this.storage.put(USAGE,{blobBytes,blobs});return {retained,blobBytes,blobs};
 }
 async build(read,reduce){
  if(this.pending)return this.pending;
  const operation=this.buildUnlocked(read,reduce);this.pending=operation;
  try{return await operation}finally{if(this.pending===operation)this.pending=null;}
 }
 async buildUnlocked(read,reduce){
  const old=await this.active();if(old&&this.clock()-old.createdAt<this.minBuildIntervalMs)return old;
  const usage=await this.collect();check(usage.retained<this.maxGenerations,'SNAPSHOT_CAPACITY');
  const id=crypto.randomUUID(),index=[],known=new Set(),seen=new Set();let indexRefs=[],indexPart=0,chunk=[],chunkBytes=2,lastBucket=null,rows=0,newBytes=0,reusedChunks=0,newChunks=0,largestChunk=0;
  if(old)for(const block of old.index){const refs=await this.storage.get(P+'index:'+old.id+':'+block.part);for(const r of refs)known.add(r.hash);}
  const writeIndex=async()=>{if(!indexRefs.length)return;const first=indexRefs[0],last=indexRefs.at(-1);check(bytes(JSON.stringify(indexRefs))<96000,'INDEX_VALUE_BUDGET');await this.storage.put(P+'index:'+id+':'+indexPart,indexRefs,{noCache:true});index.push({part:indexPart++,start:first.start,end:last.start+last.count});indexRefs=[];};
  const flush=async()=>{if(!chunk.length)return;const text=JSON.stringify(chunk),size=bytes(text),hash=await digest(text);check(size<=96000,'CHUNK_VALUE_BUDGET');largestChunk=Math.max(largestChunk,size);
   if(known.has(hash))reusedChunks++;else{const prior=await this.storage.get(P+'blobmeta:'+hash);if(prior)reusedChunks++;else{check(usage.blobBytes+newBytes+size<=this.maxBlobBytes,'SNAPSHOT_DISK_BUDGET');await this.storage.put({[P+'blob:'+hash]:text,[P+'blobmeta:'+hash]:{bytes:size},[USAGE]:{blobBytes:usage.blobBytes+newBytes+size,blobs:usage.blobs+newChunks+1}},{noCache:true});newBytes+=size;newChunks++;}known.add(hash);}
   indexRefs.push({hash,start:rows-chunk.length,count:chunk.length});if(indexRefs.length===250)await writeIndex();chunk=[];chunkBytes=2;
  };
  try{
   const reduced=await reduce(read,{onPage:async(page,metadata)=>{
    for(const row of page){check(row.id&&!seen.has(String(row.id)),'DUPLICATE_SNAPSHOT_ID');seen.add(String(row.id));check(seen.size<=this.maxRows,'SNAPSHOT_ROW_BUDGET');
     const bucket=String(Math.floor(Number(row.createdAt)/3600000)),size=bytes(JSON.stringify(row))+1;check(size<95000,'ROW_VALUE_BUDGET');
     if(chunk.length&&(bucket!==lastBucket||chunk.length>=100||chunkBytes+size>96000))await flush();
     lastBucket=bucket;chunk.push(row);chunkBytes+=size;rows++;
    }
   }});
   await flush();await writeIndex();check(rows===reduced.data.ledgerTotal,'SNAPSHOT_ROW_COUNT');
   const manifest={id,createdAt:this.clock(),expiresAt:this.clock()+this.ttlMs,revision:reduced.data.contentRevision,signature:reduced.signature,sourceAsOf:reduced.data.asOf,rowCount:rows,index,summary:reduced.data,metadata:reduced.metadata,proof:{...reduced.proof,newBytes,newChunks,reusedChunks,largestChunk}};
   check(bytes(JSON.stringify(manifest))<96000,'MANIFEST_VALUE_BUDGET');
   await this.storage.transaction(async txn=>{await txn.put(P+'manifest:'+id,manifest);await txn.put(ACTIVE,id);});return manifest;
  }catch(error){await this.removePrefix(P+'index:'+id+':');throw error;}
 }
 async page(cursor,limit=2000){
  check(Number.isSafeInteger(limit)&&limit>=1&&limit<=2000,'INVALID_PAGE_LIMIT');const parsed=/^snap1:([a-f0-9-]{36}):(\d+)$/.exec(cursor);check(parsed,'INVALID_SNAPSHOT_CURSOR');
  const id=parsed[1],offset=Number(parsed[2]),m=await this.storage.get(P+'manifest:'+id);if(!m||m.expiresAt<=this.clock()){const e=Error('STATISTICS_SNAPSHOT_EXPIRED');e.status=410;throw e;}
  check(Number.isSafeInteger(offset)&&offset>=0&&offset<=m.rowCount,'INVALID_SNAPSHOT_OFFSET');let end=Math.min(m.rowCount,offset+limit);const rows=[];let payloadBytes=2;
  const wanted=[];
  for(const block of m.index){if(block.end<=offset||block.start>=end)continue;const refs=await this.storage.get(P+'index:'+id+':'+block.part);check(Array.isArray(refs),'SNAPSHOT_INDEX_MISSING');for(const r of refs)if(r.start+r.count>offset&&r.start<end)wanted.push(r);}
  // At most 32 bounded chunks in a native multi-get, never the complete Ledger.
  batches:for(let i=0;i<wanted.length;i+=32){const refs=wanted.slice(i,i+32),values=await this.storage.get(refs.map(r=>P+'blob:'+r.hash),{noCache:true});for(const r of refs){const text=values.get(P+'blob:'+r.hash);check(typeof text==='string','SNAPSHOT_BLOB_MISSING');const size=bytes(text);if(rows.length&&payloadBytes+size>6*1024*1024){end=offset+rows.length;break batches}payloadBytes+=size;const part=JSON.parse(text);check(part.length===r.count,'SNAPSHOT_CHUNK_COUNT');rows.push(...part.slice(Math.max(0,offset-r.start),Math.min(part.length,end-r.start)));}}
  check(rows.length===end-offset,'INCOMPLETE_SNAPSHOT_PAGE');
  return {...m.metadata,ok:true,rows,returned:rows.length,ledgerTotal:m.rowCount,total:m.summary.total,statisticsGeneration:String(m.revision),statisticsContentRevision:m.revision,statisticsSnapshotId:m.id,statisticsSnapshotAsOf:m.sourceAsOf,ledgerUpdatedAt:m.sourceAsOf,statisticsPagination:'IMMUTABLE_HISTORY_SNAPSHOT_V1',nextCursor:end<m.rowCount?'snap1:'+m.id+':'+end:null,hasMore:end<m.rowCount,stale:this.clock()-m.sourceAsOf>90000};
 }
 firstCursor(m){return 'snap1:'+m.id+':0';}
}
