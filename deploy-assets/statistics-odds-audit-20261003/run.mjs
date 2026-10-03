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
  const response = await fetch(root + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
  const json = await response.json();
  assert(response.ok && json.success === true, `CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors || [])}`);
  return json.result;
}
async function activeVersion() {
  const r = await cf(`/scripts/${script}/deployments?per_page=3`);
  const d = r.deployments?.[0];
  assert(d?.versions?.length === 1 && Number(d.versions[0].percentage) === 100, 'ACTIVE_NOT_SINGLE_100_PERCENT');
  return d.versions[0].version_id;
}
async function getText(path) {
  const url = new URL(path, origin);
  url.searchParams.set('_b46audit', `${env.GITHUB_RUN_ID || 'local'}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  assert(response.ok, `PUBLIC_HTTP:${path}:${response.status}`);
  return await response.text();
}
function safeName(path) { return path.replace(/^\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_') || 'index'; }
function scriptRefs(html) {
  const refs = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const u = new URL(m[1], origin);
    if (u.origin === new URL(origin).origin) refs.add(u.pathname + u.search);
  }
  return [...refs];
}
function excerpts(text) {
  const terms = [/nomad343_odds_format_v1/i,/odds[_ -]?format/i,/decimal/i,/fraction/i,/american/i,/statistics/i,/localStorage/i,/MutationObserver/i,/querySelector/i,/td\b/i,/render/i];
  return text.split(/\r?\n/).map((text,i)=>({line:i+1,text})).filter(r=>terms.some(re=>re.test(r.text))).slice(0,1000);
}
function sanitizeVersion(v) {
  const out = {};
  for (const [k,val] of Object.entries(v || {})) {
    if (k === 'modules') continue;
    out[k] = val;
  }
  return out;
}

const versionId = await activeVersion();
const version = await cf(`/workers/${script}/versions/${versionId}?include=modules`);
const moduleInventory = (version.modules || []).map(m => ({ name:m.name, contentType:m.content_type, bytes:Buffer.from(m.content_base64 || '', 'base64').length }));
const settings = await cf(`/scripts/${script}/settings`);

const initial = ['/settings.html','/index.html?view=statistics','/settings.js?v=343-allmarkets-v1','/statistics-next.js?v=343-next-production-v1','/odds-format-343.js'];
const texts = new Map();
for (const path of initial) {
  try { const text = await getText(path); texts.set(path,text); writeFileSync(`${auditDir}/assets/${safeName(path)}.txt`,text); }
  catch (e) { console.log(`OPTIONAL_FETCH_FAIL ${path} ${e.message}`); }
}
for (const htmlPath of ['/settings.html','/index.html?view=statistics']) {
  const html = texts.get(htmlPath); if (!html) continue;
  for (const ref of scriptRefs(html)) if (!texts.has(ref)) {
    try { const text = await getText(ref); texts.set(ref,text); writeFileSync(`${auditDir}/assets/${safeName(ref)}.txt`,text); }
    catch (e) { console.log(`SCRIPT_FETCH_FAIL ${ref} ${e.message}`); }
  }
}
const files = [...texts].map(([path,text]) => ({ path, bytes:Buffer.byteLength(text), excerpts:excerpts(text) }));
const report = { generatedAt:new Date().toISOString(), scope:'READ-ONLY current Production public asset audit', worker:script, activeProductionVersion:versionId, mainModule:version.main_module, moduleInventory, versionMetadata:sanitizeVersion(version), settings, files };
writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
console.log(`ACTIVE_PRODUCTION_VERSION=${versionId}`);
console.log(`MAIN_MODULE=${version.main_module}`);
console.log(`VERSION_KEYS=${Object.keys(version).join(',')}`);
console.log(`VERSION_METADATA=${JSON.stringify(sanitizeVersion(version))}`);
for (const f of files) console.log(`${f.path} bytes=${f.bytes} hits=${f.excerpts.length}`);