// BALL46 TEST, existing O/U Statistics card only; never modify Live, 1X2, BTTS.
const once=(s,from,to,label)=>{
 const n=s.split(from).length-1;
 if(n!==1)throw Error('B46_OU_PRICED_STATS_CARD_ANCHOR_'+label+'_'+n);
 return s.replace(from,to);
};
export function patchPricedOuExistingStatisticsCard(client){
 if(typeof client!=='string'||!client.includes("mode==='ou'?'Pre-Match · Over/Under'")||
  !client.includes("if(modeNext==='ou-predictions')return;")||
  !client.includes('function prematchMarketLabel(item){')||
  !client.includes('window.B46PreMatchLiveMirror.render'))
  throw Error('NOT_CURRENT_PRICED_OU_TEST_UI_CLIENT');
 let s=client;
 s=once(s,
  "pick.append(el('strong','',outcome(item.pick)),el('b','',''+Number(item.price).toFixed(2)));",
  "pick.append(el('strong','',item.market==='O/U'?prematchMarketLabel(item):outcome(item.pick)),el('b','',''+Number(item.price).toFixed(2)));\n      if(item.market==='O/U'&&item.bookmaker)pick.append(el('span','b46pm-ou-bookmaker',String(item.bookmaker)));",
  'SAME_CARD_FORMAT_OU_ONLY');
 s=once(s,
  "'Edge '+fmtPct(Number(item.edge))",
  "'Edge '+(item.market==='O/U'&&item.edge==null?'—':fmtPct(Number(item.edge)))",
  'DO_NOT_DISPLAY_FAKE_OU_EDGE_ZERO');
 if(!s.includes("item.market==='O/U'?prematchMarketLabel(item):outcome(item.pick)")||
  !s.includes('b46pm-ou-bookmaker')||!s.includes('window.B46PreMatchLiveMirror.render')||
  !s.includes("if(modeNext==='ou-predictions')return;")||
  !s.includes("item.market==='O/U'&&item.edge==null?'—'"))
  throw Error('OU_CARD_POSTPATCH_INVARIANT');
 return {code:s,existingLayoutOnly:true,onlyOuCardChanged:true,
  oneX2AndBttsSourcePreserved:true,noNewProviderCalls:true};
}
