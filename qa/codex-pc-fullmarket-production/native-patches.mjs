const FLOW_FAST_POINT="const b46FlowPolylineCache=new WeakMap();\nfunction pointAtX(path,x){\n try{\n  const d=path.getAttribute('d')||'';\n  let cached=b46FlowPolylineCache.get(path);\n  if(!cached||cached.d!==d){\n   const re=/([ML])\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+))[\\s,]+(-?(?:\\d+\\.?\\d*|\\.\\d+))/gi;\n   const segments=[...d.matchAll(re)];\n   const valid=segments.length>=2&&segments[0][1].toUpperCase()==='M'&&segments.slice(1).every(m=>m[1].toUpperCase()==='L')&&!d.replace(re,'').trim();\n   const points=valid?segments.map(m=>({x:Number(m[2]),y:Number(m[3])})):null;\n   const monotonic=points&&points.every((p,i)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&(!i||p.x>=points[i-1].x));\n   cached={d,points:monotonic?points:null};\n   b46FlowPolylineCache.set(path,cached);\n  }\n  const pts=cached.points;\n  if(pts){\n   if(x<=pts[0].x)return {x:pts[0].x,y:pts[0].y};\n   if(x>=pts[pts.length-1].x)return {x:pts[pts.length-1].x,y:pts[pts.length-1].y};\n   let lo=0,hi=pts.length-1;\n   while(hi-lo>1){\n    const mid=(lo+hi)>>>1;\n    if(pts[mid].x<x)lo=mid;else hi=mid;\n   }\n   const a=pts[lo],b=pts[hi],fraction=b.x>a.x?(x-a.x)/(b.x-a.x):0;\n   return {x,y:a.y+(b.y-a.y)*fraction};\n  }\n  // Unknown curve types retain the original SVG implementation.\n  const len=path.getTotalLength();if(!Number.isFinite(len)||len<=0)return null;\n  let lo=0,hi=len;\n  for(let i=0;i<24;i++){const mid=(lo+hi)/2,p=path.getPointAtLength(mid);if(p.x<x)lo=mid;else hi=mid}\n  return path.getPointAtLength((lo+hi)/2);\n }catch{return null}\n}";
export const nativePaths=['/dashboard-v2-stage3-featured-facts-20261013a.js','/ui-sync-fixes-343-v2.js','/expanded-match-343.js'];
function replaceStrict(source,oldText,newText,label){
 if(source.split(oldText).length!==2)throw new Error('Production source does not match the QA patch: '+label);
 return source.replace(oldText,newText);
}
export function nativeOptimized(path,src){
 if(path==='/dashboard-v2-stage3-featured-facts-20261013a.js'){
  return replaceStrict(src,
   "function b46PinExpanded(){return !!document.querySelector('.match-expanded[data-expanded-match]')}",
   "let b46PinExpandedCacheTick=-1,b46PinExpandedCache=false;function b46PinExpanded(){const tick=Math.floor(performance.now()/16);if(tick!==b46PinExpandedCacheTick){b46PinExpandedCacheTick=tick;b46PinExpandedCache=!!document.querySelector('.match-expanded[data-expanded-match]')}return b46PinExpandedCache}",
   'DASHBOARD_PIN_QUERY_CACHE');
 }
 if(path==='/ui-sync-fixes-343-v2.js'){
  return replaceStrict(src,"function pointAtX(path,x){try{const len=path.getTotalLength();if(!Number.isFinite(len)||len<=0)return null;let lo=0,hi=len;for(let i=0;i<24;i++){const mid=(lo+hi)/2,p=path.getPointAtLength(mid);if(p.x<x)lo=mid;else hi=mid}return path.getPointAtLength((lo+hi)/2)}catch{return null}}",FLOW_FAST_POINT,'FLOW_EXACT_POLYLINE_FAST_LOOKUP');
 }
 if(path==='/expanded-match-343.js'){
  return replaceStrict(src,
   "if(!eventFlowViewportExpanded&&lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible')window.scrollBy(0,delta)}",
   "if(!eventFlowViewportExpanded&&lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible'){const board=row.closest('.board-sections');if(board&&board.scrollHeight>board.clientHeight)board.scrollBy(0,delta);else window.scrollBy(0,delta)}}",
   'EXPANDED_ANCHOR_TARGETS_BOARD_SCROLL');
 }
 return src;
}
