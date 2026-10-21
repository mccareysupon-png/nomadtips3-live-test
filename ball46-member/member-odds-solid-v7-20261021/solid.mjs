import assert from 'node:assert/strict';
export const MARKER='B46_MEMBER_ODDS_DROPDOWN_SOLID_V7_20261021';
export const CSS=`
/* B46_MEMBER_ODDS_DROPDOWN_SOLID_V7_20261021 */
/* Fully opaque Graphite panel: NO transparency, NO backdrop blur. */
.page-member .topbar .b46-odds-menu{
 background:rgb(18,38,48)!important;
 -webkit-backdrop-filter:none!important;
 backdrop-filter:none!important;
 border:0!important;
 box-shadow:none!important;
}
`;
function one(s,a,b,name){assert.equal(s.split(a).length-1,1,'SOLID_SOURCE_ANCHOR_DRIFT_'+name);return s.replace(a,b);}
export function patchSolid({html,css}){
 assert(html.includes('b46-odds-trigger-label')&&html.includes('member-odds-topbar.css?v=20261021-odds-opacity85-v6'),'EXPECTED_V6_HTML_ABSENT');
 assert(css.includes('B46_MEMBER_ODDS_DROPDOWN_OPACITY85_V6_20261021'),'EXPECTED_V6_CSS_ABSENT');
 assert(!html.includes('odds-solid-v7')&&!css.includes(MARKER),'SOLID_V7_ALREADY_PRESENT');
 const oldHtml=html,oldCss=css;
 html=one(html,'member-odds-topbar.css?v=20261021-odds-opacity85-v6','member-odds-topbar.css?v=20261021-odds-solid-v7','CSS_CACHE_ONLY');
 css=css+'\n'+CSS+'\n';
 assert.equal(html.replace('member-odds-topbar.css?v=20261021-odds-solid-v7','member-odds-topbar.css?v=20261021-odds-opacity85-v6'),oldHtml,'UNRELATED_MEMBER_HTML_CHANGE');
 assert.equal(css.slice(0,oldCss.length),oldCss,'UNRELATED_CSS_CHANGE');
 return {html,css};
}
