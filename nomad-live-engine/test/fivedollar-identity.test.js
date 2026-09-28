import test from 'node:test';
import assert from 'node:assert/strict';
import {applyShadowFixtureIds,buildFixtureIdentityBridge,scoreIdentityCandidate} from '../src/fivedollar-identity.js';

const legacy=(overrides={})=>({
  id:'legacy-1',sourceMatchId:'legacy-1',league:'Premier League',home:'Manchester United',away:'Chelsea',
  kickoffUtc:'2026-09-13T12:00:00Z',minute:63,score:{home:1,away:0},...overrides,
});
const five=(overrides={})=>({
  fixtureId:'5001',league:{name:'Premier League'},home:{name:'Manchester Utd'},away:{name:'Chelsea FC'},
  kickoffAt:Date.parse('2026-09-13T12:00:00Z'),minute:62,score:{home:1,away:0},boardState:'live',...overrides,
});

test('safe same-side identity maps legacy match to 5USD fixture',()=>{
  const result=scoreIdentityCandidate(legacy(),five());
  assert.equal(result.ok,true);
  assert.ok(result.confidence>=.82);
});

test('HOME/AWAY reversal never maps as a valid identity',()=>{
  const result=scoreIdentityCandidate(legacy(),five({home:{name:'Chelsea'},away:{name:'Manchester United'}}));
  assert.equal(result.ok,false);
});

test('senior vs youth identity fails closed',()=>{
  const result=scoreIdentityCandidate(legacy({home:'Arsenal'}),five({home:{name:'Arsenal U21'}}));
  assert.equal(result.ok,false);
  assert.equal(result.reason,'team_class_mismatch');
});

test('men vs women identity fails closed',()=>{
  const result=scoreIdentityCandidate(legacy({home:'Barcelona'}),five({home:{name:'Barcelona Women'}}));
  assert.equal(result.ok,false);
  assert.equal(result.reason,'team_class_mismatch');
});

test('same names with disagreeing current score fail closed',()=>{
  const result=scoreIdentityCandidate(legacy(),five({score:{home:0,away:1}}));
  assert.equal(result.ok,false);
  assert.equal(result.reason,'score_mismatch');
});

test('large live-minute disagreement fails closed',()=>{
  const result=scoreIdentityCandidate(legacy({minute:70}),five({minute:55}));
  assert.equal(result.ok,false);
  assert.equal(result.reason,'minute_mismatch');
});

test('bridge refuses ambiguous close candidates instead of guessing',()=>{
  const source=legacy({id:'x',sourceMatchId:'x',home:'United City',away:'Rovers'});
  const one=five({fixtureId:'a',home:{name:'United City'},away:{name:'Rovers'},league:{name:'Premier League'}});
  const two=five({fixtureId:'b',home:{name:'United City'},away:{name:'Rovers'},league:{name:'Premier League'}});
  const bridge=buildFixtureIdentityBridge([source],[one,two]);
  assert.equal(bridge.rows[0].status,'AMBIGUOUS');
  assert.equal(bridge.summary.matched,0);
  assert.equal(bridge.summary.ambiguous,1);
});

test('bridge keeps a prior validated fixture sticky when it still passes identity checks',()=>{
  const first=buildFixtureIdentityBridge([legacy()],[five()]);
  assert.equal(first.rows[0].status,'MATCHED');
  const second=buildFixtureIdentityBridge([legacy({minute:64})],[five({minute:64})],first.rows);
  assert.equal(second.rows[0].status,'MATCHED');
  assert.equal(second.rows[0].sticky,true);
  assert.equal(second.rows[0].fiveUsdFixtureId,'5001');
});

test('shadow application adds 5USD id without replacing legacy id',()=>{
  const bridge=buildFixtureIdentityBridge([legacy()],[five()]);
  const [mapped]=applyShadowFixtureIds([legacy()],bridge.rows);
  assert.equal(mapped.id,'legacy-1');
  assert.equal(mapped.sourceMatchId,'legacy-1');
  assert.equal(mapped.fiveUsdFixtureId,'5001');
  assert.ok(mapped.fiveUsdIdentityConfidence>=.82);
});
