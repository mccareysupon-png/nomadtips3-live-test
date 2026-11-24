import test from 'node:test';
import assert from 'node:assert/strict';
import {patchPrematchNavigationScroll,patchPrematchScrollWorker,B46_PREMATCH_NAV_SCROLL_V1} from './patch-prematch-navigation-scroll-test-20261124.mjs';
const client="const routes = [];\nconst finish=()=>{\n syncPrematchViewport();\n panel.scrollTop=previousScroll;\n};";
test('route transitions reset scroll, refresh keeps current position',()=>{
 const next=patchPrematchNavigationScroll(client);
 assert(next.includes(B46_PREMATCH_NAV_SCROLL_V1));
 assert(next.includes('b46PrematchLastScrollRoute!==currentRoute'));
 assert(next.includes('panel.scrollTop=0'));
 assert(next.includes('panel.scrollTop=previousScroll'));
 assert(next.includes('window.scrollTo(0,0)'));
 assert.throws(()=>patchPrematchNavigationScroll(next),/ALREADY_INSTALLED/);
});
test('only the embedded client changes and source drift aborts',()=>{
 const worker='var prematchClientScript = '+JSON.stringify(client)+';\nconst otherBackendStuff = true;';
 const patched=patchPrematchScrollWorker(worker);
 assert(patched.worker.endsWith('const otherBackendStuff = true;'));
 assert(!patched.worker.includes('const otherBackendStuff = false;'));
 assert.throws(()=>patchPrematchNavigationScroll('x'),/SOURCE_DRIFT/);
});
