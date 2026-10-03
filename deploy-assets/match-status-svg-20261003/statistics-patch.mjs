import assert from 'node:assert/strict';
import { literals, sha } from './production.mjs';
import { iconUri } from './statistics-icons.mjs';

export const marketIcons = { all: 'total', '1x2': 'result', ah: 'ah', ou: 'ou', btts: 'btts', corners: 'corners', cards: 'cards', other: 'other' };
export const route = '/dashboard-v2-tune.css';
export const marker = 'B46_STATISTICS_V2_DUOTONE_SVG_20261003';
export const control = 'body .workspace.singlepage > .left-rail .workspace-stats-card .workspace-nav-grid > button[data-stat-market]';

export const statisticsCss = `\n/* ${marker}: approved SVGs only; native labels, counts, routes and statistics remain intact */
${control} > span > i { display: none !important; }
${control} > span::before {
  content: "";
  display: block;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border-radius: 0;
  background-color: var(--muted);
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
${Object.entries(marketIcons).map(([market, key]) => `${control}[data-stat-market="${market}"] > span::before { -webkit-mask-image: url("${iconUri(key)}"); mask-image: url("${iconUri(key)}"); }`).join('\n')}
${control}:hover > span::before { opacity: 1; transform: scale(1.04); }
${control}.active > span::before { opacity: 1; background-color: currentColor; }
${control}:active > span::before { opacity: 1; transform: scale(.94); }
@media (prefers-reduced-motion: reduce) { ${control} > span::before { transition: none; } }
`;

export function normalize(source) {
  const entry = literals(source).get('__B46_SCOREBAR_TUNE_CSS__');
  assert(entry, 'CURRENT_PRESENTATION_CSS_MISSING');
  return source.slice(0, entry.start) + '"CSS_ONLY_GUARD"' + source.slice(entry.end);
}

export function patch(source) {
  const entry = literals(source).get('__B46_SCOREBAR_TUNE_CSS__');
  assert(entry?.value.includes('B46_MATCH_STATUS_DUOTONE_SVG_20261003'), 'APPROVED_MATCH_STATUS_ICONS_MISSING_STOP');
  assert(entry.value.includes('B46_MAIN_CARDS_SQUARE_20261003'), 'CURRENT_SQUARE_CARDS_MISSING_STOP');
  const beforeCss = entry.value;
  let afterCss;
  if (beforeCss.includes(marker)) {
    assert(beforeCss.endsWith(statisticsCss), 'EXISTING_STATISTICS_ICON_CSS_DIFFERS_STOP');
    afterCss = beforeCss;
  } else afterCss = beforeCss + statisticsCss;
  const after = source.slice(0, entry.start) + JSON.stringify(afterCss) + source.slice(entry.end);
  assert.equal(normalize(after), normalize(source), 'NON_CSS_WORKER_BYTES_CHANGED_STOP');
  assert(afterCss.startsWith(beforeCss), 'EXISTING_CSS_BYTES_CHANGED_STOP');
  return { before: source, after, beforeCss, afterCss, beforeSha: sha(beforeCss), afterSha: sha(afterCss), nonCssSha: sha(normalize(source)) };
}
