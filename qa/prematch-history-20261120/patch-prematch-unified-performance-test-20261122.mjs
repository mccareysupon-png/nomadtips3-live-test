// STAGE 2+3, UI only. Keep one shared performance graph for 1X2,
// BTTS and Total. Read valid market snapshots; never recompute ledgers.
export const B46_PREMATCH_UNIFIED_PERFORMANCE_V1='B46_PREMATCH_UNIFIED_PERFORMANCE_V1';
function replaceExactlyOnce(s,from,to,label){
 const n=s.split(from).length-1;
 if(n!==1)throw Error('UNIFIED_PERFORMANCE_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(from,to);
}
export function patchPreMatchUnifiedPerformance(existingClient){
 if(typeof existingClient!=='string'||
   !existingClient.includes("function perfSource(){")||
   !existingClient.includes("function performancePanel(){")||
   !existingClient.includes("mode==='btts'||mode==='all'")||
   !existingClient.includes("const activeLedger=mode==='btts'"))
   throw Error('NOT_VERIFIED_EXISTING_FOUR_VIEW_PREMATCH_CLIENT');
 let s=existingClient;
 s=replaceExactlyOnce(s,
   "const settled=Number(rs.win||0)+Number(rs.loss||0);",
   "const settled=Number(rs.settled??(Number(rs.win||0)+Number(rs.loss||0)+Number(rs.push||0)));",
   'TOTAL_SETTLED_INCLUDES_DRAW_FROM_SNAPSHOT');
 s=replaceExactlyOnce(s,
   "draw:0,loss:Number(rs.loss||0),units:Number(rs.units||0),",
   "draw:Number(rs.push??rs.draw??0),loss:Number(rs.loss||0),units:Number(rs.units||0),",
   'DRAW_FROM_MARKET_SNAPSHOT');
 s=replaceExactlyOnce(s,
   "runningStaked+=Number(row.stakedUnits||0);",
   "runningStaked+=Number(row.stakedUnits??row.settled??0);",
   'ROI_DENOMINATOR_FROM_PERSISTED_DAILY_SNAPSHOT');
 s=replaceExactlyOnce(s,
   "chart.append(title,el('strong','b46pm-performance-subtitle',empty?'Pre-Match · BTTS (no recorded results)':'Pre-Match · 1X2'));",
   "const subtitle=mode==='all'?'Pre-Match · Total (1X2 + BTTS)':"+
   "mode==='btts'?(empty?'Pre-Match · BTTS (no recorded results)':'Pre-Match · BTTS'):'Pre-Match · 1X2';\n"+
   "    chart.append(title,el('strong','b46pm-performance-subtitle',subtitle));",
   'RENDER_CORRECT_TOTAL_BTTS_1X2_GRAPH_TITLE');
 // Runtime invariants: only BTTS/Total code paths and shared display
 // denominator/title change. No market selection, model, ledger or CSS.
 if(!s.includes("Pre-Match · Total (1X2 + BTTS)")||
    !s.includes('row.stakedUnits??row.settled??0'))
   throw Error('UNIFIED_PERFORMANCE_PATCH_NOT_APPLIED');
 return {code:s,scope:['PERFORMANCE_BTTS','PERFORMANCE_TOTAL'],
  preservedOneX2ReceiverGraph:true,preservedCSS:true,preservedLedgers:true};
}
