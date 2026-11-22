import test from 'node:test';
import assert from 'node:assert/strict';
import {patchPreMatchUnifiedPerformance} from './patch-prematch-unified-performance-test-20261122.mjs';
const src=String.raw`function perfSource(){
  if(mode==='btts'||mode==='all'){
   const rs=active?.stats??{};
   const settled=Number(rs.win||0)+Number(rs.loss||0);
   return {draw:0,loss:Number(rs.loss||0),units:Number(rs.units||0),staked:settled};
  }
}
function performancePanel(){
 const empty=mode==='btts';
 let runningStaked=0;
 runningStaked+=Number(row.stakedUnits||0);
 chart.append(title,el('strong','b46pm-performance-subtitle',empty?'Pre-Match · BTTS (no recorded results)':'Pre-Match · 1X2'));
}
const activeLedger=mode==='btts'?bttsLedger:ledger;`;
test('correct three shared-market graph titles and snapshot-derived ROI',()=>{
 const p=patchPreMatchUnifiedPerformance(src);
 assert.match(p.code,/Pre-Match · Total \(1X2 \+ BTTS\)/);
 assert.match(p.code,/stakedUnits\?\?row\.settled\?\?0/);
 assert.match(p.code,/const settled=Number\(rs\.settled\?\?/);
 assert.match(p.code,/draw:Number\(rs\.push\?\?rs\.draw\?\?0\)/);
 assert(!p.code.includes("empty?'Pre-Match · BTTS (no recorded results)':'Pre-Match · 1X2'"));
 assert(p.preservedOneX2ReceiverGraph);
 assert(p.preservedLedgers&&p.preservedCSS);
 assert.throws(()=>patchPreMatchUnifiedPerformance(p.code),/SOURCE_DRIFT/);
});
test('refuse unknown worker client rather than patch any global UI',()=>{
 assert.throws(()=>patchPreMatchUnifiedPerformance('function perfSource(){}'),/NOT_VERIFIED/);
});
