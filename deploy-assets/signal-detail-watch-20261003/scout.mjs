import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = 'https://ball46.com';
const SCRIPT = 'ball46-production';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const auditDir = 'audit';
mkdirSync(auditDir, { recursive: true });

async function api(path) {
  assert(account && token, 'CLOUDFLARE_AUTH_MISSING');
  const response = await fetch(apiRoot + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(60000)
  });
  const json = await response.json();
  assert(response.ok && json.success === true, `CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors || [])}`);
  return json.result;
}

async function activeVersion() {
  const result = await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
  const versions = result.deployments?.[0]?.versions;
  assert(versions?.length === 1 && Number(versions[0].percentage) === 100, 'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  return versions[0].version_id;
}

async function fetchText(path) {
  const u = new URL(path, ORIGIN);
  u.searchParams.set('signalWatchScout', `${process.env.GITHUB_RUN_ID || 'local'}-${Date.now()}`);
  const response = await fetch(u, {
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(45000)
  });
  assert(response.ok, `PUBLIC_HTTP:${path}:${response.status}`);
  return await response.text();
}

function snippets(source, needle, radius = 620) {
  const out = [];
  let at = 0;
  const lower = source.toLowerCase();
  const want = needle.toLowerCase();
  while ((at = lower.indexOf(want, at)) !== -1 && out.length < 12) {
    out.push({
      at,
      text: source.slice(Math.max(0, at - radius), Math.min(source.length, at + needle.length + radius))
    });
    at += needle.length;
  }
  return out;
}

const files = [
  '/index.html',
  '/dashboard-v2-stage3.js',
  '/live-prediction-343.js',
  '/ui-sync-fixes-343-v2.js',
  '/odds-format-343.js',
  '/signal.js'
];
const needles = [
  'feature-signal-meta',
  'data-signal-count',
  'data-workspace-signal-count',
  'syncSignalCount',
  'signalSummary(',
  'signalDetail(',
  'signalsFor(',
  'signalFor(',
  'signalcount',
  'signal_count',
  'signals.length',
  'dataset.signal',
  'textcontent',
  'innerhtml'
];

const before = await activeVersion();
const report = { activeVersion: before, checkedAt: new Date().toISOString(), files: {} };
for (const path of files) {
  const source = await fetchText(path);
  const hits = {};
  for (const needle of needles) {
    const found = snippets(source, needle);
    if (found.length) hits[needle] = found;
  }
  report.files[path] = { bytes: Buffer.byteLength(source), hits };
  console.log(`FILE_OK ${path} bytes=${Buffer.byteLength(source)} featureMeta=${hits['feature-signal-meta']?.length || 0} dataSignalCount=${hits['data-signal-count']?.length || 0}`);
}

const index = await fetchText('/index.html');
report.indexScripts = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
report.indexStyles = [...index.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
writeFileSync(`${auditDir}/signal-render-scout.json`, JSON.stringify(report, null, 2));

for (const path of ['/dashboard-v2-stage3.js','/ui-sync-fixes-343-v2.js']) {
  const hits = report.files[path]?.hits || {};
  for (const key of ['data-signal-count','data-workspace-signal-count','syncSignalCount','signalSummary(','signalDetail(','signalsFor(','signalFor(']) {
    for (const hit of hits[key] || []) console.log(`PINPOINT ${path} ${key} @${hit.at}\n${hit.text}\n---END_PINPOINT---`);
  }
}

const after = await activeVersion();
assert.equal(after, before, `PRODUCTION_CHANGED_DURING_SCOUT:${before}->${after}`);
const featureFiles = Object.entries(report.files).filter(([, info]) => info.hits?.['feature-signal-meta']?.length).map(([path]) => path);
console.log(`EXACT_ACTIVE_VERSION=${before}`);
console.log(`FEATURE_SIGNAL_META_FILES=${featureFiles.join(',') || 'NONE'}`);
console.log(`INDEX_SCRIPTS=${report.indexScripts.join(',')}`);
console.log('SIGNAL_RENDER_SCOUT_READ_ONLY_SUCCESS');
