import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parse } from 'acorn';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonical = value => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
export const origin = 'https://ball46.com';
export const directOrigin = 'https://ball46-production.mccarey-supon.workers.dev';
export const script = 'ball46-production';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const root = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;

export async function api(path, options = {}) {
  assert(account && token, 'CLOUDFLARE_AUTH_MISSING');
  const response = await fetch(root + path, { ...options, signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  const json = await response.json();
  assert(response.ok && json.success === true, `CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors || [])}`);
  return json.result;
}

export async function activeVersion() {
  const result = await api(`/scripts/${script}/deployments?per_page=3`);
  const versions = result.deployments?.[0]?.versions;
  assert(versions?.length === 1 && Number(versions[0].percentage) === 100, 'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  assert(versions[0].version_id, 'ACTIVE_VERSION_MISSING');
  return versions[0].version_id;
}

export async function getVersion(id) {
  const version = await api(`/workers/${script}/versions/${id}?include=modules`);
  assert(version.main_module && version.modules?.length, 'ACTIVE_MODULES_MISSING');
  return version;
}

export async function publicFile(path, type, baseOrigin = origin) {
  assert([origin, directOrigin].includes(baseOrigin), 'UNCONFIRMED_PRODUCTION_ORIGIN');
  const url = new URL(path, baseOrigin);
  assert.equal(url.origin, baseOrigin, 'CROSS_ORIGIN_ASSET');
  url.searchParams.set('statusAudit', `${process.env.GITHUB_RUN_ID || 'local'}-${Date.now()}`);
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
  assert(response.ok, `PUBLIC_HTTP:${path}:${response.status}`);
  if (type) assert((response.headers.get('content-type') || '').includes(type), `PUBLIC_TYPE:${path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length, `EMPTY_ASSET:${path}`);
  return bytes;
}

export function literals(source) {
  const found = new Map();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.id.name.startsWith('__B46_') && node.init?.type === 'Literal' && typeof node.init.value === 'string') {
      assert(!found.has(node.id.name), `DUPLICATE_LITERAL:${node.id.name}`);
      found.set(node.id.name, { start: node.init.start, end: node.init.end, value: node.init.value });
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object') walk(child);
    }
  };
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
  return found;
}

export function manifest(version) {
  return version.modules.map(module => ({ name: module.name, type: module.content_type, sha: sha(Buffer.from(module.content_base64, 'base64')) })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function backend() {
  const records = {};
  for (const [name, path] of [['engine', '/api/engine/health'], ['market', '/api/full-market/health'], ['statistics', '/api/engine/statistics']]) {
    const json = JSON.parse(await publicFile(path, 'json'));
    assert(json.ok === true, `BACKEND_NOT_OK:${name}`);
    records[name] = name === 'statistics' ? json.settlementRevision : json.version;
    assert(records[name] !== undefined, `BACKEND_REVISION_MISSING:${name}`);
  }
  return records;
}

export async function inspect() {
  const id = await activeVersion();
  const version = await getVersion(id);
  const main = version.modules.find(module => module.name === version.main_module);
  const source = Buffer.from(main.content_base64, 'base64').toString('utf8');
  const css = literals(source).get('__B46_SCOREBAR_TUNE_CSS__');
  assert(css, 'ACTIVE_PRESENTATION_CSS_LITERAL_MISSING');
  assert.equal(sha(await publicFile('/dashboard-v2-tune.css', 'css')), sha(css.value), 'ACTIVE_CSS_NOT_PUBLIC');
  assert(css.value.includes('B46_MAIN_CARDS_SQUARE_20261003'), 'LATEST_SQUARE_CARDS_MISSING');
  const restore = { production: origin, script, version: id, sourceCommit: process.env.GITHUB_SHA, verifiedAt: new Date().toISOString(), mainModule: version.main_module, modules: manifest(version), settingsSha: sha(canonical(await api(`/scripts/${script}/settings`))), backend: await backend(), presentationCssSha: sha(css.value), literals: [...literals(source)].map(([name, entry]) => ({ name, size: Buffer.byteLength(entry.value), sha: sha(entry.value) })) };
  mkdirSync('audit', { recursive: true });
  writeFileSync('audit/restore-point.json', JSON.stringify(restore, null, 2));
  assert.equal(await activeVersion(), id, 'PRODUCTION_CHANGED_DURING_SCOUT');
  console.log(`EXACT_ACTIVE_VERSION=${id}`);
  console.log(`MAIN_MODULE=${version.main_module}`);
  console.log(`PRESENTATION_CSS_SHA=${restore.presentationCssSha}`);
  console.log('READ_ONLY_SCOUT_SUCCESS');
  return { restore, version, source };
}
