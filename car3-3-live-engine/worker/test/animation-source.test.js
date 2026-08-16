import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFlashData,mergeAnimationFrames,handleAnimationRequest} from '../src/animation-source.js';

const full=[
  '2930884^cloud^16^,,^7633^53146^0^0^3^50^2026,7,16,14,11,26^^103,8,51^119,12,49^3^0^0^home.png^away.png^0^45,5^67,3^1^0^3^2^0^5^',
  'dist-a','dist-b',
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

test('full flashdata keeps real away source XY',()=>{
  const parsed=parseFlashData(full,{matchId:'2930884'});
  assert.equal(parsed.ok,true);
  assert.equal(parsed.homeTeamId,'7633');
  assert.equal(parsed.awayTeamId,'53146');
  assert.equal(parsed.events[0].team,'AWAY');
  assert.equal(parsed.events[0].type,'ATTACK');
  assert.equal(parsed.events[0].x,.59);
  assert.equal(parsed.events[0].y,1);
  assert.equal(parsed.events[0].coordinateSource,'SOURCE_XY');
});

test('change flashdata maps home events to exact source XY',()=>{
  const parsed=parseFlashData(change,{matchId:'2930884',homeTeamId:'7633',awayTeamId:'53146'});
  assert.equal(parsed.ok,true);
  assert.equal(parsed.events.at(-1).team,'HOME');
  assert.equal(parsed.events.at(-1).type,'SHOT ON TARGET');
  assert.equal(parsed.events.at(-1).x,.91);
  assert.equal(parsed.events.at(-1).y,.51);
});

test('merge keeps newest source event as current',()=>{
  const a=parseFlashData(full,{matchId:'2930884'});
  const b=parseFlashData(change,{matchId:'2930884',homeTeamId:a.homeTeamId,awayTeamId:a.awayTeamId});
  const merged=mergeAnimationFrames(a,b);
  assert.equal(merged.current.id,706);
  assert.equal(merged.current.x,.91);
  assert.equal(merged.current.y,.51);
});

test('invalid animation id is rejected before any source request',async()=>{
  const response=await handleAnimationRequest(new Request('https://local/animation?id=not-a-match'),{});
  assert.equal(response.status,400);
  const payload=await response.json();
  assert.equal(payload.reason,'INVALID_MATCH_ID');
});

test('animation route rejects match outside current CAR 3.3 live feed',async()=>{
  const env={CAR33_STATE:{
    idFromName:()=>({}),
    get:()=>({fetch:async()=>new Response(JSON.stringify({engine:'CAR 3.3',matches:[]}))})
  }};
  const response=await handleAnimationRequest(new Request('https://local/animation?id=2930884'),env);
  assert.equal(response.status,404);
  const payload=await response.json();
  assert.equal(payload.reason,'MATCH_NOT_IN_CURRENT_CAR33_LIVE_FEED');
});
