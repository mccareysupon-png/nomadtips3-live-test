// TEST UI only: override the verified high-specificity native sidebar font rule.
// The existing Pre-Match heading is the single 11px/750/0.06em reference.
export function patchSectionHeadingFinal(original){
 if(typeof original!=='string'||
   !original.includes("b46-sidebar-section-type-v1")||
   !original.includes("el('div','b46pm-nav-heading','PRE-MATCH STATISTICS')"))
  throw Error('NOT_ACTIVE_B46_SECTION_TYPOGRAPHY_CLIENT');
 const pairs=[
  ['html body aside.left-rail .rail-card .rail-title{',
   'html:root[data-theme] body .workspace.singlepage > aside.left-rail[data-b46-sidebar] > .rail-card .rail-title{'],
  ['html body aside.left-rail .rail-card .rail-title>span{',
   'html:root[data-theme] body .workspace.singlepage > aside.left-rail[data-b46-sidebar] > .rail-card .rail-title>span{']
 ];
 let code=original;
 for(const [a,b] of pairs){
   const n=code.split(a).length-1;
   if(n!==1)throw Error('SECTION_TYPOGRAPHY_RULE_DRIFT_'+n+'_'+a);
   code=code.replace(a,b);
 }
 if(!code.includes('font-size:11px!important')||
   !code.includes('@media(min-width:761px)')||
   code.includes("'PRE-MATCH · TEST'"))throw Error('SECTION_TYPOGRAPHY_INVARIANTS_FAILED');
 return {code,scope:'TEST_DESKTOP_TITLE_CSS_SPECIFICITY_ONLY',dataUnchanged:true,mobileUntouched:true,backendChanged:false,providerCallsAdded:0};
}
