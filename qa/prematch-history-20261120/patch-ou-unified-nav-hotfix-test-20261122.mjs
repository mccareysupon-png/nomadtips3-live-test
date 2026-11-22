// UI-only follow-up: after removing the duplicate route, also remove its old
// desktop re-insertion callback, which otherwise calls navRow(undefined).
export function patchOuUnifiedNavHotfix(source){
  if(typeof source!=='string'||!source.includes("canonical.searchParams.set('b46pm','predictions')")||
    source.includes("{id:'ou-predictions',label:'Over/Under Predictions'")||
    !source.includes("{id:'ou',label:'Over/Under'"))
    throw Error('NOT_DEPLOYED_UNIFIED_OU_TEST_CLIENT');
  const old=[
    '    if(!$(\'[data-b46-prematch-route="ou-predictions"]\')){',
    '      const anchor=$(\'[data-b46-prematch-route="predictions"]\');',
    "      const n=navRow(routes.find(r=>r.id==='ou-predictions'));",
    '      if(anchor&&n)anchor.after(n);',
    '    }'
  ].join('\n');
  const found=source.split(old).length-1;
  if(found!==1)throw Error('B46_OU_ORPHAN_SOURCE_DRIFT_'+found);
  const next=source.replace(old,'');
  if(next.includes("navRow(routes.find(r=>r.id==='ou-predictions'))"))
    throw Error('B46_OU_ORPHAN_LEFT_BEHIND');
  return {code:next,predictionsMenuCount:1,statsOUKept:true,backendChanged:false};
}
