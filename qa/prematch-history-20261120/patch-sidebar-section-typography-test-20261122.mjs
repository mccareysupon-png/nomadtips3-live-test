// BALL46 TEST — typography only: native desktop headings match Pre-Match Statistics.
// Mobile b46m-grouplabel is already identical across sections; leave untouched.
export const B46_SECTION_TITLE_TYPE_TEST_V1='B46_SECTION_TITLE_TYPE_TEST_V1';
export function patchSidebarSectionTypographyClient(original){
 if(typeof original!=='string'||
   !original.includes("el('div','b46pm-nav-heading','PRE-MATCH STATISTICS')")||
   !original.includes("el('div','b46m-grouplabel','PRE-MATCH STATISTICS')")||
   !original.includes('b46RenameNativeLiveStatsHeading();')||
   !original.includes('  function draw(pageOnly=false){'))
   throw Error('NOT_ACTIVE_TEST_SIDEBAR_HEADING_CLIENT');
 const anchor='    mobileNav();\n    b46RenameNativeLiveStatsHeading();';
 const css=[
  '@media(min-width:761px){',
  'aside.left-rail .rail-title{',
  'font-size:11px!important;',
  'font-weight:750!important;',
  'letter-spacing:.06em!important;',
  'line-height:1.45!important;',
  'padding:7px 10px!important;',
  'color:inherit!important;',
  'opacity:.7!important;',
  'box-sizing:border-box!important;',
  '}',
  'aside.left-rail .rail-title>span{',
  'font-size:inherit!important;',
  'font-weight:inherit!important;',
  'letter-spacing:inherit!important;',
  'line-height:inherit!important;',
  '}',
  '}'
 ].join('');
 const injection=[
  '    // Native desktop section headings mirror the existing Pre-Match heading;',
  '    // this does not style market rows, counts, mobile drawer or page headings.',
  "    if(!document.getElementById('b46-sidebar-section-type-v1')){",
  "      const style=document.createElement('style');",
  "      style.id='b46-sidebar-section-type-v1';",
  '      style.textContent='+JSON.stringify(css)+';',
  '      document.head.append(style);',
  '    }'
 ].join('\n');
 const count=original.split(anchor).length-1;
 if(count!==1)throw Error('SECTION_TITLE_SOURCE_DRIFT_'+count);
 const code=original.replace(anchor,anchor+'\n'+injection);
 if(!code.includes('b46-sidebar-section-type-v1')||code.includes("'PRE-MATCH · TEST'"))
   throw Error('SECTION_TITLE_PATCH_INVARIANT_FAILED');
 return {code,scope:'TEST_DESKTOP_HEADING_TYPE_ONLY',matchedHeadings:['MATCH STATUS','LIVE STATISTICS','LEAGUES'],desktopReference:'PRE-MATCH STATISTICS',mobileCSSUnchanged:true,routesChanged:false,backendChanged:false,providerCallsAdded:0};
}
