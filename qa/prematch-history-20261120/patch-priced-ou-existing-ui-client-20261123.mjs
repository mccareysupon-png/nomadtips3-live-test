// TEST-only edits to existing pre-match frontend client, no new page.
const once=(s,a,b,label)=>{
 const n=s.split(a).length-1;
 if(n!==1)throw Error('B46_OU_UI_ANCHOR_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
export function patchPricedOuExistingUiClient(original){
 if(typeof original!=='string'||!original.includes('const routes = [')||
  !original.includes('function premiumMatchRow(item,hub,stale){')||
  !original.includes('function prematchMarketStrip(items){')||
  !original.includes('function prematchMarketLabel(item){')||
  !original.includes('renderEmptyOuScreen(content,false)'))
  throw Error('NOT_CURRENT_B46_PREMATCH_UI_CLIENT');
 let s=original;
 s=once(s,
  "if(modeNext==='ou'||modeNext==='ou-predictions')return;",
  "if(modeNext==='ou-predictions')return;",
  'DIRECT_OU_TAB_LOAD');
 s=once(s,
  "    // O/U UI clone has no bot, issued ledger, 5USD or API of its own.",
  "    // O/U reads real priced V2 picks from the existing Pre-Match UI data endpoint.",
  'DATA_COMMENT');
 s=once(s,
  "mode==='ou'?'Pre-Match · Over/Under (2.5)'",
  "mode==='ou'?'Pre-Match · Over/Under'",
  'ALL_GOAL_LINES');
 s=once(s,
  "mode==='ou'?'O/U 2.5 · Model-only test. Unverified odds; Win Rate uses FT outcomes. ROI/P/L unavailable.'",
  "mode==='ou'?'Over/Under · Full Market price captured in TEST. EV is a model estimate; ROI/P/L pending settlement.'",
  'REAL_PRICE_COPY');
 s=once(s,
  "meta.append(el('span','b46pm-premium-league',verifiedLeagueName(item,hub)));",
  "meta.append(el('span','b46pm-premium-league',verifiedLeagueName(item,hub)));\n    if(item.market==='O/U'&&item.bookmaker)meta.append(el('span','b46pm-premium-bookmaker',String(item.bookmaker)));",
  'PREMIUM_CARD_BOOKMAKER');
 const oldPrice="calculated(item.price)&&Number(item.price)>1?'@ '+Number(item.price).toFixed(2):'Price unavailable'";
 const newPrice="calculated(item.price)&&Number(item.price)>1?'@ '+Number(item.price).toFixed(2)+(item.market==='O/U'&&item.bookmaker?' · '+String(item.bookmaker):''):'Price unavailable'";
 s=once(s,oldPrice,newPrice,'UNIFIED_MARKET_BOOKMAKER');
 if(!s.includes("if(modeNext==='ou-predictions')return;")||
  !s.includes("mode==='ou'?'Pre-Match · Over/Under'")||
  !s.includes('b46pm-premium-bookmaker')||
  !s.includes('window.B46PreMatchLiveMirror.render')||
  !s.includes("if(item.market==='BTTS'||item.market==='O/U')")||
  !s.includes("let mode='', ledger=null, bttsLedger=null"))
  throw Error('EXISTING_TEST_PREMATCH_UI_INVARIANT_FAILED');
 return {code:s,originalUiReused:true,noNewRoute:true,noProviderCalls:true,
  oneX2Unchanged:true,bttsUnchanged:true,nativeMirrorUnchanged:true};
}
