import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFragment } from 'parse5';
import YAML from 'yaml';
import { icons, iconUri } from './icons.mjs';
import { patch, normalize, statusCss, validateCss, marker, obsoleteImport, removeObsoleteImport } from './patch.mjs';

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

test('workflow uses the new task branch and triggering commit with serialized deployment', () => {
  const parsed = YAML.parseDocument(readFileSync('../../.github/workflows/ball46-match-status-svg-20261003.yml', 'utf8'));
  assert.equal(parsed.errors.length, 0);
  const config = parsed.toJS();
  assert.deepEqual(config.on.push.branches, ['work/ball46-match-status-svg-currentprod-20261003']);
  assert.equal(config.concurrency['cancel-in-progress'], false);
  assert.equal(config.jobs['status-icons'].steps[0].with.ref, undefined);
});
