import { parse } from 'acorn';
import postcss from 'postcss';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const marker = 'B46_DECORATIVE_BORDER_CLEANUP_20261002';
export const targets = [
  {
    name: '__B46_SCOREBAR_TUNE_CSS__',
    route: '/dashboard-v2-tune.css',
    css: `
/* ${marker}: ornamental frames only; scorebar and data geometry preserved */
.rail-card:not(.workspace-scorebar-slot),
.side-card:not(.workspace-scorebar-slot),
.status-section,
.workspace-stable-head,
.sp-workspace-head,
.sp-view-card,
.sp-stat-panel,
.sp-stat-hero,
.sp-kpis,
.sp-trend,
.sp-filters,
.sp-results,
.sp-toolbar,
.sp-kpi { border-color: transparent !important; }
.status-head,
.sp-results-head { border-bottom-color: color-mix(in srgb, var(--line) 35%, transparent) !important; }
.league-block + .league-block { border-top-color: color-mix(in srgb, var(--line) 35%, transparent) !important; }
.match-row { border-bottom-color: color-mix(in srgb, var(--line) 35%, transparent) !important; }
`,
  },
  {
    name: '__B46_LEGAL_CSS_20261001__',
    route: '/legal.css',
    css: `
/* ${marker}: information page frames only */
.hero-card, .article, .card { border-color: transparent !important; }
.site-header, .nav-wrap, .site-footer, .footer-bottom { border-color: color-mix(in srgb, var(--line) 35%, transparent) !important; }
`,
  },
  {
    name: '__B46_FOOTER_CSS__',
    route: '/ball46-footer.css',
    css: `
/* ${marker}: footer decoration only */
#b46-site-footer-v1 .b46f-contact { border-color: transparent !important; }
#b46-site-footer-v1 .b46f-bottom { border-top-color: color-mix(in srgb, var(--line) 35%, transparent) !important; }
`,
  },
];

export const sha = value => createHash('sha256').update(value).digest('hex');

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
    const appendix = postcss.parse(t.css);
    appendix.walkDecls(d => assert(/^border(?:-(?:top|right|bottom|left))?-color$/.test(d.prop), `NON_BORDER_PROPERTY:${d.prop}`));
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
