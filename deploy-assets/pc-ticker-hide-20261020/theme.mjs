export const TICKER_MARKER='b46-pc-hide-result-ticker-20261020';
export const TICKER_CSS=String.raw`<style id="b46-pc-hide-result-ticker-20261020">
/* BALL46 PC/Laptop: remove the entire scrolling PUSH/LOSS/WIN result ticker visually;
   retain the Signal data/engine, and keep mobile completely unchanged. */
@media(min-width:768px){
  html body .b46-signal-ticker,
  html body .workspace.singlepage .workspace-scorebar-slot .b46-signal-ticker,
  html body .workspace.singlepage .b46-signal-ticker{
    display:none!important;
    visibility:hidden!important;
  }
  body .workspace.singlepage .workspace-scorebar-slot:has(.b46-signal-ticker){
    display:none!important;
    height:0!important;
    min-height:0!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
  }
}
</style>`;
export function injectHideTicker(html){
 if(typeof html!=='string'||!html.includes('</body>'))throw new Error('TICKER_HTML_MISSING');
 if(!html.includes('b46-signal-mobile-deep-teal-v2-20261020')||!html.includes('b46-mobile-ultrasoft-flow-v3-20261020'))throw new Error('LATEST_SIGNAL_AND_FLOW_MISSING');
 if(html.includes(TICKER_MARKER))throw new Error('TICKER_HIDE_ALREADY_INSTALLED');
 return html.replace('</body>',TICKER_CSS+'</body>');
}
