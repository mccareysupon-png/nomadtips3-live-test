import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptCentralHubLive,adaptCentralHubFullOdds,hubFixtureToLegacyProviderFixture,compareCentralHubToLegacyIds} from '../src/central-hub-adapter.js';

const fixture={
  fixtureId:'200162163',
  league:{name:'Test League'},home:{name:'Home FC'},away:{name:'Away FC'},minute:67,status:'2H',statusCode:'2H',score:{home:1,away:0},
  statistics:{attacks:{home:80,away:51},dangerousAttack:{home:44,away:20},shotsOn:{home:6,away:2},shotsOff:{home:7,away:3},corners:{home:5,away:2},possession:{home:61,away:39}},
  events:[{type:'goal',minute:53}],
  odds:{raw:{asian_handicap:{inplay:{line:-0.5,home:1.91,away:1.93}},goal_line:{inplay:{line:2.5,over:1.88,under:1.96}},'1x2':{inplay:{home:1.72,draw:3.8,away:5.1}}}},
  kickoffAt:'2026-09-13T01:00:00Z',observedAt:1789265000000,timestampKind:'hub_observed_at'
};

test('hub fixture is restored to the exact legacy provider field families used by 3.43',()=>{
  const out=hubFixtureToLegacyProviderFixture(fixture);
  assert.equal(out.id,'200162163');
  assert.equal(out.teams.home.name,'Home FC');
  assert.deepEqual(out.goals,{home:1,away:0});
  assert.deepEqual(out.corners,{home:5,away:2});
  assert.deepEqual(out.statistics.shots_on_target,{home:6,away:2});
  assert.deepEqual(out.statistics.shots_off_target,{home:7,away:3});
  assert.deepEqual(out.statistics.dangerous_attacks,{home:44,away:20});
  assert.equal(out.odds.asian_handicap.inplay.line,-0.5);
  assert.equal(out.odds.goal_line.inplay.line,2.5);
  assert.equal(out.odds['1x2'].inplay.home,1.72);
});

test('live adapter fails closed on stale Hub data',()=>{
  assert.throws(()=>adaptCentralHubLive({ok:true,cache:{stale:true},fixtures:[fixture]}),/CENTRAL_HUB_STALE/);
});

test('live adapter keeps upstream provider request count at zero for 3.43',()=>{
  const out=adaptCentralHubLive({ok:true,observedAt:1789265000000,cache:{stale:false,hit:true},fixtures:[fixture]});
  assert.equal(out.requests,0);
  assert.equal(out.hubRequests,1);
  assert.equal(out.fixtureCount,1);
  assert.equal(out.source,'5USD Central Hub');
});

test('full odds adapter preserves the exact Bet365 market root used by existing 3.43 price logic',()=>{
  const odds={asian_handicap:{inplay:{line:-0.5,home:1.91,away:1.93}},goal_line:{inplay:{line:2.5,over:1.88,under:1.96}},'1x2':{inplay:{home:1.72,draw:3.8,away:5.1}}};
  const out=adaptCentralHubFullOdds({ok:true,fixtureId:'200162163',cache:{stale:false},odds},'200162163');
  assert.strictEqual(out,odds);
  assert.equal(out.asian_handicap.inplay.home,1.91);
  assert.equal(out.goal_line.inplay.over,1.88);
  assert.equal(out['1x2'].inplay.draw,3.8);
});

test('full odds adapter fails closed on stale data and fixture mismatch',()=>{
  assert.throws(()=>adaptCentralHubFullOdds({ok:true,fixtureId:'1',cache:{stale:true},odds:{}},'1'),/CENTRAL_HUB_ODDS_STALE/);
  assert.throws(()=>adaptCentralHubFullOdds({ok:true,fixtureId:'2',cache:{stale:false},odds:{}},'1'),/CENTRAL_HUB_ODDS_FIXTURE_MISMATCH/);
});

test('fixture id comparison exposes migration mismatches instead of guessing',()=>{
  const diff=compareCentralHubToLegacyIds([{fixtureId:'1'},{fixtureId:'2'}],[{id:'2'},{id:'3'}]);
  assert.deepEqual(diff,{hub:2,legacy:2,shared:1,onlyHub:['1'],onlyLegacy:['3']});
});
