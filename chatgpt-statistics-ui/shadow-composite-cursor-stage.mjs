// STAGING: source-time ordering, not a durable Engine commit sequence.
// Cursor is informational; recovery must replay overlapping rows and check known pending IDs.
export function normalizeRow(row){
 const signal_id=String(row?.signal_id??row?.id??'');
 const settled_at=Number(row?.settled_at??row?.settledAt);
 const result=row?.result;
 if(!signal_id||!Number.isSafeInteger(settled_at)||settled_at<=0||!['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(result))throw Error('INVALID_SETTLED_ROW');
 return {signal_id,settled_at,result,market_type:String(row.market_type??row.market??''),odds:row.odds??null};
}
export function compareCursor(a,b){return a.settled_at-b.settled_at||(a.signal_id<b.signal_id?-1:a.signal_id>b.signal_id?1:0)}
export async function postComposite(storage,raw){
 const row=normalizeRow(raw);
 return storage.transaction(async tx=>{
  const key='composite:receipt:'+row.signal_id,prior=await tx.get(key);
  const state=await tx.get('composite:state')??{cursor:null,WIN:0,LOSS:0,PUSH:0,HALF_WIN:0,HALF_LOSS:0,total:0,winRate:0};
  if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error('CORRECTION_REQUIRES_EXPLICIT_HANDLING');return {duplicate:true,state}}
  const late=state.cursor!==null&&compareCursor(row,state.cursor)<=0;
  state[row.result]++;state.total++;
  const w=state.WIN+state.HALF_WIN,l=state.LOSS+state.HALF_LOSS;state.winRate=w+l?w/(w+l)*100:0;
  if(!state.cursor||compareCursor(row,state.cursor)>0)state.cursor={settled_at:row.settled_at,signal_id:row.signal_id};
  await tx.put(key,row);await tx.put('composite:state',state);
  return {duplicate:false,late,state};
 });
}
export async function replayComposite(storage,rows){
 const ordered=rows.map(normalizeRow).sort(compareCursor);
 let accepted=0,duplicates=0,late=0;
 for(const row of ordered){const r=await postComposite(storage,row);if(r.duplicate)duplicates++;else{accepted++;if(r.late)late++}}
 return {accepted,duplicates,late,state:await storage.get('composite:state')};
}
