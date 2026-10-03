import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFragment } from 'parse5';
import YAML from 'yaml';
import { icons, iconUri } from './icons.mjs';
import { patch, normalize, statusCss, validateCss, marker, obsoleteImport, removeObsoleteImport } from './patch.mjs';
import { isTelemetryCancellation, isControlledCancellation, isSnapshotCancellation } from './qa.mjs';
import { rail, configFromCurrent, verifyPublishedModules } from './rail.mjs';
import { sha } from './production.mjs';

test('six authored sports SVGs share one viewBox and stroke weight, with no raster, scripts or external references', () => {
  assert.deepEqual(Object.keys(icons), ['all','live','signal','scheduled','unknown','finished']);
  assert.equal(new Set(Object.values(icons)).size, 6);
  for (const [key, source] of Object.entries(icons)) {
    const root = parseFragment(source).childNodes[0];
    assert.equal(root.tagName, 'svg');
    const attrs = Object.fromEntries(root.attrs.map(attr => [attr.name, attr.value]));
    assert.equal(attrs.viewBox, '0 0 24 24');
    assert.equal(attrs['stroke-width'], '1.6');
    const walk = node => {
      if (node.tagName) assert(['svg','path','circle','rect'].includes(node.tagName));
      for (const attr of node.attrs || []) assert(!/^(?:on|href|style)/.test(attr.name));
      (node.childNodes || []).forEach(walk);
    };
    walk(root);
    assert(source.includes('fill-opacity='));
    assert(Buffer.byteLength(source) < 850);
    assert.equal(decodeURIComponent(iconUri(key).split(',')[1]), source);
  }
});

test('only one current CSS literal changes; HTML, JS, worker logic, routing and image bytes are untouched', () => {
  const remainingCss = "\n@import url('existing-font.css');\n.original{color:red;font-size:11px;font-family:Arial}/* B46_MAIN_CARDS_SQUARE_20261003 */";
  const css = obsoleteImport + remainingCss;
  const source = `const __B46_SCOREBAR_TUNE_CSS__=${JSON.stringify(css)};const __B46_THEME_TOOLBAR_JS__="native counts/filter handlers";const imageBytes="unchanged";export default {fetch(){return new Response("API unchanged")}};`;
  const result = patch(source);
  assert.equal(result.afterCss, remainingCss + statusCss);
  assert.equal(result.obsoleteImportRemoved, true);
  assert.equal(normalize(result.after), normalize(source));
  assert(result.after.includes('native counts/filter handlers'));
  assert.equal(patch(result.after).after, result.after);
  assert.throws(() => patch(result.after.replace(marker, marker + '_changed')), /EXISTING_STATUS_PATCH_DIFFERS/);
  assert.throws(() => patch(source.replace('B46_MAIN_CARDS_SQUARE_20261003', 'old')), /LATEST_PRODUCTION/);
});

test('only the exact obsolete import is removed; other CSS bytes remain intact and drift fails closed', () => {
  const prefix = '/* existing imports */\n';
  const suffix = "\n@import url('real-font.css');\nbody{font-family:Arial;font-size:11px}";
  assert.equal(removeObsoleteImport(prefix + obsoleteImport + suffix), prefix + suffix);
  assert.throws(() => removeObsoleteImport(suffix), /MISSING_OR_DUPLICATED/);
  assert.throws(() => removeObsoleteImport(obsoleteImport + obsoleteImport), /MISSING_OR_DUPLICATED/);
  assert.throws(() => removeObsoleteImport(obsoleteImport.replace('@import ', '@import  ')), /FORMAT_CHANGED/);
});

test('UI scope cannot grow into typography, APIs, other menus, assets or heavy filters', () => {
  validateCss(statusCss);
  for (const suffix of ['body{font-size:12px}', '.sp-kpis{display:none}', 'button{filter:blur(1px)}', '.status{background:url(https://elsewhere/icon.png)}']) {
    assert.throws(() => validateCss(statusCss + suffix), /OUTSIDE_APPROVED_MATCH_STATUS/);
  }
  assert(statusCss.includes('(hover: hover) and (pointer: fine)'));
  assert(statusCss.includes('(prefers-reduced-motion: reduce)'));
  assert(!statusCss.includes('font-size'));
  assert(!statusCss.includes('animation:'));
});

test('workflow reuses the confirmed successful Production rail and triggering commit with serialized deployment', () => {
  const parsed = YAML.parseDocument(readFileSync('../../' + rail.workflow, 'utf8'));
  assert.equal(parsed.errors.length, 0);
  const config = parsed.toJS();
  assert.deepEqual(config.on.push.branches, [rail.branch]);
  assert.equal(rail.proofRun, 36360390676);
  assert.equal(rail.wrangler, '4.92.0');
  assert.equal(config.concurrency['cancel-in-progress'], false);
  assert.equal(config.jobs.deploy.steps[0].with?.ref, undefined);
});

test('canceled replayed snapshots cannot suppress real network failures or writes', () => {
  const request = { method: 'GET', failure: 'net::ERR_ABORTED', replayedSnapshot: true };
  assert.equal(isSnapshotCancellation(request), true);
  assert.equal(isSnapshotCancellation({ ...request, replayedSnapshot: false }), false);
  assert.equal(isSnapshotCancellation({ ...request, failure: 'net::ERR_FAILED' }), false);
  assert.equal(isSnapshotCancellation({ ...request, method: 'POST' }), false);
});

test('the confirmed Wrangler rail derives its config from current metadata, never a historical source', () => {
  const version = { main_module: 'index.js', modules: [{ name: 'index.js', content_type: 'application/javascript+module' }], compatibility_date: '2026-09-09', compatibility_flags: [], bindings: [{ name: 'ASSETS', type: 'assets' }, { name: 'ENGINE', type: 'service', service: 'current-engine', environment: 'production' }], assets: { config: { base_path: '/', html_handling: 'none', not_found_handling: 'none', run_worker_first: true } } };
  const config = configFromCurrent(version, { logpush: false }, ['* * * * *'], '/current/assets');
  assert.equal(config.name, 'ball46-production');
  assert.equal(config.no_bundle, true);
  assert.deepEqual(config.services, [{ binding: 'ENGINE', service: 'current-engine', environment: 'production' }]);
  assert.deepEqual(config.triggers.crons, ['* * * * *']);
  assert.equal(config.assets.directory, '/current/assets');
  assert.equal(config.assets.run_worker_first, true);
  assert.throws(() => configFromCurrent({ ...version, bindings: [...version.bindings, { name: 'OTHER', type: 'kv_namespace' }] }, {}, [], '/assets'), /UNSUPPORTED_CURRENT_BINDING/);
  assert.equal(configFromCurrent({ ...version, modules: [...version.modules, { name: 'assets/index.html', content_type: 'text/plain' }] }, {}, [], '/assets').main, './index.js');
  assert.throws(() => configFromCurrent({ ...version, modules: [...version.modules, { name: 'other.js', content_type: 'application/javascript+module' }] }, {}, [], '/assets'), /MODULE_SHAPE_CHANGED/);
});

test('Wrangler may attach only byte-identical original HTML text; changed code or unapproved modules still fail', () => {
  const module = (name, content, content_type) => ({ name, content_base64: Buffer.from(content).toString('base64'), content_type });
  const original = { main_module: 'index.js', modules: [module('index.js', 'original CSS', 'application/javascript+module')] };
  const main = module('index.js', 'approved CSS', 'application/javascript+module');
  const text = module('assets/index.html', '<html>original</html>', 'text/plain');
  const current = { main_module: 'index.js', modules: [main, text] };
  const protectedFiles = { '/index.html': sha('<html>original</html>') };
  assert.equal(verifyPublishedModules(current, original, 'approved CSS', protectedFiles).length, 1);
  assert.throws(() => verifyPublishedModules({ ...current, modules: [module('index.js', 'changed logic', main.content_type), text] }, original, 'approved CSS', protectedFiles), /ORIGINAL_MODULE_DIFFERENT/);
  assert.throws(() => verifyPublishedModules({ ...current, modules: [main, { ...text, content_type: main.content_type }] }, original, 'approved CSS', protectedFiles), /ADDITIONAL_EXECUTABLE_MODULE/);
  assert.throws(() => verifyPublishedModules({ ...current, modules: [main, module('assets/index.html', 'changed HTML', 'text/plain')] }, original, 'approved CSS', protectedFiles), /TEXT_MODULE_BYTES_CHANGED/);
  assert.throws(() => verifyPublishedModules({ ...current, modules: [main, { ...text, name: 'assets/new.html' }] }, original, 'approved CSS', protectedFiles), /NOT_IN_ORIGINAL_PRODUCTION/);
});

test('QA tolerates only canceled same-origin Cloudflare RUM, not API or asset failures', () => {
  assert.equal(isTelemetryCancellation({ url: 'https://ball46.com/cdn-cgi/rum?', failure: 'net::ERR_ABORTED' }), true);
  for (const url of ['https://ball46.com/api/engine/board', 'https://ball46.com/dashboard-v2-stage3.js', 'https://ball46.com/cdn-cgi/rum-extra', 'https://another.example/cdn-cgi/rum']) {
    assert.equal(isTelemetryCancellation({ url, failure: 'net::ERR_ABORTED' }), false);
  }
  assert.equal(isTelemetryCancellation({ url: 'https://ball46.com/cdn-cgi/rum', failure: 'net::ERR_FAILED' }), false);
});

test('only in-flight read requests marked before a controlled navigation or refresh can be canceled', () => {
  const request = { method: 'GET', failure: 'net::ERR_ABORTED', controlledTransition: true };
  assert.equal(isControlledCancellation(request), true);
  assert.equal(isControlledCancellation({ ...request, controlledTransition: false }), false);
  assert.equal(isControlledCancellation({ ...request, failure: 'net::ERR_FAILED' }), false);
  assert.equal(isControlledCancellation({ ...request, failure: 'net::ERR_TIMED_OUT' }), false);
  assert.equal(isControlledCancellation({ ...request, method: 'POST' }), false);
});
