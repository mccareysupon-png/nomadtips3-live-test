import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const pass = message => console.log(`PASS: ${message}`);

const index = read('test-system/member-0001/index.html');
const app = read('test-system/member-0001/member.js');
const entry = read('cloudflare-worker/src/paper-entry.js');
const memberConfig = read('cloudflare-worker/src/member-config.js');
const memberData = read('cloudflare-worker/src/member-data.js');

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
  'member_live_state','member_live_signals','member_ball_teng_sets','member_prediction_results','member_notification_log'
]) {
  if (!(memberConfig.includes(table) || memberData.includes(table))) fail(`missing member table ${table}`);
  else pass(`member table ${table}`);
}

for (const ownerTable of ['condition_config','ball_teng_config']) {
  const updateRegex = new RegExp(`UPDATE\\s+${ownerTable}`, 'i');
  if (updateRegex.test(memberConfig) || updateRegex.test(memberData)) fail(`member modules write Owner table ${ownerTable}`);
  else pass(`member modules do not update Owner table ${ownerTable}`);
}

for (const destructive of [
  'DELETE FROM auto_momentum_state',
  'DELETE FROM auto_momentum_state_side',
  'DELETE FROM auto_scan_status'
]) {
  if (memberConfig.includes(destructive) || memberData.includes(destructive)) fail(`member modules contain destructive Owner scanner action: ${destructive}`);
}
if (!process.exitCode) pass('member Activate does not clear Owner scanner state');

for (const route of [
  '/member-profile','/member-live-config','/member-ball-teng-config',
  '/member-live-status','/member-ball-teng-results','/member-stats','/member-notifications'
]) {
  if (!entry.includes(route)) fail(`paper-entry missing member route ${route}`);
  else pass(`paper-entry route ${route}`);
}

for (const systemRoute of ['/condition-config','/ball-teng-config','/auto-scan-status']) {
  if (!entry.includes(systemRoute)) fail(`existing Owner/System route disappeared: ${systemRoute}`);
  else pass(`existing Owner/System route preserved: ${systemRoute}`);
}

if (!memberConfig.includes("scope: 'MEMBER_ONLY'") || !memberData.includes("scope: 'MEMBER_ONLY'")) {
  fail('member endpoints do not declare MEMBER_ONLY scope');
} else pass('member endpoints declare MEMBER_ONLY scope');

if (!memberData.includes('WHERE member_id = ?')) fail('member data queries are not visibly scoped by member_id');
else pass('member data queries are scoped by member_id');

if (!memberConfig.includes('WHERE member_id = ?')) fail('member config writes/reads are not visibly scoped by member_id');
else pass('member config operations are scoped by member_id');

if (process.exitCode) {
  console.error('\nMember isolation contract check FAILED.');
  process.exit(process.exitCode);
}
console.log('\nMember isolation contract check PASSED.');
