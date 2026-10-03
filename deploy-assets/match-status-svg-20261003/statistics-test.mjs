import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { icons } from './statistics-icons.mjs';
import { icons as approvedMatchIcons } from './icons.mjs';
import { patch, normalize, statisticsCss, marketIcons, control } from './statistics-patch.mjs';
import postcss from 'postcss';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';

test('all eight approved statistics SVGs are vector-only and match the existing family', () => {
  assert.equal(Object.keys(icons).length, 8);
  assert.equal(icons.total, approvedMatchIcons.all);
  for (const svg of Object.values(icons)) {
    assert(svg.includes('viewBox="0 0 24 24"') && svg.includes('stroke-width="1.6"') && svg.includes('fill-opacity='));
    assert(!/<(?:script|image|text|foreignObject)\b|href=|on\w+=/i.test(svg));
  }
  assert.deepEqual(Object.keys(marketIcons), ['all', '1x2', 'ah', 'ou', 'btts', 'corners', 'cards', 'other']);
});

test('only append statistics CSS; preserve the complete existing stylesheet and all other worker bytes', () => {
  const css = '/* B46_MATCH_STATUS_DUOTONE_SVG_20261003 B46_MAIN_CARDS_SQUARE_20261003 */\nbody { color: black; }';
  const source = 'const __B46_SCOREBAR_TUNE_CSS__ = ' + JSON.stringify(css) + ';\nconst __B46_SCOREBAR_BG_B64__={win:"original"};export default { fetch() { return new Response("unchanged"); } };';
  const result = patch(source);
  assert.equal(result.afterCss, css + statisticsCss);
  assert.equal(normalize(result.after), normalize(source));
  assert.equal(patch(result.after).after, result.after);
  assert.throws(() => patch(source.replace('B46_MATCH_STATUS', 'REMOVED_STATUS')), /MATCH_STATUS/);
});

test('the CSS scope contains no font sizes, count changes, layouts, global rules, or other menus', () => {
  const tree = postcss.parse(statisticsCss);
  tree.walkRules(rule => assert(rule.selector.split(',').every(selector => selector.trim().startsWith(control))));
  const forbidden = ['font', 'font-size', 'font-family', 'font-weight', 'letter-spacing', 'padding', 'margin', 'grid-template-columns', 'filter', 'box-shadow', 'border'];
  tree.walkDecls(declaration => assert(!forbidden.includes(declaration.prop)));
  assert(!statisticsCss.includes('[data-status-filter]'));
  assert(!statisticsCss.includes('sampleCount'));
});

test('the original Production rail remains pinned and serialized', () => {
  const workflow = readFileSync('../../.github/workflows/ball46-odds-surgical-deploy-20260928.yml', 'utf8');
  assert(workflow.includes('ops/ball46-odds-surgical-20260928'));
  assert(workflow.includes('ball46-production-surgical'));
  assert(workflow.includes('cancel-in-progress: false'));
  const rail = readFileSync('rail.mjs', 'utf8');
  assert(rail.includes('36360390676') && rail.includes("wrangler: '4.92.0'"));
});

test('configuration verification preserves every runtime setting and custom annotation', () => {
  const before = { compatibility_date: '2026-09-09', bindings: [{ name: 'ENGINE', service: 'original' }], logpush: false, annotations: { 'workers/message': 'before', custom: 'keep' } };
  const after = { ...before, annotations: { ...before.annotations, 'workers/message': 'uploaded' } };
  assert.deepEqual(verifyConfiguration(before, after), { runtimeSettingsUnchanged: true, changedDeploymentMetadata: ['workers/message'] });
  assert.throws(() => verifyConfiguration(before, { ...after, compatibility_date: 'changed' }), /RUNTIME_SETTINGS/);
  assert.throws(() => verifyConfiguration(before, { ...after, bindings: [] }), /RUNTIME_SETTINGS/);
  assert.throws(() => verifyConfiguration(before, { ...after, logpush: true }), /RUNTIME_SETTINGS/);
  assert.throws(() => verifyConfiguration(before, { ...after, annotations: { ...after.annotations, custom: 'changed' } }), /CUSTOM_ANNOTATION/);
});

test('asset routing and Worker version bindings cannot change', () => {
  const version = { main_module: 'index.js', compatibility_date: '2026-09-09', bindings: [{ name: 'ASSETS', type: 'assets' }], assets: { config: { run_worker_first: true, html_handling: 'none' } } };
  assert.deepEqual(verifyVersionConfiguration(version, { ...version, compatibility_flags: [] }), { assetRoutingBindingsAndCompatibilityUnchanged: true });
  assert.throws(() => verifyVersionConfiguration(version, { ...version, assets: { config: { run_worker_first: false, html_handling: 'none' } } }), /ROUTING_OR_BINDINGS/);
  assert.throws(() => verifyVersionConfiguration(version, { ...version, bindings: [] }), /ROUTING_OR_BINDINGS/);
});
