import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const env = process.env;
const origin = env.BALL46_URL || 'https://ball46.com';
const script = env.SCRIPT_NAME || 'ball46-production';
const account = env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_API_TOKEN;
assert(account && token, 'CLOUDFLARE_AUTH_MISSING');
assert.equal(script, 'ball46-production');
const auditDir = 'audit';
mkdirSync(`${auditDir}/assets`, { recursive: true });

const root = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function cf(path) {
  const response = await fetch(root + path, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60000),
  });
  const json = await response.json();
  assert(response.ok && json.success === true, `CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors || [])}`);
  return json.result;
}
async function activeVersion() {
  const r = await cf(`/scripts/${script}/deployments?per_page=3`);
  const d = r.deployments?.[0];
  assert(d?.versions?.length === 1 && Number(d.versions[0].percentage) === 100, 'ACTIVE_NOT_SINGLE_100_PERCENT');
  assert(d.versions[0].version_id, 'ACTIVE_VERSION_MISSING');
  return d.versions[0].version_id;
}
async function getText(path) {
  const url = new URL(path, origin);
  url.searchParams.set('_b46audit', `${env.GITHUB_RUN_ID || 'local'}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  assert(response.ok, `PUBLIC_HTTP:${path}:${response.status}`);
  return await response.text();
}
function safeName(path) {
  return path.replace(/^\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'index';
}
function scriptRefs(html) {
  const refs = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const u = new URL(m[1], origin);
    if (u.origin === new URL(origin).origin) refs.add(u.pathname + u.search);
  }
  return [...refs];
}
function excerpts(text, terms) {
  const rows = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    if (terms.some(re => re.test(rows[i]))) out.push({ line: i + 1, text: rows[i].slice(0, 1600) });
  }
  return out.slice(0, 500);
}

const versionId = await activeVersion();
const version = await cf(`/workers/${script}/versions/${versionId}?include=modules`);
assert(version?.main_module && Array.isArray(version.modules), 'ACTIVE_MODULES_MISSING');
const mainModule = version.modules.find(m => m.name === version.main_module);
assert(mainModule?.content_base64, 'MAIN_MODULE_CONTENT_MISSING');
const mainSource = Buffer.from(mainModule.content_base64, 'base64').toString('utf8');
const sourceMarker = "343-odds-format-v4-topbar-fixed";
const markerAt = mainSource.indexOf(sourceMarker);
assert(markerAt >= 0, 'ODDS_FORMAT_SOURCE_MARKER_MISSING');
const sourceContext = mainSource.slice(Math.max(0, markerAt - 5000), Math.min(mainSource.length, markerAt + 22000));
writeFileSync(`${auditDir}/odds-format-worker-context.txt`, sourceContext);

const requested = [
  '/settings.html',
  '/index.html?view=statistics',
  '/settings.js?v=343-allmarkets-v1',
  '/statistics-next.js?v=343-next-production-v1',
];
const texts = new Map();
for (const path of requested) {
  const text = await getText(path);
  texts.set(path, text);
  writeFileSync(`${auditDir}/assets/${safeName(path)}.txt`, text);
}
for (const htmlPath of ['/settings.html', '/index.html?view=statistics']) {
  for (const ref of scriptRefs(texts.get(htmlPath))) {
    if (!texts.has(ref)) {
      const text = await getText(ref);
      texts.set(ref, text);
      writeFileSync(`${auditDir}/assets/${safeName(ref)}.txt`, text);
    }
  }
}

const terms = [
  /localStorage/i, /sessionStorage/i, /odds/i, /bookmaker/i, /provider/i,
  /settings/i, /statistics/i, /storage/i, /CustomEvent/i, /dispatchEvent/i,
  /addEventListener/i, /filter/i, /market/i, /source/i, /refresh/i, /render/i,
];
const files = [];
for (const [path, text] of texts) files.push({ path, bytes: Buffer.byteLength(text), excerpts: excerpts(text, terms) });
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'READ-ONLY audit of current Ball46 Production Odds Settings -> Statistics wiring. No mutation and no deploy.',
  worker: script,
  activeProductionVersion: versionId,
  mainModule: version.main_module,
  mainModuleBytes: Buffer.byteLength(mainSource),
  sourceMarker,
  sourceMarkerOffset: markerAt,
  requested,
  files,
};
writeFileSync(`${auditDir}/report.json`, JSON.stringify(report, null, 2));
console.log(`ACTIVE_PRODUCTION_VERSION=${versionId}`);
console.log(`MAIN_MODULE=${version.main_module} markerOffset=${markerAt}`);
console.log(`AUDITED_FILES=${files.length}`);
for (const file of files) console.log(`${file.path} bytes=${file.bytes} hits=${file.excerpts.length}`);
