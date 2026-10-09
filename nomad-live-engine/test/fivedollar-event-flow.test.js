import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIVEUSD_EVENT_FLOW_WEIGHTS,
  appendFiveUsdEventFlowHistory,
  buildFiveUsdEventFlow,
  buildFiveUsdEventFlowSeries,
  flowSnapshotFromFixture,
  rawFiveUsdMomentum,
} from '../src/fivedollar-event-flow.js';

const fixture=(minute,stats={},id='100')=>({
  fixtureId:id,boardState:'live',minute,
  stats:{
    attacks:{home:0,away:0},dangerousAttack:{home:0,away:0},shotsOn:{home:0,away:0},
    shotsOff:{home:0,away:0},corners:{home:0,away:0},possession:{home:50,away:50},
    ...stats,
  },
});

test('ports exact 3.43 Event Flow weights',()=>{
  assert.deepEqual(FIVEUSD_EVENT_FLOW_WEIGHTS,{
    dangerousAttacks:30,shotsOnTarget:25,attacks:20,shotsOffTarget:10,corners:10,possession:5,
  });
});

test('5USD detector metric names map into 3.43 Event Flow metric names',()=>{
  const snap=flowSnapshotFromFixture(fixture(12,{
    attacks:{home:21,away:15},dangerousAttack:{home:9,away:5},shotsOn:{home:3,away:1},
    shotsOff:{home:4,away:2},corners:{home:2,away:1},possession:{home:57,away:43},
  }),1000);
  assert.deepEqual(snap.attacks,{home:21,away:15});
  assert.deepEqual(snap.dangerousAttacks,{home:9,away:5});
  assert.deepEqual(snap.shotsOnTarget,{home:3,away:1});
  assert.deepEqual(snap.shotsOffTarget,{home:4,away:2});
  assert.deepEqual(snap.corners,{home:2,away:1});
  assert.deepEqual(snap.possession,{home:57,away:43});
});

test('same match minute replaces prior sample so 3-second engine cannot bloat chart history',()=>{
  let history=[];
  history=appendFiveUsdEventFlowHistory(history,fixture(10,{attacks:{home:10,away:8}}),1000);
  history=appendFiveUsdEventFlowHistory(history,fixture(10,{attacks:{home:12,away:9}}),4000);
  history=appendFiveUsdEventFlowHistory(history,fixture(11,{attacks:{home:13,away:10}}),64_000);
  assert.equal(history.length,2);
  assert.equal(history[0].minute,10);
  assert.equal(history[0].at,4000);
  assert.equal(history[0].attacks.home,12);
  assert.equal(history[1].minute,11);
});

test('HOME and AWAY momentum are independent 1-100 intensities, not forced to sum to 100',()=>{
  const previous=flowSnapshotFromFixture(fixture(10,{
    attacks:{home:10,away:10},dangerousAttack:{home:5,away:5},shotsOn:{home:1,away:1},
    shotsOff:{home:1,away:1},corners:{home:1,away:1},possession:{home:50,away:50},
  }),0);
  const current=flowSnapshotFromFixture(fixture(15,{
    attacks:{home:24,away:24},dangerousAttack:{home:13,away:13},shotsOn:{home:3,away:3},
    shotsOff:{home:4,away:4},corners:{home:3,away:3},possession:{home:60,away:60},
  }),300_000);
  const home=rawFiveUsdMomentum(current,previous,'home');
  const away=rawFiveUsdMomentum(current,previous,'away');
  assert.equal(home,away);
  assert.ok(home>50);
  assert.notEqual(Math.round((home+away)*10)/10,100);
});

test('counter regression fails only that metric instead of inventing negative intensity',()=>{
  const previous=flowSnapshotFromFixture(fixture(10,{
    attacks:{home:20,away:10},dangerousAttack:{home:5,away:5},shotsOn:{home:1,away:1},
    shotsOff:{home:1,away:1},corners:{home:1,away:1},possession:{home:50,away:50},
  }),0);
  const current=flowSnapshotFromFixture(fixture(15,{
    attacks:{home:18,away:12},dangerousAttack:{home:7,away:7},shotsOn:{home:2,away:2},
    shotsOff:{home:2,away:2},corners:{home:2,away:2},possession:{home:52,away:48},
  }),300_000);
  assert.ok(rawFiveUsdMomentum(current,previous,'home')!==null);
});

test('insufficient available metric weight fails closed instead of inventing a flow value',()=>{
  const previous={at:0,minute:1,attacks:{home:1,away:1}};
  const current={at:60_000,minute:2,attacks:{home:2,away:2}};
  assert.equal(rawFiveUsdMomentum(current,previous,'home'),null);
  assert.equal(rawFiveUsdMomentum(current,previous,'away'),null);
});

test('series preserves match minutes and emits smoothed 0-100 HOME/AWAY points',()=>{
  const rows=[
    flowSnapshotFromFixture(fixture(1,{attacks:{home:1,away:1},dangerousAttack:{home:0,away:0}}),0),
    flowSnapshotFromFixture(fixture(2,{attacks:{home:4,away:2},dangerousAttack:{home:2,away:1}}),60_000),
    flowSnapshotFromFixture(fixture(3,{attacks:{home:6,away:5},dangerousAttack:{home:3,away:3}}),120_000),
  ];
  const series=buildFiveUsdEventFlowSeries(rows);
  assert.deepEqual(series.map(row=>row.minute),[1,2,3]);
  assert.equal(series[0].home,null);
  assert.ok(series[1].home>=1&&series[1].home<=100);
  assert.ok(series[1].away>=1&&series[1].away<=100);
  assert.ok(series[2].home>=1&&series[2].home<=100);
});

test('full builder keeps only live fixtures and exposes chart axis 0-100 contract',()=>{
  const live=fixture(20,{attacks:{home:10,away:9},dangerousAttack:{home:5,away:4}},'1');
  const waiting={...fixture(0,{},'2'),boardState:'scheduled'};
  let built=buildFiveUsdEventFlow([live,waiting],{},1000);
  built=buildFiveUsdEventFlow([
    {...live,minute:21,stats:{...live.stats,attacks:{home:13,away:11},dangerousAttack:{home:7,away:5}}},
    waiting,
  ],built.history,61_000);
  assert.deepEqual(Object.keys(built.flows),['1']);
  assert.deepEqual(built.flows['1'].axis,{x:'MATCH_MINUTE',yMin:0,yMax:100});
  assert.equal(built.flows['1'].independentSides,true);
  assert.equal(built.flows['1'].historyPoints,2);
});
