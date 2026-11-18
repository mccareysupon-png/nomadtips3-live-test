// Restore native history loading only after the first Receiver graph has rendered.
// Uses the existing paginated legacy loader and its shared cache/in-flight guard.
// No change to graph calculation, Receiver, Book or Sidebar.
export function patchHistoryAutoload(s){
 const anchor="b46GraphKey=key;b46Last=Date.now();b46FailedAt=0;renderFromStats(b46GraphData,'receiver');";
 if(s.split(anchor).length!==2)throw Error('HISTORY_AUTOLOAD_ANCHOR_DRIFT');
 return s.replace(anchor,anchor+String.raw`
  // A successful graph must not leave native history waiting for a manual click.
  if(!window.__B46_FAST_DETAILS_REQUESTED&&!window.__B46_HISTORY_AUTOLOAD_QUEUED){
   window.__B46_HISTORY_AUTOLOAD_QUEUED=true;
   requestAnimationFrame(()=>setTimeout(()=>{
    window.__B46_HISTORY_AUTOLOAD_QUEUED=false;
    if(active()&&!window.__B46_FAST_DETAILS_REQUESTED){
     window.__B46_FAST_LOAD_DETAILS?.();
    }
   },300));
  }
 `);
}
