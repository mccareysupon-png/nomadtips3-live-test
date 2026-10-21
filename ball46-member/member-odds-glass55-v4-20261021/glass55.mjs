import assert from 'node:assert/strict';
export const MARKER='B46_MEMBER_ODDS_DROPDOWN_GLASS55_V4_20261021';
export const CSS=String.raw`
/* B46_MEMBER_ODDS_DROPDOWN_GLASS55_V4_20261021
   55% transparent means 45% opaque BACKGROUND ONLY — preserve text opacity. */
.page-member .topbar .b46-odds-menu{
  background:rgba(18,38,48,.45)!important;
  -webkit-backdrop-filter:blur(10px);
  backdrop-filter:blur(10px);
  border:0!important;
  box-shadow:none!important;
  filter:none!important;
}
.page-member .topbar .b46-odds-heading,
.page-member .topbar .b46-odds-option,
.page-member .topbar .b46-odds-note{
  opacity:1;
  box-shadow:none!important;
}
.page-member .topbar .b46-odds-option,
.page-member .topbar .b46-odds-code,
.page-member .topbar .b46-odds-dot,
.page-member .topbar .b46-odds-note{
  border:0!important;
}
.page-member .topbar .b46-odds-note{border-top:0!important;}
`;
const once=(text,a,b,name)=>{assert.equal(text.split(a).length-1,1,'GLASS55_ANCHOR_'+name);return text.replace(a,b);};
export function patchGlass55({html,css}){
  assert(html.includes('b46-odds-trigger-label')&&html.includes('member-odds-topbar.css?v=20261021-odds-borderless-v3'),'MEMBER_CURRENT_ODDS_V3_HTML_MISSING');
  assert(css.includes('B46_MEMBER_ODDS_BORDERLESS_LABEL_V3_20261021'),'CURRENT_BORDERLESS_V3_CSS_MISSING');
  assert(!html.includes('odds-glass55-v4')&&!css.includes(MARKER),'GLASS55_ALREADY_APPLIED');
  const oldHtml=html;
  html=once(html,'member-odds-topbar.css?v=20261021-odds-borderless-v3','member-odds-topbar.css?v=20261021-odds-glass55-v4','CACHE_BUST_ONLY');
  css=css+'\n'+CSS+'\n';
  assert.equal(html.replace('member-odds-topbar.css?v=20261021-odds-glass55-v4','member-odds-topbar.css?v=20261021-odds-borderless-v3'),oldHtml,'OTHER_MEMBER_HTML_MODIFICATION');
  return {html,css};
}
