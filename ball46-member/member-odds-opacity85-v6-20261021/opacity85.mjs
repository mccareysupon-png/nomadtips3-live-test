import assert from 'node:assert/strict';
export const MARKER='B46_MEMBER_ODDS_DROPDOWN_OPACITY85_V6_20261021';
export const CSS=`
/* B46_MEMBER_ODDS_DROPDOWN_OPACITY85_V6_20261021 */
/* 85% opaque (15% transparent) popup BACKGROUND ONLY, no text opacity change. */
.page-member .topbar .b46-odds-menu{
  background:rgba(18,38,48,.85)!important;
}
`;
function one(s,a,b,name){
  assert.equal(s.split(a).length-1,1,'SOURCE_ANCHOR_DRIFT_'+name);
  return s.replace(a,b);
}
export function patchOpacity85({html,css}){
 assert(html.includes('b46-odds-trigger-label')&&html.includes('member-odds-topbar.css?v=20261021-odds-opacity75-v5'),'LATEST_MEMBER_ODDS_V5_HTML_NOT_FOUND');
 assert(css.includes('B46_MEMBER_ODDS_DROPDOWN_OPACITY75_V5_20261021'),'LATEST_MEMBER_ODDS_V5_CSS_NOT_FOUND');
 assert(!html.includes('odds-opacity85-v6')&&!css.includes(MARKER),'V6_ALREADY_PATCHED');
 const oldHtml=html,oldCss=css;
 html=one(html,'member-odds-topbar.css?v=20261021-odds-opacity75-v5','member-odds-topbar.css?v=20261021-odds-opacity85-v6','CSS_CACHE_ONLY');
 css=css+'\n'+CSS+'\n';
 assert.equal(html.replace('member-odds-topbar.css?v=20261021-odds-opacity85-v6','member-odds-topbar.css?v=20261021-odds-opacity75-v5'),oldHtml,'UNRELATED_MEMBER_HTML_CHANGE');
 assert.equal(css.slice(0,oldCss.length),oldCss,'UNRELATED_CSS_CHANGE');
 return {html,css};
}
