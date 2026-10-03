import assert from 'node:assert/strict';
import postcss from 'postcss';
import { constants, normalize, sha } from './patch.mjs';

export { constants, normalize, sha };
export { clockRoute } from './live-clock.mjs';
export const marker = 'B46_HEADER_LOGO_130_PERCENT_20261003';
export const logoSelector = 'body .workspace.singlepage > .left-rail .workspace-brand[aria-label="Ball46"]';
export const logoCss = `
/* ${marker}: scale only the existing header wordmark; reserve its full layout size */
${logoSelector} { zoom: 1.3 !important; }
`;
export const targets = [{ name: '__B46_SCOREBAR_TUNE_CSS__', route: '/dashboard-v2-tune.css', css: logoCss, type: 'css' }];

export function borderChecks(css) {
  const root = postcss.parse(css);
  let count = 0;
  root.walkAtRules(() => assert.fail('LOGO_CSS_AT_RULE'));
  root.walkRules(r => assert.equal(r.selector, logoSelector, 'LOGO_CSS_SCOPE_CHANGED'));
  root.walkDecls(d => {
    count++;
    assert(d.prop === 'zoom' && d.value === '1.3' && d.important, 'LOGO_CSS_NOT_EXACT_130_PERCENT');
  });
  assert.equal(count, 1, 'LOGO_CSS_DECLARATION_COUNT');
  return [];
}

export function patch(source) {
  borderChecks(logoCss);
  const c = constants(source), target = targets[0], entry = c.get(target.name);
  assert(entry?.value.includes('B46_MATCH_CLOCK_COLORS_20261003'), 'CURRENT_CLOCK_COLORS_REQUIRED');
  assert(entry.value.includes('B46_CLEAN_MENU_SURFACES_20261003'), 'CURRENT_CLEAN_MENUS_REQUIRED');
  if (entry.value.includes(marker)) assert(entry.value.endsWith(logoCss), 'EXISTING_LOGO_PATCH_DIFFERS');
  const cssAfter = entry.value.includes(marker) ? entry.value : entry.value + logoCss;
  const after = source.slice(0, entry.start) + JSON.stringify(cssAfter) + source.slice(entry.end);
  assert.equal(normalize(after), normalize(source), 'CODE_CHANGED_OUTSIDE_LOGO_CSS');
  assert.equal(JSON.stringify(constants(after).get('__B46_SCOREBAR_BG_B64__')?.value), JSON.stringify(c.get('__B46_SCOREBAR_BG_B64__')?.value), 'SCOREBAR_IMAGES_CHANGED');
  return {
    after,
    changes: [{ ...target, before: entry.value, after: cssAfter, beforeSha: sha(entry.value), afterSha: sha(cssAfter) }],
    codeSha: sha(normalize(source)),
  };
}
