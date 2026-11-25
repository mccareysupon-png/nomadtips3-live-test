import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = 'ball46-prematch-only-test-20261120';
const expectedVersion = '1f3b14b5-1055-4b73-9526-8f4c1d6fd319';
const ownerHost = 'https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev';
const frontend = 'https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const protectedWorkers = [
  'ball46-production',
  'nomadtips3-engine-343',
  'nomadtips3-5usd-hub-343',
  'nomadtips3-full-market-343-ball46',
  'ball46-premium-match-colors-test-20261120',
];

function replaceOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, 'Unexpected source: ' + needle.slice(0, 100));
  return source.replace(needle, replacement);
}

function patchMain(source) {
  const adapterImport = /import \{([^{}]+)\} from '\.\/prematch-ou-engine-v1-test\.mjs';/g;
  const imports = [...source.matchAll(adapterImport)];
  assert.equal(imports.length, 1, 'Expected one existing O/U engine import');
  const nextImport = imports[0][0].replace('}', ',upcomingWaitingFromHub}');
  let next = replaceOnce(source, imports[0][0], nextImport);

  const cronStart = "ctx.waitUntil(stub.fetch('https://prematch.internal/prematch-ou-engine-tick'";
  const cronEnd = "console.log('PREMATCH_OU_REPLACES_V2_OLD_CRON');";
  const start = next.indexOf(cronStart);
  const end = next.indexOf(cronEnd, start);
  assert(start >= 0 && end > start && end - start < 1700, 'Unexpected O/U Cron code');
  assert(next.slice(start, end).includes('PREMATCH_OU_ENGINE_TEST_ERR'));
  next = next.slice(0, start) + next.slice(end + cronEnd.length);
  assert(!next.includes(cronStart));
  assert(next.includes("b46s.fetch('https://prematch.internal/ou-adaptive-research-run-test'"));

  const stateRoute = "if(path==='/ou-adaptive-research-state-test'&&req.method==='GET'){";
  const runRoute = "if(path==='/ou-adaptive-research-run-test'&&req.method==='POST'){";
  const disabledRoutes = [
    '/prematch-ou-engine-tick', '/ou-value-v2-run', '/ou-cycle-test',
    '/ou-price-pickup-tick', '/ou-pending-price-completion-tick',
  ];
  const guard = 'if(req.method===\'POST\'&&' + JSON.stringify(disabledRoutes) +
    ".includes(path))return json({status:'DISABLED_ADAPTIVE_ONLY',providerCalls:0},410);\n";
  next = replaceOnce(next, stateRoute, guard + stateRoute);

  const stored = "const fixtures=await this.ctx.storage.get('botFixtures')??[];";
  const stateAt = next.indexOf(stateRoute);
  const runAt = next.indexOf(runRoute);
  assert(stateAt >= 0 && runAt > stateAt);
  let state = next.slice(stateAt, runAt);
  state = replaceOnce(state, stored,
    "const fixtures=last?.fixtures??await this.ctx.storage.get('botFixtures')??[];");
  state = replaceOnce(state, 'lastRunAt:last?.at??null',
    "lastRunAt:last?.at??null,legacyOuIssuance:'disabled',fixtureFeed:last?.fixtureFeed??null");
  next = next.slice(0, stateAt) + state + next.slice(runAt);

  const runStart = next.indexOf(runRoute);
  const marketStart = next.indexOf('const market=async(path,opts={})=>{', runStart);
  assert(marketStart > runStart && marketStart - runStart < 900);
  let initialization = next.slice(runStart, marketStart);
  initialization = replaceOnce(initialization, stored, [
    "let fixtures=await this.ctx.storage.get('botFixtures')??[];",
    "let fixtureFeed={source:'stored_scheduled_fallback',accepted:fixtures.length};",
    "if(this.env.HUB){",
    "  try{",
    "    const response=await this.env.HUB.fetch('https://hub.internal/snapshot',{",
    "      headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});",
    "    if(response.ok){",
    "      const feed=upcomingWaitingFromHub(await response.json(),now);",
    "      if(feed.status==='READY'){",
    "        fixtures=feed.fixtures;",
    "        fixtureFeed={source:'hub_cached_upcoming_waiting',...feed.stats};",
    "      }",
    "    }",
    "  }catch(error){",
    "    console.warn('B46_ADAPTIVE_HUB_FALLBACK',String(error?.message??error).slice(0,100));",
    "  }",
    "}",
  ].join('\n'));
  next = next.slice(0, runStart) + initialization + next.slice(marketStart);
  const storedResult = "await this.ctx.storage.put('b46AdaptiveOuResearchLastV1',last);";
  next = replaceOnce(next, storedResult,
    "await this.ctx.storage.put('b46AdaptiveOuResearchLastV1',{...last,fixtures,fixtureFeed});");
  return next;
}

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token && account, 'Cloudflare TEST credentials unavailable');
const api = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/workers';
const ownerAuth = 'Bearer ' + createHmac('sha256', token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');

async function cloud(path, options = {}) {
  const response = await fetch(api + path, {
    ...options,
    headers: { authorization: 'Bearer ' + token, ...options.headers },
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  assert(response.ok && data.success, path + ' HTTP ' + response.status);
  return data.result;
}

async function owner(path, method = 'GET') {
  const response = await fetch(ownerHost + path, {
    method,
    headers: { authorization: ownerAuth, accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, json: await response.json() };
}

async function active(worker) {
  const data = await cloud('/scripts/' + worker + '/deployments?per_page=1');
  return data.deployments?.[0]?.versions?.[0]?.version_id;
}

async function protectedVersions() {
  return Promise.all(protectedWorkers.map(active));
}

const original = await active(target);
assert.equal(original, expectedVersion, 'TEST changed since diagnosis. Inspect before applying.');
const [installed, settings, schedules, beforeProtected, beforeAdaptive, beforeFront] = await Promise.all([
  cloud('/workers/' + target + '/versions/' + original + '?include=modules'),
  cloud('/scripts/' + target + '/settings'),
  cloud('/scripts/' + target + '/schedules'),
  protectedVersions(),
  owner('/ou-adaptive-research-state-test'),
  fetch(frontend + '/__b46_prematch_data', { signal: AbortSignal.timeout(30000) }).then(r => r.json()),
]);
assert(schedules.schedules.some(x => x.cron === '*/15 * * * *'));
assert.equal(beforeAdaptive.json.formulas?.length, 42);
assert.equal(beforeFront.ouLedger?.stats?.pending, 0, 'Existing main O/U settlements still pending');
const main = installed.main_module;
assert.equal(main, 'prematch-only-worker.mjs');
const modules = new Map(installed.modules.map(({ name, content_base64 }) =>
  [name, Buffer.from(content_base64, 'base64')]));
const changed = patchMain(modules.get(main).toString('utf8'));
modules.set(main, Buffer.from(changed));
const directory = await mkdtemp(join(tmpdir(), 'ball46-adaptive-only-'));
const file = join(directory, main);
await writeFile(file, changed);
execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
assert.equal(await active(target), original, 'TEST changed concurrently');

const metadata = {
  main_module: main,
  compatibility_date: installed.compatibility_date,
  bindings: settings.bindings.map(({ name }) => ({ name, type: 'inherit' })),
  ...(installed.compatibility_flags?.length && { compatibility_flags: installed.compatibility_flags }),
};
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
for (const [name, content] of modules) {
  form.append(name, new Blob([content], { type: 'application/javascript+module' }), name);
}
const created = await cloud('/scripts/' + target + '/versions?bindings_inherit=strict', {
  method: 'POST',
  body: form,
});
assert(created.id, 'No inactive TEST version returned');
assert.equal(await active(target), original, 'TEST changed before activation');
const uploaded = await cloud('/workers/' + target + '/versions/' + created.id + '?include=modules');
assert.equal(uploaded.modules.length, modules.size);
for (const item of uploaded.modules) {
  assert(modules.get(item.name)?.equals(Buffer.from(item.content_base64, 'base64')), item.name);
}
await cloud('/scripts/' + target + '/deployments', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: created.id, percentage: 100 }] }),
});
let after;
for (let attempt = 0; attempt < 18; attempt++) {
  after = await owner('/ou-adaptive-research-state-test');
  if (after.json.legacyOuIssuance === 'disabled') break;
  await new Promise(resolve => setTimeout(resolve, 2000));
}
assert.equal(after.json.legacyOuIssuance, 'disabled');
assert.equal(after.json.formulas.length, 42);
const stopped = await owner('/prematch-ou-engine-tick', 'POST');
assert.equal(stopped.json.status, 'DISABLED_ADAPTIVE_ONLY');
const tick = await owner('/ou-adaptive-research-run-test', 'POST');
assert.equal(tick.json.code, 'B46_ADAPTIVE_OU_RESEARCH_V1');
assert.equal(tick.json.providerCalls, 0);
const state = await owner('/ou-adaptive-research-state-test');
assert.equal(state.json.fixtureFeed?.source, 'hub_cached_upcoming_waiting');
assert.deepEqual(await protectedVersions(), beforeProtected);
assert.equal(await active(target), created.id);
const afterSchedules = await cloud('/scripts/' + target + '/schedules');
assert.deepEqual(afterSchedules.schedules.map(s => s.cron), schedules.schedules.map(s => s.cron));
console.log('BALL46_ADAPTIVE_ONLY_TEST_VERIFIED', JSON.stringify({
  version: created.id,
  previous: original,
  lastRunAt: state.json.lastRunAt,
  feed: state.json.fixtureFeed,
  counts: state.json.screeningCounts,
  pricedFixtures: state.json.priced?.fixtures,
  oldOu: stopped.json.status,
  formulas: state.json.formulas.length,
  providerCalls: tick.json.providerCalls,
}));
