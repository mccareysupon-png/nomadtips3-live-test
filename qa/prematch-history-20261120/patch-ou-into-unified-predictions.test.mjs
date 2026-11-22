import test from 'node:test';
import assert from 'node:assert/strict';
import {patchOuIntoUnifiedPredictionsClient} from './patch-ou-into-unified-predictions-test-20261122.mjs';
const existing=[
  "const routes = [",
  "    {id:'predictions',label:'Predictions',source:'status-signal',parent:'status-signal'},",
  "    {id:'ou-predictions',label:'Over/Under Predictions',source:'status-signal',parent:'status-signal'},",
  "    {id:'1x2',label:'1X2',source:'stat-1x2'},",
  "    {id:'ou',label:'Over/Under',source:'stat-1x2'},",
  "];",
  "function groupPreMatchIssuedRows(rows){if(!['1X2','BTTS'].includes(market))throw Error('INVALID');}",
  "function prematchMarketLabel(item){",
  "    return outcome(item.pick);",
  "  }",
  "  function prematchMarketStrip(items){",
  "    el('span','b46pm-unified-market-label',item.market==='BTTS'?'BTTS':'1X2');",
  "    el('div','b46pm-unified-market-stack');",
  "  }",
  "function premiumMatchRow(){",
  "pick.append(el('span','b46pm-premium-tiny',item.market==='BTTS'?'BTTS · PREDICTION':'PREDICTION'));",
  "pick.append(el('strong','',item.market==='BTTS'?prematchMarketLabel(item):outcome(item.pick)));",
  "}",
  "function draw(){",
  "if(item.market==='BTTS'){",
  "          const picks=issuedByFixture.get(String(item.fixture_id))??[];",
  "if(picks.some(x=>x.market==='1X2'))continue;",
  "          standalone.dataset.b46PmUnifiedFixture=String(item.fixture_id);",
  "          list.append(standalone);continue;",
  "nativeCard.dataset.b46PmCombinedMarkets='1X2,BTTS';",
  "premiumCard.dataset.b46PmCombinedMarkets='1X2,BTTS';",
  "window.B46PreMatchLiveMirror.render(item);",
  "renderEmptyOuScreen(content,mode==='ou');",
  "}",
].join('\n');
test('single Predictions menu, keep O/U Statistics, legacy link redirects',()=>{
  const r=patchOuIntoUnifiedPredictionsClient(existing);
  assert.equal(r.predictionMenuCount,1);
  assert.equal(r.ouIssuedByThisPatch,0);
  assert.equal(r.ouExtraProviderCalls,0);
  assert(!r.code.includes("{id:'ou-predictions',label:'Over/Under Predictions'"));
  assert(r.code.includes("{id:'predictions',label:'Predictions'"));
  assert(r.code.includes("{id:'ou',label:'Over/Under'"));
  assert(r.code.includes("canonical.searchParams.set('b46pm','predictions')"));
});
test('one actual match card can carry 1X2, BTTS and O/U without duplicated fixtures',()=>{
  const {code}=patchOuIntoUnifiedPredictionsClient(existing);
  assert(code.includes("!['1X2','BTTS','O/U'].includes(market)"));
  assert(code.includes("item.market==='O/U'?'Over/Under':'1X2'"));
  assert(code.includes("picks[0]!==item"));
  assert(code.includes("standalone.append(prematchMarketStrip(picks))"));
  assert.equal(code.split("dataset.b46PmCombinedMarkets=siblingPicks.map(x=>x.market).join(',')").length-1,2);
  assert(code.includes('window.B46PreMatchLiveMirror.render'));
  assert(code.includes("renderEmptyOuScreen(content,mode==='ou')"));
});
test('fail closed on changed source instead of damaging other routes',()=>{
  assert.throws(()=>patchOuIntoUnifiedPredictionsClient('abc'),/EXPECTS_CURRENT_TEST_CLIENT/);
  assert.throws(()=>patchOuIntoUnifiedPredictionsClient(existing.replace("    {id:'ou-predictions',label:'Over/Under Predictions',source:'status-signal',parent:'status-signal'},\n",'')),/SOURCE_DRIFT/);
});
