import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAR31_DEFAULT_CONFIG,
  ENGINE3_BASE_DEFAULTS,
  configSummary,
  normalizeCar31Config,
  validateCar31Config
} from '../src/config.js';

test('CAR 3.1 keeps Engine 3 core defaults as its baseline', () => {
  for (const key of [
    'side','minuteMin','minuteMax','oddsMin','ahMin','momentumMin',
    'attackEvidenceEnabled','goalGapLimited','maxGoalGap','confirmationRounds'
  ]) {
    assert.equal(CAR31_DEFAULT_CONFIG[key], ENGINE3_BASE_DEFAULTS[key]);
  }
});

test('normalizer supports expanded CAR 3.1 source and OU options', () => {
  const config = normalizeCar31Config({
    market: 'ou', ouDirection: 'under', ouLine: '3.25', sourcePrimary: 'goaloo',
    sourceRefreshSeconds: 5, matchConfidenceMin: 101
  });
  assert.equal(config.market, 'OU');
  assert.equal(config.ouDirection, 'UNDER');
  assert.equal(config.ouLine, 3.25);
  assert.equal(config.sourcePrimary, 'GOALOO');
  assert.equal(config.sourceRefreshSeconds, 10);
  assert.equal(config.matchConfidenceMin, 100);
});

test('strict evidence validation rejects impossible requirement', () => {
  const result = validateCar31Config({
    attackEvidenceEnabled: true,
    attackEvidenceDangerousAttacksEnabled: true,
    attackEvidenceShotsEnabled: false,
    attackEvidenceShotsOnTargetEnabled: false,
    attackEvidenceCornersEnabled: false,
    attackEvidenceRequirement: '3'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /เปิดอยู่เพียง 1/);
});

test('strict evidence validation rejects all evidence sub-rules off', () => {
  const result = validateCar31Config({
    attackEvidenceEnabled: true,
    attackEvidenceDangerousAttacksEnabled: false,
    attackEvidenceShotsEnabled: false,
    attackEvidenceShotsOnTargetEnabled: false,
    attackEvidenceCornersEnabled: false
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /ไม่มี Evidence/);
});

test('summary exposes the core runtime choices', () => {
  const summary = configSummary({ side: 'BOTH', minuteMin: 55, minuteMax: 88, market: 'AH', momentumMin: 67 });
  assert.match(summary, /BOTH/);
  assert.match(summary, /55-88/);
  assert.match(summary, /AH/);
  assert.match(summary, /67%/);
});
