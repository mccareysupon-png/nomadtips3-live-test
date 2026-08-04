(()=>{
  'use strict';

  const refreshScores=()=>{
    if(document.hidden)return;
    if(typeof window.refreshAll==='function')window.refreshAll();
  };

  const refreshManifest=()=>{
    if(document.hidden)return;
    if(typeof window.syncManifest==='function')window.syncManifest();
  };

  setInterval(refreshScores,15000);
  setInterval(refreshManifest,30000);
})();
