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
  assert.match(js,/function toggleDetail\(row\)/);
  assert.match(js,/state\.expandedSignalId=null/);
  assert.match(js,/function attachMobileExpandedControls\(host,matchFacts\)/);
});
test('default mobile card has exactly four visible rows without deleting signal data',()=>{
  assert.ok(v3.length>0);
  assert.match(v3,/grid-template-rows:16px 51px 24px/);
  assert.match(v3,/"detected detected detected detected"/);
  assert.match(v3,/"match match score score"/);
  assert.match(v3,/"market selection odds result"/);
  assert.match(v3,/grid-template-rows:repeat\(2,23px\)/);
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
test('approved V3 surfaces override older dark-shade classes on mobile only',()=>{
  const theme=v3.slice(v3.indexOf('Approved V3 colors take precedence'));
  assert.ok(theme.length>0);
  assert.match(v3,/background:linear-gradient\(145deg,#152c3a,#101f2c\)/);
  assert.match(theme,/signal-row\.signal-shade-odd:not\(\.expanded\)/);
  assert.match(theme,/signal-row\.signal-shade-even:not\(\.expanded\)/);
  assert.match(theme,/background-image:linear-gradient\(145deg,#152c3a,#101f2c\)/);
  assert.match(theme,/border-top:1px solid rgba\(255,255,255,\.07\)/);
  assert.match(v3,/grid-template-rows:16px 51px 24px/);
  assert.match(v3,/row-gap:5px/);
  assert.match(css,/mobile-default-market\{display:none\}/);
  assert.match(js,/cell\.prepend\(node\('span','mobile-default-market','CORNERS'\)\)/);
});

test('mobile V3 has one DOM component for each of the four visual lines',()=>{
  assert.match(js,/const compact=node\('div','mobile-v3-card'\)/);
  assert.match(js,/const head=node\('div','mobile-v3-line mobile-v3-meta'\)/);
  assert.match(js,/head\.append\(\s*node\('span','mobile-v3-clock',clock\),\s*node\('span','mobile-v3-league'/);
  assert.match(js,/compact\.append\(teamLine\('HOME',row\.home,scoreParts\[0\]\),teamLine\('AWAY',row\.away,scoreParts\[1\]\)\)/);
  assert.match(js,/const marketLine=node\('div','mobile-v3-line mobile-v3-market'\)/);
  assert.match(js,/compact\.append\(marketLine\)/);
  assert.match(js,/time\.append\(compact\)/);
  assert.match(js,/const compactStar=makeFavoriteButton\(row\)/);
  assert.match(js,/const compactOutcome=clockBadge\.cloneNode\(true\)/);
  const exact=css.slice(css.indexOf('/* Member Mobile V3 exact hierarchy'));
  assert.ok(exact.length>0);
  assert.match(exact,/grid-template-rows:16px 23px 23px 24px/);
  assert.match(exact,/grid-template-columns:auto minmax\(0,1fr\) auto 23px 13px/);
  assert.match(exact,/td:not\(\.signal-time\)\{\s*display:none!important/);
  assert.match(exact,/\.mobile-v3-card\{\s*display:grid!important/);
  assert.match(exact,/td\.signal-time>:not\(\.mobile-v3-card\)/);
});

test('mobile logo strip uses the approved V3 Deep Teal colors, without changing desktop header',()=>{
  const marker='/* BALL46 MEMBER — approved V3 mobile logo-strip Deep Teal gradient */';
  const idx=css.indexOf(marker);
  assert.ok(idx>0,'approved mobile header override exists');
  const portion=css.slice(idx);
  assert.match(portion,/@media\(max-width:767px\)/);
  assert.match(portion,/\.page-member \.topbar\{/);
  assert.match(portion,/background:linear-gradient\(180deg,#102635 0%,#0a1a27 100%\)/);
  assert.match(html,/mobileheader=20261018-v3-deepteal-v1/);
  assert.match(html,/brand-original-lettering/);
});
