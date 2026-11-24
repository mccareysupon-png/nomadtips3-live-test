import test from 'node:test';
import assert from 'node:assert/strict';
import {patchFirstPaintClient,patchFirstPaintWorker,B46_FIRSTPAINT_SPINNER_VERSION} from './patch-prematch-universal-spinner-test-20261124.mjs';
const client=`const routes = [];
let ledger=null,mode='';
  const MATCHES_PER_PAGE=25;
  function draw(pageOnly=false){
    let b46PrematchLastScrollRoute=null; // B46_PREMATCH_NAV_SCROLL_V1
  }
  function show(modeNext){
    if(mode==='predictions'||mode==='ou-predictions'||mode==='ou'||ledger)draw();
  }
  async function load(){
    try{}catch(e){if(!ledger)console.warn('Pre-Match test data:',String(e))}
    finally{
        draw();
        if(mode==='predictions')loadPerformanceGraph(false);
    }
  }`;
test('data-ready spinner and error retry replace first paint only',()=>{
 const out=patchFirstPaintClient(client);
 assert(out.includes(B46_FIRSTPAINT_SPINNER_VERSION));
 assert(out.includes('requestAnimationFrame'));
 assert(out.includes('b46FirstPaintFailure();'));
 assert(out.includes('b46FirstPaintReady();'));
 assert(out.includes('setTimeout(b46FirstPaintFailure,25000)'));
 assert(out.indexOf('let b46PrematchLastScrollRoute=null;')<out.indexOf('function draw(pageOnly=false)'));
 assert.throws(()=>patchFirstPaintClient(out),/ALREADY_INSTALLED/);
});
test('server marks all five routes before HTML paints, no backend edits',()=>{
 const worker='var prematchClientScript = '+JSON.stringify(client)+';\n'+
 'const unchangedBackend=true;\n'+
 '  const pmStyles = prematchStyles + prematchMirrorStyles + "";\n'+
 'const directPreMatchTest = ["predictions", "all", "1x2", "btts"].includes(u.searchParams.get("b46pm"));\n'+
 '    if (directPreMatchTest) e.setAttribute("data-b46-pm-boot", "1");\n'+
 `    e.append('<script defer src="/__b46_prematch_mirror.js"><\/script>');`;
 const a=patchFirstPaintWorker(worker);
 assert(a.worker.includes('["predictions", "all", "1x2", "ou", "btts"]'));
 assert(a.worker.includes('e.prepend(firstPaintLoaderHtml, { html: true })'));
 assert(a.worker.includes('data-b46-pm-initial-loading'));
 assert(a.worker.includes('b46-pm-spinner'));
 assert(a.worker.includes('const unchangedBackend=true;'));
 assert.throws(()=>patchFirstPaintWorker(a.worker),/ALREADY_INSTALLED/);
 assert.throws(()=>patchFirstPaintWorker('x'),/UNEXPECTED_FRONTEND/);
});
