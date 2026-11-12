// Test-stage patch only. Never calls Cloudflare APIs or deploys a Worker.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const MARK = 'B46_MOBILE_FAVORITES_OFF_STAGE_20261112';

function once(source, before, after, label) {
  const count = source.split(before).length - 1;
  assert.equal(count, 1, label + '_ANCHOR_COUNT_' + count);
  return source.replace(before, after);
}

// The same helper is present in the dashboard module and in index.js's
// escaped dashboard fallback. Keep the desktop implementation unmodified.
export function patchDashboard(source) {
  assert(source.includes('B46_PIN_V2_FRESH_20261111'), 'PIN_V2_MISSING_IN_DASHBOARD');
  if (source.includes(MARK)) return source;

  source = once(
    source,
    'function b46PinRenderHas(id){',
    'function b46PinRenderHas(id){/* ' + MARK + ' */if(matchMedia(\'(max-width:760px)\').matches)return false;',
    'PIN_RENDER_GUARD'
  );
  source = once(
    source,
    'function b46PinPaint(row){if(!row)return;b46PinSignalBadge(row);',
    'function b46PinPaint(row){if(!row)return;b46PinSignalBadge(row);if(matchMedia(\'(max-width:760px)\').matches){row.querySelector(\'[data-b46-pin-v2]\')?.remove();return;}',
    'PIN_PAINT_GUARD'
  );
  source = once(
    source,
    'function b46PinToggle(id){',
    'function b46PinToggle(id){if(matchMedia(\'(max-width:760px)\').matches)return false;',
    'PIN_TOGGLE_GUARD'
  );
  assert(source.includes('b46PinSignalBadge(row);'), 'SIGNAL_BADGE_REMOVED');
  assert(source.includes('function b46PinPruneKnown'), 'PIN_PRUNE_REMOVED');
  return source;
}

const MOBILE_SORT_OLD = "const all=visibleRows(),pinned=all.filter(x=>window.BALL46_PIN_V2?.isPinned?.(x.id)),rest=all.filter(x=>!window.BALL46_PIN_V2?.isPinned?.(x.id)),liveOnly=rest.filter(x=>x.kind==='live');const ordered=[...pinned,...((key==='all'&&liveOnly.length)?[...liveOnly,...rest.filter(x=>x.kind!=='live')]:rest)];";
const MOBILE_SORT_NEW = "const all=visibleRows(),liveOnly=all.filter(x=>x.kind==='live');const ordered=(key==='all'&&liveOnly.length)?[...liveOnly,...all.filter(x=>x.kind!=='live')]:all;";
const MOBILE_SIG_OLD = "const signature=ordered.map(x=>[x.id,x.league,x.names.join('~'),x.scores.join('~'),x.clock,x.kind,x.signalCount,window.BALL46_PIN_V2?.isPinned?.(x.id)?1:0].join(':')).join('||')+'#'+key;";
const MOBILE_SIG_NEW = "const signature=ordered.map(x=>[x.id,x.league,x.names.join('~'),x.scores.join('~'),x.clock,x.kind,x.signalCount].join(':')).join('||')+'#'+key;";

// Render mobile matches normally, disconnect the pin event loop, and remove
// the observer-driven star runtime (the source of repeated post-render paints).
export function patchMobileHtml(html) {
  assert(html.includes('B46_PIN_V2_MOBILE_20261111'), 'MOBILE_BASE_MISSING');
  if (html.includes(MARK)) return html;
  html = once(html, MOBILE_SORT_OLD, MOBILE_SORT_NEW, 'MOBILE_SORT');
  html = once(html, MOBILE_SIG_OLD, MOBILE_SIG_NEW, 'MOBILE_SIGNATURE');
  html = once(html, "document.addEventListener('ball46:pin-v2',schedule);", '', 'MOBILE_PIN_SCHEDULER');

  const runtime = /<script id="b46-pin-v2-mobile-runtime">[\s\S]*?<\/script>/g;
  const matches = html.match(runtime);
  assert.equal(matches?.length, 1, 'MOBILE_RUNTIME_COUNT_' + (matches?.length || 0));
  html = html.replace(runtime, '<!-- Mobile Favorites runtime intentionally disabled in test stage. -->');

  const css = '<style id="b46-mobile-favorites-off">/* ' + MARK + ' */\n' +
    '@media(max-width:760px){.b46-pin-v2-star,#b46gn-cards [data-b46-pin-mobile],#b46gn-cards .b46-pin-v2-mobile{display:none!important;pointer-events:none!important}' +
    '#b46gn-cards .b46gn-team{padding-left:0!important}}\n</style>';
  html = once(html, '</head>', css + '</head>', 'MOBILE_CSS');
  assert(!html.includes('id="b46-pin-v2-mobile-runtime"'), 'MOBILE_RUNTIME_REMAINS');
  assert(!html.includes(MOBILE_SORT_OLD), 'MOBILE_PIN_SORT_REMAINS');
  assert(html.includes('x.signalCount'), 'MOBILE_SIGNAL_DATA_REMOVED');
  return html;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function selfTest() {
  const dash =
    "/* B46_PIN_V2_FRESH_20261111 */\n" +
    "function b46PinPruneKnown(){}" +
    "function b46PinRenderHas(id){id=String(id||'');return true;}" +
    "function b46PinSignalBadge(row){return row;}" +
    "function b46PinPaint(row){if(!row)return;b46PinSignalBadge(row);row.append('star');}" +
    "function b46PinToggle(id){id=String(id||'');return true;}";
  const oldHtml =
    '<html><head><style>/* B46_PIN_V2_MOBILE_20261111 */</style></head><body>' +
    '<script>function mobileRender(){' + MOBILE_SORT_OLD + MOBILE_SIG_OLD +
    "document.addEventListener('ball46:pin-v2',schedule);" + '}</script>' +
    '<script id="b46-pin-v2-mobile-runtime">setInterval(()=>{},30);new MutationObserver(()=>{});</script></body></html>';

  const patched = patchDashboard(dash);
  const mobile = patchMobileHtml(oldHtml);
  assert.equal(patchDashboard(patched), patched, 'DASH_NOT_IDEMPOTENT');
  assert.equal(patchMobileHtml(mobile), mobile, 'HTML_NOT_IDEMPOTENT');
  assert(patched.includes("if(matchMedia('(max-width:760px)').matches)return false;"), 'NO_MOBILE_DISABLE');
  assert(patched.includes("row.querySelector('[data-b46-pin-v2]')?.remove();return;"), 'NO_MOBILE_STAR_REMOVE');
  assert(patched.includes("b46PinSignalBadge(row);"), 'SIGNAL_BADGE_CHANGED');
  assert(mobile.includes(MOBILE_SORT_NEW) && mobile.includes(MOBILE_SIG_NEW), 'MOBILE_NATIVE_ORDER_MISSING');
  assert(!mobile.includes('setInterval(()=>{},30)') && !mobile.includes("document.addEventListener('ball46:pin-v2',schedule)"), 'MOBILE_PIN_LOOP_REMAINS');
  assert(mobile.includes('b46-mobile-favorites-off'), 'MOBILE_STAR_CSS_MISSING');
  assert(!mobile.includes('B46_PIN_V2?.isPinned?.(x.id)'), 'MOBILE_PIN_STILL_READ');
  assert.throws(() => patchDashboard('not the correct source'), /PIN_V2_MISSING/);
  assert.throws(() => patchMobileHtml('<html></html>'), /MOBILE_BASE_MISSING/);
  console.log('SELF_TEST_PASS=1');
  console.log('MOBILE_PIN_RENDER=OFF');
  console.log('MOBILE_PIN_TOGGLE=OFF');
  console.log('MOBILE_PIN_STAR_RUNTIME=OFF');
  console.log('MOBILE_NATIVE_ORDER=ON');
  console.log('DESKTOP_FAVORITES=UNCHANGED');
  console.log('SIGNAL_BADGE=UNCHANGED');
  console.log('CLOUDFLARE_WRITE_CALLS=0');
}

function runFromLocalSources(inputDir, outputDir) {
  const targets = [
    ['index.js', patchDashboard],
    ['screen-refresh-5s-20261104.txt', patchDashboard],
    ['assets/index.html', patchMobileHtml]
  ];
  assert.notEqual(resolve(inputDir), resolve(outputDir), 'OUTPUT_MUST_NOT_OVERWRITE_INPUT');
  const before = {}, after = {};
  for (const [path, transform] of targets) {
    const raw = readFileSync(join(inputDir, path), 'utf8');
    const patched = transform(raw);
    assert.notEqual(raw, patched, 'UNEXPECTED_ALREADY_PATCHED_' + path);
    const out = join(outputDir, path);
    mkdirSync(dirname(out), { recursive:true });
    writeFileSync(out, patched);
    before[path] = sha256(raw);
    after[path] = sha256(patched);
  }
  const manifest = { marker:MARK, mode:'TEST_ONLY_NO_DEPLOY', changedModules:targets.map(t=>t[0]), before, after };
  writeFileSync(join(outputDir,'mobile-favorites-off-manifest.json'), JSON.stringify(manifest,null,2)+'\n');
  assert.equal(manifest.changedModules.length, 3);
  console.log('TEST_STAGE_PATCH_READY=1');
  console.log('CHANGED_MODULES=3');
  console.log('PRODUCTION_DEPLOY=0');
}

if (process.argv[1] && process.argv[1].endsWith('mobile-favorites-off-stage-20261112.mjs')) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--selftest') selfTest();
  else if (args.length === 4 && args[0] === '--source-dir' && args[2] === '--out-dir') {
    runFromLocalSources(args[1], args[3]);
  } else {
    console.error('Usage: node mobile-favorites-off-stage-20261112.mjs --selftest');
    console.error('Or: node mobile-favorites-off-stage-20261112.mjs --source-dir <read-only-local-current-worker-modules> --out-dir <test-output-dir>');
    process.exitCode = 2;
  }
}
