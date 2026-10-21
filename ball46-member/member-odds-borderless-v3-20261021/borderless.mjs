import assert from 'node:assert/strict';
export const MARKER='B46_MEMBER_ODDS_BORDERLESS_LABEL_V3_20261021';
export const LABEL='<span class="b46-odds-trigger-label" aria-hidden="true">ODDS</span><svg class="b46-odds-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
export const CSS=String.raw`
/* B46_MEMBER_ODDS_BORDERLESS_LABEL_V3_20261021 — only the Member ODDS menu and header grid. */
.page-member .topbar .topbar-inner{
  display:grid;
  grid-template-columns:132px minmax(0,1fr) 108px 176px;
  column-gap:14px;
  align-items:center;
  height:68px;
}
.page-member .topbar .brand{grid-column:1;grid-row:1}
.page-member .topbar .nav{grid-column:2;grid-row:1;justify-self:end;min-width:0}
.page-member .topbar .b46-odds-wrap{grid-column:3;grid-row:1;justify-self:center;margin:0}
.page-member .topbar .topbar-account-slot{grid-column:4;grid-row:1;width:176px;min-width:0;justify-self:end;align-self:center}
.page-member .topbar .b46-odds-trigger{
  display:flex;align-items:center;justify-content:center;gap:7px;
  width:108px;min-width:0;height:36px;padding:0 10px;
  border:0!important;border-radius:10px;
  color:#d5e2df;
  background:linear-gradient(155deg,#263b40,#172931 58%,#10222c);
  box-shadow:none!important;filter:none!important;
  cursor:pointer;
}
.page-member .topbar .b46-odds-trigger::before{display:none!important}
.page-member .topbar .b46-odds-trigger:hover,
.page-member .topbar .b46-odds-trigger[aria-expanded="true"]{
  background:linear-gradient(155deg,#31494b,#1c3139 58%,#152a32);
  border:0!important;color:#f2f8f5;
  box-shadow:none!important;
}
.page-member .topbar .b46-odds-trigger svg:not(.b46-odds-chevron){width:17px;height:17px;flex:none}
.page-member .topbar .b46-odds-trigger .b46-odds-chevron{width:11px;height:11px;flex:none;opacity:.68;stroke-width:1.7}
.page-member .topbar .b46-odds-trigger .b46-odds-trigger-label{
  font:800 10px/1 Manrope,Inter,ui-sans-serif,system-ui,sans-serif;
  letter-spacing:.065em;
  white-space:nowrap;
}
/* Floating graphite panel without any enclosing outline, shadow, or divider. */
.page-member .topbar .b46-odds-menu{
  border:0!important;border-radius:12px;
  background:linear-gradient(168deg,#263a3e 0%,#1a3038 46%,#112630 100%);
  box-shadow:none!important;filter:none!important;
  padding:9px;isolation:isolate;
}
.page-member .topbar .b46-odds-heading{padding:9px 10px 11px;color:#b0c0c1}
.page-member .topbar .b46-odds-code{
  border:0!important;background:rgba(165,194,191,.12);
  border-radius:5px;color:#e0eae5;
}
.page-member .topbar .b46-odds-option{
  border:0!important;border-radius:8px;
  background:transparent;box-shadow:none!important;
}
.page-member .topbar .b46-odds-option[aria-checked="true"]{background:rgba(168,191,188,.15)}
.page-member .topbar .b46-odds-option:hover{background:rgba(180,204,199,.12)}
.page-member .topbar .b46-odds-dot{
  border:0!important;background:rgba(187,208,202,.12);
  box-shadow:none!important;
}
.page-member .topbar .b46-odds-option[aria-checked="true"] .b46-odds-dot{border:0!important;background:rgba(174,210,195,.23)}
.page-member .topbar .b46-odds-option[aria-checked="true"] .b46-odds-dot:after{background:#d3e9dd}
.page-member .topbar .b46-odds-note{
  border:0!important;border-top:0!important;
  padding:10px 10px 4px;margin-top:5px;
  color:#9bb0b3;
}
@media(max-width:900px){
 .page-member .topbar .topbar-inner{grid-template-columns:118px minmax(0,1fr) 94px 154px;column-gap:10px}
 .page-member .topbar .b46-odds-trigger{width:94px;height:35px;gap:5px}
 .page-member .topbar .topbar-account-slot{width:154px}
}
@media(max-width:680px){
 .page-member .topbar .topbar-inner{
    grid-template-columns:minmax(126px,1fr) 76px minmax(0,154px);
    column-gap:8px;height:60px;
 }
 .page-member .topbar .nav{display:none}
 .page-member .topbar .brand{grid-column:1;grid-row:1}
 .page-member .topbar .b46-odds-wrap{grid-column:2;grid-row:1}
 .page-member .topbar .topbar-account-slot{grid-column:3;grid-row:1;width:auto;min-width:0;max-width:154px}
 .page-member .topbar .b46-odds-trigger{width:76px;height:33px;gap:4px;padding:0 5px}
 .page-member .topbar .b46-odds-trigger svg:not(.b46-odds-chevron){width:14px;height:14px}
 .page-member .topbar .b46-odds-trigger .b46-odds-chevron{width:9px;height:9px}
 .page-member .topbar .b46-odds-trigger .b46-odds-trigger-label{font-size:9px;letter-spacing:.025em}
 .page-member .topbar .b46-odds-menu{right:-88px;max-width:calc(100vw - 18px)}
}
@media(max-width:360px){
 .page-member .topbar .topbar-inner{grid-template-columns:minmax(126px,1fr) 68px minmax(0,132px);column-gap:6px}
 .page-member .topbar .b46-odds-trigger{width:68px;gap:4px;padding:0 4px}
 .page-member .topbar .b46-odds-trigger .b46-odds-chevron{display:none}
 .page-member .topbar .b46-odds-menu{right:-78px}
}
`;
const oldSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h4.5m4.1 0h7.2M4 12h9.2m4.2 0h2.4M4 17.5h4.5m4.1 0h7.2"/><circle cx="10.6" cy="6.5" r="2"/><circle cx="15.6" cy="12" r="2"/><circle cx="10.6" cy="17.5" r="2"/></svg>';
const single=(s,a,b,label)=>{assert.equal(s.split(a).length-1,1,'ANCHOR_DRIFT_'+label);return s.replace(a,b);};
export function patchOddsBorderless({html,css}){
 assert(html.includes('b46-member-odds-trigger')&&html.includes('member-odds-topbar.css?v=20261021-topbar-premium-v2'),'PREMIUM_V2_HTML_NOT_PRESENT');
 assert(css.includes('B46_MEMBER_ODDS_TOPBAR_ALIGNMENT_PREMIUM_V2_20261021'),'PREMIUM_V2_CSS_NOT_PRESENT');
 assert(!html.includes('b46-odds-trigger-label')&&!css.includes(MARKER),'ALREADY_PATCHED');
 const original=html;
 html=single(html,oldSvg,oldSvg+LABEL,'VISIBLE_ODDS_LABEL');
 html=single(html,'member-odds-topbar.css?v=20261021-topbar-premium-v2','member-odds-topbar.css?v=20261021-odds-borderless-v3','CACHE_BUST');
 css=css+'\n'+CSS+'\n';
 assert.equal(html.replace(oldSvg+LABEL,oldSvg).replace('member-odds-topbar.css?v=20261021-odds-borderless-v3','member-odds-topbar.css?v=20261021-topbar-premium-v2'),original,'UNRELATED_HTML_CHANGE');
 return {html,css};
}
