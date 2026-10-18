/**
 * New-signals-only intake for BALL46.
 * The first complete authoritative Ledger V2 read is a baseline:
 * every PENDING signal already there is marked legacy, NOT forwarded.
 *
 * After the baseline, every newly seen PENDING signal is snapshotted as
 * one durable record per Signal ID. Never backfill or re-route legacy rows.
 * No native Engine or Ledger mutations.
 */
const ROOT='ball46:verified-fixture-crosswalk:v3:new-signal:';
const BASELINE=ROOT+'baseline';
const legacyKey=id=>ROOT+'legacy:'+encodeURIComponent(String(id));
const signalKey=id=>ROOT+'capture:'+encodeURIComponent(String(id));
const tms=v=>{
 if(typeof v==='number'&&Number.isFinite(v))return v<1e11?v*1000:v;
 if(typeof v==='string'&&/^\d{10,13}$/.test(v))return tms(Number(v));
 if(typeof v==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(v)){
  const n=Date.parse(v);return Number.isFinite(n)?n:null;
 }
 return null;
};
const asNumber=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const val=v=>v===undefined||v===null?null:String(v).trim();
export const newSignalCaptureKey=signalKey;
export async function captureOnlyNewPending(storage,rows,{at=new Date().toISOString()}={}){
 if(typeof storage?.transaction!=='function'||!Array.isArray(rows)||
   !Number.isFinite(Date.parse(at)))return {ok:false,state:'BAD_LEDGER_CAPTURE_INPUT',selectedRows:[]};
 return storage.transaction(async tx=>{
  let baseline=await tx.get(BASELINE);
  const firstRun=!baseline;
  if(firstRun){
   // Called only after a COMPLETE and AUTHORITATIVE Ledger V2 read.
   baseline={establishedAt:at,legacyPendingCount:rows.length,
    capturedTotal:0,lastPolledAt:at,lastNewPendingCount:0,version:1};
   for(const r of rows){
    if(r?.id)await tx.put(legacyKey(r.id),true);
   }
   await tx.put(BASELINE,baseline);
   return{ok:true,state:'OLD_PENDING_QUARANTINED',firstRun:true,
    legacyPendingCount:rows.length,newPendingCount:0,selectedRows:[],
    baselineAt:at,ledgerWrites:0};
  }
  const selectedRows=[];
  let skippedLegacy=0,created=0,alreadyStored=0,missingId=0;
  const baselineTime=Date.parse(baseline.establishedAt);
  for(const row of rows){
   if(row?.status!=='PENDING'||!row?.id||!row?.fixtureId){missingId++;continue}
   if(await tx.get(legacyKey(row.id))){skippedLegacy++;continue}
   const createdMs=tms(row.createdAt);
   // Prevent reintroduced old records from escaping quarantine after the
   // first snapshot (e.g. delayed archival or pagination changes).
   if(createdMs!==null&&createdMs<baselineTime){
    await tx.put(legacyKey(row.id),true);skippedLegacy++;continue;
   }
   const key=signalKey(row.id);
   const existing=await tx.get(key);
   if(existing){alreadyStored++;selectedRows.push(row);continue}
   const record={id:String(row.id),fixtureId:String(row.fixtureId),
    firstCapturedAt:at,createdAt:row.createdAt??null,
    statusOnCapture:'PENDING',market:val(row.market),period:val(row.period),
    selection:val(row.selection),line:asNumber(row.line),
    lockedOdds:asNumber(row.lockedOdds??row.entryOdds??row.odds),
    entryMinute:asNumber(row.entryMinute),
    source:'AUTHORITATIVE_LEDGER_V2',version:1};
   await tx.put(key,record);selectedRows.push(row);created++;
  }
  baseline.capturedTotal=(Number(baseline.capturedTotal)||0)+created;
  baseline.lastPolledAt=at;
  baseline.lastNewPendingCount=selectedRows.length;
  await tx.put(BASELINE,baseline);
  return{ok:true,state:'NEW_PENDING_TRACKED',firstRun:false,
   baselineAt:baseline.establishedAt,capturedTotal:baseline.capturedTotal,newPendingCount:selectedRows.length,
   capturedThisRun:created,previouslyCaptured:alreadyStored,
   excludedLegacy:skippedLegacy,invalid:missingId,selectedRows,ledgerWrites:0};
 });
}
