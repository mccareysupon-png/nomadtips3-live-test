import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {patchOuSidebarHistoryClient,patchOuSidebarHistoryWorker,
 B46_OU_SIDEBAR_HISTORY_V1} from './patch-ou-sidebar-history-test-v1-20261124.mjs';
test('new TEST O/U UI keeps 10 kickoff-ordered records per page and portable frontend shell',()=>{
 const src=fs.readFileSync(new URL('./patch-ou-sidebar-history-test-v1-20261124.mjs',import.meta.url),'utf8');
 assert(src.includes('const pageSize=10,pages='));
 assert(src.includes('(Number(b.kickoff)||0)-(Number(a.kickoff)||0)'));
 assert(src.includes("['KICKOFF','MATCH','FORMULA','PICK','ODDS','BOOK','RESULT','FT']"));
 assert(src.includes('aria-current'));
 assert(src.includes("event.preventDefault();event.stopPropagation()"));
 assert(!src.includes('FULL_MARKET.fetch('));
 assert(!src.includes('HUB.fetch('));
 assert(!src.includes('INSERT INTO'));
 assert.equal(B46_OU_SIDEBAR_HISTORY_V1,'B46_OU_SIDEBAR_HISTORY_V1');
});
test('source guard rejects unrelated worker code to avoid cross-market patches',()=>{
 assert.throws(()=>patchOuSidebarHistoryClient('bad'),/EXPECTED_PREMATCH_OVERVIEW/);
 assert.throws(()=>patchOuSidebarHistoryWorker('bad'),/CLIENT_MISSING/);
});
