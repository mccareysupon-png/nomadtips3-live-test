// BALL46 Statistics — permanently delete redundant TOP KPI row at HTML source.
// Seven static KPI cards plus 8th "SETTLED DAYS" supplied by old JS were moved.
// Keep original settled figures and all native chart modules untouched.
import {sanitizeStatsPage} from './remove-obsolete-stats-ui.mjs';
export const PATCH_TAG='B46_REMOVE_MOVED_TOP_KPIS_SOURCE_20261117';
export function removeMovedKpiStripFromMenu(moduleSource){
 if(typeof moduleSource!=='string'||moduleSource.length<1000)
   throw Error('INVALID_MENU_MODULE_SOURCE');
 if(moduleSource.includes(PATCH_TAG))throw Error('ALREADY_REMOVED');
 const old=sanitizeStatsPage.toString();
 if(moduleSource.split(old).length!==2)throw Error('CURRENT_MENU_SANITIZER_SOURCE_DRIFT');
 if(old.split(' return clean;').length!==2)throw Error('SANITIZER_RETURN_ANCHOR_DRIFT');
 const removal=[
  " // B46_REMOVE_MOVED_TOP_KPIS_SOURCE_20261117",
  " const topStart=clean.indexOf('<section class=\"sp-kpis\">');",
  " if(topStart<0||clean.indexOf('<section class=\"sp-kpis\">',topStart+1)!==-1)",
  "   throw Error('TOP_KPI_HTML_ANCHOR_DRIFT');",
  " const topEnd=clean.indexOf('</section>',topStart);",
  " if(topEnd<0||topEnd-topStart>6000)throw Error('TOP_KPI_SECTION_NOT_CLOSED');",
  " const removed=clean.slice(topStart,topEnd+10);",
  " for(const key of ['total','unsettled','win','loss','push','rate','odds']){",
  "   if(!removed.includes('data-sp-kpi=\"'+key+'\"'))",
  "     throw Error('LEGACY_KPI_CARD_SOURCE_DRIFT_'+key);",
  " }",
  " const without=clean.slice(0,topStart)+clean.slice(topEnd+10);",
  " if(without.includes('<section class=\"sp-kpis\">')||",
  "   without.includes('data-sp-kpi=\"total\"'))",
  "   throw Error('OLD_TOP_KPI_ROW_STILL_RENDERED');",
  " return without;"
 ].join('\n');
 const rewritten=moduleSource.replace(old,old.replace(' return clean;',removal));
 if(rewritten===moduleSource||!rewritten.includes(PATCH_TAG))
   throw Error('TOP_ROW_SANITIZER_REPLACEMENT_FAILED');
 return {source:rewritten,oldBytes:moduleSource.length,newBytes:rewritten.length,patchTag:PATCH_TAG};
}
