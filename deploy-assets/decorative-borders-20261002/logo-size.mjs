import assert from 'node:assert/strict';
import { parse } from 'acorn';
import postcss from 'postcss';
import { constants as cssConstants, normalize as normalizeCss, sha } from './patch.mjs';

export { sha };
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
/* ${themeMarker}: compact one-click theme control for the workspace toolbar */
${themeSelector} {
  width: 48px !important;
  flex: 0 0 48px !important;
  height: 28px !important;
  padding: 0 6px !important;
  border: 0 !important;
  border-radius: 5px !important;
  background-color: transparent !important;
  background-image: none !important;
  color: var(--text) !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  box-shadow: none !important;
}
${themeSelector}:hover {
  color: var(--green) !important;
}
${themeSelector}:focus-visible {
  outline: 2px solid var(--green) !important;
  outline-offset: 2px !important;
}
`;
const legacyThemeCss = `
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
export const themeScriptName = '__B46_THEME_TOOLBAR_JS__';
export const themeScriptRoute = '/dashboard-v2-tune.js';
const labelMarker = 'B46_COMPACT_THEME_LABEL_20261003';
export const themeLabels = `
/* ${labelMarker}: presentation only; the existing click handler still switches themes */
(function(){
  function mount(){
    const button=document.querySelector('[data-theme-toggle]');
    if(!button)return;
    function update(){
      const label=document.documentElement.dataset.theme==='dark'?'Light':'Dark';
      if(button.textContent!==label)button.textContent=label;
      button.title='Switch to '+label.toLowerCase()+' mode';
    }
    const observer=new MutationObserver(update);
    observer.observe(button,{childList:true});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
`;
export const targets = [
  { name: '__B46_SCOREBAR_TUNE_CSS__', route: '/dashboard-v2-tune.css', css: themeCss, type: 'css' },
  { name: themeScriptName, route: themeScriptRoute, type: 'javascript' },
];
const cssRoute = "if(url.pathname==='/dashboard-v2-tune.css')return __b46Text(__B46_SCOREBAR_TUNE_CSS__,'text/css; charset=utf-8');";
const scriptOverride = `if(url.pathname==='${themeScriptRoute}')return __b46Text(${themeScriptName},'application/javascript; charset=utf-8');`;

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, 'THEME_ANCHOR_NOT_UNIQUE');
  return source.replace(before, () => after);
}

export function constants(source) {
  const found = cssConstants(source);
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) {
      if (d.id.name !== themeScriptName) continue;
      assert(!found.has(themeScriptName), 'DUPLICATE_THEME_CONSTANT');
      assert(d.init?.type === 'Literal' && typeof d.init.value === 'string', 'INVALID_THEME_CONSTANT');
      found.set(themeScriptName, { start: d.init.start, end: d.init.end, value: d.init.value });
    }
  }
  return found;
}

export function originalThemeScript(script) {
  if (!script.includes(labelMarker)) return script;
  assert(script.endsWith(themeLabels), 'EXISTING_THEME_LABEL_SCRIPT_DIFFERS');
  return script.slice(0, -themeLabels.length);
}

export function normalize(source) {
  const existing = constants(source).get(themeScriptName);
  if (existing) {
    source = replaceOnce(source, `const ${themeScriptName}=${JSON.stringify(existing.value)};\n`, '');
    source = replaceOnce(source, scriptOverride, '');
  } else assert(!source.includes(scriptOverride), 'THEME_ROUTE_WITHOUT_CONSTANT');
  return normalizeCss(source);
}

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
        assert(['width','flex','height','padding','border','border-radius','background-color','background-image','color','font-size','font-weight','line-height','white-space','box-shadow'].includes(d.prop), `THEME_CSS_PROPERTY_NOT_ALLOWED:${d.prop}`);
        if (d.prop === 'width') assert.equal(d.value, '48px', 'THEME_WIDTH_NOT_COMPACT');
        if (d.prop === 'flex') assert.equal(d.value, '0 0 48px', 'THEME_FLEX_BASIS_NOT_COMPACT');
        if (d.prop === 'height') assert.equal(d.value, '28px', 'THEME_HEIGHT_NOT_COMPACT');
        if (d.prop === 'border-radius') assert.equal(d.value, '5px', 'THEME_SHAPE_NOT_COMPACT');
      }
      else if (r.selector === `${themeSelector}:hover`) assert(d.prop === 'color', 'THEME_HOVER_NOT_TEXT_ONLY');
      else assert(['outline','outline-offset'].includes(d.prop), `THEME_FOCUS_PROPERTY_NOT_ALLOWED:${d.prop}`);
    });
  });
  if (hasLogo) assert.equal(root.nodes.filter(n => n.type === 'rule' && n.selector === logoSelector).length, 1, 'LOGO_CSS_DECLARATION_COUNT');
  if (hasTheme) assert.equal(root.nodes.filter(n => n.type === 'rule' && n.selector === themeSelector).length, 1, 'THEME_CSS_DECLARATION_COUNT');
  return [];
}

export function patch(source, { themeScript }) {
  assert(typeof themeScript === 'string', 'PUBLIC_THEME_SCRIPT_REQUIRED');
  borderChecks(logoCss + themeCss);
  const c = constants(source), target = targets[0], entry = c.get(target.name);
  assert(entry?.value.includes('B46_MATCH_CLOCK_COLORS_20261003'), 'CURRENT_CLOCK_COLORS_REQUIRED');
  assert(entry.value.includes('B46_CLEAN_MENU_SURFACES_20261003'), 'CURRENT_CLEAN_MENUS_REQUIRED');
  assert(entry.value.includes(marker), 'CURRENT_LOGO_PATCH_REQUIRED');
  const themeStart = entry.value.indexOf(`/* ${themeMarker}`);
  const beforeTheme = themeStart >= 0
    ? entry.value.slice(0, themeStart).replace(/\s$/, '')
    : entry.value;
  assert(beforeTheme.endsWith(logoCss), 'EXISTING_LOGO_PATCH_DIFFERS');
  if (themeStart >= 0) {
    const existingTheme = entry.value.slice(themeStart - 1);
    const legacyFixedWidth = legacyThemeCss.replace('  width: 72px !important;\n', '  width: 72px !important;\n  flex: 0 0 72px !important;\n');
    assert([themeCss, legacyThemeCss, legacyFixedWidth].includes(existingTheme), 'EXISTING_THEME_PATCH_DIFFERS');
  }
  const cssAfter = beforeTheme + themeCss;
  const originalScript = originalThemeScript(themeScript);
  parse(originalScript, { ecmaVersion: 'latest' });
  const scriptAfter = originalScript + themeLabels;
  parse(scriptAfter, { ecmaVersion: 'latest' });
  assert.equal(originalThemeScript(scriptAfter), originalScript, 'THEME_SCRIPT_PREFIX_CHANGED');
  const existingScript = c.get(themeScriptName);
  if (existingScript) assert.equal(existingScript.value, themeScript, 'SOURCE_THEME_SCRIPT_DIFFERS');
  let after = source.slice(0, entry.start) + JSON.stringify(cssAfter) + source.slice(entry.end);
  if (!existingScript) {
    after = replaceOnce(after, 'function __b46Text(body,type)', `const ${themeScriptName}=${JSON.stringify(scriptAfter)};\nfunction __b46Text(body,type)`);
    after = replaceOnce(after, cssRoute, cssRoute + scriptOverride);
  }
  assert.equal(normalize(after), normalize(source), 'CODE_CHANGED_OUTSIDE_LOGO_CSS');
  assert.equal(JSON.stringify(constants(after).get('__B46_SCOREBAR_BG_B64__')?.value), JSON.stringify(c.get('__B46_SCOREBAR_BG_B64__')?.value), 'SCOREBAR_IMAGES_CHANGED');
  return {
    after,
    changes: [
      { ...target, before: entry.value, after: cssAfter, beforeSha: sha(entry.value), afterSha: sha(cssAfter) },
      { ...targets[1], before: themeScript, after: scriptAfter, beforeSha: sha(themeScript), afterSha: sha(scriptAfter) },
    ],
    codeSha: sha(normalize(source)),
  };
}
