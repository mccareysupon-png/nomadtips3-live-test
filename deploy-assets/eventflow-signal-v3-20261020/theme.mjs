// BALL46 SIGNAL V3: CSS-only SVG paint-server gradient, zero-layout defs, no feed or signal logic changes.
import {STYLE as OLD_STYLE} from '../eventflow-signal-elevation-20261020/theme.mjs';
export const MARKER='b46-eventflow-signal-v3-gradient-20261020';
export const GRADIENT_ID='b46-eventflow-signal-graphite-gradient-20261020';
export const STYLE=String.raw`<style id="b46-eventflow-signal-v3-gradient-20261020">
svg g.b46-eventflow-signal-entry.b46-eventflow-signal-annotation > rect{
  stroke:none!important;
  stroke-width:0!important;
  fill:url(#b46-eventflow-signal-graphite-gradient-20261020) #153b33!important;
  fill-opacity:.98!important;
  filter:drop-shadow(0 5px 8px rgba(0,0,0,.32)) drop-shadow(0 -1px 2px rgba(98,230,190,.14))!important;
}
</style>`;
export const DEFS=String.raw`<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none" data-b46-signal-gradient-def="v3"><defs><linearGradient id="b46-eventflow-signal-graphite-gradient-20261020" x1="0%" y1="0%" x2="20%" y2="100%"><stop offset="0%" stop-color="#294f47"/><stop offset="23%" stop-color="#1d433d"/><stop offset="60%" stop-color="#143832"/><stop offset="100%" stop-color="#0a2526"/></linearGradient></defs></svg>`;
export function inject(html){
 if(typeof html!=='string'||!html.includes('</body>')||!html.includes(OLD_STYLE))throw Error('SIGNAL_V3_BASELINE_HTML_MISSING');
 if(html.includes(MARKER)||html.includes('data-b46-signal-gradient-def="v3"'))throw Error('SIGNAL_V3_ALREADY_PRESENT');
 for(const required of ['b46-mobile-ultrasoft-flow-v3-20261020','b46-pc-hide-result-ticker-20261020','b46-pc-ticker-gap-fix-20261020']){if(!html.includes(required))throw Error('SIGNAL_V3_REQUIRED_LIVE_FEATURE_MISSING '+required)}
 if(html.split(OLD_STYLE).length!==2)throw Error('SIGNAL_V3_OLD_STYLE_NOT_UNIQUE');
 return html.replace(OLD_STYLE,STYLE).replace('</body>',DEFS+'</body>');
}
export {OLD_STYLE};
