import test from 'node:test';
import assert from 'node:assert/strict';
import {patchStatisticsSidebarHeadingsClient} from './patch-statistics-sidebar-headings-test-20261122.mjs';
const sample=[
  "const routes = [",
  "const box=el('div','b46pm-mobile-navigation');",
  "box.append(el('div','b46m-grouplabel','PRE-MATCH · TEST'));",
  "const title=el('div','b46pm-nav-heading','PRE-MATCH · TEST');wrapper.append(title);",
  "const x='b46pm-stats-navigation';",
  "    mobileNav();",
  "  function draw(pageOnly=false){",
  "  }"
].join('\n');
test('renames the two Pre-Match headings, adds scoped native Live title',()=>{
  const r=patchStatisticsSidebarHeadingsClient(sample);
  assert.equal(r.scope,'TEST_UI_HEADINGS_ONLY');
  assert.equal(r.code.match(/PRE-MATCH STATISTICS/g).length,2);
  assert(!r.code.includes('PRE-MATCH · TEST'));
  assert(r.code.includes("node.textContent='LIVE STATISTICS'"));
  assert(r.code.includes("b46RenameNativeLiveStatsHeading();"));
  assert.equal(r.marketRoutesChanged,false);
  assert.equal(r.backendChanged,false);
});
test('fails closed if an expected heading or anchor changes',()=>{
  assert.throws(()=>patchStatisticsSidebarHeadingsClient('abc'),/NOT_ACTIVE/);
  assert.throws(()=>patchStatisticsSidebarHeadingsClient(sample.replace('PRE-MATCH · TEST','OTHER')),/SOURCE_DRIFT/);
});
