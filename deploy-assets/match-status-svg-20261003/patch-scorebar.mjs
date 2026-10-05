import assert from 'node:assert/strict';
export const beforeHash='a07eaaec97746bc47c8e1aee997f443ebb138afd4b003e8f7029a32e01a26c9e';
export const marker='B46_CARD_HEIGHT_DRAW_ACCENT_FINAL_20261005';
export function patch(css){
 assert.equal(typeof css,'string','CURRENT_SCOREBAR_CSS_NOT_TEXT_STOP');
 assert(css.includes('B46_TEN_CARD_RESPONSIVE_FINAL_20261005'),'TEN_CARD_RESPONSIVE_BASE_MISSING_STOP');
 assert(css.includes('B46_REMOVE_LOSS_PENDING_TOP_ACCENT_20261005'),'LOSS_PENDING_ACCENT_BASE_MISSING_STOP');
 assert(css.includes('grid-auto-rows:90px!important'),'CURRENT_CARD_ROW_HEIGHT_MOVED_STOP');
 assert(css.includes('height:90px!important'),'CURRENT_CARD_HEIGHT_MOVED_STOP');
 assert(css.includes('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-draw{'),'CURRENT_DRAW_CARD_RULE_MISSING_STOP');
 assert(!css.includes(marker),'CARD_HEIGHT_DRAW_ACCENT_ALREADY_APPLIED_STOP');
 const override=`

/* ${marker}: 1) add ~5% card height so bottom details stay inside; 2) remove DRAW top accent line. Presentation only. */
html body [data-workspace-scorebar-slot] .workspace-scorebar-grid{
  grid-auto-rows:95px!important;
}
html body [data-workspace-scorebar-slot] .workspace-scorebar-cell{
  height:95px!important;
  min-height:95px!important;
  max-height:95px!important;
}
html body [data-workspace-scorebar-slot] .workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-draw::before{
  content:none!important;
  display:none!important;
  height:0!important;
  background:none!important;
  background-image:none!important;
  box-shadow:none!important;
  opacity:0!important;
}
`;
 const out=css+override;
 assert(out.includes(marker),'CARD_HEIGHT_DRAW_ACCENT_MARKER_MISSING_STOP');
 assert(out.includes('grid-auto-rows:95px!important'),'CARD_ROW_HEIGHT_95_MISSING_STOP');
 assert(out.includes('height:95px!important'),'CARD_HEIGHT_95_MISSING_STOP');
 assert(out.includes('outcome-draw::before'),'DRAW_TOP_ACCENT_OVERRIDE_MISSING_STOP');
 return out;
}
