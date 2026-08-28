import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGoalooFlashPayload,
  parseGoalooFlashGraphEvent,
  parseGoalooFlashPoint
} from './goaloo-flashdata-parser.mjs';

// Captured from Goaloo public /flashdata/get?chid=2930886 on 2026-08-16.
// This is intentionally a small regression fixture, not a fabricated example.
const CHANGE_2930886 = "2930886^1^2^3^2026,7,16,14,08,51^^0^1^96,13,49^103,17,51^66,3^65,7^2^0^4^2^0^7^!685,9679,20,,3,98,,1,2,2949,,^!685,1,9679,20,98,^3,3,13206,1,90,6^!925,9679,0.95,0.12,2949,,!";

// Captured from Goaloo public /flashdata/get?chid=2960848 on 2026-08-16.
const CHANGE_2960848 = "2960848^0^4^3^2026,7,16,14,13,29^^0^3^116,9,46^111,18,54^71,5^74,11^0^0^2^1^0^5^!762,65431,22,,3,93,,0,4,2943,,^763,78143,21,,3,93,,0,4,2956,,^764,65431,22,,3,93,,0,4,2957,,^!763,1,78143,21,93,^!1087,65431,0.35,0.62,2943,,^1088,78143,0.35,0.62,2956,,^1089,65431,0.35,0.62,2957,,!";

test('parses Goaloo change schedule and associates dangerous attack point by eventId', () => {
  const [p] = parseGoalooFlashPayload(CHANGE_2930886);
  assert.equal(p.schedule.matchId, '2930886');
  assert.equal(p.schedule.homeScore, 1);
  assert.equal(p.schedule.awayScore, 2);
  assert.equal(p.schedule.state, 3);
  assert.equal(p.schedule.homeCorner, 4);
  assert.equal(p.schedule.awayCorner, 7);

  assert.equal(p.events.length, 1);
  assert.equal(p.events[0].eventType, 20);
  assert.equal(p.events[0].eventName, 'dangerous_attack');
  assert.equal(p.events[0].teamId, '9679');
  assert.equal(p.events[0].time, 98);
  assert.equal(p.events[0].eventId, '2949');

  assert.equal(p.points.length, 1);
  assert.equal(p.points[0].eventId, '2949');
  assert.equal(p.points[0].x, 0.95);
  assert.equal(p.points[0].y, 0.12);
});

test('parses multiple control/attack animation events without inventing stat buckets', () => {
  const [p] = parseGoalooFlashPayload(CHANGE_2960848);
  assert.deepEqual(p.events.map(x => [x.eventType, x.eventName, x.teamId]), [
    [22, 'control', '65431'],
    [21, 'attack', '78143'],
    [22, 'control', '65431']
  ]);
  assert.equal(p.statusEvents.length, 1);
  assert.equal(p.statusEvents[0].dataType, 1);
  assert.equal(p.statusEvents[0].eventType, 21);
  assert.equal(p.statusEvents[0].eventName, 'attack');
  assert.equal(p.points.length, 3);
  assert.deepEqual(p.points.map(x => x.eventId), ['2943', '2956', '2957']);
});

test('parses individual Goaloo graph and point rows defensively', () => {
  const e = parseGoalooFlashGraphEvent('741,7633,22,,3,95,,0,0,2900,,');
  assert.equal(e.eventName, 'control');
  assert.equal(e.eventId, '2900');
  const pt = parseGoalooFlashPoint('1302,7633,0,0,2900,,');
  assert.equal(pt.pointId, 1302);
  assert.equal(pt.teamId, '7633');
  assert.equal(pt.eventId, '2900');
});
