import test from 'node:test';
import assert from 'node:assert/strict';
import {fixAdaptiveOverlayClient,fixAdaptiveOverlayWorker,ADAPTIVE_LAYOUT_REPAIR}
 from './fix-adaptive-ou-native-overlay-v2-test.mjs';
const client=`(() => {
const PREMATCH_TEST_SHELL_VERSION='OK';
const routes = [{id:'ou'}];
// B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1
const mode='ou',ledger=true,content=null;
function b46AdaptivePanel(content){
 if(mode!=='ou'||!content)return;
 let panel;
 panel.className='b46pm-stats-board';
 content.append(panel);
}
function draw(){
 if(mode==='ou')b46AdaptivePanel(content);
}
})();`;
test('research panel is after original render and no longer inherits the original stats board layout',()=>{
 const out=fixAdaptiveOverlayClient(client);
 assert(out.includes(ADAPTIVE_LAYOUT_REPAIR));
 assert(out.includes("panel.className='b46pm-adaptive-research-isolated'"));
 assert(out.includes('grid-column:1 / -1'));
 assert(out.includes('order:999'));
 assert(out.includes("if(mode!=='ou'||!content||!ledger)return"));
 assert(out.includes('queueMicrotask'));
 assert(!out.includes("panel.className='b46pm-stats-board'"));
 assert.throws(()=>fixAdaptiveOverlayClient(out),/ALREADY_REPAIRED/);
});
test('production and native UI remain byte-identical outside the injected JS string',()=>{
 const before="var prematchClientScript = "+JSON.stringify(client)+";"+
 "\nconst worker_default = { async fetch(req,env){ if(req.url) return env.PREMATCH_STORE.fetch('/__b46_pm_adaptive_research'); } };";
 const got=fixAdaptiveOverlayWorker(before);
 assert(got.main.includes(ADAPTIVE_LAYOUT_REPAIR));
 assert(got.main.includes('/__b46_pm_adaptive_research'));
 assert(got.main.endsWith(before.slice(before.indexOf('const worker_default'))));
 assert.throws(()=>fixAdaptiveOverlayWorker(got.main),/ALREADY_REPAIRED/);
});
