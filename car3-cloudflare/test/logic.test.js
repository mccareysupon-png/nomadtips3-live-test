import test from 'node:test';
import assert from 'node:assert/strict';
import { secondHalfFixtures, liveOddsByFixture, buildTargets, evaluateTarget, chunks } from '../src/logic.js';

const fixture = {
  fixture: { id: 1, status: { short: '2H', elapsed: 70 } },
  teams: { home: { id: 10, name: 'A' }, away: { id: 20, name: 'B' } },
  goals: { home: 1, away: 0 },
};
const odds = [{
  fixture: { id: 1 }, status: { stopped: false, blocked: false, finished: false },
  odds: [{ id: 59, name: 'Fulltime Result', values: [
    { value: 'Home', odd: '1.80', suspended: false },
    { value: 'Draw', odd: '3.00', suspended: false },
    { value: 'Away', odd: '4.20', suspended: false },
  ] }],
}];

test('ignores first half and keeps 2H 50-95', () => {
  assert.equal(secondHalfFixtures([fixture]).length, 1);
  const first = structuredClone(fixture); first.fixture.status = { short: '1H', elapsed: 40 };
  assert.equal(secondHalfFixtures([first]).length, 0);
});

test('reads live Fulltime Result id 59 schema', () => {
  const map = liveOddsByFixture(odds);
  assert.equal(map.get(1).sides.Home.odd, 1.8);
  assert.equal(map.get(1).sides.Away.odd, 4.2);
});

test('builds local home/away targets without per-fixture odds calls', () => {
  const targets = buildTargets([fixture], liveOddsByFixture(odds));
  assert.deepEqual(targets.map((x) => x.side), ['Home', 'Away']);
});

test('evaluates documented fixture statistics only', () => {
  const detail = { statistics: [{ team: { id: 10 }, statistics: [
    { type: 'Shots on Goal', value: 4 }, { type: 'Total Shots', value: 10 },
    { type: 'Corner Kicks', value: 5 }, { type: 'Ball Possession', value: '58%' },
  ] }] };
  const target = buildTargets([fixture], liveOddsByFixture(odds))[0];
  assert.equal(evaluateTarget(target, detail).pass, true);
});

test('chunks fixture ids by 20', () => {
  assert.deepEqual(chunks(Array.from({length: 41}, (_, i) => i + 1)).map((x) => x.length), [20,20,1]);
});
