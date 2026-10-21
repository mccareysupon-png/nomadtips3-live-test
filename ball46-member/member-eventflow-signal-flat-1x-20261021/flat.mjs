import assert from 'node:assert/strict';
export const MARKER='B46_MEMBER_SIGNAL_FLAT_TEAL_GLOW_1X_20261021';
export const CSS=`
/* B46_MEMBER_SIGNAL_FLAT_TEAL_GLOW_1X_20261021 */
/* One solid deep teal, no gradient/border/cast-shadow.
   Glow 1x: one subtle 3px halo around the plate, and narrow accent only. */
.page-member .member-flow-chart svg g.member-flow-signal-tag > rect.member-flow-signal-plate{
  fill:#0C4C3E!important;
  fill-opacity:1!important;
  stroke:none!important;
  stroke-width:0!important;
  filter:drop-shadow(0 0 3px rgba(43,229,153,.17))!important;
  animation:none!important;
}
.page-member .member-flow-chart svg g.member-flow-signal-tag > rect.member-flow-signal-accent{
  fill:#20F2A0!important;
  opacity:1!important;
  stroke:none!important;
  filter:drop-shadow(0 0 3px rgba(32,242,160,.42))!important;
  animation:none!important;
}
@media(prefers-reduced-motion:reduce){
 .page-member .member-flow-chart svg g.member-flow-signal-tag > rect.member-flow-signal-plate{
   animation:none!important;
 }
 .page-member .member-flow-chart svg g.member-flow-signal-tag > rect.member-flow-signal-accent{
   animation:none!important;
 }
}
`;
function replaceOnce(source,from,to,at){
 assert.equal(source.split(from).length-1,1,'SIGNAL_1X_ANCHOR_CHANGED_'+at);
 return source.replace(from,to);
}
export function patchSignal1x({html,css}){
 assert(html.includes('b46-member-odds-wrap')&&html.includes('member-odds-topbar.css?v=20261021-odds-solid-v7'),'LATEST_MEMBER_V7_MISSING');
 assert(css.includes('B46_MEMBER_EVENTFLOW_SIGNAL_V3_20261020'),'REAL_SIGNAL_V3_STYLES_MISSING');
 assert(css.includes('member-flow-signal-accent'),'REAL_SIGNAL_ACCENT_MISSING');
 assert(!html.includes('b46SignalFlat1x20261021')&&!css.includes(MARKER),'ALREADY_DEPLOYED');
 const oldHtml=html,oldCss=css;
 let count=0;
 html=html.replace(/(href="\/styles\.css\?[^"]+)"/,(_full,prefix)=>{count++;return prefix+'&b46SignalFlat1x20261021=1"';});
 assert.equal(count,1,'MEMBER_STYLES_REFERENCE_MISSING');
 css=css+'\n'+CSS+'\n';
 assert.equal(html.replace('&b46SignalFlat1x20261021=1',''),oldHtml,'UNRELATED_HTML_CHANGE');
 assert.equal(css.slice(0,oldCss.length),oldCss,'UNRELATED_STYLES_CHANGE');
 return {html,css};
}
