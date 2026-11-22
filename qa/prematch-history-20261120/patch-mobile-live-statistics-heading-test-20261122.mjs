// TEST UI-only hotfix: native mobile Statistics label can be re-rendered
// after Pre-Match UI initialization; keep its visible name in sync.
export function patchMobileLiveStatisticsHeading(original){
 if(typeof original!=='string'||
   !original.includes("b46RenameNativeLiveStatsHeading();")||
   !original.includes("el('div','b46pm-nav-heading','PRE-MATCH STATISTICS')")||
   !original.includes("el('div','b46m-grouplabel','PRE-MATCH STATISTICS')"))
   throw Error('NOT_CURRENT_TEST_STATS_HEADINGS_CLIENT');
 const old="    if(mobile&&mobile.textContent.trim().toLowerCase()==='statistics')mobile.textContent='LIVE STATISTICS';";
 const watch=[
 "    // Native mobile drawer can be rebuilt after the Pre-Match mount.",
 "    // Observe only drawer child-list changes; never market data or page content.",
 "    const drawer=document.getElementById('b46m-drawer');",
 "    if(drawer&&!drawer.dataset.b46LiveStatisticsLabelWatcher){",
 "      drawer.dataset.b46LiveStatisticsLabelWatcher='1';",
 "      new MutationObserver(()=>{",
 "        const live=drawer.querySelector('[data-b46m-page=\"statistics\"] > span:last-child');",
 "        if(live&&live.textContent.trim().toLowerCase()==='statistics')live.textContent='LIVE STATISTICS';",
 "      }).observe(drawer,{childList:true,subtree:true});",
 "    }"
 ].join('\n');
 const n=original.split(old).length-1;
 if(n!==1)throw Error('MOBILE_LIVE_STATISTICS_SOURCE_DRIFT_'+n);
 const code=original.replace(old,old+'\n'+watch);
 if(code.includes("'PRE-MATCH · TEST'")||
   !code.includes("if(node.textContent.trim()==='STATISTICS')node.textContent='LIVE STATISTICS';"))
   throw Error('STATS_HEADINGS_INVARIANT_FAILED');
 return {code,scope:'TEST_MOBILE_NAV_LABEL_ONLY',routesChanged:false,statsChanged:false,
   protectedBackendChanged:false};
}
