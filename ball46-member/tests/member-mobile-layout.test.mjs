import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');

test('member mobile has complete market navigation without removing desktop market menu',()=>{
  assert.match(html,/id="marketMenuToggle"/);
  assert.match(html,/id="marketTabs"/);
  assert.match(html,/id="mobileMarketPills"/);
  assert.match(js,/for\(const market of \[\.\.\.MARKET_ORDER,'FAVORITES'\]\)/);
  assert.match(js,/source\?\.click\(\)/);
  assert.match(js,/state\.favoritesView/);
});
test('mobile spotlight consumes mirrored payload instead of inventing results',()=>{
  assert.match(html,/id="mobileMatchSpotlight"/);
  assert.match(js,/function mobileSelectedSignal\(\)/);
  assert.match(js,/state\.detailCache\.get\(fixtureId\)/);
  assert.match(js,/\/api\/member\/match\?fixtureId=/);
  assert.match(js,/featuredHorizontal\(detail,selected\)/);
  assert.match(js,/eventFlowChart\(detail,fixtureId\)/);
});
test('responsive UI remains scoped to mobile and detail data can be reopened',()=>{
  assert.match(css,/@media\(max-width:767px\)/);
  assert.match(css,/#mobileMatchSpotlight/);
  assert.match(css,/mobile-show-all-history/);
  assert.match(css,/mobile-show-all-stats/);
  assert.match(html,/mobile-bottom-navigation/);
  assert.match(js,/initMobileSectionTabs\(\)/);
  assert.match(css,/\.mobile-market-navigation\{display:contents\}/);
});
test('engine signal state and immutable daily mirror remain the data authority',()=>{
  assert.match(js,/function filteredRows\(\)/);
  assert.match(js,/function renderTabs\(\)/);
  assert.match(js,/function renderMobileMarketPills\(\)/);
  assert.match(js,/function renderMobileSpotlight\(\)/);
  assert.doesNotMatch(js,/document\.querySelector\('#mobileMatchSpotlight'\).*\.innerHTML/);
});
