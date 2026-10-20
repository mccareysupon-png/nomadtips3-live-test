export const MARKER='b46-pc-ticker-gap-fix-20261020';
export const PATCH_CSS=String.raw`<style id="b46-pc-ticker-gap-fix-20261020">
/* PC/Laptop: remove the empty ticker mount even when no ticker child has rendered.
   Do not change the signal engine, ticker data, mobile, or surrounding card layout. */
@media (min-width:768px){
 html body .workspace.singlepage .workspace-scorebar-slot,
 html body .workspace.singlepage .workspace-scorebar-slot:empty{
  display:none!important;
  height:0!important;
  min-height:0!important;
  max-height:0!important;
  margin:0!important;
  padding:0!important;
  border:0!important;
  overflow:hidden!important;
 }
}
</style>`;
export function injectPcGapFix(html){
 if(typeof html!=='string'||!html.includes('</body>'))throw Error('HTML_PATCH_TARGET_NOT_FOUND');
 if(!html.includes('b46-pc-hide-result-ticker-20261020')||!html.includes('b46-signal-mobile-deep-teal-v2-20261020'))throw Error('LATEST_PRODUCTION_TICKER_AND_SIGNAL_NOT_FOUND');
 if(html.includes(MARKER))throw Error('GAP_FIX_ALREADY_APPLIED');
 return html.replace('</body>',PATCH_CSS+'</body>');
}
