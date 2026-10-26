import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeFinishedHistory,buildFromFinishedLedger} from './finished-ledger.mjs';
const p=JSON.parse(readFileSync(new URL('../form-last5-20261025/real-history-fixture.json',import.meta.url),'utf8'));
test('retain immutable historical finals from authenticated captured 5USD results',()=>{
 const records=p.provider.flatMap(x=>x.data.data),first=mergeFinishedHistory([],records);
 const again=mergeFinishedHistory(first,records);
 assert.equal(first.length,again.length);
 const out=buildFromFinishedLedger({board:{ok:true,stale:false,fixtures:[p.fixture]},history:again,revision:'board-1'});
 assert.equal(out.quality.full,1);assert.equal(out.providerRequests,0);
});
test('reject mismatched FT corrections instead of silent overwrite',()=>{
 const x=p.provider[0].data.data[0],other={...x,goals:{...x.goals,home:x.goals.home+1}};
 assert.throws(()=>mergeFinishedHistory([x],[other]),/CONFLICTING_FINAL_RESULT/);
});
test('refuse stale board or retention truncation',()=>{
 const history=mergeFinishedHistory([],p.provider.flatMap(x=>x.data.data));
 assert.throws(()=>mergeFinishedHistory([],history,{maxRecords:1}),/FT_RETENTION_LIMIT/);
 assert.throws(()=>buildFromFinishedLedger({board:{ok:true,stale:true,fixtures:[p.fixture]},history,revision:'board-1'}),/BOARD_UNAVAILABLE/);
});
