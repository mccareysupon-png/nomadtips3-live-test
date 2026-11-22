// TEST UI only: increase specificity of the already deployed section-title style.
export function patchSectionHeadingSpecificity(original){
 if(typeof original!=='string'||!original.includes("b46-sidebar-section-type-v1")||
    !original.includes("el('div','b46pm-nav-heading','PRE-MATCH STATISTICS')"))
   throw Error('NOT_DEPLOYED_B46_SECTION_TYPOGRAPHY_CLIENT');
 const replacements=[
  ['aside.left-rail .rail-title{','html body aside.left-rail .rail-card .rail-title{'],
  ['aside.left-rail .rail-title>span{','html body aside.left-rail .rail-card .rail-title>span{']
 ];
 let s=original;
 for(const [from,to] of replacements){
   const n=s.split(from).length-1;
   if(n!==1)throw Error('B46_SECTION_SPECIFICITY_DRIFT_'+n+'_'+from);
   s=s.replace(from,to);
 }
 if(!s.includes('font-size:11px!important')||!s.includes('@media(min-width:761px)'))
  throw Error('SECTION_STYLE_REFERENCE_LOST');
 return {code:s,scope:'TEST_DESKTOP_SECTION_TYPOGRAPHY_ONLY',routesChanged:false,backendChanged:false,providerCallsAdded:0};
}
