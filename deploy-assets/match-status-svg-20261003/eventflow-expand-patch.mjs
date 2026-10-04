import assert from 'node:assert/strict';

export const MARKER='B46_EVENTFLOW_EXPAND_MODE_20261004';

const count=(text,needle)=>text.split(needle).length-1;

export function patchEventFlowExpand(input){
  let source=String(input||'');
  assert(source.includes('B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004'),'SIGNAL_ANNOTATION_BASE_MISSING');
  assert(!source.includes(MARKER),'EVENTFLOW_EXPAND_ALREADY_PRESENT');
  const fetchBefore=count(source,'fetch(');
  const boardBefore=count(source,"const BOARD_API='/api/engine/board';");
  const historyBefore=count(source,"const HISTORY_API='/api/engine/history';");

  const markerAnchor='const B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004=true;';
  assert.equal(count(source,markerAnchor),1,'EXPAND_MARKER_ANCHOR_MOVED');
  source=source.replace(markerAnchor,markerAnchor+'\nconst '+MARKER+'=true;');

  const stateAnchor='let signalRows=[];';
  assert.equal(count(source,stateAnchor),1,'EXPAND_STATE_ANCHOR_MOVED');
  source=source.replace(stateAnchor,stateAnchor+'\nlet eventFlowViewportExpanded=false;\nlet eventFlowSavedScrollY=null;');

  const dimensionAnchor="  const w=1000,h=232,pad={left:42,right:18,top:14,bottom:30},last=points[points.length-1],hx=xFor(last.minute,w,pad,current),hy=yFor(last.home,h,pad),ay=yFor(last.away,h,pad),safe=norm(fixtureId(f))||'flow';";
  assert.equal(count(source,dimensionAnchor),1,'EXPAND_DIMENSION_ANCHOR_MOVED');
  source=source.replace(dimensionAnchor,"  const viewportW=window.innerWidth||1000,viewportH=window.innerHeight||700,w=eventFlowViewportExpanded?clamp(Math.round(viewportW-24),360,1440):1000,h=eventFlowViewportExpanded?clamp(Math.round(viewportH-142),320,780):232,pad={left:42,right:18,top:14,bottom:30},last=points[points.length-1],hx=xFor(last.minute,w,pad,current),hy=yFor(last.home,h,pad),ay=yFor(last.away,h,pad),safe=norm(fixtureId(f))||'flow';");

  const htmlAnchor='function setHtmlIfChanged(node,html){if(node&&node.innerHTML!==html)node.innerHTML=html}';
  assert.equal(count(source,htmlAnchor),1,'EXPAND_HTML_ANCHOR_MOVED');
  const helpers=`function ensureEventFlowExpandStyle(){
  if(document.getElementById('b46-eventflow-expand-style-20261004'))return;
  const style=document.createElement('style');style.id='b46-eventflow-expand-style-20261004';
  style.textContent=\`html.b46-eventflow-viewport-lock,body.b46-eventflow-viewport-lock{overflow:hidden!important;overscroll-behavior:none!important}.expand-flow-card .expand-card-head{position:relative;padding-right:48px!important}.b46-eventflow-expand-toggle{position:absolute;right:9px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid rgba(97,242,179,.38);border-radius:8px;background:rgba(6,26,20,.88);color:#61f2b3;font:700 18px/1 system-ui,sans-serif;cursor:pointer;z-index:3;box-shadow:0 4px 14px rgba(0,0,0,.18)}.b46-eventflow-expand-toggle:hover,.b46-eventflow-expand-toggle:focus-visible{border-color:#61f2b3;background:rgba(10,46,34,.98);outline:none}.expand-flow-card.b46-eventflow-viewport-expanded{position:fixed!important;inset:10px!important;z-index:2147483000!important;width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;isolation:isolate;background:#06120f!important;border:1px solid rgba(97,242,179,.42)!important;border-radius:14px!important;box-shadow:0 24px 80px rgba(0,0,0,.62)!important;animation:none!important;transition:none!important}.b46-eventflow-viewport-expanded .expand-card-head,.b46-eventflow-viewport-expanded .expand-flow-legend{flex:0 0 auto}.b46-eventflow-viewport-expanded .expand-flow-chart{flex:1 1 auto!important;min-height:0!important;height:auto!important;max-height:none!important;overflow:hidden!important;padding-bottom:8px!important}.b46-eventflow-viewport-expanded .expand-flow-chart svg{display:block!important;width:100%!important;height:100%!important;min-height:0!important;max-height:none!important}.b46-eventflow-viewport-expanded .b46-eventflow-expand-toggle{width:34px;height:34px;font-size:20px}@media(max-width:700px){.expand-flow-card.b46-eventflow-viewport-expanded{inset:0!important;border-radius:0!important;border-left:0!important;border-right:0!important}.b46-eventflow-viewport-expanded .expand-card-head{padding-right:52px!important}.b46-eventflow-viewport-expanded .expand-flow-chart{padding-left:2px!important;padding-right:2px!important}.b46-eventflow-viewport-expanded .b46-eventflow-expand-toggle{right:8px}}@media(prefers-reduced-motion:reduce){.expand-flow-card.b46-eventflow-viewport-expanded,.b46-eventflow-expand-toggle{animation:none!important;transition:none!important}}\`;
  document.head.appendChild(style)
}
function ensureEventFlowToggleButton(){
  const flow=expandedEl?.querySelector('.expand-flow-card'),head=flow?.querySelector('.expand-card-head');if(!flow||!head)return null;
  let button=head.querySelector('[data-eventflow-expand-toggle]');
  if(!button){button=document.createElement('button');button.type='button';button.className='b46-eventflow-expand-toggle';button.dataset.eventflowExpandToggle='1';head.appendChild(button)}
  button.textContent=eventFlowViewportExpanded?'⤡':'⤢';
  button.setAttribute('aria-label',eventFlowViewportExpanded?'Collapse Event Flow':'Expand Event Flow');
  button.setAttribute('aria-pressed',String(eventFlowViewportExpanded));
  button.title=eventFlowViewportExpanded?'Collapse Event Flow':'Expand Event Flow';
  return button
}
function applyEventFlowViewportState(){
  ensureEventFlowExpandStyle();
  document.documentElement.classList.toggle('b46-eventflow-viewport-lock',eventFlowViewportExpanded);
  document.body?.classList.toggle('b46-eventflow-viewport-lock',eventFlowViewportExpanded);
  const flow=expandedEl?.querySelector('.expand-flow-card');if(!flow)return;
  flow.classList.toggle('b46-eventflow-viewport-expanded',eventFlowViewportExpanded);
  flow.dataset.eventflowViewport=eventFlowViewportExpanded?'expanded':'normal';
  ensureEventFlowToggleButton()
}
function setEventFlowViewportExpanded(next){
  const target=Boolean(next);if(target===eventFlowViewportExpanded){applyEventFlowViewportState();return}
  if(target)eventFlowSavedScrollY=window.scrollY;
  eventFlowViewportExpanded=target;applyEventFlowViewportState();
  const fixture=boardCache.data&&expandedId?findFixture(boardCache.data,expandedId):null,history=expandedId?historyCache.get(expandedId)?.data:null;
  if(fixture&&history)rerenderSignalEntries();else if(expandedId)scheduleRefresh(false);
  if(!target&&eventFlowSavedScrollY!==null){const top=eventFlowSavedScrollY;eventFlowSavedScrollY=null;requestAnimationFrame(()=>window.scrollTo({top,left:window.scrollX,behavior:'auto'}))}
}
function setHtmlIfChanged(node,html){if(node&&node.innerHTML!==html)node.innerHTML=html;if(node?.classList?.contains('expand-flow-card'))applyEventFlowViewportState()}`;
  source=source.replace(htmlAnchor,helpers);

  const placementAnchor="  if(lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible')window.scrollBy(0,delta)}";
  assert.equal(count(source,placementAnchor),1,'EXPAND_PLACEMENT_ANCHOR_MOVED');
  source=source.replace(placementAnchor,"  if(!eventFlowViewportExpanded&&lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible')window.scrollBy(0,delta)}");

  const closeAnchor="function closeExpanded(){\n  expandedId=null;refreshSeq++;clearTimeout(refreshTimer);if(expandedEl)expandedEl.remove();expandedEl=null;lastAnchorTop=null;";
  assert.equal(count(source,closeAnchor),1,'EXPAND_CLOSE_ANCHOR_MOVED');
  source=source.replace(closeAnchor,"function closeExpanded(){\n  if(eventFlowViewportExpanded){eventFlowViewportExpanded=false;applyEventFlowViewportState()}eventFlowSavedScrollY=null;\n  expandedId=null;refreshSeq++;clearTimeout(refreshTimer);if(expandedEl)expandedEl.remove();expandedEl=null;lastAnchorTop=null;");

  const clickAnchor="  document.addEventListener('click',e=>{if(e.target.closest?.('[data-fmb-book]'))return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);";
  assert.equal(count(source,clickAnchor),1,'EXPAND_CLICK_ANCHOR_MOVED');
  source=source.replace(clickAnchor,"  document.addEventListener('click',e=>{const toggle=e.target.closest?.('[data-eventflow-expand-toggle]');if(toggle){e.preventDefault();e.stopPropagation();setEventFlowViewportExpanded(!eventFlowViewportExpanded);return}if(e.target.closest?.('[data-fmb-book]'))return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);");

  const resizeAnchor="  window.addEventListener('scroll',recapture,{passive:true});window.addEventListener('resize',recapture,{passive:true});setInterval(recapture,500);";
  assert.equal(count(source,resizeAnchor),1,'EXPAND_RESIZE_ANCHOR_MOVED');
  source=source.replace(resizeAnchor,"  const recaptureAndResize=()=>{recapture();if(eventFlowViewportExpanded)rerenderSignalEntries()};\n  window.addEventListener('scroll',recapture,{passive:true});window.addEventListener('resize',recaptureAndResize,{passive:true});setInterval(recapture,500);");

  const apiAnchor="  window.NOMAD343_EXPANDED_MATCH={version:VERSION,oddsRenderOwner:ODDS_RENDER_OWNER,open:openExpanded,close:closeExpanded,reload:()=>expandedId&&refreshExpanded(true),getFixture:id=>{const b=boardCache.data;return b?findFixture(b,id):null}};";
  assert.equal(count(source,apiAnchor),1,'EXPAND_API_ANCHOR_MOVED');
  source=source.replace(apiAnchor,"  window.NOMAD343_EXPANDED_MATCH={version:VERSION,oddsRenderOwner:ODDS_RENDER_OWNER,open:openExpanded,close:closeExpanded,reload:()=>expandedId&&refreshExpanded(true),expandFlow:()=>expandedId&&setEventFlowViewportExpanded(true),collapseFlow:()=>setEventFlowViewportExpanded(false),isFlowExpanded:()=>eventFlowViewportExpanded,getFixture:id=>{const b=boardCache.data;return b?findFixture(b,id):null}};");

  assert(source.includes(MARKER),'EXPAND_MARKER_MISSING_AFTER_PATCH');
  assert(source.includes('b46-eventflow-viewport-expanded'),'EXPAND_CLASS_MISSING_AFTER_PATCH');
  assert(source.includes('data-eventflow-expand-toggle'),'EXPAND_BUTTON_MISSING_AFTER_PATCH');
  assert.equal(count(source,'fetch('),fetchBefore,'FETCH_COUNT_CHANGED');
  assert.equal(count(source,"const BOARD_API='/api/engine/board';"),boardBefore,'BOARD_API_CHANGED');
  assert.equal(count(source,"const HISTORY_API='/api/engine/history';"),historyBefore,'HISTORY_API_CHANGED');
  return source;
}
