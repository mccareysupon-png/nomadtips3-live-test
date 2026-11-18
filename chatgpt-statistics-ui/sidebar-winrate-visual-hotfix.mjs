// Surgical fix against the deployed workspace script. Do not alter native count formatter.
export function patchVisual(s){
 const a="  el.textContent=finite?value.toFixed(2)+'%':'—';\n  el.dataset.b46WinRate='1';el.dataset.b46WinRateTone=tone;";
 if(s.split(a).length!==2)throw Error('LIVE_SIDEBAR_VISUAL_ANCHOR_DRIFT');
 return s.replace(a,"  el.textContent=finite?value.toFixed(2)+'%':'—';\n  // Legacy desktop count formatter keeps attributes when text becomes nonnumeric.\n  delete el.dataset.b46Display;delete el.dataset.b46Zero;\n  el.dataset.b46WinRate='1';el.dataset.b46WinRateTone=tone;");
}
