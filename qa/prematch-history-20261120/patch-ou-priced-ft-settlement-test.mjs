// TEST-only priced FT settlement augmentation to existing independent O/U 2.5 model.
// Does not change selection, threshold, probabilities, or 1X2 / BTTS ledger.
const once=(src,a,b,description)=>{
 const n=src.split(a).length-1;
 if(n!==1)throw Error('B46_OU_SETTLEMENT_SOURCE_DRIFT_'+description+'_'+n);
 return src.replace(a,b);
};
export function patchOuPricedFtSettlement(input){
 if(typeof input!=='string'||!input.includes("export const OU_MODEL='ou-poisson-shrinkage-2p5-v1p1-available-history'")||
   !input.includes('export function settleOu(db,now){')||
   !input.includes('export function readOuSnapshot(db,now){'))
  throw Error('NOT_CURRENT_OU_V1P1_TEST_MODEL');
 let s=input;
 s=once(s,
  "SELECT p.fixture_id,p.pick,r.hg,r.ag FROM b46_ou_pick_v1_test p JOIN result_version r",
  "SELECT p.fixture_id,p.pick,p.price,r.hg,r.ag FROM b46_ou_pick_v1_test p JOIN result_version r",
  'READ_PRICED_PICK_AT_FT');
 s=once(s,
  "const won=p.pick===((p.hg+p.ag)>=3?'OVER_2.5':'UNDER_2.5');\n   db.exec(\"UPDATE b46_ou_pick_v1_test SET status=?,hg=?,ag=?,settled_at=?,units=NULL WHERE fixture_id=? AND status='PENDING'\",won?'WIN':'LOSS',p.hg,p.ag,now,p.fixture_id);",
  "const won=p.pick===((p.hg+p.ag)>=3?'OVER_2.5':'UNDER_2.5');\n   const priced=typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>1;\n   const units=priced?(won?Number(p.price)-1:-1):null;\n   db.exec(\"UPDATE b46_ou_pick_v1_test SET status=?,hg=?,ag=?,settled_at=?,units=? WHERE fixture_id=? AND status='PENDING'\",won?'WIN':'LOSS',p.hg,p.ag,now,units,p.fixture_id);",
  'FT_PRICED_UNITS_STAY_NULL_IF_UNPRICED');
 // Accurate daily units and cumulative series from the existing incremental
 // O/U daily snapshot; no full-ledger recalculation or imaginary stake/ROI.
 s=once(s,
  "const dailySeries=series.map(r=>({date:r.business_day,selected:r.selected,settled:r.settled,win:r.win,loss:r.loss,draw:r.push,stakedUnits:null,netUnits:null,cumulativeUnits:null}));",
  "let cumulative=Number(get(db,'SELECT COALESCE(SUM(units),0) AS n FROM b46_ou_daily_v1_test WHERE business_day<?',start)[0]?.n??0);\n const dailySeries=series.map(r=>{const n=Number(r.priced_settled||0),u=Number(r.units||0);cumulative+=u;return {date:r.business_day,selected:r.selected,settled:r.settled,win:r.win,loss:r.loss,draw:r.push,stakedUnits:n>0?n:null,netUnits:n>0?u:null,cumulativeUnits:priced>0?cumulative:null}});",
  'DAILY_ACTUAL_UNITS_ONLY');
 s=once(s,
  "units:priced>0?Number(s.units):null,pricedSettled:priced};",
  "units:priced>0?Number(s.units):null,roi:priced>0?100*Number(s.units)/priced:null,pricedSettled:priced};",
  'ROI_ONLY_WHEN_PRICED');
 if(!s.includes("const units=priced?(won?Number(p.price)-1:-1):null")||
    !s.includes("roi:priced>0?100*Number(s.units)/priced:null")||
    !s.includes("cumulativeUnits:priced>0?cumulative:null")||
    !s.includes("minProbability:.64"))throw Error('PRICED_SETTLEMENT_INVARIANT');
 return {code:s,scope:'INDEPENDENT_TEST_OU_FT_SETTLEMENT_ONLY',modelFormulaUnchanged:true,
  allOtherMarketsUnchanged:true,oldUnpricedPicksRemainUnpriced:true};
}
