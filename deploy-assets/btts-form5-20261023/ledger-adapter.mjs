/* BALL46 BTTS Form5 -> Engine343 long-term ledger adapter.
  Only to be used by a real producer after a validated PREGAME decision.
  Rows remain odds-less, so correct/incorrect count can be aggregated but not ROI.
*/
const timeOf=v=>typeof v==='number'?v:Date.parse(String(v));
export function form5LedgerRow(decision, fixture, prior=null) {
 if(!decision || !decision.id || decision.model!=='B46_BTTS_FORM5_V1' ||
    !['PENDING','SETTLED'].includes(decision.status) ||
    !['YES','NO'].includes(decision.selection)) throw Error('FORM5_INVALID_DECISION');
 const createdAt = prior?.createdAt ?? timeOf(decision.issuedAt);
 if(!Number.isFinite(createdAt)||createdAt<=0) throw Error('FORM5_INVALID_ENTRY_TIME');
 const kickoff=Date.parse(decision.kickoffUtc||'');
 if(!Number.isFinite(kickoff)||createdAt>=kickoff) throw Error('FORM5_NOT_PREMATCH');
 if(prior && (prior.id!==decision.id||prior.selection!==decision.selection||prior.market!==decision.market))
   throw Error('FORM5_IMMUTABLE_PICK');
 const settled=decision.status==='SETTLED';
 if(settled && !['WIN','LOSS'].includes(decision.result))throw Error('FORM5_INVALID_FT_RESULT');
 return {
  id:decision.id,fixtureId:decision.fixtureId,
  league:fixture?.league??prior?.league??null,
  home:fixture?.home??prior?.home??{id:decision.homeTeamId},
  away:fixture?.away??prior?.away??{id:decision.awayTeamId},
  market:decision.market,marketLabel:decision.market==='ft_btts_yes'?'BTTS YES · Form5':'BTTS NO · Form5',
  providerMarket:'btts',period:'FT',selection:decision.selection,
  line:null,selectionLine:null,providerLine:null,odds:null,bookmaker:null,bookmakerSlug:null,
  priceStage:'UNAVAILABLE',priceSource:'FORM5_MODEL_NO_VERIFIED_ODDS',
  createdAt,entryMinute:null,minute:null,entryScore:null,scoreAt:null,
  status:decision.status,result:settled?decision.result:null,
  finalScore:settled?decision.finalScore:null,
  settlementBasis:settled?'GOALS_FULL_TIME':null,
  settlementRevision:settled?'FORM5_FT_V1':null,
  settledAt:settled?timeOf(decision.settledAt):null,
  model:'B46_BTTS_FORM5_V1',modelReason:decision.reason,
  kickoffUtc:decision.kickoffUtc,
  homeForm:decision.homeForm??prior?.homeForm??null,
  awayForm:decision.awayForm??prior?.awayForm??null,
  noOdds:true,
  // No stake, odds, units or hypothetical ROI are attached.
 };
}
export function aggregateLedgerWithModel(nativeTotals, modelRows) {
 const existing=nativeTotals??{},valid=(modelRows||[]).filter(r=>r?.model==='B46_BTTS_FORM5_V1'&&r?.status==='SETTLED'&&['WIN','LOSS'].includes(r?.result));
 const win=valid.filter(r=>r.result==='WIN').length,loss=valid.length-win;
 const nw=Number(existing.win||0)+win,nl=Number(existing.loss||0)+loss,hw=Number(existing.halfWin||0),hl=Number(existing.halfLoss||0);
 const denom=nw+nl+hw+hl;
 return {...existing,total:Number(existing.total||0)+valid.length,
  win:nw,loss:nl,winRate:denom?Math.round((nw+hw/2)/denom*1000)/10:null,
  byMarket:{...(existing.byMarket||{}),
    ft_btts_yes:Number(existing.byMarket?.ft_btts_yes||0)+valid.filter(r=>r.market==='ft_btts_yes').length,
    ft_btts_no:Number(existing.byMarket?.ft_btts_no||0)+valid.filter(r=>r.market==='ft_btts_no').length}};
}
