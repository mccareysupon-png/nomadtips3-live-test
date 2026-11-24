import test from 'node:test';
import assert from 'node:assert/strict';
import {patchAdaptiveNativeClient,patchAdaptiveNativeWorker,ADAPTIVE_NATIVE_UI_V1} from './patch-adaptive-research-native-ou-test.mjs';
test('insert minimal research inside original existing Over/Under route, never All/1X2',()=>{
 const original=[
  '(() => {',
  'const routes = [',
  "{id:'ou',label:'Over/Under',source:'stat-1x2'},",
  '];',
  'function renderEmptyOuScreen(content,statsMode){}',
  'const finish=()=>{',
  '      syncPrematchViewport();',
  '      panel.scrollTop=previousScroll;',
  '    };','})();'
 ].join('\n');
 const patched=patchAdaptiveNativeClient(original);
 assert(patched.includes(ADAPTIVE_NATIVE_UI_V1));
 assert(patched.includes("if(mode==='ou')b46AdaptivePanel(content)"));
 assert(patched.includes('42 formulas'));
 assert(!patched.includes("if(mode==='all')b46AdaptivePanel"));
 assert(!patched.includes("if(mode==='1x2')b46AdaptivePanel"));
 assert(!patched.includes("if(mode==='btts')b46AdaptivePanel"));
 assert.throws(()=>patchAdaptiveNativeClient(patched),/ALREADY_INSTALLED/);
});
test('add readonly frontend proxy through existing PREMATCH_STORE; never extra provider fetch',()=>{
 const cl=[
  '(() => {','const routes = [',
  "{id:'ou',label:'Over/Under',source:'stat-1x2'},",
  '];','function renderEmptyOuScreen(content,statsMode){}',
  'const finish=()=>{','      syncPrematchViewport();',
  '      panel.scrollTop=previousScroll;','    };','})();'
 ].join('\n');
 const main='var prematchClientScript = '+JSON.stringify(cl)+';'+
  'var worker_default = { async fetch(req, env) {\n'+
  'if (u.pathname === "/__b46_prematch_data") return env.PREMATCH_STORE.fetch("https://prematch.internal/preview-data");\n}};';
 const got=patchAdaptiveNativeWorker(main);
 assert(got.worker.includes('/__b46_pm_adaptive_research'));
 assert(got.worker.includes('https://prematch.internal/ou-adaptive-research-data'));
 assert(got.worker.includes('https://prematch.internal/preview-data'));
 assert(got.worker.includes('env.PREMATCH_STORE.fetch'));
 assert.throws(()=>patchAdaptiveNativeWorker(got.worker),/ALREADY_INSTALLED/);
});
