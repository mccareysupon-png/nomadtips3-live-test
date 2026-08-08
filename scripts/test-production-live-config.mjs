import assert from 'node:assert/strict';
import { normalizeConditionConfig } from '../cloudflare-worker/src/condition-config.js';

const production = normalizeConditionConfig({
  side: 'BOTH', minuteMin: 60, minuteMax: 89, market: 'AH',
  oddsMin: 1.10, oddsMax: null, ahMin: 1, ahMax: null,
  momentumMin: 39, confirmationRounds: 1,
  goalGapLimited: false, signalLimitEnabled: false
});
assert.equal(production.side, 'BOTH');
assert.equal(production.minuteMax, 89);
assert.equal(production.market, 'AH');
assert.equal(production.momentumMin, 39);
assert.equal(production.confirmationRounds, 1);
console.log('PASS: Car 1 production condition settings normalize independently.');
