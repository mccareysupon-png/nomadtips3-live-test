import assert from 'node:assert/strict';
export const MARKER='B46_MEMBER_ODDS_DROPDOWN_OPACITY75_V5_20261021';
export const CSS=`
/* B46_MEMBER_ODDS_DROPDOWN_OPACITY75_V5_20261021 */
/* 75% opaque background (25% transparent), unchanged text and controls. */
.page-member .topbar .b46-odds-menu{
  background:rgba(18,38,48,.75)!important;
}
`;
function exactlyOnce(s,oldValue,nextValue,name){
 assert.equal(s.split(oldValue).length-1,1,'ODDS_75_SOURCE_DRIFT_'+name);
 return s.replace(oldValue,nextValue);
}
export function patchOpacity75({html,css}){
 assert(html.includes('b46-odds-trigger-label')&&html.includes('member-odds-topbar.css?v=20261021-odds-glass55-v4'),'EXPECTED_V4_HTML_ABSENT');
 assert(css.includes('B46_MEMBER_ODDS_DROPDOWN_GLASS55_V4_20261021'),'EXPECTED_V4_CSS_ABSENT');
 assert(!html.includes('odds-opacity75-v5')&&!css.includes(MARKER),'ALREADY_PATCHED');
 const previousHtml=html,previousCss=css;
 html=exactlyOnce(html,'member-odds-topbar.css?v=20261021-odds-glass55-v4','member-odds-topbar.css?v=20261021-odds-opacity75-v5','CACHE_BUST_ONLY');
 css=css+'\n'+CSS+'\n';
 assert.equal(html.replace('member-odds-topbar.css?v=20261021-odds-opacity75-v5','member-odds-topbar.css?v=20261021-odds-glass55-v4'),previousHtml,'UNRELATED_MEMBER_HTML_CHANGED');
 assert.equal(css.slice(0,previousCss.length),previousCss,'CSS_NON_APPEND_MODIFICATION');
 return {html,css};
}
