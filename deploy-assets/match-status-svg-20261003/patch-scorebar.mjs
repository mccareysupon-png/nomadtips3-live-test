import assert from 'node:assert/strict';
export const beforeHash='12fa2b6873fe280fa16b8a49447f2e43cf58770063a08082c7cbcf02c4ba1d40';
export const marker='B46_TEN_CARD_RESPONSIVE_FINAL_20261005';
export function patch(css){
 assert.equal(typeof css,'string','CURRENT_SCOREBAR_CSS_NOT_TEXT_STOP');
 assert(css.includes('B46_TOPCARDS_CLEAN_UI_20261004'),'CURRENT_TOPCARDS_CSS_MISSING_STOP');
 assert(css.includes('grid-template-columns:repeat(10,minmax(136px,1fr))!important'),'CURRENT_TOPCARDS_GRID_MOVED_STOP');
 assert(css.includes('overflow-x:auto!important'),'CURRENT_HORIZONTAL_RAIL_RULE_MOVED_STOP');
 assert(css.includes('.workspace-scorebar-meta i{'),'CURRENT_STATUS_STYLE_MOVED_STOP');
 assert(!css.includes(marker),'TEN_CARD_RESPONSIVE_ALREADY_APPLIED_STOP');
 const override=`

/* ${marker}: presentation only. Keep all 10 existing signal/result cards, distribute them across the available viewport, remove the horizontal scrolling rail, and keep status labels readable. */
html body [data-workspace-scorebar-slot]{
  display:block!important;
  visibility:visible!important;
  opacity:1!important;
  width:100%!important;
  max-width:100%!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  overflow:visible!important;
  background:transparent!important;
  background-image:none!important;
  border:0!important;
  box-shadow:none!important;
}
html body [data-workspace-scorebar-slot] .workspace-scorebar-grid{
  display:grid!important;
  grid-template-columns:repeat(10,minmax(0,1fr))!important;
  grid-auto-flow:row!important;
  grid-auto-rows:90px!important;
  align-items:stretch!important;
  justify-content:stretch!important;
  gap:8px!important;
  width:100%!important;
  max-width:100%!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  overflow:visible!important;
  overflow-x:visible!important;
  overflow-y:visible!important;
  padding:3px 2px 7px!important;
  scrollbar-width:none!important;
}
html body [data-workspace-scorebar-slot] .workspace-scorebar-grid::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
html body [data-workspace-scorebar-slot] .workspace-scorebar-cell{
  box-sizing:border-box!important;
  width:auto!important;
  min-width:0!important;
  height:90px!important;
  min-height:90px!important;
  max-height:90px!important;
}
html body [data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-meta i{
  color:#fff!important;
  font-weight:900!important;
  opacity:1!important;
}
@media(max-width:1180px){
  html body [data-workspace-scorebar-slot] .workspace-scorebar-grid{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;grid-auto-flow:row!important}
}
@media(max-width:760px){
  html body [data-workspace-scorebar-slot]{display:block!important;width:100%!important;max-width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}
  html body [data-workspace-scorebar-slot] .workspace-scorebar-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-flow:row!important;gap:7px!important;width:100%!important;max-width:100%!important;overflow:visible!important}
}
`;
 const out=css+override;
 assert(out.includes(marker),'TEN_CARD_RESPONSIVE_MARKER_MISSING_STOP');
 assert(out.includes('grid-template-columns:repeat(10,minmax(0,1fr))!important'),'DESKTOP_TEN_CARD_GRID_MISSING_STOP');
 assert(out.includes('repeat(5,minmax(0,1fr))!important'),'TABLET_GRID_MISSING_STOP');
 assert(out.includes('repeat(2,minmax(0,1fr))!important'),'MOBILE_GRID_MISSING_STOP');
 assert(out.includes('color:#fff!important'),'WHITE_STATUS_MISSING_STOP');
 return out;
}
