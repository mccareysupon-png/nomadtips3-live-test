// Native existing BALL46 Pre-Match O/U TEST view only. Never a new page.
// Mount isolated Adaptive Research under the existing O/U statistics section.
// Actual accepted quote and snapshot data come from existing PREMATCH_STORE.
// Do NOT change Total/1X2/BTTS/O-U legacy metrics, prediction counts or styles.
const once=(s,a,b,label)=>{
 const n=s.split(a).length-1;
 if(n!==1)throw Error('ADAPTIVE_NATIVE_UI_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
export const ADAPTIVE_NATIVE_UI_V1='B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1';
const panelCode=String.raw