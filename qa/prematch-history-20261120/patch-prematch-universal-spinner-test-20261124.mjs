// BALL46 original PreMatch TEST Worker, pre-paint universal spinner.
export const B46_FIRSTPAINT_SPINNER_VERSION='B46_PREMATCH_UNIVERSAL_SPINNER_V1';
const firstPaintCss="#b46-pm-firstpaint-loader{display:none!important;pointer-events:none}\nhtml[data-b46-pm-initial-loading=\"1\"] body #b46-pm-firstpaint-loader{display:flex!important;align-items:center;justify-content:center;flex-direction:column;gap:16px;position:fixed;inset:0;width:100%;height:100vh;height:100dvh;z-index:2147483646;background:#0b1814;color:#e4f7ec;pointer-events:auto;box-sizing:border-box}\nhtml[data-theme=\"light\"][data-b46-pm-initial-loading=\"1\"] body #b46-pm-firstpaint-loader{background:#f4f7f5;color:#143525}\n#b46-pm-firstpaint-loader .b46-pm-spinner{width:46px;height:46px;flex:none;border:4px solid rgba(91,183,132,.24);border-top-color:#34d27e;border-radius:50%;box-sizing:border-box;animation:b46PmSpinnerSpin .9s linear infinite;will-change:transform}\n@keyframes b46PmSpinnerSpin{to{transform:rotate(360deg)}}\n#b46-pm-firstpaint-loader .b46-pm-loading-label{font:500 13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;letter-spacing:.02em;text-align:center}\n#b46-pm-firstpaint-loader .b46-pm-retry{appearance:none;border:1px solid #34d27e;border-radius:8px;padding:8px 16px;background:transparent;color:inherit;font:600 13px system-ui,sans-serif;cursor:pointer}\n#b46-pm-firstpaint-loader .b46-pm-retry[hidden]{display:none!important}\n@media(max-width:760px){#b46-pm-firstpaint-loader .b46-pm-spinner{width:42px;height:42px}}\n@media(prefers-reduced-motion:reduce){#b46-pm-firstpaint-loader .b46-pm-spinner{animation-duration:1.8s}}";
const firstPaintHtml="<div id=\"b46-pm-firstpaint-loader\" role=\"status\" aria-live=\"polite\" aria-busy=\"true\"><span class=\"b46-pm-spinner\" aria-hidden=\"true\"></span><span class=\"b46-pm-loading-label\">Loading match data…</span><button class=\"b46-pm-retry\" type=\"button\" hidden>Retry</button></div>";
const firstPaintHelpers="  const B46_PREMATCH_UNIVERSAL_SPINNER_V1='B46_PREMATCH_UNIVERSAL_SPINNER_V1';\n  function b46FirstPaintReady(){\n    if(!ledger||!mode||!document.documentElement.hasAttribute('data-b46-pm-initial-loading'))return;\n    requestAnimationFrame(()=>{\n      if(!ledger||!mode)return;\n      const visible=document.getElementById(root);\n      if(!visible||visible.hidden)return;\n      document.documentElement.removeAttribute('data-b46-pm-initial-loading');\n      document.getElementById('b46-pm-firstpaint-loader')?.remove();\n    });\n  }\n  function b46FirstPaintFailure(){\n    if(!document.documentElement.hasAttribute('data-b46-pm-initial-loading'))return;\n    const splash=document.getElementById('b46-pm-firstpaint-loader');\n    const message=splash?.querySelector('.b46-pm-loading-label');\n    if(message)message.textContent='Match data unavailable. Please retry.';\n    const retry=splash?.querySelector('.b46-pm-retry');\n    if(retry){\n      retry.hidden=false;\n      if(!retry.dataset.b46Bound){\n        retry.dataset.b46Bound='1';\n        retry.addEventListener('click',()=>location.reload());\n      }\n    }\n  }\n  setTimeout(b46FirstPaintFailure,25000);\n";
const once=(s,needle,sub,label)=>{
 const count=s.split(needle).length-1;
 if(count!==1)throw Error('B46_FIRSTPAINT_SOURCE_DRIFT_'+label+'_'+count);
 return s.replace(needle,sub);
};
export function patchFirstPaintClient(source){
 if(typeof source!=='string'||!source.includes("const routes = [")||
  !source.includes("  async function load(){")||
  !source.includes("  function show(modeNext){")||
  !source.includes("  function draw(pageOnly=false){"))
  throw Error('UNEXPECTED_PREMATCH_TEST_CLIENT');
 if(source.includes(B46_FIRSTPAINT_SPINNER_VERSION))throw Error('FIRSTPAINT_ALREADY_INSTALLED');
 let next=once(source,"  const MATCHES_PER_PAGE=25;",firstPaintHelpers+"  const MATCHES_PER_PAGE=25;",'HELPERS');
 // The earlier scroll patch accidentally scoped its route memory inside draw;
 // preserve it across refreshes without touching pagination scroll.
 next=once(next,"    let b46PrematchLastScrollRoute=null; // B46_PREMATCH_NAV_SCROLL_V1\n","",'SCROLL_WRONG_SCOPE_REMOVE');
 next=once(next,"  function draw(pageOnly=false){",
   "  let b46PrematchLastScrollRoute=null; // B46_PREMATCH_NAV_SCROLL_V1\n  function draw(pageOnly=false){",'SCROLL_FIX_SCOPE');
 const show="    if(mode==='predictions'||mode==='ou-predictions'||mode==='ou'||ledger)draw();";
 next=once(next,show,"    if(mode==='predictions'||mode==='ou-predictions'||mode==='ou'||ledger){draw();if(ledger)b46FirstPaintReady();}",'SHOW_FINISH');
 const err="    }catch(e){if(!ledger)console.warn('Pre-Match test data:',String(e))}";
 next=once(next,err,"    }catch(e){if(!ledger){console.warn('Pre-Match test data:',String(e));b46FirstPaintFailure();}}",'ERROR_STATE');
 const finished="        draw();\n        if(mode==='predictions')loadPerformanceGraph(false);";
 next=once(next,finished,"        draw();\n        if(ledger)b46FirstPaintReady();else b46FirstPaintFailure();\n        if(mode==='predictions')loadPerformanceGraph(false);",'DATA_FINISH');
 return next;
}
export function patchFirstPaintWorker(worker){
 if(typeof worker!=='string'||!worker.includes('var prematchClientScript = '))
   throw Error('UNEXPECTED_FRONTEND_MAIN_MODULE');
 if(worker.includes(B46_FIRSTPAINT_SPINNER_VERSION))throw Error('FIRSTPAINT_ALREADY_INSTALLED');
 const rx=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
 const m=worker.match(rx);
 if(!m)throw Error('CLIENT_EMBED_NOT_FOUND');
 const nextClient=patchFirstPaintClient(JSON.parse(m[1]));
 let next=once(worker,m[0],'var prematchClientScript = '+JSON.stringify(nextClient)+';','WORKER_EMBEDDED_CLIENT');
 const cssAnchor='  const pmStyles = prematchStyles + prematchMirrorStyles + ';
 next=once(next,cssAnchor,
   '  const firstPaintCss='+JSON.stringify(firstPaintCss)+';\n'+
   '  const firstPaintLoaderHtml='+JSON.stringify(firstPaintHtml)+';\n'+
   cssAnchor+'firstPaintCss + ','PREPAINT_CSS');
 const oldRoute='const directPreMatchTest = ["predictions", "all", "1x2", "btts"].includes(u.searchParams.get("b46pm"));';
 next=once(next,oldRoute,
  'const directPreMatchTest = ["predictions", "all", "1x2", "ou", "btts"].includes(u.searchParams.get("b46pm"));','ALL_ROUTES');
 const oldBoot='    if (directPreMatchTest) e.setAttribute("data-b46-pm-boot", "1");';
 next=once(next,oldBoot,
 '    if (directPreMatchTest) { e.setAttribute("data-b46-pm-boot", "1"); e.setAttribute("data-b46-pm-initial-loading", "1"); }','HTML_BOOT');
 const bodyAnchor='    e.append(\'<script defer src="/__b46_prematch_mirror.js"';
 next=once(next,bodyAnchor,
   '    if (directPreMatchTest) e.prepend(firstPaintLoaderHtml, { html: true });\n'+bodyAnchor,
   'HTML_FIRST_CHILD');
 return {worker:next,client:nextClient};
}
