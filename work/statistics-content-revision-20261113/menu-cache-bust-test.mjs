import assert from 'node:assert/strict';
import {addAssetVersion} from './menu-cache-bust.mjs';
const original = [
  '<script src="/ui-sync-fixes-343-v2.js"></script>',
  "<script src='ui-sync-fixes-343-v2.js?v=4'></script>",
  '<script src="./ui-sync-fixes-343-v2.js#ready"></script>',
  '<script src="/ui-sync-fixes-343-v2.js.bak"></script>',
  '<script src="/other.js"></script>',
].join('\\n');
const next=addAssetVersion(original,'/ui-sync-fixes-343-v2.js','b46_menu','abc123');
assert.equal(next.matches,3);
assert(next.html.includes('src="/ui-sync-fixes-343-v2.js?b46_menu=abc123"'));
assert(next.html.includes("src='ui-sync-fixes-343-v2.js?v=4&b46_menu=abc123'"));
assert(next.html.includes('src="./ui-sync-fixes-343-v2.js?b46_menu=abc123#ready"'));
assert(next.html.includes('src="/ui-sync-fixes-343-v2.js.bak"'));
assert(next.html.includes('src="/other.js"'));
assert.deepEqual(addAssetVersion('<script src="/other.js"></script>','/ui-sync-fixes-343-v2.js','b46_menu','abc123'),{html:'<script src="/other.js"></script>',matches:0});
assert.equal(addAssetVersion('<script src="/ui-sync-fixes-343-v2.js?v=2"></script>','/ui-sync-fixes-343-v2.js','b46_menu','a').matches,1);
console.log('MENU_CACHE_BUST_TEST_OK: 7 conditions');
