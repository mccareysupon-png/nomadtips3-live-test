export const MARK='B46_PERFORMANCE_RANGE_INPLACE_20261125';
const anchor="  function loadPerformanceGraph(force=false){";
const special="      if(mode&&performanceQuery()?.range===query.range&&!loading&&!document.getElementById(root)?.hidden)draw();";
const event="      draw();if(range)loadPerformanceGraph(true);return;";
const update=String.raw`
  // B46_PERFORMANCE_RANGE_INPLACE_20261125:
  // Keep the existing performance panel and its SVG nodes. Do not refresh
  // membership, statistics, research tables, scroll containers, or routes.
  function b46PerformanceReconcile(current,next){
    if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName){
      current.replaceWith(next);return;
    }
    if(current.nodeType===3){
      if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;
      return;
    }
    if(current.nodeType!==1)return;
    for(const attr of [...current.attributes]){
      if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
    }
    for(const attr of [...next.attributes]){
      if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
    }
    // Index-preserving reconciliation avoids swapping the SVG, chart frame,
    // metric controls, summaries, and table nodes on range clicks.
    const from=[...current.childNodes],to=[...next.childNodes];
    for(let i=0;i<to.length;i++){
      if(i>=from.length)current.appendChild(to[i]);
      else b46PerformanceReconcile(from[i],to[i]);
    }
    for(let i=to.length;i<from.length;i++)from[i].remove();
  }
  function b46UpdatePerformanceOnly(){
    if(!mode||!ledger)return false;
    const panel=$('#'+root);
    const old=panel?.querySelector('.b46pm-performance');
    if(!old||!old.isConnected)return false;
    const next=performancePanel();
    if(!next||next.className!=='b46pm-performance')return false;
    b46PerformanceReconcile(old,next);
    return true;
  }
`;
function once(input,a,b,label){if(input.split(a).length!==2)throw Error('ANCHOR_'+label);return input.replace(a,b);}
export function patchClient(input){
 if(input.includes(MARK))throw Error('PATCH_ALREADY_PRESENT');
 if(!input.includes('function performancePanel(){')||!input.includes('function draw(pageOnly=false){')||!input.includes('panel.replaceChildren();'))throw Error('DRIFT');
 let out=once(input,anchor,update+anchor,'INSERT');
 out=once(out,special,special.replace('draw();','b46UpdatePerformanceOnly();'),'ASYNC_REFRESH');
 out=once(out,event,"      if(!b46UpdatePerformanceOnly())draw();if(range)loadPerformanceGraph(true);return;",'RANGE_CLICK');
 return out;
}
export function patchWorker(main){
 const found=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
 if(!found)throw Error('CLIENT_EMBED_MISSING');
 const before=JSON.parse(found[1]),after=patchClient(before);
 const replacement='var prematchClientScript = '+JSON.stringify(after)+';';
 if(main.split(found[0]).length!==2)throw Error('EMBED_DRIFT');
 const worker=main.replace(found[0],replacement);
 if(worker.replace(replacement,'')!==main.replace(found[0],''))throw Error('WORKER_OUTSIDE_CLIENT_CHANGED');
 return {worker,client:after,previous:before};
}
