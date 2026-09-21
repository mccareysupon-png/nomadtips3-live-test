(()=>{
'use strict';
const VERSION='343-default-card-odds-lock-v1';
let timer=null;
function disableDefaultRichMerge(){
  const dash=window.NOMAD343_DASHBOARD_V2;
  if(!dash||typeof dash!=='object')return false;
  dash.applyRichOdds=undefined;
  dash.mode='BULK_SNAPSHOT_ONLY';
  return true;
}
function boot(){
  let tries=0;
  const tick=()=>{
    const locked=disableDefaultRichMerge();
    tries+=1;
    if((locked||tries>=20)&&timer){clearInterval(timer);timer=null}
  };
  tick();
  if(!timer)timer=setInterval(tick,50);
}
if(document.readyState==='complete')boot();
else document.addEventListener('DOMContentLoaded',boot,{once:true});
window.NOMAD343_DEFAULT_CARD_ODDS_LOCK={version:VERSION,networkRequestsAdded:0,disableDefaultRichMerge};
})();
