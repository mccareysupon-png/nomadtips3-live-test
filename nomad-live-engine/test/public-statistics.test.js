import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicStatsEpoch,
  publicSignalKey,
  selectPublicStatsSignals,
  summarizePublicStats,
} from '../src/public-statistics.js';

const signal=(matchId,lockedAt,{settlement=null,odds=1.80}={})=>({matchId,lockedAt,odds,settlement});
const settled=(result,profit)=>({result,profit});

test('public stats epoch seeds only signals pending at epoch start',()=>{
  const oldSettled=signal('old-settled',100,{settlement:settled('WIN',0.8)});
  const pendingA=signal('pending-a',200);
  const pendingB=signal('pending-b',300);
  const epoch=createPublicStatsEpoch([oldSettled,pendingA,pendingB],1000);

  assert.equal(epoch.startedAt,1000);
  assert.deepEqual(new Set(epoch.seedKeys),new Set([publicSignalKey(pendingA),publicSignalKey(pendingB)]));
  assert.equal(epoch.seedKeys.includes(publicSignalKey(oldSettled)),false);
});

test('seeded pending remains in the epoch after settlement and new signals join automatically',()=>{
  const oldSettled=signal('old-settled',100,{settlement:settled('WIN',0.8)});
  const seededPending=signal('seeded',200);
  const epoch=createPublicStatsEpoch([oldSettled,seededPending],1000);

  const seededAfterSettlement={...seededPending,settlement:settled('LOSS',-1)};
  const atEpoch=signal('new-at-epoch',1000,{settlement:settled('PUSH',0)});
  const future=signal('future',1100);
  const scoped=selectPublicStatsSignals([oldSettled,seededAfterSettlement,atEpoch,future],epoch);

  assert.deepEqual(scoped.map(item=>item.matchId),['seeded','new-at-epoch','future']);
});

test('public summary uses only epoch records and keeps every record beyond the old 200 cap',()=>{
  const records=Array.from({length:205},(_,index)=>signal(`m${index}`,1000+index,{
    odds:1.5+(index%5)*0.1,
    settlement:index===0?settled('HALF WIN',0.25):index===1?settled('HALF LOSS',-0.5):index===2?settled('PUSH',0):null,
  }));
  const summary=summarizePublicStats(records);

  assert.equal(summary.totalSignals,205);
  assert.equal(summary.records.length,205);
  assert.equal(summary.settled,3);
  assert.equal(summary.wins,1);
  assert.equal(summary.losses,1);
  assert.equal(summary.pushes,1);
  assert.equal(summary.records[0].matchId,'m204');
  assert.equal(summary.records.at(-1).matchId,'m0');
});
