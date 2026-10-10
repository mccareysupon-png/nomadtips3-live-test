// Source-result semantics for the premium Member dashboard.
// The Engine exposes LIVE and PENDING as different results. Do not fold
// LIVE, VOID or unresolved statuses into the displayed PENDING count.
const OUTCOMES=new Set([
 'WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS','VOID','LIVE','PENDING','UNRESOLVED'
]);
export function normalizeMemberOutcome(rawResult,rawStatus){
 const result=String(rawResult??'').trim().toUpperCase();
 const status=String(rawStatus??'').trim().toUpperCase();
 if(OUTCOMES.has(result))return result;
 if(!result&&['PENDING','LIVE','UNRESOLVED'].includes(status))return status;
 return 'UNRESOLVED';
}
export function countMemberOutcomes(rows){
 const counts={signals:rows.length,win:0,loss:0,push:0,halfWin:0,halfLoss:0,
  pending:0,live:0,void:0,unresolved:0};
 for(const row of rows){
  switch(row.result){
   case 'WIN':counts.win++;break;
   case 'LOSS':counts.loss++;break;
   case 'PUSH':counts.push++;break;
   case 'HALF_WIN':counts.halfWin++;break;
   case 'HALF_LOSS':counts.halfLoss++;break;
   case 'PENDING':counts.pending++;break;
   case 'LIVE':counts.live++;break;
   case 'VOID':counts.void++;break;
   default:counts.unresolved++;
  }
 }
 return counts;
}
