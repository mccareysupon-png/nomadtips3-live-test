import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { api, script, directOrigin, publicFile, sha, canonical, manifest } from './production.mjs';

export const rail = {
  proofRun: 36360390676,
  workflow: '.github/workflows/ball46-odds-surgical-deploy-20260928.yml',
  branch: 'ops/ball46-odds-surgical-20260928',
  wrangler: '4.92.0',
};

export function verifyPublishedModules(current, original, patchedSource, protectedFiles) {
  assert.equal(current.main_module, original.main_module, 'PUBLISHED_MAIN_MODULE_CHANGED');
  const expected = new Map(manifest(original).map(module => [module.name, { ...module, ...(module.name === original.main_module ? { sha: sha(patchedSource) } : {}) }]));
  const actual = manifest(current);
  for (const [name, module] of expected) assert.equal(canonical(actual.find(entry => entry.name === name)), canonical(module), `PUBLISHED_ORIGINAL_MODULE_DIFFERENT:${name}`);
  const attached = actual.filter(module => !expected.has(module.name));
  for (const module of attached) {
    assert.equal(module.type, 'text/plain', `UNAPPROVED_ADDITIONAL_EXECUTABLE_MODULE:${module.name}`);
    assert(/^(?:assets\/)?(?:[a-zA-Z0-9_-]+\.html|robots\.txt)$/.test(module.name), `UNAPPROVED_ADDITIONAL_MODULE_PATH:${module.name}`);
    const path = '/' + module.name.replace(/^assets\//, '');
    assert(protectedFiles[path], `ADDITIONAL_MODULE_NOT_IN_ORIGINAL_PRODUCTION:${path}`);
    assert.equal(module.sha, protectedFiles[path], `ADDITIONAL_TEXT_MODULE_BYTES_CHANGED:${path}`);
  }
  return attached;
}

export async function schedules() {
  const result = await api(`/scripts/${script}/schedules`);
  const entries = Array.isArray(result) ? result : result.schedules;
  assert(Array.isArray(entries), 'CURRENT_SCHEDULES_MISSING');
  return entries.map(entry => entry.cron).sort();
}

export function configFromCurrent(version, settings, crons, assetsDirectory) {
  assert.equal(version.main_module, 'index.js', 'CURRENT_RAIL_MAIN_MODULE_CHANGED');
  assert(version.modules.every(module => module.name === version.main_module || (module.content_type === 'text/plain' && /^(?:assets\/)?(?:[a-zA-Z0-9_-]+\.html|robots\.txt)$/.test(module.name))), 'CURRENT_RAIL_MODULE_SHAPE_CHANGED');
  assert(version.compatibility_date, 'CURRENT_COMPATIBILITY_DATE_MISSING');
  assert(Array.isArray(version.bindings), 'CURRENT_BINDINGS_MISSING');
  const assetBindings = version.bindings.filter(binding => binding.type === 'assets');
  assert.equal(assetBindings.length, 1, 'CURRENT_ASSET_BINDING_SHAPE_CHANGED');
  const services = version.bindings.filter(binding => binding.type === 'service').map(binding => {
    assert(binding.name && binding.service, 'CURRENT_SERVICE_BINDING_INCOMPLETE');
    return { binding: binding.name, service: binding.service, ...(binding.environment ? { environment: binding.environment } : {}) };
  });
  assert(version.bindings.every(binding => ['assets', 'service'].includes(binding.type)), 'UNSUPPORTED_CURRENT_BINDING_STOP');
  const assets = version.assets?.config;
  assert(assets && assets.base_path === '/', 'CURRENT_ASSET_CONFIG_MISSING');
  const config = {
    name: script,
    main: './index.js',
    compatibility_date: version.compatibility_date,
    compatibility_flags: version.compatibility_flags || [],
    no_bundle: true,
    find_additional_modules: true,
    rules: [{ type: 'Text', globs: version.modules.filter(module => module.name !== version.main_module).map(module => module.name), fallthrough: false }],
    services,
    assets: {
      directory: assetsDirectory,
      binding: assetBindings[0].name,
      html_handling: assets.html_handling,
      not_found_handling: assets.not_found_handling,
      run_worker_first: assets.run_worker_first,
    },
    triggers: { crons },
  };
  for (const key of ['logpush', 'limits', 'observability']) if (settings[key] !== undefined && settings[key] !== null) config[key] = settings[key];
  if (settings.placement?.mode === 'smart') config.placement = settings.placement;
  return config;
}

export async function stageCurrentRail(version, settings, crons, patchedSource) {
  const runtime = resolve('runtime');
  const assets = resolve(runtime, 'assets');
  const paths = readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt', 'utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(paths.length, 79, 'CONFIRMED_RAIL_PATH_COUNT_CHANGED');
  assert.equal(new Set(paths).size, paths.length, 'CONFIRMED_RAIL_DUPLICATE_PATH');
  const hashes = {};
  for (const path of paths) {
    assert(/^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/.test(path) && !path.split('/').includes('..'), 'UNSAFE_CURRENT_ASSET_PATH');
    const bytes = await publicFile('/' + path, undefined, directOrigin);
    assert.equal(sha(await publicFile('/' + path)), sha(bytes), `CURRENT_PRODUCTION_HOSTS_DIFFER:${path}`);
    const target = resolve(assets, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    hashes[path] = sha(bytes);
  }
  for (const module of version.modules.filter(module => module.name !== version.main_module)) {
    assert(/^(?:assets\/)?(?:[a-zA-Z0-9_-]+\.html|robots\.txt)$/.test(module.name), 'CURRENT_TEXT_MODULE_UNSAFE_PATH');
    const moduleTarget = resolve(runtime, module.name);
    mkdirSync(dirname(moduleTarget), { recursive: true });
    writeFileSync(moduleTarget, Buffer.from(module.content_base64, 'base64'));
    assert.equal(sha(Buffer.from(module.content_base64, 'base64')), hashes[module.name.replace(/^assets\//, '')], `CURRENT_TEXT_MODULE_NOT_IDENTICAL_TO_PUBLIC_ASSET:${module.name}`);
  }
  writeFileSync(resolve(runtime, 'index.js'), patchedSource);
  writeFileSync(resolve(runtime, 'wrangler.jsonc'), JSON.stringify(configFromCurrent(version, settings, crons, assets), null, 2));
  return { runtime, hashes, crons, modules: version.modules.map(module => ({ name: module.name, sha: module.name === version.main_module ? sha(patchedSource) : sha(Buffer.from(module.content_base64, 'base64')) })) };
}

export async function verifyRailBase(staged) {
  assert.equal(canonical(await schedules()), canonical(staged.crons), 'CURRENT_CRON_CHANGED_STOP');
  for (const [path, expected] of Object.entries(staged.hashes)) assert.equal(sha(await publicFile('/' + path, undefined, directOrigin)), expected, `CURRENT_RAIL_ASSET_MOVED_STOP:${path}`);
}

export function wrangler(staged, dryRun = false) {
  const args = ['--yes', `wrangler@${rail.wrangler}`, 'deploy', '--config', 'wrangler.jsonc', ...(dryRun ? ['--dry-run', '--outdir', 'dryrun'] : [])];
  const result = spawnSync('npx', args, { cwd: staged.runtime, stdio: 'inherit', env: process.env });
  assert(!result.error && result.status === 0, `CONFIRMED_RAIL_WRANGLER_FAILED:${dryRun ? 'dry-run' : 'deploy'}:${result.error?.message || result.status}`);
  if (dryRun) for (const module of staged.modules) assert.equal(sha(readFileSync(resolve(staged.runtime, 'dryrun', module.name))), module.sha, `DRY_RUN_CURRENT_MODULE_NOT_PRESERVED:${module.name}`);
}
