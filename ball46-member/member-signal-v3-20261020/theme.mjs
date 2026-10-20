import assert from 'node:assert/strict';
// BALL46 Member: purely presentational change to SVG Event Flow SIGNAL plate.
// Existing point, connector, minute, market, price, bookmaker, layout and API stay intact.
export const MARKER='B46_MEMBER_EVENTFLOW_SIGNAL_V3_20261020';
export const GRADIENT_ID='b46-member-eventflow-signal-v3-20261020';
export const STYLE=String.raw\`
/* B46_MEMBER_EVENTFLOW_SIGNAL_V3_20261020 — scoped to Member SVG plate only. */
.page-member .member-flow-chart svg g.member-flow-signal-tag > rect.member-flow-signal-plate{
  stroke:none!important;
  stroke-width:0!important;
  fill:url(#b46-member-eventflow-signal-v3-20261020) #183b36!important;
  fill-opacity:.98!important;
  filter:drop-shadow(0 5px 8px rgba(0,0,0,.34)) drop-shadow(0 -1px 2px rgba(104,230,184,.14))!important;
  animation:none!important;
}\`;
const OLD_DEFS='defs.append(gh,ga); svg.append(defs);';
const NEXT_DEFS=\`const __b46MemberSignalV3=svgNode('linearGradient',{id:'b46-member-eventflow-signal-v3-20261020',x1:'0%',y1:'0%',x2:'22%',y2:'100%'});\n  __b46MemberSignalV3.append(svgNode('stop',{offset:'0%','stop-color':'#31554d'}),svgNode('stop',{offset:'24%','stop-color':'#21463e'}),svgNode('stop',{offset:'63%','stop-color':'#153932'}),svgNode('stop',{offset:'100%','stop-color':'#0b2727'}));\n  defs.append(gh,ga,__b46MemberSignalV3); svg.append(defs);\`;
function one(s,oldValue,newValue,label){
 assert.equal(s.split(oldValue).length-1,1,'ANCHOR_COUNT_CHANGED '+label);
 return s.replace(oldValue,newValue);
}
function bust(html,pattern,label){
 let count=0;const output=html.replace(pattern,(match,start)=>{count++;return start+'&b46MemberSignalV3=20261020"';});
 assert.equal(count,1,'CACHE_REFERENCE_MISSING '+label);
 return output;
}
export function patch({html,css,js}){
 assert(html.includes('b46-member-loading')&&html.includes('kpiV7=desktop-nine-in-one-row-20261020'),'MEMBER_LATEST_PROTECTED_HTML_MISSING');
 assert(js.includes("ball46:member-data-ready")&&js.includes("ball46:member-data-error"),'MEMBER_LATEST_DATA_READY_MISSING');
 assert(css.includes('BALL46 MEMBER — Desktop KPI V7: nine live-data summary cards'),'MEMBER_LATEST_CSS_MISSING');
 assert(!html.includes(MARKER)&&!css.includes(MARKER)&&!js.includes(GRADIENT_ID),'ALREADY_PATCHED');
 assert(js.includes("class:'member-flow-signal-plate'")&&js.includes("class:'member-flow-signal-connector'"),'SIGNAL_SVG_SOURCE_MISSING');
 js=one(js,OLD_DEFS,NEXT_DEFS,'EVENTFLOW_SVG_GRADIENT_DEFS');
 css=css+'\n'+STYLE+'\n';
 html=bust(html,/(href="\/styles\.css\?[^"]+)"/,'CSS');
 html=bust(html,/(src="\/member\.js\?[^"]+)"/,'JS');
 const protectedOtherHtml=html.replaceAll('&b46MemberSignalV3=20261020','');
 assert(protectedOtherHtml.includes('b46-member-loading'),'MEMBER_LOADING_REGRESSED');
 assert.equal(js.replace(NEXT_DEFS,OLD_DEFS).includes("ball46:member-data-ready"),true,'MEMBER_DATA_READY_CHANGED');
 assert(css.endsWith(STYLE+'\n'),'CSS_APPEND_FAILED');
 assert.equal(html.split('b46MemberSignalV3=20261020').length-1,2,'CACHE_BUST_COUNT');
 return {html,css,js};
}
