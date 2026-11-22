// BALL46 TEST frontend UI only: rename sidebar headings, not market routes.
// No changes to performance formulas, native statistics functionality, bots or ledgers.
export const B46_STATISTICS_HEADINGS_TEST_V1='B46_STATISTICS_HEADINGS_TEST_V1';
const replaceOnce=(s,from,to,label)=>{
 const n=s.split(from).length-1;
 if(n!==1)throw Error('B46_STAT_HEADING_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(from,to);
};
export function patchStatisticsSidebarHeadingsClient(original){
 if(typeof original!=='string'||!original.includes('b46pm-stats-navigation')||
    !original.includes('function draw(pageOnly=false){')||
    !original.includes("const routes = [")||
    !original.includes("const box=el('div','b46pm-mobile-navigation')"))
  throw Error('NOT_ACTIVE_B46_PREMATCH_TEST_CLIENT');
 let s=original;
 s=replaceOnce(s,
   "box.append(el('div','b46m-grouplabel','PRE-MATCH · TEST'));",
   "box.append(el('div','b46m-grouplabel','PRE-MATCH STATISTICS'));",
   'MOBILE_PREMATCH_HEADING');
 s=replaceOnce(s,
   "const title=el('div','b46pm-nav-heading','PRE-MATCH · TEST');wrapper.append(title);",
   "const title=el('div','b46pm-nav-heading','PRE-MATCH STATISTICS');wrapper.append(title);",
   'DESKTOP_PREMATCH_HEADING');
 const helper=String.raw