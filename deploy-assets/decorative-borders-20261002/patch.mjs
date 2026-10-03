import { parse } from 'acorn';
import postcss from 'postcss';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const marker = 'B46_CLEAN_MENU_SURFACES_20261003';
export const targets = [
  {
    name: '__B46_SCOREBAR_TUNE_CSS__',
    route: '/dashboard-v2-tune.css',
    css: `
/* ${marker}: menu/content decoration only; data, focus and active indicators retained */
body .workspace.singlepage > .left-rail .rail-card :is(.filter,.filter.active,.league-filter,.league-filter.active,.workspace-nav-row,.workspace-nav-row.active):not(:focus-visible),
body .workspace.singlepage > .left-rail :is(.filter,.league-filter,.workspace-nav-row) b,
body .workspace.singlepage > .left-rail .workspace-brand-card > .workspace-brand-meta[data-workspace-odds-slot],
body .workspace.singlepage > .left-rail .workspace-brand-meta[data-workspace-odds-slot] .odds-format-menu,
body .workspace.singlepage .workspace-theme-btn:not(:focus-visible),
body .workspace.singlepage .search-box:not(:focus-within),
body .workspace.singlepage .local-time,
body .workspace.singlepage .status-head,
body .workspace.singlepage .status-head > b,
body .workspace.singlepage .workspace-view-head,
body .workspace.singlepage .card-title,
body .workspace.singlepage .feature-facts,
body .workspace.singlepage .feature-signal,
body .workspace.singlepage .feature-events,
body .workspace.singlepage .event-item,
body .workspace.singlepage .overview-foot,
body .workspace.singlepage .show-more,
body .workspace.singlepage .show-more button:not(:focus-visible),
body .workspace.singlepage .sp-results-head,
body .workspace.singlepage .sp-table th,
body .workspace.singlepage .sp-table td,
body .workspace.singlepage .sp-pager,
body .workspace.singlepage .sp-filter-chip:not(:focus-visible),
body .workspace.singlepage .sp-page:not(:focus-visible),
body .workspace.singlepage .b46-perf-head,
body .workspace.singlepage .b46-perf-kpis,
body .workspace.singlepage .b46-perf-kpi,
body .workspace.singlepage .b46-perf-range,
body .workspace.singlepage .b46-perf-mode,
body .workspace.singlepage .b46-perf-toolbar,
body .workspace.singlepage .b46-perf-foot,
body .b46-mobile-workspace-nav,
body .b46-mobile-workspace-nav button:not(:focus-visible) { border-color: transparent !important; }
body .workspace.singlepage .league-block,
body .workspace.singlepage .match-row { border-top-color: transparent !important; border-bottom-color: transparent !important; }
body .workspace.singlepage .match-row .score-cell,
body .workspace.singlepage .match-row .signal-cell.prediction-live { border-left-color: transparent !important; }
body .workspace.singlepage .match-row .market-cell::before,
body .workspace.singlepage .match-row .signal-cell::after { background-color: transparent !important; }
body .workspace.singlepage .feature-signal-divider { background-color: transparent !important; }
body .workspace.singlepage .feature-facts { background-color: var(--panel-2) !important; }
body .workspace.singlepage .rail-title,
body .workspace.singlepage .status-head,
body .workspace.singlepage .league-head,
body .workspace.singlepage .card-title,
body .workspace.singlepage .workspace-stable-head,
body .workspace.singlepage .workspace-view-head,
body .workspace.singlepage .sp-stat-hero,
body .workspace.singlepage .sp-results-head,
body .workspace.singlepage .b46-perf-head {
  background-image: linear-gradient(110deg, color-mix(in srgb, var(--panel-2) 78%, var(--panel)), var(--panel) 76%) !important;
}
body .workspace.singlepage .sp-table tbody tr:nth-child(even):not(:hover) {
  background-color: color-mix(in srgb, var(--panel-2) 65%, var(--panel)) !important;
}
body .workspace.singlepage .rail-card:not(.workspace-scorebar-slot),
body .workspace.singlepage .side-card:not(.workspace-scorebar-slot),
body .workspace.singlepage .status-section,
body .workspace.singlepage .workspace-stable-head,
body .workspace.singlepage .workspace-view-head,
body .workspace.singlepage .sp-stat-hero,
body .workspace.singlepage .sp-kpis,
body .workspace.singlepage .sp-trend,
body .workspace.singlepage .sp-filters,
body .workspace.singlepage .sp-results,
body .workspace.singlepage .search-box:not(:focus-within),
body .workspace.singlepage .b46-perf-chart-wrap { box-shadow: none !important; }
`,
  },
  {
    name: '__B46_LEGAL_CSS_20261001__',
    route: '/legal.css',
    css: `
/* ${marker}: informational menu/content separators, not active navigation */
.site-header, .nav-wrap, .site-footer, .footer-bottom, .meta-row, .pill, .flow > div { border-color: transparent !important; }
.hero-card, .article { box-shadow: none !important; }
`,
  },
  {
    name: '__B46_FOOTER_CSS__',
    route: '/ball46-footer.css',
    css: `
/* ${marker}: unframed footer surface */
#b46-site-footer-v1, #b46-site-footer-v1 .b46f-bottom { border-color: transparent !important; }
`,
  },
];

export const sha = value => createHash('sha256').update(value).digest('hex');

export function validateAppendix(css) {
  const root = postcss.parse(css);
  root.walkAtRules(r => assert.fail(`APPENDIX_AT_RULE:${r.name}`));
  root.walkDecls(d => {
    assert(/^(?:border(?:-(?:top|right|bottom|left))?-color|background-color|background-image|box-shadow)$/.test(d.prop), `NON_PRESENTATION_PROPERTY:${d.prop}`);
    assert(d.important, `MISSING_IMPORTANT:${d.prop}`);
    assert(!/url\s*\(/i.test(d.value), 'APPENDIX_ASSET_REFERENCE');
    if (d.prop === 'box-shadow') assert.equal(d.value, 'none', 'NEW_DECORATIVE_SHADOW');
    if (d.prop === 'background-image') assert(d.value.startsWith('linear-gradient('), 'NON_GRADIENT_IMAGE');
  });
  return root;
}

export function borderChecks(css) {
  const checks = [];
  validateAppendix(css).walkRules(r => {
    const properties = [];
    r.walkDecls(d => {
      if (d.prop === 'border-color') properties.push('borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor');
      else if (/^border-(?:top|right|bottom|left)-color$/.test(d.prop)) properties.push(d.prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
    });
    if (properties.length) checks.push({ selector: r.selector, properties });
  });
  return checks;
}

export function constants(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const found = new Map();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      const name = node.id.name;
      if (targets.some(t => t.name === name) || name === '__B46_SCOREBAR_BG_B64__') {
        assert(!found.has(name), `DUPLICATE_CONSTANT:${name}`);
        assert(node.init, `MISSING_INITIALIZER:${name}`);
        const raw = source.slice(node.init.start, node.init.end);
        found.set(name, { start: node.init.start, end: node.init.end, value: JSON.parse(raw) });
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object') walk(child);
    }
  };
  walk(ast);
  return found;
}

function replaceRanges(source, ranges) {
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) {
    source = source.slice(0, r.start) + r.text + source.slice(r.end);
  }
  return source;
}

export function normalize(source) {
  const c = constants(source);
  return replaceRanges(source, targets.map(t => {
    assert(c.has(t.name), `CSS_CONSTANT_MISSING:${t.name}`);
    return { ...c.get(t.name), text: '"__APPROVED_CSS_BYTES__"' };
  }));
}

export function patch(source) {
  const c = constants(source);
  const changes = targets.map(t => {
    const entry = c.get(t.name);
    assert(entry && typeof entry.value === 'string', `CSS_CONSTANT_MISSING:${t.name}`);
    postcss.parse(entry.value);
    validateAppendix(t.css);
    if (entry.value.includes(marker)) assert(entry.value.endsWith(t.css), `EXISTING_PATCH_DIFFERS:${t.name}`);
    const after = entry.value.includes(marker) ? entry.value : entry.value + t.css;
    assert(after === entry.value || after === entry.value + t.css, 'NON_ADDITIVE_CSS');
    return { ...t, before: entry.value, after, beforeSha: sha(entry.value), afterSha: sha(after), ...entry };
  });
  const after = replaceRanges(source, changes.map(c => ({ ...c, text: JSON.stringify(c.after) })));
  assert.equal(normalize(after), normalize(source), 'CODE_CHANGED_OUTSIDE_CSS_LITERALS');
  assert.equal(JSON.stringify(constants(after).get('__B46_SCOREBAR_BG_B64__')?.value), JSON.stringify(c.get('__B46_SCOREBAR_BG_B64__')?.value), 'SCOREBAR_IMAGE_BYTES_CHANGED');
  return { after, changes, codeSha: sha(normalize(source)) };
}
