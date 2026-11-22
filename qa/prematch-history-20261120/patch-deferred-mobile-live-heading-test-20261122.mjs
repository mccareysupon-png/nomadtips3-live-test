// Test-only frontend: mobile drawer is created after Prematch init.
// Observe document additions ONLY UNTIL drawer exists, then disconnect.
export function patchDeferredMobileLiveHeading(original){
 if(typeof original!=='string'||
    !original.includes("b46LiveStatisticsLabelWatcher")||
    !original.includes("el('div','b46pm-nav-heading','PRE-MATCH STATISTICS')")||
    !original.includes("el('div','b46m-grouplabel','PRE-MATCH STATISTICS')"))
   throw Error('NOT_DEPLOYED_STATISTICS_HEADINGS_TEST_CLIENT');
 const needle="    const drawer=document.getElementById('b46m-drawer');";
 const addition=[
 "    // On mobile the drawer is mounted AFTER this script starts.",
 "    // The document observer disconnects immediately after that one insertion.",
 "    if(!drawer&&window.matchMedia('(max-width:760px)').matches&&!window.__b46WaitNativeStatsDrawer){",
 "      const waiter=new MutationObserver(()=>{",
 "        if(!document.getElementById('b46m-drawer'))return;",
 "        waiter.disconnect();window.__b46WaitNativeStatsDrawer=null;",
 "        b46RenameNativeLiveStatsHeading();",
 "      });",
 "      window.__b46WaitNativeStatsDrawer=waiter;",
 "      waiter.observe(document.documentElement,{childList:true,subtree:true});",
 "    }"
 ].join('\n');
 const count=original.split(needle).length-1;
 if(count!==1)throw Error('DEFERRED_DRAWER_SOURCE_DRIFT_'+count);
 const code=original.replace(needle,needle+'\n'+addition);
 if(!code.includes("node.textContent='LIVE STATISTICS'")||
    code.includes("'PRE-MATCH · TEST'")||
    !code.includes('b46LiveStatisticsLabelWatcher'))
    throw Error('MOBILE_DRAWER_PATCH_INVARIANT_FAILED');
 return {code,scope:'TEST_MOBILE_DRAWER_LATE_MOUNT_LABEL_ONLY',routesChanged:false,backendChanged:false,apiCallsAdded:0};
}
