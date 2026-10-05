import assert from 'node:assert/strict';
export const beforeHash='b7ef09b7f9361a04a10e3dd90beec8f474dcf3783211e8db9ec1529ae13e808b';
export const marker='B46_REMOVE_LOSS_PENDING_TOP_ACCENT_20261005';
export function patch(css){
 assert.equal(typeof css,'string','CURRENT_SCOREBAR_CSS_NOT_TEXT_STOP');
 assert(css.includes('B46_TEN_CARD_RESPONSIVE_FINAL_20261005'),'TEN_CARD_RESPONSIVE_BASE_MISSING_STOP');
 assert(css.includes('.workspace-scorebar-cell::before{'),'CURRENT_TOP_ACCENT_RULE_MISSING_STOP');
 assert(css.includes('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss{'),'CURRENT_LOSS_CARD_RULE_MISSING_STOP');
 assert(css.includes('.workspace-scorebar-cell.workspace-scorebar-pending{'),'CURRENT_PENDING_CARD_RULE_MISSING_STOP');
 assert(!css.includes(marker),'LOSS_PENDING_TOP_ACCENT_ALREADY_REMOVED_STOP');
 const override=`

/* ${marker}: remove only the remaining top accent line from LOSS and PENDING cards. */
html body [data-workspace-scorebar-slot] .workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss::before,
html body [data-workspace-scorebar-slot] .workspace-scorebar-cell.workspace-scorebar-pending::before{
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
 assert(out.includes(marker),'LOSS_PENDING_TOP_ACCENT_MARKER_MISSING_STOP');
 assert(out.includes('outcome-loss::before'),'LOSS_TOP_ACCENT_OVERRIDE_MISSING_STOP');
 assert(out.includes('workspace-scorebar-pending::before'),'PENDING_TOP_ACCENT_OVERRIDE_MISSING_STOP');
 return out;
}
