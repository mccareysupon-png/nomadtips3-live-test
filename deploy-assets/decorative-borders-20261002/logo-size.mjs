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
export const brandCardSelector = 'body .workspace.singlepage > .left-rail .workspace-brand-card';
export const oddsRowSelector = `${brandCardSelector} > .workspace-brand-meta[data-workspace-odds-slot]`;
export const oddsControlSelector = `${oddsRowSelector} .odds-format-control`;
export const oddsButtonSelector = `${oddsRowSelector} .odds-format-button[data-odds-format-button]`;
export const logoCss = `
/* ${marker}: scale only the existing header wordmark; reserve its full layout size */
${logoSelector} { zoom: 1.3 !important; }
`;
const enlargedThemeCss = `
/* ${themeMarker}: aligned transparent controls in the existing odds row below the logo */
${brandCardSelector} {
  display: block !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
}
${oddsRowSelector} {
  height: 28px !important;
  min-height: 28px !important;
  max-height: 28px !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  background-color: transparent !important;
}
${oddsControlSelector} {
  flex: 0 1 auto !important;
  width: auto !important;
  min-width: 0 !important;
  height: 28px !important;
  min-height: 28px !important;
}
${oddsButtonSelector} {
  width: auto !important;
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 !important;
  border: 0 !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  color: var(--text) !important;
  font-family: Arial, sans-serif !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  letter-spacing: 0 !important;
  white-space: nowrap !important;
}
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
  font-family: Arial, sans-serif !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  letter-spacing: 0 !important;
  white-space: nowrap !important;
  box-shadow: none !important;
}
${themeSelector}:hover {
  color: var(--green) !important;
  background-color: transparent !important;
}
${themeSelector}:focus-visible, ${oddsButtonSelector}:focus-visible {
  outline: 2px solid var(--green) !important;
  outline-offset: 2px !important;
}
`;
const compactFontSelector = `${themeSelector}, ${oddsButtonSelector}`;
export const themeCss = enlargedThemeCss.replaceAll('font-size: 11px !important', 'font-size: 7px !important') + `
@media (max-width: 760px) {
  ${compactFontSelector} { font-size: 6.5px !important; }
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
// Preserve both existing click handlers; only their toolbar presentation changes.
export const themeScriptName = '__B46_THEME_TOOLBAR_JS__';
export const themeScriptRoute = '/dashboard-v2-tune.js';
const labelMarker = 'B46_COMPACT_THEME_LABEL_20261003';
const legacyThemeLabels = `
/* ${labelMarker}: presentation only; the existing click handler still switches themes */
(function(){
  function mount(){
    const button=document.querySelector('[data-theme-toggle]');
    if(!button)return;
    if(!document.getElementById('b46-compact-toolbar-style')){
      const style=document.createElement('style');
      style.id='b46-compact-toolbar-style';
      style.textContent=${JSON.stringify(enlargedThemeCss)};
      document.head.append(style);
    }
    function update(){
      const slot=document.querySelector('.workspace-brand-meta[data-workspace-odds-slot]');
      if(slot&&slot.lastElementChild!==button)slot.append(button);
      const label=document.documentElement.dataset.theme==='dark'?'Light':'Dark';
      if(button.textContent!==label)button.textContent=label;
      button.title='Switch to '+label.toLowerCase()+' mode';
    }
    const observer=new MutationObserver(update);
    observer.observe(button,{childList:true});
    observer.observe(document.body,{childList:true,subtree:true});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
`;
export const themeLabels = `
/* ${labelMarker}: presentation only; the existing click handler still switches themes */
(function(){
  function mount(){
    if(!document.getElementById('b46-compact-toolbar-style')){
      const style=document.createElement('style');
      style.id='b46-compact-toolbar-style';
      style.textContent=${JSON.stringify(themeCss)};
      document.head.append(style);
    }
    function update(){
      const button=document.querySelector('[data-theme-toggle]');
      if(!button)return;
      const slot=document.querySelector('.workspace-brand-meta[data-workspace-odds-slot]');
      if(slot&&slot.lastElementChild!==button)slot.append(button);
      const label=document.documentElement.dataset.theme==='dark'?'Light':'Dark';
      if(button.textContent!==label)button.textContent=label;
      button.title='Switch to '+label.toLowerCase()+' mode';
    }
    const observer=new MutationObserver(update);
    observer.observe(document.body,{childList:true,subtree:true});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    update();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
`;
const dedupeMarker = 'B46_MOBILE_CLOCK_DEDUP_20261003';
export function dedupeMobileClocks(root) {
  root.querySelectorAll('.workspace.singlepage .match-row .mobile-signal').forEach(status => {
    const clock = status.parentElement?.querySelector('.mobile-clock');
    const text = clock?.textContent.trim();
    if (text && status.textContent.trim() === text) status.remove();
  });
}
export const mobileClockDedupe = `
/* ${dedupeMarker}: remove only the redundant mobile copy of the same clock */
(function(){
  ${dedupeMobileClocks.toString()}
  function mount(){
    const sync=()=>dedupeMobileClocks(document);
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    sync();
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
  if (script.includes(dedupeMarker)) {
    assert(script.endsWith(mobileClockDedupe), 'EXISTING_MOBILE_CLOCK_DEDUPE_DIFFERS');
    script = script.slice(0, -mobileClockDedupe.length);
  }
  if (!script.includes(labelMarker)) return script;
  const previousAsyncLabels = themeLabels.replace(JSON.stringify(themeCss), JSON.stringify(enlargedThemeCss));
  const suffix = [themeLabels, legacyThemeLabels, previousAsyncLabels].find(value => script.endsWith(value));
  assert(suffix, 'EXISTING_THEME_LABEL_SCRIPT_DIFFERS');
  return script.slice(0, -suffix.length);
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
  root.walkAtRules(r => assert(r.name === 'media' && r.params === '(max-width: 760px)', 'LOGO_CSS_AT_RULE'));
  const focusSelector = `${themeSelector}:focus-visible, ${oddsButtonSelector}:focus-visible`;
  const layoutProperties = new Map([
    [brandCardSelector, ['display','height','min-height','max-height']],
    [oddsRowSelector, ['height','min-height','max-height','align-items','justify-content','gap','background-color']],
    [oddsControlSelector, ['flex','width','min-width','height','min-height']],
    [oddsButtonSelector, ['width','height','min-height','padding','border','background-color','background-image','box-shadow','color','font-family','font-size','font-weight','line-height','letter-spacing','white-space']],
  ]);
  const selectors = new Set([logoSelector, themeSelector, `${themeSelector}:hover`, focusSelector, compactFontSelector, ...layoutProperties.keys()]);
  root.walkRules(r => assert(selectors.has(r.selector), 'PRESENTATION_CSS_SCOPE_CHANGED'));
  root.walkRules(r => {
    r.walkDecls(d => {
      assert(d.important, 'PRESENTATION_CSS_IMPORTANT_REQUIRED');
      if (r.selector === logoSelector) assert(d.prop === 'zoom' && d.value === '1.3', 'LOGO_CSS_NOT_EXACT_130_PERCENT');
      else if (r.selector === themeSelector) {
        assert(['width','flex','height','padding','border','border-radius','background-color','background-image','color','font-family','font-size','font-weight','line-height','letter-spacing','white-space','box-shadow'].includes(d.prop), `THEME_CSS_PROPERTY_NOT_ALLOWED:${d.prop}`);
        if (d.prop === 'width') assert.equal(d.value, '48px', 'THEME_WIDTH_NOT_COMPACT');
        if (d.prop === 'flex') assert.equal(d.value, '0 0 48px', 'THEME_FLEX_BASIS_NOT_COMPACT');
        if (d.prop === 'height') assert.equal(d.value, '28px', 'THEME_HEIGHT_NOT_COMPACT');
        if (d.prop === 'border-radius') assert.equal(d.value, '5px', 'THEME_SHAPE_NOT_COMPACT');
      }
      else if (r.selector === compactFontSelector) assert(d.prop === 'font-size' && d.value === '6.5px', 'MOBILE_FONT_NOT_ORIGINAL_SIZE');
      else if (layoutProperties.has(r.selector)) assert(layoutProperties.get(r.selector).includes(d.prop), `TOOLBAR_CSS_PROPERTY_NOT_ALLOWED:${d.prop}`);
      else if (r.selector === `${themeSelector}:hover`) assert(['color','background-color'].includes(d.prop), 'THEME_HOVER_NOT_TRANSPARENT');
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
    assert([themeCss, enlargedThemeCss, legacyThemeCss, legacyFixedWidth].includes(existingTheme), 'EXISTING_THEME_PATCH_DIFFERS');
  }
  const cssAfter = beforeTheme + themeCss;
  const originalScript = originalThemeScript(themeScript);
  parse(originalScript, { ecmaVersion: 'latest' });
  const scriptAfter = originalScript + themeLabels + mobileClockDedupe;
  parse(scriptAfter, { ecmaVersion: 'latest' });
  assert.equal(originalThemeScript(scriptAfter), originalScript, 'THEME_SCRIPT_PREFIX_CHANGED');
  const existingScript = c.get(themeScriptName);
  if (existingScript) assert.equal(existingScript.value, themeScript, 'SOURCE_THEME_SCRIPT_DIFFERS');
  let after = source.slice(0, entry.start) + JSON.stringify(cssAfter) + source.slice(entry.end);
  if (!existingScript) {
    after = replaceOnce(after, 'function __b46Text(body,type)', `const ${themeScriptName}=${JSON.stringify(scriptAfter)};\nfunction __b46Text(body,type)`);
    after = replaceOnce(after, cssRoute, cssRoute + scriptOverride);
  } else {
    const scriptEntry = constants(after).get(themeScriptName);
    after = after.slice(0, scriptEntry.start) + JSON.stringify(scriptAfter) + after.slice(scriptEntry.end);
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
