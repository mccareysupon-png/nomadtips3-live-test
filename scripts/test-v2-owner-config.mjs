import assert from 'node:assert/strict';
import { normalizeV2OwnerConfig } from '../cloudflare-worker/src/v2-storage.js';
import { handleOwnerPage } from '../cloudflare-worker/src/v2-owner-page.js';

const config = normalizeV2OwnerConfig({
  side: 'both', minuteMin: 50, minuteMax: 89, market: 'ah', oddsMin: 1.2,
  ahMin: 0.75, momentumMin: 10, attackEvidenceEnabled: false,
  confirmationRounds: 1, signalLimitEnabled: true, maxSignalsPerDay: 10
});

assert.equal(config.side, 'BOTH');
assert.equal(config.minute_min, 50);
assert.equal(config.minute_max, 89);
assert.equal(config.market, 'AH');
assert.equal(config.odds_min, 1.2);
assert.equal(config.ah_min, 0.75);
assert.equal(config.momentum_min, 10);
assert.equal(config.attack_evidence_enabled, false);
assert.equal(config.confirmation_rounds, 1);
assert.equal(config.signal_limit_enabled, false);
assert.equal(config.signal_limit, null);
assert.equal(config.signal_limit_policy, 'UNLIMITED');
assert.equal(config.statistics_enabled, true);
assert.equal(config.live_odds_enabled, true);

const page = handleOwnerPage(new Request('https://bot-owner.nomadtips3.com/'));
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /UNLIMITED/);
assert.match(html, /PAPER_ONLY/);
assert.match(html, /\/v2\/owner\/status/);

console.log('V2 owner configuration and dashboard tests passed.');
