// STAGING ONLY. Durable derived rows/indexes, immutable by content revision.
// Never bind to Engine's storage; never call providers, Cron or Production endpoints.
import {createReadModel,familyOf,selectionOf,dateMs} from './read-model.mjs';
const P='b46:stat:read-v2:',ACTIVE=P+'active';
const guard=(ok,msg)=>{if(!ok)throw Error(msg)};
const groupKey=(market,variant,filter)=>JSON.stringify([market,variant,filter]);
const storageKey=(rev,kind,group='',page=null)=>P+rev+':'+kind+':'+encodeURIComponent(group)+(page===null?'':':'+page);
const projection=r=>Object.fromEntries(['id','fixtureId','home','away','league','market','marketLabel','providerMarket','period','selection','line','selectionLine','odds','bookmaker','createdAt','settledAt','status','result','entryScore','finalScore','finalCorners','finalCards'].filter(k=>r?.[k]!==undefined).map(k=>[k,r[k]]));
function groupsFor(rows,registry){
 const seen=new Set(['all','1x2','ah','ou','btts','corners','cards','other'].map(m=>groupKey(m,'all','all')));
 for(const row of rows){
  const m=familyOf(row,registry),v=registry?.resolve?.(row)?.key||'other',f=selectionOf(row);
  for(const key of [groupKey(m,'all','all'),groupKey(m,v,'all'),groupKey(m,'all',f),groupKey(m,v,f)])seen.add(key);
 }
 guard(seen.size<=10000,'TOO_MANY_VIEW_KEYS');return [...seen];
}
export class PersistedReadStore{
 constructor(storage){this.storage=storage;this.building=null;}
 async active(){
  const ptr=await this.storage.get(ACTIVE);
  if(!ptr)return null;
  const manifest=await this.storage.get(ptr);
  guard(manifest&&manifest.generationKey===ptr,'ACTIVE_MANIFEST_MISSING');
  return manifest;
 }
 async publish(rows,{contentRevision,asOf,registry,formulas}={}){
  if(this.building)return this.building;
  const work=this.publishUnlocked(rows,{contentRevision,asOf,registry,formulas});this.building=work;
  try{return await work}finally{if(this.building===work)this.building=null}
 }
 async publishUnlocked(rows,{contentRevision,asOf,registry,formulas}){
  guard(Number.isSafeInteger(contentRevision)&&contentRevision>=0,'INVALID_SOURCE_REVISION');
  guard(Array.isArray(rows)&&rows.length<=100000,'SOURCE_ROW_BUDGET');
  const previous=await this.active();
  guard(!previous||contentRevision>previous.contentRevision,'NON_MONOTONIC_REVISION');
  const model=createReadModel(rows,{contentRevision,asOf,registry,now:asOf});
  const names=groupsFor(rows,registry);let transferred=0,pageCount=0;
  const prefix=P+contentRevision+':';
  // No active pointer is written until *all* pages and view metrics are complete.
  // Stale abandoned revisions remain unreachable; GC is a separate safe operation.
  for(const name of names){
   const [market,variant,filter]=JSON.parse(name);
   const q={market,variant,filter,page:1,limit:50,rangeDays:'all'};
   const initial=model.query(q),view={
    contentRevision,totalRows:initial.totalRows,metrics:initial.metrics,
    charts:{all:initial.chart,30:model.query({...q,rangeDays:30}).chart,90:model.query({...q,rangeDays:90}).chart},
    pages:initial.pages,market,variant,filter
   };
   await this.storage.put(storageKey(contentRevision,'view',name),view);
   for(let page=1;page<=initial.pages;page++){
    const pageData=page===1?initial:model.query({...q,page});
    const projected=pageData.rows.map(projection);
    guard(projected.length<=50,'PAGE_TOO_LARGE');
    const encoded=JSON.stringify(projected);guard(encoded.length<1900000,'PAGE_STORAGE_LIMIT');
    transferred+=encoded.length;
    await this.storage.put(storageKey(contentRevision,'page',name,page),projected);
    pageCount++;
   }
  }
  let summary={...model.summary};
  if(formulas?.aggregate){const daily=formulas.aggregate(rows);guard(daily&&daily.today&&daily.yesterday,'INVALID_DAILY_FORMULA');summary={...summary,daily};}
  const manifest={generationKey:prefix+'manifest',contentRevision,asOf,sourceRows:rows.length,views:names.length,pages:pageCount,storedProjectedBytes:transferred,summary,createdAt:Date.now()};
  // Only one active revision can be published; transaction also protects
  // against a concurrent higher-revision writer in another instance.
  await this.storage.transaction(async txn=>{
   const activeKey=await txn.get(ACTIVE);
   if(activeKey){const active=await txn.get(activeKey);guard(!active||contentRevision>active.contentRevision,'CONCURRENT_NEWER_REVISION');}
   await txn.put(manifest.generationKey,manifest);
   await txn.put(ACTIVE,manifest.generationKey);
  });
  return manifest;
 }
 async summary(){
  const m=await this.active();
  if(!m)return{ok:false,error:'SUMMARY_NOT_READY'};
  return{...m.summary,ok:true,contentRevision:m.contentRevision,asOf:m.asOf,stale:false};
 }
 async view({market='all',variant='all',filter='all',page=1,limit=50,rangeDays='all',revision}={}){
  const m=await this.active();if(!m)return{status:503,error:'SUMMARY_NOT_READY'};
  const r=Number(revision);
  if(!Number.isSafeInteger(r)||r!==m.contentRevision)return{status:409,error:'REVISION_CHANGED',currentRevision:m.contentRevision};
  if(!Number.isSafeInteger(page)||page<1||limit!==50||!['all',30,90].includes(rangeDays))return{status:400,error:'INVALID_VIEW_REQUEST'};
  const group=groupKey(market,variant,filter),meta=await this.storage.get(storageKey(r,'view',group));
  if(!meta)return{status:400,error:'INVALID_MARKET_VARIANT_FILTER'};
  if(page>meta.pages)return{status:400,error:'PAGE_OUT_OF_RANGE'};
  const rows=await this.storage.get(storageKey(r,'page',group,page));
  guard(Array.isArray(rows)&&rows.length<=50,'PERSISTED_PAGE_MISSING');
  return{ok:true,status:200,contentRevision:r,asOf:m.asOf,market,variant,filter,page,pageSize:50,totalRows:meta.totalRows,pages:meta.pages,metrics:meta.metrics,chart:meta.charts[String(rangeDays)],rangeDays,rows};
 }
}
