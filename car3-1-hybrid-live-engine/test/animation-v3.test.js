import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlashData,mergeAnimationFrames,handleAnimationRequest,EVENT_TYPES} from '../worker/src/animation-v3-source.js';

const full=[
  '2930884^cloud^16^,,^7633^53146^0^0^3^50^2026,7,16,14,11,26^^103,8,51^119,12,49^3^0^0^home.png^away.png^0^45,5^67,3^1^0^3^2^0^5^',
  'dist-a',
  'dist-b',
  '704,53146,21,,3,91,,0,0,2496,,^',
  '702,1,7633,21,91,^',
  '1244,53146,0.59,1,2496,,^'
].join('!');

const change=[
  '2930884^0^0^3^2026,7,16,14,11,26^^0^0^103,8,51^119,12,49^45,5^67,3^1^0^3^2^0^5^',
  '705,7633,20,,3,92,,0,0,2501,,^706,7633,28,,3,92,,0,0,2502,,^',
  '703,1,7633,20,92,^',
  '1245,7633,0.72,0.46,2501,,^1246,7633,0.91,0.51,2502,,^'
].join('!');

test('parses public Goaloo full flashdata metadata and source coordinates',()=>{
  const p=parseFlashData(full,{matchId:'2930884'});
  assert.equal(p.ok,true);
  assert.equal(p.homeTeamId,'7633');
  assert.equal(p.awayTeamId,'53146');
  assert.equal(p.events.length,1);
  assert.equal(p.events[0].team,'AWAY');
  assert.equal(p.events[0].type,'ATTACK');
  assert.equal(p.events[0].x,.59);
  assert.equal(p.events[0].y,1);
  assert.equal(p.events[0].coordinateSource,'SOURCE_XY');
});

test('parses incremental dangerous attack and shot using full metadata',()=>{
  const p=parseFlashData(change,{matchId:'2930884',homeTeamId:'7633',awayTeamId:'53146'});
  assert.equal(p.ok,true);
  assert.deepEqual(p.events.map(e=>e.type),['DANGEROUS ATTACK','SHOT ON TARGET']);
  assert.ok(p.events.every(e=>e.team==='HOME'));
  assert.equal(p.events[1].x,.91);
});

test('merges full and incremental frames without changing engine data',()=>{
  const f=parseFlashData(full,{matchId:'2930884'});
  const c=parseFlashData(change,{matchId:'2930884',homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId});
  const merged=mergeAnimationFrames(f,c);
  assert.equal(merged.events.length,3);
  assert.equal(merged.current.type,'SHOT ON TARGET');
  assert.equal(merged.current.id,706);
});

test('confirmed public client event codes stay explicit',()=>{
  assert.equal(EVENT_TYPES[20],'DANGEROUS ATTACK');
  assert.equal(EVENT_TYPES[21],'ATTACK');
  assert.equal(EVENT_TYPES[22],'POSSESSION');
  assert.equal(EVENT_TYPES[28],'SHOT ON TARGET');
  assert.equal(EVENT_TYPES[34],'CORNER');
});

test('animation endpoint rejects arbitrary non-numeric proxy ids before fetch',async()=>{
  const response=await handleAnimationRequest(new Request('https://car31.test/animation?id=not-a-match'),{},{});
  assert.equal(response.status,400);
  const p=await response.json();
  assert.equal(p.reason,'INVALID_MATCH_ID');
});

test('animation endpoint refuses ids outside current CAR 3.1 live feed',async()=>{
  const worker={fetch:async()=>new Response(JSON.stringify({ok:true,matches:[]}),{status:200,headers:{'content-type':'application/json'}})};
  const response=await handleAnimationRequest(new Request('https://car31.test/animation?id=2930884'),{},worker);
  assert.equal(response.status,404);
  const p=await response.json();
  assert.equal(p.reason,'MATCH_NOT_IN_CURRENT_CAR31_LIVE_FEED');
});
