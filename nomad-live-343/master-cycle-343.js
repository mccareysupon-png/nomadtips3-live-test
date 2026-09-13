(()=>{
'use strict';
const VERSION='343-master-cycle-v1';
const MASTER_CYCLE_MS=15_000;
const nativeSetInterval=window.setInterval.bind(window);
let armed=true;

window.NOMAD343_MASTER_CYCLE={version:VERSION,cycleMs:MASTER_CYCLE_MS};

window.setInterval=function(fn,delay,...args){
  if(armed&&typeof fn==='function'&&Number(delay)===30_000){
    armed=false;
    window.setInterval=nativeSetInterval;
    const wrapped=async(...cbArgs)=>{
      try{return await fn(...cbArgs)}
      finally{await window.NOMAD343_EVENT_FLOW_REFRESH_15S?.refreshVisible?.()}
    };
    return nativeSetInterval(wrapped,MASTER_CYCLE_MS,...args);
  }
  return nativeSetInterval(fn,delay,...args);
};
})();