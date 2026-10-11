#!/usr/bin/env node
/**
 * Ball46 Phase 1: guarded OFFLINE source-only patch for deployed Engine 343.
 * DOES NOT access Cloudflare, GitHub, provider APIs or deploy anything.
 * Usage: node patch-live-engine.mjs <exported-active-worker.js> <output.js>
 * Requires a verified export of the ACTIVE Worker; legacy branches are unsafe.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function replaceOnce(input, search, replacement, label) {
  const matches = [...input.matchAll(new RegExp(search.source, search.flags.includes('g') ? search.flags : search.flags + 'g'))];
  if (matches.length !== 1) throw new Error(label + ': expected one occurrence; found ' + matches.length);
  return input.replace(search, replacement);
}

export function patchPhase1LiveEngine(source) {
  if (!source.includes('missing-final-direct-v1')
      || !source.includes('STAT_LEDGER_VERSION')
      || !source.includes('async autoReconcileMissingFinals()')
      || !source.includes('async compactWorkingSignalsAfterLedger()')) {
    throw new Error('ACTIVE_WORKER_BASELINE_MISMATCH: require verified active recovery+ledger worker');
  }
  let out = source;
  // No minimum Signal age; finished is a fixture property, not Signal age.
  out = replaceOnce(out,
    /var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 45 \* 60 \* 1e3;/,
    'var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;',
    'REMOVE_45_MIN_SIGNAL_AGE');

  // Normal LIVE fixtures remain on ordinary scan. UNKNOWN or finished fixtures
  // on the board must not be excluded from direct reconciliation.
  out = replaceOnce(out,
    /if \(boardIds\.has\(id\)\) continue;/,
    'const observedFixture = (board.fixtures || []).find((f) => String(f?.fixtureId ?? f?.id ?? "") === id);\n      if (observedFixture && isLive(observedFixture)) continue;',
    'DO_NOT_SKIP_FINISHED_OR_UNKNOWN_BOARD_FIXTURES');

  // Default 3 per scan stays conservative until actual quota has been checked.
  // Ops can configure a bounded value after measuring all account-wide traffic.
  out = replaceOnce(out,
    /\.slice\(0, FINAL_RECHECK_MAX_PER_SCAN\);/,
    '.slice(0, Math.min(12, Math.max(1, Math.trunc(Number(this.env.BALL46_FINAL_RECHECK_MAX_PER_SCAN || FINAL_RECHECK_MAX_PER_SCAN)))));',
    'BOUNDED_CONFIGURABLE_FT_QUEUE');

  // Capture numeric or HTTP-date Retry-After and preserve it during catch.
  out = replaceOnce(out,
    /if \(!response\.ok\) throw new Error\([^;]+\);/,
    [
      'if (response.status === 429) {',
      '          const h = response.headers.get("retry-after");',
      '          const secs = h !== null ? Number(h) : NaN;',
      '          const date = h ? Date.parse(h) : NaN;',
      '          const retryAt = Number.isFinite(secs) && secs >= 0 ? at + secs * 1e3 : Number.isFinite(date) ? date : at + FINAL_RECHECK_INTERVAL_MS;',
      '          state[fixtureId] = { ...state[fixtureId], retryAfterAt: Math.max(at + 1e3, retryAt) };',
      '        }',
      '        if (!response.ok) throw new Error("FINAL_HTTP_" + response.status);'
    ].join('\n        '),
    'CAPTURE_429_RETRY_AFTER');

  out = replaceOnce(out,
    /state\[fixtureId\] = \{ checkedAt: at, state: "ERROR", error: String\(e\?\.message \|\| e\)\.slice\(0, 160\) \};/,
    'state[fixtureId] = { ...state[fixtureId], checkedAt: at, state: "ERROR", error: String(e?.message || e).slice(0, 160) };',
    'PRESERVE_429_RETRY_AFTER');

  out = replaceOnce(out,
    /\.filter\(\(\[id\]\) => at - Number\(state\[id\]\?\.checkedAt \|\| 0\) >= FINAL_RECHECK_INTERVAL_MS\)/,
    '.filter(([id]) => { const previous = state[id] || {}; if (previous.error === "FINAL_HTTP_429" && Number(previous.retryAfterAt || 0) > 0) return at >= Number(previous.retryAfterAt); return at - Number(previous.checkedAt || 0) >= FINAL_RECHECK_INTERVAL_MS; })',
    'RESPECT_429_RETRY_AFTER');

  if (out === source || out.includes('if (boardIds.has(id)) continue;')
      || out.includes('FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 45 * 60')) {
    throw new Error('POST_PATCH_ASSERTION_FAILED');
  }
  return out;
}

if (process.argv[1]?.endsWith('patch-live-engine.mjs') && process.argv.length > 2) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || input === output) throw new Error('distinct input/output paths required');
  const original = readFileSync(input, 'utf8');
  const patched = patchPhase1LiveEngine(original);
  writeFileSync(output, patched, { flag: 'wx' });
  const check = spawnSync(process.execPath, ['--check', output], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error('SYNTAX_QA_FAILED: ' + check.stderr);
  console.log(JSON.stringify({ ok: true, mode: 'OFFLINE_ONLY_NO_DEPLOY', patches: 6, inputBytes: original.length, outputBytes: patched.length }));
}
