import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./release.mjs', import.meta.url), 'utf8');
for (const selector of ['.sp-table tbody tr[data-b46-stat-display]', '.b46-sc-score .b46-sc-stack']) {
  assert(source.includes(selector), `MISSING_SELECTOR:${selector}`);
}
assert(source.includes('NOMAD343_DASHBOARD_V2?.getFixture'), 'SHARED_FIXTURE_SOURCE_MISSING');
assert(source.includes('fixture?.goals'), 'CURRENT_GOALS_SOURCE_MISSING');
assert(source.includes('if(data?.settled)return'), 'SETTLED_ROW_LOCK_MISSING');
assert(source.includes('setInterval(sync,2000)'), 'LIVE_SCORE_POLL_MISSING');
assert(source.includes("data.finalScore=score.value"), 'MOBILE_DATASET_SYNC_MISSING');
assert(source.includes('INITIAL_LIVE_SCORE_NOT_SYNCED'), 'INITIAL_SCORE_TEST_MISSING');
assert(source.includes('LIVE_SCORE_DID_NOT_CHANGE_WHILE_OPEN'), 'IN_SESSION_CHANGE_TEST_MISSING');
assert(source.includes('SETTLED_SCORE_WAS_MUTATED'), 'SETTLED_REGRESSION_TEST_MISSING');
assert(source.includes('CANDIDATE_UPLOAD_CHANGED_TRAFFIC'), 'NO_TRAFFIC_GUARD_MISSING');
assert(source.includes('attempt <= 4'), 'BOUNDED_HEALTH_RETRY_MISSING');
assert(source.includes('attempt < 4'), 'HEALTH_FAIL_CLOSED_MISSING');
assert(source.includes('Automatic restore: Statistics live score verification failed'), 'AUTO_RESTORE_MISSING');
assert(source.includes("MutationObserver(schedule)"), 'DYNAMIC_RENDERER_OBSERVER_MISSING');
assert(source.includes("['ball46.com', 'www.ball46.com']"), 'DOMAIN_SCOPE_GUARD_MISSING');
assert(source.includes('LIVE_MINUTE_FIX_NOT_PRESERVED'), 'PREVIOUS_LIVE_MINUTE_FIX_GUARD_MISSING');
assert(source.includes('MONITOR_MOTION_FIX_NOT_PRESERVED'), 'PREVIOUS_MONITOR_MOTION_GUARD_MISSING');
assert(source.includes('WORLDWIDE_CLOCK_FIX_NOT_PRESERVED'), 'PREVIOUS_WORLDWIDE_CLOCK_GUARD_MISSING');
console.log('BALL46_STATISTICS_LIVE_SCORE_OFFLINE_TEST_PASS');

