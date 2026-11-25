import assert from 'node:assert/strict';
// The original TEST router canonically redirects ou-predictions to predictions.
// Mount an explicitly labelled Adaptive O/U research strip on the actual Predictions route.
const once=(s,a,b,name)=>{const count=s.split(a).length-1;assert.equal(count,1,name+'_EXPECTED_ONCE_'+count);return s.replace(a,b)};
export function patchCanonicalPredictionsLatest(source){
 assert(source.includes("b46AdaptiveLatestPredictions(content)"),'LATEST_UI_BASELINE_MISSING');
 assert(!source.includes('B46_ADAPTIVE_CANONICAL_PREDICTIONS_V1'),'ALREADY_CANONICAL_PATCHED');
 const substitutions=[
  ["if(!content||mode!=='ou-predictions')return;","if(!content||mode!=='predictions')return;",'HELPER_ENTRY'],
  ["if(mode!=='ou-predictions'||!content.isConnected)return;","if(mode!=='predictions'||!content.isConnected)return;",'RENDER_GUARD'],
  ["if(mode==='ou-predictions'&&content.isConnected){","if(mode==='predictions'&&content.isConnected){",'FETCH_FAILURE_GUARD'],
  ["if(mode==='ou'&&ledger){queueMicrotask(()=>{if(mode==='ou'&&content.isConnected)b46AdaptivePanel(content);});}",
   "if(mode==='ou'&&ledger){queueMicrotask(()=>{if(mode==='ou'&&content.isConnected)b46AdaptivePanel(content);});}\\n      if(mode==='predictions'&&content.isConnected)b46AdaptiveLatestPredictions(content); // B46_ADAPTIVE_CANONICAL_PREDICTIONS_V1",'FINISH_MOUNT'],
 ];
 for(const [a,b,n] of substitutions)source=once(source,a,b,n);
 return source;
}
