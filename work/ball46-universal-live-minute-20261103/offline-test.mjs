import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./release.mjs', import.meta.url), 'utf8');
for (const selector of ['.b46-live-minute-mark', '.b46gn-minute-tick', '.b46-sc-mark']) {
  assert(source.includes(selector), `MISSING_SELECTOR:${selector}`);
}
assert(source.includes('reducedMotion: \'reduce\''), 'REDUCED_MOTION_BROWSER_TEST_MISSING');
assert(source.includes('CANDIDATE_UPLOAD_CHANGED_TRAFFIC'), 'NO_TRAFFIC_GUARD_MISSING');
assert(source.includes('Automatic restore: universal live-minute verification failed'), 'AUTO_RESTORE_MISSING');
assert(!source.includes('animation:none!important'), 'NEW_STYLE_MUST_NOT_DISABLE_BLINK');
assert(source.includes("['ball46.com', 'www.ball46.com']"), 'DOMAIN_SCOPE_GUARD_MISSING');
console.log('BALL46_UNIVERSAL_LIVE_MINUTE_OFFLINE_TEST_PASS');

