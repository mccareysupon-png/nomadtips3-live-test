import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { parse } from 'acorn';
import { parse as parseHtml } from 'parse5';
import { inspect, activeVersion, getVersion, api, script, origin, sha, canonical, manifest, publicFile, backend } from './production.mjs';
import { patch, route as cssRoute } from './patch.mjs';
import { icons } from './icons.mjs';
import { uiCheck } from './qa.mjs';

const reviewed = JSON.parse(readFileSync('base.json', 'utf8'));
const deploy = process.env.DEPLOY_ENABLED === 'true';
const report = { startedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local', run: process.env.GITHUB_RUN_ID || 'local', deploy, scope: 'MATCH STATUS SVG and scoped CSS only; all HTML, JavaScript, worker logic, data engines and image assets byte-identical' };
mkdirSync('audit/css', { recursive: true });
mkdirSync('audit/svg', { recursive: true });
const save = () => writeFileSync('audit/report.json', JSON.stringify(report, null, 2));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function references(html) {
  const urls = new Set();
  const walk = node => {
    const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
    const path = node.tagName === 'script' ? attrs.src : node.tagName === 'link' && attrs.rel === 'stylesheet' ? attrs.href : node.tagName === 'img' ? attrs.src : null;
    if (path) {
      const url = new URL(path, origin);
      if (url.origin === origin) urls.add(url.pathname + url.search);
    }
    (node.childNodes || []).forEach(walk);
  };
  walk(parseHtml(html));
  return urls;
}

function scorebarImages(source) {
  let images;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.name === '__B46_SCOREBAR_BG_B64__') {
      assert(!images, 'DUPLICATE_SCOREBAR_IMAGES');
      images = JSON.parse(source.slice(node.init.start, node.init.end));
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object') walk(child);
    }
  };
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
  assert(images, 'CURRENT_SCOREBAR_IMAGES_MISSING');
  for (const state of ['win','loss','draw','pending']) assert(Object.keys(images).some(path => path.startsWith(`/scorebar-${state}-`) && path.endsWith('.webp')), `CURRENT_IMAGE_STATE_MISSING:${state}`);
  return images;
}

let base, expectedManifest, mainModule;
async function owned(version) {
  const candidate = await getVersion(version);
  return candidate.main_module === mainModule && canonical(manifest(candidate)) === canonical(expectedManifest);
}

async function rollback() {
  const now = await activeVersion();
  if (now === base) { report.rollback = { status: 'base-still-active', version: base }; return; }
  if (!expectedManifest || !await owned(now)) { report.rollback = { status: 'skipped-foreign-deployment', version: now }; return; }
  await api(`/scripts/${script}/deployments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: base, percentage: 100 }], annotations: { 'workers/message': `Rollback MATCH STATUS SVG verification ${report.run}` } }) });
  assert.equal(await activeVersion(), base, 'ROLLBACK_NOT_CONFIRMED');
  report.rollback = { status: 'confirmed', version: base };
}

try {
  const { restore, version, source } = await inspect();
  base = restore.version;
  report.baseVersion = base;
  report.productionBaseCommit = reviewed.productionCommit;
  assert.equal(base, reviewed.version, 'ACTIVE_PRODUCTION_CHANGED_STOP');
  mainModule = version.main_module;
  assert.equal(sha(source), reviewed.mainModuleSha, 'ACTIVE_SOURCE_CHANGED_STOP');
  assert.equal(restore.settingsSha, reviewed.settingsSha, 'PRODUCTION_CONFIG_CHANGED_STOP');
  assert.equal(restore.presentationCssSha, reviewed.presentationCssSha, 'PRODUCTION_CSS_CHANGED_STOP');
  const result = patch(source);
  assert.equal(result.beforeSha, reviewed.presentationCssSha);
  const protectedFiles = new Map();
  assert(result.beforeCss.includes("@import url('v2-typography.css?v=343-v2-type-v1');"), 'CURRENT_TYPOGRAPHY_IMPORT_CHANGED_STOP');
  protectedFiles.set('/v2-typography.css?v=343-v2-type-v1', sha(await publicFile('/v2-typography.css?v=343-v2-type-v1', 'css')));
  for (const path of ['/index.html','/signal.html','/statistics.html','/settings.html','/about.html', ...'information user-guide methodology privacy terms disclaimer affiliate-disclosure responsible-gambling cookies contact'.split(' ').map(page => `/${page}.html`)]) {
    const bytes = await publicFile(path, 'html');
    protectedFiles.set(path, sha(bytes));
    for (const reference of references(bytes.toString())) {
      if (new URL(reference, origin).pathname === cssRoute || protectedFiles.has(reference)) continue;
      protectedFiles.set(reference, sha(await publicFile(reference)));
    }
  }
  for (const [path, bytes] of Object.entries(scorebarImages(source))) {
    const expected = sha(Buffer.from(bytes, 'base64'));
    assert.equal(sha(await publicFile(path, 'image/')), expected, `PUBLIC_IMAGE_DIFFERENT_FROM_ACTIVE:${path}`);
    protectedFiles.set(path, expected);
  }
  assert([...protectedFiles.keys()].some(path => path.startsWith('/dashboard-v2-stage3.js')), 'NATIVE_COUNT_AND_FILTER_RENDERER_NOT_PROTECTED');
  assert([...protectedFiles.keys()].some(path => path.startsWith('/singlepage-workspace-343.js')), 'SIGNAL_NAVIGATION_NOT_PROTECTED');
  assert([...protectedFiles.keys()].some(path => path.startsWith('/mobile-menu-classic-343.js')), 'MOBILE_NAVIGATION_NOT_PROTECTED');
  assert.equal(sha(await publicFile(cssRoute, 'css')), result.beforeSha, 'PUBLIC_BASE_CSS_CHANGED_STOP');
  writeFileSync('audit/css/before-dashboard-v2-tune.css', result.beforeCss);
  writeFileSync('audit/css/after-dashboard-v2-tune.css', result.afterCss);
  for (const [name, svg] of Object.entries(icons)) writeFileSync(`audit/svg/${name}.svg`, svg);
  report.css = { route: cssRoute, beforeSha: result.beforeSha, afterSha: result.afterSha, addedBytes: Buffer.byteLength(result.afterCss) - Buffer.byteLength(result.beforeCss) };
  report.nonCssWorkerSha = result.nonCssSha;
  report.nonCssWorkerBytesUnchanged = true;
  report.protectedFiles = Object.fromEntries(protectedFiles);
  report.backendBefore = restore.backend;
  report.configBeforeSha = restore.settingsSha;
  expectedManifest = manifest(version).map(module => module.name === mainModule ? { ...module, sha: sha(result.after) } : module);
  save();
  await uiCheck({ ...result, phase: 'preview' });
  assert.equal(await activeVersion(), base, 'CONCURRENT_DEPLOY_AFTER_PREVIEW_STOP');
  if (!deploy) {
    report.result = 'PREVIEW_SUCCESS_NO_DEPLOY';
    report.finalVersion = base;
  } else {
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))), restore.settingsSha, 'CONFIG_CHANGED_BEFORE_DEPLOY_STOP');
    assert.equal(await activeVersion(), base, 'CONCURRENT_DEPLOY_STOP');
    const form = new FormData();
    form.set('metadata', new Blob([JSON.stringify({ main_module: mainModule })], { type: 'application/json' }));
    for (const module of version.modules) {
      const bytes = module.name === mainModule ? Buffer.from(result.after) : Buffer.from(module.content_base64, 'base64');
      form.set(module.name, new Blob([bytes], { type: module.content_type }), module.name);
    }
    // Content-only upload preserves current bindings, assets and all worker settings.
    try {
      await api(`/scripts/${script}/content`, { method: 'PUT', body: form });
      let candidate;
      for (let attempt = 0; attempt < 25; attempt++) {
        const current = await activeVersion();
        if (current !== base) { assert(await owned(current), 'FOREIGN_ACTIVE_VERSION_STOP'); candidate = current; break; }
        await delay(1500);
      }
      assert(candidate, 'NO_OWNED_PRODUCTION_CANDIDATE');
      report.candidateVersion = candidate;
      save();
      let cssPublic = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        if (sha(await publicFile(cssRoute, 'css')) === result.afterSha) { cssPublic = true; break; }
        await delay(1500);
      }
      assert(cssPublic, 'PUBLIC_STATUS_CSS_NOT_DEPLOYED');
      for (const [path, expected] of protectedFiles) assert.equal(sha(await publicFile(path)), expected, `UNRELATED_ASSET_CHANGED_STOP:${path}`);
      report.backendAfter = await backend();
      assert.equal(canonical(report.backendAfter), canonical(report.backendBefore), 'BACKEND_LOGIC_REVISION_CHANGED_STOP');
      report.configAfterSha = sha(canonical(await api(`/scripts/${script}/settings`)));
      assert.equal(report.configAfterSha, report.configBeforeSha, 'PRODUCTION_CONFIG_CHANGED_STOP');
      await uiCheck({ ...result, phase: 'production' });
      assert.equal(await activeVersion(), candidate, 'FINAL_PRODUCTION_CHANGED_STOP');
      assert(await owned(candidate), 'FINAL_MODULE_BYTES_CHANGED_STOP');
      report.finalVersion = candidate;
      report.result = 'SUCCESS';
      report.apiSignalOddsStatisticsLiveFeedUnchanged = true;
      report.allHtmlAndJavascriptUnchanged = true;
      report.fourScorebarImagesUnchanged = true;
      console.log(`FINAL_PRODUCTION=${candidate}`);
    } catch (error) {
      try { await rollback(); } catch (rollbackError) { report.rollbackError = rollbackError.message; }
      throw error;
    }
  }
  report.completedAt = new Date().toISOString();
  save();
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Ball46 MATCH STATUS SVG\n\nResult: ${report.result}\n\nProduction base: ${base}\n\nFinal: ${report.finalVersion}\n\nScope: ${report.scope}\n`);
  console.log(report.result);
} catch (error) {
  report.result = 'FAIL_STOPPED';
  report.error = error.message;
  save();
  console.error(error.stack);
  process.exitCode = 1;
}
