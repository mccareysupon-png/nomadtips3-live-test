// BALL46 TEST only. Repair one injected Adaptive research panel that was
// sharing original stats CSS and rendering before the normal page was ready.
const one=(s,old,next,label)=>{
 const n=s.split(old).length-1;
 if(n!==1)throw Error('B46_ADAPTIVE_OVERLAY_PATCH_DRIFT_'+label+'_'+n);
 return s.replace(old,next);
};
export const ADAPTIVE_LAYOUT_REPAIR='B46_ADAPTIVE_NATIVE_RESEARCH_LAYOUT_FIX_V2';
export function fixAdaptiveOverlayClient(client){
 if(typeof client!=='string'||!client.includes('B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1'))
  throw Error('MISSING_ORIGINAL_NATIVE_RESEARCH_PANEL');
 if(client.includes(ADAPTIVE_LAYOUT_REPAIR))throw Error('OVERLAY_LAYOUT_ALREADY_REPAIRED');
 let patched=one(client,
  "if(mode!=='ou'||!content)return;",
  "if(mode!=='ou'||!content||!ledger)return;",
  'NO_PREMATURE_RESEARCH_PANEL');
 patched=one(patched,
  "panel.className='b46pm-stats-board';",
  "panel.className='b46pm-adaptive-research-isolated';\n"+
  "      panel.style.cssText='display:block;position:relative;float:none;clear:both;order:999;grid-column:1 / -1;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin:24px 0 0;padding:16px;border:1px solid rgba(53,111,81,.45);border-radius:12px;background:#101c17;overflow:hidden;z-index:auto';",
  'NO_SHARED_STATS_BOARD_CSS');
 patched=one(patched,
  "if(mode==='ou')b46AdaptivePanel(content);",
  "if(mode==='ou'&&ledger){queueMicrotask(()=>{if(mode==='ou'&&content.isConnected)b46AdaptivePanel(content);});}",
  'DEFER_TO_AFTER_ORIGINAL_UI_RENDER');
 patched=one(patched,
  '// B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1',
  '// B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1\n// '+ADAPTIVE_LAYOUT_REPAIR,
  'REPAIR_VERSION');
 if(!patched.includes('PREMATCH_TEST_SHELL_VERSION')||!patched.includes('const routes = ['))
  throw Error('ORIGINAL_PREMATCH_SHELL_WAS_MODIFIED');
 return patched;
}
export function fixAdaptiveOverlayWorker(main){
 if(typeof main!=='string'||!main.includes('/__b46_pm_adaptive_research')||
  !main.includes('env.PREMATCH_STORE.fetch'))
  throw Error('MISSING_NATIVE_PREMATCH_PROXY');
 const m=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
 if(!m)throw Error('TEST_NATIVE_CLIENT_NOT_FOUND');
 const oldClient=JSON.parse(m[1]);
 const patched=fixAdaptiveOverlayClient(oldClient);
 const newMain=one(main,m[0],'var prematchClientScript = '+JSON.stringify(patched)+';','REPLACE_ONE_SCRIPT_ONLY');
 if(newMain.replace('var prematchClientScript = '+JSON.stringify(patched)+';','')!==
  main.replace(m[0],''))throw Error('UNRELATED_WORKER_CHANGE');
 return {main:newMain,client:patched};
}
