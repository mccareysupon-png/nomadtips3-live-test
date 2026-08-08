import assert from 'node:assert/strict';
import { applyProductionLiveConfig, normalizeProductionLiveConfig } from '../cloudflare-worker/src/production-live-config.js';

const config = normalizeProductionLiveConfig({ minuteMin: 20, minuteMax: 80, fixturesMax: 2, teamFilter: 'nomad', sortMode: 'MINUTE_DESC' });
assert.equal(config.refreshSeconds, 60);
assert.equal(config.minuteMin, 20);
assert.equal(config.minuteMax, 80);

const matches = [
  { id: 1, minute: 25, home: 'NOMAD A', away: 'B', homeScore: 0, awayScore: 0 },
  { id: 2, minute: 75, home: 'C', away: 'NOMAD B', homeScore: 1, awayScore: 1 },
  { id: 3, minute: 90, home: 'NOMAD C', away: 'D', homeScore: 2, awayScore: 1 }
];
assert.deepEqual(applyProductionLiveConfig(matches, config).map(item => item.id), [2, 1]);
assert.deepEqual(applyProductionLiveConfig(matches, { ...config, engineEnabled: false }), []);
console.log('PASS: Car 1 production live configuration is normalized and isolated.');
