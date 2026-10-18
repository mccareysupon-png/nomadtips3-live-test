import {FIRST_LEDGER_CURSOR} from './pending-ledger-reader.mjs';
/** Read only the named native Signal IDs back from current Ledger V2. */
export async function readSettledReceipt(engine,signalIds,{maxPages=30}={}){
 if(!engine?.fetch||!Array.isArray(signalIds)||!signalIds.length)
  return{ok:false,state:'INVALID_LEDGER_READBACK',rows:[]};
 const need=new Set(signalIds.map(String)),found=new Map(),seen=new Set();
 let cursor=FIRST_LEDGER_CURSOR;
 for(let i=0;i<maxPages;i++){
  if(seen.has(cursor))return{ok:false,state:'CURSOR_LOOP',rows:[]};
  seen.add(cursor);
  const url='https://engine.internal/statistics?cursor='+encodeURIComponent(cursor)+'&paged=1';
  const response=await engine.fetch(url,{method:'GET'});
  if(!response.ok)return{ok:false,state:'HTTP_'+response.status,rows:[]};
  const json=await response.json().catch(()=>null);
  if(json?.ok!==true||json?.statisticsSource!=='LEDGER_V2_ONLY'||
   json?.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||!Array.isArray(json.rows))
    return{ok:false,state:'WRONG_NATIVE_LEDGER',rows:[]};
  for(const row of json.rows){
   const id=String(row?.id??'');
   if(need.has(id)){
    if(found.has(id))return{ok:false,state:'LEDGER_DUPLICATE_ID',rows:[]};
    found.set(id,{id,fixtureId:String(row.fixtureId??''),status:String(row.status??''),
     result:String(row.result??'')});
   }
  }
  if(found.size===need.size)break;
  if(!json.nextCursor)break;
  if(typeof json.nextCursor!=='string'||!json.nextCursor.startsWith('stat:v2:row:')||
    !(json.nextCursor<cursor))return{ok:false,state:'INVALID_CURSOR',rows:[]};
  cursor=json.nextCursor;
 }
 if(found.size!==need.size)return{ok:false,state:'LEDGER_ROWS_MISSING',rows:[...found.values()]};
 const rows=[...found.values()];
 const allSettled=rows.every(r=>r.status.toUpperCase()==='SETTLED'&&
  ['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(r.result.toUpperCase()));
 return{ok:allSettled,state:allSettled?'NATIVE_LEDGER_V2_SETTLED_CONFIRMED':'STILL_PENDING_OR_UNRESOLVED',rows};
}
