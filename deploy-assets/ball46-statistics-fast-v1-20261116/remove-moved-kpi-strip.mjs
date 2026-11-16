// BALL46 Statistics — remove the moved top KPI strip from the VISIBLE page.
// IMPORTANT: the original native summary script reads the old KPI DOM to fill
// the new 8-metric finance card. Do NOT delete that data source or recalculate it.
// Keep it non-rendering from initial server HTML, for all markets and breakpoints.
import {sanitizeStatsPage} from './remove-obsolete-stats-ui.mjs';
export const PATCH_TAG='B46_HIDE_MOVED_TOP_KPI_SOURCE_20261117';
export const NO_FLASH_STYLE='b46-moved-top-kpis-no-flash-20261117';
export function removeMovedKpiStripFromMenu(moduleSource){
 if(typeof moduleSource!=='string'||moduleSource.length<1000)
   throw Error('INVALID_MENU_MODULE_SOURCE');
 if(moduleSource.includes(PATCH_TAG))throw Error('ALREADY_REMOVED_FROM_VIEW');
 const old=sanitizeStatsPage.toString();
 if(moduleSource.split(old).length!==2)throw Error('CURRENT_MENU_SANITIZER_SOURCE_DRIFT');
 if(old.split(' return clean;').length!==2)throw Error('SANITIZER_RETURN_ANCHOR_DRIFT');
 const replacement=[
  " // B46_HIDE_MOVED_TOP_KPI_SOURCE_20261117",
  " const tag='<section class=\"sp-kpis\">';",
  " const topStart=clean.indexOf(tag);",
  " if(topStart<0||clean.indexOf(tag,topStart+1)!==-1)",
  "   throw Error('TOP_KPI_HTML_ANCHOR_DRIFT');",
  " const topEnd=clean.indexOf('</section>',topStart);",
  " if(topEnd<0||topEnd-topStart>6000)throw Error('TOP_KPI_SECTION_NOT_CLOSED');",
  " const source=clean.slice(topStart,topEnd+10);",
  " for(const key of ['total','unsettled','win','loss','push','rate','odds']){",
  "   if(!source.includes('data-sp-kpi=\"'+key+'\"'))",
  "      throw Error('KPI_DATA_SOURCE_NOT_PRESERVED_'+key);",
  " }",
  " const nonVisual='<section class=\"sp-kpis\" data-b46-relocated-source=\"1\" hidden aria-hidden=\"true\" style=\"display:none!important\">';",
  " const hidden=clean.replace(tag,nonVisual);",
  " if(!hidden.includes('</head>'))throw Error('HEAD_ANCHOR_MISSING');",
  " const guard='<style id=\"b46-moved-top-kpis-no-flash-20261117\">.workspace-panel[data-workspace-panel=\"statistics\"] .sp-kpis,.workspace-panel[data-workspace-panel=\"statistics\"] .b46v23-strip-grid{display:none!important;height:0!important;margin:0!important;padding:0!important}</style>';",
  " if(hidden.includes('id=\"b46-moved-top-kpis-no-flash-20261117\"'))throw Error('DUPLICATE_GUARD');",
  " return hidden.replace('</head>',guard+'</head>');"
 ].join('\n');
 const rewritten=moduleSource.replace(old,old.replace(' return clean;',replacement));
 if(rewritten===moduleSource||!rewritten.includes(PATCH_TAG))
   throw Error('TOP_KPI_SOURCE_GUARD_INJECTION_FAILED');
 return {source:rewritten,oldBytes:moduleSource.length,newBytes:rewritten.length,
   patchTag:PATCH_TAG,visibleStripDeleted:true,sourceMetricsPreserved:true};
}
