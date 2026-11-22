import test from 'node:test';
import assert from 'node:assert/strict';
import {patchSidebarSectionTypographyClient} from './patch-sidebar-section-typography-test-20261122.mjs';
const source=[
 "const title=el('div','b46pm-nav-heading','PRE-MATCH STATISTICS');",
 "box.append(el('div','b46m-grouplabel','PRE-MATCH STATISTICS'));",
 "  function draw(pageOnly=false){",
 "  }",
 "    mobileNav();",
 "    b46RenameNativeLiveStatsHeading();",
].join('\n');
test('native desktop titles share Pre-Match title typography only',()=>{
 const result=patchSidebarSectionTypographyClient(source);
 assert(result.code.includes('b46-sidebar-section-type-v1'));
 assert(result.code.includes('font-size:11px!important'));
 assert(result.code.includes('font-weight:750!important'));
 assert(result.code.includes('letter-spacing:.06em!important'));
 assert(result.code.includes('@media(min-width:761px)'));
 assert(result.code.includes('aside.left-rail .rail-title'));
 assert.equal(result.mobileCSSUnchanged,true);
 assert.equal(result.routesChanged,false);
 assert.equal(result.providerCallsAdded,0);
});
test('fail closed on source changes',()=>{
 assert.throws(()=>patchSidebarSectionTypographyClient('other'),/NOT_ACTIVE_TEST/);
 assert.throws(()=>patchSidebarSectionTypographyClient(source+'\\n    mobileNav();\\n    b46RenameNativeLiveStatsHeading();'),/SOURCE_DRIFT/);
});
