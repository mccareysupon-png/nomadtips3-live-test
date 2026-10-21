import assert from 'node:assert/strict';
export const ICON_MARKER='B46_MEMBER_ODDS_TOPBAR_ALIGNMENT_PREMIUM_V2_20261021';
export const PREMIUM_CSS=String.raw`
/* B46_MEMBER_ODDS_TOPBAR_ALIGNMENT_PREMIUM_V2_20261021 */
/* The Member header now has four children: brand, nav, odds button and account.
   The previous three-column grid pushed the account into the next row. */
.page-member .topbar .topbar-inner{
  display:grid;
  grid-template-columns:132px minmax(0,1fr) 38px 176px;
  column-gap:14px;
  align-items:center;
  grid-auto-flow:row;
  height:68px;
}
.page-member .topbar .brand{grid-column:1;grid-row:1;justify-self:start}
.page-member .topbar .nav{grid-column:2;grid-row:1;justify-self:end;min-width:0}
.page-member .topbar .b46-odds-wrap{grid-column:3;grid-row:1;justify-self:center;align-self:center;margin-left:0}
.page-member .topbar .topbar-account-slot{
  grid-column:4;grid-row:1;
  width:176px;min-width:0;
  justify-self:end;align-self:center;
  display:flex;align-items:center;justify-content:flex-end;
}
.page-member .topbar .member-chip{min-width:0;max-width:100%}
/* A faceted charcoal-silver control: no colored glow or drop shadow. */
.page-member .topbar .b46-odds-trigger{
  position:relative;isolation:isolate;overflow:hidden;
  display:inline-flex;align-items:center;justify-content:center;
  width:38px;height:38px;
  border-radius:11px;
  border:1px solid rgba(198,215,214,.30);
  background:linear-gradient(155deg,#2b3f43 0%,#1b2b32 48%,#101f29 100%);
  color:#d0dddd;box-shadow:none;filter:none;
  transition:background .16s ease,border-color .16s ease,color .16s ease;
}
.page-member .topbar .b46-odds-trigger::before{
  content:"";position:absolute;top:2px;left:7px;right:7px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(234,243,242,.48),transparent);
  pointer-events:none;
}
.page-member .topbar .b46-odds-trigger svg{
  width:20px;height:20px;stroke:currentColor;stroke-width:1.6;
  fill:none;stroke-linejoin:round;stroke-linecap:round;
}
.page-member .topbar .b46-odds-trigger:hover,
.page-member .topbar .b46-odds-trigger[aria-expanded="true"]{
  color:#eff8f5;border-color:rgba(213,229,225,.53);
  background:linear-gradient(155deg,#354b4e,#203239 53%,#17252d);
  box-shadow:none;filter:none;
}
@media(max-width:900px){
  .page-member .topbar .topbar-inner{
    grid-template-columns:118px minmax(0,1fr) 36px 154px;
    column-gap:10px;
  }
  .page-member .topbar .topbar-account-slot{width:154px}
  .page-member .topbar .b46-odds-trigger{width:36px;height:36px}
}
@media(max-width:680px){
  .page-member .topbar .topbar-inner{
    grid-template-columns:minmax(85px,1fr) 34px minmax(0,154px);
    column-gap:8px;height:60px;
  }
  .page-member .topbar .nav{display:none}
  .page-member .topbar .brand{grid-column:1;grid-row:1}
  .page-member .topbar .b46-odds-wrap{grid-column:2;grid-row:1}
  .page-member .topbar .topbar-account-slot{
    grid-column:3;grid-row:1;width:auto;min-width:0;max-width:154px;
  }
  .page-member .topbar .member-chip{max-width:100%}
  .page-member .topbar .b46-odds-trigger{width:34px;height:34px}
  .page-member .topbar .b46-odds-menu{right:-88px;max-width:calc(100vw - 18px)}
}
@media(max-width:360px){
  .page-member .topbar .topbar-inner{grid-template-columns:minmax(78px,1fr) 32px minmax(0,132px);column-gap:6px}
  .page-member .topbar .b46-odds-trigger{width:32px;height:32px}
  .page-member .topbar .b46-odds-menu{right:-78px}
}
@media(prefers-reduced-motion:reduce){.page-member .topbar .b46-odds-trigger{transition:none}}
`;
export const SVG_BEFORE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg>';
export const SVG_AFTER='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h4.5m4.1 0h7.2M4 12h9.2m4.2 0h2.4M4 17.5h4.5m4.1 0h7.2"/><circle cx="10.6" cy="6.5" r="2"/><circle cx="15.6" cy="12" r="2"/><circle cx="10.6" cy="17.5" r="2"/></svg>';
const exact=(s,a,b,label)=>{assert.equal(s.split(a).length-1,1,'TOPBAR_V2_ANCHOR_'+label);return s.replace(a,b);};
export function patchPremiumTopbar({html,css}){
 assert(html.includes('b46-member-odds-trigger')&&html.includes('member-odds-topbar.js'),'LIVE_MEMBER_ODDS_V1_ABSENT');
 assert(css.includes('BALL46 MEMBER ODDS TOPBAR V1'),'ODDS_V1_CSS_MISSING');
 assert(!html.includes(ICON_MARKER)&&!css.includes(ICON_MARKER),'PREMIUM_V2_ALREADY_PATCHED');
 html=exact(html,SVG_BEFORE,SVG_AFTER,'SVG_ICON');
 html=exact(html,'member-odds-topbar.css?v=20261021-topbar-v1','member-odds-topbar.css?v=20261021-topbar-premium-v2','CSS_CACHE_VERSION');
 css=css+'\n'+PREMIUM_CSS+'\n';
 assert(css.includes('grid-template-columns:132px minmax(0,1fr) 38px 176px'),'FOUR_GRID_COLUMNS_MISSING');
 assert.equal(html.replace(SVG_AFTER,SVG_BEFORE).replace('member-odds-topbar.css?v=20261021-topbar-premium-v2','member-odds-topbar.css?v=20261021-topbar-v1'),arguments[0].html,'UNRELATED_MEMBER_HTML_CHANGE');
 return {html,css};
}
