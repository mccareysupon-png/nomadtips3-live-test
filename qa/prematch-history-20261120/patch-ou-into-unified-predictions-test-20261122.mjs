// BALL46 TEST ONLY: one Predictions navigation + one match card per issued fixture.
// Adds only a presentational O/U market slot. O/U bot, odds, ledgers, statistics,
// backend, production, 5USD API and current 1X2/BTTS logic are NOT changed.
export const B46_OU_INSIDE_PREDICTIONS_UI_V1='B46_OU_INSIDE_PREDICTIONS_UI_V1';
function once(s,oldValue,newValue,label){
  const found=s.split(oldValue).length-1;
  if(found!==1)throw Error('B46_OU_UNIFIED_SOURCE_DRIFT_'+label+'_'+found);
  return s.replace(oldValue,newValue);
}
export function patchOuIntoUnifiedPredictionsClient(source){
  if(typeof source!=='string'||
    !source.includes('function groupPreMatchIssuedRows(rows){')||
    !source.includes('function prematchMarketLabel(item){')||
    !source.includes("renderEmptyOuScreen(content,mode==='ou')")||
    !source.includes("nativeCard.dataset.b46PmCombinedMarkets='1X2,BTTS'")||
    !source.includes("const routes = ["))
    throw Error('B46_OU_UNIFIED_EXPECTS_CURRENT_TEST_CLIENT');
  let s=source;
  // Keep Statistics > Over/Under, but remove the duplicate Predictions nav item.
  s=once(s,
    "    {id:'ou-predictions',label:'Over/Under Predictions',source:'status-signal',parent:'status-signal'},\n",
    '', 'REMOVE_DUPLICATE_PREDICTIONS_MENU');
  // Preserve saved bookmarks via a one-time redirect to the combined Predictions URL.
  s=once(s,'const routes = [',
    "if(new URLSearchParams(location.search).get('b46pm')==='ou-predictions'){\n"+
    "  const canonical=new URL(location.href);\n"+
    "  canonical.searchParams.set('b46pm','predictions');\n"+
    "  location.replace(canonical.href);\n"+
    "}\nconst routes = [",
    'CANONICAL_PREDICTIONS_ROUTE');
  // Only expand card grouping: existing independent pick identity stays unchanged.
  s=once(s,"!['1X2','BTTS'].includes(market)","!['1X2','BTTS','O/U'].includes(market)",
    'ISSUED_MARKET_GROUPING_PRESENTATION');
  s=once(s,
    "    return outcome(item.pick);\n  }\n  function prematchMarketStrip(items){",
    "    if(item.market==='O/U'){\n"+
    "      const raw=String(item.pick??'').trim();\n"+
    "      const parsed=raw.match(/^(OVER|UNDER)[\\s_-]*(\\d+(?:\\.\\d+)?)$/i);\n"+
    "      return parsed?parsed[1].toUpperCase()+' '+parsed[2]:(raw||'—');\n"+
    "    }\n"+
    "    return outcome(item.pick);\n  }\n  function prematchMarketStrip(items){",
    'OVER_UNDER_PICK_TEXT');
  s=once(s,
    "item.market==='BTTS'?'BTTS':'1X2'",
    "item.market==='BTTS'?'BTTS':item.market==='O/U'?'Over/Under':'1X2'",
    'OVER_UNDER_MARKET_LABEL');
  s=once(s,
    "pick.append(el('span','b46pm-premium-tiny',item.market==='BTTS'?'BTTS · PREDICTION':'PREDICTION'));",
    "pick.append(el('span','b46pm-premium-tiny',item.market==='O/U'?'OVER/UNDER · PREDICTION':item.market==='BTTS'?'BTTS · PREDICTION':'PREDICTION'));",
    'STANDALONE_MARKET_CAPTION');
  s=once(s,
    "pick.append(el('strong','',item.market==='BTTS'?prematchMarketLabel(item):outcome(item.pick)));",
    "pick.append(el('strong','',item.market==='BTTS'||item.market==='O/U'?prematchMarketLabel(item):outcome(item.pick)));",
    'STANDALONE_OU_PICK');
  s=once(s,"if(item.market==='BTTS'){\n          const picks=issuedByFixture.get(String(item.fixture_id))??[];",
    "if(item.market==='BTTS'||item.market==='O/U'){\n          const picks=issuedByFixture.get(String(item.fixture_id))??[];",
    'NON_1X2_CARD_PATH');
  // A BTTS+O/U fixture without 1X2 still has ONE card, with two labelled selections.
  s=once(s,
    "if(picks.some(x=>x.market==='1X2'))continue;",
    "if(picks.some(x=>x.market==='1X2')||picks[0]!==item)continue;",
    'ONE_MATCH_CARD_FOR_NON_1X2_MARKETS');
  s=once(s,
    "          standalone.dataset.b46PmUnifiedFixture=String(item.fixture_id);\n          list.append(standalone);continue;",
    "          standalone.dataset.b46PmUnifiedFixture=String(item.fixture_id);\n"+
    "          if(picks.length>1){\n"+
    "            standalone.append(prematchMarketStrip(picks));\n"+
    "            standalone.dataset.b46PmCombinedMarkets=picks.map(x=>x.market).join(',');\n"+
    "          }\n"+
    "          list.append(standalone);continue;",
    'COMBINED_BTTS_OU_CARD');
  const existingMarker="dataset.b46PmCombinedMarkets='1X2,BTTS'";
  if(s.split(existingMarker).length-1!==2)
    throw Error('B46_OU_UNIFIED_SOURCE_DRIFT_COMBINED_MARKERS');
  s=s.replaceAll(existingMarker,"dataset.b46PmCombinedMarkets=siblingPicks.map(x=>x.market).join(',')");
  // Reuse exactly the same responsive card + market-strip CSS in Predictions.
  if(s.includes("{id:'ou-predictions',label:'Over/Under Predictions'")||
     !s.includes("{id:'ou',label:'Over/Under'")||
     !s.includes('b46pm-unified-market-stack')||
     !s.includes('window.B46PreMatchLiveMirror.render'))
    throw Error('B46_OU_UNIFIED_INVARIANT_FAILED');
  return {
    code:s,
    scope:'TEST_ONLY_PREDICTIONS_PRESENTATION',
    predictionMenuCount:1,
    marketsPrepared:['1X2','BTTS','O/U'],
    ouIssuedByThisPatch:0,
    ouExtraProviderCalls:0,
    oneXTwoModelChanged:false,
    statsAndBackendChanged:false
  };
}
