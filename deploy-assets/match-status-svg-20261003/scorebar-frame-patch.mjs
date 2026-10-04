import assert from 'node:assert/strict';
import { literals, sha } from './production.mjs';

export const route = '/dashboard-v2-tune.css';
export const marker = 'B46_SCOREBAR_STATE_FRAME_20261004';
export const cell = 'body .workspace.singlepage .workspace-scorebar-slot > .workspace-scorebar-grid > .workspace-scorebar-cell';
export const states = {
  win: { suffix: '.workspace-scorebar-signal-result.outcome-win', rgb: '34,197,94' },
  loss: { suffix: '.workspace-scorebar-signal-result.outcome-loss', rgb: '239,68,68' },
  draw: { suffix: '.workspace-scorebar-signal-result.outcome-draw', rgb: '203,213,225' },
  pending: { suffix: '.workspace-scorebar-pending', rgb: '249,115,22' },
};
export const frameCss = `\n/* ${marker}: inset state frames; existing images, content and geometry preserved */
${Object.values(states).map(({ suffix, rgb }) => `${cell}${suffix}:not(.placeholder) { --b46-scorebar-frame-rgb: ${rgb}; }`).join('\n')}
${Object.values(states).map(({ suffix }) => `${cell}${suffix}:not(.placeholder)`).join(',\n')} {
  box-shadow: inset 0 0 0 1px rgba(var(--b46-scorebar-frame-rgb), .95), inset 0 0 6px 1px rgba(var(--b46-scorebar-frame-rgb), .32) !important;
}
`;

export function normalize(source) {
  const entry = literals(source).get('__B46_SCOREBAR_TUNE_CSS__');
  assert(entry, 'CURRENT_PRESENTATION_CSS_MISSING');
  return source.slice(0, entry.start) + '"CSS_ONLY_GUARD"' + source.slice(entry.end);
}

export function patch(source) {
  const entry = literals(source).get('__B46_SCOREBAR_TUNE_CSS__');
  assert(entry?.value.includes('B46_MAIN_CARDS_SQUARE_20261003'), 'CURRENT_SQUARE_CARDS_MISSING_STOP');
  const beforeCss = entry.value;
  assert(!beforeCss.includes(marker), 'SCOREBAR_FRAME_ALREADY_PRESENT_STOP');
  const afterCss = beforeCss + frameCss;
  const after = source.slice(0, entry.start) + JSON.stringify(afterCss) + source.slice(entry.end);
  assert.equal(normalize(after), normalize(source), 'NON_CSS_WORKER_BYTES_CHANGED_STOP');
  assert(afterCss.startsWith(beforeCss), 'EXISTING_CSS_BYTES_CHANGED_STOP');
  return { before: source, after, beforeCss, afterCss, beforeSha: sha(beforeCss), afterSha: sha(afterCss), nonCssSha: sha(normalize(source)) };
}
