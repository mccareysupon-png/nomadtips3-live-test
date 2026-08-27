const n=v=>Number.isFinite(Number(v))?Number(v):0;

export function normalizeSummaryRow(row={}){
  const total=n(row.total),settled=n(row.settled),pending=n(row.pending);
  const win=n(row.win),halfWin=n(row.half_win),push=n(row.push),halfLoss=n(row.half_loss),loss=n(row.loss),voidCount=n(row.void_count);
  const plUnits=Number(Number(row.pl_units||0).toFixed(6));
  const avgOdds=row.avg_odds==null?null:Number(Number(row.avg_odds).toFixed(3));
  const fullDecisions=win+loss;
  return {total,settled,pending,resultCounts:{WIN:win,HALF_WIN:halfWin,PUSH:push,HALF_LOSS:halfLoss,LOSS:loss,VOID:voidCount},avgOdds,plUnits,roiPct:settled?Number((plUnits/settled*100).toFixed(2)):0,winRatePct:fullDecisions?Number((win/fullDecisions*100).toFixed(2)):0,winRateScope:'FULL_WIN_LOSS_ONLY'};
}

export async function statisticsSummary(db){
  const row=await db.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN st.result_grade IS NULL THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN st.result_grade IS NOT NULL THEN 1 ELSE 0 END) AS settled,SUM(CASE WHEN st.result_grade='WIN' THEN 1 ELSE 0 END) AS win,SUM(CASE WHEN st.result_grade='HALF_WIN' THEN 1 ELSE 0 END) AS half_win,SUM(CASE WHEN st.result_grade='PUSH' THEN 1 ELSE 0 END) AS push,SUM(CASE WHEN st.result_grade='HALF_LOSS' THEN 1 ELSE 0 END) AS half_loss,SUM(CASE WHEN st.result_grade='LOSS' THEN 1 ELSE 0 END) AS loss,SUM(CASE WHEN st.result_grade='VOID' THEN 1 ELSE 0 END) AS void_count,AVG(s.odds_decimal) AS avg_odds,COALESCE(SUM(st.pl_units),0) AS pl_units FROM signals s LEFT JOIN settlements st ON st.signal_id=s.signal_id`).first();
  return normalizeSummaryRow(row||{});
}
