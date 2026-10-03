import assert from 'node:assert/strict';
import postcss from 'postcss';
import { constants, normalize, sha } from './patch.mjs';

export { constants, normalize, sha };
export { clockRoute } from './live-clock.mjs';
export const marker = 'B46_HEADER_LOGO_130_PERCENT_20261003';
export const themeMarker = 'B46_THEME_TOGGLE_STANDARD_20261003';
export const logoSelector = 'body .workspace.singlepage > .left-rail .workspace-brand[aria-label="Ball46"]';
export const themeSelector = 'body .workspace.singlepage > .left-rail .workspace-theme-btn[data-theme-toggle]';
export const logoCss = `
/* ${marker}: scale only the existing header wordmark; reserve its full layout size */
${logoSelector} { zoom: 1.3 !important; }
`;
export const themeCss = `
/* ${themeMarker}: global-standard, one-click theme control with a generous touch target */
${themeSelector} {
  width: 72px !important;
  height: 40px !important;
  padding: 0 12px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background-color: var(--panel-2) !important;
  color: var(--text) !important;
  font-size: 10px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  box-shadow: 0 2px 8px rgba(0,0,0,.14) !important;
}
${themeSelector}:hover {
  background-color: color-mix(in srgb, var(--panel-2) 72%, var(--green)) !important;
}
${themeSelector}:focus-visible {
  outline: 2px solid var(--green) !important;
  outline-offset: 2px !important;
}
`;
// The logo rule is already active in Production; this run adds only the existing theme button's styling.
export const targets = [{ name: '__B46_SCOREBAR_TUNE_CSS__', route: '/dashboard-v2-tune.css', css: themeCss, type: 'css' }];

export function borderChecks(css) {
  const root = postcss.parse(css);
  const hasLogo = css.includes(marker);
  const hasTheme = css.includes(themeMarker);
  assert(hasLogo || hasTheme, 'PRESENTATION_CSS_MARKER_MISSING');
  root.walkAtRules(() => assert.fail('LOGO_CSS_AT_RULE'));
  const selectors = new Set([logoSelector, themeSelector, `${themeSelector}:hover`, `${themeSelector}:focus-visible`]);
  root.walkRules(r => assert(selectors.has(r.selector), 'PRESENTATION_CSS_SCOPE_CHANGED'));
  root.walkRules(r => {
    r.walkDecls(d => {
      assert(d.important, 'PRESENTATION_CSS_IMPORTANT_REQUIRED');
      if (r.selector === logoSelector) assert(d.prop === 'zoom' && d.value === '1.3', 'LOGO_CSS_NOT_EXACT_130_PERCENT');
      else if (r.selector === themeSelector) {
        assert(['width','height','padding','border','border-radius','background-color','color','font-size','font-weight','line-height','white-space','box-shadow'].includes(d.prop), `THEME_CSS_PROPERTY_NOT_ALLOWED:${d.prop}`);
        if (d.prop === 'width') assert.equal(d.value, '72px', 'THEME_WIDTH_NOT_STANDARD');
        if (d.prop === 'height') assert.equal(d.value, '40px', 'THEME_HEIGHT_NOT_STANDARD');
        if (d.prop === 'border-radius') assert.equal(d.value, '999px', 'THEME_SHAPE_NOT_PILL');
      }
      else if (r.selector === `${themeSelector}:hover`) assert(d.prop === 'background-color', 'THEME_HOVER_NOT_SURFACE_ONLY');
      else assert(['outline','outline-offset'].includes(d.prop), `THEME_FOCUS_PROPERTY_NOT_ALLOWED:${d.prop}`);
    });
  });
  if (hasLogo) assert.equal(root.nodes.filter(n => n.type === 'rule' && n.selector === logoSelector).length, 1, 'LOGO_CSS_DECLARATION_COUNT');
  if (hasTheme) assert.equal(root.nodes.filter(n => n.type === 'rule' && n.selector === themeSelector).length, 1, 'THEME_CSS_DECLARATION_COUNT');
  return [];
}

export function patch(source) {
  borderChecks(logoCss + themeCss);
  const c = constants(source), target = targets[0], entry = c.get(target.name);
  assert(entry?.value.includes('B46_MATCH_CLOCK_COLORS_20261003'), 'CURRENT_CLOCK_COLORS_REQUIRED');
  assert(entry.value.includes('B46_CLEAN_MENU_SURFACES_20261003'), 'CURRENT_CLEAN_MENUS_REQUIRED');
  assert(entry.value.includes(marker), 'CURRENT_LOGO_PATCH_REQUIRED');
  const beforeTheme = entry.value.includes(themeMarker) ? entry.value.slice(0, -themeCss.length) : entry.value;
  assert(beforeTheme.endsWith(logoCss), 'EXISTING_LOGO_PATCH_DIFFERS');
  if (entry.value.includes(themeMarker)) assert(entry.value.endsWith(themeCss), 'EXISTING_THEME_PATCH_DIFFERS');
  const cssAfter = entry.value.includes(themeMarker) ? entry.value : entry.value + themeCss;
  const after = source.slice(0, entry.start) + JSON.stringify(cssAfter) + source.slice(entry.end);
  assert.equal(normalize(after), normalize(source), 'CODE_CHANGED_OUTSIDE_LOGO_CSS');
  assert.equal(JSON.stringify(constants(after).get('__B46_SCOREBAR_BG_B64__')?.value), JSON.stringify(c.get('__B46_SCOREBAR_BG_B64__')?.value), 'SCOREBAR_IMAGES_CHANGED');
  return {
    after,
    changes: [{ ...target, before: entry.value, after: cssAfter, beforeSha: sha(entry.value), afterSha: sha(cssAfter) }],
    codeSha: sha(normalize(source)),
  };
}

