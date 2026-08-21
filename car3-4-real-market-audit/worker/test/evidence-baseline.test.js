import test from 'node:test';
import assert from 'node:assert/strict';
import {baselineFor} from '../src/upgrade.js';

test('CAR 3.4 evidence baseline can assemble metrics across partial snapshots',()=>{
  const snapshots=[
    {matches:[{id:'m1',minute:60,stats:{
      dangerous_attacks:{home:10,away:6},
      shots_on_target:{home:2,away:1}
    }}]},
    {matches:[{id:'m1',minute:62,stats:{
      shots:{home:4,away:3},
      corners:{home:3,away:2}
    }}]}
  ];
  const current={
    dangerous_attacks:{home:13,away:7},
    shots:{home:5,away:4},
    shots_on_target:{home:3,away:1},
    corners:{home:4,away:2}
  };
  assert.deepEqual(
    baselineFor('m1','HOME',snapshots,{minuteMin:60},current),
    {dangerous:10,shots:4,sot:2,corners:3}
  );
});

test('CAR 3.4 only falls back to current value for a metric with no baseline yet',()=>{
  const snapshots=[{matches:[{id:'m1',minute:61,stats:{dangerous_attacks:{home:8,away:4}}}]}];
  const current={
    dangerous_attacks:{home:11,away:5},
    shots:{home:6,away:3},
    shots_on_target:{home:2,away:1},
    corners:{home:5,away:2}
  };
  assert.deepEqual(
    baselineFor('m1','HOME',snapshots,{minuteMin:60},current),
    {dangerous:8,shots:6,sot:2,corners:5}
  );
});
