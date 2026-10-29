/*
 * Pure Snapshot V1 application service. Test/sidecar ONLY.
 * Reads the public engine Statistics ledger via an injected source; does not call 5USD.
 * No Production Worker, Engine, settlement or member dependencies.
 */
import {buildDailySnapshot,createDailyAccumulator,validateSummary,londonSportDay,SNAPSHOT_SCHEMA} from './snapshot.mjs';

export const SNAPSHOT_KEY='ball46:performance:v1:latest';
export const STALE_AFTER_MS=6*60*1000;
export const REFRESH_INTERVAL_MS=5*60*1000;
const sides=['today','yesterday'];
const metrics=['win','loss','push','pending','totalPicks','winRate','avgOdds'];

function integer(n){return Number.isSafeInteger(n)&&n>=0}
function parseEpoch(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>0?n:null;
}
export function slimSnapshot(s){
  validateSummary(s);
  const output={
    schema:SNAPSHOT_SCHEMA,
    asOfUtc:s.asOfUtc,
    londonDay:s.londonDay,
    ledger:{rowCount:s.ledger.rowCount,revision:s.ledger.revision},
  };
  for(const side of sides)output[side]=Object.fromEntries(metrics.map(k=>[k,s[side][k]]));
  return output;
}
export function validateStoredRecord(record){
  if(!record||record.schema!==SNAPSHOT_SCHEMA||!integer(record.generatedAtMs)
    ||!integer(record.source?.ledgerTotal)||!parseEpoch(record.source?.ledgerUpdatedAt)
    ||record?.snapshot?.schema!==SNAPSHOT_SCHEMA
    ||!integer(record.snapshot.ledger?.rowCount)
    ||record.snapshot.ledger.rowCount!==record.source.ledgerTotal)
    throw Error('INVALID_SNAPSHOT_STORE_RECORD');
  for(const side of sides){
    const b=record.snapshot[side];
    if(!b||!['win','loss','push','pending','totalPicks'].every(k=>integer(b[k]))
      ||typeof b.winRate!=='string'||typeof b.avgOdds!=='string'
      ||b.totalPicks!==b.win+b.loss+b.push+b.pending)
      throw Error('SNAPSHOT_METRIC_INVALID_'+side);
  }
  if(record.snapshot.yesterday.pending!==0)throw Error('SNAPSHOT_YESTERDAY_PENDING_INVALID');
  if(record.snapshot.londonDay?.timezone!=='Europe/London'
    ||record.snapshot.londonDay.cutHour!==6)throw Error('SNAPSHOT_DAY_RULE_MISMATCH');
  return true;
}
export function isEligible(record,nowMs,{maxAgeMs=STALE_AFTER_MS}={}){
  try{validateStoredRecord(record)}catch{return false}
  const age=nowMs-record.generatedAtMs;
  if(age<0||age>maxAgeMs)return false;
  const today=londonSportDay(nowMs);
  return record.snapshot.londonDay.today===today;
}
export function needsRefresh(record,head,nowMs){
  if(!isEligible(record,nowMs,{maxAgeMs:REFRESH_INTERVAL_MS}))return true;
  if(!head?.ok||!integer(Number(head.ledgerTotal))||!parseEpoch(head.ledgerUpdatedAt))return true;
  return Number(head.ledgerUpdatedAt)!==record.source.ledgerUpdatedAt
    ||Number(head.ledgerTotal)!==record.source.ledgerTotal;
}
export function makeRecord(full,nowMs){
  if(!full?.ok||!Array.isArray(full.rows)||!integer(Number(full.ledgerTotal)))
    throw Error('LEDGER_SHAPE_INVALID');
  if(full.rows.length!==Number(full.ledgerTotal))throw Error('LEDGER_INCOMPLETE_ABORT');
  const updated=parseEpoch(full.ledgerUpdatedAt);
  if(!updated)throw Error('LEDGER_UPDATED_AT_MISSING');
  const calculated=buildDailySnapshot(full.rows,{
    asOfMs:nowMs,
    ledgerRevision:full.settlementRevision??null
  });
  const record={
    schema:SNAPSHOT_SCHEMA,
    generatedAtMs:nowMs,
    source:{
      ledgerTotal:Number(full.ledgerTotal),
      ledgerUpdatedAt:updated,
      settlementRevision:String(full.settlementRevision??'unknown')
    },
    snapshot:slimSnapshot(calculated)
  };
  validateStoredRecord(record);
  return record;
}
/**
 * Single-writer scheduled refresh. Read-source full payload is never persisted,
 * only compact daily aggregates. D1 conditional UPSERT prevents older timestamps overwriting.
 */
export async function refreshSnapshot({store,source,nowMs=Date.now()}){
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)throw Error('CLOCK_INVALID');
  if(typeof source?.head!=='function'||typeof source?.pages!=='function')throw Error('STREAMING_SOURCE_REQUIRED');
  const current=await store.read(SNAPSHOT_KEY);
  const head=await source.head();
  if(!head?.ok)throw Error('SOURCE_HEAD_UNAVAILABLE');
  if(!needsRefresh(current,head,nowMs))return {state:'UNCHANGED',generatedAtMs:current.generatedAtMs};
  const acc=createDailyAccumulator({asOfMs:nowMs});
  let pageCount=0;
  for await(const page of source.pages(head)){
    if(!Array.isArray(page?.rows))throw Error('PAGED_LEDGER_BAD_SHAPE');
    acc.append(page.rows);
    pageCount++;
    if(pageCount>200)throw Error('LEDGER_PAGE_LIMIT');
  }
  const ledgerTotal=Number(head.ledgerTotal);
  const latestUpdate=parseEpoch(head.ledgerUpdatedAt);
  if(!integer(ledgerTotal)||!latestUpdate)throw Error('LEDGER_HEAD_INVALID');
  if(acc.rowCount!==ledgerTotal)throw Error('LEDGER_INCOMPLETE_ABORT');
  const snapshot=slimSnapshot(acc.finish({
    ledgerRevision:head.settlementRevision??null,
    expectedRows:ledgerTotal
  }));
  const record={
    schema:SNAPSHOT_SCHEMA,generatedAtMs:nowMs,
    source:{ledgerTotal,ledgerUpdatedAt:latestUpdate,
      settlementRevision:String(head.settlementRevision??'unknown')},
    snapshot
  };
  validateStoredRecord(record);
  const wrote=await store.putIfNewer(SNAPSHOT_KEY,record);
  return {state:wrote?'UPDATED':'CONCURRENT_NEWER',generatedAtMs:nowMs,
    ledgerTotal,readPages:pageCount,today:snapshot.londonDay.today};
}
export async function getSnapshot({store,nowMs=Date.now()}){
  const data=await store.read(SNAPSHOT_KEY);
  if(!data)return {ok:false,status:503,reason:'SNAPSHOT_MISSING'};
  if(!isEligible(data,nowMs)){
    const reason=data.snapshot?.londonDay?.today!==londonSportDay(nowMs)
      ?'LONDON_DAY_ROLLOVER':'SNAPSHOT_STALE_OR_INVALID';
    return {ok:false,status:503,reason};
  }
  return {ok:true,status:200,ageSeconds:Math.max(0,Math.floor((nowMs-data.generatedAtMs)/1000)),
    payload:{ok:true,...data.snapshot,generatedAtUtc:new Date(data.generatedAtMs).toISOString(),
      sourceUpdatedAtUtc:new Date(data.source.ledgerUpdatedAt).toISOString()}};
}