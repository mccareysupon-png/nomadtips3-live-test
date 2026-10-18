import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const marker='/* BALL46 MEMBER — V3 mobile default-first: exactly four visible rows, expand inline */';
const v3=css.slice(css.indexOf(marker));

test('all markets and favorites use existing Member filters',()=>{
  assert.match(html,/id="marketMenuToggle"/);
  assert.match(html,/id="marketTabs"/);
  assert.match(html,/id="mobileMarketPills"/);
  assert.match(js,/for\(const market of \[\.\.\.MARKET_ORDER,'FAVORITES'\]\)/);
  assert.match(js,/source\?\.click\(\)/);
  assert.match(js,/state\.favoritesView/);
});
test('default matches appear before expanded details (none open initially)',()=>{
  assert.doesNotMatch(html,/id="mobileMatchSpotlight"/);
  assert.doesNotMatch(js,/function renderMobileSpotlight\(\)/);
  assert.match(js,/function renderRows\(\)/);
  assert.match(js,/if\(!detailInserted && state\.expandedSignalId===row\.id\)/);
  assert.match(js,/rowsEl\.append\(signalTr\)/);
  assert.match(js,/rowsEl\.append\(detailTr\)/);
  assert.match(js,/tr\.className='signal-row'\+\(state\.expandedSignalId===row\.id\?' expanded':' '\)/.source ? /function toggleDetail\(row\)/ : /function toggleDetail\(row\)/);
  assert.match(js,/state\.expandedSignalId=null/);
  assert.match(js,/function attachMobileExpandedControls\(host,matchFacts\)/);
});
test('default mobile card has exactly four visible rows without deleting signal data',()=>{
  assert.ok(v3.length>0);
  assert.match(v3,/grid-template-rows:21px 54px 29px/);
  assert.match(v3,/"detected detected detected detected"/);
  assert.match(v3,/"match match score score"/);
  assert.match(v3,/"market selection odds result"/);
  assert.match(v3,/grid-template-rows:repeat\(2,26px\)/);
  assert.match(js,/mobile-default-clock/);
  assert.match(js,/mobile-default-league/);
  assert.match(js,/mobile-default-state/);
  assert.match(v3,/signal-detail-row\{\s*display:block!important/);
});
test('expanded match reuses original match mirror and featured flow/history',()=>{
  assert.match(js,/function renderInsight\(host,fixtureId\)/);
  assert.match(js,/state\.detailCache\.get\(fixtureId\)/);
  assert.match(js,/\/api\/member\/match\?fixtureId=/);
  assert.match(js,/featuredHorizontal\(detail,selected\)/);
  assert.match(js,/eventFlowChart\(detail,fixtureId\)/);
  assert.match(js,/attachMobileExpandedControls\(host,featured\.matchFacts\)/);
  assert.match(v3,/mobile-show-all-history/);
  assert.match(v3,/mobile-show-all-stats/);
});
test('mobile-only V3 does not edit Engine data, existing desktop navigation remains',()=>{
  assert.match(css,/@media\(max-width:767px\)/);
  assert.match(html,/mobile-bottom-navigation/);
  assert.match(js,/initMobileSectionTabs\(\)/);
  assert.match(css,/\.mobile-market-navigation\{display:contents\}/);
  assert.match(js,/function renderSummary\(\)/);
  assert.match(js,/function filteredRows\(\)/);
  assert.match(js,/function renderMobileMarketPills\(\)/);
});
