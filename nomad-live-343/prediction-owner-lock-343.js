(()=>{
'use strict';
const VERSION='343-prediction-owner-lock-v1';
const TARGET='[data-prediction-content]';
function install(){
  const host=document.querySelector(TARGET);
  if(!host||host.dataset.predictionOwnerLock==='1')return Boolean(host);
  const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(!descriptor?.get||!descriptor?.set)return false;
  Object.defineProperty(host,'innerHTML',{
    configurable:true,
    get(){return descriptor.get.call(this)},
    set(value){
      const html=String(value??'');
      if(html.includes('lp2-'))descriptor.set.call(this,value);
    }
  });
  host.dataset.predictionOwnerLock='1';
  host.dataset.predictionOwner='live-prediction-percent-343';
  return true;
}
if(!install()&&document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
window.NOMAD343_PREDICTION_OWNER_LOCK={version:VERSION,install,target:TARGET};
})();
