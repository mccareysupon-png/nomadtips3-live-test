import assert from 'node:assert/strict';
import { parse } from 'acorn';
import postcss from 'postcss';
import { constants as cssConstants, normalize as normalizeCss, sha } from './patch.mjs';

export { sha };
export const marker = 'B46_MATCH_CLOCK_COLORS_20261003';
export const clockName = '__B46_MATCH_CLOCK_JS__';
export const clockRoute = '/color-semantics-343.js';
const cssName = '__B46_SCOREBAR_TUNE_CSS__';
export const clockCss = `
/* ${marker}: match-card clock text only */
body .workspace.singlepage .match-row .b46-clock-live-label { color: #cc2035 !important; }
body .workspace.singlepage .match-row .b46-clock-minute { color: #087d42 !important; }
body .workspace.singlepage .match-row .b46-clock-separator { color: var(--muted) !important; }
html[data-theme="dark"] body .workspace.singlepage .match-row .b46-clock-live-label { color: #ff6374 !important; }
html[data-theme="dark"] body .workspace.singlepage .match-row .b46-clock-minute { color: #43c77d !important; }
`;
export const targets = [
  { name: cssName, route: '/dashboard-v2-tune.css', css: clockCss, type: 'css' },
  { name: clockName, route: clockRoute, type: 'javascript' },
];

// Extend the existing colour painter, not the renderer or match-clock calculation.
export const painter = `/* ${marker} */
function paintMatchClock(el){
  if(!el)return;
  const raw=String(el.textContent||''),m=raw.match(/^(\\s*)(LIVE)(\\s*\\u00b7\\s*)(\\d{1,3}(?:\\+\\d{1,2})?['\\u2019]|HT|LIVE)(\\s*)$/);
  if(!m)return;
  const parts=el.children,minuteClass=m[4]==='LIVE'?'b46-clock-live-label':'b46-clock-minute';
  if(parts.length===3&&parts[0].className==='b46-clock-live-label'&&parts[0].textContent===m[2]&&parts[1].className==='b46-clock-separator'&&parts[1].textContent===m[3]&&parts[2].className===minuteClass&&parts[2].textContent===m[4])return;
  const nodes=[];
  if(m[1])nodes.push(document.createTextNode(m[1]));
  nodes.push(makeSpan(m[2],'b46-clock-live-label'),makeSpan(m[3],'b46-clock-separator'),makeSpan(m[4],minuteClass));
  if(m[5])nodes.push(document.createTextNode(m[5]));
  el.replaceChildren(...nodes);
}
`;
const oldHook = '  markLive(status,live);\n';
const hook = `${oldHook}  paintMatchClock(status);\n  row.querySelectorAll('.mobile-clock,.mobile-signal').forEach(paintMatchClock);\n`;
const cssRoute = "if(url.pathname==='/dashboard-v2-tune.css')return __b46Text(__B46_SCOREBAR_TUNE_CSS__,'text/css; charset=utf-8');";
const routeOverride = `if(url.pathname==='${clockRoute}')return __b46Text(${clockName},'application/javascript; charset=utf-8');`;

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, 'PRESENTATION_ANCHOR_NOT_UNIQUE');
  return source.replace(before, () => after);
}

export function originalClockScript(source) {
  if (!source.includes(marker)) return source;
  return replaceOnce(replaceOnce(source, painter, ''), hook, oldHook);
}

export function patchClockScript(source) {
  const original = originalClockScript(source);
  parse(original, { ecmaVersion: 'latest' });
  assert(original.includes("const VERSION='343-color-semantics-20260922a'"), 'UNREVIEWED_COLOR_PAINTER');
  const after = replaceOnce(replaceOnce(original, 'function processMatchRow(row){', painter + 'function processMatchRow(row){'), oldHook, hook);
  parse(after, { ecmaVersion: 'latest' });
  assert.equal(originalClockScript(after), original, 'COLOR_PAINTER_CHANGED_OUTSIDE_CLOCK_MARKUP');
  return after;
}

export function constants(source) {
  const found = cssConstants(source);
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) {
      if (d.id.name !== clockName) continue;
      assert(!found.has(clockName), 'DUPLICATE_CLOCK_CONSTANT');
      assert(d.init?.type === 'Literal' && typeof d.init.value === 'string', 'INVALID_CLOCK_CONSTANT');
      found.set(clockName, { start: d.init.start, end: d.init.end, value: d.init.value });
    }
  }
  return found;
}

export function borderChecks(css) {
  const root = postcss.parse(css);
  root.walkAtRules(() => assert.fail('CLOCK_CSS_AT_RULE'));
  root.walkDecls(d => assert(d.prop === 'color' && d.important, 'CLOCK_CSS_NOT_TEXT_COLOR_ONLY'));
  root.walkRules(r => assert(r.selector.includes('.match-row .b46-clock-'), 'CLOCK_CSS_OUTSIDE_MATCH_CARD'));
  return [];
}

export function normalize(source) {
  const c = constants(source).get(clockName);
  if (c) {
    source = replaceOnce(source, `const ${clockName}=${JSON.stringify(c.value)};\n`, '');
    source = replaceOnce(source, routeOverride, '');
  } else assert(!source.includes(routeOverride), 'CLOCK_ROUTE_WITHOUT_CONSTANT');
  return normalizeCss(source);
}

export function patch(source, { clockScript }) {
  assert(typeof clockScript === 'string', 'PUBLIC_CLOCK_SCRIPT_REQUIRED');
  borderChecks(clockCss);
  const c = constants(source), css = c.get(cssName), existing = c.get(clockName);
  assert(css?.value.includes('B46_CLEAN_MENU_SURFACES_20261003'), 'CURRENT_CLEAN_MENU_CSS_REQUIRED');
  if (css.value.includes(marker)) assert(css.value.endsWith(clockCss), 'EXISTING_CLOCK_CSS_DIFFERS');
  const cssAfter = css.value.includes(marker) ? css.value : css.value + clockCss;
  const jsAfter = patchClockScript(clockScript);
  if (existing) assert.equal(existing.value, jsAfter, 'EXISTING_CLOCK_SCRIPT_DIFFERS');
  let after = source.slice(0, css.start) + JSON.stringify(cssAfter) + source.slice(css.end);
  if (!existing) {
    after = replaceOnce(after, 'function __b46Text(body,type)', `const ${clockName}=${JSON.stringify(jsAfter)};\nfunction __b46Text(body,type)`);
    after = replaceOnce(after, cssRoute, cssRoute + routeOverride);
  }
  assert.equal(normalize(after), normalize(source), 'CODE_CHANGED_OUTSIDE_CLOCK_PRESENTATION');
  assert.equal(JSON.stringify(constants(after).get('__B46_SCOREBAR_BG_B64__')?.value), JSON.stringify(c.get('__B46_SCOREBAR_BG_B64__')?.value), 'SCOREBAR_IMAGE_BYTES_CHANGED');
  const changes = [
    { ...targets[0], before: css.value, after: cssAfter, beforeSha: sha(css.value), afterSha: sha(cssAfter) },
    { ...targets[1], before: clockScript, after: jsAfter, beforeSha: sha(clockScript), afterSha: sha(jsAfter) },
  ];
  return { after, changes, codeSha: sha(normalize(source)) };
}
