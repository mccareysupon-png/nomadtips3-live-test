// Preserve scroll on same-page data refresh; reset on every PreMatch route transition.
export const B46_PREMATCH_NAV_SCROLL_V1='B46_PREMATCH_NAV_SCROLL_V1';
export function patchPrematchNavigationScroll(client){
 if(typeof client!=='string'||!client.includes('panel.scrollTop=previousScroll;')||
    !client.includes('const finish=()=>{')||
    !client.includes('syncPrematchViewport();')||
    !client.includes("const routes = ["))
    throw Error('PREMATCH_SCROLL_SOURCE_DRIFT');
 if(client.includes(B46_PREMATCH_NAV_SCROLL_V1))throw Error('PREMATCH_SCROLL_ALREADY_INSTALLED');
 const target='panel.scrollTop=previousScroll;';
 if(client.split(target).length!==2)throw Error('PREMATCH_SCROLL_ANCHOR_NOT_UNIQUE');
 const init="let b46PrematchLastScrollRoute=null; // "+B46_PREMATCH_NAV_SCROLL_V1+"\n";
 const insertion=String.raw`{
        // Route identity includes the selected market/mode, not transient data.
        // Keep position during live refresh; never leak it into a different page.
        const currentRoute=String(location.pathname)+'|'+String(mode)+'|'+
          String(new URL(location.href).searchParams.get('b46pm')||'all');
        const changed=b46PrematchLastScrollRoute!==currentRoute;
        b46PrematchLastScrollRoute=currentRoute;
        if(changed){
          panel.scrollTop=0;
          if(document.scrollingElement)document.scrollingElement.scrollTop=0;
          window.scrollTo(0,0);
        }else{
          panel.scrollTop=previousScroll;
        }
      }`;
 const next=client.replace('const finish=()=>{',init+'const finish=()=>{').replace(target,insertion);
 if(next.split(B46_PREMATCH_NAV_SCROLL_V1).length!==2)throw Error('PREMATCH_SCROLL_PATCH_FAILED');
 return next;
}
export function patchPrematchScrollWorker(worker){
 const rx=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
 const match=worker.match(rx);
 if(!match)throw Error('PREMATCH_CLIENT_NOT_EMBEDDED');
 const original=JSON.parse(match[1]);
 const client=patchPrematchNavigationScroll(original);
 const next=worker.replace(match[0],'var prematchClientScript = '+JSON.stringify(client)+';');
 if(next===worker)throw Error('PREMATCH_SCROLL_WORKER_UNCHANGED');
 return {worker:next,client};
}
