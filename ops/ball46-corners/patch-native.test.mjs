import test from 'node:test';
import assert from 'node:assert/strict';
import {roundRobinWindow,patchNative} from './patch-native.mjs';

test('two verified Corner requests per scan; all eligible groups get scheduled',()=>{
  const keys=['a|corner','b|corner','c|corner','d|corner','e|corner'];
  const windows=[];
  for(let cursor=0;cursor<10;cursor+=2){
    const w=roundRobinWindow(keys,cursor,2);
    assert.ok(w.length<=2);
    windows.push(...w);
  }
  assert.deepEqual(new Set(windows),new Set(keys));
  assert.deepEqual(roundRobinWindow(keys,4,2),['e|corner','a|corner']);
});

test('dedupe total Corners OVER / UNDER requests at one fixture',()=>{
  assert.deepEqual(roundRobinWindow(['123|corner','123|corner','124|corner','125|corner'],0,2),['123|corner','124|corner']);
});
test('handle empty candidate list and disabled budget safely',()=>{
  assert.deepEqual(roundRobinWindow([],100,2),[]);
  assert.deepEqual(roundRobinWindow(['a'],0,0),[]);
  assert.throws(()=>roundRobinWindow(['a'],0,-1),/INVALID_BUDGET/);
});
test('patch fails closed on wrong source',()=>{
  assert.throws(()=>patchNative('legacy'),/NATIVE_SOURCE_TOO_SHORT/);
});
test('patch touches only native Corners schedule and Corners unresolved retry; keeps limits',()=>{
  const prefix=[
    'nomad343-engine-v5-best19-referee',
    'signal-ledger-v2-longterm',
    'var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2;',
    'var BALL46_CORNER_TICK_MAX_AGE_MS=90*1e3;',
    'var FINAL_RECHECK_MAX_PER_SCAN = 3;',
    'var FINAL_RECHECK_INTERVAL_MS = 15 * 60 * 1e3;',
    'function isVerifiedCornerMarket(key){}',
    'async function fetchVerifiedCornerOnly(){}',
    'CORNER_HISTORY_BUDGET','CORNER_LIVE_PRICE_UNVERIFIED'
  ].join('\n');
  const mock=prefix+'\n'+('/* deployed bundle filler */'.repeat(2800))+'\n'+
    'class Nomad343Engine { \n'+
    '  async scan() {\n'+
    ' const refereeScanOrder=orderedRefereeFixtures.slice(refereeRotationOffset).concat(orderedRefereeFixtures.slice(0,refereeRotationOffset));\n'+
    ' if (cornerTickRequests>=BALL46_CORNER_TICK_REQUESTS_PER_SCAN) {}\n'+
    '      await writeWorkingHistories(this.ctx, histories);\n}\n}\n'+
    'class NativeRecovery {\n  async autoReconcileMissingFinals() {\n'+
    '    if ((sig?.status !== "PENDING" && !phase2IsEarly(sig)) || !sig.fixtureId)continue;\n'+
    '    if ((sig?.status !== "PENDING" && !phase2IsEarly(sig)) || !sig.fixtureId)continue;\n'+
    ('let recoveryPadding=0;\n'.repeat(90))+
    '  }\n  async scan() { return super.scan(); }\n}\n';
  const patched=patchNative(mock);
  assert.match(patched,/b46CornerBudgetWindow.has\(cacheKey\)/);
  assert.match(patched,/b46CornerCursor\+Math.min/);
  assert.equal(patched.split('sig?.status === "UNRESOLVED"').length-1,2);
  assert.match(patched,/var BALL46_CORNER_TICK_REQUESTS_PER_SCAN=2/);
  assert.match(patched,/var BALL46_CORNER_TICK_MAX_AGE_MS=90\*1e3/);
  assert.match(patched,/FINAL_RECHECK_MAX_PER_SCAN = 3/);
  assert.equal((patched.match(/B46_CORNERS_FAIR_QUEUE_AND_RECHECK_20261018/g)||[]).length,1);
  assert.throws(()=>patchNative(patched),/ALREADY_PATCHED/);
});
