import test from 'node:test';
import assert from 'node:assert/strict';
import {patchPreMatchContentLoading,patchPreMatchContentWorker,B46_CONTENT_ONLY_LOADING_VERSION} from './patch-prematch-content-only-loading-20261124.mjs';
const client=`const root='b46-prematch-panel';
  const MATCHES_PER_PAGE=25;
  function draw(pageOnly=false){
    if(!ledger){
      if(!loading)content.append(card('Data status','Data unavailable'));
      finish();return;
    }
  }
  function show(modeNext){
    const panel=$('#'+root);panel.hidden=!['predictions','ou-predictions','ou'].includes(modeNext)&&!ledger;
    if(mode==='predictions'||mode==='ou-predictions'||mode==='ou'||ledger)draw();
  }
  async function load(){
    try{
      ledger=j.testLedger;
    }catch(e){if(!ledger)console.warn('Pre-Match test data:',String(e))}
  }`;
test('old wrong Data status interstitial is removed from client and spinner lives inside content',()=>{
 const got=patchPreMatchContentLoading(client);
 assert(got.includes(B46_CONTENT_ONLY_LOADING_VERSION));
 assert(!got.includes("card('Data status','Data unavailable')"));
 assert(got.includes('content.append(b46PrematchLoadingContent());'));
 assert(got.includes('panel.hidden=false;'));
 assert(got.includes('b46PrematchFirstLoadFailed=true'));
 assert(got.includes('draw();\n        load();'));
 assert.throws(()=>patchPreMatchContentLoading(got),/ALREADY_PRESENT/);
});
test('server only adds in-panel CSS and early native OU hide, not fullscreen overlay',()=>{
 const source='var prematchClientScript = '+JSON.stringify(client)+';\n'+
 '  const pmStyles = prematchStyles + prematchMirrorStyles + "...";\n'+
 'const directPreMatchTest = ["predictions", "all", "1x2", "btts"].includes(u.searchParams.get("b46pm"));\n'+
 'const untouchedBackend=true;';
 const got=patchPreMatchContentWorker(source);
 assert(got.worker.includes('b46PMContentOnlySpin'));
 assert(got.worker.includes('["predictions", "all", "1x2", "ou", "btts"]'));
 assert(got.worker.includes('const untouchedBackend=true;'));
 assert(!got.worker.includes('data-b46-pm-initial-loading'));
 assert(!got.worker.includes('firstPaintLoaderHtml'));
 assert.throws(()=>patchPreMatchContentWorker(got.worker),/ALREADY_PRESENT/);
});
