// Build stage Worker from the current active production modules, never deploy to production.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {patchMobileHtml,patchDashboard,MARK} from './mobile-favorites-off-stage-20261112.mjs';

const srcDir=process.argv[2]||'tmp-mobile-favorites-current';
const outDir=process.argv[3]||'tmp-mobile-favorites-preview-build';
assert.notEqual(srcDir,outDir,'SOURCE_AND_OUTPUT_SAME');
const htmlBase=readFileSync(join(srcDir,'live-browser-root.html'),'utf8');
const dashBase=readFileSync(join(srcDir,'screen-refresh-5s-20261104.txt'),'utf8');
const fallbackBase=readFileSync(join(srcDir,'index.js'),'utf8');
assert(!htmlBase.includes(MARK)&&!dashBase.includes(MARK),'LIVE_ALREADY_PATCHED');
assert(htmlBase.includes('B46_PIN_V2_MOBILE_20261111'),'LIVE_MOBILE_BASE_MISSING');
assert(dashBase.includes('B46_PIN_V2_FRESH_20261111'),'LIVE_DASH_BASE_MISSING');
assert(fallbackBase.includes('B46_PIN_V2_FRESH_20261111'),'LIVE_FALLBACK_BASE_MISSING');

const html=patchMobileHtml(htmlBase);
const dash=patchDashboard(dashBase);
const fallback=patchDashboard(fallbackBase);
assert(html.includes(MARK)&&dash.includes(MARK)&&fallback.includes(MARK),'STAGE_MARKER_NOT_COMPLETE');
assert(!html.includes('id="b46-pin-v2-mobile-runtime"'),'MOBILE_PIN_RUNTIME_STILL_PRESENT');
assert(!html.includes("window.BALL46_PIN_V2?.isPinned?.(x.id)"),'MOBILE_PIN_SORT_STILL_PRESENT');
assert(html.includes('x.signalCount'),'MOBILE_SIGNALS_REMOVED');
assert(dash.includes('function b46PinSignalBadge(row){'),'SIGNAL_FN_MISSING');
assert(dash.includes("if(matchMedia('(max-width:760px)').matches)return false;"),'MOBILE_TOGGLE_GUARD_MISSING');

const template=readFileSync('pinned-fixtures-v2-production/mobile-favorites-off-preview-worker-template-20261112.mjs','utf8');
assert.equal(template.split('__STAGE_HTML__').length-1,1);
assert.equal(template.split('__STAGE_DASH__').length-1,1);
const code=template.replace('__STAGE_HTML__',JSON.stringify(html)).replace('__STAGE_DASH__',JSON.stringify(dash));
assert(!code.includes('__STAGE_HTML__')&&!code.includes('__STAGE_DASH__'));
assert(code.includes('BALL46_MOBILE_FAVORITES_OFF_PREVIEW_20261112'));
mkdirSync(outDir,{recursive:true});
writeFileSync(join(outDir,'index.mjs'),code,'utf8');
const config={
 name:'ball46-mobile-favorites-stage-20261112',
 main:'index.mjs',
 compatibility_date:'2026-11-12',
 workers_dev:true,
 routes:[],
 triggers:{crons:[]},
 observability:{enabled:false}
};
assert(config.name!=='ball46-production' && config.workers_dev===true);
writeFileSync(join(outDir,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');
writeFileSync(join(outDir,'manifest.json'),JSON.stringify({
 source:'Current read-only BALL46 Worker modules',
 marker:MARK,
 workerScript:config.name,
 mode:'ISOLATED_GET_ONLY_PREVIEW',
 allowedMethods:['GET','HEAD','OPTIONS'],
 routes:[],bindings:[],cron:[],
 previewAssets:['/','/index.html','/dashboard-v2-stage3-featured-facts-20261013a.js']
},null,2)+'\n');
console.log('STAGE_ONLY_BUILD_PASS=1');
console.log('STAGE_WORKER_SCRIPT='+config.name);
console.log('NO_PRODUCTION_ROUTE=1');
console.log('NO_SHARED_CLOUDFLARE_BINDINGS=1');
console.log('NO_WRITE_REQUESTS_TO_PRODUCTION=1');
console.log('MOBILE_FAVORITES_OFF=1');
console.log('DESKTOP_FAVORITES_PRESERVED=1');
console.log('SIGNAL_FUNCTION_PRESERVED=1');
