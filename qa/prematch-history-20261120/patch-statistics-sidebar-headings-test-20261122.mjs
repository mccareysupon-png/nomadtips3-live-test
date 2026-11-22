// BALL46 TEST frontend UI only: heading names, no routes, engines, or ledgers.
export const B46_STATISTICS_HEADINGS_TEST_V1='B46_STATISTICS_HEADINGS_TEST_V1';
function replaceOnce(s,a,b,label){
 const count=s.split(a).length-1;
 if(count!==1)throw Error('B46_STAT_HEADING_SOURCE_DRIFT_'+label+'_'+count);
 return s.replace(a,b);
}
export function patchStatisticsSidebarHeadingsClient(original){
 if(typeof original!=='string'||!original.includes('b46pm-stats-navigation')||
    !original.includes('function draw(pageOnly=false){')||
    !original.includes('const routes = [')||
    !original.includes("const box=el('div','b46pm-mobile-navigation')"))
  throw Error('NOT_ACTIVE_B46_PREMATCH_TEST_CLIENT');
 let s=original;
 s=replaceOnce(s,"box.append(el('div','b46m-grouplabel','PRE-MATCH · TEST'));",
   "box.append(el('div','b46m-grouplabel','PRE-MATCH STATISTICS'));",'MOBILE_PREMATCH_HEADING');
 s=replaceOnce(s,"const title=el('div','b46pm-nav-heading','PRE-MATCH · TEST');wrapper.append(title);",
   "const title=el('div','b46pm-nav-heading','PRE-MATCH STATISTICS');wrapper.append(title);",'DESKTOP_PREMATCH_HEADING');
 const helper=[
  "  // Rename existing native Live Statistics labels only; preserve click targets.",
  "  function b46RenameNativeLiveStatsHeading(){",
  "    for(const node of document.querySelectorAll('aside.left-rail .rail-title > span')){",
  "      if(node.textContent.trim()==='STATISTICS')node.textContent='LIVE STATISTICS';",
  "    }",
  "    const mobile=document.querySelector('#b46m-drawer [data-b46m-page=\"statistics\"] > span:last-child');",
  "    if(mobile&&mobile.textContent.trim().toLowerCase()==='statistics')mobile.textContent='LIVE STATISTICS';",
  "  }",
 ].join('\n')+'\n';
 s=replaceOnce(s,'  function draw(pageOnly=false){',
   helper+'  function draw(pageOnly=false){','SCOPED_LIVE_HEADING_HELPER');
 s=replaceOnce(s,'    mobileNav();','    mobileNav();\n    b46RenameNativeLiveStatsHeading();',
   'RUN_AFTER_NAV_MOUNT');
 if(s.includes("'PRE-MATCH · TEST'")||
   !s.includes("el('div','b46pm-nav-heading','PRE-MATCH STATISTICS')")||
   !s.includes("el('div','b46m-grouplabel','PRE-MATCH STATISTICS')")||
   !s.includes("node.textContent='LIVE STATISTICS'"))
  throw Error('HEADING_PATCH_INVARIANT_FAILED');
 return {code:s,scope:'TEST_UI_HEADINGS_ONLY',live:'LIVE STATISTICS',prematch:'PRE-MATCH STATISTICS',
   marketRoutesChanged:false,backendChanged:false,providerCallsAdded:0};
}
