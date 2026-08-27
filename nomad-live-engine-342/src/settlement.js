export const VALID_RESULT_GRADES=new Set(['WIN','HALF_WIN','PUSH','HALF_LOSS','LOSS','VOID']);

export function profitUnitsForGrade(grade,odds){
  const result=String(grade||'').toUpperCase();
  const price=Number(odds);
  if(!VALID_RESULT_GRADES.has(result)) throw new Error('invalid_result_grade');
  if(result==='VOID'||result==='PUSH') return 0;
  if(result==='LOSS') return -1;
  if(result==='HALF_LOSS') return -0.5;
  if(!Number.isFinite(price)||price<1) throw new Error('invalid_odds');
  if(result==='WIN') return Number((price-1).toFixed(6));
  return Number(((price-1)/2).toFixed(6));
}

/*
  IMPORTANT:
  This module deliberately does not decide a live Asian Handicap result yet.
  NOMAD 3.42 must first lock the verified settlement semantics for entry-score
  versus final-score handling. Once verified, the grader can be added here
  without changing the ledger schema.
*/
