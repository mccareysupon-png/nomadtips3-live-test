import assert from 'node:assert/strict';
import postcss from 'postcss';
import { literals, sha } from './production.mjs';
import { icons, iconUri } from './icons.mjs';

export const marker = 'B46_MATCH_STATUS_DUOTONE_SVG_20261003';
export const constant = '__B46_SCOREBAR_TUNE_CSS__';
export const route = '/dashboard-v2-tune.css';
export const control = 'body .workspace.singlepage > .left-rail .rail-card > :is(button[data-status-filter],button[data-workspace-view="signal"])';
export const mobileSignal = 'body .b46-mobile-workspace-nav > button[data-b46-mobile-view="signal"]';
export const signalIcon = `${mobileSignal} > .b46-mobile-nav-icon`;
export const mainIcon = `${control} > span::before`;
const iconSurfaces = `${mainIcon},${signalIcon}`;
const activeIcons = `${control}.active > span::before,${mobileSignal}.active > .b46-mobile-nav-icon`;
const mask = key => `-webkit-mask-image: url("${iconUri(key)}") !important; mask-image: url("${iconUri(key)}") !important;`;
const stateSelector = key => key === 'signal' ? `${control}[data-workspace-view="signal"]` : `${control}[data-status-filter="${key}"]`;
export const statusCss = `
/* ${marker}: authored vector masks; native status controls, counts and handlers stay intact */
${control} { --b46-status-tone: var(--muted); }
${control} > span { gap: 6px !important; }
${control} > span > i { display: none !important; }
${mainIcon} { content: ""; }
${iconSurfaces} {
  display: block !important;
  width: 16px !important;
  height: 16px !important;
  flex: 0 0 16px !important;
  border-radius: 0 !important;
  background-color: var(--b46-status-tone, var(--amber)) !important;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  opacity: .82;
  pointer-events: none;
  transition: opacity 120ms ease, transform 120ms ease;
}
${Object.keys(icons).map(key => `${stateSelector(key)} > span::before { ${mask(key)} }`).join('\n')}
${signalIcon} { ${mask('signal')} }
${stateSelector('live')} { --b46-status-tone: var(--red); }
${stateSelector('signal')},${mobileSignal} { --b46-status-tone: var(--amber); }
${control}.active { --b46-status-tone: var(--green); }
${stateSelector('live')}.active { --b46-status-tone: var(--red); }
${stateSelector('signal')}.active { --b46-status-tone: var(--amber); }
${activeIcons} { opacity: 1 !important; }
${control}.active > b { color: inherit !important; }
@media (hover: hover) and (pointer: fine) {
  ${control}:hover { background-image: linear-gradient(100deg, color-mix(in srgb, var(--green) 7%, transparent), transparent) !important; }
  ${control}:hover > span::before,${mobileSignal}:hover > .b46-mobile-nav-icon { opacity: 1 !important; transform: scale(1.04); }
}
${control}:active > span::before,${mobileSignal}:active > .b46-mobile-nav-icon { opacity: 1 !important; transform: scale(.94); }
@media (prefers-reduced-motion: reduce) {
  ${iconSurfaces} { transition: none; transform: none !important; }
}
`;

export function validateCss(css) {
  assert.equal(css, statusCss, 'CSS_DIFF_OUTSIDE_APPROVED_MATCH_STATUS');
  postcss.parse(css).walkDecls(declaration => {
    assert(!['font-size','font-family','line-height','filter','outline','border','border-width'].includes(declaration.prop), `FORBIDDEN_STATUS_PROPERTY:${declaration.prop}`);
    for (const match of declaration.value.matchAll(/url\("([^"]+)"\)/g)) assert(Object.keys(icons).some(key => iconUri(key) === match[1]), 'NON_AUTHORED_ICON_URL');
  });
}

export function normalize(source) {
  const entry = literals(source).get(constant);
  assert(entry, 'ACTIVE_STATUS_CSS_MISSING');
  return source.slice(0, entry.start) + '"__STATUS_CSS_BYTES__"' + source.slice(entry.end);
}

export function patch(source) {
  const entry = literals(source).get(constant);
  assert(entry?.value.includes('B46_MAIN_CARDS_SQUARE_20261003'), 'LATEST_PRODUCTION_CARD_STYLE_REQUIRED');
  validateCss(statusCss);
  if (entry.value.includes(marker)) assert(entry.value.endsWith(statusCss), 'EXISTING_STATUS_PATCH_DIFFERS');
  const css = entry.value.includes(marker) ? entry.value : entry.value + statusCss;
  const after = source.slice(0, entry.start) + JSON.stringify(css) + source.slice(entry.end);
  assert.equal(normalize(after), normalize(source), 'NON_CSS_WORKER_BYTES_CHANGED_STOP');
  return { after, beforeCss: entry.value, afterCss: css, nonCssSha: sha(normalize(source)), beforeSha: sha(entry.value), afterSha: sha(css) };
}
