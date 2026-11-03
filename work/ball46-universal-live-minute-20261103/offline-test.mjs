import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./release.mjs', import.meta.url), 'utf8');
for (const selector of ['.b46-event-watch .ew-orbit', '.b46-event-watch .ew-dot', '.b46-event-watch .ew-track::after']) {
  assert(source.includes(selector), `MISSING_SELECTOR:${selector}`);
}
for (const animation of ['ew-sweep', 'ew-breathe', 'ew-line']) {
  assert(source.includes(`animation-name:${animation}!important`), `ANIMATION_OVERRIDE_MISSING:${animation}`);
}
assert(source.includes("reducedMotion: 'reduce'"), 'REDUCED_MOTION_BROWSER_TEST_MISSING');
assert(source.includes('STATIC_ON_REDUCED_MOTION'), 'MOTION_SAMPLE_REGRESSION_TEST_MISSING');
assert(source.includes('CANDIDATE_UPLOAD_CHANGED_TRAFFIC'), 'NO_TRAFFIC_GUARD_MISSING');
assert(source.includes('attempt <= 4'), 'BOUNDED_HEALTH_RETRY_MISSING');
assert(source.includes('attempt < 4'), 'HEALTH_FAIL_CLOSED_MISSING');
assert(source.includes('Automatic restore: Event Watch motion verification failed'), 'AUTO_RESTORE_MISSING');
assert(source.includes("['ball46.com', 'www.ball46.com']"), 'DOMAIN_SCOPE_GUARD_MISSING');
assert(source.includes('LIVE_MINUTE_FIX_NOT_PRESERVED'), 'PREVIOUS_LIVE_MINUTE_FIX_GUARD_MISSING');
assert(source.includes('MONITOR_MOTION_FIX_NOT_PRESERVED'), 'PREVIOUS_MONITOR_MOTION_GUARD_MISSING');
assert(source.includes('WORLDWIDE_CLOCK_FIX_NOT_PRESERVED'), 'PREVIOUS_WORLDWIDE_CLOCK_GUARD_MISSING');
assert(source.includes('STATISTICS_LIVE_SCORE_FIX_NOT_PRESERVED'), 'PREVIOUS_STATISTICS_SCORE_GUARD_MISSING');
console.log('BALL46_EVENT_WATCH_MOTION_OFFLINE_TEST_PASS');

