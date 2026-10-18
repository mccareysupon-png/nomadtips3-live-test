/**
 * Read authoritative Signal Ledger V2 without triggering scanIfDue().
 * Active Engine uses reverse:true/end:cursor, so a lexicographic HIGH cursor
 * is required for the first GET. Prefix-only cursors return no records.
 * NEVER use /signals or /statistics without a cursor on this recovery rail.
 */
const PREFIX='stat:v2:row:';
export const FIRST_LEDGER_CURSOR=PREFIX+'9999999999999:~';
export function pendingMarketEligible(row){
 if(String(row?.status||'').toUpperCase()!=='PENDING')return false;
 const market=String(row?.market||'').toUpperCase();
 const period=String(row?.period||'FT').toUpperCase();
 return !!row?.id&&!!row?.fixtureId&&period!=='HT'&&
   !market.includes('CORNER')&&!market.includes('CARD')&&
   ['AH','OVER','UNDER','O/U','OU','1X2','GOALS'].some(x=>market===x||market.startsWith(x+'_'));
}
export async function readPendingFromLedgerV2(engine,{maxPages=30}={}){
 if(!engine||typeof engine.fetch!=='function')
  return{ok:false,state:'ENGINE_READ_BINDING_MISSING',rows:[]};
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>40)
  return{ok:false,state:'INVALID_PAGE_LIMIT',rows:[]};
 let cursor=FIRST_LEDGER_CURSOR,ledgerTotal=null,pendingTotal=null,seen=0;
 const all=[],seenIds=new Set(),seenCursors=new Set();
 for(let page=0;page<maxPages;page++){
  if(seenCursors.has(cursor))return{ok:false,state:'CURSOR_LOOP',rows:[]};
  seenCursors.add(cursor);
  const url='https://engine.internal/statistics?cursor='+encodeURIComponent(cursor)+'&paged=1';
  const res=await engine.fetch(url,{method:'GET'});
  if(!res.ok)return{ok:false,state:'LEDGER_READ_HTTP_'+res.status,rows:[]};
  const data=await res.json().catch(()=>null);
  if(data?.ok!==true||data?.statisticsSource!=='LEDGER_V2_ONLY'||
     data?.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||!Array.isArray(data?.rows))
    return{ok:false,state:'NOT_AUTHORITATIVE_LEDGER_V2',rows:[]};
  ledgerTotal=data.ledgerTotal;pendingTotal=data.pending;
  seen+=data.rows.length;
  for(const row of data.rows){
   if(String(row?.status).toUpperCase()!=='PENDING')continue;
   if(!row?.id||seenIds.has(String(row.id)))return{ok:false,state:'DUPLICATE_PENDING_SIGNAL_ID',rows:[]};
   seenIds.add(String(row.id));
   all.push({id:String(row.id),fixtureId:String(row.fixtureId??''),
     status:'PENDING',market:String(row.market??''),
     period:String(row.period??''),createdAt:row.createdAt??null});
  }
  if(!data.nextCursor)return{ok:true,state:'LEDGER_V2_READ_ONLY_COMPLETE',
   authority:'LEDGER_V2_ONLY',rows:all,eligible:all.filter(pendingMarketEligible),
   pages:page+1,rowsScanned:seen,ledgerTotal,pendingTotal,mutations:0};
  if(typeof data.nextCursor!=='string'||!data.nextCursor.startsWith(PREFIX)||
     !(data.nextCursor<cursor))return{ok:false,state:'INVALID_NEXT_CURSOR',rows:[]};
  cursor=data.nextCursor;
 }
 return{ok:false,state:'LEDGER_V2_PAGES_EXCEEDED',rows:[],pages:maxPages};
}
