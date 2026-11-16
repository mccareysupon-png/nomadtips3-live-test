// BALL46 2026-11-16: remove TWO obsolete Statistics UI producers at their source.
// 1. Strip the 2026-11-14 skeleton/animation injection AND payload constants
//    from the actual statistics-menu-entry Worker module.
// 2. Replace only the old October-22 full-panel hydration overlay with an
//    immediate, non-animated first-paint guard. Keep its readiness script;
//    keep the native Statistics renderer, all market logic and all Ledger logic.
export const VISUAL_OLD='b46-statistics-visuals-20261114';
export const LOADER_OLD='b46-stats-loader';
export const CSS_OLD='b46-statistics-no-old-flash-20261022';
export const READY_SCRIPT='b46-statistics-ready-20261022';
export const CSS_NEW='b46-stats-v1-no-legacy-firstpaint-20261116';

const legacyReturn="return new Response(html.replace('</head>',B46_VISUAL_STYLE+'</head>').replace('</body>',B46_VISUAL_SCRIPT+'</body>'),{status:r.status,headers});";
const constantsStart='const B46_VISUAL_STYLE=';
const oldStyleStart='<style id="'+CSS_OLD+'">';
const newCSS=[
 '/* Only the Statistics screen; no skeletons, old chart placeholders or transitions. */',
 'body[data-workspace-view="statistics"] .workspace-panel[data-workspace-panel="statistics"]::after{content:none!important;display:none!important}',
 'body[data-workspace-view="statistics"] .workspace-panel[data-workspace-panel="statistics"] > .b46-stats-loader{display:none!important}',
 'body[data-workspace-view="statistics"] .workspace-panel[data-workspace-panel="statistics"] > .sp-stats-content:not(:has(#b46-fast-v1-preview)):not(:has(svg.f46-svg)){visibility:hidden!important}',
 'html[data-b46-statistics-render-error="1"] body[data-workspace-view="statistics"] .workspace-panel[data-workspace-panel="statistics"] > .sp-stats-content{visibility:visible!important}',
 'body[data-workspace-view="statistics"] .workspace-panel[data-workspace-panel="statistics"] .sp-trend:not(.b46-fast-v1-host):not(:has(svg.f46-svg)){visibility:hidden!important}'
].join('\n');
export const replacementStyle='<style id="'+CSS_NEW+'">'+newCSS+'</style>';

export function sanitizeStatsPage(html){
 if(typeof html!=='string')throw Error('HTML_NOT_TEXT');
 if(html.includes('id="'+VISUAL_OLD+'"'))throw Error('REMOVED_ANIMATION_REAPPEARED');
 if(html.includes('id="'+CSS_NEW+'"'))throw Error('DUPLICATE_NEW_HYDRATION_GUARD');
 const start=html.indexOf(oldStyleStart);
 if(start<0||html.indexOf(oldStyleStart,start+1)>=0)throw Error('OLD_HYDRATION_GUARD_DRIFT');
 const end=html.indexOf('</style>',start);
 if(end<0||end-start>10000)throw Error('OLD_HYDRATION_GUARD_UNTERMINATED');
 // The existing ready-signal script must remain present and unchanged.
 if(!html.includes('<script id="'+READY_SCRIPT+'">'))
  throw Error('READINESS_SIGNAL_MISSING');
 const clean=html.slice(0,start)+replacementStyle+html.slice(end+8);
 if(clean.includes(oldStyleStart)||clean.includes('id="'+VISUAL_OLD+'"'))
  throw Error('LEGACY_ANIMATION_OR_GUARD_STILL_PRESENT');
 return clean;
}
export function removeObsoleteStatsMenu(source){
 if(typeof source!=='string')throw Error('MENU_SOURCE_NOT_TEXT');
 if(source.split(legacyReturn).length!==2)throw Error('ANIMATED_LOADER_RETURN_ANCHOR_CHANGED');
 const start=source.indexOf(constantsStart);
 if(start<1000||source.indexOf(constantsStart,start+1)!==-1)throw Error('VISUAL_CONSTANT_START_DRIFT');
 const prefix=source.slice(0,start);
 const suffix=source.slice(start);
 if(!suffix.startsWith(constantsStart)||!suffix.includes('const B46_VISUAL_SCRIPT=')||
    !suffix.includes('b46sl-preview-bars')||!suffix.includes('template.innerHTML')||
    !suffix.trimEnd().endsWith('";'))
  throw Error('LEGACY_VISUAL_CONSTANT_BODY_DRIFT');
 if(prefix.includes('const B46_VISUAL_SCRIPT='))throw Error('VISUAL_CONSTANT_REDECLARED');
 const rewritten=prefix.replace(legacyReturn,
    "return new Response(sanitizeStatsPage(html),{status:r.status,headers});");
 if(rewritten===prefix)throw Error('LOADER_REPLACEMENT_FAILED');
 // Embed this helper as immutable Worker module source.
 const helper=sanitizeStatsPage.toString();
 const code=rewritten+
   '\nconst CSS_OLD='+JSON.stringify(CSS_OLD)+';\n'+
   'const VISUAL_OLD='+JSON.stringify(VISUAL_OLD)+';\n'+
   'const CSS_NEW='+JSON.stringify(CSS_NEW)+';\n'+
   'const READY_SCRIPT='+JSON.stringify(READY_SCRIPT)+';\n'+
   'const oldStyleStart='+JSON.stringify(oldStyleStart)+';\n'+
   'const replacementStyle='+JSON.stringify(replacementStyle)+';\n'+
   helper+';\n';
 if(code.includes('B46_VISUAL_STYLE')||code.includes('B46_VISUAL_SCRIPT')||
    code.includes('b46sl-preview-bars')||code.includes('template.innerHTML')||
    code.includes('Loading statistics'))
  throw Error('OLD_ANIMATION_CODE_NOT_FULLY_REMOVED');
 return {code,removedBytes:source.length-code.length,oldSourceLength:source.length,newSourceLength:code.length};
}
