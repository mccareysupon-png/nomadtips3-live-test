import assert from 'node:assert/strict';
import postcss from 'postcss';
import { constants, normalize, sha } from './patch.mjs';

export { constants, sha };
export const marker = 'B46_MAIN_CARDS_SQUARE_20261003';
export const dashboardCards = 'body .workspace.singlepage :is(.rail-card,.side-card,.status-section,.workspace-stable-head,.workspace-view-head,.workspace-scorebar-slot,.sp-stat-hero,.sp-kpis,.sp-trend,.sp-filters,.sp-results,.board-loading,.board-empty,.match-row)';
export const informationCards = 'body :is(.hero-card,.article,.card)';
export const cardSelectors = `${dashboardCards},${informationCards},.settings-card`;
export const targets = [
  { name: '__B46_SCOREBAR_TUNE_CSS__', route: '/dashboard-v2-tune.css', type: 'css', selector: dashboardCards },
  { name: '__B46_LEGAL_CSS_20261001__', route: '/legal.css', type: 'css', selector: informationCards },
].map(target => ({
  ...target,
  css: `\n/* ${marker}: main card corners only; controls and data graphics retain their shapes */\n${target.selector} { border-radius: 0 !important; }\n`,
}));

export function borderChecks(css) {
  const root = postcss.parse(css);
  assert(css.includes(marker), 'SQUARE_CARD_MARKER_MISSING');
  root.walkAtRules(rule => assert.fail(`SQUARE_CARD_AT_RULE:${rule.name}`));
  let count = 0;
  root.walkRules(rule => {
    assert(targets.some(target => target.selector === rule.selector), 'SQUARE_CARD_SELECTOR_CHANGED');
    assert.equal(rule.nodes.length, 1, 'SQUARE_CARD_EXTRA_DECLARATION');
    rule.walkDecls(declaration => {
      assert.equal(declaration.prop, 'border-radius', 'SQUARE_CARD_NON_RADIUS_PROPERTY');
      assert.equal(declaration.value, '0', 'SQUARE_CARD_NOT_ZERO');
      assert(declaration.important, 'SQUARE_CARD_IMPORTANT_REQUIRED');
      count++;
    });
  });
  assert(count > 0, 'SQUARE_CARD_RULE_MISSING');
  return [];
}

export function patch(source) {
  const current = constants(source);
  const changes = targets.map(target => {
    const entry = current.get(target.name);
    assert(typeof entry?.value === 'string', `SQUARE_CARD_CSS_MISSING:${target.name}`);
    postcss.parse(entry.value);
    borderChecks(target.css);
    if (entry.value.includes(marker)) assert(entry.value.endsWith(target.css), `EXISTING_SQUARE_CARD_PATCH_DIFFERS:${target.name}`);
    const after = entry.value.includes(marker) ? entry.value : entry.value + target.css;
    return { ...target, ...entry, before: entry.value, after, beforeSha: sha(entry.value), afterSha: sha(after) };
  });
  let after = source;
  for (const change of [...changes].sort((a, b) => b.start - a.start)) {
    after = after.slice(0, change.start) + JSON.stringify(change.after) + after.slice(change.end);
  }
  assert.equal(normalize(after), normalize(source), 'CODE_CHANGED_OUTSIDE_CARD_CSS');
  assert.equal(JSON.stringify(constants(after).get('__B46_SCOREBAR_BG_B64__')?.value), JSON.stringify(current.get('__B46_SCOREBAR_BG_B64__')?.value), 'SCOREBAR_IMAGES_CHANGED');
  return { after, changes, codeSha: sha(normalize(source)) };
}
