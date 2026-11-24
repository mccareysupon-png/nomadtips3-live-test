import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchOuOldCardsClient,patchOuOldCardsWorker,B46_OU_ORIGINAL_PUBLIC_HISTORY_V1} from './patch-ou-original-history-cards-linked-test-20261124.mjs';
test('keep both the native card UI and new Adaptive analytics, only link original O/U history',()=>{
 const code=fs.readFileSync(new URL('./patch-ou-original-history-cards-linked-test-20261124.mjs',import.meta.url),'utf8');
 assert.equal(B46_OU_ORIGINAL_PUBLIC_HISTORY_V1,'B46_OU_ORIGINAL_PUBLIC_HISTORY_V1');
 assert(code.includes("mode==='ou'?10:MATCHES_PER_PAGE"));
 assert(code.includes('(Number(b.kickoff)||0)-(Number(a.kickoff)||0)'));
 assert(code.includes('b46AdaptiveData'));
 assert(code.includes('data-b46'));
 assert(code.includes('b46OuHistoryMount')===false);
 assert(code.includes('Probability —'));
 assert(code.includes('return [...prior,...generated]'));
 assert(code.includes('pages'));
 assert(!code.includes('await fetch('));
 assert(!code.includes('INSERT INTO'));
});
test('source drift rejects unsafe changes to other pages',()=>{
 assert.throws(()=>patchOuOldCardsClient('not a worker'),/EXPECTED_TEST/);
 assert.throws(()=>patchOuOldCardsWorker('no embedded client'),/EMBEDDED_PREMATCH/);
});
