import assert from 'node:assert/strict';
import test from 'node:test';
import postcss from 'postcss';
import { literals } from './production.mjs';
import { patch, normalize, frameCss, states, cell } from './scorebar-frame-patch.mjs';

test('append only the frame CSS literal, preserving executable code and image bytes', () => {
  const css = '/* B46_MAIN_CARDS_SQUARE_20261003 */ .existing{border-radius:0}';
  const source = `const __B46_SCOREBAR_BG_B64__='unchanged-images';const __B46_SCOREBAR_TUNE_CSS__=${JSON.stringify(css)};export default {fetch(){return new Response('unchanged')}};`;
  const result = patch(source);
  assert.equal(result.beforeCss, css);
  assert.equal(result.afterCss, css + frameCss);
  assert.equal(normalize(result.after), normalize(source));
  assert.equal(literals(result.after).get('__B46_SCOREBAR_BG_B64__').value, 'unchanged-images');
  assert.throws(() => patch(result.after), /ALREADY_PRESENT/);
  assert.throws(() => patch('const __B46_SCOREBAR_TUNE_CSS__="old";'), /SQUARE_CARDS_MISSING/);
});

test('four card themes, placeholder exclusion and shadows only: no layout, fonts or renderer edits', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(states).map(([key, value]) => [key, value.rgb])), { win: '34,197,94', loss: '239,68,68', draw: '203,213,225', pending: '249,115,22' });
  const root = postcss.parse(frameCss);
  const rules = root.nodes.filter(node => node.type === 'rule');
  assert.equal(rules.length, 5);
  rules.forEach(rule => rule.selectors.forEach(selector => {
    assert(selector.startsWith(cell));
    assert(selector.endsWith(':not(.placeholder)'));
  }));
  const declarations = [];
  root.walkDecls(declaration => declarations.push(declaration));
  assert.equal(declarations.length, 5);
  assert(declarations.every(declaration => ['--b46-scorebar-frame-rgb', 'box-shadow'].includes(declaration.prop)));
  const shadow = declarations.find(declaration => declaration.prop === 'box-shadow');
  assert(shadow.important);
  assert.equal(shadow.value, 'inset 0 0 0 1px rgba(var(--b46-scorebar-frame-rgb), .95), inset 0 0 6px 1px rgba(var(--b46-scorebar-frame-rgb), .32)');
});
