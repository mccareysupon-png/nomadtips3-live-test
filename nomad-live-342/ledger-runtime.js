(()=>{
'use strict';
window.NOMAD342_LEDGER_RUNTIME=Object.freeze({
  version:'ledger-v2-realtime-repair',
  base:'https://nomadtips3-342-ledger.mccarey-supon.workers.dev',
  lockPath:'/lock',
  signalPath:'/signal',
  statisticsPath:'/statistics',
  healthPath:'/health',
  pollMs:5000,
  timeoutMs:6500,
});

document.addEventListener('nomad342:ledgerlocked',()=>document.dispatchEvent(new CustomEvent('nomad342:ledgerrefresh')));
})();
