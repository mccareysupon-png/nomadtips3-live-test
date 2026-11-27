#!/usr/bin/env node
// Ball46: ONE change only — remove the 45-minute minimum Signal age.
// Offline source patch. NEVER deploys. Input must be active production Engine export.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function patchSignalAge(source) {
  if (!source.includes('missing-final-direct-v1') ||
      !source.includes('async autoReconcileMissingFinals()') ||
      !source.includes('STAT_LEDGER_VERSION')) {
    throw new Error('ACTIVE_ENGINE_BASELINE_NOT_VERIFIED');
  }
  const before = 'var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 45 * 60 * 1e3;';
  const after = 'var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;';
  if (source.split(before).length !== 2) {
    throw new Error('EXPECTED_EXACTLY_ONE_45_MIN_GATE');
  }
  const result = source.replace(before, after);
  if (result.length !== source.length - before.length + after.length) {
    throw new Error('UNEXPECTED_PATCH_DELTA');
  }
  return result;
}

if (process.argv[1]?.endsWith('/patch-live-engine.mjs') && process.argv.length > 2) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || input === output) throw new Error('DISTINCT_INPUT_OUTPUT_REQUIRED');
  const source = readFileSync(input, 'utf8');
  const patched = patchSignalAge(source);
  writeFileSync(output, patched, { flag: 'wx' });
  const qa = spawnSync(process.execPath, ['--check', output], { encoding: 'utf8' });
  if (qa.status !== 0) throw new Error('SYNTAX_CHECK_FAILED: ' + qa.stderr);
  console.log('SIGNAL_AGE_ONLY_PATCHED_OFFLINE_NO_DEPLOY');
}
