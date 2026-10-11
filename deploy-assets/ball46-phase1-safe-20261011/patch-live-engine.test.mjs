import assert from 'node:assert/strict';
import { patchPhase1LiveEngine } from './patch-live-engine.mjs';

// Deliberately tiny representative fragment. This tests safe string transforms,
// NOT actual production behavior or settlement integration.
const fixture = [
  'var FINAL_RECONCILE_VERSION = "missing-final-direct-v1";',
  'var STAT_LEDGER_VERSION = "LEDGER_V2";',
  'var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 45 * 60 * 1e3;',
  'async autoReconcileMissingFinals() {',
  '  if (boardIds.has(id)) continue;',
  '  const candidates = [...groups.entries()].filter(([id]) => at - Number(state[id]?.checkedAt || 0) >= FINAL_RECHECK_INTERVAL_MS).slice(0, FINAL_RECHECK_MAX_PER_SCAN);',
  '  if (!response.ok) throw new Error("FINAL_HTTP_" + response.status);',
  '  state[fixtureId] = { checkedAt: at, state: "ERROR", error: String(e?.message || e).slice(0, 160) };',
  '}',
  'async compactWorkingSignalsAfterLedger() {}'
].join('\n');

const patched = patchPhase1LiveEngine(fixture);
assert.match(patched, /FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;/);
assert.doesNotMatch(patched, /if \(boardIds\.has\(id\)\) continue;/);
assert.match(patched, /observedFixture && isLive\(observedFixture\)/);
assert.match(patched, /BALL46_FINAL_RECHECK_MAX_PER_SCAN/);
assert.match(patched, /retryAfterAt/);
assert.match(patched, /FINAL_HTTP_429/);
assert.throws(() => patchPhase1LiveEngine(patched), /REMOVE_45_MIN_SIGNAL_AGE/, 'must not apply twice');
assert.throws(() => patchPhase1LiveEngine('unrelated source'), /ACTIVE_WORKER_BASELINE_MISMATCH/);

console.log('PASS: 6 source transforms + fail-closed replay/mismatch safeguards (synthetic source only)');
