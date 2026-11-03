import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./release.mjs', import.meta.url), 'utf8');
for (const selector of ['.mini-scan-beam', '.ew-orbit', '.ew-dot', '.ew-track::after']) {
  assert(source.includes(selector), `MISSING_SELECTOR:${selector}`);
}
assert(source.includes('reducedMotion: \'reduce\''), 'REDUCED_MOTION_BROWSER_TEST_MISSING');
assert(source.includes('CANDIDATE_UPLOAD_CHANGED_TRAFFIC'), 'NO_TRAFFIC_GUARD_MISSING');
assert(source.includes('Automatic restore: universal monitor motion verification failed'), 'AUTO_RESTORE_MISSING');
assert(source.includes('animation-play-state:running!important'), 'FORCED_RUNNING_STATE_MISSING');
assert(source.includes("['ball46.com', 'www.ball46.com']"), 'DOMAIN_SCOPE_GUARD_MISSING');
assert(source.includes('LIVE_MINUTE_FIX_NOT_PRESERVED'), 'PREVIOUS_LIVE_MINUTE_FIX_GUARD_MISSING');
console.log('BALL46_UNIVERSAL_MONITOR_MOTION_OFFLINE_TEST_PASS');

