import test from 'node:test';
import assert from 'node:assert/strict';
import {centralHubShadowEnabled,compareFullOddsRoots,runCentralHubLiveShadow,runCentralHubOddsShadow} from '../src/central-hub-shadow.js';

const response=body=>({ok:true,status:200,async text(){return JSON.stringify(body)}});

test('shadow mode is OFF by default and requires both mode and URL',()=>{
  assert.equal(centralHubShadowEnabled({}),false);
  assert.equal(centralHubShadowEnabled({CENTRAL_HUB_MODE:'shadow'}),false);
  assert.equal(centralHubShadowEnabled({CENTRAL_HUB_URL:'https://hub.test'}),false);
  assert.equal(centralHubShadowEnabled({CENTRAL_HUB_MODE:'shadow',CENTRAL_HUB_URL:'https://hub.test'}),true);
});

test('OFF mode performs zero Hub fetches',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw new Error('must not run')};
  const live=await runCentralHubLiveShadow({},[{id:'1'}],fetchImpl);
  const odds=await runCentralHubOddsShadow('1',{}, {},fetchImpl);
  assert.equal(calls,0);
  assert.equal(live.enabled,false);
  assert.equal(odds.enabled,false);
  assert.equal(live.authority,'DIRECT_5USD');
  assert.equal(odds.authority,'DIRECT_5USD');
});

test('live shadow reports fixture ID differences but never becomes authority',async()=>{
  const fetchImpl=async()=>response({ok:true,observedAt:100,cache:{stale:false,hit:true},fixtures:[{fixtureId:'2',home:{name:'H'},away:{name:'A'},league:{name:'L'},statistics:{},score:{}}]});
  const result=await runCentralHubLiveShadow({CENTRAL_HUB_MODE:'shadow',CENTRAL_HUB_URL:'https://hub.test'},[{id:'1'},{id:'2'}],fetchImpl);
  assert.equal(result.ok,true);
  assert.equal(result.authority,'DIRECT_5USD');
  assert.equal(result.usedForSignals,false);
  assert.deepEqual(result.ids.onlyHub,[]);
  assert.deepEqual(result.ids.onlyLegacy,['1']);
});

test('Hub errors are telemetry only and do not throw into the engine',async()=>{
  const fetchImpl=async()=>{throw new Error('hub down')};
  const result=await runCentralHubLiveShadow({CENTRAL_HUB_MODE:'shadow',CENTRAL_HUB_URL:'https://hub.test'},[{id:'1'}],fetchImpl);
  assert.equal(result.ok,false);
  assert.match(result.error,/hub down/);
  assert.equal(result.authority,'DIRECT_5USD');
  assert.equal(result.usedForSignals,false);
});

test('full market comparator covers AH goal line and 1X2',()=>{
  const a={asian_handicap:{inplay:{line:-0.5,home:1.9,away:1.95}},goal_line:{inplay:{line:2.5,over:1.8,under:2}},'1x2':{inplay:{home:1.7,draw:3.8,away:5}}};
  assert.equal(compareFullOddsRoots(a,structuredClone(a)).matched,true);
  const b=structuredClone(a);b.goal_line.inplay.over=1.81;
  assert.equal(compareFullOddsRoots(a,b).matched,false);
});

test('odds shadow mismatch is reported but direct remains authority',async()=>{
  const direct={asian_handicap:{inplay:{line:-0.5,home:1.9,away:1.95}}};
  const hub={asian_handicap:{inplay:{line:-0.5,home:1.91,away:1.95}}};
  const fetchImpl=async()=>response({ok:true,fixtureId:'9',cache:{stale:false},odds:hub});
  const result=await runCentralHubOddsShadow('9',direct,{CENTRAL_HUB_MODE:'shadow',CENTRAL_HUB_URL:'https://hub.test'},fetchImpl);
  assert.equal(result.ok,true);
  assert.equal(result.matched,false);
  assert.equal(result.authority,'DIRECT_5USD');
  assert.equal(result.usedForSignals,false);
});
