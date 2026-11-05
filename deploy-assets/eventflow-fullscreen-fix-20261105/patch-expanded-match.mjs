import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const MARK='B46_EVENTFLOW_FULLSCREEN_PORTAL_FIX_20261105';
const DEFAULT_URL='https://ball46.com/expanded-match-343.js?v=b46-mobile-event-flow-bars-20261102';
const args=process.argv.slice(2);
const take=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null};
const inputPath=take('--input');
const inputUrl=take('--url')||DEFAULT_URL;
const outputPath=take('--output')||'expanded-match-343.patched.js';

const source=inputPath
  ? await readFile(inputPath,'utf8')
  : await (async()=>{
      const r=await fetch(inputUrl+(inputUrl.includes('?')?'&':'?')+'_patch='+Date.now(),{cache:'no-store'});
      assert(r.ok,`SOURCE_HTTP_${r.status}`);
      return r.text();
    })();

assert(source.includes("const B46_EVENTFLOW_EXPAND_MODE_20261004=true;"),'EXPAND_OWNER_MARKER_MISSING');
assert(source.includes("let eventFlowViewportExpanded=false;\nlet eventFlowSavedScrollY=null;"),'STATE_ANCHOR_CHANGED');
assert(source.includes("function ensureEventFlowExpandStyle(){"),'STYLE_OWNER_CHANGED');
assert(source.includes("function ensureEventFlowToggleButton(){"),'TOGGLE_OWNER_CHANGED');
assert(source.includes("function applyEventFlowViewportState(){"),'APPLY_OWNER_CHANGED');
assert(source.includes("function setEventFlowViewportExpanded(next){"),'SETTER_OWNER_CHANGED');
assert(source.includes("function closeExpanded(){"),'CLOSE_OWNER_CHANGED');
assert(source.includes("data-eventflow-expand-toggle"),'TOGGLE_DATA_MARKER_MISSING');
assert(!source.includes(MARK),'PATCH_ALREADY_PRESENT');

let out=source;
const replaceOnce=(before,after,label)=>{
  const first=out.indexOf(before);
  assert(first>=0,`PATCH_ANCHOR_MISSING:${label}`);
  assert.equal(out.indexOf(before,first+1),-1,`PATCH_ANCHOR_DUPLICATE:${label}`);
  out=out.slice(0,first)+after+out.slice(first+before.length);
};

replaceOnce(
  "let eventFlowViewportExpanded=false;\nlet eventFlowSavedScrollY=null;",
  "let eventFlowViewportExpanded=false;\nlet eventFlowSavedScrollY=null;\nlet eventFlowPortalCard=null;\nlet eventFlowPortalPlaceholder=null;\nlet eventFlowPortalParent=null;\nlet eventFlowPortalNextSibling=null;\nconst B46_EVENTFLOW_FULLSCREEN_PORTAL_FIX_20261105=true;",
  'state'
);

replaceOnce(
  "function ensureEventFlowExpandStyle(){",
`function currentEventFlowCard(){
  if(eventFlowPortalCard?.isConnected)return eventFlowPortalCard;
  return expandedEl?.querySelector('.expand-flow-card')||null
}
function portalEventFlowCard(){
  const flow=currentEventFlowCard();if(!flow||flow===eventFlowPortalCard)return flow;
  eventFlowPortalCard=flow;
  eventFlowPortalParent=flow.parentNode;
  eventFlowPortalNextSibling=flow.nextSibling;
  eventFlowPortalPlaceholder=document.createComment('b46-eventflow-portal');
  eventFlowPortalParent?.insertBefore(eventFlowPortalPlaceholder,flow);
  document.body?.appendChild(flow);
  return flow
}
function restoreEventFlowCard(){
  const flow=eventFlowPortalCard;if(!flow)return;
  try{
    if(eventFlowPortalPlaceholder?.parentNode){
      eventFlowPortalPlaceholder.parentNode.insertBefore(flow,eventFlowPortalPlaceholder)
    }else if(eventFlowPortalParent?.isConnected){
      if(eventFlowPortalNextSibling?.parentNode===eventFlowPortalParent)eventFlowPortalParent.insertBefore(flow,eventFlowPortalNextSibling);
      else eventFlowPortalParent.appendChild(flow)
    }
  }catch(error){console.warn('Event Flow portal restore failed',error)}
  eventFlowPortalPlaceholder?.remove?.();
  eventFlowPortalCard=null;
  eventFlowPortalPlaceholder=null;
  eventFlowPortalParent=null;
  eventFlowPortalNextSibling=null
}
function clearEventFlowViewportLock(){
  document.documentElement.classList.remove('b46-eventflow-viewport-lock');
  document.body?.classList.remove('b46-eventflow-viewport-lock')
}
function ensureEventFlowExpandStyle(){`,
  'helpers'
);

replaceOnce(
  "inset:10px!important;",
  "inset:0!important;",
  'desktop-inset'
);

replaceOnce(
  "  const flow=expandedEl?.querySelector('.expand-flow-card'),head=flow?.querySelector('.expand-card-head');if(!flow||!head)return null;",
  "  const flow=currentEventFlowCard(),head=flow?.querySelector('.expand-card-head');if(!flow||!head)return null;",
  'toggle-card'
);

replaceOnce(
`function applyEventFlowViewportState(){
  ensureEventFlowExpandStyle();
  document.documentElement.classList.toggle('b46-eventflow-viewport-lock',eventFlowViewportExpanded);
  document.body?.classList.toggle('b46-eventflow-viewport-lock',eventFlowViewportExpanded);
  const flow=expandedEl?.querySelector('.expand-flow-card');if(!flow)return;
  flow.classList.toggle('b46-eventflow-viewport-expanded',eventFlowViewportExpanded);
  flow.dataset.eventflowViewport=eventFlowViewportExpanded?'expanded':'normal';
  ensureEventFlowToggleButton()
}`,
`function applyEventFlowViewportState(){
  ensureEventFlowExpandStyle();
  if(eventFlowViewportExpanded){
    const flow=portalEventFlowCard();
    if(!flow){clearEventFlowViewportLock();eventFlowViewportExpanded=false;return}
    document.documentElement.classList.add('b46-eventflow-viewport-lock');
    document.body?.classList.add('b46-eventflow-viewport-lock');
    flow.classList.add('b46-eventflow-viewport-expanded');
    flow.dataset.eventflowViewport='expanded';
    ensureEventFlowToggleButton();
    return
  }
  const flow=currentEventFlowCard();
  if(flow){flow.classList.remove('b46-eventflow-viewport-expanded');flow.dataset.eventflowViewport='normal'}
  clearEventFlowViewportLock();
  restoreEventFlowCard();
  ensureEventFlowToggleButton()
}`,
  'apply-state'
);

replaceOnce(
  "function rerenderSignalEntries(){if(!expandedId||!expandedEl)return;const fixture=boardCache.data?findFixture(boardCache.data,expandedId):null,history=historyCache.get(expandedId)?.data,flow=expandedEl.querySelector('.expand-flow-card');if(fixture&&history&&flow)setHtmlIfChanged(flow,renderFlow(fixture,history,signalsForFixture(expandedId)))}",
  "function rerenderSignalEntries(){if(!expandedId||!expandedEl)return;const fixture=boardCache.data?findFixture(boardCache.data,expandedId):null,history=historyCache.get(expandedId)?.data,flow=currentEventFlowCard();if(fixture&&history&&flow)setHtmlIfChanged(flow,renderFlow(fixture,history,signalsForFixture(expandedId)))}",
  'rerender-card'
);

replaceOnce(
  "    const board=boardRes.status==='fulfilled'?boardRes.value:null,fixture=board?findFixture(board,id):null,flow=el.querySelector('.expand-flow-card'),full=el.querySelector('[data-full-market-card]');",
  "    const board=boardRes.status==='fulfilled'?boardRes.value:null,fixture=board?findFixture(board,id):null,flow=currentEventFlowCard(),full=el.querySelector('[data-full-market-card]');",
  'refresh-card'
);

replaceOnce(
`function openExpanded(id){
  const sid=String(id||'');if(!sid)return;
  if(expandedId===sid){closeExpanded();return}`,
`function openExpanded(id){
  const sid=String(id||'');if(!sid)return;
  if(expandedId===sid){closeExpanded();return}
  if(eventFlowViewportExpanded)setEventFlowViewportExpanded(false)`,
  'open-collapse-first'
);

replaceOnce(
`function closeExpanded(){
  if(eventFlowViewportExpanded){eventFlowViewportExpanded=false;applyEventFlowViewportState()}eventFlowSavedScrollY=null;
  expandedId=null;refreshSeq++;clearTimeout(refreshTimer);if(expandedEl)expandedEl.remove();expandedEl=null;lastAnchorTop=null;
  document.querySelectorAll('.match-row[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'));
}`,
`function closeExpanded(){
  if(eventFlowViewportExpanded)setEventFlowViewportExpanded(false);else{clearEventFlowViewportLock();restoreEventFlowCard()}
  eventFlowSavedScrollY=null;
  expandedId=null;refreshSeq++;clearTimeout(refreshTimer);if(expandedEl)expandedEl.remove();expandedEl=null;lastAnchorTop=null;
  document.querySelectorAll('.match-row[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'));
}`,
  'close-cleanup'
);

replaceOnce(
  "  document.addEventListener('keydown',e=>{if(handleMobileFlowSelect(e))return;if(e.key!=='Enter'&&e.key!==' ')return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);",
  "  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&eventFlowViewportExpanded){e.preventDefault();e.stopPropagation();setEventFlowViewportExpanded(false);return}if(handleMobileFlowSelect(e))return;if(e.key!=='Enter'&&e.key!==' ')return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);",
  'escape'
);

replaceOnce(
  "  window.addEventListener('scroll',recapture,{passive:true});window.addEventListener('resize',recaptureAndResize,{passive:true});setInterval(recapture,500);",
  "  window.addEventListener('scroll',recapture,{passive:true});window.addEventListener('resize',recaptureAndResize,{passive:true});setInterval(recapture,500);\n  window.addEventListener('pagehide',()=>{eventFlowViewportExpanded=false;const flow=currentEventFlowCard();flow?.classList.remove('b46-eventflow-viewport-expanded');clearEventFlowViewportLock();restoreEventFlowCard()},{once:true});",
  'pagehide'
);

assert(out.includes(MARK),'PATCH_MARKER_MISSING');
assert.equal((out.match(/B46_EVENTFLOW_FULLSCREEN_PORTAL_FIX_20261105/g)||[]).length,1,'PATCH_MARKER_COUNT');
assert(out.includes("const flow=currentEventFlowCard(),head=flow?.querySelector('.expand-card-head')"),'TOGGLE_NOT_PATCHED');
assert(out.includes("flow=currentEventFlowCard(),full=el.querySelector('[data-full-market-card]')"),'REFRESH_NOT_PATCHED');
assert(out.includes("e.key==='Escape'&&eventFlowViewportExpanded"),'ESCAPE_NOT_PATCHED');

await writeFile(outputPath,out,'utf8');
console.log(JSON.stringify({
  marker:MARK,
  sourceBytes:Buffer.byteLength(source),
  outputBytes:Buffer.byteLength(out),
  outputPath,
  owner:'expanded-match-343.js',
  scope:'Event Flow fullscreen DOM lifecycle only'
}));
