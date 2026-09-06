import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseNowgoal,enrichFeed,teamScore} from '../src/index.js';

const tc=(over={})=>({
  id:'tc1',league:'Hong Kong Premier League',home:'Hong Kong FC',away:'Lee Man FC',minute:45,score:[0,1],
  event:{snapshots:[
    {minute:44,observedAt:1000,attacks:[30,20],dangerous:[15,8],sot:[null,null],off:[null,null],corner:[2,1]},
    {minute:45,observedAt:2000,attacks:[33,22],dangerous:[17,9],sot:[null,null],off:[null,null],corner:[3,1]},
  ]},...over,
});
const n=(over={})=>({sourceMatchId:'3049317',home:'Hong Kong FC',away:'LeeMan',score:{home:0,away:1},stats:{shots_on_target:{home:4,away:2},shots_off_target:{home:3,away:5}},...over});

test('safe team normalization handles FC spacing and neutral HTML marker',()=>{
  assert.ok(teamScore('Lee Man FC','LeeMan')>.90);
  assert.ok(teamScore('Japan U20','Japan U20<font color=#880000>(N)</font>')>.90);
});

test('strict matcher accepts same HOME AWAY and exact score',()=>{
  const pick=chooseNowgoal(tc(),[n()]);
  assert.equal(pick.reason,'MATCHED');
  assert.equal(pick.match.sourceMatchId,'3049317');
});

test('strict matcher rejects score mismatch',()=>{
  const pick=chooseNowgoal(tc(),[n({score:{home:1,away:0}})]);
  assert.equal(pick.match,null);
});

test('strict matcher rejects reversed HOME AWAY',()=>{
  const pick=chooseNowgoal(tc(),[n({home:'Lee Man FC',away:'Hong Kong FC',score:{home:1,away:0}})]);
  assert.equal(pick.match,null);
});

test('bridge only fills SOT OFF and preserves TotalCorner-owned fields',()=>{
  const input={ok:true,matches:[tc()]};
  const out=enrichFeed(input,{ok:true,observedAt:2000,matches:[n()]},2000);
  const m=out.matches[0],latest=m.event.snapshots.at(-1);
  assert.deepEqual(latest.sot,[4,2]);
  assert.deepEqual(latest.off,[3,5]);
  assert.deepEqual(latest.attacks,[33,22]);
  assert.deepEqual(latest.dangerous,[17,9]);
  assert.deepEqual(latest.corner,[3,1]);
  assert.deepEqual(m.score,[0,1]);
  assert.equal(m.minute,45);
});

test('missing Shot Off remains null and is never fabricated',()=>{
  const source=n({stats:{shots_on_target:{home:4,away:2},shots_off_target:null}});
  const out=enrichFeed({ok:true,matches:[tc({id:'tc2'})]},{ok:true,observedAt:2000,matches:[source]},2000);
  const latest=out.matches[0].event.snapshots.at(-1);
  assert.deepEqual(latest.sot,[4,2]);
  assert.deepEqual(latest.off,[null,null]);
});

test('unmatched match is returned with original null SOT OFF',()=>{
  const out=enrichFeed({ok:true,matches:[tc({id:'tc3'})]},{ok:true,observedAt:2000,matches:[]},2000);
  const latest=out.matches[0].event.snapshots.at(-1);
  assert.deepEqual(latest.sot,[null,null]);
  assert.deepEqual(latest.off,[null,null]);
  assert.equal(out.bridge.unmatched,1);
});

test('bridge retains prior minute SOT OFF history for rolling deltas',()=>{
  const m44=tc({id:'tc-history',minute:44,score:[0,1],event:{snapshots:[{minute:44,observedAt:1000,attacks:[30,20],dangerous:[15,8],sot:[null,null],off:[null,null],corner:[2,1]}]}});
  enrichFeed({ok:true,matches:[m44]},{ok:true,observedAt:1000,matches:[n({stats:{shots_on_target:{home:2,away:1},shots_off_target:{home:1,away:4}}})]},1000);
  const m45=tc({id:'tc-history'});
  const out=enrichFeed({ok:true,matches:[m45]},{ok:true,observedAt:2000,matches:[n()]},2000);
  assert.deepEqual(out.matches[0].event.snapshots[0].sot,[2,1]);
  assert.deepEqual(out.matches[0].event.snapshots[0].off,[1,4]);
  assert.deepEqual(out.matches[0].event.snapshots[1].sot,[4,2]);
  assert.deepEqual(out.matches[0].event.snapshots[1].off,[3,5]);
});
