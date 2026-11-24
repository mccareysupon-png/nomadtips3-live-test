// Remove the wrong interim Data status card. Spinner ONLY inside existing PreMatch content panel.
export const B46_CONTENT_ONLY_LOADING_VERSION='B46_PM_CONTENT_ONLY_LOADING_V1';
const inlineCSS="/* BALL46 content-only loading: never cover header, sidebar or page */\n#b46-prematch-panel .b46pm-inline-wait{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;width:100%;min-height:clamp(170px,calc(100dvh - 280px),520px);padding:24px 16px;box-sizing:border-box;background:transparent!important;border:0!important;box-shadow:none!important;position:relative;color:inherit}\n#b46-prematch-panel .b46pm-inline-spinner{display:block;width:36px;height:36px;border:3px solid rgba(53,175,115,.22);border-top-color:#2ecb75;border-radius:50%;box-sizing:border-box;animation:b46PMContentOnlySpin .85s linear infinite}\n#b46-prematch-panel .b46pm-inline-label,#b46-prematch-panel .b46pm-inline-error{font:500 13px/1.4 system-ui,-apple-system,\"Segoe UI\",sans-serif;opacity:.8;text-align:center}\n#b46-prematch-panel .b46pm-inline-retry{padding:8px 15px;border-radius:7px;border:1px solid #2ecb75;background:transparent;color:inherit;font:600 13px system-ui,sans-serif;cursor:pointer}\n@keyframes b46PMContentOnlySpin{to{transform:rotate(360deg)}}\n@media(prefers-reduced-motion:reduce){#b46-prematch-panel .b46pm-inline-spinner{animation-duration:1.7s}}";
const helpers="  const B46_PM_CONTENT_ONLY_LOADING_V1='B46_PM_CONTENT_ONLY_LOADING_V1';\n  let b46PrematchFirstLoadFailed=false;\n  function b46PrematchLoadingContent(){\n    const shell=el('div','b46pm-inline-wait');\n    shell.setAttribute('role','status');\n    shell.setAttribute('aria-live','polite');\n    if(b46PrematchFirstLoadFailed){\n      shell.append(el('span','b46pm-inline-error','Match data unavailable.'));\n      const retry=el('button','b46pm-inline-retry','Retry');\n      retry.type='button';\n      retry.addEventListener('click',e=>{\n        e.preventDefault();\n        b46PrematchFirstLoadFailed=false;\n        draw();\n        load();\n      });\n      shell.append(retry);\n    }else{\n      const ring=el('span','b46pm-inline-spinner');\n      ring.setAttribute('aria-hidden','true');\n      shell.append(ring,el('span','b46pm-inline-label','Loading match data…'));\n    }\n    return shell;\n  }\n";
function once(s,oldText,newText,label){
 const n=s.split(oldText).length-1;
 if(n!==1)throw Error('B46_CONTENT_LOADING_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(oldText,newText);
}
export function patchPreMatchContentLoading(client){
 if(typeof client!=='string'||!client.includes("  function draw(pageOnly=false){")||
    !client.includes("  async function load(){")||
    !client.includes("  function show(modeNext){"))
  throw Error('NOT_ORIGINAL_PREMATCH_CLIENT');
 if(client.includes(B46_CONTENT_ONLY_LOADING_VERSION))throw Error('CONTENT_LOADER_ALREADY_PRESENT');
 let next=once(client,'  const MATCHES_PER_PAGE=25;',helpers+'  const MATCHES_PER_PAGE=25;','HELPERS');
 next=once(next,"      if(!loading)content.append(card('Data status','Data unavailable'));",
           "      content.append(b46PrematchLoadingContent());",'REPLACE_OLD_INTERSTITIAL');
 next=once(next,"    const panel=$('#'+root);panel.hidden=!['predictions','ou-predictions','ou'].includes(modeNext)&&!ledger;",
           "    const panel=$('#'+root);panel.hidden=false;",'SHOW_ALL_ROUTES');
 next=once(next,"    if(mode==='predictions'||mode==='ou-predictions'||mode==='ou'||ledger)draw();",
           "    draw();",'DRAW_EMPTY_CONTENT_LOADER');
 next=once(next,"      ledger=j.testLedger;",
           "      ledger=j.testLedger;\n      b46PrematchFirstLoadFailed=false;",'SUCCESS_RESET');
 next=once(next,"    }catch(e){if(!ledger)console.warn('Pre-Match test data:',String(e))}",
           "    }catch(e){if(!ledger){b46PrematchFirstLoadFailed=true;console.warn('Pre-Match test data:',String(e));}}",'ERROR_STATE');
 return next;
}
export function patchPreMatchContentWorker(worker){
 if(typeof worker!=='string'||!worker.includes('var prematchClientScript = '))
  throw Error('ORIGINAL_TEST_FRONTEND_SOURCE_MISSING');
 if(worker.includes(B46_CONTENT_ONLY_LOADING_VERSION))throw Error('CONTENT_LOADER_ALREADY_PRESENT');
 const rx=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
 const match=worker.match(rx);if(!match)throw Error('EMBEDDED_CLIENT_MISSING');
 const client=patchPreMatchContentLoading(JSON.parse(match[1]));
 let next=once(worker,match[0],'var prematchClientScript = '+JSON.stringify(client)+';','CLIENT_ONLY');
 const cssAnchor='  const pmStyles = prematchStyles + prematchMirrorStyles + ';
 next=once(next,cssAnchor,cssAnchor+JSON.stringify(inlineCSS)+' + ','INLINE_CSS');
 const routeBefore='const directPreMatchTest = ["predictions", "all", "1x2", "btts"].includes(u.searchParams.get("b46pm"));';
 const routeAfter='const directPreMatchTest = ["predictions", "all", "1x2", "ou", "btts"].includes(u.searchParams.get("b46pm"));';
 next=once(next,routeBefore,routeAfter,'INITIAL_OU_NATIVE_HIDE');
 return {worker:next,client};
}
