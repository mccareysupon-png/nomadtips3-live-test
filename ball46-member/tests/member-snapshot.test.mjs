import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotCycle,snapshotKey,readSnapshot,publishSnapshot} from '../src/member-snapshot.js';

test('Bangkok noon cutoff keeps one cycle then rolls to new cycle',()=>{
  const before = snapshotCycle(Date.parse('2026-10-11T04:59:59Z'));
  const after = snapshotCycle(Date.parse('2026-10-11T05:00:00Z'));
  assert.equal(after.start-before.start,86400000);
  assert.equal(snapshotKey(after.start),'member:daily:v1:'+after.start);
});
test('Member read never invokes upstream; stale previous cycle unavailable',async()=>{
  let stored=null; let calls=0;
  const env={MEMBER_DAILY_SNAPSHOTS:{
    async get(){calls++;return stored;},
    async put(k,v){stored=JSON.parse(v);}
  }};
  const now=Date.parse('2026-10-11T05:10:00Z');
  const cycle=snapshotCycle(now);
  await publishSnapshot(env,async()=>({cycleStart:cycle.start,signalCount:2}),async()=>({fixtures:[]}),now);
  const data=await readSnapshot(env,now);
  assert.equal(data.daily.signalCount,2);
  assert.equal(calls,1);
  await assert.rejects(()=>readSnapshot(env,now+86400000),/SNAPSHOT_NOT_READY/);
});
test('Missing KV binding fails closed',async()=>{
  await assert.rejects(()=>readSnapshot({},Date.now()),/SNAPSHOT_BINDING_MISSING/);
});
test('Publisher aborts on cycle mismatch',async()=>{
  const env={MEMBER_DAILY_SNAPSHOTS:{async put(){throw Error('unexpected write');}}};
  await assert.rejects(()=>publishSnapshot(env,async()=>({cycleStart:0}),async()=>({fixtures:[]})),/SNAPSHOT_CYCLE_CHANGED/);
});
