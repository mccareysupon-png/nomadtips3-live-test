import assert from 'node:assert/strict';

import { startOfThaiCycle } from '../cloudflare-worker/src/car3-audit-entry.js';

const cases = [
  ['before noon uses the previous cycle', '2026-08-11T04:59:59.999Z', '2026-08-10T05:00:00.000Z'],
  ['noon starts a new cycle', '2026-08-11T05:00:00.000Z', '2026-08-11T05:00:00.000Z'],
  ['evening remains in the noon cycle', '2026-08-11T15:18:15.401Z', '2026-08-11T05:00:00.000Z']
];

for (const [name, input, expected] of cases) {
  const actual = new Date(startOfThaiCycle(Date.parse(input), 12)).toISOString();
  assert.equal(actual, expected, name);
}

console.log('Car 3 Daily Ten audit cycle tests passed.');
