import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { patch, normalize, targets, marker, validateAppendix, borderChecks, constants } from './patch.mjs';
import { runInNewContext } from 'node:vm';
import { patch as patchClock, normalize as normalizeClock, patchClockScript, originalClockScript, painter, clockCss, borderChecks as clockChecks } from './live-clock.mjs';
import { patch as patchLogo, normalize as normalizeTheme, originalThemeScript, themeLabels, logoCss, themeCss, marker as logoMarker, themeMarker, logoSelector, themeSelector, oddsButtonSelector, borderChecks as logoChecks } from './logo-size.mjs';

const fixture = targets.map(t => `const ${t.name}=${JSON.stringify('.fixture{border:1px solid #333}')};`).join('\n') + '\nconst __B46_SCOREBAR_BG_B64__={"/scorebar-win-test.webp":"aW1hZ2U="};\nexport default {fetch(){return new Response("unchanged");}};';

test('patch is additive and leaves every non-CSS byte unchanged', () => {
  const result = patch(fixture);
  assert.equal(normalize(result.after), normalize(fixture));
  for (const c of result.changes) assert.equal(c.after, c.before + c.css);
  assert(result.after.includes('aW1hZ2U='));
});
test('repeat runs are idempotent', () => {
  const a = patch(fixture).after;
  assert.equal(patch(a).after, a);
});
test('second pass preserves the previously deployed cleanup verbatim', () => {
  const old = fixture.replaceAll('.fixture{border:1px solid #333}', '.fixture{border:1px solid #333}/* B46_DECORATIVE_BORDER_CLEANUP_20261002 */.old{border-color:transparent!important}');
  for (const c of patch(old).changes) assert.equal(c.after, c.before + c.css);
});
test('an existing changed second-pass suffix fails closed', () => {
  assert.throws(() => patch(patch(fixture).after.replace(marker, marker + '_changed')), /EXISTING_PATCH_DIFFERS/);
});
test('appendix cannot change layout, focus, graph rendering or image assets', () => {
  for (const property of ['display', 'padding', 'border-width', 'outline', 'stroke', 'fill', 'content']) {
    assert.throws(() => validateAppendix(`.test{${property}:none!important}`), /NON_PRESENTATION_PROPERTY/);
  }
  assert.throws(() => validateAppendix('.test{background-image:url("new.webp")!important}'), /ASSET_REFERENCE/);
  assert.throws(() => validateAppendix('@import "other.css";'), /AT_RULE/);
  assert.throws(() => validateAppendix('.test{box-shadow:0 0 1px red!important}'), /NEW_DECORATIVE_SHADOW/);
  for (const t of targets) {
    validateAppendix(t.css);
    assert(borderChecks(t.css).length > 0);
    assert(!/\.(?:event-flow|b46-signal-flow|pitch|timeline)|\b(?:svg|path|canvas)\s*[,{]/.test(t.css));
  }
});
test('missing or duplicate anchors fail closed', () => {
  assert.throws(() => patch('export default {};'), /CSS_CONSTANT_MISSING/);
  assert.throws(() => patch(fixture.replace('export default', `function duplicate(){const ${targets[0].name}="";}\nexport default`)), /DUPLICATE_CONSTANT/);
});
test('malformed CSS and executable initializers are rejected', () => {
  assert.throws(() => patch(fixture.replace('.fixture{border:1px solid #333}', '.broken{')));
  assert.throws(() => patch(fixture.replace(JSON.stringify('.fixture{border:1px solid #333}'), 'getCss()')));
});
test('workflow parses and checks out the triggering commit, not an old source branch', () => {
  const doc = YAML.parseDocument(readFileSync('../../.github/workflows/deploy-ball46-decorative-borders-20261002.yml', 'utf8'));
  assert.equal(doc.errors.length, 0);
  const config = doc.toJS();
  assert.equal(config.concurrency['cancel-in-progress'], false);
  assert.equal(config.jobs['guarded-css'].steps[0].with.ref, undefined);
  assert(config.env.CLOUDFLARE_API_TOKEN);
  assert(!JSON.stringify(config).includes('wrangler deploy'));
});

const clockScript = `(()=>{const VERSION='343-color-semantics-20260922a';function processMatchRow(row){
  markLive(status,live);
}function untouched(){return 'API/odds/signals/statistics unchanged';}})();`;
const clockFixture = patch(fixture).after.replace('export default', `function __b46Text(body,type){return new Response(body,{headers:{'content-type':type}});}\nexport default`).replace('return new Response("unchanged");', "const url={pathname:'/'};if(url.pathname==='/dashboard-v2-tune.css')return __b46Text(__B46_SCOREBAR_TUNE_CSS__,'text/css; charset=utf-8');return new Response('unchanged');");

test('clock patch changes only scoped text CSS and the existing color painter override', () => {
  const result = patchClock(clockFixture, { clockScript });
  assert.equal(normalizeClock(result.after), normalizeClock(clockFixture));
  assert.equal(originalClockScript(result.changes[1].after), clockScript);
  assert.equal(result.changes[0].after, result.changes[0].before + clockCss);
  assert.equal(patchClock(result.after, { clockScript: result.changes[1].after }).after, result.after);
  clockChecks(clockCss);
  assert.throws(() => clockChecks('.match-row .b46-clock-minute{padding:1px!important}'), /TEXT_COLOR_ONLY/);
  assert.throws(() => clockChecks('.other{color:red!important}'), /OUTSIDE_MATCH_CARD/);
  assert.throws(() => patchClockScript(clockScript.replace('  markLive(status,live);', 'markLive(status,live);')), /ANCHOR_NOT_UNIQUE/);
});

test('clock spans preserve exact text, stoppage time and half-time, without repeating DOM writes', () => {
  class Node {
    constructor(value = '', cls = '') { this.value = value; this.className = cls; this.nodes = []; this.writes = 0; }
    get textContent() { return this.nodes.length ? this.nodes.map(n => n.textContent).join('') : this.value; }
    set textContent(value) { this.value = value; this.nodes = []; }
    get children() { return this.nodes.filter(n => n.className); }
    replaceChildren(...nodes) { this.nodes = nodes; this.writes++; }
  }
  const paint = runInNewContext(painter + '\npaintMatchClock;', {
    makeSpan: (v, c) => new Node(v, c), document: { createTextNode: v => new Node(v) },
  });
  for (const value of ["LIVE \u00b7 75'", "LIVE \u00b7 90+4'", 'LIVE \u00b7 HT', 'LIVE \u00b7 LIVE', '  LIVE \u00b7 45\u2019  ']) {
    const el = new Node(value);
    paint(el);
    assert.equal(el.textContent, value);
    assert.equal(el.children[0].className, 'b46-clock-live-label');
    const writes = el.writes;
    paint(el);
    assert.equal(el.writes, writes);
    el.textContent = "LIVE \u00b7 76'";
    paint(el);
    assert.equal(el.textContent, "LIVE \u00b7 76'");
    assert.equal(el.children[2].textContent, "76'");
  }
  for (const value of ['FT', '19:00', 'Waiting', '1X2 \u00b7 LIVE', "Signal 75'", "PENDING \u00b7 75'"]) {
    const el = new Node(value);
    paint(el);
    assert.equal(el.textContent, value);
    assert.equal(el.writes, 0);
  }
});

test('theme patch preserves existing logo, clocks, original tune script and worker code', () => {
  const clockPatched = patchClock(clockFixture, { clockScript }).after;
  const cssEntry = constants(clockPatched).get('__B46_SCOREBAR_TUNE_CSS__');
  const current = clockPatched.slice(0, cssEntry.start) + JSON.stringify(cssEntry.value + logoCss) + clockPatched.slice(cssEntry.end);
  const themeScript = '(function(){const untouched="API/odds/signals/statistics";})();';
  const result = patchLogo(current, { themeScript });
  assert.equal(normalizeTheme(result.after), normalizeTheme(current));
  assert.equal(originalThemeScript(result.changes[1].after), themeScript);
  assert.equal(result.changes[0].after, result.changes[0].before + themeCss);
  assert(result.changes[0].after.includes(logoCss));
  assert(result.changes[0].after.includes(clockCss));
  assert.equal(patchLogo(result.after, { themeScript: result.changes[1].after }).after, result.after);
  assert.throws(() => patchLogo(result.after.replace(logoMarker, logoMarker + '_changed'), { themeScript }), /EXISTING_LOGO_PATCH_DIFFERS/);
  assert.throws(() => logoChecks(logoCss.replace('1.3', '1.4')), /EXACT_130_PERCENT/);
  assert.throws(() => logoChecks(logoCss.replace('zoom:', 'transform:')), /EXACT_130_PERCENT/);
  assert.throws(() => logoChecks(logoCss.replace('.workspace-brand[', '.other[')), /SCOPE_CHANGED/);
});

test('theme control uses the existing label in a compact one-click toolbar control', () => {
  logoChecks(logoCss + themeCss);
  assert(themeCss.includes(themeMarker));
  assert(themeCss.includes(themeSelector));
  assert(themeCss.includes(oddsButtonSelector));
  assert.equal(themeCss.split('font-size: 7px !important').length - 1, 2);
  assert(themeCss.includes('font-size: 6.5px !important'));
  assert.equal(themeCss.split('font-weight: 800 !important').length - 1, 2);
  assert(themeCss.includes('width: 48px !important'));
  assert(themeCss.includes('flex: 0 0 48px !important'));
  assert(themeCss.includes('height: 28px !important'));
  assert(themeCss.includes('border-radius: 5px !important'));
  assert(logoSelector.includes('.workspace-brand'));
  assert.throws(() => logoChecks((logoCss + themeCss).replaceAll('height: 28px', 'height: 40px')), /THEME_HEIGHT_NOT_COMPACT/);
});

test('existing theme button moves after ODDS without duplicating controls or replacing its handler', () => {
  let update, moves = 0;
  const originalClick = () => {};
  const button = { textContent: '\u2600 Light', onclick: originalClick };
  const slot = { lastElementChild: {}, append(e) { assert.equal(e, button); this.lastElementChild = e; moves++; } };
  const styles = [];
  const document = { readyState: 'complete', body: {}, head: { append: style => styles.push(style) }, createElement: tag => { assert.equal(tag, 'style'); return {}; }, getElementById: id => styles.find(s => s.id === id), documentElement: { dataset: { theme: 'dark' } }, querySelector: selector => selector === '[data-theme-toggle]' ? button : slot };
  runInNewContext(themeLabels, { document, MutationObserver: class { constructor(callback) { update = callback; } observe() {} } });
  assert.equal(moves, 1);
  assert.equal(button.textContent, 'Light');
  assert.equal(button.onclick, originalClick);
  assert.equal(styles.length, 1);
  assert.equal(styles[0].textContent, themeCss);
  update();
  assert.equal(moves, 1);
  assert.equal(styles.length, 1);
  document.documentElement.dataset.theme = 'light';
  update();
  assert.equal(button.textContent, 'Dark');
  assert.equal(moves, 1);
});

test('toolbar handles a late-created or replaced header button', () => {
  let button = null, update, moves = 0;
  const styles = [];
  const slot = { lastElementChild: {}, append(e) { assert.equal(e, button); this.lastElementChild = e; moves++; } };
  const document = { readyState: 'complete', body: {}, head: { append: style => styles.push(style) }, createElement: () => ({}), getElementById: id => styles.find(s => s.id === id), documentElement: { dataset: { theme: 'dark' } }, querySelector: selector => selector === '[data-theme-toggle]' ? button : slot };
  runInNewContext(themeLabels, { document, MutationObserver: class { constructor(callback) { update = callback; } observe() {} } });
  assert.equal(styles.length, 1);
  assert.equal(moves, 0);
  button = { textContent: '\u2600 Light' };
  update();
  assert.equal(button.textContent, 'Light');
  assert.equal(moves, 1);
  button = { textContent: '\u2600 Light' };
  update();
  assert.equal(button.textContent, 'Light');
  assert.equal(moves, 2);
  update();
  assert.equal(moves, 2);
});
