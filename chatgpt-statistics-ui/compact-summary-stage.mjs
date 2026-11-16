// BALL46 STAGING ONLY: original-source aggregate projection for fast first paint.
// Never recompute payouts/ROI, alter results, or publish partial Ledger.
export const COMPACT_SUMMARY_SCHEMA = 1;
const FIELDS = ['win','loss','push','halfWin','halfLoss'];
const NON_NEGATIVE = ['ledgerTotal','total','pending','unresolved',...FIELDS];
const KEEP = ['version','settlementRevision','statisticsLedgerVersion',
  'statisticsContentRevision','ledgerUpdatedAt'];
const MAX_BYTES=128*1024;

export function createCompactSummary(snapshot, verifyRows){
  if(!snapshot || snapshot.ok!==true || !Array.isArray(snapshot.rows) ||
     snapshot.rows.length!==snapshot.ledgerTotal || snapshot.hasMore!==false ||
     snapshot.nextCursor!=null || typeof verifyRows!=='function')
    throw Error('COMPACT_SUMMARY_REQUIRES_FULL_VERIFIED_LEDGER');
  for(const key of NON_NEGATIVE){
    if(!Number.isSafeInteger(snapshot[key])||snapshot[key]<0)
      throw Error('COMPACT_SUMMARY_INVALID_'+key);
  }
  // Publish only after exact original result counts are reconciled.
  verifyRows(snapshot,snapshot.rows);
  const summary={schema:COMPACT_SUMMARY_SCHEMA,ok:true,
    source:'STAGING_VERIFIED_PUBLIC_LEDGER',
    mode:'AGGREGATES_ONLY_NOT_HISTORY',
    snapshotSavedAt:snapshot.snapshotSavedAt};
  for(const key of [...NON_NEGATIVE,...KEEP]){
    if(Object.hasOwn(snapshot,key))summary[key]=snapshot[key];
  }
  if(!Number.isFinite(summary.snapshotSavedAt) ||
     summary.snapshotSavedAt<0)throw Error('COMPACT_SUMMARY_INVALID_SAVED_AT');
  // Optional source market aggregates, never independently recomputed.
  // Skip oversize market details rather than failing the full snapshot.
  if(snapshot.byMarket && typeof snapshot.byMarket==='object' &&
     !Array.isArray(snapshot.byMarket)) {
    const market=JSON.stringify(snapshot.byMarket);
    if(Buffer.byteLength(market,'utf8')<=64*1024)summary.byMarket=snapshot.byMarket;
    else summary.marketDetailsDeferred=true;
  }
  const body=JSON.stringify(summary);
  if(Buffer.byteLength(body,'utf8')>MAX_BYTES)throw Error('COMPACT_SUMMARY_TOO_LARGE');
  return {summary,body,bytes:Buffer.byteLength(body,'utf8')};
}
