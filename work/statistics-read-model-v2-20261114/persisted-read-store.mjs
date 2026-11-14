// STAGING ONLY. Durable derived rows/indexes, immutable by content revision.
// Never bind to Engine's storage; never call providers, Cron or Production endpoints.
import {createReadModel,familyOf,selectionOf,dateMs,isSettled} from './read-model.mjs';
const P='b46:stat:read-v2:',ACTIVE=P+'active';
const guard=(ok,msg)=>{if(!ok)throw Error(msg)};
const groupKey=(market,variant,filter)=>JSON.stringify([market,variant,filter]);
const storageKey=(rev,kind,group='',page=null)=>P+rev+':'+kind+':'+encodeURIComponent(group)+(page===null?'':':'+page);
export const projectLedgerRow=r=>Object.fromEntries(['id','fixtureId','home','away','league','market','marketLabel','providerMarket','period','selection','pick','line','selectionLine','odds','bookmaker','selectedBookmaker','referee','createdAt','settledAt','status','displayStatus','mirrorStatus','mirrorUpdatedAt','result','settlement','outcome','settlementSource','entryMinute','signalEntryMinute','entryScore','entryCorners','entryCards','finalScore','finalCorners','finalCards','mirrorMinute','mirrorScore','scoreAt','minute'].filter(k=>r?.[k]!==undefined).map(k=>[k,r[k]]));
function groupsFor(rows,registry){
 const seen=new Set(['all','1x2','ah','ou','btts','corners','cards','other'].map(m=>groupKey(m,'all','all')));
 for(const row of rows){
  const m=familyOf(row,registry),v=registry?.resolve?.(row)?.key||'other',f=selectionOf(row);
  for(const key of [groupKey(m,'all','all'),groupKey(m,v,'all'),groupKey(m,'all',f),groupKey(m,v,f)])seen.add(key);
 }
 guard(seen.size<=10000,'TOO_MANY_VIEW_KEYS');return [...seen];
}
export class PersistedReadStore{
 constructor(storage,{clock=()=>Date.now(),maxAgeMs=120000}={}){this.storage=storage;this.building=null;this.clock=clock;this.maxAgeMs=maxAgeMs;this.queue=Promise.resolve();}
 async put(key,value){guard(new TextEncoder().encode(JSON.stringify(value)).length<=128*1024,'DERIVED_VALUE_TOO_LARGE');return this.storage.put(key,value)}
 async active(){
  const ptr=await this.storage.get(ACTIVE);
  if(!ptr)return null;
  const manifest=await this.storage.get(ptr);
  guard(manifest&&manifest.generationKey===ptr,'ACTIVE_MANIFEST_MISSING');
  return manifest;
 }
 async publish(rows,{contentRevision,asOf,registry,formulas,sourceFingerprint}={}){
  // Serialize distinct revisions; a later revision must never receive an earlier build.
  const input=structuredClone(rows.map(projectLedgerRow)),opts={contentRevision,asOf,registry,formulas,sourceFingerprint};
  const work=this.queue.catch(()=>{}).then(()=>this.publishUnlocked(input,opts));
  this.queue=work;this.building=work;
  try{return await work}finally{if(this.building===work)this.building=null}
 }
 async publishUnlocked(rows,{contentRevision,asOf,registry,formulas,sourceFingerprint}){
  guard(Number.isSafeInteger(contentRevision)&&contentRevision>=0,'INVALID_SOURCE_REVISION');
  guard(Array.isArray(rows)&&rows.length<=100000,'SOURCE_ROW_BUDGET');
  const previous=await this.active();
  guard(!previous||contentRevision>previous.contentRevision,'NON_MONOTONIC_REVISION');
  const model=createReadModel(rows,{contentRevision,asOf,registry,now:asOf});
  const names=groupsFor(rows,registry);let transferred=0,pageCount=0;const groupCounts={};
  const prefix=P+contentRevision+':';
  // No active pointer is written until *all* pages and view metrics are complete.
  // Stale abandoned revisions remain unreachable; GC is a separate safe operation.
  for(const name of names){
   const [market,variant,filter]=JSON.parse(name);
   const q={market,variant,filter,page:1,limit:50,rangeDays:'all'};
   const initial=model.query(q);groupCounts[name]=initial.totalRows;
   const trendRows=[];let running=0;const view={
    contentRevision,totalRows:initial.totalRows,metrics:initial.metrics,
    charts:{},performance:{},
    pages:initial.pages,market,variant,filter
   };
   for(const rangeDays of ['all',7,30,90]){
    const v=model.query({...q,rangeDays}),p=v.performance;
    view.charts[String(rangeDays)]=v.chart;
    const meta={...p,roiPoints:[],ratePoints:[],chunks:{}};
    for(const metric of ['roiPoints','ratePoints']){
     const chunks=Math.ceil(p[metric].length/250);meta.chunks[metric]=chunks;
     for(let i=0;i<chunks;i++)await this.put(storageKey(contentRevision,'performance',name+':'+rangeDays+':'+metric,i),p[metric].slice(i*250,(i+1)*250));
    }
    view.performance[String(rangeDays)]=meta;
   }
   await this.put(storageKey(contentRevision,'view',name),view);
   for(let page=1;page<=initial.pages;page++){
    const pageData=page===1?initial:model.query({...q,page});
    const projected=pageData.rows.map(projectLedgerRow);for(const row of projected)trendRows.push({result:row.result,status:row.status});
    guard(projected.length<=50,'PAGE_TOO_LARGE');
    const encoded=JSON.stringify(projected);guard(new TextEncoder().encode(encoded).length<=128*1024,'PAGE_STORAGE_LIMIT');
    transferred+=encoded.length;
    await this.put(storageKey(contentRevision,'page',name,page),projected);
    pageCount++;
   }
   // Original Statistics graph is outcome units (+1,+0.5,-1,-0.5,0), not bookmaker-price P/L.
   // Precompute outside page requests; sample only display coordinates, never total metrics.
   const weights={WIN:1,HALF_WIN:0.5,LOSS:-1,HALF_LOSS:-0.5,PUSH:0};
   const curve=[];const chronological=trendRows.reverse().filter(r=>r.status==='SETTLED');
   const stride=Math.max(1,Math.ceil(chronological.length/384));let y=0;
   for(let i=0;i<chronological.length;i++){y+=weights[chronological[i].result]??0;if(i%stride===0||i===chronological.length-1)curve.push({index:i,y});}
   view.curve=curve;view.curveFinal=y;
   await this.put(storageKey(contentRevision,'view',name),view);
  }
  const recentSettled=rows.filter(isSettled).sort((a,b)=>dateMs(b.settledAt??b.createdAt)-dateMs(a.settledAt??a.createdAt)).slice(0,4).map(projectLedgerRow);
  let summary={...model.summary,groupCounts,recentSettled};
  if(formulas?.aggregate){const daily=formulas.aggregate(rows);guard(daily&&daily.today&&daily.yesterday,'INVALID_DAILY_FORMULA');summary={...summary,daily};}
  const manifest={generationKey:prefix+'manifest',contentRevision,asOf,sourceFingerprint,sourceRows:rows.length,views:names.length,pages:pageCount,storedProjectedBytes:transferred,summary,createdAt:Date.now()};
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
  const observed=await this.storage.get(P+'observed');
  const verifiedAt=observed?.revision===m.contentRevision?observed.at:dateMs(m.asOf);
  const ageMs=Math.max(0,this.clock()-verifiedAt);
  return{...m.summary,ok:true,contentRevision:m.contentRevision,asOf:m.asOf,verifiedAt,ageMs,stale:!!observed?.sourceError||ageMs>this.maxAgeMs};
 }
 async view({market='all',variant='all',filter='all',page=1,limit=50,rangeDays='all',metric='units',revision}={}){
  const m=await this.active();if(!m)return{status:503,error:'SUMMARY_NOT_READY'};
  const r=Number(revision);
  if(!Number.isSafeInteger(r)||r!==m.contentRevision)return{status:409,error:'REVISION_CHANGED',currentRevision:m.contentRevision};
  if(!Number.isSafeInteger(page)||page<1||limit!==50||!['all',7,30,90].includes(rangeDays)||!['units','roi','rate'].includes(metric))return{status:400,error:'INVALID_VIEW_REQUEST'};
  const group=groupKey(market,variant,filter),meta=await this.storage.get(storageKey(r,'view',group));
  if(!meta)return{status:400,error:'INVALID_MARKET_VARIANT_FILTER'};
  if(!meta.performance?.[String(rangeDays)])return{status:503,error:'READ_MODEL_REBUILD_REQUIRED'};
  if(page>meta.pages)return{status:400,error:'PAGE_OUT_OF_RANGE'};
  const rows=await this.storage.get(storageKey(r,'page',group,page));
  guard(Array.isArray(rows)&&rows.length<=50,'PERSISTED_PAGE_MISSING');
  const performance=structuredClone(meta.performance[String(rangeDays)]);
  if(metric!=='units'){
   const field=metric==='roi'?'roiPoints':'ratePoints',points=[];
   for(let i=0;i<performance.chunks[field];i++){
    const chunk=await this.storage.get(storageKey(r,'performance',group+':'+rangeDays+':'+field,i));guard(Array.isArray(chunk),'PERFORMANCE_CHUNK_MISSING');points.push(...chunk);
   }
   performance[field]=points;
  }
  const observed=await this.storage.get(P+'observed');
  const verifiedAt=observed?.revision===m.contentRevision?observed.at:dateMs(m.asOf);
  const ageMs=Math.max(0,this.clock()-verifiedAt);
  return{ok:true,status:200,performance,metric,verifiedAt,ageMs,stale:!!observed?.sourceError||ageMs>this.maxAgeMs,contentRevision:r,asOf:m.asOf,market,variant,filter,page,pageSize:50,totalRows:meta.totalRows,pages:meta.pages,metrics:meta.metrics,chart:meta.charts[String(rangeDays)],curve:meta.curve,curveFinal:meta.curveFinal,rangeDays,rows};
 }
}
