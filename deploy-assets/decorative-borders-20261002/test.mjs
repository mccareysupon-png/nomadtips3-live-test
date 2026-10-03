import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { patch, normalize, targets, marker, validateAppendix, borderChecks } from './patch.mjs';

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
