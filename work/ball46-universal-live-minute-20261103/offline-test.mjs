import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./release.mjs', import.meta.url), 'utf8');
for (const selector of ['.b46-live-minute-mark', '.b46gn-minute-tick', '.b46-sc-mark', '[data-b46-world-minute-mark]']) {
  assert(source.includes(selector), `MISSING_SELECTOR:${selector}`);
}
assert(source.includes('reducedMotion: \'reduce\''), 'REDUCED_MOTION_BROWSER_TEST_MISSING');
assert(source.includes('CANDIDATE_UPLOAD_CHANGED_TRAFFIC'), 'NO_TRAFFIC_GUARD_MISSING');
assert(source.includes('Automatic restore: worldwide live clock verification failed'), 'AUTO_RESTORE_MISSING');
assert(source.includes("setInterval(paint,500)"), 'JAVASCRIPT_BLINK_TIMER_MISSING');
assert(source.includes("MutationObserver(schedule)"), 'DYNAMIC_RENDERER_OBSERVER_MISSING');
assert(source.includes("mark.style.setProperty('animation','none','important')"), 'CSS_REDUCED_MOTION_BYPASS_MISSING');
assert(source.includes("['ball46.com', 'www.ball46.com']"), 'DOMAIN_SCOPE_GUARD_MISSING');
assert(source.includes('LIVE_MINUTE_FIX_NOT_PRESERVED'), 'PREVIOUS_LIVE_MINUTE_FIX_GUARD_MISSING');
assert(source.includes('MONITOR_MOTION_FIX_NOT_PRESERVED'), 'PREVIOUS_MONITOR_MOTION_GUARD_MISSING');
console.log('BALL46_WORLDWIDE_LIVE_CLOCK_OFFLINE_TEST_PASS');

