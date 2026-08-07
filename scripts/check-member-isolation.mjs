import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const pass = message => console.log(`PASS: ${message}`);

const index = read('test-system/member-0001/index.html');
const app = read('test-system/member-0001/member.js');
const entry = read('cloudflare-worker/src/paper-entry.js');
const memberConfig = read('cloudflare-worker/src/member-config.js');
const memberData = read('cloudflare-worker/src/member-data.js');
const memberEvaluator = read('cloudflare-worker/src/member-live-evaluator.js');
const memberBallIngest = read('cloudflare-worker/src/member-ball-teng-ingest.js');
const memberBallRunner = read('.github/scripts/run_member_ball_teng_selector.py');
const memberBallWorkflow = read('.github/workflows/member-ball-teng-selector.yml');
const memberModules = `${memberConfig}\n${memberData}\n${memberEvaluator}\n${memberBallIngest}`;

for (const tab of ['overview','ball-teng','live','stats','notifications','settings']) {
  if (!index.includes(`data-tab="${tab}"`) || !index.includes(`data-view="${tab}"`)) fail(`missing member tab/view ${tab}`);
  else pass(`member tab/view ${tab}`);
}

const ids = [...app.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]);
const missingIds = [...new Set(ids)].filter(id => !new RegExp(`id=["']${id}["']`).test(index));
if (missingIds.length) fail(`member.js references missing DOM ids: ${missingIds.join(', ')}`);
else pass('member.js DOM references exist in Member #0001 page');

for (const forbidden of ['selected-live-matches.json', "loadCumulativeRecords", "'/condition-config'", "'/ball-teng-config'"]) {
  if (app.includes(forbidden)) fail(`member frontend contains forbidden global fallback/write reference: ${forbidden}`);
}
if (!process.exitCode) pass('member frontend avoids Owner/global result fallbacks and Owner config endpoints');

for (const table of [
  'member_profiles','member_live_config','member_ball_teng_config','member_notification_settings',
  'member_live_state','member_live_signals','member_ball_teng_sets','member_prediction_results','member_notification_log',
  'member_live_scan_status','member_api_usage'
]) {
  if (!memberModules.includes(table)) fail(`missing member table ${table}`);
  else pass(`member table ${table}`);
}

for (const ownerTable of ['condition_config','ball_teng_config']) {
  const updateRegex = new RegExp(`UPDATE\\s+${ownerTable}`, 'i');
  if (updateRegex.test(memberModules)) fail(`member modules write Owner table ${ownerTable}`);
  else pass(`member modules do not update Owner table ${ownerTable}`);
}

for (const destructive of [
  'DELETE FROM auto_momentum_state',
  'DELETE FROM auto_momentum_state_side',
  'DELETE FROM auto_scan_status'
]) {
  if (memberModules.includes(destructive)) fail(`member modules contain destructive Owner scanner action: ${destructive}`);
}
if (!process.exitCode) pass('member modules do not clear Owner scanner state');

for (const route of [
  '/member-profile','/member-live-config','/member-ball-teng-config',
  '/member-live-status','/member-ball-teng-results','/member-stats','/member-notifications',
  '/member-ball-teng-ingest'
]) {
  if (!entry.includes(route)) fail(`paper-entry missing member route ${route}`);
  else pass(`paper-entry route ${route}`);
}

for (const systemRoute of ['/condition-config','/ball-teng-config','/auto-scan-status']) {
  if (!entry.includes(systemRoute)) fail(`existing Owner/System route disappeared: ${systemRoute}`);
  else pass(`existing Owner/System route preserved: ${systemRoute}`);
}

if (!entry.includes('runMemberLiveBackgroundScans(env)')) fail('scheduled Worker does not run member live background scans');
else pass('scheduled Worker runs member live background scans');

if (!memberConfig.includes("scope: 'MEMBER_ONLY'") || !memberData.includes("scope: 'MEMBER_ONLY'") || !memberBallIngest.includes("scope: 'MEMBER_ONLY'")) {
  fail('member endpoints do not declare MEMBER_ONLY scope');
} else pass('member endpoints declare MEMBER_ONLY scope');

if (!memberData.includes('WHERE member_id = ?')) fail('member data queries are not visibly scoped by member_id');
else pass('member data queries are scoped by member_id');

if (!memberConfig.includes('WHERE member_id = ?')) fail('member config writes/reads are not visibly scoped by member_id');
else pass('member config operations are scoped by member_id');

if (!memberEvaluator.includes('memberId') || !memberEvaluator.includes('member_live_state') || !memberEvaluator.includes('member_live_signals')) {
  fail('member evaluator does not visibly write member-scoped live state/signals');
} else pass('member evaluator targets member-scoped live state/signals');

if (!memberEvaluator.includes('member_api_usage') || !memberEvaluator.includes('apiFetchDirect')) {
  fail('member evaluator does not track direct TEST API usage');
} else pass('member evaluator tracks direct TEST API usage');

if (!memberBallIngest.includes('X-NOMAD-ENGINE-KEY') || !memberBallIngest.includes('member_ball_teng_sets')) {
  fail('member Ball Teng ingest is not protected and member-scoped');
} else pass('member Ball Teng ingest is protected and writes member-scoped sets');

for (const source of [
  'run_ball_teng_selector.py',
  'auto_select_next.py',
  'apply_confidence_policy.py',
  'finalize_ball_teng_analysis.py',
  'enrich_selected_odds.py'
]) {
  if (!memberBallRunner.includes(source)) fail(`member Ball Teng runner does not reuse copied main engine component ${source}`);
  else pass(`member Ball Teng runner copies main engine component ${source}`);
}

if (!memberBallRunner.includes('TemporaryDirectory') || !memberBallRunner.includes("'memberId': MEMBER_ID") || !memberBallRunner.includes("'/member-ball-teng-ingest'")) {
  fail('member Ball Teng runner is not visibly isolated in a temporary member room');
} else pass('member Ball Teng runner uses an isolated temporary room and member-only ingest');

if (memberBallWorkflow.includes('contents: write')) fail('member Ball Teng workflow must not write Owner repository selection files');
else pass('member Ball Teng workflow has read-only repository permissions');

if (!memberBallWorkflow.includes("cron: '*/5 * * * *'") || !memberBallWorkflow.includes('run_member_ball_teng_selector.py')) {
  fail('member Ball Teng workflow is not checking for member config changes every five minutes');
} else pass('member Ball Teng workflow checks active member config every five minutes');

if (process.exitCode) {
  console.error('\nMember isolation contract check FAILED.');
  process.exit(process.exitCode);
}
console.log('\nMember isolation contract check PASSED.');
